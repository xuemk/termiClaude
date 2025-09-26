import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface ConfigStatus {
  needs_refresh: boolean;
  message: string;
}

interface UseConfigMonitorReturn {
  status: ConfigStatus | null;
  isMonitoring: boolean;
  startMonitoring: () => Promise<void>;
  clearStatus: () => void;
  checkConsistency: () => Promise<ConfigStatus | null>;
}

export const useConfigMonitor = (): UseConfigMonitorReturn => {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const startMonitoring = async () => {
    try {
      // 启动后端监听器
      await invoke('start_settings_monitor');
      setIsMonitoring(true);
      console.log('Config monitor started');
    } catch (error) {
      console.error('Failed to start config monitor:', error);
    }
  };

  const clearStatus = () => {
    setStatus(null);
  };

  const checkConsistency = async (): Promise<ConfigStatus | null> => {
    try {
      // 获取当前选择的模型
      const currentModel = localStorage.getItem('selected-model');
      if (!currentModel) {
        console.log('No current model selected, skipping consistency check');
        return null;
      }

      const result = await invoke<ConfigStatus>('check_config_consistency_simple', {
        currentSelectedModel: currentModel
      });
      return result;
    } catch (error) {
      console.error('Failed to check configuration consistency:', error);
      return null;
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        // 监听文件变化事件，主动检测一致性
        unlisten = await listen('settings-file-changed', async () => {
          console.log('Settings file changed, checking consistency...');
          
          // 获取当前选择的模型并检测
          const result = await checkConsistency();
          if (result && result.needs_refresh) {
            setStatus(result);
          }
        });

        // 自动启动监听
        await startMonitoring();
      } catch (error) {
        console.error('Failed to setup config monitor:', error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return {
    status,
    isMonitoring,
    startMonitoring,
    clearStatus,
    checkConsistency,
  };
}; 