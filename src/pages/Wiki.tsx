// 知识库页：分类过滤 + 搜索 + 卡片网格 + 待审核区 + 详情 + Obsidian 导入

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import * as ipc from "@/lib/ipc";
import { formatDate, cx } from "@/lib/utils";
import type { WikiPage as WikiPageType, WikiType } from "@/types";
import styles from "./Wiki.module.css";

const WIKI_TYPES: Array<{ id: WikiType | "all"; label: string; icon: string; color: string }> = [
  { id: "all", label: "全部", icon: "📚", color: "#5B6AF0" },
  { id: "person", label: "人物", icon: "👤", color: "#10B981" },
  { id: "project", label: "项目", icon: "📦", color: "#F59E0B" },
  { id: "decision", label: "决策", icon: "🎯", color: "#8B5CF6" },
  { id: "meeting", label: "会议", icon: "🗣️", color: "#EC4899" },
  { id: "topic", label: "主题", icon: "💡", color: "#06B6D4" },
  { id: "skill", label: "技能", icon: "⚡", color: "#F97316" },
];

export function WikiPage() {
  const toast = useToast();
  const [pages, setPages] = useState<WikiPageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<WikiType | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WikiPageType | null>(null);
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState("");

  const loadPages = async () => {
    setLoading(true);
    try {
      const list = await ipc.wikiList();
      setPages(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPages();
  }, []);

  // 过滤
  const filtered = useMemo(() => {
    let list = pages;
    if (filterType !== "all") {
      list = list.filter((p) => p.wiki_type === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.title.toLowerCase().includes(q) || (p.content ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [pages, filterType, search]);

  // 待审核
  const pending = useMemo(() => pages.filter((p) => p.status === "pending"), [pages]);

  // 确认/忽略
  const handleApprove = async (id: string, action: "confirm" | "ignore") => {
    try {
      await ipc.wikiApprove(id, action);
      setPages((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: action === "confirm" ? "confirmed" : "ignored" } : p
        )
      );
      toast.success(action === "confirm" ? "已确认" : "已忽略");
    } catch (e) {
      toast.error("操作失败");
    }
  };

  // 删除
  const handleDelete = async (id: string) => {
    try {
      await ipc.wikiDelete(id);
      setPages((prev) => prev.filter((p) => p.id !== id));
      if (selected?.id === id) setSelected(null);
      toast.success("已删除");
    } catch (e) {
      toast.error("删除失败");
    }
  };

  // 保存编辑
  const handleSaveContent = async () => {
    if (!selected) return;
    try {
      const updated = { ...selected, content: contentDraft };
      await ipc.wikiUpdate(updated);
      setPages((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
      setSelected(updated);
      setEditingContent(false);
      toast.success("已保存");
    } catch (e) {
      toast.error("保存失败");
    }
  };

  // Obsidian 导入（模拟）
  const handleImportObsidian = () => {
    toast.info("Obsidian 导入功能：请将 .md 文件放入指定目录");
  };

  return (
    <div className={styles.container}>
      {/* 左侧过滤 */}
      <aside className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>分类</h3>
        <div className={styles.typeList}>
          {WIKI_TYPES.map((t) => {
            const count = t.id === "all" ? pages.length : pages.filter((p) => p.wiki_type === t.id).length;
            return (
              <button
                key={t.id}
                className={cx(styles.typeItem, filterType === t.id && styles.typeItemActive)}
                onClick={() => setFilterType(t.id)}
              >
                <span className={styles.typeIcon}>{t.icon}</span>
                <span className={styles.typeLabel}>{t.label}</span>
                <span className={styles.typeCount}>{count}</span>
              </button>
            );
          })}
        </div>

        <Button variant="secondary" size="sm" onClick={handleImportObsidian} className={styles.importBtn}>
          📥 导入 Obsidian
        </Button>
      </aside>

      {/* 主内容 */}
      <main className={styles.main}>
        <header className="page-header">
          <div>
            <h1 className="page-title">知识库</h1>
            <p className="page-subtitle">AI 自动提炼的知识卡片，支持双链关联</p>
          </div>
          <Input
            icon={<span>🔍</span>}
            placeholder="搜索知识卡片…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </header>

        {/* 待审核区 */}
        {pending.length > 0 && (
          <section className={styles.pendingSection}>
            <div className={styles.pendingHeader}>
              <h3 className={styles.sectionTitle}>
                待审核
                <Badge variant="warning" className={styles.pendingBadge}>
                  {pending.length}
                </Badge>
              </h3>
            </div>
            <div className={styles.pendingList}>
              {pending.map((p) => (
                <Card key={p.id} padding="sm" className={styles.pendingCard}>
                  <div className={styles.pendingCardHeader}>
                    <span className={styles.pendingIcon}>
                      {WIKI_TYPES.find((t) => t.id === p.wiki_type)?.icon ?? "📄"}
                    </span>
                    <span className={styles.pendingTitle}>{p.title}</span>
                  </div>
                  <p className={styles.pendingContent}>{p.content}</p>
                  <div className={styles.pendingActions}>
                    <Button size="sm" variant="primary" onClick={() => handleApprove(p.id, "confirm")}>
                      ✅ 确认
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSelected(p); setEditingContent(true); setContentDraft(p.content ?? ""); }}>
                      ✏️ 编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleApprove(p.id, "ignore")}>
                      ❌ 忽略
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* 卡片网格 */}
        <section className="scroll-area">
          {loading && <p className={styles.loadingHint}>加载中…</p>}
          {!loading && filtered.length === 0 && (
            <EmptyState
              illustration="📚"
              title="知识库还是空的"
              description="随着你使用 WorkMemory，AI 会自动从工作事件中提炼知识卡片。也可以点击「导入 Obsidian」手动导入。"
              actionText="导入 Obsidian"
              onAction={handleImportObsidian}
            />
          )}
          <div className={styles.grid}>
            <AnimatePresence>
              {filtered.map((page, idx) => {
                const typeInfo = WIKI_TYPES.find((t) => t.id === page.wiki_type);
                return (
                  <motion.div
                    key={page.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2, delay: idx * 0.02 }}
                  >
                    <Card hoverable padding="md" className={styles.card} onClick={() => setSelected(page)}>
                      <div className={styles.cardHeader}>
                        <span className={styles.cardIcon} style={{ background: typeInfo?.color ?? "#5B6AF0" }}>
                          {typeInfo?.icon ?? "📄"}
                        </span>
                        <h4 className={styles.cardTitle}>{page.title}</h4>
                        {page.status === "pending" && <Badge variant="warning">待审核</Badge>}
                      </div>
                      <p className={styles.cardContent}>{page.content ?? "暂无描述"}</p>
                      <div className={styles.cardFooter}>
                        <span className={styles.cardType}>{typeInfo?.label ?? page.wiki_type}</span>
                        <span className={styles.cardDate}>{formatDate(page.updated_at)}</span>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* 详情面板 */}
      <AnimatePresence>
        {selected && (
          <motion.aside
            className={styles.detail}
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className={styles.detailHeader}>
              <button className={styles.closeBtn} onClick={() => { setSelected(null); setEditingContent(false); }}>
                ✕
              </button>
            </div>
            <div className={styles.detailContent}>
              <div className={styles.detailType}>
                {WIKI_TYPES.find((t) => t.id === selected.wiki_type)?.icon}{" "}
                {WIKI_TYPES.find((t) => t.id === selected.wiki_type)?.label ?? selected.wiki_type}
              </div>
              <h2 className={styles.detailTitle}>{selected.title}</h2>

              <section className={styles.detailSection}>
                <div className={styles.detailSectionHeader}>
                  <h3 className={styles.sectionTitle}>AI 描述</h3>
                  {!editingContent && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditingContent(true); setContentDraft(selected.content ?? ""); }}>
                      ✏️ 编辑
                    </Button>
                  )}
                </div>
                {editingContent ? (
                  <>
                    <textarea
                      className={styles.textarea}
                      value={contentDraft}
                      onChange={(e) => setContentDraft(e.target.value)}
                      rows={6}
                    />
                    <div className={styles.editActions}>
                      <Button size="sm" variant="primary" onClick={handleSaveContent}>保存</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingContent(false)}>取消</Button>
                    </div>
                  </>
                ) : (
                  <p className={styles.detailDesc}>{selected.content ?? "暂无描述"}</p>
                )}
              </section>

              <section className={styles.detailSection}>
                <h3 className={styles.sectionTitle}>相关记忆</h3>
                <p className={styles.emptyHint}>暂无关联记忆</p>
              </section>

              <section className={styles.detailSection}>
                <h3 className={styles.sectionTitle}>双链关联</h3>
                <p className={styles.emptyHint}>暂无双向链接</p>
              </section>
            </div>
            <div className={styles.detailFooter}>
              <Button size="sm" variant="danger" onClick={() => handleDelete(selected.id)}>
                删除
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
