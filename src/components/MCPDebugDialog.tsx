import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Bug, 
  Copy, 
  Check, 
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from "lucide-react";

import { api } from "@/lib/api";
import { useToast } from "@/contexts/hooks";
import { logger } from "@/lib/logger";

interface MCPDebugDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MCPDebugDialog: React.FC<MCPDebugDialogProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const { showSuccess, showError } = useToast();

  const loadDebugInfo = async () => {
    try {
      setLoading(true);
      const info = await api.mcpDebugClaudeInfo();
      setDebugInfo(info);
      logger.info("Debug info loaded:", info);
    } catch (error) {
      logger.error("Failed to load debug info:", error);
      showError("获取调试信息失败");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!debugInfo) return;
    
    try {
      const formattedInfo = JSON.stringify(debugInfo, null, 2);
      await navigator.clipboard.writeText(formattedInfo);
      setCopied(true);
      showSuccess("调试信息已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showError("复制失败");
    }
  };

  React.useEffect(() => {
    if (isOpen && !debugInfo) {
      loadDebugInfo();
    }
  }, [isOpen]);

  const renderValue = (value: any): JSX.Element => {
    if (typeof value === 'boolean') {
      return (
        <Badge variant={value ? "default" : "secondary"} className="ml-2">
          {value ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
          {value ? "是" : "否"}
        </Badge>
      );
    }
    
    if (Array.isArray(value)) {
      return (
        <div className="ml-4 mt-1">
          {value.map((item, index) => (
            <div key={index} className="text-sm text-muted-foreground">
              • {String(item)}
            </div>
          ))}
        </div>
      );
    }
    
    if (typeof value === 'string') {
      return <span className="font-mono text-sm ml-2">{value}</span>;
    }
    
    return <span className="ml-2">{String(value)}</span>;
  };

  const getStatusIcon = (key: string, value: any) => {
    if (key.includes('error')) {
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
    if (key === 'binary_exists' && value === false) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    if (key === 'binary_exists' && value === true) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <Info className="h-4 w-4 text-blue-500" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              <DialogTitle>MCP调试信息</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadDebugInfo}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                disabled={!debugInfo}
                className="gap-2"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                复制
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            显示Claudia工具使用的Claude CLI路径和配置信息
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">正在获取调试信息...</span>
            </div>
          ) : debugInfo ? (
            <div className="space-y-4">
              {Object.entries(debugInfo).map(([key, value]) => (
                <Card key={key} className="p-4">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(key, value)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium capitalize">
                          {key.replace(/_/g, ' ')}
                        </h3>
                      </div>
                      <div className="mt-1">
                        {renderValue(value)}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              
              <Card className="p-4 bg-yellow-50 border-yellow-200">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800">重要说明</h4>
                    <p className="text-xs text-yellow-700 mt-1">
                      如果Claudia显示的MCP服务器数量与cmd窗口中Claude CLI显示的不一致，可能的原因：
                    </p>
                    <ul className="text-xs text-yellow-700 mt-2 space-y-1 ml-4">
                      <li>• Claudia使用了不同版本的Claude CLI</li>
                      <li>• Claudia使用了不同的配置文件路径</li>
                      <li>• 存在多个Claude CLI安装，选择了不同的实例</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              点击刷新按钮获取调试信息
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};