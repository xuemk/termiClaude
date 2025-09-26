import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StopCircle, Clock, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Props interface for the ExecutionControlBar component
 */
interface ExecutionControlBarProps {
  isExecuting: boolean;
  onStop: () => void;
  totalTokens?: number;
  elapsedTime?: number; // in seconds
  className?: string;
}

/**
 * Floating control bar shown during agent execution
 *
 * A floating control bar that appears at the bottom of the screen during
 * agent execution, providing real-time statistics and the ability to stop
 * execution. Features smooth animations and responsive design.
 *
 * @param isExecuting - Whether agent execution is currently active
 * @param onStop - Callback function to stop execution
 * @param totalTokens - Total tokens consumed during execution (default: 0)
 * @param elapsedTime - Elapsed time in seconds (default: 0)
 * @param className - Additional CSS classes for styling
 *
 * @example
 * ```tsx
 * <ExecutionControlBar
 *   isExecuting={isRunning}
 *   onStop={() => stopExecution()}
 *   totalTokens={1250}
 *   elapsedTime={45}
 * />
 * ```
 */
export const ExecutionControlBar: React.FC<ExecutionControlBarProps> = ({
  isExecuting,
  onStop,
  totalTokens = 0,
  elapsedTime = 0,
  className,
}) => {
  // Format elapsed time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs.toFixed(0)}s`;
    }
    return `${secs.toFixed(1)}s`;
  };

  // Format token count
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  };

  return (
    <AnimatePresence>
      {isExecuting && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
            "bg-background/95 backdrop-blur-md border rounded-full shadow-lg",
            "px-6 py-3 flex items-center gap-4",
            className
          )}
        >
          {/* Rotating symbol indicator */}
          <div className="relative flex items-center justify-center">
            <div className="rotating-symbol text-primary"></div>
          </div>

          {/* Status text */}
          <span className="text-sm font-medium">Executing...</span>

          {/* Divider */}
          <div className="h-4 w-px bg-border" />

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {/* Time */}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatTime(elapsedTime)}</span>
            </div>

            {/* Tokens */}
            <div className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              <span>{formatTokens(totalTokens)} tokens</span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-border" />

          {/* Stop button */}
          <Button size="sm" variant="destructive" onClick={onStop} className="gap-2">
            <StopCircle className="h-3.5 w-3.5" />
            Stop
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
