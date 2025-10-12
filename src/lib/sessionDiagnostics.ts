/**
 * 会话诊断工具
 * 
 * 此文件仅用于诊断会话管理问题，不修改任何业务逻辑
 * 使用方法：在需要诊断的地方调用相应的日志函数
 * 
 * 在浏览器控制台中过滤日志：
 * - 所有诊断日志：[SESSION_DEBUG]
 * - 会话状态：[SESSION_STATE]
 * - 事件监听器：[EVENT_LISTENER]
 * - 消息流：[MESSAGE_FLOW]
 * - API调用：[API_CALL]
 */

import { logger } from './logger';

// 开发模式下启用详细日志
const isDev = import.meta.env.MODE === 'development';

// 彩色日志输出
const colors = {
  state: '#4CAF50',      // 绿色 - 状态变化
  event: '#2196F3',      // 蓝色 - 事件
  message: '#FF9800',    // 橙色 - 消息
  api: '#9C27B0',        // 紫色 - API
  error: '#F44336',      // 红色 - 错误
  warning: '#FFC107',    // 黄色 - 警告
  lifecycle: '#00BCD4',  // 青色 - 生命周期
};

export interface SessionDiagnosticInfo {
  sessionId: string | null;
  projectPath: string;
  messageCount: number;
  isStreaming: boolean;
  isLoading: boolean;
  timestamp: number;
  componentId?: string;
}

export interface EventListenerDiagnostic {
  eventName: string;
  sessionId: string | null;
  action: 'attached' | 'detached' | 'triggered';
  timestamp: number;
  componentId?: string;
}

/**
 * 记录会话状态变化
 */
export function logSessionStateChange(
  action: string,
  info: SessionDiagnosticInfo,
  additionalData?: Record<string, any>
) {
  const data = {
    ...info,
    ...additionalData,
    timestamp: new Date().toISOString(),
  };
  
  if (isDev) {
    console.log(
      `%c[SESSION_STATE] ${action}`,
      `color: ${colors.state}; font-weight: bold;`,
      data
    );
  }
  
  logger.debug(`[SESSION_DIAGNOSTIC] ${action}`, data);
}

/**
 * 记录事件监听器操作
 */
export function logEventListener(diagnostic: EventListenerDiagnostic) {
  const data = {
    ...diagnostic,
    timestamp: new Date().toISOString(),
  };
  
  if (isDev) {
    console.log(
      `%c[EVENT_LISTENER] ${diagnostic.action} - ${diagnostic.eventName}`,
      `color: ${colors.event}; font-weight: bold;`,
      data
    );
  }
  
  logger.debug(`[EVENT_LISTENER_DIAGNOSTIC]`, data);
}

/**
 * 记录会话ID变化
 */
export function logSessionIdChange(
  oldId: string | null,
  newId: string | null,
  source: string,
  componentId?: string
) {
  const data = {
    oldId,
    newId,
    source,
    componentId,
    timestamp: new Date().toISOString(),
  };
  
  if (isDev) {
    const color = oldId !== newId ? colors.warning : colors.state;
    console.log(
      `%c[SESSION_ID] ${source}: ${oldId} → ${newId}`,
      `color: ${color}; font-weight: bold;`,
      data
    );
  }
  
  logger.debug(`[SESSION_ID_CHANGE]`, data);
}

/**
 * 记录消息发送
 */
export function logMessageSend(
  sessionId: string | null,
  prompt: string,
  model: string,
  componentId?: string
) {
  const data = {
    sessionId,
    promptLength: prompt.length,
    promptPreview: prompt.substring(0, 100),
    model,
    componentId,
    timestamp: new Date().toISOString(),
  };
  
  if (isDev) {
    console.log(
      `%c[MESSAGE_SEND] 📤 Session: ${sessionId}`,
      `color: ${colors.message}; font-weight: bold;`,
      data
    );
  }
  
  logger.debug(`[MESSAGE_SEND]`, data);
}

/**
 * 记录消息接收
 */
export function logMessageReceive(
  sessionId: string | null,
  messageType: string,
  messagePreview: string,
  componentId?: string
) {
  const data = {
    sessionId,
    messageType,
    messagePreview: messagePreview.substring(0, 100),
    componentId,
    timestamp: new Date().toISOString(),
  };
  
  if (isDev) {
    console.log(
      `%c[MESSAGE_RECEIVE] 📥 Type: ${messageType}`,
      `color: ${colors.message}; font-weight: bold;`,
      data
    );
  }
  
  logger.debug(`[MESSAGE_RECEIVE]`, data);
}

/**
 * 记录会话历史加载
 */
export function logSessionHistoryLoad(
  sessionId: string,
  projectId: string | undefined,
  success: boolean,
  messageCount?: number,
  error?: any
) {
  const data = {
    sessionId,
    projectId,
    success,
    messageCount,
    error: error ? String(error) : undefined,
    timestamp: new Date().toISOString(),
  };
  
  if (isDev) {
    const color = success ? colors.state : colors.error;
    const icon = success ? '✅' : '❌';
    console.log(
      `%c[SESSION_HISTORY] ${icon} Load ${success ? 'Success' : 'Failed'} - ${messageCount || 0} messages`,
      `color: ${color}; font-weight: bold;`,
      data
    );
  }
  
  logger.debug(`[SESSION_HISTORY_LOAD]`, data);
}

/**
 * 记录组件生命周期
 */
export function logComponentLifecycle(
  componentName: string,
  action: 'mount' | 'unmount' | 'update',
  sessionId: string | null,
  additionalData?: Record<string, any>
) {
  const data = {
    componentName,
    action,
    sessionId,
    ...additionalData,
    timestamp: new Date().toISOString(),
  };
  
  if (isDev) {
    const icons = { mount: '🔵', unmount: '🔴', update: '🟡' };
    console.log(
      `%c[LIFECYCLE] ${icons[action]} ${componentName} - ${action}`,
      `color: ${colors.lifecycle}; font-weight: bold;`,
      data
    );
  }
  
  logger.debug(`[COMPONENT_LIFECYCLE]`, data);
}

/**
 * 记录API调用
 */
export function logApiCall(
  apiName: string,
  params: Record<string, any>,
  success: boolean,
  result?: any,
  error?: any
) {
  const data = {
    apiName,
    params,
    success,
    result: result ? JSON.stringify(result).substring(0, 200) : undefined,
    error: error ? String(error) : undefined,
    timestamp: new Date().toISOString(),
  };
  
  if (isDev) {
    const color = success ? colors.api : colors.error;
    const icon = success ? '✅' : '❌';
    console.log(
      `%c[API_CALL] ${icon} ${apiName}`,
      `color: ${color}; font-weight: bold;`,
      data
    );
  }
  
  logger.debug(`[API_CALL]`, data);
}

/**
 * 生成组件唯一ID（用于追踪多个组件实例）
 */
export function generateComponentId(componentName: string): string {
  return `${componentName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 检查会话连接状态
 */
export async function checkSessionConnection(
  sessionId: string | null,
  api: any
): Promise<boolean> {
  if (!sessionId) {
    if (isDev) {
      console.log(
        `%c[SESSION_CHECK] ⚠️ No session ID`,
        `color: ${colors.warning}; font-weight: bold;`
      );
    }
    logger.debug(`[SESSION_CONNECTION_CHECK] No session ID`);
    return false;
  }

  try {
    const activeSessions = await api.listRunningClaudeSessions();
    const isActive = activeSessions.some((s: any) => {
      if (s.process_type?.ClaudeSession?.session_id === sessionId) {
        return true;
      }
      return false;
    });

    const data = {
      sessionId,
      isActive,
      activeSessionCount: activeSessions.length,
      activeSessions: activeSessions.map((s: any) => ({
        id: s.process_type?.ClaudeSession?.session_id,
        pid: s.pid,
      })),
      timestamp: new Date().toISOString(),
    };

    if (isDev) {
      const color = isActive ? colors.state : colors.warning;
      const icon = isActive ? '✅' : '⚠️';
      console.log(
        `%c[SESSION_CHECK] ${icon} Session ${isActive ? 'Active' : 'Inactive'}`,
        `color: ${color}; font-weight: bold;`,
        data
      );
    }

    logger.debug(`[SESSION_CONNECTION_CHECK]`, data);

    return isActive;
  } catch (error) {
    if (isDev) {
      console.error(
        `%c[SESSION_CHECK] ❌ Error checking session`,
        `color: ${colors.error}; font-weight: bold;`,
        error
      );
    }
    logger.error(`[SESSION_CONNECTION_CHECK] Error:`, error);
    return false;
  }
}

/**
 * 打印诊断摘要
 */
export function printDiagnosticSummary() {
  if (!isDev) return;
  
  console.log(
    `%c
╔════════════════════════════════════════════════════════════╗
║          SESSION DIAGNOSTICS - 诊断日志说明                ║
╠════════════════════════════════════════════════════════════╣
║ 在控制台中过滤日志：                                        ║
║ • [SESSION_STATE]   - 会话状态变化                         ║
║ • [EVENT_LISTENER]  - 事件监听器操作                       ║
║ • [SESSION_ID]      - 会话ID变化                           ║
║ • [MESSAGE_SEND]    - 消息发送                             ║
║ • [MESSAGE_RECEIVE] - 消息接收                             ║
║ • [SESSION_HISTORY] - 历史加载                             ║
║ • [LIFECYCLE]       - 组件生命周期                         ║
║ • [API_CALL]        - API调用                              ║
║ • [SESSION_CHECK]   - 会话连接检查                         ║
╠════════════════════════════════════════════════════════════╣
║ 图标说明：                                                  ║
║ ✅ 成功  ❌ 失败  ⚠️ 警告  📤 发送  📥 接收                ║
║ 🔵 挂载  🔴 卸载  🟡 更新                                  ║
╚════════════════════════════════════════════════════════════╝
    `,
    'color: #00BCD4; font-family: monospace;'
  );
}
