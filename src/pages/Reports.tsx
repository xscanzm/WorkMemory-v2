// 报告页：5 种模板 + 补充说明 + 流式输出 + 富文本编辑 + 导出 + 历史列表

import { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import * as ipc from "@/lib/ipc";
import { onReportToken, onReportCompleted } from "@/lib/events";
import { formatDate, formatDateShort, copyToClipboard, downloadText, downloadBytes, cx } from "@/lib/utils";
import type { Report, ReportTemplateId, ReportTemplateMeta } from "@/types";
import styles from "./Reports.module.css";

const TEMPLATES: ReportTemplateMeta[] = [
  { id: "enhanced", name: "详细日报", description: "完整记录今日工作，含详细内容、问题、明日计划" },
  { id: "concise", name: "精简日报", description: "三句话总结，快速发送" },
  { id: "standup", name: "站会报告", description: "昨日完成 / 今日计划 / 阻塞问题" },
  { id: "okr", name: "OKR 进展", description: "目标回顾、关键结果进展、风险与调整" },
  { id: "structured", name: "周报", description: "本周总结、成果、问题、下周计划" },
];

export function ReportsPage() {
  const toast = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateId>("enhanced");
  const [supplement, setSupplement] = useState("");
  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [currentReport, setCurrentReport] = useState<Report | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // 加载历史报告
  const loadReports = async () => {
    try {
      const list = await ipc.reportList();
      setReports(list);
    } catch (e) {
      console.error("加载报告列表失败", e);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  // 监听流式 token
  useEffect(() => {
    const unlisten = onReportToken((token) => {
      setStreamContent((prev) => prev + token);
    });
    const unlistenComplete = onReportCompleted((report) => {
      setGenerating(false);
      if (report && typeof report === "object" && "id" in report) {
        setCurrentReport(report as Report);
      }
      void loadReports();
      toast.success("报告生成完成");
    });
    return () => {
      void unlisten.then((fn) => fn());
      void unlistenComplete.then((fn) => fn());
    };
  }, [toast]);

  // 生成报告
  const handleGenerate = async () => {
    setGenerating(true);
    setStreamContent("");
    setCurrentReport(null);
    try {
      const id = await ipc.reportGenerate(selectedTemplate, null, supplement);
      // 流式输出会通过 event 推送
      // 完成后会触发 onReportCompleted
      // 这里也主动拉取一次报告
      const report = await ipc.reportGet(id);
      if (report) {
        setCurrentReport(report);
        setStreamContent(report.content ?? "");
      }
      await loadReports();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
      setGenerating(false);
    }
  };

  // 复制
  const handleCopy = async () => {
    const content = currentReport?.content ?? streamContent;
    if (!content) return;
    const ok = await copyToClipboard(content);
    if (ok) toast.success("已复制到剪贴板");
    else toast.error("复制失败");
  };

  // 导出 Markdown
  const handleExportMarkdown = async () => {
    if (!currentReport) return;
    try {
      const md = await ipc.reportExportMarkdown(currentReport.id);
      downloadText(`报告-${currentReport.date}.md`, md, "text/markdown");
      toast.success("已导出 Markdown");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    }
  };

  // 导出 Word
  const handleExportWord = async () => {
    if (!currentReport) return;
    try {
      const bytes = await ipc.reportExportWord(currentReport.id);
      downloadBytes(`报告-${currentReport.date}.doc`, bytes, "application/msword");
      toast.success("已导出 Word");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    }
  };

  // 选中历史报告
  const handleSelectReport = async (report: Report) => {
    setCurrentReport(report);
    setStreamContent(report.content ?? "");
    setGenerating(false);
  };

  // 删除报告
  const handleDelete = async (id: string) => {
    try {
      await ipc.reportDelete(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (currentReport?.id === id) {
        setCurrentReport(null);
        setStreamContent("");
      }
      toast.success("已删除");
    } catch (e) {
      toast.error("删除失败");
    }
  };

  // 按日期分组
  const groupedReports = useMemo(() => {
    const map = new Map<string, Report[]>();
    reports.forEach((r) => {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [reports]);

  return (
    <div className={styles.container}>
      {/* 左侧历史报告 */}
      <aside className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>历史报告</h3>
        <div className={styles.reportList}>
          {groupedReports.length === 0 && (
            <p className={styles.emptyHint}>还没有生成过报告</p>
          )}
          {groupedReports.map(([date, items]) => (
            <div key={date} className={styles.dateGroup}>
              <div className={styles.dateLabel}>{formatDateShort(new Date(date).getTime() / 1000)}</div>
              {items.map((r) => {
                const template = TEMPLATES.find((t) => t.id === r.report_type);
                return (
                  <button
                    key={r.id}
                    className={cx(styles.reportItem, currentReport?.id === r.id && styles.reportItemActive)}
                    onClick={() => handleSelectReport(r)}
                  >
                    <span className={styles.reportIcon}>📄</span>
                    <div className={styles.reportInfo}>
                      <div className={styles.reportName}>{template?.name ?? r.report_type}</div>
                      <div className={styles.reportDate}>{formatDate(new Date(r.date).getTime() / 1000)}</div>
                    </div>
                    <button
                      className={styles.reportDelete}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(r.id);
                      }}
                    >
                      ×
                    </button>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* 主内容 */}
      <main className={styles.main}>
        <header className="page-header">
          <div>
            <h1 className="page-title">报告生成</h1>
            <p className="page-subtitle">选择模板，AI 根据今日工作事件生成报告</p>
          </div>
        </header>

        {/* 模板选择 */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>选择模板</h3>
          <div className={styles.templateGrid}>
            {TEMPLATES.map((t) => (
              <motion.div
                key={t.id}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}
              >
                <Card
                  hoverable
                  padding="md"
                  className={cx(
                    styles.templateCard,
                    selectedTemplate === t.id && styles.templateCardActive
                  )}
                  onClick={() => setSelectedTemplate(t.id)}
                >
                  <div className={styles.templateHeader}>
                    <span className={styles.templateIcon}>
                      {t.id === "enhanced" ? "📋" : t.id === "concise" ? "✨" : t.id === "standup" ? "🗣️" : t.id === "okr" ? "🎯" : "📈"}
                    </span>
                    <h4 className={styles.templateName}>{t.name}</h4>
                  </div>
                  <p className={styles.templateDesc}>{t.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 补充说明 */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>补充说明（可选，最多 150 字）</h3>
          <Input
            placeholder="例如：今天主要完成了登录模块的重构…"
            value={supplement}
            onChange={(e) => setSupplement(e.target.value.slice(0, 150))}
            maxLength={150}
          />
          <div className={styles.charCount}>{supplement.length}/150</div>
        </section>

        {/* 生成按钮 */}
        <Button
          variant="primary"
          size="lg"
          loading={generating}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "生成中…" : "生成报告"}
        </Button>

        {/* 流式输出 / 富文本编辑器 */}
        {(streamContent || generating) && (
          <section className={styles.section}>
            <div className={styles.editorHeader}>
              <h3 className={styles.sectionTitle}>{generating ? "生成中…" : "报告内容"}</h3>
              <div className={styles.editorActions}>
                <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
                  {editing ? "完成编辑" : "编辑"}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!streamContent}>
                  复制
                </Button>
                <Button size="sm" variant="ghost" onClick={handleExportMarkdown} disabled={!currentReport}>
                  导出 Markdown
                </Button>
                <Button size="sm" variant="ghost" onClick={handleExportWord} disabled={!currentReport}>
                  导出 Word
                </Button>
                <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating}>
                  重新生成
                </Button>
              </div>
            </div>
            {editing ? (
              <div
                ref={editorRef}
                className={styles.editor}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => {
                  const text = (e.target as HTMLDivElement).innerText;
                  setStreamContent(text);
                }}
              >
                {streamContent}
              </div>
            ) : (
              <div className={styles.preview}>
                {streamContent.split("\n").map((line, i) => (
                  <p key={i} className={styles.previewLine}>
                    {line || "\u00A0"}
                  </p>
                ))}
                {generating && <span className={styles.cursor}>▌</span>}
              </div>
            )}
          </section>
        )}

        {/* 空状态 */}
        {!streamContent && !generating && reports.length === 0 && (
          <EmptyState
            illustration="📝"
            title="还没有报告"
            description="选择一个模板，点击「生成报告」开始创建你的第一份工作报告。"
          />
        )}
      </main>
    </div>
  );
}
