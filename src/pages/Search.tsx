// 搜索页：全宽搜索框 + 过滤语法 + 排序 Tab + 结果列表

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import * as ipc from "@/lib/ipc";
import {
  formatDateTime,
  formatDuration,
  parseTopics,
  splitByKeyword,
  debounce,
  cx,
} from "@/lib/utils";
import { episodeTypeColors } from "@/styles/theme";
import type { SearchResult } from "@/types";
import styles from "./Search.module.css";

export function SearchPage() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"time" | "relevance">("time");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  // 防抖搜索
  const debouncedSearch = useMemo(
    () =>
      debounce(async (q: string, sort: "time" | "relevance") => {
        if (!q.trim()) {
          setResult(null);
          return;
        }
        setLoading(true);
        try {
          const res = await ipc.searchQuery(q, sort);
          setResult(res);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "搜索失败");
        } finally {
          setLoading(false);
        }
      }, 300),
    [toast]
  );

  useEffect(() => {
    debouncedSearch(query, sortBy);
  }, [query, sortBy, debouncedSearch]);

  // 匹配维度
  const matchDimensions = useMemo(() => {
    if (!result) return null;
    return {
      tags: result.filter.tags,
      entities: result.filter.entities,
      project: result.filter.project,
      timeRange: result.filter.time_range?.label,
    };
  }, [result]);

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">搜索</h1>
          <p className="page-subtitle">
            支持 #标签 @实体 project:项目 &gt;时间 过滤语法，例如：#编码 @张三 project:WorkMemory &gt;上周
          </p>
        </div>
      </header>

      <Input
        autoFocus
        icon={<SearchIcon />}
        placeholder="搜索记忆…  试试：#编码 @张三 >昨天"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        size="lg"
      />

      {/* 排序 Tab */}
      {result && result.total > 0 && (
        <div className={styles.tabs}>
          <button
            className={cx(styles.tab, sortBy === "time" && styles.tabActive)}
            onClick={() => setSortBy("time")}
          >
            时间顺序
          </button>
          <button
            className={cx(styles.tab, sortBy === "relevance" && styles.tabActive)}
            onClick={() => setSortBy("relevance")}
          >
            相关度
          </button>
          <span className={styles.resultCount}>共 {result.total} 条结果</span>
        </div>
      )}

      {/* 匹配维度提示 */}
      {matchDimensions &&
        (matchDimensions.tags.length > 0 ||
          matchDimensions.entities.length > 0 ||
          matchDimensions.project ||
          matchDimensions.timeRange) && (
          <div className={styles.filterInfo}>
            {matchDimensions.tags.map((t) => (
              <span key={t} className={styles.filterTag}>
                #{t}
              </span>
            ))}
            {matchDimensions.entities.map((e) => (
              <span key={e} className={styles.filterTag}>
                @{e}
              </span>
            ))}
            {matchDimensions.project && (
              <span className={styles.filterTag}>project:{matchDimensions.project}</span>
            )}
            {matchDimensions.timeRange && (
              <span className={styles.filterTag}>{matchDimensions.timeRange}</span>
            )}
          </div>
        )}

      {/* 结果列表 */}
      <div className="scroll-area">
        {!query.trim() && (
          <EmptyState
            illustration="🔍"
            title="搜索你的工作记忆"
            description="输入关键词、标签、实体或时间范围，快速定位过去的工作事件。"
          />
        )}

        {query.trim() && !loading && result && result.episodes.length === 0 && (
          <EmptyState
            illustration="🤔"
            title="没有找到匹配的结果"
            description="试试调整关键词或过滤条件。"
          />
        )}

        {result && result.episodes.length > 0 && (
          <div className={styles.list}>
            {result.episodes.map((episode, idx) => {
              const color =
                episodeTypeColors[episode.episode_type ?? "default"] ?? episodeTypeColors.default;
              const topics = parseTopics(episode.topics_json);
              const keyword = result.filter.query;
              return (
                <motion.div
                  key={episode.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.02 }}
                >
                  <Card hoverable padding="md">
                    <div className={styles.resultCard}>
                      <div className={styles.resultAccent} style={{ background: color }} />
                      <div className={styles.resultBody}>
                        <h4 className={styles.resultTitle}>
                          {splitByKeyword(episode.title ?? "未命名", keyword).map((part, i) =>
                            part.highlight ? (
                              <mark key={i}>{part.text}</mark>
                            ) : (
                              <span key={i}>{part.text}</span>
                            )
                          )}
                        </h4>
                        {episode.summary && (
                          <p className={styles.resultSummary}>
                            {splitByKeyword(episode.summary, keyword).map((part, i) =>
                              part.highlight ? (
                                <mark key={i}>{part.text}</mark>
                              ) : (
                                <span key={i}>{part.text}</span>
                              )
                            )}
                          </p>
                        )}
                        <div className={styles.resultMeta}>
                          <span>{formatDateTime(episode.start_time)}</span>
                          <span>·</span>
                          <span>{formatDuration(episode.end_time - episode.start_time)}</span>
                          {episode.project && (
                            <>
                              <span>·</span>
                              <span className={styles.resultProject}>@{episode.project}</span>
                            </>
                          )}
                          {topics.slice(0, 3).map((t) => (
                            <span key={t} className={styles.resultTopic}>
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
