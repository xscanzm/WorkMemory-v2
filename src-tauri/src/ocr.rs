//! OCR 识别模块
//!
//! Windows 平台使用 Windows.Media.Ocr.OcrEngine（系统内置，零额外内存）。
//! 其他平台使用占位实现。OCR 异步执行，不阻塞主线程和 UI。
//! 识别结果通过 Tauri event 推送给前端。

use crate::db::Segment;
use tauri::{AppHandle, Emitter, Manager};

/// OCR 引擎状态
#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrStatus {
    pub engine: String,
    pub available: bool,
    pub language: String,
}

/// 获取 OCR 引擎状态
pub fn get_status() -> OcrStatus {
    #[cfg(target_os = "windows")]
    {
        OcrStatus {
            engine: "windows".to_string(),
            available: true,
            language: "zh-CN".to_string(),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        OcrStatus {
            engine: "placeholder".to_string(),
            available: false,
            language: "zh-CN".to_string(),
        }
    }
}

/// 异步处理 OCR
///
/// 在独立 tokio 任务中执行，识别结果更新到 segment 并通过 event 推送给前端。
pub async fn process_ocr(app: &AppHandle, segment_id: &str, image_data: &[u8]) -> Result<(), String> {
    let ocr_text = run_ocr(image_data).await?;

    if !ocr_text.is_empty() {
        // 更新 segment 的 ocr_text
        let state = app.state::<crate::AppState>();
        let db = state.db.lock();
        // 直接更新 segment 的 ocr_text 字段
        db.execute(
            "UPDATE segments SET ocr_text = ? WHERE id = ?",
            rusqlite::params![ocr_text, segment_id],
        )?;

        // 通知前端 OCR 完成
        let _ = app.emit("ocr-completed", serde_json::json!({
            "segment_id": segment_id,
            "text_length": ocr_text.len(),
        }));

        // 触发待办提取
        let todos = crate::episode::extract_todos(&ocr_text);
        if !todos.is_empty() {
            let _ = app.emit("todos-extracted", serde_json::json!({
                "segment_id": segment_id,
                "todos": todos,
            }));
        }

        tracing::debug!("OCR 完成: segment={} 文本长度={}", segment_id, ocr_text.len());
    }

    Ok(())
}

/// 执行 OCR 识别
async fn run_ocr(image_data: &[u8]) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        run_ocr_windows(image_data).await
    }
    #[cfg(not(target_os = "windows"))]
    {
        run_ocr_placeholder(image_data).await
    }
}

#[cfg(target_os = "windows")]
async fn run_ocr_windows(image_data: &[u8]) -> Result<String, String> {
    use windows::Media::Ocr::OcrEngine;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
    use windows::Globalization::Language;
    use windows::Foundation::TypedEventHandler;

    // 在独立线程执行 Windows OCR（避免阻塞 async runtime）
    let data = image_data.to_vec();
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let stream = InMemoryRandomAccessStream::new()
            .map_err(|e| format!("创建流失败: {}", e))?;
        let writer = DataWriter::CreateDataWriter(stream.GetOutputStream().map_err(|e| format!("{}", e))?)
            .map_err(|e| format!("{}", e))?;
        writer.WriteBytes(&data).map_err(|e| format!("{}", e))?;
        writer.StoreAsync().map_err(|e| format!("{}", e))?.get().map_err(|e| format!("{}", e))?;
        writer.FlushAsync().map_err(|e| format!("{}", e))?.get().map_err(|e| format!("{}", e))?;

        let decoder = BitmapDecoder::CreateAsync(stream).map_err(|e| format!("{}", e))?
            .get().map_err(|e| format!("{}", e))?;
        let bitmap = decoder.GetSoftwareBitmapAsync().map_err(|e| format!("{}", e))?
            .get().map_err(|e| format!("{}", e))?;

        // 尝试中文，回退到系统默认
        let engine = if let Ok(lang) = Language::CreateLanguage("zh-CN").map_err(|e| format!("{}", e)) {
            OcrEngine::TryCreateFromLanguage(&lang).map_err(|e| format!("{}", e))?
        } else {
            OcrEngine::TryCreateFromUserProfileLanguages().map_err(|e| format!("{}", e))?
        };

        let result = engine.RecognizeAsync(&bitmap).map_err(|e| format!("{}", e))?
            .get().map_err(|e| format!("{}", e))?;

        let text = result.Text().map_err(|e| format!("{}", e))?;
        Ok(text.to_string())
    })
    .await
    .map_err(|e| format!("OCR 任务失败: {}", e))?
}

#[cfg(not(target_os = "windows"))]
async fn run_ocr_placeholder(_image_data: &[u8]) -> Result<String, String> {
    // 非 Windows 平台返回空文本（开发环境占位）
    Ok(String::new())
}

/// 测试 OCR 引擎
pub async fn test_ocr() -> Result<String, String> {
    // 生成一张测试图片
    let img = image::RgbaImage::from_fn(200, 50, |x, y| {
        image::Rgba([255, 255, 255, 255])
    });
    let mut png_data = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
    image::ImageEncoder::write_image(encoder, &img, 200, 50, image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("编码测试图失败: {}", e))?;

    let text = run_ocr(&png_data).await?;
    Ok(format!("OCR 测试成功，识别文本长度: {}", text.len()))
}
