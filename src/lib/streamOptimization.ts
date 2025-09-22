/**
 * Stream output optimization utilities
 * Provides tools for optimizing real-time streaming performance
 */

interface StreamChunk {
  id: string;
  content: string;
  timestamp: number;
  processed: boolean;
}

class StreamOptimizer {
  private chunks: Map<string, StreamChunk> = new Map();
  private processQueue: StreamChunk[] = [];
  private isProcessing = false;
  private batchSize = 10;
  private batchTimeout = 16; // ~60fps
  private compressionThreshold = 1000; // Characters

  /**
   * Add a new stream chunk for processing
   */
  addChunk(id: string, content: string): void {
    const chunk: StreamChunk = {
      id,
      content,
      timestamp: globalThis.performance.now(),
      processed: false
    };

    this.chunks.set(id, chunk);
    this.processQueue.push(chunk);
    this.scheduleProcessing();
  }

  /**
   * Schedule batch processing of chunks
   */
  private scheduleProcessing(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;

    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.processBatch();
      }, this.batchTimeout);
    });
  }

  /**
   * Process a batch of chunks efficiently
   */
  private processBatch(): void {
    const batch = this.processQueue.splice(0, this.batchSize);

    if (batch.length === 0) {
      this.isProcessing = false;
      return;
    }

    // Process chunks in batch
    const processedChunks = batch.map(chunk => {
      let content = chunk.content;

      // Apply compression for large content
      if (content.length > this.compressionThreshold) {
        content = this.compressContent(content);
      }

      return {
        ...chunk,
        content,
        processed: true
      };
    });

    // Update chunks map
    processedChunks.forEach(chunk => {
      this.chunks.set(chunk.id, chunk);
    });

    // Emit processed event
    this.emitProcessedChunks(processedChunks);

    // Continue processing if there are more chunks
    if (this.processQueue.length > 0) {
      this.scheduleProcessing();
    } else {
      this.isProcessing = false;
    }
  }

  /**
   * Compress content for better performance
   */
  private compressContent(content: string): string {
    // Simple content optimization strategies

    // Remove excessive whitespace
    content = content.replace(/\s+/g, ' ').trim();

    // Truncate very long lines for terminal display
    const lines = content.split('\n');
    const maxLineLength = 120;

    const compressedLines = lines.map(line => {
      if (line.length > maxLineLength) {
        return line.substring(0, maxLineLength) + '...';
      }
      return line;
    });

    return compressedLines.join('\n');
  }

  /**
   * Emit processed chunks event
   */
  private emitProcessedChunks(chunks: StreamChunk[]): void {
    window.dispatchEvent(new CustomEvent('stream-chunks-processed', {
      detail: { chunks }
    }));
  }

  /**
   * Get all processed chunks
   */
  getProcessedChunks(): StreamChunk[] {
    return Array.from(this.chunks.values()).filter(chunk => chunk.processed);
  }

  /**
   * Clear old chunks to prevent memory leaks
   */
  cleanup(maxAge: number = 300000): void { // 5 minutes default
    const now = globalThis.performance.now();
    const chunksToDelete: string[] = [];

    this.chunks.forEach((chunk, id) => {
      if (now - chunk.timestamp > maxAge) {
        chunksToDelete.push(id);
      }
    });

    chunksToDelete.forEach(id => {
      this.chunks.delete(id);
    });
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    totalChunks: number;
    processedChunks: number;
    queueLength: number;
    avgProcessingTime: number;
  } {
    const processedChunks = Array.from(this.chunks.values()).filter(c => c.processed);
    const processingTimes = processedChunks.map(c => c.timestamp);
    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;

    return {
      totalChunks: this.chunks.size,
      processedChunks: processedChunks.length,
      queueLength: this.processQueue.length,
      avgProcessingTime
    };
  }
}

// Global stream optimizer instance
export const streamOptimizer = new StreamOptimizer();

/**
 * Hook for using stream optimization in React components
 */
export const useStreamOptimization = () => {
  const addStreamChunk = (id: string, content: string) => {
    streamOptimizer.addChunk(id, content);
  };

  const getMetrics = () => {
    return streamOptimizer.getMetrics();
  };

  return {
    addStreamChunk,
    getMetrics,
    cleanup: streamOptimizer.cleanup.bind(streamOptimizer)
  };
};

/**
 * Debounced function for high-frequency updates
 */
export const createDebouncedUpdater = (
  updateFn: (value: any) => void,
  delay: number = 16
) => {
  let timeoutId: number | null = null;
  let lastValue: any = null;

  return (value: any) => {
    lastValue = value;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      updateFn(lastValue);
      timeoutId = null;
    }, delay);
  };
};

/**
 * Virtual scrolling optimization for large lists
 */
export class VirtualScrollOptimizer {
  private container: HTMLElement | null = null;
  private items: any[] = [];
  private itemHeight = 100;
  private visibleRange = { start: 0, end: 0 };
  private overscan = 5;

  constructor(container: HTMLElement, itemHeight: number = 100) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.setupScrollListener();
  }

  setItems(items: any[]): void {
    this.items = items;
    this.updateVisibleRange();
  }

  private setupScrollListener(): void {
    if (!this.container) return;

    const handleScroll = this.createDebouncedUpdater(() => {
      this.updateVisibleRange();
    }, 8); // High frequency updates for smooth scrolling

    this.container.addEventListener('scroll', handleScroll, { passive: true });
  }

  private updateVisibleRange(): void {
    if (!this.container) return;

    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    const start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.overscan);
    const end = Math.min(
      this.items.length,
      Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.overscan
    );

    this.visibleRange = { start, end };

    // Emit range change event
    window.dispatchEvent(new CustomEvent('virtual-scroll-range-changed', {
      detail: { start, end, total: this.items.length }
    }));
  }

  getVisibleItems(): any[] {
    return this.items.slice(this.visibleRange.start, this.visibleRange.end);
  }

  getVisibleRange(): { start: number; end: number } {
    return this.visibleRange;
  }

  private createDebouncedUpdater(fn: () => void, delay: number) {
    let timeoutId: number | null = null;

    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(fn, delay);
    };
  }
}

/**
 * Memory management utilities
 */
export const memoryOptimizer = {
  /**
   * Clean up large objects and arrays
   */
  cleanupLargeObjects(_threshold: number = 10000): void {
    // Force garbage collection if available (dev tools)
    if ('gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc();
    }
  },

  /**
   * Monitor memory usage
   */
  getMemoryUsage(): {
    used: number;
    total: number;
    limit: number;
  } | null {
    if ('memory' in globalThis.performance) {
      const memory = (globalThis.performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      };
    }
    return null;
  },

  /**
   * Check if memory usage is approaching limits
   */
  shouldOptimize(): boolean {
    const memory = this.getMemoryUsage();
    if (!memory) return false;

    const usageRatio = memory.used / memory.limit;
    return usageRatio > 0.8; // 80% threshold
  }
};