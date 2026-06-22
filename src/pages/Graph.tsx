// 图谱页：SVG 图谱可视化 + 缩放/平移/悬停/点击/搜索

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import * as ipc from "@/lib/ipc";
import { cx } from "@/lib/utils";
import type { GraphData, GraphNode } from "@/types";
import styles from "./Graph.module.css";

// 类型颜色
const TYPE_COLORS: Record<string, string> = {
  person: "#10B981",
  project: "#F59E0B",
  decision: "#8B5CF6",
  meeting: "#EC4899",
  topic: "#06B6D4",
  skill: "#F97316",
  default: "#5B6AF0",
};

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function GraphPage() {
  const toast = useToast();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const d = await ipc.graphData();
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // 力导向布局（简化版，仅初始化时计算）
  const positionedNodes = useMemo<PositionedNode[]>(() => {
    if (!data || data.nodes.length === 0) return [];
    const width = 800;
    const height = 600;
    const center = { x: width / 2, y: height / 2 };

    // 圆形布局
    return data.nodes.map((node, i) => {
      const angle = (i / data.nodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) / 3;
      return {
        ...node,
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });
  }, [data]);

  // 节点 ID 到位置映射
  const nodeMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    positionedNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [positionedNodes]);

  // 高亮搜索匹配
  const matchedIds = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const q = search.toLowerCase();
    return new Set(
      positionedNodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)
    );
  }, [search, positionedNodes]);

  // 缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.3, Math.min(3, prev.scale * delta)),
    }));
  };

  // 拖拽平移
  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: transform.x,
      baseY: transform.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setTransform((prev) => ({
      ...prev,
      x: dragRef.current!.baseX + dx,
      y: dragRef.current!.baseY + dy,
    }));
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  // 重置视图
  const resetView = () => setTransform({ x: 0, y: 0, scale: 1 });

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">知识图谱</h1>
          <p className="page-subtitle">
            节点 = 知识卡片，边 = 被同一事件提及。滚轮缩放，拖拽平移。
          </p>
        </div>
        <div className={styles.toolbar}>
          <Input
            icon={<span>🔍</span>}
            placeholder="搜索节点…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          <button className={styles.toolBtn} onClick={resetView} title="重置视图">
            ⤢
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {/* 图谱画布 */}
        <Card padding="none" className={styles.canvasCard}>
          {loading && <div className={styles.loadingHint}>加载中…</div>}
          {!loading && (!data || data.nodes.length === 0) && (
            <EmptyState
              illustration="🕸️"
              title="图谱还是空的"
              description="随着知识库积累，这里会展示知识卡片之间的关联图谱。"
            />
          )}
          {data && data.nodes.length > 0 && (
            <svg
              ref={svgRef}
              className={styles.svg}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                {/* 边 */}
                {data.edges.map((edge, i) => {
                  const source = nodeMap.get(edge.source);
                  const target = nodeMap.get(edge.target);
                  if (!source || !target) return null;
                  const isHighlighted =
                    matchedIds.size === 0 ||
                    matchedIds.has(edge.source) ||
                    matchedIds.has(edge.target);
                  return (
                    <line
                      key={i}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="var(--color-border)"
                      strokeWidth={1 + edge.weight * 0.5}
                      opacity={isHighlighted ? 0.5 : 0.1}
                    />
                  );
                })}
                {/* 节点 */}
                {positionedNodes.map((node) => {
                  const color = TYPE_COLORS[node.wiki_type] ?? TYPE_COLORS.default;
                  const radius = Math.max(8, node.size);
                  const isMatched = matchedIds.size === 0 || matchedIds.has(node.id);
                  const isSelected = selectedNode?.id === node.id;
                  const isHovered = hoveredNode?.id === node.id;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      style={{ cursor: "pointer", opacity: isMatched ? 1 : 0.3 }}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={() => setSelectedNode(node)}
                    >
                      <motion.circle
                        r={radius}
                        fill={color}
                        fillOpacity={0.2}
                        stroke={color}
                        strokeWidth={isSelected ? 3 : 1.5}
                        animate={{
                          r: isHovered ? radius * 1.15 : radius,
                        }}
                        transition={{ duration: 0.15 }}
                      />
                      <text
                        textAnchor="middle"
                        y={radius + 12}
                        fontSize={11}
                        fill="var(--color-text-primary)"
                        fontWeight={isSelected ? 600 : 400}
                      >
                        {node.label.length > 12 ? node.label.slice(0, 12) + "…" : node.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* 悬停 tooltip */}
          {hoveredNode && (
            <div className={styles.tooltip}>
              <div className={styles.tooltipTitle}>{hoveredNode.label}</div>
              <div className={styles.tooltipMeta}>
                类型: {hoveredNode.wiki_type} · 引用: {Math.round(hoveredNode.size)}
              </div>
            </div>
          )}
        </Card>

        {/* 右侧选中节点详情 */}
        {selectedNode && (
          <Card padding="md" className={styles.detailCard}>
            <h3 className={styles.detailTitle}>{selectedNode.label}</h3>
            <div className={styles.detailMeta}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>类型</span>
                <span
                  className={styles.metaValue}
                  style={{ color: TYPE_COLORS[selectedNode.wiki_type] ?? TYPE_COLORS.default }}
                >
                  {selectedNode.wiki_type}
                </span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>引用次数</span>
                <span className={styles.metaValue}>{Math.round(selectedNode.size)}</span>
              </div>
            </div>
            <div className={styles.relatedSection}>
              <h4 className={styles.relatedTitle}>关联节点</h4>
              {data && (
                <div className={styles.relatedList}>
                  {data.edges
                    .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                    .slice(0, 10)
                    .map((edge, i) => {
                      const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const other = nodeMap.get(otherId);
                      if (!other) return null;
                      return (
                        <button
                          key={i}
                          className={styles.relatedItem}
                          onClick={() => setSelectedNode(other)}
                        >
                          <span
                            className={styles.relatedDot}
                            style={{ background: TYPE_COLORS[other.wiki_type] ?? TYPE_COLORS.default }}
                          />
                          <span className={styles.relatedLabel}>{other.label}</span>
                          <span className={styles.relatedWeight}>{edge.weight}</span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
