import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ConfigStatus {
  needs_refresh: boolean;
  message: string;
}

interface DetailedConfigStatus {
  needs_refresh: boolean;
  message: string;
  external_env: Record<string, string>;
  internal_vars: Record<string, string>;
  comparison_details: ComparisonDetail[];
}

interface ComparisonDetail {
  key: string;
  external_value?: string;
  internal_value?: string;
  is_consistent: boolean;
  reason: string;
}

interface RefreshDialogProps {
  status: ConfigStatus | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export const ConfigConflictDialog: React.FC<RefreshDialogProps> = ({
  status,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailedStatus, setDetailedStatus] = useState<DetailedConfigStatus | null>(null);

  const handleRefresh = async () => {
    if (!status) return;

    setIsRefreshing(true);
    try {
      // 获取当前选择的模型
      const currentModel = localStorage.getItem('selected-model');
      if (currentModel) {
        // 使用新的刷新函数，保持当前模型选择
        await invoke('refresh_configuration_keep_model', { 
          groupId: null,
          currentSelectedModel: currentModel
        });
      } else {
        // 后备方案：使用原来的刷新
        await invoke('refresh_configuration', { 
          groupId: null
        });
      }
      
      // 重置详情状态
      setShowDetails(false);
      setDetailedStatus(null);
      
      // 通知父组件刷新完成
      onRefresh?.();
      onClose();
      
      console.log('Configuration refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh configuration:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleShowDetails = async () => {
    try {
      // 获取当前选择的模型
      const currentModel = localStorage.getItem('selected-model');
      if (!currentModel) {
        console.error('No current model found in localStorage');
        return;
      }

      const details = await invoke<DetailedConfigStatus>('get_detailed_configuration_status', {
        currentSelectedModel: currentModel
      });
      setDetailedStatus(details);
      setShowDetails(true);
    } catch (error) {
      console.error('Failed to get detailed status:', error);
    }
  };

  // 重置状态当对话框关闭时
  const handleClose = () => {
    setShowDetails(false);
    setDetailedStatus(null);
    onClose();
  };

  if (!status || !status.needs_refresh) return null;

  if (showDetails && detailedStatus) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px] bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Info className="h-5 w-5 text-blue-400" />
              配置检测详情
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 max-h-96 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">检测结果</h4>
                <p className="text-sm text-white">{detailedStatus.message}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">参数对比</h4>
                <div className="space-y-2">
                  {detailedStatus.comparison_details.map((detail, index) => (
                    <div 
                      key={index}
                      className={`p-3 rounded border-l-4 ${
                        detail.is_consistent 
                          ? 'bg-green-900/30 border-green-500' 
                          : 'bg-red-900/30 border-red-500'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-sm font-mono text-blue-300">{detail.key}</code>
                        <span className={`text-xs px-2 py-1 rounded ${
                          detail.is_consistent 
                            ? 'bg-green-600 text-white' 
                            : 'bg-red-600 text-white'
                        }`}>
                          {detail.is_consistent ? '一致' : '不一致'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-300">
                        <div>外部值: {detail.external_value ? `"${detail.external_value}"` : '无'}</div>
                        <div>内部值: {detail.internal_value ? `"${detail.internal_value}"` : '无'}</div>
                        <div className="text-gray-400 mt-1">{detail.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">完整环境变量</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-xs text-gray-400 mb-1">外部配置 (settings.json)</h5>
                    <pre className="text-xs bg-gray-800 p-2 rounded overflow-auto max-h-32">
                      {JSON.stringify(detailedStatus.external_env, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h5 className="text-xs text-gray-400 mb-1">内部配置 (数据库)</h5>
                    <pre className="text-xs bg-gray-800 p-2 rounded overflow-auto max-h-32">
                      {JSON.stringify(detailedStatus.internal_vars, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

                     <DialogFooter className="flex gap-2">
             <Button
               variant="outline"
               onClick={() => {
                 setShowDetails(false);
                 setDetailedStatus(null);
               }}
               className="text-gray-300 border-gray-600 hover:bg-gray-800"
             >
               返回
             </Button>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isRefreshing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  刷新中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  刷新
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px] bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            配置需要刷新
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            检测到配置文件发生变化，需要刷新以确保正常使用。
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-start gap-3 p-4 bg-orange-900/30 rounded-lg border border-orange-600/30">
            <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-orange-200">{status.message}</p>
          </div>
          <p className="text-sm text-gray-300 mt-3">
            点击"刷新"将使用工具内当前选择的配置更新系统文件，然后可以继续正常使用。
          </p>
        </div>

        <DialogFooter className="flex gap-2 justify-center">
          <Button
            variant="outline"
            onClick={handleShowDetails}
            className="text-gray-300 border-gray-600 hover:bg-gray-800"
          >
            <Info className="w-4 h-4 mr-2" />
            查看详情
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
          >
            {isRefreshing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                刷新中...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfigConflictDialog; 