import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getPerformanceConfig,
  savePerformanceConfig,
  applyPerformanceMode,
  PerformanceMonitor,
  performanceModes,
  defaultPerformanceConfig,
  performanceClasses,
  withPerformanceClasses,
  autoDetectPerformanceMode,
} from "../performance";

/**
 * Test suite for performance configuration and optimization utilities
 */
describe("Performance Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("getPerformanceConfig", () => {
    it("should return default config when localStorage is empty", () => {
      const config = getPerformanceConfig();
      expect(config).toEqual(defaultPerformanceConfig);
    });

    it("should merge stored config with defaults", () => {
      const partialConfig = { enableGpuAcceleration: false, targetFps: 30 };
      localStorage.setItem('claudia-performance-config', JSON.stringify(partialConfig));

      const config = getPerformanceConfig();
      expect(config).toEqual({
        ...defaultPerformanceConfig,
        ...partialConfig,
      });
    });

    it("should handle invalid JSON gracefully", () => {
      localStorage.setItem('claudia-performance-config', 'invalid-json');

      const config = getPerformanceConfig();
      expect(config).toEqual(defaultPerformanceConfig);
    });
  });

  describe("savePerformanceConfig", () => {
    it("should save partial config to localStorage", () => {
      const partialConfig = { enableGpuAcceleration: false };
      savePerformanceConfig(partialConfig);

      const stored = JSON.parse(localStorage.getItem('claudia-performance-config') || '{}');
      expect(stored.enableGpuAcceleration).toBe(false);
      expect(stored.targetFps).toBe(defaultPerformanceConfig.targetFps);
    });

    it("should handle localStorage errors gracefully", () => {
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      expect(() => savePerformanceConfig({ targetFps: 30 })).not.toThrow();
      
      mockSetItem.mockRestore();
    });
  });

  describe("applyPerformanceMode", () => {
    it("should save mode configuration", () => {
      applyPerformanceMode('powerSaver');

      const config = getPerformanceConfig();
      expect(config.performanceMode).toBe(true);
      expect(config.enableGpuAcceleration).toBe(false);
    });

    it("should apply CSS classes to document body", () => {
      applyPerformanceMode('powerSaver');
      expect(document.body.classList.contains('performance-mode')).toBe(true);

      applyPerformanceMode('high');
      expect(document.body.classList.contains('performance-mode')).toBe(false);
    });
  });

  describe("performanceModes", () => {
    it("should have all required modes", () => {
      expect(performanceModes).toHaveProperty('high');
      expect(performanceModes).toHaveProperty('balanced');
      expect(performanceModes).toHaveProperty('powerSaver');
    });

    it("should have correct high performance settings", () => {
      expect(performanceModes.high.enableGpuAcceleration).toBe(true);
      expect(performanceModes.high.targetFps).toBe(60);
      expect(performanceModes.high.performanceMode).toBe(false);
    });

    it("should have correct power saver settings", () => {
      expect(performanceModes.powerSaver.enableGpuAcceleration).toBe(false);
      expect(performanceModes.powerSaver.targetFps).toBe(15);
      expect(performanceModes.powerSaver.performanceMode).toBe(true);
    });
  });

  describe("PerformanceMonitor", () => {
    it("should be a singleton", () => {
      const monitor1 = PerformanceMonitor.getInstance();
      const monitor2 = PerformanceMonitor.getInstance();
      expect(monitor1).toBe(monitor2);
    });

    it("should provide metrics", () => {
      const monitor = PerformanceMonitor.getInstance();
      const metrics = monitor.getMetrics();

      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('isMemoryHigh');
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('config');
    });

    it("should support configuration updates", () => {
      const monitor = PerformanceMonitor.getInstance();
      const newConfig = { targetFps: 30 };
      
      monitor.updateConfig(newConfig);
      const metrics = monitor.getMetrics();
      
      expect(metrics.config.targetFps).toBe(30);
    });

    it("should support observer pattern", () => {
      const monitor = PerformanceMonitor.getInstance();
      const observer = vi.fn();
      
      const unsubscribe = monitor.subscribe(observer);
      expect(typeof unsubscribe).toBe('function');
      
      unsubscribe();
    });
  });

  describe("performanceClasses", () => {
    it("should have all required CSS classes", () => {
      expect(performanceClasses).toHaveProperty('optimized');
      expect(performanceClasses).toHaveProperty('virtualContainer');
      expect(performanceClasses).toHaveProperty('streamOptimized');
      expect(performanceClasses).toHaveProperty('toolWidget');
      expect(performanceClasses).toHaveProperty('performanceMode');
    });

    it("should contain valid CSS class names", () => {
      Object.values(performanceClasses).forEach(className => {
        expect(typeof className).toBe('string');
        expect(className.length).toBeGreaterThan(0);
      });
    });
  });

  describe("withPerformanceClasses", () => {
    it("should combine classes when enabled", () => {
      const result = withPerformanceClasses('base-class', 'perf-class', true);
      expect(result).toBe('base-class perf-class');
    });

    it("should return only base classes when disabled", () => {
      const result = withPerformanceClasses('base-class', 'perf-class', false);
      expect(result).toBe('base-class');
    });

    it("should default to enabled", () => {
      const result = withPerformanceClasses('base-class', 'perf-class');
      expect(result).toBe('base-class perf-class');
    });
  });

  describe("autoDetectPerformanceMode", () => {
    beforeEach(() => {
      // Mock navigator properties
      Object.defineProperty(navigator, 'deviceMemory', {
        writable: true,
        value: 8,
      });
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        writable: true,
        value: 8,
      });

      // Mock canvas and WebGL
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue({}),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);
    });

    it("should detect high performance mode for powerful devices", () => {
      autoDetectPerformanceMode();
      
      const config = getPerformanceConfig();
      expect(config.enableGpuAcceleration).toBe(true);
      expect(config.targetFps).toBe(60);
    });

    it("should detect power saver mode for less capable devices", () => {
      Object.defineProperty(navigator, 'deviceMemory', {
        writable: true,
        value: 2,
      });
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        writable: true,
        value: 2,
      });

      // Mock no WebGL support
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(null),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as any);

      autoDetectPerformanceMode();
      
      const config = getPerformanceConfig();
      expect(config.performanceMode).toBe(true);
      expect(config.enableGpuAcceleration).toBe(false);
    });

    it("should handle missing navigator properties", () => {
      Object.defineProperty(navigator, 'deviceMemory', {
        writable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        writable: true,
        value: undefined,
      });

      expect(() => autoDetectPerformanceMode()).not.toThrow();
    });
  });
});
