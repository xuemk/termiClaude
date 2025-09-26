import { invoke } from "@tauri-apps/api/core";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/errorHandler";

/**
 * @fileoverview API layer for communicating with the Tauri backend
 * Provides type-safe interfaces for all backend operations including
 * project management, agent execution, and Claude Code integration.
 */
import { getApiModel, type ClaudeModel } from "@/types/models";
import type { HooksConfiguration } from "@/types/hooks";
import { HooksManager } from "@/lib/hooksManager";

/** Process type for tracking in ProcessRegistry */
export type ProcessType =
  | { AgentRun: { agent_id: number; agent_name: string } }
  | { ClaudeSession: { session_id: string } };

/** Information about a running process */
export interface ProcessInfo {
  run_id: number;
  process_type: ProcessType;
  pid: number;
  started_at: string;
  project_path: string;
  task: string;
  model: string;
}

/**
 * Represents a project in the ~/.claude/projects directory
 */
export interface Project {
  /** The project ID (derived from the directory name) */
  id: string;
  /** The original project path (decoded from the directory name) */
  path: string;
  /** List of session IDs (JSONL file names without extension) */
  sessions: string[];
  /** Unix timestamp when the project directory was created */
  created_at: number;
}

/**
 * Represents a session with its metadata
 */
export interface Session {
  /** The session ID (UUID) */
  id: string;
  /** The project ID this session belongs to */
  project_id: string;
  /** The project path */
  project_path: string;
  /** Optional todo data associated with this session */
  todo_data?: unknown;
  /** Unix timestamp when the session file was created */
  created_at: number;
  /** First user message content (if available) */
  first_message?: string;
  /** Timestamp of the first user message (if available) */
  message_timestamp?: string;
}

/**
 * Represents the settings from ~/.claude/settings.json
 */
export interface ClaudeSettings {
  [key: string]: unknown;
}

/**
 * Represents the Claude Code version status
 */
export interface ClaudeVersionStatus {
  /** Whether Claude Code is installed and working */
  is_installed: boolean;
  /** The version string if available */
  version?: string;
  /** The full output from the command */
  output: string;
}

/**
 * Represents a CLAUDE.md file found in the project
 */
export interface ClaudeMdFile {
  /** Relative path from the project root */
  relative_path: string;
  /** Absolute path to the file */
  absolute_path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: number;
}

/**
 * Represents a file or directory entry
 */
export interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  extension?: string;
}

/**
 * Represents a Claude installation found on the system
 */
export interface ClaudeInstallation {
  /** Full path to the Claude binary */
  path: string;
  /** Version string if available */
  version?: string;
  /** Source of discovery (e.g., "nvm", "system", "homebrew", "which") */
  source: string;
  /** Type of installation */
  installation_type: "System" | "Custom" | "Bundled";
}

// Agent API types
export interface Agent {
  id?: number;
  name: string;
  icon: string;
  system_prompt: string;
  default_task?: string;
  model: string;
  hooks?: string; // JSON string of HooksConfiguration
  source?: string; // 'claudia', 'native', 'user', etc.
  created_at: string;
  updated_at: string;
}

export interface AgentExport {
  version: number;
  exported_at: string;
  agent: {
    name: string;
    icon: string;
    system_prompt: string;
    default_task?: string;
    model: string;
    hooks?: string;
  };
}

export interface GitHubAgentFile {
  name: string;
  path: string;
  download_url: string;
  size: number;
  sha: string;
}

export interface AgentRun {
  id?: number;
  agent_id: number;
  agent_name: string;
  agent_icon: string;
  task: string;
  model: string;
  project_path: string;
  session_id: string;
  status: string; // 'pending', 'running', 'completed', 'failed', 'cancelled'
  pid?: number;
  process_started_at?: string;
  created_at: string;
  completed_at?: string;
}

export interface AgentRunMetrics {
  duration_ms?: number;
  total_tokens?: number;
  cost_usd?: number;
  message_count?: number;
}

export interface AgentRunWithMetrics {
  id?: number;
  agent_id: number;
  agent_name: string;
  agent_icon: string;
  task: string;
  model: string;
  project_path: string;
  session_id: string;
  status: string; // 'pending', 'running', 'completed', 'failed', 'cancelled'
  pid?: number;
  process_started_at?: string;
  created_at: string;
  completed_at?: string;
  metrics?: AgentRunMetrics;
  output?: string; // Real-time JSONL content
}

// Usage Dashboard types
export interface UsageEntry {
  project: string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface ModelUsage {
  model: string;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  session_count: number;
}

export interface DailyUsage {
  date: string;
  total_cost: number;
  total_tokens: number;
  models_used: string[];
}

export interface ProjectUsage {
  project_path: string;
  project_name: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
  last_used: string;
}

export interface UsageStats {
  total_cost: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_sessions: number;
  by_model: ModelUsage[];
  by_date: DailyUsage[];
  by_project: ProjectUsage[];
}

/**
 * Represents a checkpoint in the session timeline
 */
export interface Checkpoint {
  id: string;
  sessionId: string;
  projectId: string;
  messageIndex: number;
  timestamp: string;
  description?: string;
  parentCheckpointId?: string;
  metadata: CheckpointMetadata;
}

/**
 * Metadata associated with a checkpoint
 */
export interface CheckpointMetadata {
  totalTokens: number;
  modelUsed: string;
  userPrompt: string;
  fileChanges: number;
  snapshotSize: number;
}

/**
 * Represents a file snapshot at a checkpoint
 */
export interface FileSnapshot {
  checkpointId: string;
  filePath: string;
  content: string;
  hash: string;
  isDeleted: boolean;
  permissions?: number;
  size: number;
}

/**
 * Represents a node in the timeline tree
 */
export interface TimelineNode {
  checkpoint: Checkpoint;
  children: TimelineNode[];
  fileSnapshotIds: string[];
}

/**
 * The complete timeline for a session
 */
export interface SessionTimeline {
  sessionId: string;
  rootNode?: TimelineNode;
  currentCheckpointId?: string;
  autoCheckpointEnabled: boolean;
  checkpointStrategy: CheckpointStrategy;
  totalCheckpoints: number;
}

/**
 * Strategy for automatic checkpoint creation
 */
export type CheckpointStrategy = "manual" | "per_prompt" | "per_tool_use" | "smart";

/**
 * Represents an environment variable stored in the database
 */
export interface EnvironmentVariableGroup {
  id?: number;
  name: string;
  description?: string;
  enabled: boolean;
  sort_order: number;
  is_system: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EnvironmentVariable {
  id?: number;
  key: string;
  value: string;
  enabled: boolean;
  group_id?: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Represents model information from the backend
 */
export interface ModelInfo {
  /** Model identifier */
  id: string;
  /** Human readable model name */
  name: string;
  /** Optional model description */
  description?: string;
}

/**
 * Result of a checkpoint operation
 */
export interface CheckpointResult {
  checkpoint: Checkpoint;
  filesProcessed: number;
  warnings: string[];
}

/**
 * Diff between two checkpoints
 */
export interface CheckpointDiff {
  fromCheckpointId: string;
  toCheckpointId: string;
  modifiedFiles: FileDiff[];
  addedFiles: string[];
  deletedFiles: string[];
  tokenDelta: number;
}

/**
 * Diff for a single file
 */
export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  diffContent?: string;
}

/**
 * Represents an MCP server configuration
 */
export interface MCPServer {
  /** Server name/identifier */
  name: string;
  /** Transport type: "stdio" or "sse" */
  transport: string;
  /** Command to execute (for stdio) */
  command?: string;
  /** Command arguments (for stdio) */
  args: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** URL endpoint (for SSE) */
  url?: string;
  /** Configuration scope: "local", "project", or "user" */
  scope: string;
  /** Whether the server is currently active */
  is_active: boolean;
  /** Whether the server is disabled */
  disabled?: boolean;
  /** Server status */
  status: ServerStatus;
}

/**
 * Server status information
 */
export interface ServerStatus {
  /** Whether the server is running */
  running: boolean;
  /** Last error message if any */
  error?: string;
  /** Last checked timestamp */
  last_checked?: number;
}

/**
 * MCP configuration for project scope (.mcp.json)
 */
export interface MCPProjectConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Individual server configuration in .mcp.json
 */
export interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Whether the server is disabled */
  disabled?: boolean;
}

/**
 * Represents a custom slash command
 */
export interface SlashCommand {
  /** Unique identifier for the command */
  id: string;
  /** Command name (without prefix) */
  name: string;
  /** Full command with prefix (e.g., "/project:optimize") */
  full_command: string;
  /** Command scope: "project" or "user" */
  scope: string;
  /** Optional namespace (e.g., "frontend" in "/project:frontend:component") */
  namespace?: string;
  /** Path to the markdown file */
  file_path: string;
  /** Command content (markdown body) */
  content: string;
  /** Optional description from frontmatter */
  description?: string;
  /** Allowed tools from frontmatter */
  allowed_tools: string[];
  /** Whether the command has bash commands (!) */
  has_bash_commands: boolean;
  /** Whether the command has file references (@) */
  has_file_references: boolean;
  /** Whether the command uses $ARGUMENTS placeholder */
  accepts_arguments: boolean;
}

/**
 * Result of adding a server
 */
export interface AddServerResult {
  success: boolean;
  message: string;
  server_name?: string;
}

/**
 * Import result for multiple servers
 */
export interface ImportResult {
  imported_count: number;
  failed_count: number;
  servers: ImportServerResult[];
}

/**
 * Result for individual server import
 */
export interface ImportServerResult {
  name: string;
  success: boolean;
  error?: string;
}

/**
 * API client for interacting with the Rust backend
 */
export const api = {
  /**
   * Lists all projects in the ~/.claude/projects directory
   * @returns Promise resolving to an array of projects
   */
  async listProjects(): Promise<Project[]> {
    try {
      return await invoke<Project[]>("list_projects");
    } catch (error) {
      await handleApiError(error as Error, { operation: "listProjects" });
      throw error;
    }
  },

  /**
   * Retrieves sessions for a specific project
   * @param projectId - The ID of the project to retrieve sessions for
   * @returns Promise resolving to an array of sessions
   */
  async getProjectSessions(projectId: string): Promise<Session[]> {
    try {
      return await invoke<Session[]>("get_project_sessions", { projectId });
    } catch (error) {
      await handleApiError(error as Error, { operation: "getProjectSessions", projectId });
      throw error;
    }
  },

  /**
   * Fetch list of agents from GitHub repository
   * @returns Promise resolving to list of available agents on GitHub
   */
  async fetchGitHubAgents(): Promise<GitHubAgentFile[]> {
    try {
      return await invoke<GitHubAgentFile[]>("fetch_github_agents");
    } catch (error) {
      logger.error("Failed to fetch GitHub agents:", error);
      throw error;
    }
  },

  /**
   * Fetch and preview a specific agent from GitHub
   * @param downloadUrl - The download URL for the agent file
   * @returns Promise resolving to the agent export data
   */
  async fetchGitHubAgentContent(downloadUrl: string): Promise<AgentExport> {
    try {
      return await invoke<AgentExport>("fetch_github_agent_content", { downloadUrl });
    } catch (error) {
      logger.error("Failed to fetch GitHub agent content:", error);
      throw error;
    }
  },

  /**
   * Import an agent directly from GitHub
   * @param downloadUrl - The download URL for the agent file
   * @returns Promise resolving to the imported agent
   */
  async importAgentFromGitHub(downloadUrl: string): Promise<Agent> {
    try {
      return await invoke<Agent>("import_agent_from_github", { downloadUrl });
    } catch (error) {
      logger.error("Failed to import agent from GitHub:", error);
      throw error;
    }
  },

  /**
   * Reads the Claude settings file
   * @returns Promise resolving to the settings object
   */
  async getClaudeSettings(): Promise<ClaudeSettings> {
    try {
      const result = await invoke<{ data: ClaudeSettings }>("get_claude_settings");
      logger.debug("Raw result from get_claude_settings:", result);

      // The Rust backend returns ClaudeSettings { data: ... }
      // We need to extract the data field
      if (result && typeof result === "object" && "data" in result) {
        return result.data;
      }

      // If the result is already the settings object, return it
      return result as ClaudeSettings;
    } catch (error) {
      logger.error("Failed to get Claude settings:", error);
      throw error;
    }
  },

  /**
   * Opens a new Claude Code session
   * @param path - Optional path to open the session in
   * @returns Promise resolving when the session is opened
   */
  async openNewSession(path?: string): Promise<string> {
    try {
      return await invoke<string>("open_new_session", { path });
    } catch (error) {
      logger.error("Failed to open new session:", error);
      throw error;
    }
  },

  /**
   * Reads the CLAUDE.md system prompt file
   * @returns Promise resolving to the system prompt content
   */
  async getSystemPrompt(): Promise<string> {
    try {
      return await invoke<string>("get_system_prompt");
    } catch (error) {
      logger.error("Failed to get system prompt:", error);
      throw error;
    }
  },

  /**
   * Checks if Claude Code is installed and gets its version
   * @returns Promise resolving to the version status
   */
  async checkClaudeVersion(): Promise<ClaudeVersionStatus> {
    try {
      return await invoke<ClaudeVersionStatus>("check_claude_version");
    } catch (error) {
      logger.error("Failed to check Claude version:", error);
      throw error;
    }
  },

  /**
   * Saves the CLAUDE.md system prompt file
   * @param content - The new content for the system prompt
   * @returns Promise resolving when the file is saved
   */
  async saveSystemPrompt(content: string): Promise<string> {
    try {
      return await invoke<string>("save_system_prompt", { content });
    } catch (error) {
      logger.error("Failed to save system prompt:", error);
      throw error;
    }
  },

  /**
   * Saves the Claude settings file
   * @param settings - The settings object to save
   * @returns Promise resolving when the settings are saved
   */
  async saveClaudeSettings(settings: ClaudeSettings): Promise<string> {
    try {
      return await invoke<string>("save_claude_settings", { settings });
    } catch (error) {
      logger.error("Failed to save Claude settings:", error);
      throw error;
    }
  },

  /**
   * Updates Claude settings.json with environment variables from active group
   * @param groupId - The ID of the active environment group
   * @param projectPath - Optional project path for project-level settings
   * @returns Promise resolving when the settings are updated
   */
  async updateClaudeSettingsWithEnvGroup(groupId: number | null, projectPath?: string): Promise<string> {
    try {
      return await invoke<string>("update_claude_settings_with_env_group", { groupId, projectPath });
    } catch (error) {
      logger.error("Failed to update Claude settings with environment group:", error);
      throw error;
    }
  },

  /**
   * Updates Claude settings.json with selected model
   * @param modelId - The ID of the selected model
   * @param projectPath - Optional project path for project-level settings
   * @returns Promise resolving when the settings are updated
   */
  async updateClaudeSettingsWithModel(modelId: string, projectPath?: string): Promise<string> {
    try {
      return await invoke<string>("update_claude_settings_with_model", { modelId, projectPath });
    } catch (error) {
      logger.error("Failed to update Claude settings with model:", error);
      throw error;
    }
  },

  /**
   * Get the currently selected model from localStorage
   */
  async getCurrentSelectedModel(): Promise<string | null> {
    return localStorage.getItem('selected-model');
  },

  /**
   * Finds all CLAUDE.md files in a project directory
   * @param projectPath - The absolute path to the project
   * @returns Promise resolving to an array of CLAUDE.md files
   */
  async findClaudeMdFiles(projectPath: string): Promise<ClaudeMdFile[]> {
    try {
      return await invoke<ClaudeMdFile[]>("find_claude_md_files", { projectPath });
    } catch (error) {
      logger.error("Failed to find CLAUDE.md files:", error);
      throw error;
    }
  },

  /**
   * Reads a specific CLAUDE.md file
   * @param filePath - The absolute path to the file
   * @returns Promise resolving to the file content
   */
  async readClaudeMdFile(filePath: string): Promise<string> {
    try {
      return await invoke<string>("read_claude_md_file", { filePath });
    } catch (error) {
      logger.error("Failed to read CLAUDE.md file:", error);
      throw error;
    }
  },

  /**
   * Saves a specific CLAUDE.md file
   * @param filePath - The absolute path to the file
   * @param content - The new content for the file
   * @returns Promise resolving when the file is saved
   */
  async saveClaudeMdFile(filePath: string, content: string): Promise<string> {
    try {
      return await invoke<string>("save_claude_md_file", { filePath, content });
    } catch (error) {
      logger.error("Failed to save CLAUDE.md file:", error);
      throw error;
    }
  },

  /**
   * Deletes a specific CLAUDE.md file
   * @param filePath - The absolute path to the file
   * @returns Promise resolving to success message
   */
  async deleteClaudeMdFile(filePath: string): Promise<string> {
    try {
      return await invoke<string>("delete_claude_md_file", { filePath });
    } catch (error) {
      logger.error("Failed to delete CLAUDE.md file:", error);
      throw error;
    }
  },

  // Agent API methods

  /**
   * Lists all CC agents
   * @returns Promise resolving to an array of agents
   */
  async listAgents(): Promise<Agent[]> {
    try {
      return await invoke<Agent[]>("list_agents");
    } catch (error) {
      logger.error("Failed to list agents:", error);
      throw error;
    }
  },

  /**
   * Lists native agents directly from .claude/agents directory
   * @returns Promise resolving to an array of native agents
   */
  async listNativeAgents(): Promise<Agent[]> {
    try {
      return await invoke<Agent[]>("list_native_agents");
    } catch (error) {
      logger.error("Failed to list native agents:", error);
      throw error;
    }
  },

  /**
   * Import native agents from .claude/agents directory to database
   * @returns Promise resolving to the number of agents imported
   */
  async importNativeAgents(): Promise<number> {
    try {
      return await invoke<number>("import_native_agents");
    } catch (error) {
      logger.error("Failed to import native agents:", error);
      throw error;
    }
  },

  /**
   * Creates a new agent
   * @param name - The agent name
   * @param icon - The icon identifier
   * @param system_prompt - The system prompt for the agent
   * @param default_task - Optional default task
   * @param model - Optional model (defaults to 'sonnet')
   * @param hooks - Optional hooks configuration as JSON string
   * @param source - Optional source type (defaults to 'claudia')
   * @returns Promise resolving to the created agent
   */
  async createAgent(
    name: string,
    icon: string,
    system_prompt: string,
    default_task?: string,
    model?: string,
    hooks?: string,
    source?: string
  ): Promise<Agent> {
    try {
      return await invoke<Agent>("create_agent", {
        name,
        icon,
        systemPrompt: system_prompt,
        defaultTask: default_task,
        model,
        hooks,
        source: source || 'claudia',
      });
    } catch (error) {
      logger.error("Failed to create agent:", error);
      throw error;
    }
  },

  /**
   * Updates an existing agent
   * @param id - The agent ID
   * @param name - The updated name
   * @param icon - The updated icon
   * @param system_prompt - The updated system prompt
   * @param default_task - Optional default task
   * @param model - Optional model
   * @param hooks - Optional hooks configuration as JSON string
   * @returns Promise resolving to the updated agent
   */
  async updateAgent(
    id: number,
    name: string,
    icon: string,
    system_prompt: string,
    default_task?: string,
    model?: string,
    hooks?: string
  ): Promise<Agent> {
    try {
      return await invoke<Agent>("update_agent", {
        id,
        name,
        icon,
        systemPrompt: system_prompt,
        defaultTask: default_task,
        model,
        hooks,
      });
    } catch (error) {
      logger.error("Failed to update agent:", error);
      throw error;
    }
  },

  /**
   * Deletes an agent
   * @param id - The agent ID to delete
   * @returns Promise resolving when the agent is deleted
   */
  async deleteAgent(id: number): Promise<void> {
    try {
      return await invoke("delete_agent", { id });
    } catch (error) {
      logger.error("Failed to delete agent:", error);
      throw error;
    }
  },

  /**
   * Deletes all native agents from database (keeping .claude/agents files intact)
   * @returns Promise resolving to the number of agents deleted
   */
  async deleteNativeAgents(): Promise<number> {
    try {
      return await invoke<number>("delete_native_agents");
    } catch (error) {
      logger.error("Failed to delete native agents:", error);
      throw error;
    }
  },

  /**
   * Gets a single agent by ID
   * @param id - The agent ID
   * @returns Promise resolving to the agent
   */
  async getAgent(id: number): Promise<Agent> {
    try {
      return await invoke<Agent>("get_agent", { id });
    } catch (error) {
      logger.error("Failed to get agent:", error);
      throw error;
    }
  },

  /**
   * Exports a single agent to JSON format
   * @param id - The agent ID to export
   * @returns Promise resolving to the JSON string
   */
  async exportAgent(id: number): Promise<string> {
    try {
      return await invoke<string>("export_agent", { id });
    } catch (error) {
      logger.error("Failed to export agent:", error);
      throw error;
    }
  },

  /**
   * Imports an agent from JSON data
   * @param jsonData - The JSON string containing the agent export
   * @returns Promise resolving to the imported agent
   */
  async importAgent(jsonData: string): Promise<Agent> {
    try {
      return await invoke<Agent>("import_agent", { jsonData });
    } catch (error) {
      logger.error("Failed to import agent:", error);
      throw error;
    }
  },

  /**
   * Imports an agent from a file
   * @param filePath - The path to the JSON file
   * @param source - The source type ('claudia' or 'native')
   * @returns Promise resolving to the imported agent
   */
  async importAgentFromFile(filePath: string, source: string = 'claudia'): Promise<Agent> {
    try {
      return await invoke<Agent>("import_agent_from_file", { filePath, source });
    } catch (error) {
      logger.error("Failed to import agent from file:", error);
      throw error;
    }
  },

  /**
   * Executes an agent
   * @param agentId - The agent ID to execute
   * @param projectPath - The project path to run the agent in
   * @param task - The task description
   * @param model - Optional model override
   * @returns Promise resolving to the run ID when execution starts
   */
  async executeAgent(
    agentId: number,
    projectPath: string,
    task: string,
    model?: string
  ): Promise<number> {
    try {
      // Map shorthand model names to API model identifiers
      const apiModel = model ? getApiModel(model as ClaudeModel) : undefined;
      return await invoke<number>("execute_agent", { agentId, projectPath, task, model: apiModel });
    } catch (error) {
      logger.error("Failed to execute agent:", error);
      // Return a sentinel value to indicate error
      throw new Error(
        `Failed to execute agent: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Lists agent runs with metrics
   * @param agentId - Optional agent ID to filter runs
   * @returns Promise resolving to an array of agent runs with metrics
   */
  async listAgentRuns(agentId?: number): Promise<AgentRunWithMetrics[]> {
    try {
      return await invoke<AgentRunWithMetrics[]>("list_agent_runs", { agentId });
    } catch (error) {
      logger.error("Failed to list agent runs:", error);
      // Return empty array instead of throwing to prevent UI crashes
      return [];
    }
  },

  /**
   * Gets a single agent run by ID with metrics
   * @param id - The run ID
   * @returns Promise resolving to the agent run with metrics
   */
  async getAgentRun(id: number): Promise<AgentRunWithMetrics> {
    try {
      return await invoke<AgentRunWithMetrics>("get_agent_run", { id });
    } catch (error) {
      logger.error("Failed to get agent run:", error);
      throw new Error(
        `Failed to get agent run: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Gets a single agent run by ID with real-time metrics from JSONL
   * @param id - The run ID
   * @returns Promise resolving to the agent run with metrics
   */
  async getAgentRunWithRealTimeMetrics(id: number): Promise<AgentRunWithMetrics> {
    try {
      return await invoke<AgentRunWithMetrics>("get_agent_run_with_real_time_metrics", { id });
    } catch (error) {
      logger.error("Failed to get agent run with real-time metrics:", error);
      throw new Error(
        `Failed to get agent run with real-time metrics: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Lists all currently running agent sessions
   * @returns Promise resolving to list of running agent sessions
   */
  async listRunningAgentSessions(): Promise<AgentRun[]> {
    try {
      return await invoke<AgentRun[]>("list_running_sessions");
    } catch (error) {
      logger.error("Failed to list running agent sessions:", error);
      throw new Error(
        `Failed to list running agent sessions: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Kills a running agent session
   * @param runId - The run ID to kill
   * @returns Promise resolving to whether the session was successfully killed
   */
  async killAgentSession(runId: number): Promise<boolean> {
    try {
      return await invoke<boolean>("kill_agent_session", { runId });
    } catch (error) {
      logger.error("Failed to kill agent session:", error);
      throw new Error(
        `Failed to kill agent session: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Gets the status of a specific agent session
   * @param runId - The run ID to check
   * @returns Promise resolving to the session status or null if not found
   */
  async getSessionStatus(runId: number): Promise<string | null> {
    try {
      return await invoke<string | null>("get_session_status", { runId });
    } catch (error) {
      logger.error("Failed to get session status:", error);
      throw new Error(
        `Failed to get session status: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Cleanup finished processes and update their status
   * @returns Promise resolving to list of run IDs that were cleaned up
   */
  async cleanupFinishedProcesses(): Promise<number[]> {
    try {
      return await invoke<number[]>("cleanup_finished_processes");
    } catch (error) {
      logger.error("Failed to cleanup finished processes:", error);
      throw new Error(
        `Failed to cleanup finished processes: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Get real-time output for a running session (with live output fallback)
   * @param runId - The run ID to get output for
   * @returns Promise resolving to the current session output (JSONL format)
   */
  async getSessionOutput(runId: number): Promise<string> {
    try {
      return await invoke<string>("get_session_output", { runId });
    } catch (error) {
      logger.error("Failed to get session output:", error);
      throw new Error(
        `Failed to get session output: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Get live output directly from process stdout buffer
   * @param runId - The run ID to get live output for
   * @returns Promise resolving to the current live output
   */
  async getLiveSessionOutput(runId: number): Promise<string> {
    try {
      return await invoke<string>("get_live_session_output", { runId });
    } catch (error) {
      logger.error("Failed to get live session output:", error);
      throw new Error(
        `Failed to get live session output: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Start streaming real-time output for a running session
   * @param runId - The run ID to stream output for
   * @returns Promise that resolves when streaming starts
   */
  async streamSessionOutput(runId: number): Promise<void> {
    try {
      return await invoke<void>("stream_session_output", { runId });
    } catch (error) {
      logger.error("Failed to start streaming session output:", error);
      throw new Error(
        `Failed to start streaming session output: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },

  /**
   * Loads the JSONL history for a specific session
   */
  async loadSessionHistory(sessionId: string, projectId: string): Promise<unknown[]> {
    return invoke("load_session_history", { sessionId, projectId });
  },

  /**
   * Loads the JSONL history for a specific agent session
   * Similar to loadSessionHistory but searches across all project directories
   * @param sessionId - The session ID (UUID)
   * @returns Promise resolving to array of session messages
   */
  async loadAgentSessionHistory(sessionId: string): Promise<unknown[]> {
    try {
      return await invoke<unknown[]>("load_agent_session_history", { sessionId });
    } catch (error) {
      logger.error("Failed to load agent session history:", error);
      throw error;
    }
  },

  /**
   * Executes a new interactive Claude Code session with streaming output
   */
  async executeClaudeCode(projectPath: string, prompt: string, model: string): Promise<void> {
    const apiModel = getApiModel(model as ClaudeModel);
    return invoke("execute_claude_code", { projectPath, prompt, model: apiModel });
  },

  /**
   * Continues an existing Claude Code conversation with streaming output
   */
  async continueClaudeCode(projectPath: string, prompt: string, model: string): Promise<void> {
    const apiModel = getApiModel(model as ClaudeModel);
    return invoke("continue_claude_code", { projectPath, prompt, model: apiModel });
  },

  /**
   * Resumes an existing Claude Code session by ID with streaming output
   */
  async resumeClaudeCode(
    projectPath: string,
    sessionId: string,
    prompt: string,
    model: string
  ): Promise<void> {
    const apiModel = getApiModel(model as ClaudeModel);
    return invoke("resume_claude_code", { projectPath, sessionId, prompt, model: apiModel });
  },

  /**
   * Cancels the currently running Claude Code execution
   * @param sessionId - Optional session ID to cancel a specific session
   */
  async cancelClaudeExecution(sessionId?: string): Promise<void> {
    return invoke("cancel_claude_execution", { sessionId });
  },

  /**
   * Lists all currently running Claude sessions
   * @returns Promise resolving to list of running Claude sessions
   */
  async listRunningClaudeSessions(): Promise<unknown[]> {
    return invoke("list_running_claude_sessions");
  },

  /**
   * Gets live output from a Claude session
   * @param sessionId - The session ID to get output for
   * @returns Promise resolving to the current live output
   */
  async getClaudeSessionOutput(sessionId: string): Promise<string> {
    return invoke("get_claude_session_output", { sessionId });
  },

  /**
   * Lists files and directories in a given path
   */
  async listDirectoryContents(directoryPath: string): Promise<FileEntry[]> {
    return invoke("list_directory_contents", { directoryPath });
  },

  /**
   * Searches for files and directories matching a pattern
   */
  async searchFiles(basePath: string, query: string): Promise<FileEntry[]> {
    return invoke("search_files", { basePath, query });
  },

  /**
   * Gets overall usage statistics
   * @returns Promise resolving to usage statistics
   */
  async getUsageStats(): Promise<UsageStats> {
    try {
      return await invoke<UsageStats>("get_usage_stats");
    } catch (error) {
      logger.error("Failed to get usage stats:", error);
      throw error;
    }
  },

  /**
   * Gets usage statistics filtered by date range
   * @param startDate - Start date (ISO format)
   * @param endDate - End date (ISO format)
   * @returns Promise resolving to usage statistics
   */
  async getUsageByDateRange(startDate: string, endDate: string): Promise<UsageStats> {
    try {
      return await invoke<UsageStats>("get_usage_by_date_range", { startDate, endDate });
    } catch (error) {
      logger.error("Failed to get usage by date range:", error);
      throw error;
    }
  },

  /**
   * Gets usage statistics grouped by session
   * @param since - Optional start date (YYYYMMDD)
   * @param until - Optional end date (YYYYMMDD)
   * @param order - Optional sort order ('asc' or 'desc')
   * @returns Promise resolving to an array of session usage data
   */
  async getSessionStats(
    since?: string,
    until?: string,
    order?: "asc" | "desc"
  ): Promise<ProjectUsage[]> {
    try {
      return await invoke<ProjectUsage[]>("get_session_stats", {
        since,
        until,
        order,
      });
    } catch (error) {
      logger.error("Failed to get session stats:", error);
      throw error;
    }
  },

  /**
   * Gets detailed usage entries with optional filtering
   * @param limit - Optional limit for number of entries
   * @returns Promise resolving to array of usage entries
   */
  async getUsageDetails(limit?: number): Promise<UsageEntry[]> {
    try {
      return await invoke<UsageEntry[]>("get_usage_details", { limit });
    } catch (error) {
      logger.error("Failed to get usage details:", error);
      throw error;
    }
  },

  /**
   * Creates a checkpoint for the current session state
   */
  async createCheckpoint(
    sessionId: string,
    projectId: string,
    projectPath: string,
    messageIndex?: number,
    description?: string
  ): Promise<CheckpointResult> {
    return invoke("create_checkpoint", {
      sessionId,
      projectId,
      projectPath,
      messageIndex,
      description,
    });
  },

  /**
   * Restores a session to a specific checkpoint
   */
  async restoreCheckpoint(
    checkpointId: string,
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<CheckpointResult> {
    return invoke("restore_checkpoint", {
      checkpointId,
      sessionId,
      projectId,
      projectPath,
    });
  },

  /**
   * Lists all checkpoints for a session
   */
  async listCheckpoints(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<Checkpoint[]> {
    return invoke("list_checkpoints", {
      sessionId,
      projectId,
      projectPath,
    });
  },

  /**
   * Forks a new timeline branch from a checkpoint
   */
  async forkFromCheckpoint(
    checkpointId: string,
    sessionId: string,
    projectId: string,
    projectPath: string,
    newSessionId: string,
    description?: string
  ): Promise<CheckpointResult> {
    return invoke("fork_from_checkpoint", {
      checkpointId,
      sessionId,
      projectId,
      projectPath,
      newSessionId,
      description,
    });
  },

  /**
   * Gets the timeline for a session
   */
  async getSessionTimeline(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<SessionTimeline> {
    return invoke("get_session_timeline", {
      sessionId,
      projectId,
      projectPath,
    });
  },

  /**
   * Updates checkpoint settings for a session
   */
  async updateCheckpointSettings(
    sessionId: string,
    projectId: string,
    projectPath: string,
    autoCheckpointEnabled: boolean,
    checkpointStrategy: CheckpointStrategy
  ): Promise<void> {
    return invoke("update_checkpoint_settings", {
      sessionId,
      projectId,
      projectPath,
      autoCheckpointEnabled,
      checkpointStrategy,
    });
  },

  /**
   * Gets diff between two checkpoints
   */
  async getCheckpointDiff(
    fromCheckpointId: string,
    toCheckpointId: string,
    sessionId: string,
    projectId: string
  ): Promise<CheckpointDiff> {
    try {
      return await invoke<CheckpointDiff>("get_checkpoint_diff", {
        fromCheckpointId,
        toCheckpointId,
        sessionId,
        projectId,
      });
    } catch (error) {
      logger.error("Failed to get checkpoint diff:", error);
      throw error;
    }
  },

  /**
   * Tracks a message for checkpointing
   */
  async trackCheckpointMessage(
    sessionId: string,
    projectId: string,
    projectPath: string,
    message: string
  ): Promise<void> {
    try {
      await invoke("track_checkpoint_message", {
        sessionId,
        projectId,
        projectPath,
        message,
      });
    } catch (error) {
      logger.error("Failed to track checkpoint message:", error);
      throw error;
    }
  },

  /**
   * Checks if auto-checkpoint should be triggered
   */
  async checkAutoCheckpoint(
    sessionId: string,
    projectId: string,
    projectPath: string,
    message: string
  ): Promise<boolean> {
    try {
      return await invoke<boolean>("check_auto_checkpoint", {
        sessionId,
        projectId,
        projectPath,
        message,
      });
    } catch (error) {
      logger.error("Failed to check auto checkpoint:", error);
      throw error;
    }
  },

  /**
   * Triggers cleanup of old checkpoints
   */
  async cleanupOldCheckpoints(
    sessionId: string,
    projectId: string,
    projectPath: string,
    keepCount: number
  ): Promise<number> {
    try {
      return await invoke<number>("cleanup_old_checkpoints", {
        sessionId,
        projectId,
        projectPath,
        keepCount,
      });
    } catch (error) {
      logger.error("Failed to cleanup old checkpoints:", error);
      throw error;
    }
  },

  /**
   * Gets checkpoint settings for a session
   */
  async getCheckpointSettings(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<{
    auto_checkpoint_enabled: boolean;
    checkpoint_strategy: CheckpointStrategy;
    total_checkpoints: number;
    current_checkpoint_id?: string;
  }> {
    try {
      return await invoke("get_checkpoint_settings", {
        sessionId,
        projectId,
        projectPath,
      });
    } catch (error) {
      logger.error("Failed to get checkpoint settings:", error);
      throw error;
    }
  },

  /**
   * Clears checkpoint manager for a session (cleanup on session end)
   */
  async clearCheckpointManager(sessionId: string): Promise<void> {
    try {
      await invoke("clear_checkpoint_manager", { sessionId });
    } catch (error) {
      logger.error("Failed to clear checkpoint manager:", error);
      throw error;
    }
  },

  /**
   * Tracks a batch of messages for a session for checkpointing
   */
  trackSessionMessages: (
    sessionId: string,
    projectId: string,
    projectPath: string,
    messages: string[]
  ): Promise<void> =>
    invoke("track_session_messages", { sessionId, projectId, projectPath, messages }),

  /**
   * Adds a new MCP server
   */
  async mcpAdd(
    name: string,
    transport: string,
    command?: string,
    args: string[] = [],
    env: Record<string, string> = {},
    url?: string,
    scope: string = "user"
  ): Promise<AddServerResult> {
    try {
      return await invoke<AddServerResult>("mcp_add", {
        name,
        transport,
        command,
        args,
        env,
        url,
        scope,
      });
    } catch (error) {
      logger.error("Failed to add MCP server:", error);
      throw error;
    }
  },

  /**
   * Lists all configured MCP servers
   */
  async mcpList(): Promise<MCPServer[]> {
    try {
      logger.debug("API: Calling mcp_list...");
      const result = await invoke<MCPServer[]>("mcp_list");
      logger.debug("API: mcp_list returned:", result);
      return result;
    } catch (error) {
      logger.error("API: Failed to list MCP servers:", error);
      throw error;
    }
  },

  /**
   * Gets details for a specific MCP server
   */
  async mcpGet(name: string): Promise<MCPServer> {
    try {
      return await invoke<MCPServer>("mcp_get", { name });
    } catch (error) {
      logger.error("Failed to get MCP server:", error);
      throw error;
    }
  },

  /**
   * Removes an MCP server
   */
  async mcpRemove(name: string): Promise<string> {
    try {
      return await invoke<string>("mcp_remove", { name });
    } catch (error) {
      logger.error("Failed to remove MCP server:", error);
      throw error;
    }
  },

  /**
   * Removes an MCP server from a specific scope
   */
  async mcpRemoveFromScope(name: string, scope: string): Promise<string> {
    try {
      return await invoke<string>("mcp_remove_from_scope", { name, scope });
    } catch (error) {
      logger.error("Failed to remove MCP server from scope:", error);
      throw error;
    }
  },

  /**
   * Toggles the disabled status of an MCP server
   */
  async mcpToggleDisabled(name: string, disabled: boolean, projectPath?: string): Promise<string> {
    try {
      return await invoke<string>("mcp_toggle_disabled", { name, disabled, projectPath });
    } catch (error) {
      logger.error("Failed to toggle MCP server disabled status:", error);
      throw error;
    }
  },

  /**
   * Adds an MCP server from JSON configuration
   */
  async mcpAddJson(
    name: string,
    jsonConfig: string,
    scope: string = "user"
  ): Promise<AddServerResult> {
    try {
      return await invoke<AddServerResult>("mcp_add_json", { name, jsonConfig, scope });
    } catch (error) {
      logger.error("Failed to add MCP server from JSON:", error);
      throw error;
    }
  },

  /**
   * Imports MCP servers from Claude Desktop
   */
  async mcpAddFromClaudeDesktop(scope: string = "user"): Promise<ImportResult> {
    try {
      return await invoke<ImportResult>("mcp_add_from_claude_desktop", { scope });
    } catch (error) {
      logger.error("Failed to import from Claude Desktop:", error);
      throw error;
    }
  },

  /**
   * Starts Claude Code as an MCP server
   */
  async mcpServe(): Promise<string> {
    try {
      return await invoke<string>("mcp_serve");
    } catch (error) {
      logger.error("Failed to start MCP server:", error);
      throw error;
    }
  },

  /**
   * Tests connection to an MCP server
   */
  async mcpTestConnection(name: string): Promise<string> {
    try {
      return await invoke<string>("mcp_test_connection", { name });
    } catch (error) {
      logger.error("Failed to test MCP connection:", error);
      throw error;
    }
  },

  /**
   * Resets project-scoped server approval choices
   */
  async mcpResetProjectChoices(): Promise<string> {
    try {
      return await invoke<string>("mcp_reset_project_choices");
    } catch (error) {
      logger.error("Failed to reset project choices:", error);
      throw error;
    }
  },

  /**
   * Gets the status of MCP servers
   */
  async mcpGetServerStatus(): Promise<Record<string, ServerStatus>> {
    try {
      return await invoke<Record<string, ServerStatus>>("mcp_get_server_status");
    } catch (error) {
      logger.error("Failed to get server status:", error);
      throw error;
    }
  },

  /**
   * Debug function to check which Claude binary and config Claudia is using
   */
  async mcpDebugClaudeInfo(): Promise<any> {
    try {
      return await invoke<any>("mcp_debug_claude_info");
    } catch (error) {
      logger.error("Failed to get Claude debug info:", error);
      throw error;
    }
  },

  /**
   * Gets MCP scope priority for Claude Code session
   * Returns the priority order: user -> project -> local
   */
  async mcpGetScopePriority(): Promise<string> {
    try {
      return await invoke<string>("mcp_get_scope_priority");
    } catch (error) {
      logger.error("Failed to get MCP scope priority:", error);
      throw error;
    }
  },

  /**
   * Get the stored Claude binary path from settings
   * @returns Promise resolving to the path if set, null otherwise
   */
  async getClaudeBinaryPath(): Promise<string | null> {
    try {
      return await invoke<string | null>("get_claude_binary_path");
    } catch (error) {
      logger.error("Failed to get Claude binary path:", error);
      throw error;
    }
  },

  /**
   * Set the Claude binary path in settings
   * @param path - The absolute path to the Claude binary
   * @returns Promise resolving when the path is saved
   */
  async setClaudeBinaryPath(path: string): Promise<void> {
    try {
      return await invoke<void>("set_claude_binary_path", { path });
    } catch (error) {
      logger.error("Failed to set Claude binary path:", error);
      throw error;
    }
  },

  /**
   * Refresh the Claude binary path cache to use the newly saved path immediately
   * @returns Promise resolving to the current Claude binary path
   */
  async refreshClaudeBinaryPath(): Promise<string> {
    try {
      return await invoke<string>("refresh_claude_binary_path");
    } catch (error) {
      logger.error("Failed to refresh Claude binary path:", error);
      throw error;
    }
  },

  /**
   * List all available Claude installations on the system
   * @returns Promise resolving to an array of Claude installations
   */
  async listClaudeInstallations(): Promise<ClaudeInstallation[]> {
    try {
      return await invoke<ClaudeInstallation[]>("list_claude_installations");
    } catch (error) {
      logger.error("Failed to list Claude installations:", error);
      throw error;
    }
  },

  // Storage API methods

  /**
   * Lists all tables in the SQLite database
   * @returns Promise resolving to an array of table information
   */
  async storageListTables(): Promise<unknown[]> {
    try {
      return await invoke<unknown[]>("storage_list_tables");
    } catch (error) {
      logger.error("Failed to list tables:", error);
      throw error;
    }
  },

  /**
   * Reads table data with pagination
   * @param tableName - Name of the table to read
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of rows per page
   * @param searchQuery - Optional search query
   * @returns Promise resolving to table data with pagination info
   */
  async storageReadTable(
    tableName: string,
    page: number,
    pageSize: number,
    searchQuery?: string
  ): Promise<unknown> {
    try {
      return await invoke<unknown>("storage_read_table", {
        tableName,
        page,
        pageSize,
        searchQuery,
      });
    } catch (error) {
      logger.error("Failed to read table:", error);
      throw error;
    }
  },

  /**
   * Updates a row in a table
   * @param tableName - Name of the table
   * @param primaryKeyValues - Map of primary key column names to values
   * @param updates - Map of column names to new values
   * @returns Promise resolving when the row is updated
   */
  async storageUpdateRow(
    tableName: string,
    primaryKeyValues: Record<string, unknown>,
    updates: Record<string, unknown>
  ): Promise<void> {
    try {
      return await invoke<void>("storage_update_row", {
        tableName,
        primaryKeyValues,
        updates,
      });
    } catch (error) {
      logger.error("Failed to update row:", error);
      throw error;
    }
  },

  /**
   * Deletes a row from a table
   * @param tableName - Name of the table
   * @param primaryKeyValues - Map of primary key column names to values
   * @returns Promise resolving when the row is deleted
   */
  async storageDeleteRow(
    tableName: string,
    primaryKeyValues: Record<string, unknown>
  ): Promise<void> {
    try {
      return await invoke<void>("storage_delete_row", {
        tableName,
        primaryKeyValues,
      });
    } catch (error) {
      logger.error("Failed to delete row:", error);
      throw error;
    }
  },

  /**
   * Inserts a new row into a table
   * @param tableName - Name of the table
   * @param values - Map of column names to values
   * @returns Promise resolving to the last insert row ID
   */
  async storageInsertRow(tableName: string, values: Record<string, unknown>): Promise<number> {
    try {
      return await invoke<number>("storage_insert_row", {
        tableName,
        values,
      });
    } catch (error) {
      logger.error("Failed to insert row:", error);
      throw error;
    }
  },

  /**
   * Executes a raw SQL query
   * @param query - SQL query string
   * @returns Promise resolving to query result
   */
  async storageExecuteSql(query: string): Promise<unknown> {
    try {
      return await invoke<unknown>("storage_execute_sql", { query });
    } catch (error) {
      logger.error("Failed to execute SQL:", error);
      throw error;
    }
  },

  /**
   * Resets the entire database
   * @returns Promise resolving when the database is reset
   */
  async storageResetDatabase(): Promise<void> {
    try {
      return await invoke<void>("storage_reset_database");
    } catch (error) {
      logger.error("Failed to reset database:", error);
      throw error;
    }
  },

  // Theme settings helpers

  /**
   * Gets a setting from the app_settings table
   * @param key - The setting key to retrieve
   * @returns Promise resolving to the setting value or null if not found
   */
  async getSetting(key: string): Promise<string | null> {
    try {
      return await invoke<string | null>("get_app_setting", { key });
    } catch (error) {
      console.error(`Failed to get setting ${key}:`, error);
      return null;
    }
  },

  /**
   * Saves a setting to the app_settings table (insert or update)
   * @param key - The setting key
   * @param value - The setting value
   * @returns Promise resolving when the setting is saved
   */
  async saveSetting(key: string, value: string): Promise<void> {
    try {
      await invoke<void>("save_app_setting", { key, value });
    } catch (error) {
      console.error(`Failed to save setting ${key}:`, error);
      throw error;
    }
  },

  /**
   * Get hooks configuration for a specific scope
   * @param scope - The configuration scope: 'user', 'project', or 'local'
   * @param projectPath - Project path (required for project and local scopes)
   * @returns Promise resolving to the hooks configuration
   */
  async getHooksConfig(
    scope: "user" | "project" | "local",
    projectPath?: string
  ): Promise<HooksConfiguration> {
    try {
      return await invoke<HooksConfiguration>("get_hooks_config", { scope, projectPath });
    } catch (error) {
      logger.error("Failed to get hooks config:", error);
      throw error;
    }
  },

  /**
   * Update hooks configuration for a specific scope
   * @param scope - The configuration scope: 'user', 'project', or 'local'
   * @param hooks - The hooks configuration to save
   * @param projectPath - Project path (required for project and local scopes)
   * @returns Promise resolving to success message
   */
  async updateHooksConfig(
    scope: "user" | "project" | "local",
    hooks: HooksConfiguration,
    projectPath?: string
  ): Promise<string> {
    try {
      return await invoke<string>("update_hooks_config", { scope, projectPath, hooks });
    } catch (error) {
      logger.error("Failed to update hooks config:", error);
      throw error;
    }
  },

  /**
   * Validate a hook command syntax
   * @param command - The shell command to validate
   * @returns Promise resolving to validation result
   */
  async validateHookCommand(command: string): Promise<{ valid: boolean; message: string }> {
    try {
      return await invoke<{ valid: boolean; message: string }>("validate_hook_command", {
        command,
      });
    } catch (error) {
      logger.error("Failed to validate hook command:", error);
      throw error;
    }
  },

  /**
   * Get merged hooks configuration (respecting priority)
   * @param projectPath - The project path
   * @returns Promise resolving to merged hooks configuration
   */
  async getMergedHooksConfig(projectPath: string): Promise<HooksConfiguration> {
    try {
      const [userHooks, projectHooks, localHooks] = await Promise.all([
        this.getHooksConfig("user"),
        this.getHooksConfig("project", projectPath),
        this.getHooksConfig("local", projectPath),
      ]);

      // Use HooksManager for merging
      return HooksManager.mergeConfigs(userHooks, projectHooks, localHooks);
    } catch (error) {
      logger.error("Failed to get merged hooks config:", error);
      throw error;
    }
  },

  // Slash Commands API methods

  /**
   * Lists all available slash commands
   * @param projectPath - Optional project path to include project-specific commands
   * @returns Promise resolving to array of slash commands
   */
  async slashCommandsList(projectPath?: string): Promise<SlashCommand[]> {
    try {
      return await invoke<SlashCommand[]>("slash_commands_list", { projectPath });
    } catch (error) {
      logger.error("Failed to list slash commands:", error);
      throw error;
    }
  },

  /**
   * Gets a single slash command by ID
   * @param commandId - Unique identifier of the command
   * @returns Promise resolving to the slash command
   */
  async slashCommandGet(commandId: string): Promise<SlashCommand> {
    try {
      return await invoke<SlashCommand>("slash_command_get", { commandId });
    } catch (error) {
      logger.error("Failed to get slash command:", error);
      throw error;
    }
  },

  /**
   * Creates or updates a slash command
   * @param scope - Command scope: "project" or "user"
   * @param name - Command name (without prefix)
   * @param namespace - Optional namespace for organization
   * @param content - Markdown content of the command
   * @param description - Optional description
   * @param allowedTools - List of allowed tools for this command
   * @param projectPath - Required for project scope commands
   * @returns Promise resolving to the saved command
   */
  async slashCommandSave(
    scope: string,
    name: string,
    namespace: string | undefined,
    content: string,
    description: string | undefined,
    allowedTools: string[],
    projectPath?: string
  ): Promise<SlashCommand> {
    try {
      return await invoke<SlashCommand>("slash_command_save", {
        scope,
        name,
        namespace,
        content,
        description,
        allowedTools,
        projectPath,
      });
    } catch (error) {
      logger.error("Failed to save slash command:", error);
      throw error;
    }
  },

  /**
   * Deletes a slash command
   * @param commandId - Unique identifier of the command to delete
   * @param projectPath - Optional project path for deleting project commands
   * @returns Promise resolving to deletion message
   */
  async slashCommandDelete(commandId: string, projectPath?: string): Promise<string> {
    try {
      return await invoke<string>("slash_command_delete", { commandId, projectPath });
    } catch (error) {
      logger.error("Failed to delete slash command:", error);
      throw error;
    }
  },

  /**
   * Deletes a session and its associated data
   * @param sessionId - The session ID to delete
   * @param projectId - The project ID containing the session
   */
  async deleteSession(sessionId: string, projectId: string): Promise<void> {
    try {
      await invoke("delete_session", { sessionId, projectId });
    } catch (error) {
      await handleApiError(error as Error, { operation: 'deleteSession', sessionId, projectId });
      throw error;
    }
  },

  /**
   * Gets checkpoint state statistics (for debugging/monitoring)
   */

  // Environment Variables API methods

  /**
   * Gets all environment variables from database
   * @returns Promise resolving to array of environment variables
   */
  async getEnvironmentVariables(): Promise<EnvironmentVariable[]> {
    try {
      return await invoke<EnvironmentVariable[]>("get_environment_variables");
    } catch (error) {
      logger.error("Failed to get environment variables:", error);
      throw error;
    }
  },

  /**
   * Saves environment variables to database (replacing all existing ones)
   * @param envVars - Array of environment variables to save
   * @returns Promise resolving when variables are saved
   */
  async saveEnvironmentVariables(envVars: EnvironmentVariable[]): Promise<void> {
    try {
      return await invoke("save_environment_variables", { envVars });
    } catch (error) {
      logger.error("Failed to save environment variables:", error);
      throw error;
    }
  },

  /**
   * Gets all environment variable groups
   * @returns Promise resolving to array of environment variable groups
   */
  async getEnvironmentVariableGroups(): Promise<EnvironmentVariableGroup[]> {
    try {
      return await invoke("get_environment_variable_groups");
    } catch (error) {
      logger.error("Failed to get environment variable groups:", error);
      throw error;
    }
  },

  /**
   * Creates a new environment variable group
   * @param name - Group name
   * @param description - Optional group description
   * @param sortOrder - Optional sort order
   * @returns Promise resolving to the created group
   */
  async createEnvironmentVariableGroup(
    name: string,
    description?: string,
    sortOrder?: number
  ): Promise<EnvironmentVariableGroup> {
    try {
      return await invoke("create_environment_variable_group", {
        name,
        description,
        sortOrder,
      });
    } catch (error) {
      logger.error("Failed to create environment variable group:", error);
      throw error;
    }
  },

  /**
   * Updates an environment variable group
   * @param id - Group ID
   * @param name - Group name
   * @param description - Optional group description
   * @param enabled - Whether the group is enabled
   * @param sortOrder - Sort order
   * @returns Promise resolving to the updated group
   */
  async updateEnvironmentVariableGroup(
    id: number,
    name: string,
    description: string | undefined,
    enabled: boolean,
    sortOrder: number
  ): Promise<EnvironmentVariableGroup> {
    try {
      return await invoke("update_environment_variable_group", {
        id,
        name,
        description,
        enabled,
        sortOrder,
      });
    } catch (error) {
      logger.error("Failed to update environment variable group:", error);
      throw error;
    }
  },

  /**
   * Deletes an environment variable group
   * @param id - Group ID
   * @returns Promise resolving when group is deleted
   */
  async deleteEnvironmentVariableGroup(id: number): Promise<void> {
    try {
      return await invoke("delete_environment_variable_group", { id });
    } catch (error) {
      logger.error("Failed to delete environment variable group:", error);
      throw error;
    }
  },

  /**
   * Toggle environment variable group with mutual exclusivity
   * Ensures atomic operations and proper mutual exclusivity
   * @param groupId - Group ID to toggle
   * @param enabled - Whether to enable or disable the group
   * @returns Promise resolving to updated list of all groups
   */
  async toggleEnvironmentVariableGroupExclusive(
    groupId: number, 
    enabled: boolean
  ): Promise<EnvironmentVariableGroup[]> {
    try {
      return await invoke<EnvironmentVariableGroup[]>("toggle_environment_variable_group_exclusive", { 
        groupId, 
        enabled 
      });
    } catch (error) {
      logger.error("Failed to toggle environment variable group:", error);
      throw error;
    }
  },

  /**
   * Gets enabled environment variables as key-value pairs for use in processes
   * @returns Promise resolving to enabled environment variables
   */
  async getEnabledEnvironmentVariables(): Promise<Record<string, string>> {
    try {
      return await invoke<Record<string, string>>("get_enabled_environment_variables");
    } catch (error) {
      logger.error("Failed to get enabled environment variables:", error);
      throw error;
    }
  },

  /**
   * Gets available models from environment variables
   * @returns Promise resolving to array of available models
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    try {
      return await invoke<ModelInfo[]>("get_available_models");
    } catch (error) {
      logger.error("Failed to get available models:", error);
      throw error;
    }
  },
};
