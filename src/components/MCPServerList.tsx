import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  Globe,
  Terminal,
  Trash2,
  Play,
  Loader2,
  RefreshCw,
  FolderOpen,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  Copy,
  Bug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { api, type MCPServer } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { logger } from "@/lib/logger";
import { useTrackEvent } from "@/hooks";
import { handleError } from "@/lib/errorHandler";
import { useToast } from "@/contexts/hooks";
import { MCPDebugDialog } from "@/components/MCPDebugDialog";
interface MCPServerListProps {
  /**
   * List of MCP servers to display
   */
  servers: MCPServer[];
  /**
   * Whether the list is loading
   */
  loading: boolean;
  /**
   * Callback when a server is removed
   */
  onServerRemoved: (name: string) => void;
  /**
   * Callback to refresh the server list
   */
  onRefresh: () => void;
}

/**
 * Component for displaying a list of MCP servers
 * Shows servers grouped by scope with status indicators
 */
export const MCPServerList: React.FC<MCPServerListProps> = ({
  servers,
  loading,
  onServerRemoved,
  onRefresh,
}) => {
  const { t } = useI18n();
  const { showSuccess, showError, showInfo } = useToast();
  const [removingServer, setRemovingServer] = useState<string | null>(null);
  const [testingServer, setTestingServer] = useState<string | null>(null);

  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [copiedServer, setCopiedServer] = useState<string | null>(null);
  const [connectedServers] = useState<string[]>([]);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);

  // Analytics tracking
  const trackEvent = useTrackEvent();

  // Group servers by scope
  const serversByScope = servers.reduce(
    (acc, server) => {
      const scope = server.scope || "local";
      if (!acc[scope]) acc[scope] = [];
      acc[scope].push(server);
      return acc;
    },
    {} as Record<string, MCPServer[]>
  );

  /**
   * Toggles expanded state for a server
   */
  /**
   * Toggle expanded state for a server
   *
   * @param serverName - Name of the server to toggle
   */
  const toggleExpanded = (serverName: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  /**
   * Copies command to clipboard
   */
  const copyCommand = async (command: string, serverName: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedServer(serverName);
      window.setTimeout(() => setCopiedServer(null), 2000);
    } catch (error) {
      await handleError("Failed to copy command:", { context: error });
    }
  };

  /**
   * Removes a server
   */
  const handleRemoveServer = async (name: string) => {
    try {
      setRemovingServer(name);

      // Check if server was connected
      const wasConnected = connectedServers.includes(name);

      // Show loading message
      showInfo(`正在删除服务器 ${name}...`);

      const result = await api.mcpRemove(name);

      // Track server removal
      trackEvent.mcpServerRemoved({
        server_name: name,
        was_connected: wasConnected
      });

      // Show success message with detailed information
      if (result.includes(";")) {
        // Multiple scope removal
        showSuccess(`服务器 "${name}" 已从多个作用域中删除`);
      } else {
        showSuccess(`服务器 "${name}" 删除成功`);
      }

      onServerRemoved(name);
    } catch (error) {
      await handleError("Failed to remove server:", { context: error });
      
      // Parse error message to provide better user feedback
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("exists in multiple scopes")) {
        showError(`服务器 "${name}" 存在于多个作用域中，请手动指定作用域删除`);
      } else {
        showError(`删除服务器 "${name}" 失败: ${errorMessage}`);
      }
    } finally {
      setRemovingServer(null);
    }
  };

  /**
   * Tests connection to a server
   */
  const handleTestConnection = async (name: string) => {
    try {
      setTestingServer(name);
      
      // Show testing message
      showInfo(`正在测试服务器 ${name} 的连接...`);
      
      const result = await api.mcpTestConnection(name);
      const server = servers.find(s => s.name === name);

      // Track connection result - result is a string message
      trackEvent.mcpServerConnected(name, true, server?.transport || 'unknown');

      // Show success message to user
      showSuccess(`服务器 "${name}" 连接测试成功`);
      
      // Also log for debugging
      logger.debug("Test result:", result);
    } catch (error) {
      await handleError("Failed to test connection:", { context: error });
      
      // Show error message to user
      const errorMessage = error instanceof Error ? error.message : String(error);
      showError(`服务器 "${name}" 连接测试失败: ${errorMessage}`);

      trackEvent.mcpConnectionError({
        server_name: name,
        error_type: 'test_failed',
        retry_attempt: 0
      });
    } finally {
      setTestingServer(null);
    }
  };



  /**
   * Gets icon for transport type
   */
  /**
   * Get icon for transport type
   *
   * @param transport - Transport type (stdio, sse, etc.)
   * @returns Lucide icon component
   */
  const getTransportIcon = (transport: string) => {
    switch (transport) {
      case "stdio":
        return <Terminal className="h-4 w-4 text-amber-500" />;
      case "sse":
        return <Globe className="h-4 w-4 text-emerald-500" />;
      default:
        return <Network className="h-4 w-4 text-blue-500" />;
    }
  };

  /**
   * Gets icon for scope
   */
  /**
   * Get icon for server scope
   *
   * @param scope - Server scope (global, user, local)
   * @returns Lucide icon component
   */
  const getScopeIcon = (scope: string) => {
    switch (scope) {
      case "local":
        return <User className="h-3 w-3 text-slate-500" />;
      case "project":
        return <FolderOpen className="h-3 w-3 text-orange-500" />;
      case "user":
        return <FileText className="h-3 w-3 text-purple-500" />;
      default:
        return null;
    }
  };

  /**
   * Gets scope display name
   */
  const getScopeDisplayName = (scope: string) => {
    switch (scope) {
      case "local":
        return t.mcp.localProjectSpecific;
      case "project":
        return t.mcp.projectSharedViaMcp;
      case "user":
        return t.mcp.userAllProjectsScope;
      default:
        return scope;
    }
  };

  /**
   * Renders a single server item
   */
  const renderServerItem = (server: MCPServer) => {
    const isExpanded = expandedServers.has(server.name);
    const isCopied = copiedServer === server.name;

    return (
      <motion.div
        key={server.name}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className={`group p-4 rounded-lg border border-border bg-card hover:bg-accent/5 hover:border-primary/20 transition-all overflow-hidden ${
          server.disabled ? 'opacity-60 bg-muted/30' : ''
        }`}
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 rounded">
                  {getTransportIcon(server.transport)}
                </div>
                <h4 className="font-medium truncate">{server.name}</h4>
                <span
                  className={`ml-2 h-2.5 w-2.5 rounded-full ${
                    (server.command?.includes("Connected") || server.status?.running)
                      ? 'bg-green-500'
                      : 'bg-red-500'
                  }`}
                  title={
                    (server.command?.includes("Connected") || server.status?.running)
                      ? "Connected"
                      : "Disconnected"
                  }
                />
                {server.disabled && (
                  <Badge
                    variant="outline"
                    className="gap-1 flex-shrink-0 border-red-500/50 text-red-600 bg-red-500/10"
                  >
                    {t.mcp.disabled}
                  </Badge>
                )}
              </div>

              {server.command && !isExpanded && (
                <div className="flex items-center gap-2">
                  <p
                    className="text-xs text-muted-foreground font-mono truncate pl-9 flex-1"
                    title={server.command}
                  >
                    {server.command}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(server.name)}
                    className="h-6 px-2 text-xs hover:bg-primary/10"
                  >
                    <ChevronDown className="h-3 w-3 mr-1" />
                    {t.mcp.showFull}
                  </Button>
                </div>
              )}

              {server.transport === "sse" && server.url && !isExpanded && (
                <div className="overflow-hidden">
                  <p
                    className="text-xs text-muted-foreground font-mono truncate pl-9"
                    title={server.url}
                  >
                    {server.url}
                  </p>
                </div>
              )}

              {Object.keys(server.env).length > 0 && !isExpanded && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground pl-9">
                  <span>
                    {t.mcp.environmentVariablesCount.replace(
                      "{count}",
                      Object.keys(server.env).length.toString()
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleTestConnection(server.name)}
                disabled={testingServer === server.name || server.disabled}
                className="hover:bg-green-500/10 hover:text-green-600"
                title={server.disabled ? t.mcp.serverDisabledCannotTest : t.mcp.testConnection}
              >
                {testingServer === server.name ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveServer(server.name)}
                disabled={removingServer === server.name}
                className="hover:bg-destructive/10 hover:text-destructive"
              >
                {removingServer === server.name ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Expanded Details */}
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pl-9 space-y-3 pt-2 border-t border-border/50"
            >
              {server.command && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{t.mcp.command}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCommand(server.command || "", server.name)}
                        className="h-6 px-2 text-xs hover:bg-primary/10"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        {isCopied ? t.mcp.copied : t.mcp.copy}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(server.name)}
                        className="h-6 px-2 text-xs hover:bg-primary/10"
                      >
                        <ChevronUp className="h-3 w-3 mr-1" />
                        {t.mcp.hide}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs font-mono bg-muted/50 p-2 rounded break-all">
                    {server.command}
                  </p>
                </div>
              )}

              {server.args && server.args.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t.mcp.arguments}</p>
                  <div className="text-xs font-mono bg-muted/50 p-2 rounded space-y-1">
                    {server.args.map((arg, idx) => (
                      <div key={idx} className="break-all">
                        <span className="text-muted-foreground mr-2">[{idx}]</span>
                        {arg}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {server.transport === "sse" && server.url && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t.mcp.url}</p>
                  <p className="text-xs font-mono bg-muted/50 p-2 rounded break-all">
                    {server.url}
                  </p>
                </div>
              )}

              {Object.keys(server.env).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t.mcp.environmentVariables}
                  </p>
                  <div className="text-xs font-mono bg-muted/50 p-2 rounded space-y-1">
                    {Object.entries(server.env).map(([key, value]) => (
                      <div key={key} className="break-all">
                        <span className="text-primary">{key}</span>
                        <span className="text-muted-foreground mx-1">=</span>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold">{t.mcp.configuredServers}</h3>
          <p className="text-sm text-muted-foreground">
            {t.mcp.serversConfigured.replace("{count}", servers.length.toString())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDebugDialogOpen(true)}
            className="gap-2 hover:bg-orange-500/10 hover:text-orange-600 hover:border-orange-500/50"
          >
            <Bug className="h-4 w-4" />
            调试
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="gap-2 hover:bg-primary/10 hover:text-primary hover:border-primary/50"
          >
            <RefreshCw className="h-4 w-4" />
            {t.mcp.refresh}
          </Button>
        </div>
      </div>

      {/* Server List */}
      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 bg-primary/10 rounded-full mb-4">
            <Network className="h-12 w-12 text-primary" />
          </div>
          <p className="text-muted-foreground mb-2 font-medium">{t.mcp.noMcpServersConfigured}</p>
          <p className="text-sm text-muted-foreground">{t.mcp.addServerToGetStarted}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(serversByScope).map(([scope, scopeServers]) => (
            <div key={scope} className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {getScopeIcon(scope)}
                <span className="font-medium">{getScopeDisplayName(scope)}</span>
                <span className="text-muted-foreground/60">({scopeServers.length})</span>
              </div>
              <AnimatePresence>
                <div className="space-y-2">{scopeServers.map(renderServerItem)}</div>
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
      
      {/* Debug Dialog */}
      <MCPDebugDialog
        isOpen={debugDialogOpen}
        onClose={() => setDebugDialogOpen(false)}
      />
    </div>
  );
};
