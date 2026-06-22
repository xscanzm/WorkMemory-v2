# WorkMemory 桌面工作记忆助手 Spec

## Why
知识工作者每天需要花 20-30 分钟回忆"今天做了什么"，写日报/周报、复盘项目、查找历史工作细节都依赖记忆，成本高且易遗漏。WorkMemory 通过后台自动截图+OCR+AI 理解，把"我今天做了什么"变成零成本获取的能力，并辅以有温度的桌面伙伴提供情感连接。本项目从零构建，需一次性完成 P0-P2 全部功能。

## What Changes
- **新建项目骨架**：Electron 31 + Vite 5 + React 18 + TypeScript(strict) + Zustand + Radix UI + Framer Motion
- **新建数据层**：better-sqlite3 (WAL) + FTS5 全文索引 + 版本化迁移 + 统一 DAO
- **新建 IPC 基础设施**：Zod schema 校验 + 统一信封 `{ ok, data } / { ok, error }` + Preload 类型化暴露
- **新建采集层**：定时截图 + 感知哈希去重 + PaddleOCR (koffi FFI) Worker Thread + 剪贴板监听 + 无痕模式检测
- **新建理解层**：Episode 自动归并 + AI 标题/摘要/分类 + 待办提取 + 实体识别 + 跨天连续性
- **新建主界面**：Today 三栏布局 + 时间轴/列表双视图 + 详情面板 + 待办汇总 + 快速捕获
- **新建桌面伙伴**：5 形象 + 5 功能状态 + 7 情绪状态 + 三种气泡 + 微动画 + 拖拽吸附 + 首次引导
- **新建报告模块**：5 模板 + 流式输出 + 历史对比 + 定时提醒
- **新建搜索模块**：全文搜索 + 实体时间线 + 自然语言时间搜索 + 过滤语法
- **新建知识库**：6 类型卡片 + 审核队列 + 双链关联 + 健康度 + Obsidian 导入
- **新建洞察模块**：洞察卡片流 + 周目标 + 数据仪表盘
- **新建日历模块**：月视图热力图 + 当日详情
- **新建图谱模块**：知识图谱可视化（节点/边/缩放/搜索）
- **新建设置模块**：AI/伙伴/记录/隐私/OCR/数据管理/导入 全配置
- **新建 P2 增强**：命令面板 + 深色模式 + Word 导出 + Token 仪表盘
- **BREAKING**：无（全新项目，无历史代码）

## Impact
- Affected specs: 无（全新项目）
- Affected code: 全部新建，主要模块包括：
  - `electron/` 主进程（窗口管理、采集、OCR、IPC handler、数据库）
  - `src/` 渲染进程（React UI、Zustand stores、页面组件）
  - `shared/` 共享类型与 Zod schema
  - `resources/` 静态资源（伙伴形象占位、图标）
  - `migrations/` 数据库迁移脚本

## ADDED Requirements

### Requirement: 项目骨架与构建
系统 SHALL 使用 Electron 31 + Vite 5 + React 18 + TypeScript(strict) 搭建，支持 `pnpm dev` 热更新与 `pnpm build` 生产构建，启动到主窗口可交互 < 3 秒。

#### Scenario: 开发模式启动
- **WHEN** 开发者执行 `pnpm dev`
- **THEN** Vite dev server 启动，Electron 主窗口加载本地渲染进程，支持 HMR

#### Scenario: 生产构建
- **WHEN** 开发者执行 `pnpm build`
- **THEN** 生成打包后的 Electron 应用，可通过 electron-builder 产出 NSIS 安装包

### Requirement: 安全沙箱
系统 SHALL 启用 `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`，API Key 使用 safeStorage 加密存储，生产环境 CSP 不含 localhost。

#### Scenario: 渲染进程隔离
- **WHEN** 渲染进程尝试访问 Node API
- **THEN** 通过 Preload 暴露的有限 API 访问，无法直接 require Node 模块

### Requirement: 数据库与迁移
系统 SHALL 使用 better-sqlite3 WAL 模式，通过 `PRAGMA user_version` 管理版本化迁移，包含 segments / episodes / clean_episodes / wiki_pages / reports / privacy_rules / distill_runs / weekly_patterns / skill_cards / user_goals 等核心表，以及 fts_segments / fts_episodes / fts_wiki 三个 FTS5 虚拟表。应用退出前执行 `PRAGMA wal_checkpoint(TRUNCATE)`。

#### Scenario: 首次启动初始化
- **WHEN** 应用首次启动且数据库不存在
- **THEN** 创建所有表与 FTS5 虚拟表，user_version 设为最新

#### Scenario: 版本升级迁移
- **WHEN** 应用启动检测到 user_version 低于当前
- **THEN** 逐版本执行 up 迁移，新增字段追加而非覆盖

### Requirement: IPC 校验与信封
所有 IPC 通道 SHALL 以 `模块名:操作名` 命名，入参经 Zod schema 校验，返回值统一为 `{ ok: true, data: T } | { ok: false, error: string }`，Preload 层明确标注所有入参和返回类型。

#### Scenario: 入参校验失败
- **WHEN** 渲染进程发送不符合 schema 的 IPC 调用
- **THEN** 主进程返回 `{ ok: false, error: 'validation error: ...' }`，不执行业务逻辑

### Requirement: 统一日志
系统 SHALL 提供统一日志模块，写入 `app.getPath('userData')/logs/`，生产环境不向控制台输出 debug，错误日志包含时间戳/模块/错误类型/堆栈。

### Requirement: 截图采集
系统 SHALL 后台定时（默认 30 秒，可配置 10-120 秒）检测窗口变化并截图，长边不超过 1280px，使用感知哈希去重（相似度 > 90% 跳过 OCR），检测到无痕模式立即停止截图。

#### Scenario: 窗口未变化
- **WHEN** 相邻截图感知哈希相似度 > 90%
- **THEN** 跳过 OCR 推理，仅记录 segment 元数据

#### Scenario: 无痕模式
- **WHEN** 检测到无痕浏览器窗口
- **THEN** 立即停止截图，记录占位符 segment，桌面伙伴进入 privacy 状态

### Requirement: OCR Worker Thread
系统 SHALL 在独立 Worker Thread 中运行 PaddleOCR（koffi FFI 调用），绝不阻塞主进程事件循环，支持 tiny/small 模型切换，OCR 失败时记录原因不影响整体流程。

#### Scenario: OCR 推理
- **WHEN** 新 segment 进入 OCR 队列
- **THEN** Worker Thread 异步处理，结果写入 segments.ocr_text 与 ocr_blocks

### Requirement: 剪贴板监听
系统 SHALL 监听剪贴板内容变化，经隐私规则过滤后与当前活跃 Segment 关联，超过 5000 字符只取前 500 字符并标注「内容过长」。

### Requirement: 隐私规则
系统 SHALL 支持用户自定义隐私规则（应用名/窗口标题/URL 关键词），匹配时完全跳过记录，所有数据本地存储绝不上传，Settings 中可查看「今日哪些内容被隐私保护了」。

### Requirement: Episode 自动归并
系统 SHALL 将连续工作自动归并为 Episode，包含 AI 生成的标题（5-15 字）、一句话摘要（30-60 字）、时间段、类型分类（work/meeting/research/coding/planning/reading/communication）、涉及实体（项目/人物/文档）、待办事项、阻塞项。

#### Scenario: 连续工作归并
- **WHEN** 用户连续在同一应用/项目工作
- **THEN** 相关 segments 归并为一个 Episode，AI 生成标题与摘要

### Requirement: 待办提取
系统 SHALL 从 OCR 文字中提取待办（TODO/todo/待办/待处理/需要/下一步 模式、Markdown `- [ ]`、编辑器 TODO 注释、会议 Action Item），写入 Episode.todos。

### Requirement: 跨天连续性
系统 SHALL 每天生成 Episode 后检测与过去 7 天 Episodes 的关联性（项目名相同/实体重叠 ≥2/AI 语义相似度 > 0.8），建立 relatedEpisodeIds，Today 页面展示「昨天也在做这件事」提示。

### Requirement: Today 主界面
系统 SHALL 提供三栏布局的 Today 页面：左侧导航栏 + 中间主内容区（时间轴/列表双视图）+ 右侧详情面板。顶部状态区显示日期、录制状态、统计数字（已记录事件数/专注时长/切换次数）。打开后 3 秒内能看出今天做了什么。

#### Scenario: 时间轴视图
- **WHEN** 用户切换到时间轴视图
- **THEN** 显示 24h 横轴，色块宽度=时长，类型对应颜色，悬停 tooltip，点击展开详情，当前时间竖线

#### Scenario: 列表视图
- **WHEN** 用户切换到列表视图
- **THEN** 按时间倒序展示事件卡片，左侧彩色竖线，右上角 ··· 菜单（编辑/标记重要/删除/加入报告）

#### Scenario: 详情面板
- **WHEN** 用户选中某 Episode
- **THEN** 右侧展示完整标题（可内联编辑）、时间段、AI 摘要（可编辑）、涉及实体、话题标签、截图缩略图、待办列表、底部操作按钮

### Requirement: 快速捕获
系统 SHALL 在 Today 页面顶部常驻快速捕获输入框，支持 # 标签和 @ 关联项目，回车保存为手动 Episode（source: 'manual'），全局快捷键 Win+Shift+M 随时呼出。

### Requirement: 待办汇总区
系统 SHALL 在 Today 页面底部固定展示今日待办汇总（AI 自动提取 + 手动添加），支持勾选完成，完成的待办划线但当日内保留。

### Requirement: 桌面伙伴基本形态
系统 SHALL 提供独立透明窗口的桌面伙伴，始终置顶，默认 80×80px（可调 60-120px），位于屏幕右下角距边缘 20px，无标题栏无边框，非本体区域点击穿透，可拖拽并吸附到最近边缘（300ms 动画），位置跨重启持久化。

### Requirement: 桌面伙伴形象系统
系统 SHALL 提供 5 种形象（note/film/copilot/cursor/paper），每种有独立人格影响气泡语气，暂用 emoji + 圆形背景色代替，设计出图后替换资源文件。

### Requirement: 桌面伙伴状态系统
系统 SHALL 提供 5 种功能状态（recording/paused/privacy/ocr_scanning/report_ready）和 7 种情绪状态（happy/focused/concerned/curious/sleepy/proud/neutral），情绪叠加在功能状态之上影响动画速度和气泡语气。

### Requirement: 桌面伙伴微动画
系统 SHALL 实现呼吸动画（recording，scale 1.0→1.04→1.0，3s）、漂浮动画（空闲，translateY 0→-5px→0，4s）、扫描动画（OCR 中，1.5s）、弹跳动画（report_ready）、入场动画、点击反馈（scale 0.92，100ms）、拖拽旋转（±5°），全部 60fps。

### Requirement: 桌面伙伴气泡系统
系统 SHALL 提供三种气泡模式：纯文字提醒（6 秒自动消失）、带操作按钮（不自动消失）、今日摘要卡片（悬停触发）。气泡磨砂玻璃效果，圆角 16px，最大宽度 280px，弹性出现 250ms。

### Requirement: 桌面伙伴交互
系统 SHALL 支持鼠标悬停（放大 + 250ms 后展示摘要卡片）、左键单击（跳转报告/待办/Today）、右键上下文菜单（打开今日/快速记一笔/暂停继续/生成报告/设置/隐藏 10 分钟）、右键双击（快速捕获）、拖拽吸附。

### Requirement: 桌面伙伴主动提醒
系统 SHALL 提供时间驱动（17:30 日报/周五周报/09:00 问候）、行为驱动（专注 25min/碎片检测/连续 2h/夜间 22:00）、事件驱动（新项目/知识审核/新技能卡）三类提醒，同类提醒最短间隔 30 分钟，每天上限 8 次，免打扰时段内不发送。

### Requirement: 首次启动引导
系统 SHALL 在首次启动时执行引导流程：伙伴从右下角飞入 → 4 条气泡依次出现（每条 3 秒，可跳过）→ 选择形象 → 变换外形弹跳 → 开始正常记录。

### Requirement: 报告生成
系统 SHALL 提供 5 种报告模板（enhanced/concise/standup/okr/structured），支持选择模板 + 可选补充说明 + 流式输出（逐字显示）+ 富文本编辑器修改 + 复制到剪贴板/导出 Markdown/导出 Word/重新生成。

#### Scenario: 流式生成
- **WHEN** 用户点击「开始生成」
- **THEN** 内容逐字出现，10 秒内完成

### Requirement: 报告历史
系统 SHALL 提供按日期分组的历史报告列表，支持选中两份报告对比（左右并排，高亮新增/消失内容），每份报告显示日期/模板类型/字数/状态。

### Requirement: 报告定时提醒
系统 SHALL 在工作日 17:30 提醒生成日报，每周五 17:00 提醒生成周报，可在 Settings 自定义或关闭。

### Requirement: 搜索
系统 SHALL 提供顶部全宽搜索框，输入即时出结果（300ms 防抖），支持自然语言、快捷过滤语法（#标签/@人物/>时间/project:项目），两种结果模式（时间顺序/相关度排序），实体时间线视图，自然语言时间搜索（「上周五下午」「上个月做了什么」「最近一次和张三开会」）。搜索响应 < 500ms。

### Requirement: 知识库
系统 SHALL 提供 6 种知识卡片（person/project/decision/meeting/topic/skill），列表页含分类过滤+搜索+卡片网格+待审核区域，详情页展示类型/最近活动/描述/相关记忆/关联卡片，AI 生成卡片先进审核队列（确认/编辑后确认/忽略），超过 30 天未引用标记「待复核」，支持 Obsidian .md 导入并解析 [[双链]]。

### Requirement: 洞察
系统 SHALL 提供洞察卡片流（专注规律/时间分配/碎片化预警/进步里程碑/异常检测/目标对齐），周目标设定（最多 3 条自然语言），数据仪表盘（本周工时条形图/本月项目饼图/知识库成长折线图/AI Token 消耗估算）。

### Requirement: 日历
系统 SHALL 提供月视图日历，每天格子展示工作摘要（1-2 行），格子颜色深浅=工作量，点击某天右侧展示当日 Episodes，无记录天提示，快速导航（今日/本周/上周/本月），点击某天跳转该天 Today 视图（历史日期只读）。

### Requirement: 图谱
系统 SHALL 提供知识图谱可视化，节点=Wiki 卡片，边=同一 Episode 共同提及，节点大小=引用次数，节点颜色=Wiki 类型，边粗细=共同出现次数，支持滚轮缩放/拖拽平移/悬停 tooltip/点击查看详情/搜索高亮。

### Requirement: 设置
系统 SHALL 提供完整设置：AI 配置（API Key 密码框/Base URL/模型/连接测试）、桌面伙伴（启用/形象/大小/提醒配置）、记录设置（截图间隔/保存/保留天数/整屏降级）、隐私规则（列表+增删+启用开关）、OCR 设置（状态+引导+模型切换+测试）、数据管理（使用量统计/清理指定日期/清除所有数据二次确认/导出 JSON）、导入（Markdown 笔记）。

### Requirement: 命令面板
系统 SHALL 提供 Ctrl+K 命令面板，支持快速跳转页面、执行常用操作。

### Requirement: 深色模式
系统 SHALL 跟随系统 nativeTheme 自动切换深色模式，所有组件完整适配。

### Requirement: 设计系统
系统 SHALL 遵循设计系统：主色 #5B6AF0、辅色 #10B981、警示 #F59E0B、危险 #EF4444、背景 #F5F7FA、表面 #FFFFFF、4px 间距单位、系统字体栈、圆角（6/12/16/20px）、阴影（轻微/标准/强调/气泡）、动画（100ms 超快/150ms 快速/250ms 标准/300ms 缓慢/弹性/spring）。

### Requirement: 性能指标
系统 SHALL 满足：启动到主窗口可交互 < 3 秒、搜索响应 < 500ms、报告流式生成 < 10 秒、所有动画 60fps、OCR 在 Worker Thread 不阻塞 UI。
