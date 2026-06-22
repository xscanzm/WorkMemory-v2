# Tasks

## 阶段一：项目骨架与基础设施（P0）

- [x] Task 1: 初始化 Tauri v2 项目骨架
  - [x] SubTask 1.1: 使用 `cargo create-tauri-app` 初始化项目，选择 React + TypeScript + Vite 模板
  - [x] SubTask 1.2: 配置 `tauri.conf.json`：双窗口（main 标准窗口 + mascot transparent/decorations=false/always_on_top/skip_taskbar）
  - [x] SubTask 1.3: 安装前端依赖：Zustand、Radix UI、Framer Motion、react-router-dom、dayjs
  - [x] SubTask 1.4: 配置 TypeScript strict 模式，配置 Vite 路径别名 `@/`
  - [x] SubTask 1.5: 搭建前端目录结构（pages/components/store/hooks/lib/styles/types）

- [x] Task 2: 实现 Rust 后端数据库层（rusqlite + FTS5 + 迁移）
  - [x] SubTask 2.1: 添加 rusqlite（bundled feature）依赖，配置 WAL 模式
  - [x] SubTask 2.2: 实现 Schema 迁移管理（`PRAGMA user_version` 逐版本 up 迁移）
  - [x] SubTask 2.3: 创建核心表：segments / episodes / clean_episodes / wiki_pages / reports / privacy_rules / daily_distills / weekly_patterns / skill_cards / user_goals
  - [x] SubTask 2.4: 创建 FTS5 虚拟表：fts_segments / fts_episodes / fts_wiki（unicode61 tokenizer）
  - [x] SubTask 2.5: 实现写连接 `Mutex<Connection>` + 读连接池，应用退出前 `PRAGMA wal_checkpoint(TRUNCATE)`

- [x] Task 3: 实现 Tauri commands 统一 IPC 信封
  - [x] SubTask 3.1: 定义统一返回类型 `Result<T, String>` 和前端信封 `{ ok, data/error }`
  - [x] SubTask 3.2: 实现命名规范 `模块_操作`（capture_start / episode_list / report_generate 等）
  - [x] SubTask 3.3: 生成 TypeScript 类型定义（serde 序列化），前端 `invoke<T>` 类型完整覆盖
  - [x] SubTask 3.4: 实现前端 IPC 封装层（统一错误处理、loading 状态）

- [x] Task 4: 实现 tracing 统一日志模块
  - [x] SubTask 4.1: 添加 tracing + tracing-appender 依赖
  - [x] SubTask 4.2: 配置按天滚动写入 `{AppData}/WorkMemory/logs/app.log`
  - [x] SubTask 4.3: 实现前端错误通过 Tauri command 转发到 Rust 日志系统

- [x] Task 5: 配置 Capabilities 安全系统
  - [x] SubTask 5.1: 主窗口 capability：可访问全部 commands
  - [x] SubTask 5.2: 伙伴窗口 capability：仅允许 mascot 相关 commands + event 监听
  - [x] SubTask 5.3: 配置 CSP（生产环境不包含 localhost）

## 阶段二：记忆采集层（P0）

- [x] Task 6: 实现定时截图采集（DXGI/GDI + 感知哈希去重）
  - [x] SubTask 6.1: 添加 windows-rs crate，实现 DXGI/GDI 截图捕获
  - [x] SubTask 6.2: 截图分辨率长边不超过 1280px
  - [x] SubTask 6.3: 实现感知哈希（pHash）计算，相邻帧相似度 > 90% 跳过 OCR
  - [x] SubTask 6.4: 实现可配置定间隔（默认 30 秒）检测窗口变化
  - [x] SubTask 6.5: 截图本地存储，记录 segment 元数据（timestamp/window_title/app_name/image_path/perceptual_hash/capture_source）

- [x] Task 7: 实现 Windows OCR API 异步流水线
  - [x] SubTask 7.1: 使用 windows-rs 调用 `Windows.Media.Ocr.OcrEngine`
  - [x] SubTask 7.2: 异步执行（tokio::spawn 独立任务），不阻塞主线程
  - [x] SubTask 7.3: 同内容不重复识别（哈希去重后只有变化内容进队列）
  - [x] SubTask 7.4: 识别结果通过 Tauri event 推送给前端
  - [x] SubTask 7.5: 支持模型切换（Windows OCR 默认 / PaddleOCR sidecar 备选）

- [x] Task 8: 实现无痕模式检测与隐私保护
  - [x] SubTask 8.1: 检测无痕浏览器窗口（窗口标题/进程特征）
  - [x] SubTask 8.2: 检测到无痕模式立即停止截图，切换为占位符记录
  - [x] SubTask 8.3: 桌面伙伴进入 privacy 状态（遮眼动画 + 紫色调）
  - [x] SubTask 8.4: 用户自定义隐私规则（应用名/窗口标题/URL 关键词匹配，完全跳过）

- [x] Task 9: 实现剪贴板监听与关联
  - [x] SubTask 9.1: 添加 tauri-plugin-clipboard-manager，监听复制操作
  - [x] SubTask 9.2: 经隐私规则过滤（密码管理器、银行 app 等跳过）
  - [x] SubTask 9.3: 复制内容与当前活跃 Segment 关联存入 metadata
  - [x] SubTask 9.4: 超过 5000 字符只取前 500 字符 + 标注「内容过长」

## 阶段三：Episode 理解层（P0）

- [x] Task 10: 实现 Episode 自动归并（AI 生成）
  - [x] SubTask 10.1: 实现连续工作段归并逻辑（窗口切换/时间间隔 > 阈值触发归并）
  - [x] SubTask 10.2: 调用 AI 生成标题（5-15 字）、一句话摘要（30-60 字）
  - [x] SubTask 10.3: AI 类型分类：work/meeting/research/coding/planning/reading/communication
  - [x] SubTask 10.4: AI 实体识别（项目/人物/文档）
  - [x] SubTask 10.5: AI 阻塞项提取（存入 blockers 列表）
  - [x] SubTask 10.6: 关联 segment_ids，存储 source（auto/manual）

- [x] Task 11: 实现待办事项自动提取
  - [x] SubTask 11.1: OCR 文字模式匹配：TODO/todo/待办/待处理/需要/下一步 后内容
  - [x] SubTask 11.2: Markdown `- [x] 内容` 格式匹配
  - [x] SubTask 11.3: 编辑器 TODO 注释匹配
  - [x] SubTask 11.4: 会议记录 Action Item 匹配
  - [x] SubTask 11.5: 提取结果存入 Episode todos 列表

- [x] Task 12: 实现跨天任务连续性（P1）
  - [x] SubTask 12.1: 每天生成 Episode 后检测与过去 7 天 Episodes 关联性
  - [x] SubTask 12.2: 关联判断：项目名相同 / 实体重叠 >= 2 / AI 语义相似度 > 0.8
  - [x] SubTask 12.3: 建立 relatedEpisodeIds 字段
  - [x] SubTask 12.4: Today 页面展示「昨天也在做这件事」提示

## 阶段四：桌面伙伴 Mascot（P0 + P1）

- [x] Task 13: 实现 Mascot 窗口基础与外形系统
  - [x] SubTask 13.1: 配置 mascot 窗口（transparent + decorations=false + always_on_top + skip_taskbar + 80×80px）
  - [x] SubTask 13.2: 实现 5 种形象（note/film/copilot/cursor/paper），暂用 emoji + 圆形背景色
  - [x] SubTask 13.3: 实现位置管理（默认右下角距边缘 20px，可拖拽，记住最后位置跨重启恢复）
  - [x] SubTask 13.4: 非伙伴本体区域点击穿透

- [x] Task 14: 实现 Mascot 状态系统
  - [x] SubTask 14.1: 5 种功能状态（recording/paused/privacy/ocr_scanning/report_ready）视觉表现
  - [x] SubTask 14.2: 7 种情绪状态（happy/focused/concerned/curious/sleepy/proud/neutral）触发逻辑
  - [x] SubTask 14.3: 状态机切换逻辑（情绪叠加在功能状态之上）

- [x] Task 15: 实现 Mascot 微动画（60fps Framer Motion）
  - [x] SubTask 15.1: 呼吸动画（recording：scale 1.0→1.04→1.0，3 秒周期）
  - [x] SubTask 15.2: 漂浮动画（空闲：translateY 0→-5px→0，4 秒周期）
  - [x] SubTask 15.3: 扫描动画（ocr_scanning：眼睛左右扫描，1.5 秒周期）
  - [x] SubTask 15.4: 弹跳动画（report_ready：scale 1.0→1.15→0.95→1.05→1.0）
  - [x] SubTask 15.5: 入场动画（首次显示：从屏幕底部飞入 + 落地弹跳）
  - [x] SubTask 15.6: 点击反馈（按下 scale 0.92，100ms）+ 拖拽旋转 ±5°

- [x] Task 16: 实现 Mascot 气泡通知系统
  - [x] SubTask 16.1: 气泡视觉（磨砂玻璃 backdrop-filter blur 16px + 白色半透明 + 柔和阴影 + 圆角 16px + 最大宽度 280px）
  - [x] SubTask 16.2: 出现动画（scale 0.8 + opacity 0 → 1.0 + 1，弹性曲线 250ms）+ 消失动画（淡出下移 200ms）
  - [x] SubTask 16.3: 模式 1 纯文字提醒（6 秒自动消失）
  - [x] SubTask 16.4: 模式 2 带操作按钮（不自动消失）
  - [x] SubTask 16.5: 模式 3 今日摘要卡片（悬停触发，含事件列表 + 专注时长 + 事件数 + 打开完整记忆按钮）

- [x] Task 17: 实现 Mascot 交互行为
  - [x] SubTask 17.1: 鼠标悬停（scale 1.0→1.08，100ms + 250ms 后展示模式 3 气泡）
  - [x] SubTask 17.2: 鼠标离开（恢复原始大小 + 摘要卡片淡出）
  - [x] SubTask 17.3: 左键单击（未读报告→报告页 / 未完成待办→待办气泡 / 否则→Today 页）
  - [x] SubTask 17.4: 右键单击上下文菜单（打开今日/快速记一笔/暂停继续/生成报告/设置/隐藏 10 分钟）
  - [x] SubTask 17.5: 右键双击 Ghost Capture 输入框（回车保存，ESC 取消）
  - [x] SubTask 17.6: 拖拽（按住左键拖动 + 轻微旋转 ±5° + 松手 300ms 吸附到最近角）

- [x] Task 18: 实现 Mascot 主动提醒规则（P1）
  - [x] SubTask 18.1: 时间驱动（17:30 日报 / 周五 17:00 周报 / 09:00 问候）
  - [x] SubTask 18.2: 行为驱动（专注 25min / 5 分钟切换 10 次 / 连续 2 小时 / 22:00 夜间）
  - [x] SubTask 18.3: 事件驱动（新项目名 / 知识库待审核 >= 3 / 新技能卡）
  - [x] SubTask 18.4: 频率限制（同类最短间隔 30 分钟，每天上限 8 次，免打扰时段不发送）

- [x] Task 19: 实现首次启动引导流程
  - [x] SubTask 19.1: 伙伴从屏幕右下角飞入（入场动画 + 落地弹跳）
  - [x] SubTask 19.2: 依次展示 4 条引导气泡（每条 3 秒，点击可跳过）
  - [x] SubTask 19.3: 展示 5 种形象供选择，选择后变换外形并弹跳

## 阶段五：Today 主界面（P0）

- [x] Task 20: 实现 Today 页面三栏布局与导航
  - [x] SubTask 20.1: 左侧导航栏（图标导航：Today/Search/Reports/Wiki/Insights/Calendar/Graph/Settings）
  - [x] SubTask 20.2: 中间主内容区（顶部 Tab 切换时间轴/列表视图）
  - [x] SubTask 20.3: 右侧详情面板（选中项详情）
  - [x] SubTask 20.4: 顶部标题栏（日期 + 记录状态 + 快捷操作）

- [x] Task 21: 实现时间轴视图
  - [x] SubTask 21.1: 24h 横轴，色块宽度 = 时长
  - [x] SubTask 21.2: Episode 类型对应颜色（work/meeting/coding/research/planning…）
  - [x] SubTask 21.3: 悬停色块 tooltip（标题 + 时长）
  - [x] SubTask 21.4: 点击色块 → 右侧面板展示详情
  - [x] SubTask 21.5: 空白区域点击 → 弹出手动添加记忆对话框
  - [x] SubTask 21.6: 当前时间实时竖线标注

- [x] Task 22: 实现列表视图
  - [x] SubTask 22.1: 事件卡片（左侧彩色竖线 + 标题 + 摘要 + 标签 + 时长 + 时间）
  - [x] SubTask 22.2: 右上角 ··· 菜单（编辑/标记重要/删除/加入报告）
  - [x] SubTask 22.3: 按时间倒序排列

- [x] Task 23: 实现顶部状态区与快速捕获
  - [x] SubTask 23.1: 顶部状态区（日期 + 录制状态 + 已记录事件数 + 专注时长 + 切换次数 + 生成报告按钮）
  - [x] SubTask 23.2: 顶部常驻快速捕获输入框（支持 # 标签 @ 关联项目，回车保存为手动 Episode）
  - [x] SubTask 23.3: 全局快捷键 Win+Shift+M 呼出 Ghost Capture（无需打开主窗口）

- [x] Task 24: 实现右侧详情面板
  - [x] SubTask 24.1: 完整标题（可内联编辑）
  - [x] SubTask 24.2: 时间段（开始 - 结束）
  - [x] SubTask 24.3: AI 一句话摘要（可编辑）
  - [x] SubTask 24.4: 涉及实体（项目/人物/文档，可确认/修正/忽略）
  - [x] SubTask 24.5: 话题标签列表
  - [x] SubTask 24.6: 关联原始截图缩略图（点击放大）
  - [x] SubTask 24.7: 待办事项列表（可勾选完成）
  - [x] SubTask 24.8: 底部操作（加入今日报告/标记重要/删除）

- [x] Task 25: 实现待办汇总区
  - [x] SubTask 25.1: 底部固定展示今日待办（AI 自动提取 + 手动添加）
  - [x] SubTask 25.2: 完成的待办划线但当日内保留
  - [x] SubTask 25.3: 「全部完成」按钮

## 阶段六：报告生成（P0 + P1）

- [x] Task 26: 实现 5 种报告模板
  - [x] SubTask 26.1: enhanced（详细日报）
  - [x] SubTask 26.2: concise（精简日报，三句话总结）
  - [x] SubTask 26.3: standup（站会报告：昨日完成/今日计划/阻塞问题）
  - [x] SubTask 26.4: okr（OKR 进展）
  - [x] SubTask 26.5: structured（周报，含下周计划）
  - [x] SubTask 26.6: 模板卡片选择 UI（有简要说明和预览）

- [x] Task 27: 实现报告流式生成与编辑
  - [x] SubTask 27.1: 可选添加补充说明（150 字以内自由文本框）
  - [x] SubTask 27.2: 流式输出（内容逐字出现，通过 Tauri event 推送）
  - [x] SubTask 27.3: 富文本编辑器支持修改
  - [x] SubTask 27.4: 底部操作（复制到剪贴板/导出 Markdown/重新生成）

- [x] Task 28: 实现报告历史与对比（P1）
  - [x] SubTask 28.1: 左侧面板按日期分组展示历史报告
  - [x] SubTask 28.2: 选中两份报告对比（左右并排，高亮新增/消失内容）

- [x] Task 29: 实现报告定时提醒（P1）
  - [x] SubTask 29.1: 工作日每天 17:30 桌面伙伴提醒生成日报（可在 Settings 自定义或关闭）
  - [x] SubTask 29.2: 每周五 17:00 提醒生成周报

- [x] Task 30: 实现导出 Word 格式（P2）
  - [x] SubTask 30.1: 报告导出为 .docx 格式

## 阶段七：搜索（P0 + P1）

- [x] Task 31: 实现搜索基础功能
  - [x] SubTask 31.1: 顶部全宽搜索框，始终可见
  - [x] SubTask 31.2: 输入即时出结果（300ms 防抖，< 500ms 响应）
  - [x] SubTask 31.3: 支持自然语言，不要求精确关键词
  - [x] SubTask 31.4: 快捷过滤语法（#编码 @张三 >上周 project:XX项目）
  - [x] SubTask 31.5: 两种排序模式（时间顺序/相关度排序）顶部 Tab 切换
  - [x] SubTask 31.6: 每条结果（标题 + 时间 + 关键词高亮 + 匹配维度说明）

- [x] Task 32: 实现实体时间线视图（P1）
  - [x] SubTask 32.1: 搜索 @张三 → 展示所有与张三相关 Episodes 时间轴
  - [x] SubTask 32.2: 搜索 project:XX → 展示该项目完整工作历程

- [x] Task 33: 实现自然语言时间搜索（P1）
  - [x] SubTask 33.1: 「上周五下午」→ 自动转换为时间范围过滤
  - [x] SubTask 33.2: 「上个月做了什么」→ 展示上月 Episodes 摘要
  - [x] SubTask 33.3: 「最近一次和张三开会」→ 找到最近 meeting + @张三 的 Episode

## 阶段八：知识库 Wiki（P1）

- [x] Task 34: 实现 Wiki 知识卡片完整功能
  - [x] SubTask 34.1: 6 种卡片类型（person/project/decision/meeting/topic/skill）
  - [x] SubTask 34.2: 列表页（左侧分类过滤 + 搜索框 + 卡片网格 + 置顶待审核区域角标）
  - [x] SubTask 34.3: 详情页（标题 + 类型 + AI 描述可编辑 + 相关记忆列表 + 关联知识卡片双链）
  - [x] SubTask 34.4: AI 自动从工作记录提炼知识卡片

- [x] Task 35: 实现知识审核队列
  - [x] SubTask 35.1: AI 生成的卡片先进审核队列
  - [x] SubTask 35.2: 用户操作（✅ 确认入库 / ✏️ 编辑后确认 / ❌ 忽略）

- [x] Task 36: 实现知识卡片健康度
  - [x] SubTask 36.1: 超过 30 天未被新 Episode 引用 → 标记「待复核」（橙色角标）
  - [x] SubTask 36.2: Insights 页展示知识库健康度（活跃/陈旧/近期新增）

- [x] Task 37: 实现 Obsidian 笔记导入（P2）
  - [x] SubTask 37.1: 支持导入 .md 文件/文件夹
  - [x] SubTask 37.2: 解析 [[双链]] 语法
  - [x] SubTask 37.3: 导入内容先进审核队列，人工逐条确认后入库

## 阶段九：主动洞察 Insights（P1 + P2）

- [x] Task 38: 实现洞察卡片流
  - [x] SubTask 38.1: 洞察卡片 UI（标题 + 描述 + 查看详情/知道了按钮）
  - [x] SubTask 38.2: 专注规律洞察（高效/低效时段）
  - [x] SubTask 38.3: 时间分配洞察（各项目占比）
  - [x] SubTask 38.4: 碎片化预警洞察
  - [x] SubTask 38.5: 异常检测洞察

- [x] Task 39: 实现周目标设定（P2）
  - [x] SubTask 39.1: Insights 页顶部设定本周目标（最多 3 条，自然语言）
  - [x] SubTask 39.2: AI 每天自动标注相关度
  - [x] SubTask 39.3: 周末展示完成度评分

- [x] Task 40: 实现进步里程碑检测（P2）
  - [x] SubTask 40.1: 检测连续专注时长里程碑
  - [x] SubTask 40.2: 检测项目完成里程碑

- [x] Task 41: 实现数据仪表盘
  - [x] SubTask 41.1: 本周工作时长分布图表
  - [x] SubTask 41.2: 本月项目占比图表
  - [x] SubTask 41.3: 知识库成长曲线
  - [x] SubTask 41.4: AI Token 消耗估算仪表盘（P2）

## 阶段十：日历 Calendar（P1）

- [x] Task 42: 实现 Calendar 月视图
  - [x] SubTask 42.1: 月视图网格，每天格子内展示工作摘要（1-2 行）
  - [x] SubTask 42.2: 格子颜色深浅 = 工作量（热力图）
  - [x] SubTask 42.3: 点击某天 → 右侧展示当天 Episodes 列表
  - [x] SubTask 42.4: 快速导航（今日/本周/上周/本月）

## 阶段十一：图谱 Graph（P2）

- [x] Task 43: 实现 Graph 页面完整交互
  - [x] SubTask 43.1: 图谱可视化（节点 = Wiki 卡片，边 = 被同一 Episode 提及）
  - [x] SubTask 43.2: 节点大小 = 引用次数，颜色 = Wiki 类型
  - [x] SubTask 43.3: 滚轮缩放 / 拖拽平移
  - [x] SubTask 43.4: 悬停 tooltip / 点击展示详情
  - [x] SubTask 43.5: 搜索高亮

## 阶段十二：设置 Settings（P0）

- [x] Task 44: 实现 AI 配置
  - [x] SubTask 44.1: API Key / Base URL / 模型名称输入
  - [x] SubTask 44.2: 一键测试连接
  - [x] SubTask 44.3: API Key 加密存储（tauri-plugin-stronghold 或 Windows Credential Manager）

- [x] Task 45: 实现桌面伙伴配置
  - [x] SubTask 45.1: 启用开关
  - [x] SubTask 45.2: 形象选择（5 种）
  - [x] SubTask 45.3: 大小调整（60-120px）
  - [x] SubTask 45.4: 提醒配置
  - [x] SubTask 45.5: 免打扰时段配置（P1）

- [x] Task 46: 实现记录设置
  - [x] SubTask 46.1: 截图间隔配置
  - [x] SubTask 46.2: 截图保存开关 + 保留天数 + 路径

- [x] Task 47: 实现隐私规则管理
  - [x] SubTask 47.1: 规则列表（应用名/窗口标题/URL 关键词）
  - [x] SubTask 47.2: 添加删除规则
  - [x] SubTask 47.3: 启用开关
  - [x] SubTask 47.4: 查看今日被隐私保护的内容

- [x] Task 48: 实现 OCR 设置
  - [x] SubTask 48.1: 引擎状态显示
  - [x] SubTask 48.2: 模型切换（Windows OCR / PaddleOCR）
  - [x] SubTask 48.3: 一键测试

- [x] Task 49: 实现数据管理
  - [x] SubTask 49.1: 使用量统计
  - [x] SubTask 49.2: 清理数据
  - [x] SubTask 49.3: 导出 JSON

## 阶段十三：设计系统与全局功能（P0 + P2）

- [x] Task 50: 实现设计系统基础
  - [x] SubTask 50.1: 颜色系统（主色 #5B6AF0 / 辅色 #10B981 / 警示 #F59E0B / 危险 #EF4444 / 背景 #F5F7FA 等）
  - [x] SubTask 50.2: 间距系统（4px 基础单位：xs/sm/md/lg/xl/2xl）
  - [x] SubTask 50.3: 字体系统（系统字体栈 + 标题/正文/小字规格）
  - [x] SubTask 50.4: 圆角系统（6px/12px/16px/20px/50%）
  - [x] SubTask 50.5: 阴影系统（轻微/标准/强调/气泡）
  - [x] SubTask 50.6: 动画规格（100ms/150ms/250ms/300ms/弹性/Framer Motion 弹簧）

- [x] Task 51: 实现核心组件库
  - [x] SubTask 51.1: 按钮（主/次/危险/幽灵，高度 36/40/44px）
  - [x] SubTask 51.2: 输入框（高度 40px，focus 变主色，圆角 8px）
  - [x] SubTask 51.3: 卡片（Surface 白色 + 1px Border + 圆角 12px + 悬停 translateY -2px）
  - [x] SubTask 51.4: 空状态组件（插图 + 引导文字 + 可选操作按钮）
  - [x] SubTask 51.5: 骨架屏组件（数据加载时）

- [x] Task 52: 实现深色模式（P2）
  - [x] SubTask 52.1: 跟随系统自动切换
  - [x] SubTask 52.2: 深色模式色值（背景 #0F172A / 表面 #1E293B / 边框 #334155 / 文字 #F1F5F9 等）
  - [x] SubTask 52.3: 全组件深色模式适配

- [x] Task 53: 实现命令面板（P2）
  - [x] SubTask 53.1: Ctrl+K 唤起命令面板
  - [x] SubTask 53.2: 快速跳转任意页面
  - [x] SubTask 53.3: 执行常用操作

- [x] Task 54: 实现桌面伙伴角色人格化设计资源（P2）
  - [x] SubTask 54.1: 5 种形象静态帧（PNG 透明背景 80×80px）
  - [x] SubTask 54.2: 6-8 帧循环动画
  - [x] SubTask 54.3: 专属主题色

## 阶段十四：测试与打包

- [x] Task 55: 实现核心逻辑单元测试
  - [x] SubTask 55.1: Rust 后端核心逻辑测试（#[test]）
  - [x] SubTask 55.2: 前端核心逻辑测试（Vitest）

- [x] Task 56: 实现打包配置
  - [x] SubTask 56.1: tauri-build → NSIS 安装包
  - [x] SubTask 56.2: 安装包 < 15MB 验证

# Task Dependencies
- Task 2, 3, 4, 5 依赖 Task 1（项目骨架）
- Task 6, 7, 8, 9 依赖 Task 2, 3（数据库 + IPC）
- Task 10, 11 依赖 Task 6, 7（采集层）
- Task 12 依赖 Task 10
- Task 13-19 依赖 Task 1, 3, 5（骨架 + IPC + Capabilities）
- Task 20-25 依赖 Task 3, 10（IPC + Episode 数据）
- Task 26-30 依赖 Task 10, 20（Episode + Today 页面）
- Task 31-33 依赖 Task 2, 3（FTS5 + IPC）
- Task 34-37 依赖 Task 10, 20（Episode + Wiki）
- Task 38-41 依赖 Task 10, 34（Episode + Wiki）
- Task 42 依赖 Task 10（Episode）
- Task 43 依赖 Task 34（Wiki）
- Task 44-49 依赖 Task 3, 4（IPC + 日志）
- Task 50-54 依赖 Task 1（骨架）
- Task 55, 56 依赖所有功能 Task
- Task 50（设计系统）应尽早完成，其他 UI Task 复用其组件
