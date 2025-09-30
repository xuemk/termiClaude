import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  FolderOpen,
  Copy,
  ChevronDown,
  GitBranch,
  Settings,
  ChevronUp,
  X,
  Hash,
  Command,
  RefreshCw,
  Brain,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Session, type EnvironmentVariableGroup } from "@/lib/api";
import { type ClaudeModel } from "@/types/models";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { StreamMessage } from "./StreamMessage";
import { FloatingPromptInput, type FloatingPromptInputRef } from "./FloatingPromptInput";
import { ErrorBoundary } from "./ErrorBoundary";
import { TimelineNavigator } from "./TimelineNavigator";
import { CheckpointSettings } from "./CheckpointSettings";
import { SlashCommandsManager } from "./SlashCommandsManager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Toast, ToastContainer } from "@/components/ui/toast";

import { SplitPane } from "@/components/ui/split-pane";
import { WebviewPreview } from "./WebviewPreview";
import type { ClaudeStreamMessage } from "./AgentExecution";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useI18n } from "@/lib/i18n";
import { logger } from "@/lib/logger";
import { handleError, handleApiError, handleValidationError } from "@/lib/errorHandler";
import { notificationManager } from "@/lib/notificationManager";
import { useTrackEvent, useComponentMetrics, useWorkflowTracking, useMessageDisplayMode } from "@/hooks";
// import { createDebouncedUpdater } from "@/lib/streamOptimization";
interface ClaudeCodeSessionProps {
  /**
   * Optional session to resume (when clicking from SessionList)
   */
  session?: Session;
  /**
   * Initial project path (for new sessions)
   */
  initialProjectPath?: string;
  /**
   * Callback to go back
   */
  onBack: () => void;
  /**
   * Callback to open hooks configuration
   */
  onProjectSettings?: (projectPath: string) => void;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Callback when streaming state changes
   */
  onStreamingChange?: (isStreaming: boolean, sessionId: string | null) => void;
}

/**
 * ClaudeCodeSession component for interactive Claude Code sessions
 *
 * This component provides a complete interface for running Claude Code sessions
 * with features like streaming output, checkpoint management, and session resumption.
 *
 * @param session - Optional existing session to resume
 * @param initialProjectPath - Initial project path for new sessions
 * @param onBack - Callback function to navigate back
 * @param onProjectSettings - Callback to open project settings
 * @param className - Optional CSS class name
 * @param onStreamingChange - Callback when streaming state changes
 *
 * @example
 * ```tsx
 * <ClaudeCodeSession
 *   session={existingSession}
 *   onBack={() => setView('projects')}
 *   onProjectSettings={(path) => openSettings(path)}
 * />
 * ```
 */
export const ClaudeCodeSession: React.FC<ClaudeCodeSessionProps> = ({
  session,
  initialProjectPath = "",
  onBack,
  onProjectSettings,
  className,
  onStreamingChange,
}) => {
  const { t } = useI18n();
  const [projectPath, setProjectPath] = useState(initialProjectPath || session?.project_path || "");
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [copyPopoverOpen, setCopyPopoverOpen] = useState(false);

  const [totalTokens, setTotalTokens] = useState(0);
  const [extractedSessionInfo, setExtractedSessionInfo] = useState<{
    sessionId: string;
    projectId: string;
  } | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showSlashCommandsSettings, setShowSlashCommandsSettings] = useState(false);
  const [forkCheckpointId, setForkCheckpointId] = useState<string | null>(null);
  const [forkSessionName, setForkSessionName] = useState("");

  // 环境分组状态
  const [envGroups, setEnvGroups] = useState<EnvironmentVariableGroup[]>([]);
  const [selectedEnvGroup, setSelectedEnvGroup] = useState<number | null>(null);
  const [loadingEnvGroups, setLoadingEnvGroups] = useState(false);

  // 模型和思考模式状态
  const [availableModels, setAvailableModels] = useState<{ id: ClaudeModel; name: string; description?: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<ClaudeModel>("sonnet-3-5");
  const [loadingModels, setLoadingModels] = useState(false);
  
  // Thinking mode type definition (matching FloatingPromptInput)
  type ThinkingMode = "auto" | "think" | "think_hard" | "think_harder" | "ultrathink";
  const [selectedThinkingMode, setSelectedThinkingMode] = useState<ThinkingMode>("auto");

  // Queued prompts state
  const [queuedPrompts, setQueuedPrompts] = useState<
    Array<{ id: string; prompt: string; model: ClaudeModel }>
  >([]);

  // New state for preview feature
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [showPreviewPrompt, setShowPreviewPrompt] = useState(false);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50);

  // Add collapsed state for queued prompts
  const [queuedPromptsCollapsed, setQueuedPromptsCollapsed] = useState(false);

  // Message selection and deletion state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIndices, setSelectedMessageIndices] = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" | "warning" } | null>(null);

  // 滚动状态：跟踪用户是否手动滚动
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  // 记录上次消息数量，用于判断是否是新消息
  const prevMessageCountRef = useRef(0);

  // Performance monitoring state
    const parentRef = useRef<globalThis.HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const hasActiveSessionRef = useRef(false);
  const floatingPromptRef = useRef<FloatingPromptInputRef>(null);
  const queuedPromptsRef = useRef<Array<{ id: string; prompt: string; model: ClaudeModel }>>([]);
  const isMountedRef = useRef(true);
  const isListeningRef = useRef(false);
  const sessionStartTime = useRef<number>(Date.now());

  // Session metrics state for enhanced analytics
  const sessionMetrics = useRef({
    firstMessageTime: null as number | null,
    promptsSent: 0,
    toolsExecuted: 0,
    toolsFailed: 0,
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    codeBlocksGenerated: 0,
    errorsEncountered: 0,
    lastActivityTime: Date.now(),
    toolExecutionTimes: [] as number[],
    checkpointCount: 0,
    wasResumed: !!session,
    modelChanges: [] as Array<{ from: string; to: string; timestamp: number }>,
  });

  // Analytics tracking
  const trackEvent = useTrackEvent();
  useComponentMetrics('ClaudeCodeSession');
  // const aiTracking = useAIInteractionTracking('sonnet'); // Default model
  const workflowTracking = useWorkflowTracking('claude_session');

  // Keep ref in sync with state
  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts;
  }, [queuedPrompts]);

  // Get effective session info (from prop or extracted) - use useMemo to ensure it updates
  const effectiveSession = useMemo(() => {
    if (session) return session;
    if (extractedSessionInfo) {
      return {
        id: extractedSessionInfo.sessionId,
        project_id: extractedSessionInfo.projectId,
        project_path: projectPath,
        created_at: Date.now(),
      } as Session;
    }
    return null;
  }, [session, extractedSessionInfo, projectPath]);



  // Get message display mode
  const { mode: messageDisplayMode } = useMessageDisplayMode();

  // 加载可用模型
  const loadAvailableModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      const models = await api.getAvailableModels();
      const formattedModels = models.map(m => ({
        id: m.id as ClaudeModel,
        name: m.name,
        description: m.description
      }));
      setAvailableModels(formattedModels);
      
      // 从 localStorage 加载上次选择的模型
      const savedModel = localStorage.getItem('selected-model');
      if (savedModel && formattedModels.find(m => m.id === savedModel)) {
        setSelectedModel(savedModel as ClaudeModel);
      } else if (formattedModels.length > 0) {
        setSelectedModel(formattedModels[0].id);
      }
      
      logger.debug(`Loaded ${formattedModels.length} models`);
    } catch (error) {
      logger.error("Failed to load available models:", error);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  // 加载环境分组
  const loadEnvironmentGroups = useCallback(async () => {
    try {
      setLoadingEnvGroups(true);
      const groups = await api.getEnvironmentVariableGroups();
      setEnvGroups(groups);
      
      // 设置当前启用的分组为选中状态
      let enabledGroup = groups.find(g => g.enabled);
      
      // 如果没有启用的分组但有分组存在，自动启用第一个
      if (!enabledGroup && groups.length > 0) {
        enabledGroup = groups[0];
        try {
          await api.updateEnvironmentVariableGroup(
            enabledGroup.id!,
            enabledGroup.name,
            enabledGroup.description,
            true,
            enabledGroup.sort_order
          );
          enabledGroup.enabled = true;
          logger.info(`Auto-enabled first environment group: ${enabledGroup.name}`);
        } catch (error) {
          logger.error("Failed to auto-enable first environment group:", error);
        }
      }
      
      setSelectedEnvGroup(enabledGroup?.id || null);
      
      // 更新 Claude settings.json 文件以确保默认环境变量生效
      if (enabledGroup?.id) {
        try {
          await api.updateClaudeSettingsWithEnvGroup(enabledGroup.id, projectPath);
          logger.info(`Updated Claude settings.json with default environment group: ${enabledGroup.name}`);
        } catch (error) {
          logger.error("Failed to update Claude settings.json with default environment group:", error);
        }
      }
      
      // 加载环境分组后，重新加载模型列表
      await loadAvailableModels();
      
      logger.debug(`Loaded ${groups.length} environment groups, selected: ${enabledGroup?.name || 'none'}`);
    } catch (error) {
      logger.error("Failed to load environment groups:", error);
    } finally {
      setLoadingEnvGroups(false);
    }
  }, [projectPath, loadAvailableModels]);

  // 监听环境变量更新和刷新事件
  useEffect(() => {
    loadEnvironmentGroups();
    
    // 监听环境变量更新事件
    const handleEnvUpdate = () => {
      logger.debug("Environment groups updated, reloading...");
      loadEnvironmentGroups();
    };
    
    window.addEventListener('environment-groups-updated', handleEnvUpdate);
    
    return () => {
      window.removeEventListener('environment-groups-updated', handleEnvUpdate);
    };
  }, [loadEnvironmentGroups]);

  // Helper function to extract text content from various content formats
  const extractTextFromContent = useCallback((content: any): string => {
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .map((item: any) => {
          if (typeof item === "string") return item;
          if (item?.text) return item.text;
          if (item?.content) return extractTextFromContent(item.content);
          return "";
        })
        .join(" ")
        .trim();
    }
    if (content?.text) {
      return content.text.trim();
    }
    if (typeof content === "object") {
      return JSON.stringify(content).trim();
    }
    return "";
  }, []);

  // Helper function to calculate text similarity
  const similarity = useCallback((str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;
    
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0 || len2 === 0) return 0;
    
    const shorter = str1.length < str2.length ? str1 : str2;
    const longer = str1.length < str2.length ? str2 : str1;
    
    // Simple similarity based on common substrings
    let matches = 0;
    const words1 = shorter.toLowerCase().split(/\s+/);
    const words2 = longer.toLowerCase().split(/\s+/);
    
    for (const word of words1) {
      if (word.length > 3 && words2.some(w => w.includes(word) || word.includes(w))) {
        matches++;
      }
    }
    
    return matches / Math.max(words1.length, words2.length);
  }, []);

  // Filter out messages that shouldn't be displayed
  const displayableMessages = useMemo(() => {
    return messages.filter((message, index) => {
      // Skip meta messages that don't have meaningful content
      if (message.isMeta && !message.leafUuid && !message.summary) {
        return false;
      }

      // Skip assistant messages that specifically contain "(no content)" text
        if (message.type === "assistant" && message.message) {
        const assistantText = extractTextFromContent(message.message.content);
        // Only filter if it's specifically "(no content)" - be very precise to avoid filtering normal content
        if (assistantText && (
            assistantText.toLowerCase().trim() === "(no content)" ||
            assistantText.toLowerCase().trim() === "no content" ||
            assistantText.trim() === "(no content)"
        )) {
          return false; // Filter out "(no content)" assistant messages
        }
      }

      // Skip result messages that specifically contain "(no content)" text  
      if (message.type === "result") {
        const resultText = extractTextFromContent(message.result || message.error || "");
        // Only filter if it's specifically "(no content)" - be very precise
        if (resultText && (
            resultText.toLowerCase().trim() === "(no content)" ||
            resultText.toLowerCase().trim() === "no content" ||
            resultText.trim() === "(no content)"
        )) {
          return false; // Filter out "(no content)" result messages
        }
      }

      // Skip system initialization messages (additional safety check)
      if (message.type === "system" && (message.subtype === "init" || 
          (typeof message.result === "string" && message.result.includes("System initialized")))) {
        return false;
      }

      // Enhanced filtering to avoid duplicate content in all modes
      // Always filter duplicate assistant/result pairs to prevent confusion
      {
        // Pattern 1: Assistant message followed by result message with same/similar content (filter assistant to avoid duplication)
        if (message.type === "assistant" && message.message) {
          const assistantText = extractTextFromContent(message.message.content);
          
          // Check if there's a result message after this that shows completion
          for (let i = index + 1; i < Math.min(index + 5, messages.length); i++) {
            const nextMsg = messages[i];
            
                          // Check for result message (Execution Complete)
              if (nextMsg.type === "result") {
                const resultText = extractTextFromContent(nextMsg.result || nextMsg.error || "");
                
                // Only filter if both have meaningful content and are similar
                if (resultText && assistantText && resultText.length > 10 && assistantText.length > 10) {
                  // Normalize texts for better comparison
                  const normalizedAssistant = assistantText.toLowerCase().trim();
                  const normalizedResult = resultText.toLowerCase().trim();
                  
                  // Check for exact match or very high similarity - stricter criteria
                  if (normalizedAssistant === normalizedResult ||
                      (normalizedResult.includes(normalizedAssistant) && normalizedAssistant.length > 40) || 
                      (normalizedAssistant.includes(normalizedResult) && normalizedResult.length > 40) ||
                      similarity(assistantText, resultText) > 0.85) {
                    return false; // Skip assistant message, show result instead
                  }
                }
                // If content is not similar enough, keep both messages
              }
            
            // Check for user message with tool_result content - only filter if content is actually duplicate
            if (nextMsg.type === "user" && nextMsg.message?.content && Array.isArray(nextMsg.message.content)) {
              for (const content of nextMsg.message.content) {
                if (content.type === "tool_result" && content.content) {
                  const toolResultText = extractTextFromContent(content.content);
                  
                  // Only filter if tool_result content is actually similar to assistant content
                  if (toolResultText && assistantText && 
                      toolResultText.length > 20 && assistantText.length > 20) {
                    const normalizedTool = toolResultText.toLowerCase().trim();
                    const normalizedAssistant = assistantText.toLowerCase().trim();
                    
                    // Only skip if content is truly similar (exact match or high similarity)
                    if (normalizedTool === normalizedAssistant ||
                        (normalizedTool.includes(normalizedAssistant) && normalizedAssistant.length > 30) ||
                        (normalizedAssistant.includes(normalizedTool) && normalizedTool.length > 30) ||
                        similarity(assistantText, toolResultText) > 0.85) {
                      return false; // Skip assistant message only if content is truly duplicate
                    }
                  }
                }
              }
            }
          }
        }

        // Pattern 2: Multiple result messages with same content (filter true duplicates only)
        if (message.type === "result" && (message.result || message.error)) {
          const currentResultText = extractTextFromContent(message.result || message.error || "");
          
          // Check if there's another result message before this with similar content
          for (let i = Math.max(0, index - 3); i < index; i++) {
            const prevMsg = messages[i];
            if (prevMsg.type === "result" && (prevMsg.result || prevMsg.error)) {
              const prevResultText = extractTextFromContent(prevMsg.result || prevMsg.error || "");
              
              // Only skip if content is actually similar
              if (currentResultText && prevResultText && 
                  currentResultText.length > 10 && prevResultText.length > 10) {
                const normalizedCurrent = currentResultText.toLowerCase().trim();
                const normalizedPrev = prevResultText.toLowerCase().trim();
                
                if (normalizedCurrent === normalizedPrev ||
                    similarity(currentResultText, prevResultText) > 0.9) {
                  return false; // Skip truly duplicate result message
                }
              }
            }
          }
        }

        // Pattern 3: Assistant text followed by same content in tool_result (for completeness)
        if (message.type === "assistant" && message.message?.content) {
          const assistantText = extractTextFromContent(message.message.content);
          
          // Check subsequent messages for duplicate content in tool results
          for (let i = index + 1; i < Math.min(index + 3, messages.length); i++) {
            const nextMsg = messages[i];
            
            if (nextMsg.type === "user" && nextMsg.message?.content && Array.isArray(nextMsg.message.content)) {
              for (const content of nextMsg.message.content) {
                if (content.type === "tool_result" && content.content) {
                  const toolResultText = extractTextFromContent(content.content);
                  // Only filter if tool result content is truly duplicate, not just partially similar
                  if (toolResultText && assistantText && 
                      toolResultText.length > 30 && assistantText.length > 30) {
                    const normalizedTool = toolResultText.toLowerCase().trim();
                    const normalizedAssistant = assistantText.toLowerCase().trim();
                    
                    // Stricter criteria for filtering - require high similarity or exact match
                    if (normalizedTool === normalizedAssistant ||
                        (normalizedTool.includes(normalizedAssistant) && normalizedAssistant.length > 50) ||
                        (normalizedAssistant.includes(normalizedTool) && normalizedTool.length > 50) ||
                        similarity(assistantText, toolResultText) > 0.9) {
                      return false; // Only skip if content is extremely similar
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Skip user messages that only contain tool results that are already displayed
      if (message.type === "user" && message.message) {
        if (message.isMeta) return false;

        const msg = message.message;
        if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) {
          return false;
        }

        if (Array.isArray(msg.content)) {
          let hasVisibleContent = false;
          for (const content of msg.content) {
            if (content.type === "text") {
              hasVisibleContent = true;
              break;
            }
            if (content.type === "tool_result") {
              let willBeSkipped = false;
              if (content.tool_use_id) {
                // Look for the matching tool_use in previous assistant messages
                for (let i = index - 1; i >= 0; i--) {
                  const prevMsg = messages[i];
                  if (
                    prevMsg.type === "assistant" &&
                    prevMsg.message?.content &&
                    Array.isArray(prevMsg.message.content)
                  ) {
                    const toolUse = prevMsg.message.content.find(
                      (c: unknown) =>
                        typeof c === "object" &&
                        c !== null &&
                        "type" in c &&
                        "id" in c &&
                        (c as { type: string; id: string }).type === "tool_use" &&
                        (c as { type: string; id: string }).id === content.tool_use_id
                    );
                    if (toolUse) {
                      const toolName = (toolUse as { name?: string }).name?.toLowerCase();
                      const toolsWithWidgets = [
                        "task",
                        "edit",
                        "multiedit",
                        "todowrite",
                        "ls",
                        "read",
                        "glob",
                        "bash",
                        "write",
                        "grep",
                      ];
                      if (
                        (toolName && toolsWithWidgets.includes(toolName)) ||
                        toolUse.name?.startsWith("mcp__")
                      ) {
                        willBeSkipped = true;
                      }
                      break;
                    }
                  }
                }
              }
              if (!willBeSkipped) {
                hasVisibleContent = true;
                break;
              }
            }
          }
          if (!hasVisibleContent) {
            return false;
          }
        }
      }
      return true;
    });
  }, [messages, messageDisplayMode, extractTextFromContent, similarity]);

  // Optimized debounced message updater for better performance (ready for future use)
  // const debouncedMessageUpdate = useMemo(
  //   () => createDebouncedUpdater<ClaudeStreamMessage>((batch) => {
  //     setMessages(prev => [...prev, ...batch]);
  //   }, 16), // 60fps
  //   []
  // );

  // Optimized virtual scrolling configuration
  const rowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimate, will be dynamically measured
    overscan: 5,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
    getItemKey: useCallback((index: number) => {
      const message = displayableMessages[index];
      return message ? `${message.type}-${index}-${JSON.stringify(message).slice(0, 50)}` : index;
    }, [displayableMessages]),
  });

  // Debug logging
  useEffect(() => {
    logger.debug("[ClaudeCodeSession] State update:", {
      projectPath,
      session,
      extractedSessionInfo,
      effectiveSession,
      messagesCount: messages.length,
      isLoading,
    });
  }, [projectPath, session, extractedSessionInfo, effectiveSession, messages.length, isLoading]);

  const checkForActiveSession = useCallback(async () => {
    // If we have a session prop, check if it's still active
    if (session) {
      try {
        const activeSessions = await api.listRunningClaudeSessions();
        const activeSession = activeSessions.find((s: unknown) => {
          if (
            typeof s === "object" &&
            s !== null &&
            "process_type" in s &&
            (s as { process_type: unknown }).process_type &&
            typeof (s as { process_type: unknown }).process_type === "object" &&
            (s as { process_type: unknown }).process_type !== null &&
            "ClaudeSession" in (s as { process_type: object }).process_type
          ) {
            const sessionData = (s as { process_type: { ClaudeSession: unknown } }).process_type
              .ClaudeSession;
            return (
              typeof sessionData === "object" &&
              sessionData !== null &&
              "session_id" in sessionData &&
              (sessionData as { session_id: unknown }).session_id === session.id
            );
          }
          return false;
        });

        if (activeSession) {
          hasActiveSessionRef.current = true;
          logger.debug("Found active session, setting up listeners");
          // Setup event listeners would be called here
        } else {
          hasActiveSessionRef.current = false;
          logger.debug("No active session found");
        }
      } catch (err) {
        logger.warn("Failed to check for active sessions:", err);
        hasActiveSessionRef.current = false;
      }
    }
  }, [session]);

  const loadSessionHistory = useCallback(async () => {
    if (!session?.id) {
      logger.debug("[ClaudeCodeSession] No session ID, clearing messages");
      setMessages([]);
      return;
    }

    // Always show loading for history load to give user feedback
    setIsLoading(true);
    setError(null); // Clear any existing errors
    
    try {
      logger.debug("[ClaudeCodeSession] Loading session history for:", session.id);
      
      // Check if we have a project_id, use appropriate API
      let historyOutput: string;
      if (session.project_id) {
        // For Claude Code sessions with project_id
        const historyMessages = await api.loadSessionHistory(session.id, session.project_id);
        // Convert array of messages back to JSONL format for parsing
        historyOutput = historyMessages.map(msg => 
          typeof msg === 'string' ? msg : JSON.stringify(msg)
        ).join('\n');
      } else {
        // Fallback to direct session output for other session types
        historyOutput = await api.getSessionOutput(parseInt(session.id));
      }
      
      // Always update raw output
      const lines = historyOutput.split("\n").filter((line) => line.trim());
      setRawJsonlOutput(lines);
      
      // Parse the JSONL output into messages
      const parsedMessages: ClaudeStreamMessage[] = [];
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as ClaudeStreamMessage;
          parsedMessages.push(message);
        } catch (parseErr) {
          // Log parsing errors but continue processing
          logger.warn('[ClaudeCodeSession] Failed to parse message:', line, parseErr);
        }
      }
      
      logger.debug("[ClaudeCodeSession] Loaded", parsedMessages.length, "messages from", lines.length, "lines");
      
      // Only update messages if component is still mounted
      if (isMountedRef.current) {
        setMessages(parsedMessages);

      }
    } catch (err) {
      logger.error("[ClaudeCodeSession] Failed to load session history:", err);
      if (isMountedRef.current) {
        setError(`Failed to load session history: ${err instanceof Error ? err.message : 'Unknown error'}`);
        await handleApiError(err as Error, {
          operation: "loadSessionHistory",
          component: "ClaudeCodeSession",
          sessionId: session.id,
        });
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [session?.id, session?.project_id]); // Removed messages.length dependency to avoid infinite loops

  // Report streaming state changes
  useEffect(() => {
    onStreamingChange?.(isLoading, claudeSessionId);
  }, [isLoading, claudeSessionId, onStreamingChange]);

  // 检测是否在底部
  const isAtBottom = useCallback(() => {
    const container = parentRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      return distanceFromBottom < 50; // 50px 阈值
    }
    return true;
  }, []);

  // 处理滚动事件 - 检测用户是否手动向上滚动
  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      // 清除之前的定时器，避免频繁触发
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      // 延迟检测，避免自动滚动触发误判
      scrollTimeout = setTimeout(() => {
        if (isAtBottom()) {
          // 用户滚动到底部，重新启用自动滚动
          setHasUserScrolled(false);
        } else {
          // 用户不在底部，可能是手动滚动了
          // 只有在 isLoading 时才标记为手动滚动（避免在静止状态时误判）
          if (isLoading) {
            setHasUserScrolled(true);
          }
        }
      }, 100); // 100ms 防抖
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [isAtBottom, isLoading]);

  // Auto-scroll to bottom when new messages arrive - 只在用户未手动滚动时自动滚动
  useEffect(() => {
    if (displayableMessages.length > 0 && !hasUserScrolled) {
      const isInitialLoad = prevMessageCountRef.current === 0;
      const isNewMessage = displayableMessages.length > prevMessageCountRef.current;
      
      // 更新消息计数
      prevMessageCountRef.current = displayableMessages.length;

      if (!isNewMessage) return;

      // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
      requestAnimationFrame(() => {
        try {
          const container = parentRef.current;
          if (!container) return;

          if (isInitialLoad) {
            // 初次加载历史会话：滚动到底部
            const scrollToBottomInstant = () => {
              container.scrollTop = container.scrollHeight;
            };
            
            rowVirtualizer.scrollToIndex(displayableMessages.length - 1, {
              align: "end",
              behavior: "auto",
            });
            
            scrollToBottomInstant();
            setTimeout(scrollToBottomInstant, 50);
            setTimeout(scrollToBottomInstant, 150);
          } else {
            // AI 持续输出时：只在内容超出可视区域时才滚动
            const { scrollTop, scrollHeight, clientHeight } = container;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            // 如果最新消息已经不可见（距离底部超过100px），则平滑滚动保持可见
            if (distanceFromBottom > 100) {
              // 目标：让新消息显示在容器顶部往下 30% 的位置，为新消息留足展示空间
              const targetPosition = Math.max(0, scrollHeight - clientHeight * 0.7);

              container.scrollTo({
                top: targetPosition,
                behavior: "smooth",
              });
            }
          }
        } catch (error) {
          logger.warn("Failed to scroll:", error);
        }
      });
    }
  }, [displayableMessages.length, rowVirtualizer, hasUserScrolled]);

  // Load session history if resuming
  useEffect(() => {
    if (session && session.id) {
      // Set the claudeSessionId immediately when we have a session
      setClaudeSessionId(session.id);

      // Load session history first, then check for active session
      const initializeSession = async () => {
        await loadSessionHistory();
        // After loading history, check if the session is still active
        if (isMountedRef.current) {
          await checkForActiveSession();
          
          // Set up listeners for resumed sessions
          if (!isListeningRef.current) {
            try {
              isListeningRef.current = true;
              
              // Set up session-specific listeners for resumed sessions
              const resumedOutputUnlisten = await listen<string>(
                `claude-output:${session.id}`,
                async (event) => {
                  if (!isMountedRef.current) return;
                  
                  try {
                    setRawJsonlOutput((prev) => [...prev, event.payload]);
                    const message = JSON.parse(event.payload) as ClaudeStreamMessage;
                    setMessages((prev) => [...prev, message]);
                  } catch (err) {
                    logger.error("Failed to parse resumed session message:", err);
                  }
                }
              );

              const resumedErrorUnlisten = await listen<string>(`claude-error:${session.id}`, (event) => {
                logger.error("Claude error (resumed):", event.payload);
                if (isMountedRef.current) {
                  setError(event.payload);
                }
              });

              const resumedCompleteUnlisten = await listen<boolean>(
                `claude-complete:${session.id}`,
                (event) => {
                  logger.debug("Claude complete (resumed):", event.payload);
                  if (isMountedRef.current) {
                    setIsLoading(false);
                    hasActiveSessionRef.current = false;
                  }
                }
              );

              // Store the listeners for cleanup
              unlistenRefs.current = [resumedOutputUnlisten, resumedErrorUnlisten, resumedCompleteUnlisten];
            } catch (err) {
              logger.error("Failed to set up resumed session listeners:", err);
              isListeningRef.current = false;
            }
          }
        }
      };

      initializeSession();
    }
  }, [session?.id, loadSessionHistory, checkForActiveSession]); // Include all dependencies

  // Calculate total tokens from messages
  useEffect(() => {
    const tokens = messages.reduce((total, msg) => {
      if (msg.message?.usage) {
        return total + msg.message.usage.input_tokens + msg.message.usage.output_tokens;
      }
      if (msg.usage) {
        return total + msg.usage.input_tokens + msg.usage.output_tokens;
      }
      return total;
    }, 0);
    setTotalTokens(tokens);
  }, [messages]);

  // Remove unused function - commented out to fix TS6133 error
  /*
  const _reconnectToSession = async (_sessionId: string) => {
    logger.debug("[ClaudeCodeSession] Reconnecting to session:", _sessionId);

    // Prevent duplicate listeners
    if (isListeningRef.current) {
      logger.debug("[ClaudeCodeSession] Already listening to session, skipping reconnect");
      return;
    }

    // Clean up previous listeners
    unlistenRefs.current.forEach((unlisten) => unlisten());
    unlistenRefs.current = [];

    // IMPORTANT: Set the session ID before setting up listeners
    setClaudeSessionId(_sessionId);

    // Mark as listening
    isListeningRef.current = true;

    // Set up session-specific listeners
    const outputUnlisten = await listen<string>(`claude-output:${_sessionId}`, async (event) => {
      try {
        logger.debug("[ClaudeCodeSession] Received claude-output on reconnect:", event.payload);

        if (!isMountedRef.current) return;

        // Store raw JSONL
        setRawJsonlOutput((prev) => [...prev, event.payload]);

        // Parse and display
        const message = JSON.parse(event.payload) as ClaudeStreamMessage;
        setMessages((prev) => [...prev, message]);
      } catch (err) {
        await handleError(err as Error, {
          operation: "parseClaudeMessage",
          payload: event.payload,
        });
      }
    });

    const errorUnlisten = await listen<string>(`claude-error:${_sessionId}`, (event) => {
      logger.error("Claude error:", event.payload);
      if (isMountedRef.current) {
        setError(event.payload);
      }
    });

    const completeUnlisten = await listen<boolean>(
      `claude-complete:${_sessionId}`,
      async (event) => {
        logger.debug("[ClaudeCodeSession] Received claude-complete on reconnect:", event.payload);
        if (isMountedRef.current) {
          setIsLoading(false);
          hasActiveSessionRef.current = false;
        }
      }
    );

    unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten];

    // Mark as loading to show the session is active
    if (isMountedRef.current) {
      setIsLoading(true);
      hasActiveSessionRef.current = true;
    }
  };
  */

  const handleSelectPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Directory",
      });

      if (selected) {
        setProjectPath(selected as string);
        setError(null);
      }
    } catch (err) {
      await handleError(err as Error, { operation: "selectDirectory" });
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to select directory: ${errorMessage}`);
    }
  };

  /**
   * Handle environment group change
   */
  const handleEnvGroupChange = async (groupId: string) => {
    if (loadingEnvGroups) return;
    
    const selectedId = parseInt(groupId);
    
    try {
      setLoadingEnvGroups(true);
      
      // 禁用其他所有分组，启用选中的分组
      for (const group of envGroups) {
        const shouldEnable = group.id === selectedId;
        if (group.enabled !== shouldEnable) {
          await api.updateEnvironmentVariableGroup(
            group.id!,
            group.name,
            group.description,
            shouldEnable,
            group.sort_order
          );
        }
      }
      
      setSelectedEnvGroup(selectedId);
      setError(null);
      
      const selectedGroupName = envGroups.find(g => g.id === selectedId)?.name || 'unknown';
      logger.info(`🔄 Environment group switched to: ${selectedGroupName}`, {
        oldGroup: envGroups.find(g => g.enabled)?.name,
        newGroup: selectedGroupName,
        preservedSession: !!effectiveSession?.id,
        preservedClaudeSessionId: !!claudeSessionId,
        preservedMessages: messages.length,
        projectPath: projectPath
      });
      
      // 更新 Claude settings.json 文件以应用环境变量
      try {
        await api.updateClaudeSettingsWithEnvGroup(selectedId, projectPath);
        logger.info("Claude settings.json updated with environment variables");
      } catch (error) {
        logger.error("Failed to update Claude settings.json:", error);
      }
      
      // 🔧 关键修复：切换环境组时，同步更新选中的模型
      try {
        const envVars = await api.getEnvironmentVariables();
        const enabledGroupVars = envVars.filter(v => v.group_id === selectedId && v.enabled);
        const mid1Var = enabledGroupVars.find(v => v.key === 'MID_1');
        
        if (mid1Var && mid1Var.value.trim()) {
          const newModelId = mid1Var.value.trim();
          // 更新组件状态
          setSelectedModel(newModelId as ClaudeModel);
          // 更新localStorage
          localStorage.setItem('selected-model', newModelId);
          // 同时调用updateClaudeSettingsWithModel确保完全同步
          await api.updateClaudeSettingsWithModel(newModelId, projectPath);
          logger.info(`🎯 Synchronized model selection to: ${newModelId}`);
        } else {
          logger.warn(`No MID_1 found in enabled group ${selectedGroupName}`);
        }
      } catch (error) {
        logger.error("Failed to sync model selection after environment switch:", error);
      }
      
      // 刷新环境变量和模型配置
      handleRefreshEnvironment();
      
      // 通知设置页面更新分组状态
      window.dispatchEvent(new CustomEvent('environment-groups-updated'));
      
    } catch (error) {
      logger.error("Failed to switch environment group:", error);
    } finally {
      setLoadingEnvGroups(false);
    }
  };

  /**
   * Handle refreshing environment variables and model configuration
   */
  const handleRefreshEnvironment = () => {
    logger.info("[ClaudeCodeSession] Environment refresh requested");
    
    // 刷新环境分组状态
    loadEnvironmentGroups();
    
    // Dispatch events to trigger environment and model refresh
    window.dispatchEvent(new CustomEvent('refresh-environment'));
    window.dispatchEvent(new CustomEvent('claude-version-changed'));
    
    // Track the refresh action
    trackEvent.featureUsed?.('environment_refresh', 'dialog_button');
    
    logger.info("[ClaudeCodeSession] Environment and model refresh triggered");
  };

  // 生成对话上下文摘要，用于resume失败时的后备方案
  const generateContextSummary = useCallback((messages: ClaudeStreamMessage[]): string => {
    if (messages.length === 0) return "";
    
    let summary = "# 继续对话上下文\n\n";
    let conversationPairs: Array<{user: string, assistant: string}> = [];
    let currentPair: {user?: string, assistant?: string} = {};
    
    for (const message of messages) {
      if (message.type === 'user' && message.message?.content) {
        // 提取用户消息文本
        let userText = "";
        if (Array.isArray(message.message.content)) {
          const textParts = message.message.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || "")
            .join(" ");
          userText = textParts;
        } else if (typeof message.message.content === 'string') {
          userText = message.message.content;
        }
        
        if (userText.trim()) {
          currentPair.user = userText.trim();
        }
      } else if (message.type === 'assistant' && message.message?.content) {
        // 提取助手回复文本
        let assistantText = "";
        if (Array.isArray(message.message.content)) {
          const textParts = message.message.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || "")
            .join(" ");
          assistantText = textParts;
        } else if (typeof message.message.content === 'string') {
          assistantText = message.message.content;
        }
        
        if (assistantText.trim()) {
          currentPair.assistant = assistantText.trim();
        }
        
        // 如果有完整的对话对，保存并重置
        if (currentPair.user && currentPair.assistant) {
          conversationPairs.push({
            user: currentPair.user,
            assistant: currentPair.assistant
          });
          currentPair = {};
        }
      }
    }
    
    // 生成摘要
    if (conversationPairs.length > 0) {
      summary += "请基于以下历史对话继续讨论：\n\n";
      conversationPairs.forEach((pair, index) => {
        summary += `**对话${index + 1}**\n`;
        summary += `用户：${pair.user}\n\n`;
        summary += `助手：${pair.assistant}\n\n`;
        summary += "---\n\n";
      });
      
      // 如果有未完成的用户消息
      if (currentPair.user) {
        summary += `**待回复**\n用户：${currentPair.user}\n\n---\n\n`;
      }
    }
    
    return summary;
  }, []);

  /**
   * Handle sending a prompt to Claude
   *
   * @param prompt - The prompt text to send
   * @param model - The Claude model to use
   */
  const handleSendPrompt = async (prompt: string, model: ClaudeModel) => {
    logger.debug("[ClaudeCodeSession] handleSendPrompt called with:", {
      prompt,
      model,
      projectPath,
      claudeSessionId,
      effectiveSession,
    });

    if (!projectPath) {
      await handleValidationError("Please select a project directory first", {
        operation: "validateProjectPath",
      });
      setError("Please select a project directory first");
      return;
    }

    // If already loading, queue the prompt
    if (isLoading) {
      const newPrompt = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        prompt,
        model,
      };
      setQueuedPrompts((prev) => [...prev, newPrompt]);
      return;
    }

    // CRITICAL FIX: Before starting new session, ensure any previous session is completely terminated
    if (hasActiveSessionRef.current && claudeSessionId) {
      logger.warn("[ClaudeCodeSession] Detected active session before new prompt, forcing cleanup");
      try {
        await api.cancelClaudeExecution(claudeSessionId);
        
        // Force cleanup of all session state
        hasActiveSessionRef.current = false;
        isListeningRef.current = false;
        setQueuedPrompts([]);
        queuedPromptsRef.current = [];
        
        // Wait a moment for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        logger.info("[ClaudeCodeSession] Previous session cleanup completed");
      } catch (err) {
        logger.error("[ClaudeCodeSession] Failed to cleanup previous session:", err);
      }
    }

    try {
      setIsLoading(true);
      setError(null);
      hasActiveSessionRef.current = true;

      // For resuming sessions, ensure we have the session ID
      if (effectiveSession && !claudeSessionId) {
        setClaudeSessionId(effectiveSession.id);
      }

      // Only clean up and set up new listeners if not already listening for this session
      if (!isListeningRef.current || claudeSessionId !== extractedSessionInfo?.sessionId) {
        // Clean up previous listeners
        unlistenRefs.current.forEach((unlisten) => unlisten());
        unlistenRefs.current = [];

        // Mark as setting up listeners
        isListeningRef.current = true;

        // --------------------------------------------------------------------
        // 1️⃣  Event Listener Setup Strategy
        // --------------------------------------------------------------------
        // Claude Code may emit a *new* session_id even when we pass --resume. If
        // we listen only on the old session-scoped channel we will miss the
        // stream until the user navigates away & back. To avoid this we:
        //   �?Always start with GENERIC listeners (no suffix) so we catch the
        //     very first "system:init" message regardless of the session id.
        //   �?Once that init message provides the *actual* session_id, we
        //     dynamically switch to session-scoped listeners and stop the
        //     generic ones to prevent duplicate handling.
        // --------------------------------------------------------------------

        logger.debug("[ClaudeCodeSession] Setting up generic event listeners first");

        let currentSessionId: string | null = claudeSessionId || effectiveSession?.id || null;

        // Helper to attach session-specific listeners **once we are sure**
        const attachSessionSpecificListeners = async (sid: string) => {
          logger.debug("[ClaudeCodeSession] Attaching session-specific listeners for", sid);

          const specificOutputUnlisten = await listen<string>(
            `claude-output:${sid}`,
            async (evt) => {
              await handleStreamMessage(evt.payload);
            }
          );

          const specificErrorUnlisten = await listen<string>(`claude-error:${sid}`, async (evt) => {
            await handleError(evt.payload, {
              operation: "claudeErrorScoped",
              source: "claude_session",
            });
            setError(evt.payload);
          });

          const specificCompleteUnlisten = await listen<boolean>(
            `claude-complete:${sid}`,
            (evt) => {
              logger.debug("[ClaudeCodeSession] Received claude-complete (scoped):", evt.payload);
              processComplete(evt.payload);
            }
          );

          const specificCancelUnlisten = await listen<boolean>(
            `claude-cancelled:${sid}`,
            (evt) => {
              logger.debug("[ClaudeCodeSession] Received claude-cancelled (scoped):", evt.payload);
              
              // Force stop all session state immediately
              setIsLoading(false);
              hasActiveSessionRef.current = false;
              isListeningRef.current = false;
              setError(null);
              
              // Clear all queued prompts to prevent continuation
              setQueuedPrompts([]);
              queuedPromptsRef.current = [];
              
              // Add cancellation message to UI
              const cancelMessage: ClaudeStreamMessage = {
                type: "system",
                subtype: "info",
                result: "会话已被用户取消",
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, cancelMessage]);
              
              logger.info("[ClaudeCodeSession] Scoped session state forcefully reset due to cancellation");
            }
          );

          // Replace existing unlisten refs with these new ones (after cleaning up)
          unlistenRefs.current.forEach((u) => u());
          unlistenRefs.current = [
            specificOutputUnlisten,
            specificErrorUnlisten,
            specificCompleteUnlisten,
            specificCancelUnlisten,
          ];
        };

        // Generic listeners (catch-all)
        const genericOutputUnlisten = await listen<string>("claude-output", async (event) => {
          await handleStreamMessage(event.payload);

          // Attempt to extract session_id on the fly (for the very first init)
          try {
            const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
            if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
              if (!currentSessionId || currentSessionId !== msg.session_id) {
                logger.debug(
                  "[ClaudeCodeSession] Detected new session_id from generic listener:",
                  msg.session_id
                );
                currentSessionId = msg.session_id;
                setClaudeSessionId(msg.session_id);

                // If we haven't extracted session info before, do it now
                if (!extractedSessionInfo) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, "-");
                  setExtractedSessionInfo({ sessionId: msg.session_id, projectId });
                }

                // Switch to session-specific listeners
                await attachSessionSpecificListeners(msg.session_id);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        });

        // Helper to process any JSONL stream message string
        /**
         * Handle incoming stream message from Claude Code
         *
         * @param payload - Raw JSON payload from the stream
         */
        async function handleStreamMessage(payload: string) {
          try {
            // Don't process if component unmounted
            if (!isMountedRef.current) return;

            // Store raw JSONL
            setRawJsonlOutput((prev) => [...prev, payload]);

            const message = JSON.parse(payload) as ClaudeStreamMessage;

            // Track enhanced tool execution
            if (message.type === 'assistant' && message.message?.content) {
              const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
              toolUses.forEach((toolUse: any) => {
                // Increment tools executed counter
                sessionMetrics.current.toolsExecuted += 1;
                sessionMetrics.current.lastActivityTime = Date.now();

                // Track file operations
                const toolName = toolUse.name?.toLowerCase() || '';
                if (toolName.includes('create') || toolName.includes('write')) {
                  sessionMetrics.current.filesCreated += 1;
                } else if (toolName.includes('edit') || toolName.includes('multiedit') || toolName.includes('search_replace')) {
                  sessionMetrics.current.filesModified += 1;
                } else if (toolName.includes('delete')) {
                  sessionMetrics.current.filesDeleted += 1;
                }

                // Track tool start - we'll track completion when we get the result
                workflowTracking.trackStep(toolUse.name);
              });
            }

            // Track tool results
            if (message.type === 'user' && message.message?.content) {
              const toolResults = message.message.content.filter((c: any) => c.type === 'tool_result');
              toolResults.forEach((result: any) => {
                const isError = result.is_error || false;
                // Note: We don't have execution time here, but we can track success/failure
                if (isError) {
                  sessionMetrics.current.toolsFailed += 1;
                  sessionMetrics.current.errorsEncountered += 1;

                  trackEvent.enhancedError({
                    error_type: 'tool_execution',
                    error_code: 'tool_failed',
                    error_message: result.content,
                    context: `Tool execution failed`,
                    user_action_before_error: 'executing_tool',
                    recovery_attempted: false,
                    recovery_successful: false,
                    error_frequency: 1,
                    stack_trace_hash: undefined
                  });
                }
              });
            }

            // Track code blocks generated
            if (message.type === 'assistant' && message.message?.content) {
              const codeBlocks = message.message.content.filter((c: any) =>
                c.type === 'text' && c.text?.includes('```')
              );
              if (codeBlocks.length > 0) {
                // Count code blocks in text content
                codeBlocks.forEach((block: any) => {
                  const matches = (block.text.match(/```/g) || []).length;
                  sessionMetrics.current.codeBlocksGenerated += Math.floor(matches / 2);
                });
              }
            }

            // Track errors in system messages
            if (message.type === 'system' && (message.subtype === 'error' || message.error)) {
              sessionMetrics.current.errorsEncountered += 1;
            }

            setMessages((prev) => [...prev, message]);
          } catch (err) {
            logger.error("[ClaudeCodeSession] Failed to parse or process message:", err, "payload:", payload);
            await handleError(err as Error, { operation: "parseClaudeMessage", payload });
          }
        }

        // Helper to handle completion events (both generic and scoped)
        const processComplete = async (success: boolean) => {
          setIsLoading(false);
          hasActiveSessionRef.current = false;
          // Don't reset isListeningRef here - keep listeners active for the session
          // isListeningRef.current = false; // This was causing the issue

          // Track enhanced session stopped metrics when session completes
          if (effectiveSession && claudeSessionId) {
            const sessionStartTimeValue = messages.length > 0 ? (Number(messages[0].timestamp) || Date.now()) : Date.now();
            const duration = Date.now() - sessionStartTimeValue;
            const metrics = sessionMetrics.current;
            const timeToFirstMessage = metrics.firstMessageTime
              ? metrics.firstMessageTime - sessionStartTime.current
              : undefined;
            const idleTime = Date.now() - metrics.lastActivityTime;
            const avgResponseTime = metrics.toolExecutionTimes.length > 0
              ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) / metrics.toolExecutionTimes.length
              : undefined;

            trackEvent.enhancedSessionStopped({
              // Basic metrics
              duration_ms: duration,
              messages_count: messages.length,
              reason: success ? 'completed' : 'error',

              // Timing metrics
              time_to_first_message_ms: timeToFirstMessage,
              average_response_time_ms: avgResponseTime,
              idle_time_ms: idleTime,

              // Interaction metrics
              prompts_sent: metrics.promptsSent,
              tools_executed: metrics.toolsExecuted,
              tools_failed: metrics.toolsFailed,
              files_created: metrics.filesCreated,
              files_modified: metrics.filesModified,
              files_deleted: metrics.filesDeleted,

              // Content metrics
              total_tokens_used: totalTokens,
              code_blocks_generated: metrics.codeBlocksGenerated,
              errors_encountered: metrics.errorsEncountered,

              // Session context
              model: metrics.modelChanges.length > 0
                ? metrics.modelChanges[metrics.modelChanges.length - 1].to
                : 'sonnet',
              has_checkpoints: metrics.checkpointCount > 0,
              checkpoint_count: metrics.checkpointCount,
              was_resumed: metrics.wasResumed,

              // Agent context (if applicable)
              agent_type: undefined, // TODO: Pass from agent execution
              agent_name: undefined, // TODO: Pass from agent execution
              agent_success: success,

              // Stop context
              stop_source: 'completed',
              final_state: success ? 'success' : 'failed',
              has_pending_prompts: queuedPrompts.length > 0,
              pending_prompts_count: queuedPrompts.length,
            });
          }

          if (effectiveSession && success) {
            try {
              const settings = await api.getCheckpointSettings(
                effectiveSession.id,
                effectiveSession.project_id,
                projectPath
              );

              if (settings.auto_checkpoint_enabled) {
                await api.checkAutoCheckpoint(
                  effectiveSession.id,
                  effectiveSession.project_id,
                  projectPath,
                  prompt
                );
                // Reload timeline to show new checkpoint
                setTimelineVersion((v) => v + 1);
              }
            } catch (err) {
              await handleError(err as Error, {
                operation: "checkAutoCheckpoint",
                sessionId: effectiveSession.id,
              });
            }
          }

          // Trigger notifications for message completion
          if (success) {
            try {
              await notificationManager.onMessageComplete();
            } catch (err) {
              logger.error("Failed to trigger message completion notifications:", err);
            }
          }

          // Process queued prompts after completion
          if (queuedPromptsRef.current.length > 0) {
            const [nextPrompt, ...remainingPrompts] = queuedPromptsRef.current;
            setQueuedPrompts(remainingPrompts);

            // Small delay to ensure UI updates
            globalThis.setTimeout(() => {
              handleSendPrompt(nextPrompt.prompt, nextPrompt.model);
            }, 100);
          } else {
            // All queued prompts completed - trigger queue completion notification
            if (success) {
              try {
                await notificationManager.onQueueComplete();
              } catch (err) {
                logger.error("Failed to trigger queue completion notifications:", err);
              }
            }
          }
        };

        const genericErrorUnlisten = await listen<string>("claude-error", async (evt) => {
          await handleError(evt.payload, { operation: "claudeError", source: "claude_session" });
          setError(evt.payload);
        });

        const genericCompleteUnlisten = await listen<boolean>("claude-complete", (evt) => {
          logger.debug("[ClaudeCodeSession] Received claude-complete (generic):", evt.payload);
          processComplete(evt.payload);
        });

        // Add cancel event listener to handle stop button properly
        const genericCancelUnlisten = await listen<boolean>("claude-cancelled", (evt) => {
          logger.debug("[ClaudeCodeSession] Received claude-cancelled (generic):", evt.payload);
          
          // Force stop all session state immediately
          setIsLoading(false);
          hasActiveSessionRef.current = false;
          isListeningRef.current = false;
          setError(null);
          
          // Clear all queued prompts to prevent continuation
          setQueuedPrompts([]);
          queuedPromptsRef.current = [];
          
          // Add cancellation message to UI
          const cancelMessage: ClaudeStreamMessage = {
            type: "system",
            subtype: "info",
            result: "会话已被用户取消",
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, cancelMessage]);
          
          logger.info("[ClaudeCodeSession] Session state forcefully reset due to cancellation");
        });

        // Store the generic unlisteners for now; they may be replaced later.
        unlistenRefs.current = [
          genericOutputUnlisten,
          genericErrorUnlisten,
          genericCompleteUnlisten,
          genericCancelUnlisten,
        ];

        // --------------------------------------------------------------------
        // 2️⃣  Auto-checkpoint logic moved after listener setup (unchanged)
        // --------------------------------------------------------------------

        // Add the user message immediately to the UI (after setting up listeners)
        const userMessage: ClaudeStreamMessage = {
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        };
        setMessages(prev => [...prev, userMessage]);

        // Update session metrics
        sessionMetrics.current.promptsSent += 1;
        sessionMetrics.current.lastActivityTime = Date.now();
        if (!sessionMetrics.current.firstMessageTime) {
          sessionMetrics.current.firstMessageTime = Date.now();
        }

        // Track model changes
        const lastModel = sessionMetrics.current.modelChanges.length > 0
          ? sessionMetrics.current.modelChanges[sessionMetrics.current.modelChanges.length - 1].to
          : (sessionMetrics.current.wasResumed ? 'sonnet' : model); // Default to sonnet if resumed

        if (lastModel !== model) {
          sessionMetrics.current.modelChanges.push({
            from: lastModel,
            to: model,
            timestamp: Date.now()
          });
        }

        // Track enhanced prompt submission
        const codeBlockMatches = prompt.match(/```[\s\S]*?```/g) || [];
        const hasCode = codeBlockMatches.length > 0;
        const conversationDepth = messages.filter(m => m.user_message).length;
        const sessionAge = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
        const wordCount = prompt.split(/\s+/).filter(word => word.length > 0).length;

        trackEvent.enhancedPromptSubmitted({
          prompt_length: prompt.length,
          model: model,
          has_attachments: false, // TODO: Add attachment support when implemented
          source: 'keyboard', // TODO: Track actual source (keyboard vs button)
          word_count: wordCount,
          conversation_depth: conversationDepth,
          prompt_complexity: wordCount < 20 ? 'simple' : wordCount < 100 ? 'moderate' : 'complex',
          contains_code: hasCode,
          language_detected: hasCode ? codeBlockMatches?.[0]?.match(/```(\w+)/)?.[1] : undefined,
          session_age_ms: sessionAge
        });

        // Execute the appropriate command
        // Determine if we should resume or start new based on:
        // 1. Having an effective session ID
        // 2. Having an active claudeSessionId (meaning session is already initialized)
        // 3. Having existing messages (indicating an active conversation)
        // Note: Always allow resume for context continuity (like Cursor behavior)
        const shouldResume = effectiveSession &&
          (claudeSessionId || messages.length > 0);

        // 详细调试日志
        logger.info("[ClaudeCodeSession] Resume check:", {
          effectiveSession: !!effectiveSession,
          effectiveSessionId: effectiveSession?.id,
          claudeSessionId: claudeSessionId,
          messagesLength: messages.length,
          shouldResume: shouldResume,
          projectPath: projectPath
        });

        if (shouldResume) {
          try {
            logger.info("[ClaudeCodeSession] 🔄 Resuming session:", effectiveSession.id, "with model:", model);
            trackEvent.sessionResumed(effectiveSession.id);
            trackEvent.modelSelected(model);
            await api.resumeClaudeCode(projectPath, effectiveSession.id, prompt, model);
          } catch (resumeError) {
            logger.warn("[ClaudeCodeSession] Resume failed, falling back to new session with context:", resumeError);
            
            // Resume失败时，使用上下文摘要开始新会话
            let contextPrompt = prompt;
            if (messages.length > 0) {
              const contextSummary = generateContextSummary(messages);
              if (contextSummary) {
                contextPrompt = contextSummary + "\n\n**当前请求**: " + prompt;
                logger.info("[ClaudeCodeSession] Added context summary due to resume failure");
              }
            }
            
                         trackEvent.sessionCreated(model, 'prompt_input');
             trackEvent.modelSelected(model);
             await api.executeClaudeCode(projectPath, contextPrompt, model);
           }
        } else {
          logger.info("[ClaudeCodeSession] 🆕 Starting new session with model:", model);
          trackEvent.sessionCreated(model, 'prompt_input');
          trackEvent.modelSelected(model);
          await api.executeClaudeCode(projectPath, prompt, model);
        }
      }
    } catch (err) {
      logger.error("Failed to send prompt:", err);
      setError("Failed to send prompt");
      setIsLoading(false);
      hasActiveSessionRef.current = false;
    }
  };

  const handleCopyAsJsonl = async () => {
    const jsonl = rawJsonlOutput.join("\n");
    await navigator.clipboard.writeText(jsonl);
    setCopyPopoverOpen(false);
  };

  const handleCopyAsMarkdown = async () => {
    let markdown = `# Claude Code Session\n\n`;
    markdown += `**Project:** ${projectPath}\n`;
    markdown += `**Date:** ${new Date().toISOString()}\n\n`;
    markdown += `---\n\n`;

    for (const msg of messages) {
      if (msg.type === "system" && msg.subtype === "init") {
        markdown += `## System Initialization\n\n`;
        markdown += `- Session ID: \`${msg.session_id || "N/A"}\`\n`;
        markdown += `- Model: \`${msg.model || "default"}\`\n`;
        if (msg.cwd) markdown += `- Working Directory: \`${msg.cwd}\`\n`;
        if (msg.tools?.length) markdown += `- Tools: ${msg.tools.join(", ")}\n`;
        markdown += `\n`;
      } else if (msg.type === "assistant" && msg.message) {
        markdown += `## Assistant\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent =
              typeof content.text === "string"
                ? content.text
                : (content.text as unknown as { text?: string })?.text ||
                  JSON.stringify(content.text || content);
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_use") {
            markdown += `### Tool: ${content.name}\n\n`;
            markdown += `\`\`\`json\n${JSON.stringify(content.input, null, 2)}\n\`\`\`\n\n`;
          }
        }
        if (msg.message.usage) {
          markdown += `*Tokens: ${msg.message.usage.input_tokens} in, ${msg.message.usage.output_tokens} out*\n\n`;
        }
      } else if (msg.type === "user" && msg.message) {
        markdown += `## User\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent =
              typeof content.text === "string"
                ? content.text
                : (content.text as unknown as { text?: string })?.text ||
                  JSON.stringify(content.text);
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_result") {
            markdown += `### Tool Result\n\n`;
            let contentText = "";
            if (typeof content.content === "string") {
              contentText = content.content;
            } else if (content.content && typeof content.content === "object") {
              if ((content.content as { text?: string }).text) {
                contentText = (content.content as { text?: string }).text || "";
              } else if (Array.isArray(content.content)) {
                contentText = (content.content as unknown[])
                  .map((c: unknown) =>
                    typeof c === "string" ? c : (c as { text?: string }).text || JSON.stringify(c)
                  )
                  .join("\n");
              } else {
                contentText = JSON.stringify(content.content, null, 2);
              }
            }
            markdown += `\`\`\`\n${contentText}\n\`\`\`\n\n`;
          }
        }
      } else if (msg.type === "result") {
        markdown += `## Execution Result\n\n`;
        if (msg.result) {
          markdown += `${msg.result}\n\n`;
        }
        if (msg.error) {
          markdown += `**Error:** ${msg.error}\n\n`;
        }
      }
    }

    await navigator.clipboard.writeText(markdown);
    setCopyPopoverOpen(false);
  };

  const handleCheckpointSelect = async () => {
    // Reload messages from the checkpoint
    await loadSessionHistory();
    // Ensure timeline reloads to highlight current checkpoint
    setTimelineVersion((v) => v + 1);
  };

  const handleCheckpointCreated = () => {
    // Update checkpoint count in session metrics
    sessionMetrics.current.checkpointCount += 1;
  };

  const handleCancelExecution = async () => {
    if (!claudeSessionId || !isLoading) return;

    try {
      const sessionStartTimeLocal = messages.length > 0 ? (Number(messages[0].timestamp) || Date.now()) : Date.now();
      const duration = Date.now() - sessionStartTimeLocal;

      // Force immediate UI state reset to prevent new prompts
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setQueuedPrompts([]);
      queuedPromptsRef.current = [];

      await api.cancelClaudeExecution(claudeSessionId);

      // Calculate metrics for enhanced analytics
      const metrics = sessionMetrics.current;
      const timeToFirstMessage = metrics.firstMessageTime
        ? metrics.firstMessageTime - sessionStartTime.current
        : undefined;
      const idleTime = Date.now() - metrics.lastActivityTime;
      const avgResponseTime = metrics.toolExecutionTimes.length > 0
        ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) / metrics.toolExecutionTimes.length
        : undefined;

      // Track enhanced session stopped
      trackEvent.enhancedSessionStopped({
        // Basic metrics
        duration_ms: duration,
        messages_count: messages.length,
        reason: 'user_stopped',

        // Timing metrics
        time_to_first_message_ms: timeToFirstMessage,
        average_response_time_ms: avgResponseTime,
        idle_time_ms: idleTime,

        // Interaction metrics
        prompts_sent: metrics.promptsSent,
        tools_executed: metrics.toolsExecuted,
        tools_failed: metrics.toolsFailed,
        files_created: metrics.filesCreated,
        files_modified: metrics.filesModified,
        files_deleted: metrics.filesDeleted,

        // Content metrics
        total_tokens_used: totalTokens,
        code_blocks_generated: metrics.codeBlocksGenerated,
        errors_encountered: metrics.errorsEncountered,

        // Session context
        model: metrics.modelChanges.length > 0
          ? metrics.modelChanges[metrics.modelChanges.length - 1].to
          : 'sonnet', // Default to sonnet
        has_checkpoints: metrics.checkpointCount > 0,
        checkpoint_count: metrics.checkpointCount,
        was_resumed: metrics.wasResumed,

        // Agent context (if applicable)
        agent_type: undefined, // TODO: Pass from agent execution
        agent_name: undefined, // TODO: Pass from agent execution
        agent_success: undefined, // TODO: Pass from agent execution

        // Stop context
        stop_source: 'user_button',
        final_state: 'cancelled',
        has_pending_prompts: queuedPrompts.length > 0,
        pending_prompts_count: queuedPrompts.length,
      });
      // Clean up listeners
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];

      // Reset states
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);

      // Clear queued prompts (both state and ref)
      setQueuedPrompts([]);
      queuedPromptsRef.current = [];

      // Add a message indicating the session was cancelled
      const cancelMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "info",
        result: "Session cancelled by user",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, cancelMessage]);
    } catch (err) {
      logger.error("Failed to cancel execution:", err);

      // Even if backend fails, we should update UI to reflect stopped state
      // Add error message but still stop the UI loading state
      const errorMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "error",
        result: `Failed to cancel execution: ${err instanceof Error ? err.message : "Unknown error"}. The process may still be running in the background.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);

      // Clean up listeners anyway
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];

      // Reset states to allow user to continue
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
      
      // Clear queued prompts even on error
      setQueuedPrompts([]);
      queuedPromptsRef.current = [];
    }
  };

  /**
   * Handle forking from a checkpoint
   *
   * @param checkpointId - ID of the checkpoint to fork from
   */
  const handleFork = (checkpointId: string) => {
    setForkCheckpointId(checkpointId);
    setForkSessionName(`Fork-${new Date().toISOString().slice(0, 10)}`);
    setShowForkDialog(true);
  };

  const handleConfirmFork = async () => {
    if (!forkCheckpointId || !forkSessionName.trim() || !effectiveSession) return;

    try {
      setIsLoading(true);
      setError(null);

      const newSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await api.forkFromCheckpoint(
        forkCheckpointId,
        effectiveSession.id,
        effectiveSession.project_id,
        projectPath,
        newSessionId,
        forkSessionName
      );

      // Open the new forked session
      // You would need to implement navigation to the new session
      logger.debug("Forked to new session:", newSessionId);

      setShowForkDialog(false);
      setForkCheckpointId(null);
      setForkSessionName("");
    } catch (err) {
      logger.error("Failed to fork checkpoint:", err);
      setError("Failed to fork checkpoint");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle URL detection from terminal output
  /**
   * Handle when a URL is detected in message content
   *
   * @param url - The detected URL
   */
  /**
   * Handle when a URL is detected in message content
   *
   * @param url - The detected URL
   */
  const handleLinkDetected = (url: string) => {
    if (!showPreview && !showPreviewPrompt) {
      setPreviewUrl(url);
      setShowPreviewPrompt(true);
    }
  };

  /**
   * Handle closing the preview pane
   */
  const handleClosePreview = () => {
    setShowPreview(false);
    setIsPreviewMaximized(false);
    // Keep the previewUrl so it can be restored when reopening
  };

  /**
   * Handle preview URL change
   *
   * @param url - New URL for the preview
   */
  const handlePreviewUrlChange = (url: string) => {
    logger.debug("[ClaudeCodeSession] Preview URL changed to:", url);
    setPreviewUrl(url);
  };

  /**
   * Handle toggling preview maximize state
   */
  const handleTogglePreviewMaximize = () => {
    setIsPreviewMaximized(!isPreviewMaximized);
    // Reset split position when toggling maximize
    if (isPreviewMaximized) {
      setSplitPosition(50);
    }
  };

  /**
   * Toggle selection mode for message deletion
   */
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedMessageIndices(new Set());
  };

  /**
   * Toggle message selection
   */
  const toggleMessageSelection = (index: number) => {
    const newSelection = new Set(selectedMessageIndices);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedMessageIndices(newSelection);
  };

  /**
   * Select all messages
   */
  const selectAllMessages = () => {
    const allIndices = new Set<number>();
    messages.forEach((_, index) => allIndices.add(index));
    setSelectedMessageIndices(allIndices);
  };

  /**
   * Deselect all messages
   */
  const deselectAllMessages = () => {
    setSelectedMessageIndices(new Set());
  };

  /**
   * Delete selected messages
   */
  const deleteSelectedMessages = async () => {
    if (!effectiveSession || selectedMessageIndices.size === 0) return;

    try {
      // Filter out selected messages
      const remainingMessages = messages.filter((_, index) => !selectedMessageIndices.has(index));
      
      // Save the updated history
      await api.saveSessionHistory(
        effectiveSession.id,
        effectiveSession.project_id,
        remainingMessages
      );

      // Update local state
      const deletedCount = selectedMessageIndices.size;
      setMessages(remainingMessages);
      setSelectedMessageIndices(new Set());
      setSelectionMode(false);
      setShowDeleteDialog(false);

      setToast({
        message: t.sessions.messagesDeleted.replace('{count}', deletedCount.toString()),
        type: "success"
      });

      trackEvent.sessionEngagement({
        session_duration_ms: 0,
        messages_sent: 0,
        tools_used: [],
        files_modified: 0,
        engagement_score: 0,
      });
    } catch (err) {
      logger.error("Failed to delete messages:", err);
      setToast({
        message: t.sessions.failedToDeleteMessages,
        type: "error"
      });
    }
  };

  // Cleanup event listeners and track mount state
  useEffect(() => {
    isMountedRef.current = true;
    // Reset listening state when component mounts to ensure clean state
    isListeningRef.current = false;
    
    // Reset other states to ensure clean initialization
    setError(null);
    setRawJsonlOutput([]);
    setQueuedPrompts([]);
    
    // Reset session refs
    hasActiveSessionRef.current = false;

    // No longer need position fixing since we removed inline styles

    // Listen for tab-cleanup events to determine if we should cancel the session
    const handleTabCleanup = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { sessionData } = customEvent.detail;
      
      // If this cleanup event is for our session, cancel it
      if (sessionData?.id === session?.id && claudeSessionId && isLoading) {
        logger.debug("[ClaudeCodeSession] Cancelling session due to tab closure:", claudeSessionId);
        api.cancelClaudeExecution(claudeSessionId).catch((err) => {
          logger.error("Failed to cancel session on tab close:", err);
        });
      }
    };

    // Handle window resize (placeholder for future features)
    const handleWindowResize = () => {
      // Placeholder for window resize handling
    };

    // Handle environment refresh from tab refresh button
    const handleEnvironmentRefresh = () => {
      logger.debug("[ClaudeCodeSession] Environment refresh requested");
      // The environment variables will be automatically reloaded by Claude Code
      // when starting new sessions. For existing sessions, we can add a notification.
      if (claudeSessionId && isLoading) {
        logger.info("[ClaudeCodeSession] Environment refresh requested during active session - changes will apply to new sessions");
      }
    };

    window.addEventListener("tab-cleanup", handleTabCleanup);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("refresh-environment", handleEnvironmentRefresh);

    return () => {
      logger.debug("[ClaudeCodeSession] Component unmounting, cleaning up listeners");
      isMountedRef.current = false;
      isListeningRef.current = false;

      // Component cleanup

      // Remove the event listeners
      window.removeEventListener("tab-cleanup", handleTabCleanup);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("refresh-environment", handleEnvironmentRefresh);

      // Clean up listeners when component unmounts
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];
      isListeningRef.current = false;
      
      // Clear any remaining queued prompts to prevent continuation
      setQueuedPrompts([]);
      queuedPromptsRef.current = [];

      // Don't automatically cancel session on component unmount
      // Session will only be cancelled when tab is actually closed (via tab-cleanup event)

      // Track session completion with engagement metrics
      if (effectiveSession) {
        trackEvent.sessionCompleted();

        // Track session engagement
        const sessionDuration = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
        const messageCount = messages.filter(m => m.user_message).length;
        const toolsUsed = new Set<string>();
        messages.forEach(msg => {
          if (msg.type === 'assistant' && msg.message?.content) {
            const tools = msg.message.content.filter((c: any) => c.type === 'tool_use');
            tools.forEach((tool: any) => toolsUsed.add(tool.name));
          }
        });

        // Calculate engagement score (0-100)
        const engagementScore = Math.min(100,
          (messageCount * 10) +
          (toolsUsed.size * 5) +
          (sessionDuration > 300000 ? 20 : sessionDuration / 15000) // 5+ min session gets 20 points
        );

        trackEvent.sessionEngagement({
          session_duration_ms: sessionDuration,
          messages_sent: messageCount,
          tools_used: Array.from(toolsUsed),
          files_modified: 0, // TODO: Track file modifications
          engagement_score: Math.round(engagementScore)
        });
      }
      // Clean up listeners
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];

      // Clear checkpoint manager when session ends
      if (effectiveSession) {
        api.clearCheckpointManager(effectiveSession.id).catch((err) => {
          logger.error("Failed to clear checkpoint manager:", err);
        });
      }
    };
  }, [effectiveSession, projectPath, claudeSessionId, isLoading, session?.id]);

  const messagesList = (
    <motion.div
      ref={parentRef}
      className={cn(
        "flex-1 overflow-y-auto relative pb-40",
        "virtual-container optimized-scroll"
      )}
      style={{
        contain: "strict",
      }}
    >
      <motion.div
        className="relative w-full mx-auto px-2 pt-8 pb-8"
        style={{
          height: `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`,
          minHeight: "100px",
        }}
      >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const message = displayableMessages[virtualItem.index];
            const messageIndex = messages.findIndex(m => m === message);
            const isSelected = selectedMessageIndices.has(messageIndex);
            
            return (
            <motion.div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={(el) => el && rowVirtualizer.measureElement(el)}
                className={cn(
                  "absolute inset-x-2 pb-4",
                  selectionMode && "cursor-pointer hover:bg-muted/30 rounded-lg transition-colors",
                  isSelected && "bg-primary/10 border border-primary/50 rounded-lg"
                )}
                style={{
                  top: virtualItem.start,
                }}
                onClick={() => selectionMode && messageIndex >= 0 && toggleMessageSelection(messageIndex)}
              >
                {selectionMode && messageIndex >= 0 && (
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMessageSelection(messageIndex)}
                      className="w-4 h-4 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                <div className={cn(selectionMode && messageIndex >= 0 && "ml-8")}>
                  <StreamMessage
                    message={message}
                    streamMessages={messages}
                    onLinkDetected={handleLinkDetected}
                    onCopyToInput={(text) => {
                      floatingPromptRef.current?.setPrompt(text);
                    }}
                  />
                </div>
            </motion.div>
            );      })}
      </motion.div>

      {/* Loading indicator under the latest message */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-4 mb-40"
        >
          <div className="rotating-symbol text-primary" />
        </motion.div>
      )}

      {/* Error indicator */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
                          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive mb-40 w-full mx-auto"
        >
          {error}
        </motion.div>
      )}
    </motion.div>
  );

  const projectPathInput = !session && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="p-3 border-b border-border flex-shrink-0 bg-background/30"
    >
      <Label htmlFor="project-path" className="text-xs font-medium text-muted-foreground">
        Project Directory
      </Label>
      <motion.div className="flex items-center gap-2 mt-1.5">
        <Input
          id="project-path"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="/path/to/your/project"
          className="flex-1 h-8 text-sm"
          disabled={isLoading}
        />
        <Button onClick={handleSelectPath} size="icon" variant="outline" disabled={isLoading} className="h-8 w-8">
          <FolderOpen className="h-3.5 w-3.5" />
        </Button>
      </motion.div>
    </motion.div>
  );

  // If preview is maximized, render only the WebviewPreview in full screen
  if (showPreview && isPreviewMaximized) {
    return (
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-50 bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <WebviewPreview
            initialUrl={previewUrl}
            onClose={handleClosePreview}
            isMaximized={isPreviewMaximized}
            onToggleMaximize={handleTogglePreviewMaximize}
            onUrlChange={handlePreviewUrlChange}
            className="h-full"
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div className={cn("flex flex-col h-full bg-background performance-optimized", className)}>
      <motion.div className="w-full h-full flex flex-col">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-2 border-b border-border bg-background/50 backdrop-blur-sm h-12"
        >
          <motion.div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-6 w-6" title="关闭当前标签页">
              <X className="h-3 w-3" />
            </Button>
            <motion.div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              <motion.div className="flex-1">
                  <h1 className="text-sm font-semibold">{t.sessions.claudeCodeSession}</h1>
                <p className="text-xs text-muted-foreground">
                  {projectPath ? `${projectPath}` : "No project selected"}
                </p>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* 模型选择栏 */}
          <motion.div className="flex items-center gap-1">
            {/* 供应商（环境分组）下拉框 */}
            {projectPath && envGroups.length > 0 && (
              <Select 
                value={selectedEnvGroup?.toString() || ""} 
                onValueChange={handleEnvGroupChange}
                disabled={isLoading || loadingEnvGroups}
              >
                <SelectTrigger className="h-6 w-28 text-xs">
                  <SelectValue placeholder="供应商" />
                </SelectTrigger>
                <SelectContent>
                  {envGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id!.toString()}>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          group.enabled ? "bg-green-500" : "bg-gray-400"
                        )} />
                        <span className="truncate">{group.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* 模型下拉框 */}
            {projectPath && availableModels.length > 0 && (
              <Select 
                value={selectedModel} 
                onValueChange={async (value) => {
                  setSelectedModel(value as ClaudeModel);
                  localStorage.setItem('selected-model', value);
                  logger.info(`Model selected: ${value}`);
                  // 更新 Claude settings.json 文件
                  try {
                    await api.updateClaudeSettingsWithModel(value, projectPath);
                    logger.info(`Updated Claude settings.json with model: ${value}`);
                  } catch (error) {
                    logger.error("Failed to update Claude settings.json with model:", error);
                  }
                }}
                disabled={isLoading || loadingModels}
              >
                <SelectTrigger className="h-6 w-36 text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center gap-2">
                        <span className="truncate">{model.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* 思考模式下拉框 */}
            {projectPath && (
              <Select 
                value={selectedThinkingMode} 
                onValueChange={(value) => setSelectedThinkingMode(value as ThinkingMode)}
                disabled={isLoading}
              >
                <SelectTrigger className="h-6 w-28 text-xs">
                  <Brain className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="思考模式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <span>Auto</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="think">
                    <div className="flex items-center gap-2">
                      <span>Think</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="think_hard">
                    <div className="flex items-center gap-2">
                      <span>Think Hard</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="think_harder">
                    <div className="flex items-center gap-2">
                      <span>Think Harder</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ultrathink">
                    <div className="flex items-center gap-2">
                      <span>Ultrathink</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            
            {/* 刷新按钮 */}
            {projectPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshEnvironment}
                disabled={isLoading || loadingEnvGroups}
                title="刷新环境变量和模型配置"
                className="h-6 px-2 text-xs"
              >
                <RefreshCw className={cn("h-2.5 w-2.5 mr-1", loadingEnvGroups && "animate-spin")} />
                刷新
              </Button>
            )}
            
            {/* 命令按钮 */}
            {projectPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSlashCommandsSettings(true)}
                disabled={isLoading}
                className="h-6 px-2 text-xs"
              >
                <Command className="h-2.5 w-2.5 mr-1" />
                {t.sessions.commands}
              </Button>
            )}
            
            {/* Hooks设置按钮 */}
            {projectPath && onProjectSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onProjectSettings(projectPath)}
                disabled={isLoading}
                className="h-6 px-2 text-xs"
              >
                <Settings className="h-2.5 w-2.5 mr-1" />
                Hooks
              </Button>
            )}
            {showSettings && (
              <CheckpointSettings
                sessionId={effectiveSession?.id || ""}
                projectId={effectiveSession?.project_id || ""}
                projectPath={projectPath}
              />
            )}
                  <Button
                    variant="ghost"
              size="sm"
                    onClick={() => setShowSettings(!showSettings)}
              className={cn("h-6 px-2 text-xs", showSettings && "text-primary")}
                  >
              <Settings className="h-2.5 w-2.5 mr-1" />
              检查点设置
                  </Button>
            {effectiveSession && (
                    <Button
                      variant="ghost"
                size="sm"
                      onClick={() => setShowTimeline(!showTimeline)}
                className={cn("h-6 px-2 text-xs", showTimeline && "text-primary")}
                    >
                <GitBranch className="h-2.5 w-2.5 mr-1" />
                时间线导航器
                    </Button>
            )}
            {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                className="flex items-center gap-1 h-6 px-2 text-xs"
                onClick={() => setCopyPopoverOpen(true)}
                    >
                <Copy className="h-2.5 w-2.5" />
                {t.sessions.copyOutput}
                <ChevronDown className="h-2 w-2" />
                    </Button>
            )}
            {/* Message Selection Mode Controls */}
            {messages.length > 0 && effectiveSession && (
              <div className="flex items-center gap-1">
                {!selectionMode ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSelectionMode}
                    className="h-6 px-2 text-xs"
                    title={t.sessions.selectMessagesToDelete}
                  >
                    <Trash2 className="h-2.5 w-2.5 mr-1" />
                    {t.sessions.selectMessages}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectAllMessages}
                      className="h-6 px-2 text-xs"
                      disabled={selectedMessageIndices.size === messages.length}
                    >
                      {t.sessions.selectAll}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deselectAllMessages}
                      className="h-6 px-2 text-xs"
                      disabled={selectedMessageIndices.size === 0}
                    >
                      {t.sessions.deselectAll}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                      className="h-6 px-2 text-xs"
                      disabled={selectedMessageIndices.size === 0}
                    >
                      <Trash2 className="h-2.5 w-2.5 mr-1" />
                      {t.sessions.deleteMessages} ({selectedMessageIndices.size})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleSelectionMode}
                      className="h-6 px-2 text-xs"
                    >
                      <X className="h-2.5 w-2.5 mr-1" />
                      {t.common.cancel}
                    </Button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* Main Content Area */}
        <motion.div
          className={cn(
            "flex-1 overflow-hidden transition-all duration-300 relative",
            showTimeline && "sm:mr-96"
          )}
        >
          {showPreview ? (
            // Split pane layout when preview is active
            <SplitPane
              left={
                <motion.div className="h-full flex flex-col">
                  {projectPathInput}
                  {messagesList}
                </motion.div>
              }
              right={
                <WebviewPreview
                  initialUrl={previewUrl}
                  onClose={handleClosePreview}
                  isMaximized={isPreviewMaximized}
                  onToggleMaximize={handleTogglePreviewMaximize}
                  onUrlChange={handlePreviewUrlChange}
                />
              }
              initialSplit={splitPosition}
              onSplitChange={setSplitPosition}
              minLeftWidth={400}
              minRightWidth={400}
              className="h-full"
            />
          ) : (
            // Original layout when no preview
            <motion.div className="h-full flex flex-col mx-auto px-2">
              {projectPathInput}
              {messagesList}

              {isLoading && messages.length === 0 && !session && (
                <motion.div className="flex items-center justify-center h-full">
                  <motion.div className="flex items-center gap-3">
                    <motion.div className="rotating-symbol" />
                    <span className="text-sm text-muted-foreground">
                      Initializing Claude Code...
                    </span>
                  </motion.div>
                </motion.div>
              )}
              {isLoading && messages.length === 0 && session && (
                <motion.div className="flex items-center justify-center h-full">
                  <motion.div className="flex items-center gap-3">
                    <motion.div className="rotating-symbol" />
                    <span className="text-sm text-muted-foreground">
                      Loading session history...
                    </span>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Floating Prompt Input - Always visible */}
        <ErrorBoundary>
          {/* Queued Prompts Display */}
          <AnimatePresence>
            {queuedPrompts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-full px-2"
              >
                <motion.div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg p-3 space-y-2">
                  <motion.div className="flex items-center justify-between">
                    <motion.div className="text-xs font-medium text-muted-foreground mb-1">
                      Queued Prompts ({queuedPrompts.length})
                    </motion.div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQueuedPromptsCollapsed((prev) => !prev)}
                    >
                      {queuedPromptsCollapsed ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </motion.div>
                  {!queuedPromptsCollapsed &&
                    queuedPrompts.map((queuedPrompt, index) => (
                      <motion.div
                        key={queuedPrompt.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-start gap-2 bg-muted/50 rounded-md p-2"
                      >
                        <motion.div className="flex-1 min-w-0">
                          <motion.div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              #{index + 1}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                              {(() => {
                                const modelNames = {
                                  haiku: "Haiku",
                                  "sonnet-3-5": "Sonnet 3.5",
                                  "sonnet-3-7": "Sonnet 3.7",
                                  sonnet: "Sonnet 4",
                                  opus: "Opus",
                                };
                                return (
                                  modelNames[queuedPrompt.model as keyof typeof modelNames] ||
                                  queuedPrompt.model
                                );
                              })()}
                            </span>
                          </motion.div>
                          <p className="text-sm line-clamp-2 break-words">{queuedPrompt.prompt}</p>
                        </motion.div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() =>
                            setQueuedPrompts((prev) => prev.filter((p) => p.id !== queuedPrompt.id))
                          }
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </motion.div>
                    ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Arrows - positioned above prompt bar with spacing */}
          {displayableMessages.length > 5 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.5 }}
              className="fixed bottom-32 right-6 z-50"
            >
              <motion.div className="flex flex-col items-center bg-background/95 backdrop-blur-md border rounded-xl shadow-lg overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Use virtualizer to scroll to the first item
                    if (displayableMessages.length > 0) {
                      // Scroll to top of the container
                      parentRef.current?.scrollTo({
                        top: 0,
                        behavior: "smooth",
                      });

                      // After smooth scroll completes, trigger a small scroll to ensure rendering
                      globalThis.setTimeout(() => {
                        if (parentRef.current) {
                          // Scroll down 1px then back to 0 to trigger virtualizer update
                          parentRef.current.scrollTop = 1;
                          globalThis.requestAnimationFrame(() => {
                            if (parentRef.current) {
                              parentRef.current.scrollTop = 0;
                            }
                          });
                        }
                      }, 500); // Wait for smooth scroll to complete
                    }
                  }}
                  className="px-2 py-2 hover:bg-accent rounded-none"
                  title="Scroll to top"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <motion.div className="h-px w-4 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Use virtualizer to scroll to the last item
                    if (displayableMessages.length > 0) {
                      // Scroll to bottom of the container
                      const scrollElement = parentRef.current;
                      if (scrollElement) {
                        scrollElement.scrollTo({
                          top: scrollElement.scrollHeight,
                          behavior: "smooth",
                        });
                      }
                    }
                  }}
                  className="px-2 py-2 hover:bg-accent rounded-none"
                  title="Scroll to bottom"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </motion.div>
            </motion.div>
          )}

          <FloatingPromptInput
            ref={floatingPromptRef}
            onSend={handleSendPrompt}
            onCancel={handleCancelExecution}
            isLoading={isLoading}
            disabled={!projectPath}
            projectPath={projectPath}
            defaultModel={selectedModel}
            className={cn(
              showTimeline && "sm:right-96"
            )}
          />

          {/* Token Counter - positioned under the Send button */}
          {totalTokens > 0 && (
            <motion.div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
              <motion.div className="mx-auto px-2">
                <motion.div className="flex justify-end px-4 pb-2">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="bg-background/95 backdrop-blur-md border rounded-full px-3 py-1 shadow-lg pointer-events-auto"
                  >
                    <motion.div className="flex items-center gap-1.5 text-xs">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono">{totalTokens.toLocaleString()}</span>
                      <span className="text-muted-foreground">tokens</span>
                    </motion.div>
                  </motion.div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </ErrorBoundary>

        {/* Timeline */}
        <AnimatePresence>
          {showTimeline && effectiveSession && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full sm:w-96 bg-background border-l border-border shadow-xl z-30 overflow-hidden"
            >
              <motion.div className="h-full flex flex-col">
                {/* Timeline Header */}
                <motion.div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-lg font-semibold">{t.sessions.sessionTimeline}</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowTimeline(false)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>

                {/* Timeline Content */}
                <motion.div className="flex-1 overflow-y-auto p-4">
                  <TimelineNavigator
                    sessionId={effectiveSession.id}
                    projectId={effectiveSession.project_id}
                    projectPath={projectPath}
                    currentMessageIndex={messages.length - 1}
                    onCheckpointSelect={handleCheckpointSelect}
                    onFork={handleFork}
                    onCheckpointCreated={handleCheckpointCreated}
                    refreshVersion={timelineVersion}
                  />
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Fork Dialog */}
      <Dialog open={showForkDialog} onOpenChange={setShowForkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fork Session</DialogTitle>
            <DialogDescription>
              Create a new session branch from the selected checkpoint.
            </DialogDescription>
          </DialogHeader>

          <motion.div className="space-y-4 py-4">
            <motion.div className="space-y-2">
              <Label htmlFor="fork-name">New Session Name</Label>
              <Input
                id="fork-name"
                placeholder="e.g., Alternative approach"
                value={forkSessionName}
                onChange={(e) => setForkSessionName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    handleConfirmFork();
                  }
                }}
              />
            </motion.div>
          </motion.div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForkDialog(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleConfirmFork} disabled={isLoading || !forkSessionName.trim()}>
              Create Fork
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      {showSettings && effectiveSession && (
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-2xl">
            <CheckpointSettings
              sessionId={effectiveSession.id}
              projectId={effectiveSession.project_id}
              projectPath={projectPath}
              onClose={() => setShowSettings(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Slash Commands Settings Dialog */}
      {showSlashCommandsSettings && (
        <Dialog open={showSlashCommandsSettings} onOpenChange={setShowSlashCommandsSettings}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>{t.sessions.slashCommands}</DialogTitle>
              <DialogDescription>
                {t.sessions.manageProjectSpecificSlashCommands} {projectPath}
              </DialogDescription>
            </DialogHeader>
            <motion.div className="flex-1 overflow-y-auto">
              <SlashCommandsManager projectPath={projectPath} />
            </motion.div>
          </DialogContent>
        </Dialog>
      )}

      {/* Copy Output Dialog */}
      {copyPopoverOpen && (
        <Dialog open={copyPopoverOpen} onOpenChange={setCopyPopoverOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t.sessions.copyOutput}</DialogTitle>
              <DialogDescription>
                选择要复制的格式
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAsMarkdown}
                className="w-full justify-start h-10"
              >
                <Copy className="h-4 w-4 mr-2" />
                {t.sessions.copyAsMarkdown}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAsJsonl}
                className="w-full justify-start h-10"
              >
                <Copy className="h-4 w-4 mr-2" />
                {t.sessions.copyAsJsonl}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCopyPopoverOpen(false)}>
                取消
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.sessions.deleteMessagesConfirm}</DialogTitle>
            <DialogDescription>
              {t.sessions.deleteMessagesDesc.replace('{count}', selectedMessageIndices.size.toString())}
              <br />
              {t.sessions.deleteMessagesWarning}
              <br />
              <span className="text-xs text-muted-foreground mt-2 block">
                {t.sessions.deleteMessagesBackup}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={deleteSelectedMessages}
            >
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Performance Monitor */}
      
      {/* Toast Notification */}
      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>
    </motion.div>
  );
};
