# Checklist

## 阶段 0 · 项目骨架与基础设施
- [ ] 项目脚手架完整（Electron 31 + Vite 5 + React 18 + TypeScript strict + pnpm）
- [ ] package.json scripts 包含 dev/build/preview/lint/typecheck/test
- [ ] tsconfig.json strict 模式 + paths 别名（@/ @shared/ @electron/）
- [ ] vite.config.ts 配置主进程与 preload 构建入口
- [ ] electron-builder.yml 配置 NSIS Windows 安装包
- [ ] 目录结构完整（electron/main, electron/preload, src/, shared/, resources/, migrations/）
- [ ] 主进程入口创建主窗口与伙伴窗口、应用生命周期、单实例锁
- [ ] Preload 脚本 contextBridge 暴露类型化 API，nodeIntegration: false
- [ ] 统一日志模块写入 userData/logs/，生产不输出 debug，错误含时间戳/模块/堆栈
- [ ] IPC 框架：`模块:操作` 命名、Zod 校验、`{ok,data}/{ok,error}` 信封、Preload 类型化
- [ ] 数据库 WAL 模式 + PRAGMA user_version 迁移系统
- [ ] 初始迁移 v1 创建所有核心表 + 3 个 FTS5 虚拟表 + 同步触发器
- [ ] shared/ Zod schema 与 TS 类型覆盖所有 IPC 入参/返回值/数据库行

## 阶段 1 · 采集层（P0）
- [ ] 截图采集：定时器（默认 30s 可配）、active window 检测、长边 1280px 缩放
- [ ] 感知哈希去重：相似度 > 90% 跳过 OCR
- [ ] OCR Worker Thread：worker_threads + PaddleOCR koffi FFI，不阻塞主进程
- [ ] OCR 模型切换：tiny/small
- [ ] OCR 失败记录原因不影响整体流程
- [ ] 无痕模式检测：停止截图 + 占位符 segment + 伙伴 privacy 状态
- [ ] 剪贴板监听：隐私过滤、>5000 字符截断标注、关联当前 Segment
- [ ] 隐私规则引擎：应用名/窗口标题/URL 关键词匹配跳过
- [ ] capture 模块 IPC 完整（start/stop/pause/resume/status、segment:list/query/delete）

## 阶段 2 · 理解层（P0）
- [ ] AI 客户端：OpenAI 兼容、流式输出、safeStorage 加密 API Key
- [ ] Episode 自动归并：连续 segments 按时间窗口 + 应用/项目聚类
- [ ] Episode AI 生成：标题 5-15 字、摘要 30-60 字、类型分类、实体识别
- [ ] 待办提取：正则 + AI 双重，写入 todos
- [ ] 阻塞项提取：写入 blockers
- [ ] 跨天连续性：relatedEpisodeIds 关联（项目名/实体重叠 ≥2/语义相似度 > 0.8）
- [ ] episode 模块 IPC 完整（list/get/create/update/delete、todo:toggle/add/remove）

## 阶段 3 · 主界面 Today（P0）
- [ ] 设计系统 CSS 变量（颜色/间距/字体/圆角/阴影/动画 token）+ 深色模式变量
- [ ] 基础组件库完整（Button/Input/Card/Badge/Tooltip/Dialog/Popover/Select/Toast/EmptyState/Skeleton）
- [ ] 应用 Shell 三栏布局 + 左侧导航栏图标路由 + 顶部标题栏
- [ ] Today 顶部状态区：日期、录制状态切换、统计数字实时更新、生成报告按钮
- [ ] 时间轴视图：24h 横轴、类型色块、悬停 tooltip、点击选中、当前时间竖线、空白点击添加
- [ ] 列表视图：倒序事件卡片、彩色竖线、··· 菜单（编辑/标记重要/删除/加入报告）
- [ ] 右侧详情面板：标题内联编辑、时间段、摘要编辑、实体确认/修正/忽略、标签、截图缩略图放大、待办勾选、底部操作
- [ ] 快速捕获输入框：# 标签、@ 项目、回车保存 source: 'manual'
- [ ] 全局快捷键 Win+Shift+M 呼出快速捕获
- [ ] 待办汇总区：AI 提取 + 手动添加、勾选完成划线当日保留、全部完成按钮
- [ ] Zustand stores 完整（episode/settings/mascot/report/wiki/search）

## 阶段 4 · 桌面伙伴（P0）
- [ ] 伙伴窗口：透明、置顶、无边框、点击穿透、80×80px、右下角定位
- [ ] 5 种形象占位（emoji + 圆形背景色）
- [ ] 5 种功能状态视觉（recording/paused/privacy/ocr_scanning/report_ready）
- [ ] 微动画系统（呼吸/漂浮/扫描/弹跳/入场/点击反馈/拖拽旋转，60fps）
- [ ] 气泡系统三种模式（纯文字/带按钮/今日摘要卡片，磨砂玻璃，弹性 250ms）
- [ ] 交互行为（悬停放大+摘要卡片、左键跳转、右键菜单、右键双击快速捕获）
- [ ] 拖拽与边缘吸附（±5° 旋转、300ms 吸附四角、位置持久化）
- [ ] 首次启动引导（飞入 + 4 条气泡 + 形象选择 + 变换弹跳）
- [ ] mascot 模块 IPC 完整

## 阶段 5 · 报告模块（P0）
- [ ] 5 种报告模板定义（enhanced/concise/standup/okr/structured）
- [ ] 报告生成页面：模板选择、补充说明、流式输出、富文本编辑器修改
- [ ] 报告操作：复制到剪贴板、导出 Markdown、重新生成
- [ ] report 模块 IPC 完整
- [ ] 报告数据持久化（reports 表 + 历史列表）

## 阶段 6 · 设置模块（P0）
- [ ] AI 配置页（API Key 密码框、Base URL、模型名、连接测试 ping+token）
- [ ] 桌面伙伴配置页（启用、形象预览、大小滑块、提醒配置）
- [ ] 记录设置页（截图间隔、保存开关+保留天数+路径、整屏降级）
- [ ] 隐私规则页（列表、增删、启用开关、今日隐私查看）
- [ ] OCR 设置页（状态+引导、模型切换、一键测试）
- [ ] 数据管理页（使用量统计、清理指定日期、清除所有数据二次确认+输入「确认删除」、导出 JSON）
- [ ] settings 模块 IPC 完整

## 阶段 7 · 桌面伙伴增强（P1）
- [ ] 7 种情绪状态机（叠加功能状态影响动画与语气）
- [ ] 行为驱动提醒（专注 25min、碎片检测、连续 2h、夜间 22:00）
- [ ] 定时提醒（17:30 日报、周五 17:00 周报、09:00 问候）
- [ ] 事件驱动提醒（新项目、知识审核 ≥3、新技能卡）
- [ ] 频率限制（同类 30min、每天 8 次、免打扰时段）
- [ ] 提醒调度器（后台定时 + 实时检测 + 事件订阅）

## 阶段 8 · 搜索增强（P1）
- [ ] 搜索页面（全宽搜索框、300ms 防抖、结果列表、时间/相关度 Tab、关键词高亮、匹配维度）
- [ ] 快捷过滤语法（#标签/@人物/>时间/project:项目）
- [ ] 实体时间线视图（@人名、project: 历程）
- [ ] 自然语言时间搜索（上周五下午/上个月/最近一次和张三开会）
- [ ] search 模块 IPC 完整

## 阶段 9 · 跨天连续性（P1）
- [ ] Today 页面「昨天也在做这件事」提示

## 阶段 10 · 知识库（P1）
- [ ] Wiki 卡片数据模型与 DAO（6 类型、backlinks、last_cited_at、status）
- [ ] Wiki 列表页（分类过滤、搜索、卡片网格、待审核角标）
- [ ] Wiki 详情页（类型、最近活动、描述、相关记忆、关联卡片双链）
- [ ] 审核队列（确认/编辑后确认/忽略）
- [ ] 知识卡片健康度（>30 天未引用「待复核」橙色角标）
- [ ] AI 自动提炼知识卡片
- [ ] wiki 模块 IPC 完整

## 阶段 11 · 报告历史与对比（P1）
- [ ] 报告历史列表（按日期分组、日期/模板/字数/状态）
- [ ] 两份报告对比（左右并排、高亮新增/消失）
- [ ] 定时提醒触发报告生成（伙伴气泡 + 操作按钮）

## 阶段 12 · 日历与洞察（P1）
- [ ] Calendar 月视图（工作摘要、颜色深浅=工作量、点击当日 Episodes、无记录提示）
- [ ] Calendar 快速导航（今日/本周/上周/本月、跳转该天 Today 只读）
- [ ] Insights 洞察卡片流（6 类洞察）
- [ ] Insights 数据仪表盘（条形图/饼图/折线图/Token 估算）
- [ ] calendar/insights 模块 IPC 完整

## 阶段 13 · 图谱（P2）
- [ ] Graph 数据构建（节点/边/大小/粗细）
- [ ] Graph 可视化（力导向、类型颜色、缩放、拖拽）
- [ ] Graph 交互（悬停 tooltip、点击详情、悬停边、搜索高亮）
- [ ] graph 模块 IPC 完整

## 阶段 14 · P2 增强功能
- [ ] 命令面板（Ctrl+K、跳转页面、执行操作、模糊搜索）
- [ ] 深色模式完整适配（跟随 nativeTheme、所有组件 CSS 变量）
- [ ] Obsidian 笔记导入（.md 文件夹、[[双链]] 解析、进审核队列）
- [ ] 导出为 Word 格式（.docx）
- [ ] AI Token 消耗统计仪表盘
- [ ] 周目标设定 + AI 目标对齐度评分（最多 3 条、每天标注相关、周末完成度）
- [ ] 进步里程碑检测

## 阶段 15 · 测试与验证
- [ ] 核心逻辑单元测试（Vitest：感知哈希、Episode 归并、待办提取、隐私规则、IPC schema、迁移）
- [ ] lint 通过
- [ ] typecheck 通过
- [ ] P0-P2 所有功能检查点验证通过

## 跨阶段非功能验证
- [ ] 启动到主窗口可交互 < 3 秒
- [ ] 搜索响应 < 500ms
- [ ] 报告流式生成 < 10 秒
- [ ] 所有动画 60fps 无肉眼可见卡顿
- [ ] sandbox: true + contextIsolation: true + nodeIntegration: false
- [ ] API Key 使用 safeStorage 加密存储
- [ ] 生产环境 CSP 不含 localhost
- [ ] 应用退出前 PRAGMA wal_checkpoint(TRUNCATE)
- [ ] 所有数据本地存储，绝不上传云端
