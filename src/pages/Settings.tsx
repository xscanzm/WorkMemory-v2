// 设置页：AI 配置 / 桌面伙伴 / 记录设置 / 隐私规则 / OCR / 数据管理

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useSettingsStore } from "@/store/useSettingsStore";
import * as ipc from "@/lib/ipc";
import { formatDate, cx } from "@/lib/utils";
import type { PrivacyRule, PrivacyRuleType, OcrStatus, DataStats, MascotForm } from "@/types";
import styles from "./Settings.module.css";

const SECTIONS = [
  { id: "ai", label: "AI 配置", icon: "🤖" },
  { id: "mascot", label: "桌面伙伴", icon: "🐾" },
  { id: "capture", label: "记录设置", icon: "📸" },
  { id: "privacy", label: "隐私规则", icon: "🔒" },
  { id: "ocr", label: "OCR 设置", icon: "👁️" },
  { id: "data", label: "数据管理", icon: "💾" },
] as const;

const MASCOT_FORMS: Array<{ id: MascotForm; label: string; emoji: string }> = [
  { id: "note", label: "便签", emoji: "📝" },
  { id: "film", label: "胶片", emoji: "🎬" },
  { id: "copilot", label: "副驾", emoji: "🚀" },
  { id: "cursor", label: "指针", emoji: "🖱️" },
  { id: "paper", label: "纸狐", emoji: "🦊" },
];

export function SettingsPage() {
  const toast = useToast();
  const { settings, loading, save, update, testAi } = useSettingsStore();
  const [activeSection, setActiveSection] = useState<string>("ai");
  const [privacyRules, setPrivacyRules] = useState<PrivacyRule[]>([]);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus | null>(null);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [newRule, setNewRule] = useState<{ type: PrivacyRuleType; pattern: string }>({ type: "app_name", pattern: "" });
  const [testingAi, setTestingAi] = useState(false);
  const [testingOcr, setTestingOcr] = useState(false);

  // 加载隐私规则
  const loadPrivacyRules = async () => {
    try {
      const rules = await ipc.privacyRuleList();
      setPrivacyRules(rules);
    } catch {
      /* ignore */
    }
  };

  // 加载 OCR 状态
  const loadOcrStatus = async () => {
    try {
      const status = await ipc.ocrStatus();
      setOcrStatus(status);
    } catch {
      /* ignore */
    }
  };

  // 加载数据统计
  const loadDataStats = async () => {
    try {
      const stats = await ipc.dataStats();
      setDataStats(stats);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void loadPrivacyRules();
    void loadOcrStatus();
    void loadDataStats();
  }, []);

  // 测试 AI 连接
  const handleTestAi = async () => {
    setTestingAi(true);
    try {
      const result = await testAi();
      toast.success(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "连接失败");
    } finally {
      setTestingAi(false);
    }
  };

  // 测试 OCR
  const handleTestOcr = async () => {
    setTestingOcr(true);
    try {
      const result = await ipc.ocrTest();
      toast.success(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR 测试失败");
    } finally {
      setTestingOcr(false);
    }
  };

  // 添加隐私规则
  const handleAddRule = async () => {
    if (!newRule.pattern.trim()) return;
    try {
      await ipc.privacyRuleAdd(newRule.type, newRule.pattern.trim());
      setNewRule({ type: "app_name", pattern: "" });
      await loadPrivacyRules();
      toast.success("已添加");
    } catch (e) {
      toast.error("添加失败");
    }
  };

  // 删除隐私规则
  const handleDeleteRule = async (id: string) => {
    try {
      await ipc.privacyRuleDelete(id);
      await loadPrivacyRules();
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  // 切换规则启用
  const handleToggleRule = async (id: string, enabled: boolean) => {
    try {
      await ipc.privacyRuleToggle(id, enabled);
      setPrivacyRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    } catch {
      toast.error("切换失败");
    }
  };

  // 清理数据
  const handleClearData = async () => {
    if (!confirm("确定清理所有数据？此操作不可恢复。")) return;
    try {
      await ipc.dataClear();
      await loadDataStats();
      toast.success("数据已清理");
    } catch {
      toast.error("清理失败");
    }
  };

  // 导出数据
  const handleExport = async () => {
    try {
      const data = await ipc.dataExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workmemory-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已导出");
    } catch {
      toast.error("导出失败");
    }
  };

  if (loading) {
    return <div className={styles.loading}>加载中…</div>;
  }

  return (
    <div className={styles.container}>
      {/* 左侧导航 */}
      <aside className={styles.sidebar}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={cx(styles.navItem, activeSection === s.id && styles.navItemActive)}
            onClick={() => setActiveSection(s.id)}
          >
            <span className={styles.navIcon}>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </aside>

      {/* 右侧内容 */}
      <main className={styles.main}>
        {activeSection === "ai" && (
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>AI 配置</h2>
            <div className={styles.form}>
              <Field label="API Key" hint="用于调用 AI 模型，安全存储在本地">
                <Input
                  type="password"
                  value={settings.ai_api_key}
                  onChange={(e) => void update({ ai_api_key: e.target.value })}
                  placeholder="sk-..."
                />
              </Field>
              <Field label="Base URL" hint="AI 服务地址">
                <Input
                  value={settings.ai_base_url}
                  onChange={(e) => void update({ ai_base_url: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </Field>
              <Field label="模型" hint="推荐 gpt-4o-mini 性价比最高">
                <Input
                  value={settings.ai_model}
                  onChange={(e) => void update({ ai_model: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </Field>
              <Button variant="primary" loading={testingAi} onClick={handleTestAi}>
                测试连接
              </Button>
            </div>
          </Card>
        )}

        {activeSection === "mascot" && (
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>桌面伙伴</h2>
            <div className={styles.form}>
              <Field label="启用桌面伙伴">
                <Switch
                  checked={settings.mascot_enabled}
                  onCheckedChange={(v) => void update({ mascot_enabled: v })}
                />
              </Field>
              <Field label="形象选择">
                <div className={styles.formGrid}>
                  {MASCOT_FORMS.map((form) => (
                    <button
                      key={form.id}
                      className={cx(styles.formCard, settings.mascot_form === form.id && styles.formCardActive)}
                      onClick={() => void update({ mascot_form: form.id })}
                    >
                      <span className={styles.formEmoji}>{form.emoji}</span>
                      <span className={styles.formLabel}>{form.label}</span>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={`大小：${settings.mascot_size}px`} hint="60-120px">
                <input
                  type="range"
                  min={60}
                  max={120}
                  step={4}
                  value={settings.mascot_size}
                  onChange={(e) => void update({ mascot_size: Number(e.target.value) })}
                  className={styles.slider}
                />
              </Field>
              <Field label="提醒配置">
                <div className={styles.checkboxList}>
                  <CheckboxRow
                    label="每日日报提醒"
                    checked={settings.reminder_daily_report}
                    onChange={(v) => void update({ reminder_daily_report: v })}
                  />
                  <CheckboxRow
                    label="每周周报提醒"
                    checked={settings.reminder_weekly_report}
                    onChange={(v) => void update({ reminder_weekly_report: v })}
                  />
                  <CheckboxRow
                    label="问候提醒"
                    checked={settings.reminder_greeting}
                    onChange={(v) => void update({ reminder_greeting: v })}
                  />
                  <CheckboxRow
                    label="专注 25 分钟提醒"
                    checked={settings.reminder_focus_25min}
                    onChange={(v) => void update({ reminder_focus_25min: v })}
                  />
                  <CheckboxRow
                    label="碎片化工作提醒"
                    checked={settings.reminder_fragmented}
                    onChange={(v) => void update({ reminder_fragmented: v })}
                  />
                  <CheckboxRow
                    label="长时间工作提醒"
                    checked={settings.reminder_long_work}
                    onChange={(v) => void update({ reminder_long_work: v })}
                  />
                  <CheckboxRow
                    label="夜间工作提醒"
                    checked={settings.reminder_night_work}
                    onChange={(v) => void update({ reminder_night_work: v })}
                  />
                </div>
              </Field>
              <Field label="免打扰时段">
                <div className={styles.dndRow}>
                  <Switch
                    checked={settings.dnd_enabled}
                    onCheckedChange={(v) => void update({ dnd_enabled: v })}
                  />
                  <Input
                    value={settings.dnd_start}
                    onChange={(e) => void update({ dnd_start: e.target.value })}
                    placeholder="22:00"
                    className={styles.timeInput}
                  />
                  <span>至</span>
                  <Input
                    value={settings.dnd_end}
                    onChange={(e) => void update({ dnd_end: e.target.value })}
                    placeholder="08:00"
                    className={styles.timeInput}
                  />
                </div>
              </Field>
            </div>
          </Card>
        )}

        {activeSection === "capture" && (
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>记录设置</h2>
            <div className={styles.form}>
              <Field label={`截图间隔：${settings.capture_interval_secs} 秒`}>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={settings.capture_interval_secs}
                  onChange={(e) => void update({ capture_interval_secs: Number(e.target.value) })}
                  className={styles.slider}
                />
              </Field>
              <Field label="保存截图文件">
                <Switch
                  checked={settings.save_screenshots}
                  onCheckedChange={(v) => void update({ save_screenshots: v })}
                />
              </Field>
              <Field label={`保留天数：${settings.screenshot_retention_days} 天`}>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={settings.screenshot_retention_days}
                  onChange={(e) => void update({ screenshot_retention_days: Number(e.target.value) })}
                  className={styles.slider}
                />
              </Field>
              <Field label="截图存储路径" hint="留空使用默认路径">
                <Input
                  value={settings.screenshot_path}
                  onChange={(e) => void update({ screenshot_path: e.target.value })}
                  placeholder="默认路径"
                />
              </Field>
            </div>
          </Card>
        )}

        {activeSection === "privacy" && (
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>隐私规则</h2>
            <p className={styles.sectionDesc}>匹配的应用/窗口/URL 不会被截图记录</p>
            <div className={styles.addRuleRow}>
              <Dropdown
                trigger={
                  <Button variant="secondary" size="sm">
                    {newRule.type === "app_name" ? "应用名" : newRule.type === "window_title" ? "窗口标题" : "URL 关键词"} ▾
                  </Button>
                }
              >
                <DropdownItem onSelect={() => setNewRule({ ...newRule, type: "app_name" })}>应用名</DropdownItem>
                <DropdownItem onSelect={() => setNewRule({ ...newRule, type: "window_title" })}>窗口标题</DropdownItem>
                <DropdownItem onSelect={() => setNewRule({ ...newRule, type: "url_keyword" })}>URL 关键词</DropdownItem>
              </Dropdown>
              <Input
                placeholder="输入匹配模式…"
                value={newRule.pattern}
                onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddRule();
                }}
              />
              <Button variant="primary" size="sm" onClick={handleAddRule}>
                添加
              </Button>
            </div>
            <div className={styles.ruleList}>
              {privacyRules.length === 0 && (
                <p className={styles.emptyHint}>还没有隐私规则</p>
              )}
              {privacyRules.map((rule) => (
                <div key={rule.id} className={styles.ruleItem}>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(v) => handleToggleRule(rule.id, v)}
                  />
                  <Badge variant="default">{rule.rule_type}</Badge>
                  <span className={styles.rulePattern}>{rule.pattern}</span>
                  <button className={styles.ruleDelete} onClick={() => handleDeleteRule(rule.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeSection === "ocr" && (
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>OCR 设置</h2>
            <div className={styles.form}>
              <Field label="引擎状态">
                <div className={styles.ocrStatus}>
                  <Badge variant={ocrStatus?.available ? "success" : "default"}>
                    {ocrStatus?.engine ?? "未知"}
                  </Badge>
                  <span className={styles.ocrLang}>{ocrStatus?.language ?? "zh-CN"}</span>
                </div>
              </Field>
              <Field label="引擎切换">
                <Dropdown
                  trigger={
                    <Button variant="secondary" size="sm">
                      {settings.ocr_engine === "windows" ? "Windows OCR" : "PaddleOCR"} ▾
                    </Button>
                  }
                >
                  <DropdownItem onSelect={() => void update({ ocr_engine: "windows" })}>
                    Windows OCR
                  </DropdownItem>
                  <DropdownItem onSelect={() => void update({ ocr_engine: "paddle" })}>
                    PaddleOCR
                  </DropdownItem>
                </Dropdown>
              </Field>
              <Button variant="primary" loading={testingOcr} onClick={handleTestOcr}>
                测试 OCR
              </Button>
            </div>
          </Card>
        )}

        {activeSection === "data" && (
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>数据管理</h2>
            <div className={styles.form}>
              <Field label="使用量统计">
                {dataStats && (
                  <div className={styles.statsGrid}>
                    <div className={styles.statBox}>
                      <div className={styles.statValue}>{dataStats.episodes}</div>
                      <div className={styles.statLabel}>事件</div>
                    </div>
                    <div className={styles.statBox}>
                      <div className={styles.statValue}>{dataStats.segments}</div>
                      <div className={styles.statLabel}>截图</div>
                    </div>
                    <div className={styles.statBox}>
                      <div className={styles.statValue}>{dataStats.wiki_pages}</div>
                      <div className={styles.statLabel}>知识卡片</div>
                    </div>
                    <div className={styles.statBox}>
                      <div className={styles.statValue}>{dataStats.reports}</div>
                      <div className={styles.statLabel}>报告</div>
                    </div>
                  </div>
                )}
              </Field>
              <Field label="数据操作">
                <div className={styles.dataActions}>
                  <Button variant="danger" onClick={handleClearData}>
                    清理所有数据
                  </Button>
                  <Button variant="secondary" onClick={handleExport}>
                    导出 JSON
                  </Button>
                </div>
              </Field>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

// ==================== 子组件 ====================

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <label className={styles.fieldLabel}>{label}</label>
        {hint && <span className={styles.fieldHint}>{hint}</span>}
      </div>
      <div className={styles.fieldBody}>{children}</div>
    </div>
  );
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.checkboxRow}>
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
