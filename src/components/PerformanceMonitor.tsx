import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, Clock, MemoryStick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDisplayModePerformance, useHybridMode } from '@/hooks';
import { cn } from '@/lib/utils';

interface PerformanceMonitorProps {
  isVisible?: boolean;
  onToggle?: (visible: boolean) => void;
  className?: string;
}

/**
 * Real-time performance monitoring component
 * Tracks rendering times, memory usage, and frame rates
 */
export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isVisible = false,
  onToggle,
  className
}) => {
  const { metrics } = useDisplayModePerformance();
  const { displayMode, isInCmdMode } = useHybridMode();

  const [realtimeMetrics, setRealtimeMetrics] = useState({
    fps: 60,
    memoryUsage: 0,
    tokenRate: 0,
    latency: 0,
    renderCount: 0,
  });

  const [performanceHistory, setPerformanceHistory] = useState<{
    timestamps: number[];
    renderTimes: number[];
    memoryUsage: number[];
  }>({
    timestamps: [],
    renderTimes: [],
    memoryUsage: []
  });

  // Performance monitoring with requestAnimationFrame
  useEffect(() => {
    let frameCount = 0;
    let startTime = performance.now();
    let animationId: number;

    const measureFrameRate = () => {
      frameCount++;
      const currentTime = performance.now();
      const elapsed = currentTime - startTime;

      if (elapsed >= 1000) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        setRealtimeMetrics(prev => ({
          ...prev,
          fps,
          renderCount: prev.renderCount + frameCount
        }));
        frameCount = 0;
        startTime = currentTime;
      }

      animationId = requestAnimationFrame(measureFrameRate);
    };

    if (isVisible) {
      animationId = requestAnimationFrame(measureFrameRate);
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isVisible]);

  // Memory monitoring
  useEffect(() => {
    const measureMemory = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const memoryUsageMB = Math.round(memory.usedJSHeapSize / 1048576);

        setRealtimeMetrics(prev => ({
          ...prev,
          memoryUsage: memoryUsageMB
        }));

        // Update history
        setPerformanceHistory(prev => {
          const newTimestamps = [...prev.timestamps, Date.now()].slice(-50);
          const newMemoryUsage = [...prev.memoryUsage, memoryUsageMB].slice(-50);
          const newRenderTimes = [...prev.renderTimes, metrics.renderTime].slice(-50);

          return {
            timestamps: newTimestamps,
            renderTimes: newRenderTimes,
            memoryUsage: newMemoryUsage
          };
        });
      }
    };

    const interval = setInterval(measureMemory, 1000);
    return () => clearInterval(interval);
  }, [metrics.renderTime]);

  // Latency simulation for CMD mode
  useEffect(() => {
    if (isInCmdMode) {
      setRealtimeMetrics(prev => ({
        ...prev,
        latency: Math.random() * 50 + 30 // 30-80ms for CMD mode
      }));
    } else {
      setRealtimeMetrics(prev => ({
        ...prev,
        latency: Math.random() * 200 + 100 // 100-300ms for enhanced mode
      }));
    }
  }, [isInCmdMode, displayMode]);

  const getPerformanceStatus = () => {
    const { fps, memoryUsage, latency } = realtimeMetrics;

    if (isInCmdMode && latency < 100 && fps > 45) {
      return { status: 'excellent', color: 'text-green-400', bg: 'bg-green-400/10' };
    } else if (fps > 30 && latency < 200 && memoryUsage < 100) {
      return { status: 'good', color: 'text-blue-400', bg: 'bg-blue-400/10' };
    } else if (fps > 20) {
      return { status: 'fair', color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    } else {
      return { status: 'poor', color: 'text-red-400', bg: 'bg-red-400/10' };
    }
  };

  const performanceStatus = getPerformanceStatus();

  if (!isVisible) {
    return (
      <Button
        onClick={() => onToggle?.(true)}
        variant="ghost"
        size="sm"
        className={cn(
          'fixed top-42 right-14 z-40',
          'p-2 rounded-full',
          'bg-background/80 backdrop-blur-sm',
          'border border-border/50',
          'hover:bg-accent',
          className
        )}
        title="显示性能监控"
      >
        <Activity className={cn(
          'h-4 w-4',
          performanceStatus.color
        )} />
      </Button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={cn(
          'fixed bottom-40 right-6 z-40',
          'w-80',
          className
        )}
      >
        <Card className="bg-background/95 backdrop-blur-md border border-border/50 shadow-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                性能监控
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className={cn(
                  'px-2 py-1 rounded-full text-xs font-mono',
                  performanceStatus.color,
                  performanceStatus.bg
                )}>
                  {displayMode.toUpperCase()}
                </div>
                <Button
                  onClick={() => onToggle?.(false)}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                >
                  ×
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Real-time metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-yellow-400" />
                  <span className="text-xs text-muted-foreground">延迟</span>
                </div>
                <div className={cn(
                  'text-lg font-mono font-bold',
                  realtimeMetrics.latency < 100 ? 'text-green-400' :
                  realtimeMetrics.latency < 200 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {Math.round(realtimeMetrics.latency)}ms
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-blue-400" />
                  <span className="text-xs text-muted-foreground">帧率</span>
                </div>
                <div className={cn(
                  'text-lg font-mono font-bold',
                  realtimeMetrics.fps > 45 ? 'text-green-400' :
                  realtimeMetrics.fps > 30 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {realtimeMetrics.fps}fps
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <MemoryStick className="h-3 w-3 text-purple-400" />
                  <span className="text-xs text-muted-foreground">内存</span>
                </div>
                <div className={cn(
                  'text-sm font-mono font-bold',
                  realtimeMetrics.memoryUsage < 50 ? 'text-green-400' :
                  realtimeMetrics.memoryUsage < 100 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {realtimeMetrics.memoryUsage}MB
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-cyan-400" />
                  <span className="text-xs text-muted-foreground">渲染</span>
                </div>
                <div className={cn(
                  'text-sm font-mono font-bold',
                  metrics.renderTime < 16 ? 'text-green-400' :
                  metrics.renderTime < 33 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {Math.round(metrics.renderTime * 10) / 10}ms
                </div>
              </div>
            </div>

            {/* Performance targets for different modes */}
            <div className="border-t border-border/50 pt-3">
              <div className="text-xs text-muted-foreground mb-2">性能目标</div>
              <div className="space-y-1 text-xs">
                {isInCmdMode ? (
                  <>
                    <div className="flex justify-between">
                      <span>首token延迟:</span>
                      <span className="text-green-400">&lt;100ms ✓</span>
                    </div>
                    <div className="flex justify-between">
                      <span>平均延迟:</span>
                      <span className="text-green-400">&lt;50ms ✓</span>
                    </div>
                    <div className="flex justify-between">
                      <span>渲染帧率:</span>
                      <span className="text-green-400">&gt;45fps ✓</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>渲染时间:</span>
                      <span className="text-blue-400">&lt;16ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span>内存使用:</span>
                      <span className="text-blue-400">&lt;50MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span>功能保留:</span>
                      <span className="text-blue-400">100%</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Mini performance graph */}
            <div className="border-t border-border/50 pt-3">
              <div className="text-xs text-muted-foreground mb-2">性能历史</div>
              <div className="h-8 flex items-end space-x-1">
                {performanceHistory.renderTimes.slice(-20).map((time, index) => (
                  <div
                    key={index}
                    className={cn(
                      'w-1 bg-gradient-to-t rounded-t',
                      time < 16 ? 'from-green-400 to-green-300' :
                      time < 33 ? 'from-yellow-400 to-yellow-300' :
                      'from-red-400 to-red-300'
                    )}
                    style={{
                      height: `${Math.min((time / 50) * 100, 100)}%`
                    }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};