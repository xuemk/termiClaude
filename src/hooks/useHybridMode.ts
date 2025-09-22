import { useState, useEffect, useCallback } from 'react';
import { useMessageDisplayMode } from './useMessageDisplayMode';

/**
 * Hook for managing hybrid mode functionality
 * Provides toggle between CMD and Enhanced modes with Ctrl+T shortcut
 */
export const useHybridMode = () => {
  const { mode: displayMode, setDisplayMode } = useMessageDisplayMode();
  const [hybridCurrentMode, setHybridCurrentMode] = useState<'cmd' | 'enhanced'>(() => {
    // Load from localStorage with enhanced as default (more user-friendly)
    return (localStorage.getItem('hybrid-current-mode') as 'cmd' | 'enhanced') || 'enhanced';
  });

  // Update localStorage when mode changes
  useEffect(() => {
    localStorage.setItem('hybrid-current-mode', hybridCurrentMode);
  }, [hybridCurrentMode]);

  // Toggle between cmd and enhanced modes
  const toggleHybridMode = useCallback(() => {
    if (displayMode === 'hybrid') {
      const newMode = hybridCurrentMode === 'cmd' ? 'enhanced' : 'cmd';
      console.log(`[HybridMode] Toggling: ${hybridCurrentMode} → ${newMode}`);
      setHybridCurrentMode(newMode);

      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('hybrid-mode-changed', {
        detail: { mode: newMode }
      }));
    }
  }, [displayMode, hybridCurrentMode]);

  // Keyboard shortcut handler - Changed to Alt+T to avoid conflict with browser/TabManager
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 't') {
        e.preventDefault();
        e.stopPropagation();
        
        // If not in hybrid mode, enable it first
        if (displayMode !== 'hybrid') {
          setDisplayMode('hybrid');
        } else {
          // If already in hybrid mode, toggle between sub-modes
          toggleHybridMode();
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress, true); // Use capture phase
    return () => document.removeEventListener('keydown', handleKeyPress, true);
  }, [displayMode, setDisplayMode, toggleHybridMode]);

  // Switch to hybrid mode programmatically
  const enableHybridMode = useCallback(() => {
    setDisplayMode('hybrid');
  }, [setDisplayMode]);

  // Get effective display mode for hybrid mode
  const getEffectiveMode = useCallback(() => {
    if (displayMode === 'hybrid') {
      return hybridCurrentMode;
    }
    return displayMode;
  }, [displayMode, hybridCurrentMode]);

  return {
    // Current display mode setting
    displayMode,
    setDisplayMode,

    // Hybrid mode specific state
    isHybridMode: displayMode === 'hybrid',
    hybridCurrentMode,

    // Actions
    toggleHybridMode,
    enableHybridMode,
    getEffectiveMode,

    // Computed properties
    isInCmdMode: displayMode === 'cmd' || (displayMode === 'hybrid' && hybridCurrentMode === 'cmd'),
    isInEnhancedMode: displayMode === 'enhanced' || (displayMode === 'hybrid' && hybridCurrentMode === 'enhanced'),
  };
};

/**
 * Performance monitoring hook for different display modes
 */
export const useDisplayModePerformance = () => {
  const [metrics, setMetrics] = useState({
    renderTime: 0,
    frameRate: 0,
    memoryUsage: 0,
  });

  const recordRenderTime = useCallback((startTime: number) => {
    const renderTime = performance.now() - startTime;
    setMetrics(prev => ({ ...prev, renderTime }));
  }, []);

  const startRenderTiming = useCallback(() => {
    return performance.now();
  }, []);

  return {
    metrics,
    startRenderTiming,
    recordRenderTime,
  };
};