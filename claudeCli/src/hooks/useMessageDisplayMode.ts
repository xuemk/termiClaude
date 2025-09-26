import { useState, useEffect } from 'react';

export type MessageDisplayMode = 'both' | 'tool_calls_only';

/**
 * Hook to manage message display mode setting
 * Controls how tool calls and tool results are displayed in the UI
 */
export const useMessageDisplayMode = () => {
  const [mode, setMode] = useState<MessageDisplayMode>('both');

  useEffect(() => {
    // Load from localStorage on mount
    const savedMode = localStorage.getItem('messageDisplayMode') as MessageDisplayMode;
    // Handle legacy 'tool_results_only' by converting to 'tool_calls_only'
    const normalizedMode = (savedMode as string) === 'tool_results_only' ? 'tool_calls_only' : savedMode;
    if (normalizedMode && ['both', 'tool_calls_only'].includes(normalizedMode)) {
      setMode(normalizedMode);
    }

    // Listen for storage changes (when updated from Settings)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'messageDisplayMode' && e.newValue) {
        const newMode = e.newValue as MessageDisplayMode;
        if (['both', 'tool_calls_only'].includes(newMode)) {
          setMode(newMode);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const setDisplayMode = (newMode: MessageDisplayMode) => {
    setMode(newMode);
    localStorage.setItem('messageDisplayMode', newMode);
  };

  return { mode, setDisplayMode };
};