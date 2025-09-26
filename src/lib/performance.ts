/**
 * Performance optimization configuration and utilities
 * Centralized performance settings and optimization strategies
 */

export interface PerformanceConfig {
  /** Enable GPU acceleration for rendering */
  enableGpuAcceleration: boolean;
  /** Enable virtual scrolling optimizations */
  enableVirtualScrolling: boolean;
  /** Enable debounced message updates */
  enableDebouncedUpdates: boolean;
  /** Enable content compression */
  enableContentCompression: boolean;
  /** Enable memory monitoring */
  enableMemoryMonitoring: boolean;
  /** Maximum memory threshold in MB */
  memoryThreshold: number;
  /** FPS target for animations */
  targetFps: number;
  /** Debounce delay for updates in ms */
  debounceDelay: number;
  /** Virtual scroll overscan count */
  virtualScrollOverscan: number;
  /** Enable performance mode (disables animations) */
  performanceMode: boolean;
}

/**
 * Default performance configuration
 */
export const defaultPerformanceConfig: PerformanceConfig = {
  enableGpuAcceleration: true,
  enableVirtualScrolling: true,
  enableDebouncedUpdates: true,
  enableContentCompression: true,
  enableMemoryMonitoring: true,
  memoryThreshold: 100, // MB
  targetFps: 60,
  debounceDelay: 16, // ~60fps
  virtualScrollOverscan: 3,
  performanceMode: false,
};

/**
 * Performance settings for different modes
 */
export const performanceModes = {
  /** High performance mode - all optimizations enabled */
  high: {
    ...defaultPerformanceConfig,
    enableGpuAcceleration: true,
    targetFps: 60,
    debounceDelay: 16,
    virtualScrollOverscan: 3,
  },
  
  /** Balanced mode - moderate optimizations */
  balanced: {
    ...defaultPerformanceConfig,
    targetFps: 30,
    debounceDelay: 33,
    virtualScrollOverscan: 5,
  },
  
  /** Power saver mode - minimal resource usage */
  powerSaver: {
    ...defaultPerformanceConfig,
    enableGpuAcceleration: false,
    targetFps: 15,
    debounceDelay: 100,
    virtualScrollOverscan: 1,
    performanceMode: true,
  },
} as const;

/**
 * Performance optimization class names
 */
export const performanceClasses = {
  // Base optimization classes
  optimized: 'performance-optimized',
  virtualContainer: 'virtual-container optimized-scroll',
  virtualItem: 'virtual-item stream-optimized',
  streamOptimized: 'stream-optimized',
  
  // Content-specific classes
  messageInstant: 'message-instant',
  streamText: 'stream-text',
  toolWidget: 'tool-widget-optimized',
  markdownOptimized: 'markdown-optimized',
  syntaxHighlight: 'syntax-highlight-optimized',
  
  // Performance modes
  performanceMode: 'performance-mode',
  lowLatencyMode: 'low-latency-mode',
  largeContent: 'large-content-optimized',
  highFrequency: 'high-frequency-update',
} as const;

  /**
 * Get current performance configuration from localStorage or defaults
 */
export function getPerformanceConfig(): PerformanceConfig {
  try {
    const stored = localStorage.getItem('claudia-performance-config');
    if (stored) {
      const config = JSON.parse(stored);
      return { ...defaultPerformanceConfig, ...config };
    }
  } catch (error) {
    console.warn('Failed to load performance config:', error);
      }
  return defaultPerformanceConfig;
  }

  /**
 * Save performance configuration to localStorage
 */
export function savePerformanceConfig(config: Partial<PerformanceConfig>): void {
  try {
    const currentConfig = getPerformanceConfig();
    const newConfig = { ...currentConfig, ...config };
    localStorage.setItem('claudia-performance-config', JSON.stringify(newConfig));
  } catch (error) {
    console.warn('Failed to save performance config:', error);
  }
}

/**
 * Apply performance mode
 */
export function applyPerformanceMode(mode: keyof typeof performanceModes): void {
  const config = performanceModes[mode];
  savePerformanceConfig(config);
  
  // Apply CSS classes to document
  const body = document.body;
  
  // Remove existing performance classes
  Object.values(performanceModes).forEach(modeConfig => {
    if (modeConfig.performanceMode) {
      body.classList.remove('performance-mode');
    }
  });
  
  // Apply new performance classes
  if (config.performanceMode) {
    body.classList.add('performance-mode');
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private config: PerformanceConfig;
  private observers: Set<(metrics: PerformanceMetrics) => void> = new Set();
  
  private constructor() {
    this.config = getPerformanceConfig();
  }
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
          }
    return PerformanceMonitor.instance;
  }

  /**
   * Subscribe to performance metrics updates
   */
  subscribe(observer: (metrics: PerformanceMetrics) => void): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
}

/**
   * Get current performance metrics
 */
  getMetrics(): PerformanceMetrics {
    const memory = this.getMemoryUsage();
    return {
      memory,
      isMemoryHigh: memory > this.config.memoryThreshold,
      timestamp: Date.now(),
      config: this.config,
    };
  }

  /**
   * Update performance configuration
   */
  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    savePerformanceConfig(newConfig);
    }
  
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
    }
    return 0;
  }
}

export interface PerformanceMetrics {
  memory: number;
  isMemoryHigh: boolean;
  timestamp: number;
  config: PerformanceConfig;
}

/**
 * React hook for performance configuration
 */
export function usePerformanceConfig() {
  const monitor = PerformanceMonitor.getInstance();
  
  return {
    config: monitor.getMetrics().config,
    updateConfig: (config: Partial<PerformanceConfig>) => monitor.updateConfig(config),
    applyMode: applyPerformanceMode,
    classes: performanceClasses,
  };
}

/**
 * Utility function to conditionally apply performance classes
 */
export function withPerformanceClasses(
  baseClasses: string,
  performanceClasses: string,
  enabled: boolean = true
): string {
  return enabled ? `${baseClasses} ${performanceClasses}` : baseClasses;
}

/**
 * Auto-detect and apply optimal performance mode based on device capabilities
 */
export function autoDetectPerformanceMode(): void {
  // Check device capabilities
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  const hasWebGL = !!gl;
  
  const memory = (navigator as any).deviceMemory || 4; // GB, default to 4GB if not available
  const cores = navigator.hardwareConcurrency || 4;
  
  // Determine optimal mode
  if (hasWebGL && memory >= 8 && cores >= 8) {
    applyPerformanceMode('high');
  } else if (hasWebGL && memory >= 4 && cores >= 4) {
    applyPerformanceMode('balanced');
  } else {
    applyPerformanceMode('powerSaver');
  }
  
  console.log('Auto-detected performance mode based on device capabilities:', {
    hasWebGL,
    memory: `${memory}GB`,
    cores,
  });
}
