// 主应用：配置路由（Today/Search/Reports/Wiki/Insights/Calendar/Graph/Settings）

import { useEffect, useMemo, type ReactNode } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { MainLayout, type NavItem, type CommandItem } from "@/components/layout";
import { TooltipProvider, ToastProvider } from "@/components/ui";
import { useUIStore } from "@/store/useUIStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { TodayPage } from "@/pages/Today";
import { SearchPage } from "@/pages/Search";
import { ReportsPage } from "@/pages/Reports";
import { WikiPage } from "@/pages/Wiki";
import { InsightsPage } from "@/pages/Insights";
import { CalendarPage } from "@/pages/Calendar";
import { GraphPage } from "@/pages/Graph";
import { SettingsPage } from "@/pages/Settings";

// 导航图标（统一 SVG）
const navIcons = {
  today: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 7H15.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 1.5V4M12 1.5V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="11" r="1.4" fill="currentColor" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 12L16 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 2H11L14 5V16H4V2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11 2V5H14" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 9H12M6 12H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  wiki: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L15 5V13L9 16L3 13V5L9 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 2V16M3 5L15 13M15 5L3 13" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    </svg>
  ),
  insights: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 14L7 9L10 12L15 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15" cy="5" r="1.5" fill="currentColor" />
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 7H15.5M6 1.5V4M12 1.5V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  graph: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="14" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 5L12 6M12 7.5L10 12M6 5.5L8 12" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9 1.5V3M9 15V16.5M3.34 3.34L4.4 4.4M13.6 13.6L14.66 14.66M1.5 9H3M15 9H16.5M3.34 14.66L4.4 13.6M13.6 4.4L14.66 3.34"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
};

const navItems: NavItem[] = [
  { key: "today", label: "今日", icon: navIcons.today, path: "/today" },
  { key: "search", label: "搜索", icon: navIcons.search, path: "/search" },
  { key: "reports", label: "报告", icon: navIcons.reports, path: "/reports" },
  { key: "wiki", label: "知识库", icon: navIcons.wiki, path: "/wiki" },
  { key: "insights", label: "洞察", icon: navIcons.insights, path: "/insights" },
  { key: "calendar", label: "日历", icon: navIcons.calendar, path: "/calendar" },
  { key: "graph", label: "图谱", icon: navIcons.graph, path: "/graph" },
  { key: "settings", label: "设置", icon: navIcons.settings, path: "/settings" },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const loadSettings = useSettingsStore((s) => s.load);

  // 启动时加载设置
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // 同步主题到 body
  useEffect(() => {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  // 命令面板命令
  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: "cmd-toggle-theme",
        label: theme === "light" ? "切换到深色模式" : "切换到浅色模式",
        group: "操作",
        action: () => setTheme(theme === "light" ? "dark" : "light"),
      },
      {
        id: "cmd-quick-capture",
        label: "快速记一笔",
        hint: "输入",
        group: "操作",
        action: () => navigate("/today"),
      },
    ],
    [theme, setTheme, navigate]
  );

  // 当前路由对应的右侧详情
  const renderDetail = (): ReactNode => {
    if (location.pathname === "/today") {
      // Today 页面内部管理详情面板
      return null;
    }
    return undefined;
  };

  return (
    <ToastProvider>
      <TooltipProvider>
        <MainLayout navItems={navItems} commands={commands} showDetail={false}>
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/wiki" element={<WikiPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </MainLayout>
      </TooltipProvider>
    </ToastProvider>
  );
}
