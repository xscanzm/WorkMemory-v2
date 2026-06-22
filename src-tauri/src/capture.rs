//! 截图采集模块
//!
//! 定时截图（默认 30 秒），使用感知哈希去重（相似度 > 90% 跳过 OCR）。
//! Windows 平台使用 DXGI/GDI 截图，其他平台使用占位实现（便于开发调试）。
//! 截图分辨率长边不超过 1280px，本地存储，绝不上传。

use crate::db::{generate_id, now_timestamp, Segment};
use crate::privacy;
use crate::settings::AppSettings;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// 采集状态
pub struct CaptureState {
    /// 是否正在采集
    pub is_capturing: parking_lot::Mutex<bool>,
    /// 是否暂停（用户手动暂停）
    pub is_paused: parking_lot::Mutex<bool>,
    /// 是否处于隐私保护模式（检测到无痕窗口）
    pub in_privacy_mode: parking_lot::Mutex<bool>,
    /// 上一次截图的感知哈希
    pub last_phash: parking_lot::Mutex<Option<u64>>,
    /// 当前活跃 segment id（用于关联剪贴板）
    pub current_segment_id: parking_lot::Mutex<Option<String>>,
    /// 今日窗口切换次数
    pub today_switch_count: parking_lot::Mutex<u32>,
    /// 当前窗口标题
    pub current_window_title: parking_lot::Mutex<Option<String>>,
    /// 当前应用名
    pub current_app_name: parking_lot::Mutex<Option<String>>,
    /// 连续专注同一应用的开始时间
    pub focus_start_time: parking_lot::Mutex<Option<i64>>,
}

impl CaptureState {
    pub fn new() -> Self {
        Self {
            is_capturing: parking_lot::Mutex::new(false),
            is_paused: parking_lot::Mutex::new(false),
            in_privacy_mode: parking_lot::Mutex::new(false),
            last_phash: parking_lot::Mutex::new(None),
            current_segment_id: parking_lot::Mutex::new(None),
            today_switch_count: parking_lot::Mutex::new(0),
            current_window_title: parking_lot::Mutex::new(None),
            current_app_name: parking_lot::Mutex::new(None),
            focus_start_time: parking_lot::Mutex::new(None),
        }
    }
}

/// 启动后台采集循环
pub fn start_capture_loop(app: AppHandle) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        interval.tick().await; // 跳过首次立即触发
        loop {
            interval.tick().await;
            if let Err(e) = capture_once(&app).await {
                tracing::error!("采集失败: {}", e);
            }
        }
    });
}

/// 执行一次截图采集
async fn capture_once(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    let capture = state.capture.clone();
    let settings = state.settings.clone();

    // 检查是否暂停
    let is_paused = *capture.is_paused.lock();
    if is_paused {
        return Ok(());
    }

    // 获取当前活跃窗口信息
    let (window_title, app_name) = get_active_window_info();

    // 隐私规则检查
    let settings_guard = settings.lock();
    let is_incognito = privacy::is_incognito_window(&window_title, &app_name);
    let is_blocked = privacy::is_blocked_by_rules(&window_title, &app_name, &settings_guard);
    drop(settings_guard);

    if is_incognito || is_blocked {
        // 进入隐私保护模式
        let mut in_privacy = capture.in_privacy_mode.lock();
        if !*in_privacy {
            *in_privacy = true;
            let _ = app.emit("mascot-state-change", "privacy");
            tracing::info!("进入隐私保护模式，停止截图");
        }
        return Ok(());
    }

    // 退出隐私保护模式
    let mut in_privacy = capture.in_privacy_mode.lock();
    if *in_privacy {
        *in_privacy = false;
        let _ = app.emit("mascot-state-change", "recording");
        tracing::info!("退出隐私保护模式，恢复截图");
    }
    drop(in_privacy);

    // 检测窗口切换
    {
        let mut current_title = capture.current_window_title.lock();
        let mut current_app = capture.current_app_name.lock();
        let mut switch_count = capture.today_switch_count.lock();
        let mut focus_start = capture.focus_start_time.lock();

        let title_changed = current_title.as_deref() != Some(window_title.as_str());
        let app_changed = current_app.as_deref() != Some(app_name.as_str());

        if title_changed || app_changed {
            *switch_count += 1;
            *focus_start = Some(now_timestamp());
        }

        *current_title = Some(window_title.clone());
        *current_app = Some(app_name.clone());

        // 检测连续专注 25 分钟
        if let Some(start) = *focus_start {
            let elapsed = now_timestamp() - start;
            if elapsed >= 25 * 60 && elapsed < 25 * 60 + 30 {
                let _ = app.emit("mascot-reminder", serde_json::json!({
                    "type": "focus_25min",
                    "message": "专注了 25 分钟，可以休息一下 ☕"
                }));
            }
        }
    }

    // 截图
    let screenshot = capture_screenshot().map_err(|e| format!("截图失败: {}", e))?;

    // 计算感知哈希
    let phash = compute_perceptual_hash(&screenshot);

    // 哈希去重：相似度 > 90% 跳过
    let should_skip_ocr = {
        let last = capture.last_phash.lock();
        if let Some(last_hash) = *last {
            let similarity = hash_similarity(last_hash, phash);
            similarity > 0.9
        } else {
            false
        }
    };

    // 更新最后哈希
    *capture.last_phash.lock() = Some(phash);

    // 保存截图（如果启用）
    let settings_guard = settings.lock();
    let save_screenshots = settings_guard.save_screenshots;
    let capture_interval = settings_guard.capture_interval_secs;
    drop(settings_guard);

    let image_path = if save_screenshots {
        let screenshots_dir = crate::settings::get_screenshots_dir(app);
        let filename = format!("{}.png", generate_id());
        let path = screenshots_dir.join(&filename);
        save_screenshot_image(&screenshot, &path)?;
        Some(path.to_string_lossy().to_string())
    } else {
        None
    };

    // 创建 segment 记录
    let segment_id = generate_id();
    let segment = Segment {
        id: segment_id.clone(),
        timestamp: now_timestamp(),
        ocr_text: if should_skip_ocr { None } else { None }, // OCR 异步填充
        window_title: Some(window_title.clone()),
        app_name: Some(app_name.clone()),
        image_path,
        ocr_blocks_json: None,
        perceptual_hash: Some(format!("{:016x}", phash)),
        capture_source: Some("auto".to_string()),
    };

    // 存入数据库
    {
        let db = state.db.lock();
        db.insert_segment(&segment).map_err(|e| e)?;
    }

    // 更新当前 segment id
    *capture.current_segment_id.lock() = Some(segment_id.clone());

    // 触发 OCR（如果不跳过）
    if !should_skip_ocr {
        let app_clone = app.clone();
        let seg_id = segment_id.clone();
        let img_data = screenshot.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::ocr::process_ocr(&app_clone, &seg_id, &img_data).await {
                tracing::error!("OCR 处理失败: {}", e);
            }
        });
    }

    // 更新采集状态
    *capture.is_capturing.lock() = true;

    // 通知前端今日统计更新
    let _ = app.emit("capture-tick", serde_json::json!({
        "timestamp": now_timestamp(),
        "interval": capture_interval,
    }));

    Ok(())
}

/// 计算两个哈希的相似度（0.0 - 1.0）
pub fn hash_similarity(a: u64, b: u64) -> f64 {
    let xor = a ^ b;
    let diff_bits = xor.count_ones();
    1.0 - (diff_bits as f64 / 64.0)
}

/// 计算图片的感知哈希（pHash）
///
/// 简化实现：将图片缩放到 8x8 灰度图，计算均值哈希。
fn compute_perceptual_hash(data: &[u8]) -> u64 {
    // 使用 image crate 解码并缩放到 8x8 灰度
    match image::load_from_memory(data) {
        Ok(img) => {
            let small = img.resize_exact(8, 8, image::imageops::FilterType::Lanczos3)
                .to_luma8();
            let pixels: Vec<u8> = small.iter().copied().collect();
            let avg: f64 = pixels.iter().map(|&p| p as f64).sum::<f64>() / pixels.len() as f64;
            let mut hash: u64 = 0;
            for (i, &p) in pixels.iter().enumerate() {
                if (p as f64) > avg {
                    hash |= 1 << i;
                }
            }
            hash
        }
        Err(_) => 0,
    }
}

/// 保存截图到文件
fn save_screenshot_image(data: &[u8], path: &PathBuf) -> Result<(), String> {
    std::fs::write(path, data).map_err(|e| format!("保存截图失败: {}", e))
}

// ==================== 平台相关截图实现 ====================

/// 截图并返回 PNG 字节数据
fn capture_screenshot() -> Result<Vec<u8>, String> {
    #[cfg(target_os = "windows")]
    {
        capture_screenshot_windows()
    }
    #[cfg(not(target_os = "windows"))]
    {
        capture_screenshot_placeholder()
    }
}

#[cfg(target_os = "windows")]
fn capture_screenshot_windows() -> Result<Vec<u8>, String> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, GetDC, ReleaseDC, SelectObject,
        DeleteDC, DeleteObject, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
        SRCCOPY, CAPTUREBLT,
    };
    use windows::Win32::Graphics::Gdi::{CreateDIBSection, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows::Win32::System::Memory::GlobalAlloc;
    use windows::core::PCWSTR;

    unsafe {
        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);

        // 限制长边 1280px
        let (w, h) = if screen_w > screen_h {
            if screen_w > 1280 {
                let scale = 1280.0 / screen_w as f64;
                (1280, (screen_h as f64 * scale) as i32)
            } else {
                (screen_w, screen_h)
            }
        } else {
            if screen_h > 1280 {
                let scale = 1280.0 / screen_h as f64;
                ((screen_w as f64 * scale) as i32, 1280)
            } else {
                (screen_w, screen_h)
            }
        };

        let hdc_screen = GetDC(None);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbitmap = CreateCompatibleBitmap(hdc_screen, w, h);
        let old_obj = SelectObject(hdc_mem, hbitmap);

        BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, 0, 0, SRCCOPY | CAPTUREBLT);

        // 转换为 PNG
        let mut bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // 自上而下
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default()],
        };

        let mut pixels: Vec<u8> = vec![0u8; (w * h * 4) as usize];
        windows::Win32::Graphics::Gdi::GetDIBits(
            hdc_mem,
            hbitmap,
            0,
            h as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bitmap_info,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_obj);
        DeleteDC(hdc_mem).ok();
        DeleteObject(hbitmap).ok();
        ReleaseDC(None, hdc_screen);

        // 转换 BGRA -> RGBA 并编码为 PNG
        let mut rgba = vec![0u8; pixels.len()];
        for i in (0..pixels.len()).step_by(4) {
            rgba[i] = pixels[i + 2];     // R
            rgba[i + 1] = pixels[i + 1]; // G
            rgba[i + 2] = pixels[i];     // B
            rgba[i + 3] = pixels[i + 3]; // A
        }

        let img = image::RgbaImage::from_raw(w as u32, h as u32, rgba)
            .map_err(|e| format!("创建图像失败: {}", e))?;
        let mut png_data = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
        image::ImageEncoder::write_image(encoder, &img, w as u32, h as u32, image::ExtendedColorType::Rgba8)
            .map_err(|e| format!("编码 PNG 失败: {}", e))?;
        Ok(png_data)
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_screenshot_placeholder() -> Result<Vec<u8>, String> {
    // 非 Windows 平台生成占位图（便于开发调试）
    let img = image::RgbaImage::from_fn(1280, 720, |x, y| {
        image::Rgba([(x % 255) as u8, (y % 255) as u8, 128, 255])
    });
    let mut png_data = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
    image::ImageEncoder::write_image(encoder, &img, 1280, 720, image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("编码 PNG 失败: {}", e))?;
    Ok(png_data)
}

// ==================== 平台相关窗口信息 ====================

/// 获取当前活跃窗口的标题和应用名
fn get_active_window_info() -> (String, String) {
    #[cfg(target_os = "windows")]
    {
        get_active_window_windows()
    }
    #[cfg(not(target_os = "windows"))]
    {
        get_active_window_placeholder()
    }
}

#[cfg(target_os = "windows")]
fn get_active_window_windows() -> (String, String) {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
    use windows::Win32::System::ProcessStatus::GetModuleBaseNameW;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return ("Unknown".to_string(), "Unknown".to_string());
        }

        // 获取窗口标题
        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..len as usize]);

        // 获取进程名
        let mut pid = 0u32;
        windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let app_name = if let Ok(handle) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) {
            let mut name_buf = [0u16; 512];
            let len = GetModuleBaseNameW(handle, None, &mut name_buf);
            let _ = windows::Win32::Foundation::CloseHandle(handle);
            if len > 0 {
                String::from_utf16_lossy(&name_buf[..len as usize])
            } else {
                "Unknown".to_string()
            }
        } else {
            "Unknown".to_string()
        };

        (title, app_name)
    }
}

#[cfg(not(target_os = "windows"))]
fn get_active_window_placeholder() -> (String, String) {
    ("开发环境占位窗口".to_string(), "DevApp".to_string())
}
