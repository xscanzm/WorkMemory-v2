# Tasks

## 阶段 0 · 项目骨架与基础设施

- [ ] Task 0.1: 初始化项目脚手架（Electron 31 + Vite 5 + React 18 + TypeScript strict + pnpm）
  - [ ] SubTask 0.1.1: 创建 package.json，配置 scripts（dev/build/preview/lint/typecheck/test）
  - [ ] SubTask 0.1.2: 配置 tsconfig.json（strict 模式，paths 别名 @/ @shared/ @electron/）
  - [ ] SubTask 0.1.3: 配置 vite.config.ts（electron 主进程与 preload 构建入口）
  - [ ] SubTask 0.1.4: 配置 electron-builder.yml（NSIS Windows 安装包）
  - [ ] SubTask 0.1.5: 创建 .gitignore / .editorconfig / eslint 配置
- [ ] Task 0.2: 安装核心依赖（react/react-dom/zustand/@radix-ui/* /framer-motion/better-sqlite3/zod/vitest）
- [ ] Task 0.3: 搭建目录结构（electron/main, electron/preload, src/, shared/, resources/, migrations/）
- [ ] Task 0.4: 实现主进程入口（创建主窗口与伙伴窗口、应用生命周期、单实例锁）
- [ ] Task 0.5: 实现 Preload 脚本（contextBridge 暴露类型化 API，禁用 nodeIntegration）
- [ ] Task 0.6: 实现统一日志模块（写入 userData/logs/，生产不输出 debug，错误含时间戳/模块/堆栈）
- [ ] Task 0.7: 实现统一 IPC 框架（`模块:操作` 命名、Zod 校验、`{ok,data}/{ok,error}` 信封、Preload 类型化暴露）
- [ ] Task 0.8: 实现数据库初始化与迁移系统（better-sqlite3 WAL、PRAGMA user_version、迁移 runner）
- [ ] Task 0.9: 编写初始迁移 v1（创建 segments/episodes/clean_episodes/wiki_pages/reports/privacy_rules/distill_runs/weekly_patterns/skill_cards/user_goals 表 + fts_segments/fts_episodes/fts_wiki FTS5 虚拟表 + 触发器同步）
- [ ] Task 0.10: 实现 shared/ Zod schema 与 TS 类型（所有 IPC 入参/返回值、数据库行类型）

## 阶段 1 · 采集层（P0）

- [ ] Task 1.1: 实现截图采集模块（定时器、active window 检测、长边 1280px 缩放、保存到 userData）
- [ ] Task 1.2: 实现感知哈希去重（pHash 算法，相似度 > 90% 跳过 OCR）
- [ ] Task 1.3: 实现 OCR Worker Thread（worker_threads + PaddleOCR koffi FFI 调用，tiny/small 模型切换，结果队列回传主进程）
- [ ] Task 1.4: 实现 OCR 调度器（队列管理、失败重试与原因记录、写入 segments.ocr_text/ocr_blocks/ocr_confidence）
- [ ] Task 1.5: 实现无痕模式检测（浏览器窗口标题/进程检测，触发时停止截图 + 占位符 segment + 伙伴 privacy 状态）
- [ ] Task 1.6: 实现剪贴板监听（内容变化事件、隐私规则过滤、>5000 字符截断、关联当前 Segment）
- [ ] Task 1.7: 实现隐私规则引擎（应用名/窗口标题/URL 关键词匹配，匹配时跳过记录）
- [ ] Task 1.8: 实现 capture 模块 IPC（capture:start/stop/pause/resume/status、segment:list/query/delete）

## 阶段 2 · 理解层（P0）

- [ ] Task 2.1: 实现 AI 客户端封装（OpenAI 兼容 API、流式输出、错误处理、safeStorage 加密存储 API Key）
- [ ] Task 2.2: 实现 Episode 自动归并算法（连续 segments 按时间窗口 + 应用/项目聚类归并）
- [ ] Task 2.3: 实现 Episode AI 生成（标题 5-15 字、摘要 30-60 字、类型分类、实体识别）
- [ ] Task 2.4: 实现待办提取（正则 + AI 双重提取，写入 todos 字段）
- [ ] Task 2.5: 实现阻塞项提取（写入 blockers 字段）
- [ ] Task 2.6: 实现跨天连续性检测（与过去 7 天 Episodes 关联，建立 relatedEpisodeIds）
- [ ] Task 2.7: 实现 episode 模块 IPC（episode:list/get/create/update/delete、todo:toggle/add/remove）

## 阶段 3 · 主界面 Today（P0）

- [ ] Task 3.1: 实现设计系统基础（CSS 变量主题、间距/字体/圆角/阴影 token、深色模式变量）
- [ ] Task 3.2: 实现基础组件库（Button/Input/Card/Badge/Tooltip/Dialog/Popover/Select/Toast/EmptyState/Skeleton）
- [ ] Task 3.3: 实现应用 Shell（三栏布局、左侧导航栏图标路由、顶部标题栏）
- [ ] Task 3.4: 实现 Today 页面顶部状态区（日期、录制状态切换、统计数字实时更新、生成报告按钮）
- [ ] Task 3.5: 实现时间轴视图（24h 横轴、类型色块、悬停 tooltip、点击选中、当前时间竖线、空白点击添加）
- [ ] Task 3.6: 实现列表视图（倒序事件卡片、彩色竖线、··· 菜单）
- [ ] Task 3.7: 实现右侧详情面板（标题内联编辑、时间段、摘要编辑、实体确认/修正/忽略、标签、截图缩略图放大、待办勾选、底部操作）
- [ ] Task 3.8: 实现快速捕获输入框（# 标签、@ 项目、回车保存、source: 'manual'）
- [ ] Task 3.9: 实现全局快捷键 Win+Shift+M 呼出快速捕获
- [ ] Task 3.10: 实现待办汇总区（AI 提取 + 手动添加、勾选完成划线当日保留、全部完成按钮）
- [ ] Task 3.11: 实现 Zustand stores（episodeStore/settingsStore/mascotStore/reportStore/wikiStore/searchStore）

## 阶段 4 · 桌面伙伴（P0）

- [ ] Task 4.1: 实现伙伴窗口（透明、置顶、无边框、点击穿透、80×80px、右下角定位）
- [ ] Task 4.2: 实现 5 种形象占位（emoji + 圆形背景色：note/film/copilot/cursor/paper）
- [ ] Task 4.3: 实现 5 种功能状态视觉（recording 绿点呼吸/paused 灰度/privacy 遮眼紫色/ocr_scanning 扫描/report_ready 金色高亮角标）
- [ ] Task 4.4: 实现微动画系统（呼吸/漂浮/扫描/弹跳/入场/点击反馈/拖拽旋转，Framer Motion，60fps）
- [ ] Task 4.5: 实现气泡系统（三种模式：纯文字/带按钮/今日摘要卡片，磨砂玻璃，弹性出现 250ms，自动消失逻辑）
- [ ] Task 4.6: 实现交互行为（悬停放大+摘要卡片、左键单击跳转、右键上下文菜单、右键双击快速捕获）
- [ ] Task 4.7: 实现拖拽与边缘吸附（按住拖动 ±5° 旋转、松手 300ms 吸附四角、位置持久化）
- [ ] Task 4.8: 实现首次启动引导（飞入入场 + 4 条气泡依次 + 形象选择 + 变换弹跳）
- [ ] Task 4.9: 实现 mascot 模块 IPC（mascot:setForm/setSize/setPosition/getState、bubble:show/dismiss）

## 阶段 5 · 报告模块（P0）

- [ ] Task 5.1: 实现 5 种报告模板定义（enhanced/concise/standup/okr/structured 的 prompt 与输出格式）
- [ ] Task 5.2: 实现报告生成页面（模板卡片选择、补充说明输入、流式输出展示、富文本编辑器修改）
- [ ] Task 5.3: 实现报告操作（复制到剪贴板、导出 Markdown、重新生成）
- [ ] Task 5.4: 实现 report 模块 IPC（report:generate/list/get/update/delete/export）
- [ ] Task 5.5: 实现报告数据持久化（reports 表 + 历史列表）

## 阶段 6 · 设置模块（P0）

- [ ] Task 6.1: 实现 AI 配置页（API Key 密码框显示/隐藏、Base URL、模型名、连接测试展示 ping 与 token）
- [ ] Task 6.2: 实现桌面伙伴配置页（启用开关、形象选择预览、大小滑块 60-120px、提醒配置：主动提醒开关/免打扰时段/日报提醒时间/周报提醒时间）
- [ ] Task 6.3: 实现记录设置页（截图间隔滑块 10-120s、截图保存开关+保留天数 1-7+保存路径选择器、整屏降级开关）
- [ ] Task 6.4: 实现隐私规则页（规则列表、增删、每条启用开关、今日隐私保护查看）
- [ ] Task 6.5: 实现 OCR 设置页（当前状态+安装引导、模型切换 tiny/small、一键测试识别效果）
- [ ] Task 6.6: 实现数据管理页（使用量统计 Episodes/截图/数据库大小、清理指定日期、清除所有数据二次确认+输入「确认删除」、导出 JSON）
- [ ] Task 6.7: 实现 settings 模块 IPC（settings:get/update、privacy:list/add/remove/toggle、data:stats/clearByDate/clearAll/export）

## 阶段 7 · 桌面伙伴增强（P1）

- [ ] Task 7.1: 实现 7 种情绪状态机（happy/focused/concerned/curious/sleepy/proud/neutral，叠加功能状态影响动画速度与气泡语气）
- [ ] Task 7.2: 实现行为驱动提醒（专注 25min、5min 切换 ≥10 次、连续 2h、夜间 22:00）
- [ ] Task 7.3: 实现定时提醒（17:30 日报、周五 17:00 周报、09:00 问候）
- [ ] Task 7.4: 实现事件驱动提醒（新项目发现、知识审核 ≥3 条、新技能卡）
- [ ] Task 7.5: 实现频率限制（同类最短间隔 30 分钟、每天上限 8 次、免打扰时段）
- [ ] Task 7.6: 实现提醒调度器（后台定时 + 实时检测 + 事件订阅）

## 阶段 8 · 搜索增强（P1）

- [ ] Task 8.1: 实现搜索页面（顶部全宽搜索框、300ms 防抖、结果列表、时间/相关度 Tab 切换、关键词高亮、匹配维度说明）
- [ ] Task 8.2: 实现快捷过滤语法解析（#标签/@人物/>时间/project:项目）
- [ ] Task 8.3: 实现实体时间线视图（@人名 展示关联 Episodes 时间轴、project: 展示项目历程）
- [ ] Task 8.4: 实现自然语言时间搜索（「上周五下午」「上个月做了什么」「最近一次和张三开会」时间语义解析）
- [ ] Task 8.5: 实现 search 模块 IPC（search:query、search:entityTimeline）

## 阶段 9 · 跨天连续性（P1）

- [ ] Task 9.1: 实现 Today 页面「昨天也在做这件事」提示（基于 relatedEpisodeIds）

## 阶段 10 · 知识库（P1）

- [ ] Task 10.1: 实现 Wiki 卡片数据模型与 DAO（6 类型、backlinks、last_cited_at、status: pending/confirmed/ignored）
- [ ] Task 10.2: 实现 Wiki 列表页（分类过滤、搜索、卡片网格、置顶待审核区域角标）
- [ ] Task 10.3: 实现 Wiki 详情页（类型、最近活动、描述、相关记忆、关联卡片双链）
- [ ] Task 10.4: 实现审核队列（确认入库/编辑后确认/忽略）
- [ ] Task 10.5: 实现知识卡片健康度（>30 天未引用标记「待复核」橙色角标）
- [ ] Task 10.6: 实现 AI 自动提炼知识卡片（从 Episodes 提炼 person/project/decision/meeting/topic/skill）
- [ ] Task 10.7: 实现 wiki 模块 IPC（wiki:list/get/create/update/delete/confirm/ignore、review:queue）

## 阶段 11 · 报告历史与对比（P1）

- [ ] Task 11.1: 实现报告历史列表（按日期分组、显示日期/模板/字数/状态）
- [ ] Task 11.2: 实现两份报告对比（左右并排、高亮新增/消失内容）
- [ ] Task 11.3: 实现定时提醒触发报告生成（伙伴气泡 + 操作按钮）

## 阶段 12 · 日历与洞察（P1）

- [ ] Task 12.1: 实现 Calendar 月视图（每天格子工作摘要、颜色深浅=工作量、点击右侧当日 Episodes、无记录提示）
- [ ] Task 12.2: 实现 Calendar 快速导航（今日/本周/上周/本月、点击跳转该天 Today 只读视图）
- [ ] Task 12.3: 实现 Insights 洞察卡片流（专注规律/时间分配/碎片化预警/进步里程碑/异常检测/目标对齐）
- [ ] Task 12.4: 实现 Insights 数据仪表盘（本周工时条形图、本月项目饼图、知识库成长折线图、AI Token 消耗估算）
- [ ] Task 12.5: 实现 calendar/insights 模块 IPC

## 阶段 13 · 图谱（P2）

- [ ] Task 13.1: 实现 Graph 图谱数据构建（节点=Wiki 卡片、边=共同 Episode 提及、节点大小=引用次数、边粗细=共同出现次数）
- [ ] Task 13.2: 实现 Graph 可视化（力导向布局、节点颜色按类型、滚轮缩放、拖拽平移）
- [ ] Task 13.3: 实现 Graph 交互（悬停节点 tooltip、点击右侧详情、悬停边显示共同出现次数+最近 Episode、搜索高亮）
- [ ] Task 13.4: 实现 graph 模块 IPC

## 阶段 14 · P2 增强功能

- [ ] Task 14.1: 实现命令面板（Ctrl+K、快速跳转页面、执行常用操作、模糊搜索）
- [ ] Task 14.2: 实现深色模式完整适配（跟随 nativeTheme、所有组件 CSS 变量切换）
- [ ] Task 14.3: 实现 Obsidian 笔记导入（.md 文件夹、[[双链]] 解析、导入内容进审核队列）
- [ ] Task 14.4: 实现导出为 Word 格式（报告导出 .docx）
- [ ] Task 14.5: 实现数据管理仪表盘 AI Token 消耗统计（Insights 页集成）
- [ ] Task 14.6: 实现周目标设定 + AI 目标对齐度评分（Insights 页顶部、最多 3 条、每天标注相关 Episode、周末完成度评分）
- [ ] Task 14.7: 实现进步里程碑检测（「这是你最高效的一周」）

## 阶段 15 · 测试与验证

- [ ] Task 15.1: 编写核心逻辑单元测试（Vitest：感知哈希、Episode 归并、待办提取、隐私规则、IPC schema 校验、迁移系统）
- [ ] Task 15.2: 运行 lint 与 typecheck 通过
- [ ] Task 15.3: 验证 P0-P2 所有功能检查点

# Task Dependencies
- Task 0.*（骨架）是所有后续任务的前置
- Task 1.*（采集）依赖 Task 0.8/0.9（数据库）
- Task 2.*（理解层）依赖 Task 1.*（采集产出 segments）
- Task 3.*（Today）依赖 Task 2.*（episodes 数据）与 Task 0.10（类型）
- Task 4.*（伙伴）依赖 Task 0.4（主进程窗口）
- Task 5.*（报告）依赖 Task 2.*（episodes）与 Task 2.1（AI 客户端）
- Task 6.*（设置）依赖 Task 0.7（IPC）与 Task 1.7（隐私规则）
- Task 7.*（伙伴增强）依赖 Task 4.*（伙伴基础）
- Task 8.*（搜索）依赖 Task 0.9（FTS5）与 Task 2.*（episodes）
- Task 9.*（跨天）依赖 Task 2.6（relatedEpisodeIds）
- Task 10.*（Wiki）依赖 Task 2.*（episodes 实体）与 Task 2.1（AI）
- Task 11.*（报告历史）依赖 Task 5.*（报告）
- Task 12.*（日历/洞察）依赖 Task 2.* 与 Task 10.*（Wiki 健康度）
- Task 13.*（图谱）依赖 Task 10.*（Wiki）
- Task 14.*（P2）依赖对应基础模块
- Task 15.*（测试）依赖所有功能模块完成
