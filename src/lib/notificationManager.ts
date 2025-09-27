import { logger } from "@/lib/logger";
import { audioNotificationManager, type AudioNotificationConfig } from "./audioNotification";
import { popupNotificationManager, type PopupNotificationConfig } from "./popupNotification";

/**
 * Unified notification configuration
 */
export interface NotificationConfig {
  audio: AudioNotificationConfig;
  popup: PopupNotificationConfig;
}

/**
 * Default notification configuration
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  audio: {
    mode: "off",
  },
  popup: {
    mode: "off",
    showOnlyWhenUnfocused: true,
  },
};

/**
 * Unified notification manager class
 * 
 * Manages both audio and popup notifications in a coordinated way.
 * This ensures consistent behavior across all notification types.
 */
export class NotificationManager {
  private config: NotificationConfig = DEFAULT_NOTIFICATION_CONFIG;

  constructor() {
    this.loadConfiguration();
  }

  /**
   * Load configuration from localStorage
   */
  private loadConfiguration(): void {
    try {
      // Load audio config
      const audioConfig = localStorage.getItem("audio_notification_config");
      if (audioConfig) {
        this.config.audio = { ...this.config.audio, ...JSON.parse(audioConfig) };
        audioNotificationManager.setConfig(this.config.audio);
      }

      // Load popup config
      const popupConfig = localStorage.getItem("popup_notification_config");
      if (popupConfig) {
        this.config.popup = { ...this.config.popup, ...JSON.parse(popupConfig) };
        popupNotificationManager.updateConfig(this.config.popup);
      }

      logger.debug("[NotificationManager] Configuration loaded:", this.config);
    } catch (err) {
      logger.error("[NotificationManager] Failed to load configuration:", err);
    }
  }

  /**
   * Update notification configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    if (config.audio) {
      this.config.audio = { ...this.config.audio, ...config.audio };
      audioNotificationManager.setConfig(this.config.audio);
      
      // Save to localStorage
      try {
        localStorage.setItem("audio_notification_config", JSON.stringify(this.config.audio));
      } catch (err) {
        logger.error("[NotificationManager] Failed to save audio config:", err);
      }
    }

    if (config.popup) {
      this.config.popup = { ...this.config.popup, ...config.popup };
      popupNotificationManager.updateConfig(this.config.popup);
      
      // Save to localStorage
      try {
        localStorage.setItem("popup_notification_config", JSON.stringify(this.config.popup));
      } catch (err) {
        logger.error("[NotificationManager] Failed to save popup config:", err);
      }
    }

    logger.debug("[NotificationManager] Configuration updated:", this.config);
  }

  /**
   * Get current notification configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  /**
   * Initialize popup notification manager (no longer needs toast function)
   */
  initializePopupNotifications(): void {
    // Popup notifications now use system notifications, no setup needed
    logger.debug("[NotificationManager] Popup notifications initialized for system notifications");
  }

  /**
   * Handle message completion notification
   * Triggers both audio and popup notifications based on their respective configurations
   */
  async onMessageComplete(): Promise<void> {
    try {
      // Trigger audio notification
      await audioNotificationManager.onMessageComplete();
      
      // Trigger popup notification
      await popupNotificationManager.onMessageComplete();
      
      logger.debug("[NotificationManager] Message completion notifications triggered");
    } catch (err) {
      logger.error("[NotificationManager] Error in message completion notifications:", err);
    }
  }

  /**
   * Handle queue completion notification
   * Triggers both audio and popup notifications based on their respective configurations
   */
  async onQueueComplete(): Promise<void> {
    try {
      // Trigger audio notification
      await audioNotificationManager.onQueueComplete();
      
      // Trigger popup notification
      await popupNotificationManager.onQueueComplete();
      
      logger.debug("[NotificationManager] Queue completion notifications triggered");
    } catch (err) {
      logger.error("[NotificationManager] Error in queue completion notifications:", err);
    }
  }

  /**
   * Test audio notification
   */
  async testAudioNotification(): Promise<void> {
    try {
      await audioNotificationManager.testNotification();
    } catch (err) {
      logger.error("[NotificationManager] Error testing audio notification:", err);
    }
  }

  /**
   * Test popup notification
   */
  async testPopupNotification(): Promise<void> {
    try {
      await popupNotificationManager.testPopup();
    } catch (err) {
      logger.error("[NotificationManager] Error testing popup notification:", err);
    }
  }

  /**
   * Get current focus state (for debugging popup notifications)
   */
  getCurrentFocusState(): boolean {
    return popupNotificationManager.getCurrentFocusState();
  }
}

/**
 * Global notification manager instance
 */
export const notificationManager = new NotificationManager();

/**
 * Export types for use in other modules
 */
export type { AudioNotificationConfig, PopupNotificationConfig }; 