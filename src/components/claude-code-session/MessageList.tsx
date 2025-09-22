import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { StreamMessage } from "../StreamMessage";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClaudeStreamMessage } from "../AgentExecution";

/**
 * Props interface for the MessageList component
 */
interface MessageListProps {
  messages: ClaudeStreamMessage[];
  projectPath: string;
  isStreaming: boolean;
  onLinkDetected?: (url: string) => void;
  className?: string;
}

/**
 * MessageList component for displaying Claude Code streaming messages
 *
 * A high-performance message list with virtual scrolling, auto-scroll behavior,
 * and smooth animations. Features intelligent scroll management that maintains
 * position when user scrolls up but auto-scrolls for new messages when at bottom.
 *
 * @param messages - Array of Claude stream messages to display
 * @param projectPath - Current project path for context
 * @param isStreaming - Whether Claude is currently streaming responses
 * @param onLinkDetected - Callback when a URL is detected in message content
 * @param className - Optional CSS classes for styling
 *
 * @example
 * ```tsx
 * <MessageList
 *   messages={streamMessages}
 *   projectPath="/path/to/project"
 *   isStreaming={isClaudeStreaming}
 *   onLinkDetected={(url) => setDetectedUrl(url)}
 * />
 * ```
 */
export const MessageList: React.FC<MessageListProps> = React.memo(
  ({ messages, projectPath, isStreaming, onLinkDetected, className }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);
    const userHasScrolledRef = useRef(false);

    // Virtual scrolling setup
    const virtualizer = useVirtualizer({
      count: messages.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: () => 100, // Estimated height of each message
      overscan: 5,
    });

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
      if (shouldAutoScrollRef.current && scrollContainerRef.current) {
        // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
        requestAnimationFrame(() => {
          const scrollElement = scrollContainerRef.current;
          if (scrollElement) {
            // 滚动到底部，但稍微向上偏移避免被输入框遮挡
            const scrollTop = scrollElement.scrollHeight - scrollElement.clientHeight - 40;
            scrollElement.scrollTop = Math.max(0, scrollTop);
            
            // 确保真正滚动到位
            setTimeout(() => {
              if (scrollElement) {
                scrollElement.scrollTop = Math.max(0, scrollTop);
              }
            }, 50);
          }
        });
      }
    }, [messages]);

    /**
     * Handle scroll events to detect user scrolling
     *
     * Determines if user has manually scrolled away from bottom
     * and adjusts auto-scroll behavior accordingly.
     */
    const handleScroll = () => {
      if (!scrollContainerRef.current) return;

      const scrollElement = scrollContainerRef.current;
      const isAtBottom =
        Math.abs(
          scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight
        ) < 20; // 增加阈值到 20px，更容易触发自动滚动

      if (!isAtBottom) {
        userHasScrolledRef.current = true;
        shouldAutoScrollRef.current = false;
      } else if (userHasScrolledRef.current) {
        shouldAutoScrollRef.current = true;
        userHasScrolledRef.current = false;
      }
    };

    // Reset auto-scroll when streaming stops
    useEffect(() => {
      if (!isStreaming) {
        shouldAutoScrollRef.current = true;
        userHasScrolledRef.current = false;
      }
    }, [isStreaming]);

    if (messages.length === 0) {
      return (
        <div className={cn("flex-1 flex items-center justify-center", className)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4 max-w-md"
          >
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Terminal className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Ready to start coding</h3>
              <p className="text-sm text-muted-foreground">
                {projectPath
                  ? "Enter a prompt below to begin your Claude Code session"
                  : "Select a project folder to begin"}
              </p>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={cn("flex-1 overflow-y-auto scroll-smooth", className)}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          <AnimatePresence mode="popLayout">
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const message = messages[virtualItem.index];
              const key = `msg-${virtualItem.index}-${message.type}`;

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="px-4 py-2">
                    <StreamMessage
                      message={message}
                      streamMessages={messages}
                      onLinkDetected={onLinkDetected}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Streaming indicator */}
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sticky bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-background to-transparent"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
              <span>Claude is thinking...</span>
            </div>
          </motion.div>
        )}
      </div>
    );
  }
);
