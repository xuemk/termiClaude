import { logger } from "@/lib/logger";

/**
 * Popup notification modes
 */
export type PopupNotificationMode = "off" | "on_message" | "on_queue";

/**
 * Popup notification configuration
 */
export interface PopupNotificationConfig {
  mode: PopupNotificationMode;
  showOnlyWhenUnfocused: boolean; // 只在失焦时显示弹框
}

/**
 * Default popup notification configuration
 */
export const DEFAULT_POPUP_CONFIG: PopupNotificationConfig = {
  mode: "off",
  showOnlyWhenUnfocused: true,
};

/**
 * Window focus detection utility
 */
class WindowFocusDetector {
  private isFocused = true;
  private listeners: ((focused: boolean) => void)[] = [];

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Use document visibility API and focus/blur events for better detection
    document.addEventListener("visibilitychange", () => {
      this.updateFocusState(!document.hidden);
    });

    window.addEventListener("focus", () => {
      this.updateFocusState(true);
    });

    window.addEventListener("blur", () => {
      this.updateFocusState(false);
    });

    // Initial state
    this.updateFocusState(!document.hidden && document.hasFocus());
  }

  private updateFocusState(focused: boolean): void {
    if (this.isFocused !== focused) {
      this.isFocused = focused;
      logger.debug("[WindowFocusDetector] Focus state changed:", focused);
      this.listeners.forEach(listener => listener(focused));
    }
  }

  public getFocusState(): boolean {
    return this.isFocused;
  }

  public onFocusChange(listener: (focused: boolean) => void): () => void {
    this.listeners.push(listener);
    
    // Return cleanup function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
}

/**
 * System notification manager class
 * 
 * Manages system-level popup notifications using Tauri's notification API or browser fallback.
 * Shows desktop notifications that appear even when the app is not focused.
 */
export class PopupNotificationManager {
  private config: PopupNotificationConfig = DEFAULT_POPUP_CONFIG;
  private focusDetector = new WindowFocusDetector();

  /**
   * Show system notification - tries Tauri first, then browser API
   */
  private async showSystemNotification(title: string, body: string, icon?: string): Promise<void> {
    try {
      // Try Tauri notification API first
      try {
        logger.debug("[PopupNotificationManager] Attempting Tauri notification");
        const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
        
        // Check and request permission if needed
        let permission = await isPermissionGranted();
        logger.debug("[PopupNotificationManager] Tauri permission status:", permission);
        
        if (!permission) {
          logger.debug("[PopupNotificationManager] Requesting Tauri permission...");
          const permissionResult = await requestPermission();
          logger.debug("[PopupNotificationManager] Tauri permission result:", permissionResult);
          permission = permissionResult === 'granted';
        }

        if (permission) {
          await sendNotification({
            title,
            body,
            icon: icon || undefined,
          });
          logger.debug("[PopupNotificationManager] Tauri notification sent successfully:", title);
          return; // Success - no need to try browser API
        } else {
          logger.warn("[PopupNotificationManager] Tauri notification permission denied");
        }
      } catch (tauriError) {
        logger.debug("[PopupNotificationManager] Tauri API not available, trying browser API:", tauriError);
        
        // Fallback to browser Notification API
        if ('Notification' in window) {
          logger.debug("[PopupNotificationManager] Using browser notification API");
          
          let permission = Notification.permission;
          logger.debug("[PopupNotificationManager] Current browser permission:", permission);
          
          if (permission === 'default') {
            logger.debug("[PopupNotificationManager] Requesting browser permission...");
            permission = await Notification.requestPermission();
            logger.debug("[PopupNotificationManager] Browser permission result:", permission);
          }
          
          if (permission === 'granted') {
            const notification = new Notification(title, {
              body,
              icon: icon || '/app-icon.png',
              badge: '/app-icon.png',
              tag: 'termiclaude-notification',
            });

            // Auto-close after 5 seconds
            setTimeout(() => {
              notification.close();
            }, 5000);

            logger.debug("[PopupNotificationManager] Browser notification shown successfully:", title);
          } else {
            logger.warn("[PopupNotificationManager] Browser notification permission denied");
            throw new Error("通知权限被拒绝。请在浏览器设置中允许通知，或在桌面应用中允许系统通知。");
          }
        } else {
          throw new Error("当前环境不支持通知功能");
        }
      }
    } catch (err) {
      logger.error("[PopupNotificationManager] Failed to show system notification:", err);
      throw err;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: PopupNotificationConfig): void {
    this.config = { ...config };
    logger.debug("[PopupNotificationManager] Config updated:", this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): PopupNotificationConfig {
    return { ...this.config };
  }

  /**
   * Show a popup notification if conditions are met
   */
  private async showPopup(title: string, body: string): Promise<void> {
    try {
      // Check if popup notifications are enabled
      if (this.config.mode === "off") {
        logger.debug("[PopupNotificationManager] Popup notifications disabled");
        return;
      }

      // Check focus state if required
      if (this.config.showOnlyWhenUnfocused) {
        const isFocused = this.focusDetector.getFocusState();
        if (isFocused) {
          logger.debug("[PopupNotificationManager] Window is focused, not showing popup");
          return;
        }
      }

      // Show system notification
      await this.showSystemNotification(title, body);
      
    } catch (err) {
      logger.error("[PopupNotificationManager] Error showing popup:", err);
    }
  }

  /**
   * Handle message completion notification
   */
  async onMessageComplete(): Promise<void> {
    if (this.config.mode === "on_message") {
      await this.showPopup("TermiClaude", "消息回复完成");
    }
  }

  /**
   * Handle queue completion notification
   */
  async onQueueComplete(): Promise<void> {
    if (this.config.mode === "on_queue") {
      await this.showPopup("TermiClaude", "所有消息队列已完成");
    }
  }

  /**
   * Test popup notification (for settings page)
   */
  async testPopup(): Promise<void> {
    // Always show test notification regardless of focus state for testing
    logger.debug("[PopupNotificationManager] Testing popup notification...");
    await this.showSystemNotification("TermiClaude", "这是一个测试弹框通知");
  }

  /**
   * Get current focus state (for debugging)
   */
  getCurrentFocusState(): boolean {
    return this.focusDetector.getFocusState();
  }
}

/**
 * Global popup notification manager instance
 */
export const popupNotificationManager = new PopupNotificationManager();

/**
 * Storage key for popup notification config
 */
const POPUP_CONFIG_STORAGE_KEY = "popup_notification_config";

/**
 * Save popup config to localStorage
 */
export function savePopupConfigToLocalStorage(config: PopupNotificationConfig): void {
  try {
    localStorage.setItem(POPUP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    logger.error("Failed to save popup config to localStorage:", err);
  }
}

/**
 * Load popup config from localStorage
 */
export function loadPopupConfigFromLocalStorage(): PopupNotificationConfig {
  try {
    const stored = localStorage.getItem(POPUP_CONFIG_STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored) as PopupNotificationConfig;
      return { ...DEFAULT_POPUP_CONFIG, ...config };
    }
  } catch (err) {
    logger.error("Failed to load popup config from localStorage:", err);
  }
  return DEFAULT_POPUP_CONFIG;
}

/**
 * Load popup config from settings (for integration with existing settings system)
 */
export function loadPopupConfigFromSettings(settings: Record<string, unknown>): PopupNotificationConfig {
  const popupConfig = settings.popupNotification as Partial<PopupNotificationConfig> | undefined;
  
  if (popupConfig) {
    return {
      mode: popupConfig.mode || DEFAULT_POPUP_CONFIG.mode,
      showOnlyWhenUnfocused: popupConfig.showOnlyWhenUnfocused ?? DEFAULT_POPUP_CONFIG.showOnlyWhenUnfocused,
    };
  }
  
  return DEFAULT_POPUP_CONFIG;
} 