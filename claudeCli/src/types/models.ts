import type { ReactNode } from "react";

/**
 * Legacy Claude model types
 *
 * @deprecated Use string type for model IDs or ModelInfo interface for dynamic models
 * This type is kept for backward compatibility but should be gradually replaced
 * with dynamic model loading from environment variables.
 */
export type ClaudeModel =
  | "claude-3-5-haiku-20241022" // Fast, cost-effective model for simple tasks
  | "claude-3-5-sonnet-20241022" // Balanced performance and capability
  | "claude-3-7-sonnet-20250219" // Latest model with enhanced capabilities
  | "claude-sonnet-4-20250514-thinking" // Claude 4 Sonnet with thinking capabilities
  | "claude-opus-4-20250514-thinking" // Claude 4 Opus with thinking capabilities
  | "claude-opus-4-1-20250805" // Claude Opus 4.1 model
  | "claude-3-7-sonnet-20250219-thinking" // Claude 3.7 Sonnet with thinking capabilities
  | "sonnet" // Legacy Claude 4 Sonnet alias
  | "opus" // Legacy Claude 4 Opus alias
  | "haiku" // Claude 3.5 Haiku shorthand
  | "sonnet-3-5" // Claude 3.5 Sonnet shorthand
  | "sonnet-3-7" // Claude 3.7 Sonnet shorthand
  | string; // Allow any string for dynamic models

/**
 * Dynamic model information
 *
 * Represents a model loaded from environment variables.
 * This is the preferred way to define models in the application.
 *
 * @example
 * ```tsx
 * const model: DynamicModelInfo = {
 *   id: "gpt-4o",
 *   name: "GPT-4o",
 *   description: "OpenAI's latest model"
 * };
 * ```
 */
export interface DynamicModelInfo {
  /** Unique model identifier (from MODEL_*_ID) */
  id: string;
  /** Human-readable display name (from MODEL_*_NAME or defaults to id) */
  name: string;
  /** Optional model description (from MODEL_*_DESCRIPTION) */
  description?: string;
}

/**
 * Model type that can be either legacy or dynamic
 *
 * @example
 * ```tsx
 * const legacyModel: ModelId = "sonnet-3-5";
 * const dynamicModel: ModelId = "gpt-4o";
 * ```
 */
export type ModelId = string;

/**
 * Model configuration interface
 *
 * Comprehensive configuration object for models containing
 * display information, categorization, and performance characteristics.
 * Now supports both legacy Claude models and dynamic models from environment variables.
 *
 * @example
 * ```tsx
 * // Legacy Claude model
 * const legacyConfig: ModelConfig = {
 *   id: "claude-3-5-sonnet-20241022",
 *   name: "Claude 3.5 Sonnet",
 *   description: "Balanced model for general use",
 *   icon: <SonnetIcon />,
 *   category: "current",
 *   performance: "balanced"
 * };
 *
 * // Dynamic model from environment variables
 * const dynamicConfig: ModelConfig = {
 *   id: "gpt-4o",
 *   name: "GPT-4o",
 *   description: "OpenAI's latest model",
 *   icon: <BotIcon />,
 *   category: "dynamic",
 *   performance: "powerful"
 * };
 * ```
 */
export interface ModelConfig {
  /** Unique model identifier */
  id: ModelId;
  /** Human-readable display name */
  name: string;
  /** Brief description of model capabilities and use cases */
  description: string;
  /** React component or icon to display for this model */
  icon: ReactNode;
  /** Whether this is a legacy, current, or dynamic model */
  category: "legacy" | "current" | "dynamic";
  /** Performance characteristics of the model */
  performance: "fast" | "balanced" | "powerful" | "unknown";
}

/**
 * Model display names mapping
 */
export const MODEL_DISPLAY_NAMES: Record<ClaudeModel, string> = {
  "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
  "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
  "claude-3-7-sonnet-20250219": "Claude 3.7 Sonnet",
  "claude-sonnet-4-20250514-thinking": "Claude 4 Sonnet (Thinking)",
  "claude-opus-4-20250514-thinking": "Claude 4 Opus (Thinking)",
  "claude-opus-4-1-20250805": "Claude Opus 4.1",
  "claude-3-7-sonnet-20250219-thinking": "Claude 3.7 Sonnet (Thinking)",
  sonnet: "Claude 4 Sonnet",
  opus: "Claude 4 Opus",
  haiku: "Claude 3.5 Haiku",
  "sonnet-3-5": "Claude 3.5 Sonnet",
  "sonnet-3-7": "Claude 3.7 Sonnet",
};

/**
 * Get display name for a model
 *
 * Converts a model identifier to its human-readable display name.
 * For legacy Claude models, uses the predefined mapping.
 * For dynamic models, falls back to the original model string.
 *
 * @param model - The model identifier (legacy or dynamic)
 * @returns Human-readable display name
 *
 * @example
 * ```tsx
 * // Legacy Claude models
 * getModelDisplayName("sonnet-3-5") // Returns: "Claude 3.5 Sonnet"
 * getModelDisplayName("claude-3-5-haiku-20241022") // Returns: "Claude 3.5 Haiku"
 *
 * // Dynamic models
 * getModelDisplayName("gpt-4o") // Returns: "gpt-4o"
 * getModelDisplayName("gemini-pro") // Returns: "gemini-pro"
 * ```
 */
export function getModelDisplayName(model: ModelId): string {
  // Check if it's a legacy Claude model with a display name mapping
  if (model in MODEL_DISPLAY_NAMES) {
    return MODEL_DISPLAY_NAMES[model as ClaudeModel];
  }
  
  // For dynamic models, return the model ID as-is
  return model;
}

/**
 * Check if model is legacy (Claude 4)
 *
 * Determines if a given model is from the legacy Claude 4 generation.
 * Legacy models may have different capabilities or pricing structures.
 * Dynamic models from environment variables are not considered legacy.
 *
 * @param model - The model identifier to check (legacy or dynamic)
 * @returns True if the model is from Claude 4 generation
 *
 * @example
 * ```typescript
 * isLegacyModel('sonnet') // true (Claude 4 Sonnet)
 * isLegacyModel('sonnet-3-5') // false (Claude 3.5 Sonnet)
 * isLegacyModel('gpt-4o') // false (Dynamic model)
 * ```
 */
export function isLegacyModel(model: ModelId): boolean {
  return model === "sonnet" || model === "opus";
}

/**
 * Model to API model mapping
 * Maps shorthand model names to their full API identifiers
 */
export const MODEL_API_MAPPING: Record<ClaudeModel, string> = {
  "claude-3-5-haiku-20241022": "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022": "claude-3-5-sonnet-20241022",
  "claude-3-7-sonnet-20250219": "claude-3-7-sonnet-20250219",
  "claude-sonnet-4-20250514-thinking": "claude-sonnet-4-20250514-thinking",
  "claude-opus-4-20250514-thinking": "claude-opus-4-20250514-thinking",
  "claude-opus-4-1-20250805": "claude-opus-4-1-20250805",
  "claude-3-7-sonnet-20250219-thinking": "claude-3-7-sonnet-20250219-thinking",
  sonnet: "claude-sonnet-4-20250514", // Legacy mapping to Claude 4 Sonnet
  opus: "claude-opus-4-20250514", // Legacy mapping to Claude 4 Opus
  haiku: "claude-3-5-haiku-20241022",
  "sonnet-3-5": "claude-3-5-sonnet-20241022",
  "sonnet-3-7": "claude-3-7-sonnet-20250219",
};

/**
 * Get API model identifier from shorthand or dynamic model
 *
 * Converts shorthand model names to their full API identifiers for legacy Claude models,
 * or returns the model ID as-is for dynamic models loaded from environment variables.
 *
 * @param model - Shorthand, full model identifier, or dynamic model ID
 * @returns Full API model identifier
 *
 * @example
 * ```typescript
 * // Legacy Claude models
 * getApiModel('sonnet-3-5') // 'claude-3-5-sonnet-20241022'
 * getApiModel('haiku') // 'claude-3-5-haiku-20241022'
 * getApiModel('claude-3-5-sonnet-20241022') // 'claude-3-5-sonnet-20241022'
 *
 * // Dynamic models (from environment variables)
 * getApiModel('gpt-4o') // 'gpt-4o'
 * getApiModel('gemini-pro') // 'gemini-pro'
 * ```
 */
export function getApiModel(model: ModelId): string {
  // Check if it's a legacy Claude model with a mapping
  if (model in MODEL_API_MAPPING) {
    return MODEL_API_MAPPING[model as ClaudeModel];
  }
  
  // For dynamic models or unknown models, return as-is
  return model;
}

/**
 * Check if a model ID is a legacy Claude model
 *
 * @param model - The model identifier to check
 * @returns True if the model is a predefined Claude model
 *
 * @example
 * ```typescript
 * isClaudeModel('sonnet-3-5') // true
 * isClaudeModel('gpt-4o') // false
 * ```
 */
export function isClaudeModel(model: ModelId): model is ClaudeModel {
  return model in MODEL_DISPLAY_NAMES;
}

/**
 * Convert DynamicModelInfo to a display format compatible with existing components
 *
 * @param modelInfo - Dynamic model information from environment variables
 * @returns Model configuration for display
 *
 * @example
 * ```typescript
 * const dynamicModel: DynamicModelInfo = {
 *   id: 'gpt-4o',
 *   name: 'GPT-4o',
 *   description: 'OpenAI latest model'
 * };
 * const config = convertDynamicModelToConfig(dynamicModel);
 * ```
 */
export function convertDynamicModelToConfig(modelInfo: DynamicModelInfo): Omit<ModelConfig, 'icon'> {
  return {
    id: modelInfo.id,
    name: modelInfo.name,
    description: modelInfo.description || `AI model: ${modelInfo.id}`,
    category: "dynamic",
    performance: "unknown"
  };
}

/**
 * Get a fallback icon component for dynamic models
 * This can be used when no specific icon is available for a dynamic model
 */
export const DEFAULT_MODEL_ICON = "🤖";
