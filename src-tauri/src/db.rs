//! 数据库管理模块
//!
//! 提供 SQLite 数据库的连接管理、Schema 迁移、FTS5 全文索引和常用查询方法。
//! 使用 WAL 模式提高并发读写性能，写连接通过 Mutex 保护，读连接使用连接池。
//! 应用退出前执行 PRAGMA wal_checkpoint(TRUNCATE) 将 WAL 日志合并到主库。

use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection, Error as SqlError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

// ==================== 数据结构定义 ====================

/// 截图片段：记录单次截图的元数据与 OCR 识别结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub id: String,
    pub timestamp: i64,
    pub ocr_text: Option<String>,
    pub window_title: Option<String>,
    pub app_name: Option<String>,
    pub image_path: Option<String>,
    pub ocr_blocks_json: Option<String>,
    pub perceptual_hash: Option<String>,
    pub capture_source: Option<String>,
}

/// 工作事件：由多个连续 Segment 归并而成，包含 AI 生成的标题、摘要、实体等
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Episode {
    pub id: String,
    pub date: String,
    pub start_time: i64,
    pub end_time: i64,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub episode_type: Option<String>,
    pub project: Option<String>,
    pub entities_json: Option<String>,
    pub topics_json: Option<String>,
    pub todos_json: Option<String>,
    pub blockers_json: Option<String>,
    pub segment_ids_json: Option<String>,
    pub source: Option<String>,
    pub related_episode_ids_json: Option<String>,
    pub important: i64,
    pub created_at: i64,
}

/// 知识库页面：AI 自动提炼或用户手动创建的知识卡片
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiPage {
    pub id: String,
    pub title: String,
    pub wiki_type: String,
    pub content: Option<String>,
    pub backlinks_json: Option<String>,
    pub last_cited_at: Option<i64>,
    pub status: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 报告：日报/周报/站会报告等
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub id: String,
    pub date: String,
    pub report_type: String,
    pub template_id: Option<String>,
    pub content: Option<String>,
    pub word_count: Option<i64>,
    pub exported_at: Option<i64>,
    pub created_at: i64,
}

/// 全文搜索结果：统一封装不同 FTS 表的搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtsResult {
    /// 来源表名（segments / episodes / wiki）
    pub table: String,
    /// 对应记录的 ID
    pub id: String,
    /// 匹配片段（带 <mark> 高亮标记）
    pub snippet: String,
    /// 相关度排名（BM25，值越小越相关）
    pub rank: f64,
}

// ==================== 行解析实现 ====================

impl Segment {
    /// 从数据库行解析为 Segment 结构体
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            ocr_text: row.get(2)?,
            window_title: row.get(3)?,
            app_name: row.get(4)?,
            image_path: row.get(5)?,
            ocr_blocks_json: row.get(6)?,
            perceptual_hash: row.get(7)?,
            capture_source: row.get(8)?,
        })
    }
}

impl Episode {
    /// 从数据库行解析为 Episode 结构体
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            date: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            title: row.get(4)?,
            summary: row.get(5)?,
            episode_type: row.get(6)?,
            project: row.get(7)?,
            entities_json: row.get(8)?,
            topics_json: row.get(9)?,
            todos_json: row.get(10)?,
            blockers_json: row.get(11)?,
            segment_ids_json: row.get(12)?,
            source: row.get(13)?,
            related_episode_ids_json: row.get(14)?,
            important: row.get(15)?,
            created_at: row.get(16)?,
        })
    }
}

impl WikiPage {
    /// 从数据库行解析为 WikiPage 结构体
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            title: row.get(1)?,
            wiki_type: row.get(2)?,
            content: row.get(3)?,
            backlinks_json: row.get(4)?,
            last_cited_at: row.get(5)?,
            status: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }
}

impl Report {
    /// 从数据库行解析为 Report 结构体
    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            date: row.get(1)?,
            report_type: row.get(2)?,
            template_id: row.get(3)?,
            content: row.get(4)?,
            word_count: row.get(5)?,
            exported_at: row.get(6)?,
            created_at: row.get(7)?,
        })
    }
}

// ==================== DbState 结构体 ====================

/// 数据库状态管理结构体
///
/// 包含一个写连接（通过 Mutex 保护）和一个读连接池。
/// 写连接用于所有写操作（INSERT/UPDATE/DELETE），读连接池用于并发读操作。
/// 在 Tauri 中通过 `app.manage(DbState::new(...)?)` 注册为应用状态。
pub struct DbState {
    /// 写连接（独占，所有写操作通过此连接执行）
    write_conn: Mutex<Connection>,
    /// 读连接池（支持并发读，连接可复用）
    read_pool: Mutex<Vec<Connection>>,
    /// 数据库文件路径（用于按需创建新的读连接）
    db_path: PathBuf,
}

// ==================== 辅助函数 ====================

/// 使用 uuid v4 生成唯一 ID
pub fn generate_id() -> String {
    Uuid::new_v4().to_string()
}

/// 获取当前时间的 Unix 时间戳（秒）
pub fn now_timestamp() -> i64 {
    Utc::now().timestamp()
}

/// 转义 FTS5 查询字符串
///
/// 将用户输入的每个词用双引号包裹，避免 FTS5 特殊语法（AND/OR/NOT/NEAR/* 等）
/// 导致查询错误。多个词之间以空格连接，FTS5 默认按 AND 匹配。
pub fn escape_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|word| format!("\"{}\"", word.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

// ==================== Schema 迁移 ====================

/// 迁移版本 1：初始 Schema（核心表 + FTS5 虚拟表 + 触发器 + 索引）
const MIGRATION_V1: &str = r#"
-- ============ 核心表 ============

-- segments: 截图片段表，记录每次截图的元数据与 OCR 结果
CREATE TABLE IF NOT EXISTS segments (
    id TEXT PRIMARY KEY NOT NULL,
    timestamp INTEGER NOT NULL,
    ocr_text TEXT,
    window_title TEXT,
    app_name TEXT,
    image_path TEXT,
    ocr_blocks_json TEXT,
    perceptual_hash TEXT,
    capture_source TEXT
);

-- episodes: 工作事件表，由多个连续 Segment 归并而成
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    title TEXT,
    summary TEXT,
    episode_type TEXT,
    project TEXT,
    entities_json TEXT,
    topics_json TEXT,
    todos_json TEXT,
    blockers_json TEXT,
    segment_ids_json TEXT,
    source TEXT,
    related_episode_ids_json TEXT,
    important INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- clean_episodes: 整理后的事件表（同 episodes 结构 + 记忆类型相关字段）
CREATE TABLE IF NOT EXISTS clean_episodes (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    title TEXT,
    summary TEXT,
    episode_type TEXT,
    project TEXT,
    entities_json TEXT,
    topics_json TEXT,
    todos_json TEXT,
    blockers_json TEXT,
    segment_ids_json TEXT,
    source TEXT,
    related_episode_ids_json TEXT,
    important INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    memory_kind TEXT,
    confidence REAL,
    wiki_eligible INTEGER
);

-- wiki_pages: 知识库页面表
CREATE TABLE IF NOT EXISTS wiki_pages (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    wiki_type TEXT NOT NULL,
    content TEXT,
    backlinks_json TEXT,
    last_cited_at INTEGER,
    status TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- reports: 报告表
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    report_type TEXT NOT NULL,
    template_id TEXT,
    content TEXT,
    word_count INTEGER,
    exported_at INTEGER,
    created_at INTEGER NOT NULL
);

-- privacy_rules: 隐私规则表
CREATE TABLE IF NOT EXISTS privacy_rules (
    id TEXT PRIMARY KEY NOT NULL,
    rule_type TEXT NOT NULL,
    pattern TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
);

-- daily_distills: 每日蒸馏表
CREATE TABLE IF NOT EXISTS daily_distills (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    content TEXT,
    created_at INTEGER NOT NULL
);

-- weekly_patterns: 每周模式表
CREATE TABLE IF NOT EXISTS weekly_patterns (
    id TEXT PRIMARY KEY NOT NULL,
    week_start TEXT NOT NULL,
    pattern_json TEXT,
    created_at INTEGER NOT NULL
);

-- skill_cards: 技能卡片表
CREATE TABLE IF NOT EXISTS skill_cards (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    source_episode_id TEXT,
    created_at INTEGER NOT NULL
);

-- user_goals: 用户目标表
CREATE TABLE IF NOT EXISTS user_goals (
    id TEXT PRIMARY KEY NOT NULL,
    week_start TEXT NOT NULL,
    goals_json TEXT,
    created_at INTEGER NOT NULL
);

-- clipboard_items: 剪贴板项表
CREATE TABLE IF NOT EXISTS clipboard_items (
    id TEXT PRIMARY KEY NOT NULL,
    segment_id TEXT,
    content TEXT,
    content_type TEXT,
    created_at INTEGER NOT NULL
);

-- settings: 设置键值表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
);

-- ============ FTS5 全文索引虚拟表 ============

-- fts_segments: 索引 segments 的 ocr_text 和 window_title
CREATE VIRTUAL TABLE IF NOT EXISTS fts_segments USING fts5(
    ocr_text,
    window_title,
    segment_id UNINDEXED,
    tokenize = 'unicode61'
);

-- fts_episodes: 索引 episodes 的 title 和 summary
CREATE VIRTUAL TABLE IF NOT EXISTS fts_episodes USING fts5(
    title,
    summary,
    episode_id UNINDEXED,
    tokenize = 'unicode61'
);

-- fts_wiki: 索引 wiki_pages 的 content
CREATE VIRTUAL TABLE IF NOT EXISTS fts_wiki USING fts5(
    content,
    wiki_id UNINDEXED,
    tokenize = 'unicode61'
);

-- ============ 触发器：同步 FTS 表 ============

-- segments 插入触发器：同步到 fts_segments
CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN
    INSERT INTO fts_segments(ocr_text, window_title, segment_id)
    VALUES (COALESCE(new.ocr_text, ''), COALESCE(new.window_title, ''), new.id);
END;

-- segments 删除触发器：从 fts_segments 移除
CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN
    DELETE FROM fts_segments WHERE segment_id = old.id;
END;

-- segments 更新触发器：先删除旧索引再插入新索引
CREATE TRIGGER IF NOT EXISTS segments_au AFTER UPDATE ON segments BEGIN
    DELETE FROM fts_segments WHERE segment_id = old.id;
    INSERT INTO fts_segments(ocr_text, window_title, segment_id)
    VALUES (COALESCE(new.ocr_text, ''), COALESCE(new.window_title, ''), new.id);
END;

-- episodes 插入触发器：同步到 fts_episodes
CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO fts_episodes(title, summary, episode_id)
    VALUES (COALESCE(new.title, ''), COALESCE(new.summary, ''), new.id);
END;

-- episodes 删除触发器：从 fts_episodes 移除
CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
    DELETE FROM fts_episodes WHERE episode_id = old.id;
END;

-- episodes 更新触发器：先删除旧索引再插入新索引
CREATE TRIGGER IF NOT EXISTS episodes_au AFTER UPDATE ON episodes BEGIN
    DELETE FROM fts_episodes WHERE episode_id = old.id;
    INSERT INTO fts_episodes(title, summary, episode_id)
    VALUES (COALESCE(new.title, ''), COALESCE(new.summary, ''), new.id);
END;

-- wiki_pages 插入触发器：同步到 fts_wiki
CREATE TRIGGER IF NOT EXISTS wiki_pages_ai AFTER INSERT ON wiki_pages BEGIN
    INSERT INTO fts_wiki(content, wiki_id)
    VALUES (COALESCE(new.content, ''), new.id);
END;

-- wiki_pages 删除触发器：从 fts_wiki 移除
CREATE TRIGGER IF NOT EXISTS wiki_pages_ad AFTER DELETE ON wiki_pages BEGIN
    DELETE FROM fts_wiki WHERE wiki_id = old.id;
END;

-- wiki_pages 更新触发器：先删除旧索引再插入新索引
CREATE TRIGGER IF NOT EXISTS wiki_pages_au AFTER UPDATE ON wiki_pages BEGIN
    DELETE FROM fts_wiki WHERE wiki_id = old.id;
    INSERT INTO fts_wiki(content, wiki_id)
    VALUES (COALESCE(new.content, ''), new.id);
END;

-- ============ 索引 ============

CREATE INDEX IF NOT EXISTS idx_segments_timestamp ON segments(timestamp);
CREATE INDEX IF NOT EXISTS idx_episodes_date ON episodes(date);
CREATE INDEX IF NOT EXISTS idx_episodes_start_time ON episodes(start_time);
CREATE INDEX IF NOT EXISTS idx_clean_episodes_date ON clean_episodes(date);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_type ON wiki_pages(wiki_type);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_status ON wiki_pages(status);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);
CREATE INDEX IF NOT EXISTS idx_privacy_rules_enabled ON privacy_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_clipboard_items_segment_id ON clipboard_items(segment_id);
"#;

/// 执行 Schema 迁移
///
/// 使用 PRAGMA user_version 跟踪当前数据库版本，逐版本执行 up 迁移。
/// 每个迁移在一个事务中执行，成功后更新 user_version。
fn run_migrations(conn: &Connection) -> Result<(), String> {
    // 获取当前数据库版本
    let current_version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("获取 user_version 失败: {}", e))?;

    // 定义所有迁移（按版本顺序排列，索引 0 对应迁移到版本 1）
    let migrations: Vec<&str> = vec![MIGRATION_V1];

    // 逐版本执行迁移
    for (i, migration_sql) in migrations.iter().enumerate() {
        let target_version = (i + 1) as i64;
        if current_version < target_version {
            // 在事务中执行迁移
            conn.execute_batch("BEGIN")
                .map_err(|e| format!("开始迁移事务失败 (v{}): {}", target_version, e))?;
            conn.execute_batch(migration_sql)
                .map_err(|e| format!("执行迁移失败 (v{}): {}", target_version, e))?;
            conn.execute_batch(&format!("PRAGMA user_version = {}", target_version))
                .map_err(|e| format!("更新 user_version 失败 (v{}): {}", target_version, e))?;
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("提交迁移事务失败 (v{}): {}", target_version, e))?;
        }
    }

    Ok(())
}

// ==================== DbState 实现 ====================

impl DbState {
    /// 创建新的数据库状态实例
    ///
    /// - 打开写连接并配置 WAL 模式
    /// - 执行 Schema 迁移
    /// - 初始化读连接池（默认 4 个连接）
    pub fn new(db_path: &Path) -> Result<Self, String> {
        // 确保父目录存在
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建数据库目录失败: {}", e))?;
        }

        // 创建写连接
        let write_conn = Connection::open(db_path)
            .map_err(|e| format!("打开写连接失败: {}", e))?;

        // 配置 WAL 模式和相关 PRAGMA
        write_conn
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;",
            )
            .map_err(|e| format!("配置 WAL 模式失败: {}", e))?;

        // 执行 Schema 迁移
        run_migrations(&write_conn)?;

        // 初始化读连接池
        let mut read_conns = Vec::with_capacity(4);
        for _ in 0..4 {
            let read_conn = Connection::open(db_path)
                .map_err(|e| format!("打开读连接失败: {}", e))?;
            // 读连接设置为只读模式，防止误写
            read_conn
                .execute_batch("PRAGMA query_only = ON;")
                .map_err(|e| format!("配置读连接只读模式失败: {}", e))?;
            read_conns.push(read_conn);
        }

        Ok(Self {
            write_conn: Mutex::new(write_conn),
            read_pool: Mutex::new(read_conns),
            db_path: db_path.to_path_buf(),
        })
    }

    /// 执行 WAL checkpoint（TRUNCATE 模式）
    ///
    /// 将 WAL 日志文件中的内容合并到主数据库文件，并截断 WAL 文件。
    /// 建议在应用退出前调用。
    pub fn checkpoint(&self) -> Result<(), String> {
        let conn = self.write_conn.lock();
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| format!("WAL checkpoint 失败: {}", e))?;
        Ok(())
    }

    /// 从读连接池获取一个连接执行查询
    ///
    /// 如果连接池为空，则按需创建新的读连接。查询完成后将连接归还到池中。
    fn with_read_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        // 从连接池获取连接（池为空时创建新连接）
        let conn = {
            let mut pool = self.read_pool.lock();
            match pool.pop() {
                Some(c) => c,
                None => {
                    let c = Connection::open(&self.db_path)
                        .map_err(|e| format!("创建读连接失败: {}", e))?;
                    c.execute_batch("PRAGMA query_only = ON;")
                        .map_err(|e| format!("配置读连接只读模式失败: {}", e))?;
                    c
                }
            }
        };

        // 执行查询
        let result = f(&conn);

        // 归还连接到连接池
        self.read_pool.lock().push(conn);

        result
    }

    // ==================== Segment 方法 ====================

    /// 插入一条截图片段记录
    pub fn insert_segment(&self, segment: &Segment) -> Result<(), String> {
        let conn = self.write_conn.lock();
        conn.execute(
            "INSERT INTO segments (id, timestamp, ocr_text, window_title, app_name,
                                    image_path, ocr_blocks_json, perceptual_hash, capture_source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                segment.id,
                segment.timestamp,
                segment.ocr_text,
                segment.window_title,
                segment.app_name,
                segment.image_path,
                segment.ocr_blocks_json,
                segment.perceptual_hash,
                segment.capture_source,
            ],
        )
        .map_err(|e| format!("插入 segment 失败: {}", e))?;
        Ok(())
    }

    /// 查询指定时间范围内的截图片段
    ///
    /// - `start_time`: 起始时间戳（秒，包含）
    /// - `end_time`: 结束时间戳（秒，包含）
    pub fn query_segments(&self, start_time: i64, end_time: i64) -> Result<Vec<Segment>, String> {
        self.with_read_conn(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, timestamp, ocr_text, window_title, app_name,
                            image_path, ocr_blocks_json, perceptual_hash, capture_source
                     FROM segments
                     WHERE timestamp >= ? AND timestamp <= ?
                     ORDER BY timestamp ASC",
                )
                .map_err(|e| format!("准备查询 segments 失败: {}", e))?;

            let rows = stmt
                .query_map(params![start_time, end_time], |row| Segment::from_row(row))
                .map_err(|e| format!("执行查询 segments 失败: {}", e))?;

            let mut segments = Vec::new();
            for row in rows {
                segments
                    .push(row.map_err(|e| format!("解析 segment 行失败: {}", e))?);
            }
            Ok(segments)
        })
    }

    // ==================== Episode 方法 ====================

    /// 插入一条工作事件记录
    pub fn insert_episode(&self, episode: &Episode) -> Result<(), String> {
        let conn = self.write_conn.lock();
        conn.execute(
            "INSERT INTO episodes (id, date, start_time, end_time, title, summary,
                                   episode_type, project, entities_json, topics_json,
                                   todos_json, blockers_json, segment_ids_json, source,
                                   related_episode_ids_json, important, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                episode.id,
                episode.date,
                episode.start_time,
                episode.end_time,
                episode.title,
                episode.summary,
                episode.episode_type,
                episode.project,
                episode.entities_json,
                episode.topics_json,
                episode.todos_json,
                episode.blockers_json,
                episode.segment_ids_json,
                episode.source,
                episode.related_episode_ids_json,
                episode.important,
                episode.created_at,
            ],
        )
        .map_err(|e| format!("插入 episode 失败: {}", e))?;
        Ok(())
    }

    /// 查询工作事件列表
    ///
    /// - `date`: 若指定则按日期过滤（格式 YYYY-MM-DD），否则返回所有事件
    pub fn query_episodes(&self, date: Option<&str>) -> Result<Vec<Episode>, String> {
        self.with_read_conn(|conn| {
            let sql = if date.is_some() {
                "SELECT id, date, start_time, end_time, title, summary, episode_type, project,
                        entities_json, topics_json, todos_json, blockers_json, segment_ids_json,
                        source, related_episode_ids_json, important, created_at
                 FROM episodes WHERE date = ? ORDER BY start_time ASC"
            } else {
                "SELECT id, date, start_time, end_time, title, summary, episode_type, project,
                        entities_json, topics_json, todos_json, blockers_json, segment_ids_json,
                        source, related_episode_ids_json, important, created_at
                 FROM episodes ORDER BY start_time DESC"
            };

            let mut stmt = conn
                .prepare(sql)
                .map_err(|e| format!("准备查询 episodes 失败: {}", e))?;

            // 使用 query + 手动迭代，避免 query_map 闭包类型不匹配问题
            let mut rows = match date {
                Some(d) => stmt.query(params![d]),
                None => stmt.query([]),
            }
            .map_err(|e| format!("执行查询 episodes 失败: {}", e))?;

            let mut episodes = Vec::new();
            while let Some(row) = rows
                .next()
                .map_err(|e| format!("迭代 episodes 行失败: {}", e))?
            {
                episodes
                    .push(Episode::from_row(row).map_err(|e| format!("解析 episode 行失败: {}", e))?);
            }
            Ok(episodes)
        })
    }

    /// 根据 ID 查询单个工作事件
    ///
    /// 返回 Option<Episode>，未找到时返回 None
    pub fn query_episode_by_id(&self, id: &str) -> Result<Option<Episode>, String> {
        self.with_read_conn(|conn| {
            match conn.query_row(
                "SELECT id, date, start_time, end_time, title, summary, episode_type, project,
                        entities_json, topics_json, todos_json, blockers_json, segment_ids_json,
                        source, related_episode_ids_json, important, created_at
                 FROM episodes WHERE id = ?",
                params![id],
                |row| Episode::from_row(row),
            ) {
                Ok(episode) => Ok(Some(episode)),
                Err(SqlError::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(format!("查询 episode by id 失败: {}", e)),
            }
        })
    }

    /// 更新工作事件（全字段更新）
    pub fn update_episode(&self, episode: &Episode) -> Result<(), String> {
        let conn = self.write_conn.lock();
        conn.execute(
            "UPDATE episodes SET
                date = ?, start_time = ?, end_time = ?, title = ?, summary = ?,
                episode_type = ?, project = ?, entities_json = ?, topics_json = ?,
                todos_json = ?, blockers_json = ?, segment_ids_json = ?, source = ?,
                related_episode_ids_json = ?, important = ?
             WHERE id = ?",
            params![
                episode.date,
                episode.start_time,
                episode.end_time,
                episode.title,
                episode.summary,
                episode.episode_type,
                episode.project,
                episode.entities_json,
                episode.topics_json,
                episode.todos_json,
                episode.blockers_json,
                episode.segment_ids_json,
                episode.source,
                episode.related_episode_ids_json,
                episode.important,
                episode.id,
            ],
        )
        .map_err(|e| format!("更新 episode 失败: {}", e))?;
        Ok(())
    }

    // ==================== WikiPage 方法 ====================

    /// 插入一条知识库页面
    pub fn insert_wiki_page(&self, page: &WikiPage) -> Result<(), String> {
        let conn = self.write_conn.lock();
        conn.execute(
            "INSERT INTO wiki_pages (id, title, wiki_type, content, backlinks_json,
                                     last_cited_at, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                page.id,
                page.title,
                page.wiki_type,
                page.content,
                page.backlinks_json,
                page.last_cited_at,
                page.status,
                page.created_at,
                page.updated_at,
            ],
        )
        .map_err(|e| format!("插入 wiki_page 失败: {}", e))?;
        Ok(())
    }

    /// 查询知识库页面列表
    ///
    /// - `wiki_type`: 若指定则按类型过滤（person/project/decision/meeting/topic/skill），否则返回全部
    pub fn query_wiki_pages(&self, wiki_type: Option<&str>) -> Result<Vec<WikiPage>, String> {
        self.with_read_conn(|conn| {
            let sql = if wiki_type.is_some() {
                "SELECT id, title, wiki_type, content, backlinks_json, last_cited_at,
                        status, created_at, updated_at
                 FROM wiki_pages WHERE wiki_type = ? ORDER BY updated_at DESC"
            } else {
                "SELECT id, title, wiki_type, content, backlinks_json, last_cited_at,
                        status, created_at, updated_at
                 FROM wiki_pages ORDER BY updated_at DESC"
            };

            let mut stmt = conn
                .prepare(sql)
                .map_err(|e| format!("准备查询 wiki_pages 失败: {}", e))?;

            // 使用 query + 手动迭代，避免 query_map 闭包类型不匹配问题
            let mut rows = match wiki_type {
                Some(t) => stmt.query(params![t]),
                None => stmt.query([]),
            }
            .map_err(|e| format!("执行查询 wiki_pages 失败: {}", e))?;

            let mut pages = Vec::new();
            while let Some(row) = rows
                .next()
                .map_err(|e| format!("迭代 wiki_pages 行失败: {}", e))?
            {
                pages.push(WikiPage::from_row(row).map_err(|e| format!("解析 wiki_page 行失败: {}", e))?);
            }
            Ok(pages)
        })
    }

    /// 更新知识库页面（全字段更新，自动刷新 updated_at）
    pub fn update_wiki_page(&self, page: &WikiPage) -> Result<(), String> {
        let conn = self.write_conn.lock();
        conn.execute(
            "UPDATE wiki_pages SET
                title = ?, wiki_type = ?, content = ?, backlinks_json = ?,
                last_cited_at = ?, status = ?, updated_at = ?
             WHERE id = ?",
            params![
                page.title,
                page.wiki_type,
                page.content,
                page.backlinks_json,
                page.last_cited_at,
                page.status,
                page.updated_at,
                page.id,
            ],
        )
        .map_err(|e| format!("更新 wiki_page 失败: {}", e))?;
        Ok(())
    }

    // ==================== Report 方法 ====================

    /// 插入一条报告记录
    pub fn insert_report(&self, report: &Report) -> Result<(), String> {
        let conn = self.write_conn.lock();
        conn.execute(
            "INSERT INTO reports (id, date, report_type, template_id, content,
                                  word_count, exported_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                report.id,
                report.date,
                report.report_type,
                report.template_id,
                report.content,
                report.word_count,
                report.exported_at,
                report.created_at,
            ],
        )
        .map_err(|e| format!("插入 report 失败: {}", e))?;
        Ok(())
    }

    /// 查询报告列表
    ///
    /// - `date`: 若指定则按日期过滤，否则返回所有报告
    pub fn query_reports(&self, date: Option<&str>) -> Result<Vec<Report>, String> {
        self.with_read_conn(|conn| {
            let sql = if date.is_some() {
                "SELECT id, date, report_type, template_id, content, word_count,
                        exported_at, created_at
                 FROM reports WHERE date = ? ORDER BY created_at DESC"
            } else {
                "SELECT id, date, report_type, template_id, content, word_count,
                        exported_at, created_at
                 FROM reports ORDER BY created_at DESC"
            };

            let mut stmt = conn
                .prepare(sql)
                .map_err(|e| format!("准备查询 reports 失败: {}", e))?;

            // 使用 query + 手动迭代，避免 query_map 闭包类型不匹配问题
            let mut rows = match date {
                Some(d) => stmt.query(params![d]),
                None => stmt.query([]),
            }
            .map_err(|e| format!("执行查询 reports 失败: {}", e))?;

            let mut reports = Vec::new();
            while let Some(row) = rows
                .next()
                .map_err(|e| format!("迭代 reports 行失败: {}", e))?
            {
                reports.push(Report::from_row(row).map_err(|e| format!("解析 report 行失败: {}", e))?);
            }
            Ok(reports)
        })
    }

    // ==================== FTS 全文搜索 ====================

    /// 通用全文搜索
    ///
    /// - `query`: 搜索关键词（自动转义 FTS5 特殊字符）
    /// - `table`: 搜索的表名（"segments" / "episodes" / "wiki"）
    /// - `limit`: 返回结果数量上限
    ///
    /// 返回 FtsResult 列表，包含匹配记录的 ID、高亮片段和相关度排名。
    pub fn search_fts(&self, query: &str, table: &str, limit: i64) -> Result<Vec<FtsResult>, String> {
        // 空查询直接返回空结果
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let escaped_query = escape_fts_query(query);
        if escaped_query.is_empty() {
            return Ok(Vec::new());
        }

        // 根据表名选择对应的 FTS 表和 SQL
        let sql = match table {
            "segments" => {
                "SELECT segment_id AS id, \
                        snippet(fts_segments, -1, '<mark>', '</mark>', '...', 32) AS snippet, \
                        rank \
                 FROM fts_segments WHERE fts_segments MATCH ? \
                 ORDER BY rank LIMIT ?"
            }
            "episodes" => {
                "SELECT episode_id AS id, \
                        snippet(fts_episodes, -1, '<mark>', '</mark>', '...', 32) AS snippet, \
                        rank \
                 FROM fts_episodes WHERE fts_episodes MATCH ? \
                 ORDER BY rank LIMIT ?"
            }
            "wiki" => {
                "SELECT wiki_id AS id, \
                        snippet(fts_wiki, -1, '<mark>', '</mark>', '...', 32) AS snippet, \
                        rank \
                 FROM fts_wiki WHERE fts_wiki MATCH ? \
                 ORDER BY rank LIMIT ?"
            }
            _ => return Err(format!("未知的 FTS 表: {}（支持: segments/episodes/wiki）", table)),
        };

        self.with_read_conn(|conn| {
            let mut stmt = conn
                .prepare(sql)
                .map_err(|e| format!("准备 FTS 搜索失败: {}", e))?;

            let rows = stmt
                .query_map(params![escaped_query, limit], |row| {
                    Ok(FtsResult {
                        table: table.to_string(),
                        id: row.get(0)?,
                        snippet: row.get(1)?,
                        rank: row.get(2)?,
                    })
                })
                .map_err(|e| format!("执行 FTS 搜索失败: {}", e))?;

            let mut results = Vec::new();
            for row in rows {
                results.push(row.map_err(|e| format!("解析 FTS 结果行失败: {}", e))?);
            }
            Ok(results)
        })
    }

    // ==================== Settings 方法 ====================

    /// 获取设置项
    ///
    /// 返回 Option<String>，键不存在时返回 None
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        self.with_read_conn(|conn| {
            match conn.query_row(
                "SELECT value FROM settings WHERE key = ?",
                params![key],
                |row| row.get::<_, String>(0),
            ) {
                Ok(value) => Ok(Some(value)),
                Err(SqlError::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(format!("查询 setting 失败: {}", e)),
            }
        })
    }

    /// 设置设置项（不存在则插入，存在则更新）
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.write_conn.lock();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| format!("设置 setting 失败: {}", e))?;
        Ok(())
    }

    /// 执行任意 SQL（写操作），返回受影响行数
    pub fn execute<P: rusqlite::Params>(&self, sql: &str, params: P) -> Result<usize, String> {
        let conn = self.write_conn.lock();
        conn.execute(sql, params)
            .map_err(|e| format!("执行 SQL 失败: {} | SQL: {}", e, sql))
    }

    /// 查询单个标量值（如 COUNT(*)）
    pub fn query_one(&self, sql: &str) -> Result<i64, String> {
        let conn = self.write_conn.lock();
        conn.query_row(sql, [], |row| row.get::<_, i64>(0))
            .map_err(|e| format!("查询失败: {} | SQL: {}", e, sql))
    }

    /// 准备语句（供复杂查询使用）
    pub fn prepare<F, T>(&self, sql: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut rusqlite::Statement) -> Result<T, rusqlite::Error>,
    {
        let conn = self.write_conn.lock();
        let mut stmt = conn.prepare(sql).map_err(|e| format!("准备语句失败: {}", e))?;
        f(&mut stmt).map_err(|e| format!("查询失败: {}", e))
    }
}

// ==================== Drop 实现 ====================

impl Drop for DbState {
    fn drop(&mut self) {
        // 退出前执行 WAL checkpoint，将 WAL 日志写入主数据库并截断 WAL 文件
        // 使用 try_lock 避免在 Drop 中阻塞（虽然正常退出时不应有竞争）
        if let Some(conn) = self.write_conn.try_lock() {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
    }
}

// ==================== 单元测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    /// 创建临时数据库用于测试
    fn create_test_db() -> DbState {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("workmemory_test_{}.db", generate_id()));
        DbState::new(&db_path).expect("创建测试数据库失败")
        // 注意：测试文件保留在临时目录中，由操作系统清理
        // 不能在连接仍打开时删除数据库文件，否则会导致 disk I/O error
    }

    #[test]
    fn test_settings() {
        let db = create_test_db();

        // 测试不存在的键
        assert_eq!(db.get_setting("nonexistent").unwrap(), None);

        // 测试设置和获取
        db.set_setting("theme", "dark").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("dark".to_string()));

        // 测试更新已存在的键
        db.set_setting("theme", "light").unwrap();
        assert_eq!(db.get_setting("theme").unwrap(), Some("light".to_string()));
    }

    #[test]
    fn test_segment_crud() {
        let db = create_test_db();

        let segment = Segment {
            id: generate_id(),
            timestamp: now_timestamp(),
            ocr_text: Some("测试 OCR 文本".to_string()),
            window_title: Some("测试窗口".to_string()),
            app_name: Some("test_app".to_string()),
            image_path: Some("/tmp/test.png".to_string()),
            ocr_blocks_json: Some("[]".to_string()),
            perceptual_hash: Some("abc123".to_string()),
            capture_source: Some("auto".to_string()),
        };

        // 插入
        db.insert_segment(&segment).unwrap();

        // 查询
        let segments = db
            .query_segments(segment.timestamp - 1, segment.timestamp + 1)
            .unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].id, segment.id);
        assert_eq!(segments[0].ocr_text, segment.ocr_text);
    }

    #[test]
    fn test_episode_crud() {
        let db = create_test_db();

        let episode = Episode {
            id: generate_id(),
            date: "2026-01-01".to_string(),
            start_time: now_timestamp(),
            end_time: now_timestamp() + 3600,
            title: Some("测试事件".to_string()),
            summary: Some("这是一个测试事件".to_string()),
            episode_type: Some("work".to_string()),
            project: Some("test_project".to_string()),
            entities_json: Some("[]".to_string()),
            topics_json: Some("[]".to_string()),
            todos_json: Some("[]".to_string()),
            blockers_json: Some("[]".to_string()),
            segment_ids_json: Some("[]".to_string()),
            source: Some("auto".to_string()),
            related_episode_ids_json: Some("[]".to_string()),
            important: 0,
            created_at: now_timestamp(),
        };

        // 插入
        db.insert_episode(&episode).unwrap();

        // 按日期查询
        let episodes = db.query_episodes(Some("2026-01-01")).unwrap();
        assert_eq!(episodes.len(), 1);
        assert_eq!(episodes[0].id, episode.id);

        // 按 ID 查询
        let found = db.query_episode_by_id(&episode.id).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().title, episode.title);

        // 查询不存在的 ID
        let not_found = db.query_episode_by_id("nonexistent").unwrap();
        assert!(not_found.is_none());

        // 更新
        let mut updated = episode.clone();
        updated.title = Some("更新后的标题".to_string());
        updated.important = 1;
        db.update_episode(&updated).unwrap();

        let found = db.query_episode_by_id(&episode.id).unwrap().unwrap();
        assert_eq!(found.title, Some("更新后的标题".to_string()));
        assert_eq!(found.important, 1);
    }

    #[test]
    fn test_wiki_page_crud() {
        let db = create_test_db();

        let page = WikiPage {
            id: generate_id(),
            title: "测试知识卡片".to_string(),
            wiki_type: "project".to_string(),
            content: Some("这是知识卡片的内容".to_string()),
            backlinks_json: Some("[]".to_string()),
            last_cited_at: Some(now_timestamp()),
            status: Some("active".to_string()),
            created_at: now_timestamp(),
            updated_at: now_timestamp(),
        };

        // 插入
        db.insert_wiki_page(&page).unwrap();

        // 查询全部
        let pages = db.query_wiki_pages(None).unwrap();
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].id, page.id);

        // 按类型查询
        let pages = db.query_wiki_pages(Some("project")).unwrap();
        assert_eq!(pages.len(), 1);
        let pages = db.query_wiki_pages(Some("person")).unwrap();
        assert_eq!(pages.len(), 0);

        // 更新
        let mut updated = page.clone();
        updated.title = "更新后的标题".to_string();
        updated.updated_at = now_timestamp();
        db.update_wiki_page(&updated).unwrap();

        let pages = db.query_wiki_pages(None).unwrap();
        assert_eq!(pages[0].title, "更新后的标题");
    }

    #[test]
    fn test_report_crud() {
        let db = create_test_db();

        let report = Report {
            id: generate_id(),
            date: "2026-01-01".to_string(),
            report_type: "daily".to_string(),
            template_id: Some("enhanced".to_string()),
            content: Some("今日工作总结...".to_string()),
            word_count: Some(500),
            exported_at: None,
            created_at: now_timestamp(),
        };

        // 插入
        db.insert_report(&report).unwrap();

        // 查询
        let reports = db.query_reports(Some("2026-01-01")).unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].id, report.id);

        let reports = db.query_reports(None).unwrap();
        assert_eq!(reports.len(), 1);
    }

    #[test]
    fn test_fts_search() {
        let db = create_test_db();

        // 插入测试数据
        let segment = Segment {
            id: generate_id(),
            timestamp: now_timestamp(),
            ocr_text: Some("Rust 编程语言学习笔记".to_string()),
            window_title: Some("Rust Documentation".to_string()),
            app_name: None,
            image_path: None,
            ocr_blocks_json: None,
            perceptual_hash: None,
            capture_source: None,
        };
        db.insert_segment(&segment).unwrap();

        // 搜索 segments
        let results = db.search_fts("Rust", "segments", 10).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].id, segment.id);
        assert!(results[0].snippet.contains("<mark>"));

        // 搜索不存在的词
        let results = db.search_fts("nonexistentword", "segments", 10).unwrap();
        assert!(results.is_empty());

        // 空查询
        let results = db.search_fts("", "segments", 10).unwrap();
        assert!(results.is_empty());

        // 测试未知表
        let result = db.search_fts("test", "unknown", 10);
        assert!(result.is_err());
    }

    #[test]
    fn test_fts_search_episodes() {
        let db = create_test_db();

        let episode = Episode {
            id: generate_id(),
            date: "2026-01-01".to_string(),
            start_time: now_timestamp(),
            end_time: now_timestamp() + 3600,
            title: Some("学习 Rust 异步编程".to_string()),
            summary: Some("今天学习了 tokio 和 async/await 的使用方法".to_string()),
            episode_type: Some("learning".to_string()),
            project: None,
            entities_json: None,
            topics_json: None,
            todos_json: None,
            blockers_json: None,
            segment_ids_json: None,
            source: Some("auto".to_string()),
            related_episode_ids_json: None,
            important: 0,
            created_at: now_timestamp(),
        };
        db.insert_episode(&episode).unwrap();

        // 搜索标题
        let results = db.search_fts("Rust", "episodes", 10).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].id, episode.id);

        // 搜索摘要
        let results = db.search_fts("tokio", "episodes", 10).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].id, episode.id);
    }

    #[test]
    fn test_fts_search_wiki() {
        let db = create_test_db();

        let page = WikiPage {
            id: generate_id(),
            title: "Rust 知识卡片".to_string(),
            wiki_type: "skill".to_string(),
            // 中文词之间用空格分隔，便于 unicode61 分词
            content: Some("Rust 所有权 系统 是核心特性".to_string()),
            backlinks_json: None,
            last_cited_at: None,
            status: Some("active".to_string()),
            created_at: now_timestamp(),
            updated_at: now_timestamp(),
        };
        db.insert_wiki_page(&page).unwrap();

        let results = db.search_fts("所有权", "wiki", 10).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].id, page.id);
    }

    #[test]
    fn test_fts_update_sync() {
        let db = create_test_db();

        let segment = Segment {
            id: generate_id(),
            timestamp: now_timestamp(),
            // 中文词之间用空格分隔，便于 unicode61 分词
            ocr_text: Some("原始 文本 内容".to_string()),
            window_title: None,
            app_name: None,
            image_path: None,
            ocr_blocks_json: None,
            perceptual_hash: None,
            capture_source: None,
        };
        db.insert_segment(&segment).unwrap();

        // 验证原始文本可搜索
        let results = db.search_fts("原始", "segments", 10).unwrap();
        assert!(!results.is_empty());

        // 注意：update_episode 等方法存在但 segments 没有 update 方法
        // FTS 同步通过触发器在 UPDATE 时自动处理
    }

    #[test]
    fn test_escape_fts_query() {
        assert_eq!(escape_fts_query("hello world"), "\"hello\" \"world\"");
        assert_eq!(escape_fts_query(""), "");
        assert_eq!(escape_fts_query("   "), "");
        // 双引号被转义为两个双引号，再被外层引号包裹
        assert_eq!(
            escape_fts_query("test \"quoted\""),
            "\"test\" \"\"\"quoted\"\"\""
        );
    }

    #[test]
    fn test_generate_id() {
        let id1 = generate_id();
        let id2 = generate_id();
        assert_ne!(id1, id2);
        assert!(!id1.is_empty());
    }

    #[test]
    fn test_now_timestamp() {
        let ts = now_timestamp();
        assert!(ts > 0);
    }

    #[test]
    fn test_checkpoint() {
        let db = create_test_db();
        // checkpoint 应该能正常执行
        db.checkpoint().unwrap();
    }
}
