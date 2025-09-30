import React, { useState, useCallback, useEffect } from "react";
import { generateTabId, MAX_TABS } from "./tabUtils";
import { Tab, TabContext } from "./contexts";

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

const STORAGE_KEY = 'claudia_tabs';
const CUSTOM_TAB_NAMES_KEY = 'claudia_custom_tab_names'; // 存储会话自定义名称

export const TabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);

  // Helper functions for custom tab names persistence
  const saveCustomTabName = useCallback((sessionId: string, customName: string) => {
    try {
      const stored = localStorage.getItem(CUSTOM_TAB_NAMES_KEY);
      const customNames = stored ? JSON.parse(stored) : {};
      customNames[sessionId] = customName;
      localStorage.setItem(CUSTOM_TAB_NAMES_KEY, JSON.stringify(customNames));
    } catch (error) {
      console.error('Failed to save custom tab name:', error);
    }
  }, []);

  const getCustomTabName = useCallback((sessionId: string): string | undefined => {
    try {
      const stored = localStorage.getItem(CUSTOM_TAB_NAMES_KEY);
      if (stored) {
        const customNames = JSON.parse(stored);
        return customNames[sessionId];
      }
    } catch (error) {
      console.error('Failed to get custom tab name:', error);
    }
    return undefined;
  }, []);

  const removeCustomTabName = useCallback((sessionId: string) => {
    try {
      const stored = localStorage.getItem(CUSTOM_TAB_NAMES_KEY);
      if (stored) {
        const customNames = JSON.parse(stored);
        delete customNames[sessionId];
        localStorage.setItem(CUSTOM_TAB_NAMES_KEY, JSON.stringify(customNames));
      }
    } catch (error) {
      console.error('Failed to remove custom tab name:', error);
    }
  }, []);

  // Custom setActiveTab that maintains navigation history
  const setActiveTabWithHistory = useCallback((tabId: string | null) => {
    if (tabId && activeTabId && tabId !== activeTabId) {
      // Add current tab to navigation history (avoid duplicates and keep max 10 entries)
      setNavigationHistory((prev) => {
        const filtered = prev.filter(id => id !== activeTabId && id !== tabId);
        return [activeTabId, ...filtered].slice(0, 50);
      });
    }
    setActiveTabId(tabId);
  }, [activeTabId]);

  // Initialize with default projects tab on mount (don't restore previous session)
  useEffect(() => {
    // Always start fresh with just the projects tab
    const defaultTab: Tab = {
      id: generateTabId(),
      type: "projects",
      title: "CC 项目", // Updated to use Chinese
      status: "idle",
      hasUnsavedChanges: false,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setTabs([defaultTab]);
    setActiveTabId(defaultTab.id);
    
    // Clear any existing saved tabs to prevent accumulation
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Note: Tabs are no longer persisted to localStorage for a fresh start each session

  const addTab = useCallback(
    (tabData: Omit<Tab, "id" | "order" | "createdAt" | "updatedAt">): string => {
      if (tabs.length >= MAX_TABS) {
        throw new Error(`Maximum number of tabs (${MAX_TABS}) reached`);
      }

      // 如果是chat或agent类型，尝试恢复保存的自定义名称
      let customTitle = tabData.customTitle;
      if ((tabData.type === 'chat' || tabData.type === 'agent') && !customTitle) {
        const sessionId = tabData.sessionId || (tabData.sessionData as any)?.id;
        if (sessionId) {
          const savedCustomName = getCustomTabName(sessionId);
          if (savedCustomName) {
            customTitle = savedCustomName;
          }
        }
      }

      const newTab: Tab = {
        ...tabData,
        customTitle,
        id: generateTabId(),
        order: tabs.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setTabs((prevTabs) => [...prevTabs, newTab]);
      setActiveTabWithHistory(newTab.id);
      return newTab.id;
    },
    [tabs.length, getCustomTabName, setActiveTabWithHistory]
  );

  const removeTab = useCallback(
    (id: string) => {
      // First, determine what the new active tab should be
      const currentTabs = tabs;
      const tabToRemove = currentTabs.find((tab) => tab.id === id);
      
      // If removing a chat tab with an active session, emit cleanup event
      if (tabToRemove?.type === "chat" && tabToRemove.sessionData) {
        const event = new CustomEvent("tab-cleanup", {
          detail: { 
            tabId: id, 
            tabType: tabToRemove.type,
            sessionData: tabToRemove.sessionData 
          }
        });
        window.dispatchEvent(event);
      }

      const filteredTabs = currentTabs.filter((tab) => tab.id !== id);

      // Reorder remaining tabs
      const reorderedTabs = filteredTabs.map((tab, index) => ({
        ...tab,
        order: index,
      }));

      // Update active tab if necessary - do this BEFORE updating tabs
      if (activeTabId === id && reorderedTabs.length > 0) {
        let newActiveTabId: string | null = null;
        
        // First priority: Try to return to parent tab if it exists
        if (tabToRemove?.parentTabId) {
          const parentTab = reorderedTabs.find(tab => tab.id === tabToRemove.parentTabId);
          if (parentTab) {
            newActiveTabId = parentTab.id;
          }
        }
        
        // Second priority: Use navigation history
        if (!newActiveTabId) {
          for (const historyTabId of navigationHistory) {
            if (reorderedTabs.find(tab => tab.id === historyTabId)) {
              newActiveTabId = historyTabId;
              break;
            }
          }
        }
        
        // Third priority: Fall back to index-based selection
        if (!newActiveTabId) {
        const removedTabIndex = currentTabs.findIndex((tab) => tab.id === id);
        const newActiveIndex = Math.min(removedTabIndex, reorderedTabs.length - 1);
          newActiveTabId = reorderedTabs[newActiveIndex].id;
        }
        
        setActiveTabId(newActiveTabId);
        
        // Remove the closed tab from navigation history
        setNavigationHistory(prev => prev.filter(tabId => tabId !== id));
      } else if (reorderedTabs.length === 0) {
        setActiveTabId(null);
        setNavigationHistory([]);
      }

      // Update tabs after active tab is set
      setTabs(reorderedTabs);
    },
    [activeTabId, tabs]
  );

  const updateTab = useCallback((id: string, updates: Partial<Tab>) => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.id === id) {
          const updatedTab = { ...tab, ...updates, updatedAt: new Date() };
          
          // 如果更新了customTitle，保存到localStorage
          if ('customTitle' in updates && (tab.type === 'chat' || tab.type === 'agent')) {
            const sessionId = tab.sessionId || (tab.sessionData as any)?.id;
            if (sessionId) {
              if (updates.customTitle) {
                saveCustomTabName(sessionId, updates.customTitle);
              } else {
                // 如果customTitle被清除，也从存储中删除
                removeCustomTabName(sessionId);
              }
            }
          }
          
          return updatedTab;
        }
        return tab;
      })
    );
  }, [saveCustomTabName, removeCustomTabName]);

  // Update setActiveTabWithHistory to include tab status updates
  const setActiveTabWithHistoryAndStatus = useCallback((id: string) => {
      if (tabs.find((tab) => tab.id === id)) {
      setActiveTabWithHistory(id);
        // Update tab status to track which tab was last active
        setTabs((prevTabs) =>
          prevTabs.map((tab) => ({
            ...tab,
            status: tab.id === id ? "active" : (tab.status === "active" ? "idle" : tab.status),
            updatedAt: new Date(),
          }))
        );
      }
  }, [tabs, setActiveTabWithHistory]);

  const reorderTabs = useCallback((startIndex: number, endIndex: number) => {
    setTabs((prevTabs) => {
      const newTabs = [...prevTabs];
      const [removed] = newTabs.splice(startIndex, 1);
      newTabs.splice(endIndex, 0, removed);

      // Update order property
      return newTabs.map((tab, index) => ({
        ...tab,
        order: index,
      }));
    });
  }, []);

  const getTabById = useCallback(
    (id: string): Tab | undefined => {
      return tabs.find((tab) => tab.id === id);
    },
    [tabs]
  );

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
  }, []);

  const getTabsByType = useCallback(
    (type: "chat" | "agent"): Tab[] => {
      return tabs.filter((tab) => tab.type === type);
    },
    [tabs]
  );

  const value: TabContextType = {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    updateTab,
    setActiveTab: setActiveTabWithHistoryAndStatus,
    reorderTabs,
    getTabById,
    closeAllTabs,
    getTabsByType,
  };

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};
