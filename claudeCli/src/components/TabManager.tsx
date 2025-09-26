import React, { useState, useEffect } from 'react';
import { Reorder } from 'framer-motion';
import { X, Plus, MessageSquare, Bot, AlertCircle, Loader2, Folder, BarChart, Server, Settings, FileText } from 'lucide-react';
import { useTabState } from '@/hooks/useTabState';
import { Tab } from '@/contexts/contexts';
import { useTabContext } from '@/hooks';
import { cn } from '@/lib/utils';
import { useTrackEvent } from '@/hooks';

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onClose: (id: string) => void;
  onClick: (id: string) => void;
  isDragging?: boolean;
  setDraggedTabId?: (id: string | null) => void;
}

const TabItem: React.FC<TabItemProps> = ({ tab, isActive, onClose, onClick, isDragging = false, setDraggedTabId }) => {
  const [isHovered, setIsHovered] = useState(false);

  const getIcon = () => {
    switch (tab.type) {
      case "chat":
        return MessageSquare;
      case "agent":
        return Bot;
      case "projects":
        return Folder;
      case "usage":
        return BarChart;
      case "mcp":
        return Server;
      case "settings":
        return Settings;
      case "claude-md":
      case "claude-file":
        return FileText;
      case "agent-execution":
        return Bot;
      case "create-agent":
        return Plus;
      case "import-agent":
        return Plus;
      default:
        return MessageSquare;
    }
  };

  const getStatusIcon = () => {
    switch (tab.status) {
      case "running":
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case "error":
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };

  const Icon = getIcon();
  const statusIcon = getStatusIcon();

  return (
    <Reorder.Item
      value={tab}
      id={tab.id}
      dragListener={true}
      transition={{ duration: 0.1 }}
      className={cn(
        "relative flex items-center gap-2 text-sm cursor-pointer select-none group",
        "transition-colors duration-100 overflow-hidden border-b border-border/20",
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:transition-colors before:duration-100",
        isActive
          ? "bg-card text-card-foreground before:bg-primary"
          : "bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground before:bg-transparent",
        isDragging && "bg-card border-primary/50 shadow-sm z-50",
        "w-full p-3 min-h-[48px]"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onClick(tab.id)}
      onDragStart={() => setDraggedTabId?.(tab.id)}
      onDragEnd={() => setDraggedTabId?.(null)}
    >
      {/* Tab Icon */}
      <div className="flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>

      {/* Tab Title */}
      <span className="flex-1 truncate text-xs font-medium min-w-0">
        {tab.title}
      </span>

      {/* Status Indicators */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {statusIcon && (
          <span className="flex items-center justify-center">
            {statusIcon}
          </span>
        )}

        {tab.hasUnsavedChanges && !statusIcon && (
          <span
            className="w-1.5 h-1.5 bg-primary rounded-full"
            title="Unsaved changes"
          />
        )}

        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
          className={cn(
            "flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-sm",
            "transition-all duration-100 hover:bg-destructive/20 hover:text-destructive",
            "focus:outline-none focus:ring-1 focus:ring-destructive/50",
            (isHovered || isActive) ? "opacity-100" : "opacity-0"
          )}
          title={`Close ${tab.title}`}
          tabIndex={-1}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </Reorder.Item>
  );
};

/**
 * Props for the TabManager component
 */
interface TabManagerProps {
  className?: string;
}

export /**
 * TabManager component for managing multiple application tabs
 *
 * Provides a complete tab interface with drag-and-drop reordering,
 * tab creation, closing, and content rendering. Supports different
 * tab types including chat, agent, projects, and settings.
 *
 * @param children - Tab content to render
 * @param className - Optional CSS class name
 * @param onTabChange - Callback when active tab changes
 * @param maxTabs - Maximum number of tabs allowed
 *
 * @example
 * ```tsx
 * <TabManager
 *   onTabChange={(tabId) => console.log('Active tab:', tabId)}
 *   maxTabs={10}
 * >
 *   <TabContent />
 * </TabManager>
 * ```
 */
const TabManager: React.FC<TabManagerProps> = ({ className }) => {
  const { tabs, activeTabId, createChatTab, createProjectsTab, closeTab, switchToTab, canAddTab } =
    useTabState();

  // Access reorderTabs from context
  const { reorderTabs } = useTabContext();

  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  // Analytics tracking
  const trackEvent = useTrackEvent();

  // Listen for tab switch events
  useEffect(() => {
    const handleSwitchToTab = (event: Event) => {
      const { tabId } = (event as CustomEvent).detail;
      switchToTab(tabId);
    };

    window.addEventListener("switch-to-tab", handleSwitchToTab as EventListener);
    return () => {
      window.removeEventListener("switch-to-tab", handleSwitchToTab as EventListener);
    };
  }, [switchToTab]);

  // Listen for keyboard shortcut events
  useEffect(() => {
    const handleCreateTab = () => {
      createChatTab();
      trackEvent.tabCreated('chat');
    };

    const handleCloseTab = async () => {
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          trackEvent.tabClosed(tab.type);
        }
        await closeTab(activeTabId);
      }
    };

    const handleNextTab = () => {
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
      const nextIndex = (currentIndex + 1) % tabs.length;
      if (tabs[nextIndex]) {
        switchToTab(tabs[nextIndex].id);
      }
    };

    const handlePreviousTab = () => {
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
      const previousIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
      if (tabs[previousIndex]) {
        switchToTab(tabs[previousIndex].id);
      }
    };

    const handleTabByIndex = (event: Event) => {
      const { index } = (event as CustomEvent).detail;
      if (tabs[index]) {
        switchToTab(tabs[index].id);
      }
    };

    window.addEventListener("create-chat-tab", handleCreateTab);
    window.addEventListener("close-current-tab", handleCloseTab);
    window.addEventListener("switch-to-next-tab", handleNextTab);
    window.addEventListener("switch-to-previous-tab", handlePreviousTab);
    window.addEventListener("switch-to-tab-by-index", handleTabByIndex as EventListener);

    return () => {
      window.removeEventListener("create-chat-tab", handleCreateTab);
      window.removeEventListener("close-current-tab", handleCloseTab);
      window.removeEventListener("switch-to-next-tab", handleNextTab);
      window.removeEventListener("switch-to-previous-tab", handlePreviousTab);
      window.removeEventListener("switch-to-tab-by-index", handleTabByIndex as EventListener);
    };
  }, [tabs, activeTabId, createChatTab, closeTab, switchToTab]);

  // Check scroll buttons visibility - removed for vertical layout
  // const checkScrollButtons = () => {
  //   const container = scrollContainerRef.current;
  //   if (!container) return;

  //   const { scrollLeft, scrollWidth, clientWidth } = container;
  //   setShowLeftScroll(scrollLeft > 0);
  //   setShowRightScroll(scrollLeft + clientWidth < scrollWidth - 1);
  // };

  // Removed scroll effect for vertical layout
  // useEffect(() => {
  //   checkScrollButtons();
  //   const container = scrollContainerRef.current;
  //   if (!container) return;

  //   container.addEventListener("scroll", checkScrollButtons);
  //   window.addEventListener("resize", checkScrollButtons);

  //   return () => {
  //     container.removeEventListener("scroll", checkScrollButtons);
  //     window.removeEventListener("resize", checkScrollButtons);
  //   };
  // }, [tabs]);

  const handleReorder = (newOrder: Tab[]) => {
    // Find the positions that changed
    const oldOrder = tabs.map(tab => tab.id);
    const newOrderIds = newOrder.map(tab => tab.id);

    // Find what moved
    const movedTabId = newOrderIds.find((id, index) => oldOrder[index] !== id);
    if (!movedTabId) return;

    const oldIndex = oldOrder.indexOf(movedTabId);
    const newIndex = newOrderIds.indexOf(movedTabId);

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      // Use the context's reorderTabs function
      reorderTabs(oldIndex, newIndex);
      // Track the reorder event
      trackEvent.featureUsed?.('tab_reorder', 'drag_drop', {
        from_index: oldIndex,
        to_index: newIndex
      });
    }
  };

  const handleCloseTab = async (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      trackEvent.tabClosed(tab.type);
    }
    await closeTab(id);
  };

  const handleNewTab = () => {
    if (canAddTab()) {
      createProjectsTab();
      trackEvent.tabCreated('projects');
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-muted/15 border-r w-64 md:w-56 lg:w-64 flex-shrink-0 hidden sm:flex", className)}>
      {/* Tab Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground">Tabs</span>
        <button
          onClick={handleNewTab}
          disabled={!canAddTab()}
          className={cn(
            "p-1.5 rounded-md transition-all duration-200 flex items-center justify-center",
            "border border-border/50 bg-background/50 backdrop-blur-sm",
            canAddTab()
              ? "hover:bg-muted/80 hover:border-border text-muted-foreground hover:text-foreground hover:shadow-sm"
              : "opacity-50 cursor-not-allowed bg-muted/30"
          )}
          title={canAddTab() ? "Browse projects (Ctrl+T)" : `Maximum tabs reached (${tabs.length}/20)`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs container */}
      <div className="flex-1 overflow-y-auto">
        <Reorder.Group
          axis="y"
          values={tabs}
          onReorder={handleReorder}
          className="flex flex-col"
          layoutScroll={false}
        >
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onClose={handleCloseTab}
              onClick={switchToTab}
              isDragging={draggedTabId === tab.id}
              setDraggedTabId={setDraggedTabId}
            />
          ))}
        </Reorder.Group>
      </div>
    </div>
  );
};

export default TabManager;
