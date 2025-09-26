import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Play,
  StopCircle,
  FolderOpen,
  Terminal,
  AlertCircle,
  Loader2,
  Copy,
  ChevronDown,
  Maximize2,
  X,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api, type Agent, type ModelInfo } from "@/lib/api";
import { type ClaudeModel } from "@/types/models";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { StreamMessage } from "./StreamMessage";
import { ExecutionControlBar } from "./ExecutionControlBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AGENT_ICONS } from "@/constants/agentIcons";
import { HooksEditor } from "./HooksEditor";
import { logger } from "@/lib/logger";
import { handleError } from "@/lib/errorHandler";
import { useTrackEvent, useComponentMetrics, useFeatureAdoptionTracking } from "@/hooks";
import { useI18n } from "@/lib/i18n";

interface AgentExecutionProps {
  /**
   * The agent to execute
   */
  agent: Agent;
  /**
   * Callback to go back to the agents list
   */
  onBack: () => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

interface MessageContent {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: string;
  tool_use_id?: string;
  id?: string;
}

export interface ClaudeStreamMessage {
  type: "system" | "assistant" | "user" | "result";
  subtype?: string;
  message?: {
    content?: MessageContent[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  tools?: string[];
  cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  result?: string;
  error?: string;
  session_id?: string;
  model?: string;
  cwd?: string;
  [key: string]: unknown;
}

/**
 * AgentExecution component for running CC agents
 *
 * @example
 * <AgentExecution agent={agent} onBack={() => setView('list')} />
 */
export const AgentExecution: React.FC<AgentExecutionProps> = ({ agent, onBack, className }) => {
  const { t } = useI18n();
  const [projectPath, setProjectPath] = useState("");
  const [task, setTask] = useState(agent.default_task || "");
  const [model, setModel] = useState<ClaudeModel>((agent.model as ClaudeModel) || "sonnet-3-5");
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([]);
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyPopoverOpen, setCopyPopoverOpen] = useState(false);
  
  // Dynamic models state
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  
  // Load available models from enabled environment variable groups
  useEffect(() => {
    const loadModels = async () => {
      try {
        setModelsLoading(true);
        const models = await api.getAvailableModels();
        setAvailableModels(models);
        
        if (models.length === 0) {
          logger.warn("No models found in enabled environment variable groups");
        } else {
          logger.info(`Loaded ${models.length} models from enabled environment variable groups`);
          
          // Update current model if it's not in the available models
          if (!models.find(m => m.id === model) && models.length > 0) {
            setModel(models[0].id as ClaudeModel);
          }
        }
      } catch (error) {
        logger.error("Failed to load available models:", error);
      } finally {
        setModelsLoading(false);
      }
    };

    loadModels();
  }, [model]);
  // Analytics tracking
  const trackEvent = useTrackEvent();
  useComponentMetrics('AgentExecution');
  const agentFeatureTracking = useFeatureAdoptionTracking(`agent_${agent.name || 'custom'}`);
  // Hooks configuration state
  const [isHooksDialogOpen, setIsHooksDialogOpen] = useState(false);
  const [activeHooksTab, setActiveHooksTab] = useState("project");

  // Execution stats
  const [executionStartTime, setExecutionStartTime] = useState<number | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState(false);

  const messagesEndRef = useRef<globalThis.HTMLDivElement>(null);
  const messagesContainerRef = useRef<globalThis.HTMLDivElement>(null);
  const scrollContainerRef = useRef<globalThis.HTMLDivElement>(null);
  const fullscreenScrollRef = useRef<globalThis.HTMLDivElement>(null);
  const fullscreenMessagesEndRef = useRef<globalThis.HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const elapsedTimeIntervalRef = useRef<globalThis.NodeJS.Timeout | null>(null);
  const [runId, setRunId] = useState<number | null>(null);

  // Filter out messages that shouldn't be displayed
  /**
   * Memoized computation of displayable messages with tool widgets
   *
   * Processes raw messages to determine which ones should show tool widgets
   * and creates a filtered list for display.
   */
  const displayableMessages = React.useMemo(() => {
    return messages.filter((message, index) => {
      // Skip meta messages that don't have meaningful content
      if (message.isMeta && !message.leafUuid && !message.summary) {
        return false;
      }

      // Skip empty user messages
      if (message.type === "user" && message.message) {
        if (message.isMeta) return false;

        const msg = message.message;
        if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) {
          return false;
        }

        // Check if user message has visible content by checking its parts
        if (Array.isArray(msg.content)) {
          let hasVisibleContent = false;
          for (const content of msg.content) {
            if (content.type === "text") {
              hasVisibleContent = true;
              break;
            } else if (content.type === "tool_result") {
              // Check if this tool result will be skipped by a widget
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
                        (toolUse as MessageContent).name?.startsWith("mcp__")
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
  }, [messages]);

  // Virtualizers for efficient, smooth scrolling of potentially very long outputs
  const rowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 150, // fallback estimate; dynamically measured afterwards
    overscan: 5,
  });

  const fullscreenRowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => fullscreenScrollRef.current,
    estimateSize: () => 150,
    overscan: 5,
  });

  useEffect(() => {
    // Clean up listeners on unmount
    return () => {
      unlistenRefs.current.forEach((unlisten) => unlisten());
      if (elapsedTimeIntervalRef.current) {
        globalThis.clearInterval(elapsedTimeIntervalRef.current);
      }
    };
  }, []);

  // Check if user is at the very bottom of the scrollable container
  /**
   * Check if the scroll container is at the bottom
   *
   * @returns True if the container is scrolled to the bottom
   */
  const isAtBottom = useCallback(() => {
    const container = isFullscreenModalOpen
      ? fullscreenScrollRef.current
      : scrollContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // 增加阈值到 10px，更容易触发自动滚动
      return distanceFromBottom < 10;
    }
    return true;
  }, [isFullscreenModalOpen]);

  useEffect(() => {
    if (displayableMessages.length === 0) return;

    // Auto-scroll only if the user has not manually scrolled OR they are still at the bottom
    const shouldAutoScroll = !hasUserScrolled || isAtBottom();

    if (shouldAutoScroll) {
      // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
      requestAnimationFrame(() => {
        try {
          if (isFullscreenModalOpen) {
            fullscreenRowVirtualizer.scrollToIndex(displayableMessages.length - 1, {
              align: "end",
              behavior: "smooth",
            });
            
            // 双重保障：确保滚动到底部
            setTimeout(() => {
              const container = fullscreenScrollRef.current;
              if (container) {
                container.scrollTop = container.scrollHeight;
              }
            }, 100);
          } else {
            rowVirtualizer.scrollToIndex(displayableMessages.length - 1, {
              align: "end",
              behavior: "smooth",
            });
            
            // 双重保障：确保滚动到底部
            setTimeout(() => {
              const container = scrollContainerRef.current;
              if (container) {
                container.scrollTop = container.scrollHeight;
              }
            }, 100);
          }
        } catch (error) {
          console.warn("Failed to scroll to bottom:", error);
        }
      });
    }
  }, [
    displayableMessages.length,
    hasUserScrolled,
    isFullscreenModalOpen,
    rowVirtualizer,
    fullscreenRowVirtualizer,
    isAtBottom,
  ]);

  // Update elapsed time while running
  useEffect(() => {
    if (isRunning && executionStartTime) {
      elapsedTimeIntervalRef.current = globalThis.setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - executionStartTime) / 1000));
      }, 100);
    } else {
      if (elapsedTimeIntervalRef.current) {
        globalThis.clearInterval(elapsedTimeIntervalRef.current);
      }
    }

    return () => {
      if (elapsedTimeIntervalRef.current) {
        globalThis.clearInterval(elapsedTimeIntervalRef.current);
      }
    };
  }, [isRunning, executionStartTime]);

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

  /**
   * Handle selecting a project path using file dialog
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
        setError(null); // Clear any previous errors
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await handleError(error, { operation: "selectDirectory", component: "AgentExecution" });
      setError(`Failed to select directory: ${error.message}`);
    }
  };

  /**
   * Handle opening the hooks configuration dialog
   */
  const handleOpenHooksDialog = async () => {
    setIsHooksDialogOpen(true);
  };

  /**
   * Handle executing the agent with current task
   */
  const handleExecute = async () => {
    try {
      setIsRunning(true);
      setExecutionStartTime(Date.now());
      setMessages([]);
      setRawJsonlOutput([]);
      setRunId(null);

      // Clear any existing listeners
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];

      // Execute the agent and get the run ID
      const executionRunId = await api.executeAgent(agent.id ?? 0, projectPath, task, model);
      logger.debug("Agent execution started with run ID:", executionRunId);
      setRunId(executionRunId);

      // Track agent execution start
      trackEvent.agentStarted({
        agent_type: agent.name || 'custom',
        agent_name: agent.name,
        has_custom_prompt: task !== agent.default_task
      });

      // Track feature adoption
      agentFeatureTracking.trackUsage();

      // Set up event listeners with run ID isolation
      const outputUnlisten = await listen<string>(
        `agent-output:${executionRunId}`,
        async (event) => {
          try {
            // Store raw JSONL
            setRawJsonlOutput((prev) => [...prev, event.payload]);

            // Parse and display
            const message = JSON.parse(event.payload) as ClaudeStreamMessage;
            setMessages((prev) => [...prev, message]);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            await handleError(error, {
              operation: "parseAgentMessage",
              payload: event.payload,
              component: "AgentExecution",
            });
          }
        }
      );

      const errorUnlisten = await listen<string>(`agent-error:${executionRunId}`, async (event) => {
        await handleError(new Error(event.payload), {
          operation: "agentError",
          component: "AgentExecution",
        });
        setError(event.payload);

        // Track agent error
        trackEvent.agentError({
          error_type: 'runtime_error',
          error_stage: 'execution',
          retry_count: 0,
          agent_type: agent.name || 'custom'
        });
      });

      const completeUnlisten = await listen<boolean>(
        `agent-complete:${executionRunId}`,
        async (event) => {
          setIsRunning(false);
          const duration = executionStartTime ? Date.now() - executionStartTime : undefined;
          setExecutionStartTime(null);
          if (!event.payload) {
            await handleError(new Error("Agent execution failed"), {
              operation: "agentExecutionFailed",
              component: "AgentExecution",
            });
            setError("Agent execution failed");
            // Track both the old event for compatibility and the new error event
            trackEvent.agentExecuted(agent.name || 'custom', false, agent.name, duration);
            trackEvent.agentError({
              error_type: 'execution_failed',
              error_stage: 'completion',
              retry_count: 0,
              agent_type: agent.name || 'custom'
            });
          } else {
            trackEvent.agentExecuted(agent.name || 'custom', true, agent.name, duration);
          }
        }
      );

      const cancelUnlisten = await listen<boolean>(
        `agent-cancelled:${executionRunId}`,
        async () => {
          setIsRunning(false);
          setExecutionStartTime(null);
          await handleError(new Error("Agent execution was cancelled"), {
            operation: "agentExecutionCancelled",
            component: "AgentExecution",
          });
          setError("Agent execution was cancelled");
        }
      );

      unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten, cancelUnlisten];
    } catch (err) {
      logger.error("Failed to execute agent:", err);
      setIsRunning(false);
      setExecutionStartTime(null);
      setRunId(null);
      // Show error in messages
      setMessages((prev) => [
        ...prev,
        {
          type: "result",
          subtype: "error",
          is_error: true,
          result: `Failed to execute agent: ${err instanceof Error ? err.message : "Unknown error"}`,
          duration_ms: 0,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        },
      ]);
    }
  };

  /**
   * Handle stopping the current agent execution
   */
  const handleStop = async () => {
    try {
      if (!runId) {
        await handleError("No run ID available to stop", {
          operation: "stopAgent",
          component: "AgentExecution",
        });
        return;
      }

      // Call the API to kill the agent session
      const success = await api.killAgentSession(runId);

      if (success) {
        logger.debug(`Successfully stopped agent session ${runId}`);
      } else {
        logger.warn(`Failed to stop agent session ${runId} - it may have already finished`);
      }

      // Update UI state
      setIsRunning(false);
      setExecutionStartTime(null);

      // Clean up listeners
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];

      // Add a message indicating execution was stopped
      setMessages((prev) => [
        ...prev,
        {
          type: "result",
          subtype: "error",
          is_error: true,
          result: "Execution stopped by user",
          duration_ms: elapsedTime * 1000,
          usage: {
            input_tokens: totalTokens,
            output_tokens: 0,
          },
        },
      ]);
    } catch (err) {
      logger.error("Failed to stop agent:", err);
      // Still update UI state even if the backend call failed
      setIsRunning(false);
      setExecutionStartTime(null);

      // Show error message
      setMessages((prev) => [
        ...prev,
        {
          type: "result",
          subtype: "error",
          is_error: true,
          result: `Failed to stop execution: ${err instanceof Error ? err.message : "Unknown error"}`,
          duration_ms: elapsedTime * 1000,
          usage: {
            input_tokens: totalTokens,
            output_tokens: 0,
          },
        },
      ]);
    }
  };

  /**
   * Handle back navigation with confirmation if execution is running
   */
  const handleBackWithConfirmation = () => {
    if (isRunning) {
      // Show confirmation dialog before navigating away during execution
      const shouldLeave = window.confirm(
        "An agent is currently running. If you navigate away, the agent will continue running in the background. You can view running sessions in the 'Running Sessions' tab within CC Agents.\n\nDo you want to continue?"
      );
      if (!shouldLeave) {
        return;
      }
    }

    // Clean up listeners but don't stop the actual agent process
    unlistenRefs.current.forEach((unlisten) => unlisten());
    unlistenRefs.current = [];

    // Navigate back
    onBack();
  };

  const handleCopyAsJsonl = async () => {
    const jsonl = rawJsonlOutput.join("\n");
    await navigator.clipboard.writeText(jsonl);
    setCopyPopoverOpen(false);
  };

  const handleCopyAsMarkdown = async () => {
    let markdown = `# Agent Execution: ${agent.name}\n\n`;
    markdown += `**Task:** ${task}\n`;
    markdown += `**Model:** ${model === "opus" ? "Claude 4 Opus" : "Claude 4 Sonnet"}\n`;
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
            markdown += `${content.text}\n\n`;
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
            markdown += `${content.text}\n\n`;
          } else if (content.type === "tool_result") {
            markdown += `### Tool Result\n\n`;
            markdown += `\`\`\`\n${content.content}\n\`\`\`\n\n`;
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
        if (msg.cost_usd !== undefined) {
          markdown += `- **Cost:** $${msg.cost_usd.toFixed(4)} USD\n`;
        }
        if (msg.duration_ms !== undefined) {
          markdown += `- **Duration:** ${(msg.duration_ms / 1000).toFixed(2)}s\n`;
        }
        if (msg.num_turns !== undefined) {
          markdown += `- **Turns:** ${msg.num_turns}\n`;
        }
        if (msg.usage) {
          const total = msg.usage.input_tokens + msg.usage.output_tokens;
          markdown += `- **Total Tokens:** ${total} (${msg.usage.input_tokens} in, ${msg.usage.output_tokens} out)\n`;
        }
      }
    }

    await navigator.clipboard.writeText(markdown);
    setCopyPopoverOpen(false);
  };

  /**
   * Render agent icon based on agent configuration
   *
   * @returns React icon component
   */
  const renderIcon = () => {
    const Icon =
      agent.icon in AGENT_ICONS ? AGENT_ICONS[agent.icon as keyof typeof AGENT_ICONS] : Terminal;
    return <Icon className="h-5 w-5" />;
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Fixed container that takes full height */}
      <div className="h-full flex flex-col">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-background border-b border-border">
          <div className="w-full max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="p-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleBackWithConfirmation}
                    className="h-8 w-8"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10 text-primary">
                      {renderIcon()}
                    </div>
                    <div>
                      <h1 className="text-xl font-bold">{t.agents.execute}: {agent.name}</h1>
                      <p className="text-sm text-muted-foreground">
                        {model === "opus" ? "Claude 4 Opus" : "Claude 4 Sonnet"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFullscreenModalOpen(true)}
                    disabled={messages.length === 0}
                  >
                    <Maximize2 className="h-4 w-4 mr-2" />
                    {t.app.fullscreen}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Sticky Configuration */}
        <div className="sticky top-[73px] z-10 bg-background border-b border-border">
          <div className="w-full max-w-5xl mx-auto p-4 space-y-4">
            {/* Error display */}
            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Project Path */}
            <div className="space-y-2">
              <Label>{t.common.projectPath}</Label>
              <div className="flex gap-2">
                <Input
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder={t.agents.selectOrEnterProjectPath}
                  disabled={isRunning}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSelectPath}
                  disabled={isRunning}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={handleOpenHooksDialog}
                  disabled={isRunning || !projectPath}
                  title={t.agents.configureHooks}
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  {t.agents.hooks}
                </Button>
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <Label>{t.agents.model}</Label>
              <Popover
                trigger={
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-between text-left font-normal",
                      isRunning && "opacity-50 cursor-not-allowed"
                    )}
                    disabled={isRunning}
                  >
                    <span className="flex items-center gap-2">
                      {(() => {
                        if (modelsLoading) {
                          return "Loading models...";
                        }
                        const selectedModel = availableModels.find(m => m.id === model);
                        return selectedModel ? selectedModel.name : model;
                      })()}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                }
                content={
                  <div className="p-2 space-y-1">
                    {modelsLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span className="ml-2 text-sm text-muted-foreground">Loading models...</span>
                      </div>
                    ) : availableModels.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No models available. Please configure models in environment variables.
                      </div>
                    ) : (
                      availableModels.map((modelOption) => (
                        <button
                          key={modelOption.id}
                          onClick={() => !isRunning && setModel(modelOption.id as ClaudeModel)}
                          className={cn(
                            "w-full px-3 py-2 text-left rounded-md transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            model === modelOption.id && "bg-accent text-accent-foreground",
                            isRunning && "opacity-50 cursor-not-allowed"
                          )}
                          disabled={isRunning}
                        >
                          <div className="font-medium text-sm">{modelOption.name}</div>
                          <div className="text-xs text-muted-foreground">{modelOption.description || modelOption.id}</div>
                        </button>
                      ))
                    )}
                  </div>
                }
                className="w-80 p-0"
                align="start"
              />
            </div>

            {/* Task Input */}
            <div className="space-y-2">
              <Label>{t.agents.task}</Label>
              <div className="flex gap-2">
                <Input
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder={t.agents.enterTaskForAgent}
                  disabled={isRunning}
                  className="flex-1"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !isRunning && projectPath && task.trim()) {
                      handleExecute();
                    }
                  }}
                />
                <Button
                  onClick={isRunning ? handleStop : handleExecute}
                  disabled={!projectPath || !task.trim()}
                  variant={isRunning ? "destructive" : "default"}
                >
                  {isRunning ? (
                    <>
                      <StopCircle className="mr-2 h-4 w-4" />
                      {t.agents.stop}
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      {t.agents.execute}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Output Display */}
        <div className="flex-1 overflow-hidden">
          <div className="w-full max-w-5xl mx-auto h-full">
            <div
              ref={scrollContainerRef}
              className="h-full overflow-y-auto p-6 space-y-8"
              onScroll={() => {
                // Mark that user has scrolled manually
                if (!hasUserScrolled) {
                  setHasUserScrolled(true);
                }

                // If user scrolls back to bottom, re-enable auto-scroll
                if (isAtBottom()) {
                  setHasUserScrolled(false);
                }
              }}
            >
              <div ref={messagesContainerRef}>
                {messages.length === 0 && !isRunning && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Terminal className="h-16 w-16 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">{t.agents.readyToExecute}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t.agents.selectProjectPathAndTask}
                    </p>
                  </div>
                )}

                {isRunning && messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-sm text-muted-foreground">{t.agents.initializingAgent}</span>
                    </div>
                  </div>
                )}

                <div
                  className="relative w-full"
                  style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                >
                  <AnimatePresence>
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                      const message = displayableMessages[virtualItem.index];
                      return (
                        <motion.div
                          key={virtualItem.key}
                          data-index={virtualItem.index}
                          ref={(el) => el && rowVirtualizer.measureElement(el)}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="absolute inset-x-4 pb-4"
                          style={{ top: virtualItem.start }}
                        >
                          <ErrorBoundary>
                            <StreamMessage message={message} streamMessages={messages} />
                          </ErrorBoundary>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Execution Control Bar */}
      <ExecutionControlBar
        isExecuting={isRunning}
        onStop={handleStop}
        totalTokens={totalTokens}
        elapsedTime={elapsedTime}
      />

      {/* Fullscreen Modal */}
      {isFullscreenModalOpen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              {renderIcon()}
              <h2 className="text-lg font-semibold">{agent.name} - {t.agents.output}</h2>
              {isRunning && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-600 font-medium">{t.agents.running}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Popover
                trigger={
                  <Button variant="ghost" size="sm" className="flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    {t.agents.copyOutput}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                }
                content={
                  <div className="w-44 p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={handleCopyAsJsonl}
                    >
                      {t.agents.copyAsJsonl}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={handleCopyAsMarkdown}
                    >
                      {t.agents.copyAsMarkdown}
                    </Button>
                  </div>
                }
                open={copyPopoverOpen}
                onOpenChange={setCopyPopoverOpen}
                align="end"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreenModalOpen(false)}
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                {t.common.close}
              </Button>
            </div>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-hidden p-6">
            <div
              ref={fullscreenScrollRef}
              className="h-full overflow-y-auto space-y-8"
              onScroll={() => {
                // Mark that user has scrolled manually
                if (!hasUserScrolled) {
                  setHasUserScrolled(true);
                }

                // If user scrolls back to bottom, re-enable auto-scroll
                if (isAtBottom()) {
                  setHasUserScrolled(false);
                }
              }}
            >
              {messages.length === 0 && !isRunning && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Terminal className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">{t.agents.readyToExecute}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t.agents.selectProjectPathAndTask}
                  </p>
                </div>
              )}

              {isRunning && messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-sm text-muted-foreground">{t.agents.initializingAgent}</span>
                  </div>
                </div>
              )}

              <div
                className="relative w-full max-w-5xl mx-auto"
                style={{ height: `${fullscreenRowVirtualizer.getTotalSize()}px` }}
              >
                <AnimatePresence>
                  {fullscreenRowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const message = displayableMessages[virtualItem.index];
                    return (
                      <motion.div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        ref={(el) => el && fullscreenRowVirtualizer.measureElement(el)}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-x-4 pb-4"
                        style={{ top: virtualItem.start }}
                      >
                        <ErrorBoundary>
                          <StreamMessage message={message} streamMessages={messages} />
                        </ErrorBoundary>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              <div ref={fullscreenMessagesEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Hooks Configuration Dialog */}
      <Dialog open={isHooksDialogOpen} onOpenChange={setIsHooksDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t.agents.configureHooks}</DialogTitle>
            <DialogDescription>
              {t.agents.configureHooksDesc}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeHooksTab}
            onValueChange={setActiveHooksTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="project">{t.agents.projectSettings}</TabsTrigger>
              <TabsTrigger value="local">{t.agents.localSettings}</TabsTrigger>
            </TabsList>

            <TabsContent value="project" className="flex-1 overflow-auto">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Project hooks are stored in{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">.claude/settings.json</code> and
                  are committed to version control.
                </p>
                <HooksEditor projectPath={projectPath} scope="project" className="border-0" />
              </div>
            </TabsContent>

            <TabsContent value="local" className="flex-1 overflow-auto">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Local hooks are stored in{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">.claude/settings.local.json</code>{" "}
                  and are not committed to version control.
                </p>
                <HooksEditor projectPath={projectPath} scope="local" className="border-0" />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};
