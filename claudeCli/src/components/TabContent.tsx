import React, { Suspense, lazy, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTabState } from '@/hooks/useTabState';
import { useScreenTracking } from '@/hooks/useAnalytics';
import type { Tab } from '@/contexts/contexts';
import type { Agent } from '@/lib/api';
import { Loader2, Plus, ChevronDown, MessageSquare, Bot, Folder, BarChart, Server, Settings as SettingsIcon, FileText } from 'lucide-react';
import { api, type Project, type Session, type ClaudeMdFile } from '@/lib/api';
import { ProjectList } from '@/components/ProjectList';
import { SessionList } from '@/components/SessionList';
import { RunningClaudeSessions } from '@/components/RunningClaudeSessions';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Lazy load heavy components
const ClaudeCodeSession = lazy(() => import('@/components/ClaudeCodeSession').then(m => ({ default: m.ClaudeCodeSession })));
const AgentRunOutputViewer = lazy(() => import('@/components/AgentRunOutputViewer'));
const AgentExecution = lazy(() => import('@/components/AgentExecution').then(m => ({ default: m.AgentExecution })));
const CreateAgent = lazy(() => import('@/components/CreateAgent').then(m => ({ default: m.CreateAgent })));
const UsageDashboard = lazy(() => import('@/components/UsageDashboard').then(m => ({ default: m.UsageDashboard })));
const MCPManager = lazy(() => import('@/components/MCPManager').then(m => ({ default: m.MCPManager })));
const Settings = lazy(() => import('@/components/Settings').then(m => ({ default: m.Settings })));
const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor').then(m => ({ default: m.MarkdownEditor })));
const ClaudeFileEditor = lazy(() => import('@/components/ClaudeFileEditor').then(m => ({ default: m.ClaudeFileEditor })));

import { handleError } from "@/lib/errorHandler";
// Import non-lazy components for projects view

/**
 * Props interface for the TabPanel component
 */
interface TabPanelProps {
  tab: Tab;
  isActive: boolean;
}

/**
 * TabPanel component for rendering individual tab content
 *
 * Renders the content for a specific tab based on its type. Handles different
 * tab types including projects, chat sessions, agent runs, and various
 * application views with proper state management and error handling.
 *
 * @param tab - The tab configuration object
 * @param isActive - Whether this tab is currently active
 *
 * @example
 * ```tsx
 * <TabPanel
 *   tab={projectTab}
 *   isActive={activeTabId === projectTab.id}
 * />
 * ```
 */
const TabPanel: React.FC<TabPanelProps> = ({ tab, isActive }) => {
  const { t } = useI18n();
  const { updateTab, createChatTab, closeTab, tabs } = useTabState();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Delete confirmation dialog state
  const [fileToDelete, setFileToDelete] = React.useState<ClaudeMdFile | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Track screen when tab becomes active
  useScreenTracking(isActive ? tab.type : undefined, isActive ? tab.id : undefined);

  // Load projects when tab becomes active and is of type 'projects'
  useEffect(() => {
    if (isActive && tab.type === "projects") {
      loadProjects();
    }
  }, [isActive, tab.type]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectList = await api.listProjects();
      setProjects(projectList);
    } catch (err) {
      await handleError("Failed to load projects:", { context: err });
      setError("Failed to load projects. Please ensure ~/.claude directory exists.");
    } finally {
      setLoading(false);
    }
  };

  const handleProjectClick = async (project: Project) => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await api.getProjectSessions(project.id);
      setSessions(sessionList);
      setSelectedProject(project);
    } catch (err) {
      await handleError("Failed to load sessions:", { context: err });
      setError("Failed to load sessions for this project.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedProject(null);
    setSessions([]);
  };

  const handleNewSession = () => {
    // Create a new chat tab
    createChatTab();
  };

  // Handle file deletion with proper confirmation
  const handleDeleteClaudeFile = async () => {
    if (!fileToDelete) return;

    setIsDeleting(true);
    try {
      await api.deleteClaudeMdFile(fileToDelete.absolute_path);

      // Close the tab if it's currently open
      const openTab = tabs.find(
        (tab) => tab.type === "claude-file" &&
        tab.claudeFileData?.absolute_path === fileToDelete.absolute_path
      );
      if (openTab) {
        closeTab(openTab.id);
      }

      // Emit a custom event to trigger file list refresh
      window.dispatchEvent(
        new CustomEvent("claude-file-deleted", {
          detail: { deletedFile: fileToDelete }
        })
      );

      setFileToDelete(null);
    } catch (error) {
      console.error("Failed to delete file:", error);
      alert("删除文件失败，请重试。");
    } finally {
      setIsDeleting(false);
    }
  };

  // Panel visibility - keep all panels rendered but only show active one
  const panelVisibilityClass = "";

  const renderContent = () => {
    switch (tab.type) {
      case "projects":
        return (
          <div className="h-full overflow-y-auto">
            <div className="container mx-auto p-6">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight">{t.projects.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t.projects.subtitle}</p>
              </div>

              {/* Error display */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive max-w-2xl"
                >
                  {error}
                </motion.div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Content */}
              {!loading && (
                <AnimatePresence mode="wait">
                  {selectedProject ? (
                    <motion.div
                      key="sessions"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <SessionList
                        sessions={sessions}
                        projectPath={selectedProject.path}
                        projectId={selectedProject.id}
                        onBack={handleBack}
                        onSessionClick={(session) => {
                          // Create a new chat tab instead of modifying the current projects tab
                          const projectName = session.project_path.split("/").pop() || "Session";
                          const newTabId = createChatTab(session.id, projectName);
                          // Update the new tab with session data
                          updateTab(newTabId, {
                            sessionData: session,
                            initialProjectPath: session.project_path,
                          });
                        }}
                        onEditClaudeFile={(file: ClaudeMdFile) => {
                          // Open CLAUDE.md file in a new tab
                          window.dispatchEvent(
                            new window.CustomEvent("open-claude-file", {
                              detail: { file },
                            })
                          );
                        }}
                        onCreateClaudeFile={() => {
                          if (!selectedProject) return;

                          // Create a new ClaudeMdFile object for the project root
                          const newFile: ClaudeMdFile = {
                            relative_path: "CLAUDE.md",
                            absolute_path: `${selectedProject.path}/CLAUDE.md`,
                            size: 0,
                            modified: Date.now() / 1000,
                          };

                          // Open new CLAUDE.md file in a new tab
                          window.dispatchEvent(
                            new window.CustomEvent("open-claude-file", {
                              detail: { file: newFile },
                            })
                          );
                        }}
                        onDeleteClaudeFile={async (file: ClaudeMdFile): Promise<boolean> => {
                          // Show confirmation dialog and return false immediately
                          // The actual deletion will be handled by the dialog
                          setFileToDelete(file);
                          return false; // Always return false to prevent immediate refresh
                        }}
                        onSessionDeleted={async (sessionId) => {
                          // Remove the deleted session from the local state
                          setSessions(prev => prev.filter(s => s.id !== sessionId));
                          
                          // Check if this was the last session in the project
                          const remainingSessions = sessions.filter(s => s.id !== sessionId);
                          if (remainingSessions.length === 0) {
                            // If no sessions remain, remove the project from the projects list
                            setProjects(prev => prev.filter(p => p.id !== selectedProject.id));
                            // Go back to projects view
                            handleBack();
                          }
                        }}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="projects"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      {/* New session button at the top */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mb-4"
                      >
                        <Button
                          onClick={handleNewSession}
                          size="default"
                          className="w-full max-w-md"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t.projects.newClaudeCodeSession}
                        </Button>
                      </motion.div>

                      {/* Running Claude Sessions */}
                      <RunningClaudeSessions />

                      {/* Project list */}
                      {projects.length > 0 ? (
                        <ProjectList
                          projects={projects}
                          onProjectClick={handleProjectClick}
                          onProjectSettings={(project) => {
                            // Project settings functionality can be added here if needed
                            logger.debug("Project settings clicked for:", project);
                          }}
                          loading={loading}
                          className="animate-fade-in"
                        />
                      ) : (
                        <div className="py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            No projects found in ~/.claude/projects
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        );

      case "chat":
        return (
          <ClaudeCodeSession
            session={tab.sessionData as Session} // Pass the full session object if available
            initialProjectPath={tab.initialProjectPath || (tab.sessionData as Session)?.project_path || ""}
            onBack={() => {
              // Go back to projects view in the same tab
              updateTab(tab.id, {
                type: "projects",
                title: t.projects.title,
              });
            }}
          />
        );

      case "agent":
        if (!tab.agentRunId) {
          return <div className="p-4">No agent run ID specified</div>;
        }
        return <AgentRunOutputViewer agentRunId={tab.agentRunId} tabId={tab.id} />;

      case "usage":
        return <UsageDashboard onBack={() => {}} />;

      case "mcp":
        return <MCPManager onBack={() => {}} />;

      case "settings":
        return <Settings onBack={() => {}} />;

      case "claude-md":
        return <MarkdownEditor onBack={() => {}} />;

      case "claude-file":
        if (!tab.claudeFileData && !tab.claudeFileId) {
          return <div className="p-4">No Claude file specified</div>;
        }

        if (tab.claudeFileData) {
          return (
            <ClaudeFileEditor
              file={tab.claudeFileData}
              onBack={() => closeTab(tab.id)}
            />
          );
        } else {
          // Fallback for older tabs that only have claudeFileId
          return <div className="p-4">Claude file editor not yet implemented for legacy tabs</div>;
        }

      case "agent-execution":
        if (!tab.agentData) {
          return <div className="p-4">No agent data specified</div>;
        }
        return <AgentExecution agent={tab.agentData as Agent} onBack={() => {}} />;

      case "create-agent":
        return (
          <CreateAgent
            onAgentCreated={() => {
              // Close this tab after agent is created
              window.dispatchEvent(
                new window.CustomEvent("close-tab", { detail: { tabId: tab.id } })
              );
            }}
            onBack={() => {
              // Close this tab when back is clicked
              window.dispatchEvent(
                new window.CustomEvent("close-tab", { detail: { tabId: tab.id } })
              );
            }}
          />
        );

      case "import-agent":
        // TODO: Implement import agent component
        return <div className="p-4">Import agent functionality coming soon...</div>;

      default:
        return <div className="p-4">Unknown tab type: {tab.type}</div>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={`h-full w-full ${panelVisibilityClass}`}
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        {renderContent()}
      </Suspense>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!fileToDelete} onOpenChange={(open) => {
        if (!open) {
          setFileToDelete(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除文件</DialogTitle>
            <DialogDescription>
              你确定要删除文件 "{fileToDelete?.relative_path}" 吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileToDelete(null)} disabled={isDeleting}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClaudeFile}
              disabled={isDeleting}
            >
              {isDeleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

/**
 * TabContent component for managing and displaying tab content
 *
 * The main content area that renders active tabs and manages tab switching.
 * Provides a tabbed interface for the application with support for multiple
 * concurrent views and smooth transitions between tabs.
 *
 * @example
 * ```tsx
 * <TabContent />
 * ```
 */
export const TabContent: React.FC = () => {
  const {
    tabs,
    activeTabId,
    createChatTab,
    findTabBySessionId,
    createClaudeFileTab,
    createAgentExecutionTab,
    createCreateAgentTab,
    createImportAgentTab,
    closeTab,
    updateTab,
    switchToTab,
  } = useTabState();
  const [showMobileTabSelector, setShowMobileTabSelector] = useState(false);

  // Get tab icon helper
  const getTabIcon = (tab: Tab) => {
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
        return SettingsIcon;
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

  // Mobile tab selector
  const MobileTabSelector = () => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (!activeTab) return null;

    const Icon = getTabIcon(activeTab);

    return (
      <div className="sm:hidden border-b border-border bg-background/95 backdrop-blur">
        <Popover
          trigger={
            <Button 
              variant="ghost" 
              className="w-full justify-between h-12 px-4 rounded-none"
              onClick={() => setShowMobileTabSelector(!showMobileTabSelector)}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{activeTab.title}</span>
                {activeTab.hasUnsavedChanges && (
                  <div className="w-2 h-2 bg-primary rounded-full" />
                )}
              </div>
              <ChevronDown className="w-4 h-4" />
            </Button>
          }
          content={
            <div className="w-64 max-h-80 overflow-y-auto p-2">
              <div className="space-y-1">
                {tabs.map((tab) => {
                  const TabIcon = getTabIcon(tab);
                  return (
                    <Button
                      key={tab.id}
                      variant={tab.id === activeTabId ? "secondary" : "ghost"}
                      className="w-full justify-start gap-2 h-10"
                      onClick={() => {
                        switchToTab(tab.id);
                        setShowMobileTabSelector(false);
                      }}
                    >
                      <TabIcon className="w-4 h-4" />
                      <span className="flex-1 truncate text-left">{tab.title}</span>
                      {tab.hasUnsavedChanges && (
                        <div className="w-2 h-2 bg-primary rounded-full" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          }
          open={showMobileTabSelector}
          onOpenChange={setShowMobileTabSelector}
          align="start"
        />
      </div>
    );
  };

  // Listen for events to open sessions in tabs
  useEffect(() => {
    const handleOpenSessionInTab = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { session } = customEvent.detail;

      // Check if tab already exists for this session
      const existingTab = findTabBySessionId(session.id);
      if (existingTab) {
        // Update existing tab with session data and switch to it
        updateTab(existingTab.id, {
          sessionData: session,
          title: session.project_path.split("/").pop() || "Session",
        });
        window.dispatchEvent(
          new CustomEvent("switch-to-tab", { detail: { tabId: existingTab.id } })
        );
      } else {
        // Create new tab for this session
        const projectName = session.project_path.split("/").pop() || "Session";
        const newTabId = createChatTab(session.id, projectName);
        // Update the new tab with session data
        updateTab(newTabId, {
          sessionData: session,
          initialProjectPath: session.project_path,
        });
      }
    };

    const handleOpenClaudeFile = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { file } = customEvent.detail;
      // Use the relative path as the file ID for tab identification
      const fileId = file.relative_path || "CLAUDE.md";
      const fileName = file.relative_path.split('/').pop() || "CLAUDE.md";
      createClaudeFileTab(fileId, fileName, file);
    };

    const handleOpenAgentExecution = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { agent, tabId } = customEvent.detail;
      createAgentExecutionTab(agent, tabId);
    };

    const handleOpenCreateAgentTab = () => {
      createCreateAgentTab();
    };

    const handleOpenImportAgentTab = () => {
      createImportAgentTab();
    };

    const handleCloseTab = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { tabId } = customEvent.detail;
      closeTab(tabId);
    };

    const handleClaudeSessionSelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { session } = customEvent.detail;
      // This event is only used by RunningClaudeSessions component
      // Regular SessionList uses the onSessionClick callback instead
      const existingTab = findTabBySessionId(session.id);
      if (existingTab) {
        updateTab(existingTab.id, {
          sessionData: session,
          title: session.project_path.split("/").pop() || "Session",
        });
        window.dispatchEvent(
          new CustomEvent("switch-to-tab", { detail: { tabId: existingTab.id } })
        );
      } else {
        const projectName = session.project_path.split("/").pop() || "Session";
        const newTabId = createChatTab(session.id, projectName);
        updateTab(newTabId, {
          sessionData: session,
          initialProjectPath: session.project_path,
        });
      }
    };

    window.addEventListener("open-session-in-tab", handleOpenSessionInTab);
    window.addEventListener("open-claude-file", handleOpenClaudeFile);
    window.addEventListener("open-agent-execution", handleOpenAgentExecution);
    window.addEventListener("open-create-agent-tab", handleOpenCreateAgentTab);
    window.addEventListener("open-import-agent-tab", handleOpenImportAgentTab);
    window.addEventListener("close-tab", handleCloseTab);
    window.addEventListener("claude-session-selected", handleClaudeSessionSelected);
    return () => {
      window.removeEventListener("open-session-in-tab", handleOpenSessionInTab);
      window.removeEventListener("open-claude-file", handleOpenClaudeFile);
      window.removeEventListener("open-agent-execution", handleOpenAgentExecution);
      window.removeEventListener("open-create-agent-tab", handleOpenCreateAgentTab);
      window.removeEventListener("open-import-agent-tab", handleOpenImportAgentTab);
      window.removeEventListener("close-tab", handleCloseTab);
      window.removeEventListener("claude-session-selected", handleClaudeSessionSelected);
    };
  }, [
    createChatTab,
    findTabBySessionId,
    createClaudeFileTab,
    createAgentExecutionTab,
    createCreateAgentTab,
    createImportAgentTab,
    closeTab,
    updateTab,
  ]);

  return (
    <div className="flex-1 h-full relative flex flex-col">
      <MobileTabSelector />
      <div className="flex-1 overflow-hidden relative">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`absolute inset-0 transition-opacity duration-200 ${
                isActive 
                  ? 'opacity-100 pointer-events-auto z-10' 
                  : 'opacity-0 pointer-events-none z-0'
              }`}
              style={{
                visibility: isActive ? 'visible' : 'hidden'
              }}
            >
              <TabPanel tab={tab} isActive={isActive} />
            </div>
          );
        })}

        {tabs.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">No tabs open</p>
              <p className="text-sm">Click the + button to start a new chat</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TabContent;
