import { useState, useEffect } from 'react';

export type MessageDisplayMode = 'cmd' | 'enhanced' | 'hybrid' | 'terminal' | 'both';

/**
 * 允许的显示模式常量，避免魔法字符串分散在代码中
 */
const ALLOWED_MODES: MessageDisplayMode[] = ['cmd', 'enhanced', 'hybrid', 'terminal', 'both'];

/**
 * 历史存储值映射表，用于兼容旧版本
 */
const LEGACY_MAPPING: Record<string, MessageDisplayMode> = {
  tool_results_only: 'hybrid', // 旧的简洁模式映射为混合模式
  tool_calls_only: 'hybrid', // 简洁模式映射为混合模式
  terminal: 'hybrid', // 终端模式映射为混合模式
  cmd: 'hybrid', // CMD模式也映射为混合模式
  enhanced: 'hybrid', // 增强模式也映射为混合模式
  both: 'hybrid', // 完整模式也映射为混合模式
};

/**
 * 默认使用混合模式，提供最佳的用户体验
 */
const DEFAULT_MODE: MessageDisplayMode = 'hybrid';

/**
 * Hook to manage message display mode setting
 * Controls how tool calls and tool results are displayed in the UI
 */
export const useMessageDisplayMode = () => {
  const [mode, setMode] = useState<MessageDisplayMode>(DEFAULT_MODE);

  useEffect(() => {
    // Load from localStorage on mount
    const savedModeRaw = localStorage.getItem('messageDisplayMode') || '';
    const normalizedMode = LEGACY_MAPPING[savedModeRaw] ?? (savedModeRaw as MessageDisplayMode);

    if (normalizedMode && ALLOWED_MODES.includes(normalizedMode)) {
      setMode(normalizedMode);
    }

    // Listen for storage changes (when updated from Settings)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'messageDisplayMode' && e.newValue) {
        const mapped = LEGACY_MAPPING[e.newValue] ?? (e.newValue as MessageDisplayMode);
        if (mapped && ALLOWED_MODES.includes(mapped)) {
          setMode(mapped);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const setDisplayMode = (newMode: MessageDisplayMode) => {
    if (!ALLOWED_MODES.includes(newMode)) {
      // 防御式处理，避免写入非法值
      return;
    }
    setMode(newMode);
    localStorage.setItem('messageDisplayMode', newMode);
  };

  return { mode, setDisplayMode };
};
