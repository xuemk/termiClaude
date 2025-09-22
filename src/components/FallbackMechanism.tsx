import React, { useState, useEffect, useCallback } from 'react';
import { useHybridMode } from '@/hooks/useHybridMode';
import { memoryOptimizer } from '@/lib/streamOptimization';
import { logger } from '@/lib/logger';

interface FallbackMechanismProps {
  className?: string;
  onFallbackTriggered?: (reason: string) => void;
}

interface FallbackState {
  isActive: boolean;
  reason: string;
  level: 'warning' | 'error' | 'critical';
  timestamp: number;
  autoRecovery: boolean;
}

/**
 * Fallback mechanism component that automatically detects performance issues
 * and switches to more stable modes when needed
 */
export const FallbackMechanism: React.FC<FallbackMechanismProps> = ({
  onFallbackTriggered
}) => {
  const { displayMode, setDisplayMode, isInCmdMode, isInEnhancedMode } = useHybridMode();
  const [fallbackState, setFallbackState] = useState<FallbackState | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    frameRate: 60,
    memoryUsage: 0,
    errorCount: 0,
    renderFailures: 0
  });

  // Monitor performance and trigger fallbacks
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let errorCount = 0;
    let renderFailures = 0;
    let animationId: number;

    const monitorPerformance = () => {
      frameCount++;
      const currentTime = performance.now();
      const elapsed = currentTime - lastTime;

      if (elapsed >= 1000) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        const memory = memoryOptimizer.getMemoryUsage();
        const memoryUsageMB = memory ? Math.round(memory.used / 1048576) : 0;

        setPerformanceMetrics({
          frameRate: fps,
          memoryUsage: memoryUsageMB,
          errorCount,
          renderFailures
        });

        // Check for fallback conditions
        checkFallbackConditions(fps, memoryUsageMB, errorCount, renderFailures);

        frameCount = 0;
        lastTime = currentTime;
      }

      animationId = requestAnimationFrame(monitorPerformance);
    };

    // Listen for errors
    const handleError = (event: ErrorEvent) => {
      errorCount++;
      logger.error('JavaScript error detected:', event.error);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      errorCount++;
      logger.error('Unhandled promise rejection:', event.reason);
    };

    const handleRenderFailure = () => {
      renderFailures++;
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('render-failure', handleRenderFailure);

    animationId = requestAnimationFrame(monitorPerformance);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('render-failure', handleRenderFailure);
    };
  }, []);

  const checkFallbackConditions = useCallback((
    fps: number,
    memoryUsage: number,
    errorCount: number,
    renderFailures: number
  ) => {
    const conditions = [
      {
        condition: fps < 15,
        reason: '帧率过低（<15fps），切换到高性能模式',
        level: 'critical' as const,
        action: () => setDisplayMode('cmd')
      },
      {
        condition: memoryUsage > 200,
        reason: '内存使用过高（>200MB），启用内存优化',
        level: 'error' as const,
        action: () => {
          memoryOptimizer.cleanupLargeObjects();
          if (isInEnhancedMode) {
            setDisplayMode('cmd');
          }
        }
      },
      {
        condition: errorCount > 5,
        reason: '错误频率过高，降级到稳定模式',
        level: 'error' as const,
        action: () => setDisplayMode('enhanced')
      },
      {
        condition: renderFailures > 3,
        reason: '渲染失败次数过多，使用备用渲染',
        level: 'warning' as const,
        action: () => {
          if (isInCmdMode) {
            setDisplayMode('enhanced');
          }
        }
      }
    ];

    for (const { condition, reason, level, action } of conditions) {
      if (condition && (!fallbackState || fallbackState.level !== level)) {
        logger.warn(`Fallback triggered: ${reason}`);

        setFallbackState({
          isActive: true,
          reason,
          level,
          timestamp: Date.now(),
          autoRecovery: level !== 'critical'
        });

        onFallbackTriggered?.(reason);
        action();
        break;
      }
    }
  }, [fallbackState, isInCmdMode, isInEnhancedMode, setDisplayMode, onFallbackTriggered]);

  // Auto-recovery mechanism
  useEffect(() => {
    if (!fallbackState?.autoRecovery) return;

    const recoveryTimer = setTimeout(() => {
      const { frameRate, memoryUsage, errorCount } = performanceMetrics;

      // Check if conditions have improved
      if (frameRate > 30 && memoryUsage < 100 && errorCount < 2) {
        logger.info('Performance improved, attempting recovery');
        setFallbackState(null);

        // Try to restore previous mode if it was more feature-rich
        if (displayMode === 'cmd' && fallbackState.level === 'warning') {
          setDisplayMode('enhanced');
        }
      }
    }, 30000); // Try recovery after 30 seconds

    return () => clearTimeout(recoveryTimer);
  }, [fallbackState, performanceMetrics, displayMode, setDisplayMode]);

  // 不显示UI，只保留后台性能监控逻辑
  // 性能优化功能已集成到PerformanceMonitor组件中
  return null;
};