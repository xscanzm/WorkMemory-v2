# WorkMemory 全功能构建 Spec

## Why
WorkMemory 是一个住在你桌面上的工作记忆助手——它默默记住你做过的一切，在你需要的时候帮你回忆、整理、输出。本项目从零全新构建（Tauri v2 + React 18 + Rust），需要一次性完整实现 PRD v2.2 中 P0-P2 全部功能，让产品达到可交付状态。

## What Changes
- **新建 Tauri v2 项目骨架**：双窗口（main + mascot）、Vite + React 18 + TypeScript strict、Zustand、Radix UI、Framer Motion
- **Rust 后端核心**：rusqlite + FTS5 数据库（WAL + 迁移）、tracing 日志、Tauri commands 统一 IPC 信封、Capabilities 权限隔离
- **记忆采集层**：定时截图（DXGI/GDI）+ 感知哈希去重 + Windows OCR API 异步流水线 + 剪贴板监听 + 无痕模式隐私保护
- **Episode 理解层**：AI 自动归并（标题/摘要/类型/实体/待办/阻塞）+ 跨天连续性关联
- **桌面伙伴（Mascot）**：5 种形象 + 5 功能状态 + 7 情绪状态 + 微动画 + 三种气泡模式 + 右键菜单 + 拖拽吸附 + 首次启动引导 + 行为/定时/事件驱动提醒 + 免打扰
- **Today 主界面**：三栏布局 + 时间轴/列表双视图 + 右侧详情面板 + 快速捕获 + 待办汇总 + 全局快捷键 Ghost Capture
- **搜索**：即时搜索 + 过滤语法 + 实体时间线 + 自然语言时间搜索 + 时间/相关度排序
- **报告生成**：5 种模板 + 流式输出 + 富文本编辑 + 复制/导出 Markdown/Word + 历史对比
- **知识库（Wiki）**：6 种卡片类型 + 审核队列 + 双链关联 + 健康度标记 + Obsidian 导入
- **主动洞察（Insights）**：洞察卡片流 + 周目标设定 + 数据仪表盘 + Token 消耗统计
- **日历（Calendar）**：月视图热力图 + 当日详情
- **图谱（Graph）**：节点边可视化 + 完整交互
- **设置（Settings）**：AI 配置 + 桌面伙伴 + 记录设置 + 隐私规则 + OCR 设置 + 数据管理 + 导入
- **设计系统**：完整颜色/间距/字体/圆角/阴影/动画规格 + 深色模式 + 命令面板（Ctrl+K）

## Impact
- Affected specs: 全新项目，无既有 spec 受影响
- Affected code: 全新代码库，主要模块包括：
  - `src-tauri/`：Rust 后端（数据库、采集、OCR、IPC、日志、隐私）
  - `src/`：React 前端（页面、组件、状态、动画、设计系统）
  - 多窗口：main（主界面）+ mascot（桌面伙伴）

## ADDED Requirements

### Requirement: 项目骨架与基础设施
系统 SHALL 使用 Tauri v2 + Vite 5 + React 18 + TypeScript（strict）从零搭建项目，包含双窗口配置、统一 IPC 信封、rusqlite 数据库（WAL + FTS5 + 迁移）、tracing 日志、Capabilities 权限隔离。

#### Scenario: 项目启动
- **WHEN** 用户启动应用
- **THEN** 主窗口在 2 秒内可交互，伙伴窗口同时显示，空载内存 < 60MB

#### Scenario: IPC 统一信封
- **WHEN** 前端调用任意 Tauri command
- **THEN** 返回 `{ ok: true, data: T }` 或 `{ ok: false, error: string }`，TypeScript 类型完整覆盖

#### Scenario: 数据库迁移
- **WHEN** 应用启动且数据库版本低于代码版本
- **THEN** 自动逐版本执行 up 迁移，更新 `PRAGMA user_version`

### Requirement: 记忆采集层
系统 SHALL 在后台定时截图（默认 30 秒），使用感知哈希去重（相似度 > 90% 跳过 OCR），异步执行 Windows OCR API 识别，监听剪贴板，检测无痕模式并停止截图。

#### Scenario: 截图去重
- **WHEN** 相邻两帧相似度 > 90%
- **THEN** 跳过 OCR，仅记录 segment 元数据，减少 60-70% 无效推理

#### Scenario: 无痕模式保护
- **WHEN** 检测到无痕浏览器窗口
- **THEN** 立即停止截图，桌面伙伴进入 privacy 状态（遮眼动画），记录占位符

#### Scenario: OCR 异步执行
- **WHEN** 截图完成进入 OCR 队列
- **THEN** OCR 在独立 tokio 任务执行，不阻塞主线程和 UI

#### Scenario: 剪贴板监听
- **WHEN** 用户复制内容
- **THEN** 经隐私规则过滤后与当前活跃 Segment 关联存储，超过 5000 字符只取前 500 字符 + 标注

### Requirement: Episode 理解层
系统 SHALL 将原始截图 + OCR 文字自动归并为 Episode，包含 AI 生成的标题（5-15 字）、一句话摘要（30-60 字）、时间段、类型分类、实体识别、待办提取、阻塞项提取，并支持跨天任务连续性关联。

#### Scenario: Episode 自动生成
- **WHEN** 一段连续工作结束（窗口切换或时间间隔 > 阈值）
- **THEN** 自动归并为一个 Episode，AI 生成标题、摘要、类型、实体、待办

#### Scenario: 跨天连续性
- **WHEN** 每天生成 Episode 后
- **THEN** 自动检测与过去 7 天 Episodes 的关联性（项目名相同/实体重叠 >= 2/AI 语义相似度 > 0.8），建立 relatedEpisodeIds

#### Scenario: 待办提取
- **WHEN** OCR 文字出现 TODO/待办/待处理/需要/下一步/`- [ ]`/TODO 注释/Action Item 模式
- **THEN** 自动提取为待办事项存入 todos 列表

### Requirement: 桌面伙伴（Mascot）
系统 SHALL 提供独立透明置顶窗口的桌面伙伴，支持 5 种形象（note/film/copilot/cursor/paper）、5 种功能状态（recording/paused/privacy/ocr_scanning/report_ready）、7 种情绪状态，60fps 微动画，三种气泡模式，右键菜单，拖拽边缘吸附，首次启动引导，行为/定时/事件驱动提醒，免打扰时段。

#### Scenario: 拖拽吸附
- **WHEN** 用户拖拽伙伴松手
- **THEN** 以 300ms 动画吸附到屏幕四个角之一（就近原则），位置跨重启持久化

#### Scenario: 悬停摘要
- **WHEN** 鼠标悬停伙伴 250ms
- **THEN** 展示今日摘要卡片（模式 3 气泡），含今日事件列表 + 专注时长 + 事件数

#### Scenario: 行为驱动提醒
- **WHEN** 连续专注同一应用 >= 25 分钟 / 5 分钟内窗口切换 >= 10 次 / 连续工作 >= 2 小时 / 夜间 22:00 仍在工作
- **THEN** 弹出对应人情味提醒气泡（同类提醒最短间隔 30 分钟，每天上限 8 次）

#### Scenario: 首次启动引导
- **WHEN** 用户首次启动应用
- **THEN** 伙伴从屏幕右下角飞入，依次展示 4 条引导气泡，最后让用户选择形象，选择后伙伴弹跳表示高兴

### Requirement: Today 主界面
系统 SHALL 提供三栏布局的 Today 页面（左侧导航 + 中间主内容 + 右侧详情），中间支持时间轴视图（24h 横轴色块）和列表视图（事件卡片）双模式切换，顶部状态区显示日期/记录状态/快捷操作，右侧详情面板支持内联编辑，顶部常驻快速捕获输入框，底部待办汇总区，全局快捷键 Win+Shift+M 呼出 Ghost Capture。

#### Scenario: 时间轴视图
- **WHEN** 用户查看时间轴视图
- **THEN** 显示 24h 横轴，色块宽度 = 时长，每种 Episode 类型有对应颜色，当前时间实时竖线标注

#### Scenario: 右侧详情面板
- **WHEN** 用户选中某 Episode
- **THEN** 右侧展示完整标题（可内联编辑）、时间段、AI 摘要（可编辑）、涉及实体、话题标签、截图缩略图、待办列表、底部操作按钮

#### Scenario: Ghost Capture
- **WHEN** 用户按下 Win+Shift+M
- **THEN** 弹出快速捕获输入框，支持 # 标签 @ 关联项目，回车保存为手动 Episode，ESC 取消

### Requirement: 搜索
系统 SHALL 提供顶部全宽搜索框，输入即时出结果（300ms 防抖），支持自然语言，支持过滤语法（#编码 @张三 >上周 project:XX），支持时间顺序和相关度排序两种模式，支持实体时间线视图，支持自然语言时间搜索。

#### Scenario: 即时搜索
- **WHEN** 用户输入搜索词
- **THEN** 300ms 防抖后出结果，< 500ms 响应，关键词高亮，显示匹配维度说明

#### Scenario: 自然语言时间搜索
- **WHEN** 用户输入「上周五下午」「上个月做了什么」「最近一次和张三开会」
- **THEN** 自动转换为时间范围过滤并返回对应 Episodes

### Requirement: 报告生成
系统 SHALL 提供 5 种报告模板（enhanced/concise/standup/okr/structured），流式输出（逐字显示），富文本编辑器支持修改，支持复制到剪贴板/导出 Markdown/导出 Word，报告历史列表 + 两份报告对比。

#### Scenario: 流式生成
- **WHEN** 用户点击「开始生成」
- **THEN** 内容逐字流式出现（不是等待后突然全部出现），< 10 秒完成

#### Scenario: 报告对比
- **WHEN** 用户选中两份历史报告
- **THEN** 左右并排展示，高亮新增/消失内容

### Requirement: 知识库（Wiki）
系统 SHALL 提供 6 种知识卡片类型（person/project/decision/meeting/topic/skill），AI 自动提炼，审核队列（确认/编辑后确认/忽略），双链关联，健康度标记（> 30 天未引用标记待复核），Obsidian .md 文件夹导入（解析 [[双链]]）。

#### Scenario: 审核队列
- **WHEN** AI 生成新知识卡片
- **THEN** 进入审核队列，用户可 ✅ 确认入库 / ✏️ 编辑后确认 / ❌ 忽略

#### Scenario: Obsidian 导入
- **WHEN** 用户导入 .md 文件夹
- **THEN** 解析 [[双链]] 语法，导入内容先进审核队列，人工逐条确认后入库

### Requirement: 主动洞察（Insights）
系统 SHALL 提供洞察卡片流（专注规律/时间分配/碎片化预警/进步里程碑/异常检测/目标对齐），周目标设定（最多 3 条自然语言，AI 每天标注相关度，周末展示完成度评分），数据仪表盘（本周工作时长分布/本月项目占比/知识库成长曲线/AI Token 消耗估算）。

#### Scenario: 周目标对齐
- **WHEN** 用户设定本周目标
- **THEN** AI 每天自动标注相关度，周末展示完成度评分

### Requirement: 日历（Calendar）
系统 SHALL 提供月视图，每天格子内展示工作摘要（1-2 行），格子颜色深浅 = 工作量，点击某天右侧展示当天 Episodes 列表，快速导航（今日/本周/上周/本月）。

### Requirement: 图谱（Graph）
系统 SHALL 提供图谱可视化，节点 = Wiki 卡片，边 = 被同一 Episode 提及，节点大小 = 引用次数，颜色 = Wiki 类型，支持滚轮缩放/拖拽平移/悬停 tooltip/点击详情/搜索高亮。

### Requirement: 设置（Settings）
系统 SHALL 提供完整设置页面：AI 配置（API Key/Base URL/模型/连接测试）、桌面伙伴（启用/形象/大小/提醒/免打扰）、记录设置（截图间隔/保存/保留天数/路径）、隐私规则（列表/添加删除/启用）、OCR 设置（引擎状态/模型切换/测试）、数据管理（使用量/清理/导出 JSON）、导入（Obsidian）。

#### Scenario: API Key 加密存储
- **WHEN** 用户配置 API Key
- **THEN** 通过 tauri-plugin-stronghold 或 Windows Credential Manager 加密存储，不明文写入数据库

### Requirement: 设计系统
系统 SHALL 遵循统一设计系统：颜色（主色 #5B6AF0 / 辅色 #10B981 / 警示 #F59E0B / 危险 #EF4444 等）、间距（4px 基础单位）、字体（系统字体栈）、圆角、阴影、动画规格，支持深色模式（跟随系统），命令面板（Ctrl+K）。

#### Scenario: 深色模式
- **WHEN** 系统切换到深色模式
- **THEN** 应用自动跟随切换（背景 #0F172A / 表面 #1E293B / 文字 #F1F5F9 等）

#### Scenario: 命令面板
- **WHEN** 用户按下 Ctrl+K
- **THEN** 弹出命令面板，可快速跳转到任意页面/执行常用操作
