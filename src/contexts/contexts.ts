/**
 * React contexts separated to avoid fast refresh warnings
 */
import { createContext } from "react";
import type { ClaudeMdFile } from "@/lib/api";

export interface Tab {
  id: string;
  type:
    | "chat"
    | "agent"
    | "projects"
    | "usage"
    | "mcp"
    | "settings"
    | "claude-md"
    | "claude-file"
    | "agent-execution"
    | "create-agent"
    | "import-agent";
  title: string;
  customTitle?: string; // Custom user-defined title for the tab
  sessionId?: string;
  sessionData?: unknown;
  agentRunId?: string;
  agentData?: unknown;
  claudeFileId?: string;
  claudeFileData?: ClaudeMdFile;
  initialProjectPath?: string;
  status: "active" | "idle" | "running" | "complete" | "error";
  hasUnsavedChanges: boolean;
  order: number;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
  // State memory for preserving component state across navigation
  componentState?: {
    selectedProject?: unknown;
    currentPage?: number;
    scrollPosition?: number;
    [key: string]: unknown;
  };
  // Parent tab ID for hierarchical navigation
  parentTabId?: string;
}

interface TabContextType {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (tab: Omit<Tab, "id" | "order" | "createdAt" | "updatedAt">) => string;
  removeTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (startIndex: number, endIndex: number) => void;
  getTabById: (id: string) => Tab | undefined;
  closeAllTabs: () => void;
  getTabsByType: (type: "chat" | "agent") => Tab[];
}

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

export const TabContext = createContext<TabContextType | undefined>(undefined);
export const ToastContext = createContext<ToastContextValue | undefined>(undefined);


