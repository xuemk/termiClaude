use anyhow::{Context, Result};
use dirs;
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

/// Helper function to create a std::process::Command with proper environment variables
/// This ensures commands like Claude can find Node.js and other dependencies
fn create_command_with_env(program: &str) -> Command {
    crate::claude_binary::create_command_with_env(program)
}

/// Finds the full path to the claude binary
/// This is necessary because macOS apps have a limited PATH environment
fn find_claude_binary(app_handle: &AppHandle) -> Result<String> {
    crate::claude_binary::find_claude_binary(app_handle).map_err(|e| anyhow::anyhow!(e))
}

/// Represents an MCP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServer {
    /// Server name/identifier
    pub name: String,
    /// Transport type: "stdio" or "sse"
    pub transport: String,
    /// Command to execute (for stdio)
    pub command: Option<String>,
    /// Command arguments (for stdio)
    pub args: Vec<String>,
    /// Environment variables
    pub env: HashMap<String, String>,
    /// URL endpoint (for SSE)
    pub url: Option<String>,
    /// Configuration scope: "local", "project", or "user"
    pub scope: String,
    /// Whether the server is currently active
    pub is_active: bool,
    /// Whether the server is disabled
    #[serde(default)]
    pub disabled: bool,
    /// Server status
    pub status: ServerStatus,
}

/// Claude全局配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeGlobalConfig {
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: HashMap<String, ClaudeGlobalMCPServer>,
    // 保留其他可能的配置字段
    #[serde(flatten)]
    pub other_fields: HashMap<String, serde_json::Value>,
}

/// Claude全局配置中的MCP服务器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeGlobalMCPServer {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(flatten)]
    pub other_fields: HashMap<String, serde_json::Value>,
}

/// 获取Claude配置文件路径
fn get_claude_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    
    if let Some(home) = dirs::home_dir() {
        // 用户全局配置
        paths.push(home.join(".claude.json"));
        
        // 项目特定的Claude配置路径（如果当前在项目中）
        if let Ok(current_dir) = std::env::current_dir() {
            paths.push(current_dir.join(".claude.json"));
        }
    }
    
    paths
}

/// 读取Claude全局配置
#[tauri::command]
pub async fn mcp_read_claude_global_config() -> Result<String, String> {
    info!("Reading Claude global config");
    
    let config_paths = get_claude_config_paths();
    
    for config_path in &config_paths {
        if config_path.exists() {
            match fs::read_to_string(config_path) {
                Ok(content) => {
                    info!("Found Claude config at: {:?}", config_path);
                    return Ok(content);
                }
                Err(e) => {
                    error!("Failed to read Claude config from {:?}: {}", config_path, e);
                }
            }
        }
    }
    
    // 如果没有找到配置文件，返回空的配置
    info!("No Claude config found, returning empty config");
    Ok(r#"{
  "mcpServers": {}
}"#.to_string())
}

/// 写入Claude全局配置
#[tauri::command]
pub async fn mcp_write_claude_global_config(content: String) -> Result<String, String> {
    info!("Writing Claude global config");
    
    // 首先验证JSON格式
    let _config: ClaudeGlobalConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON format: {}", e))?;
    
    let config_paths = get_claude_config_paths();
    
    // 尝试写入第一个可能的路径（通常是用户home目录）
    if let Some(config_path) = config_paths.first() {
        // 确保目录存在
        if let Some(parent) = config_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create config directory: {}", e))?;
            }
        }
        
        fs::write(config_path, &content)
            .map_err(|e| format!("Failed to write Claude config to {:?}: {}", config_path, e))?;
        
        info!("Successfully wrote Claude config to: {:?}", config_path);
        Ok(format!("Claude configuration saved to: {}", config_path.display()))
    } else {
        Err("Could not determine Claude config path".to_string())
    }
}

/// 备份Claude配置文件
#[tauri::command]
pub async fn mcp_backup_claude_global_config() -> Result<String, String> {
    info!("Backing up Claude global config");
    
    let config_paths = get_claude_config_paths();
    
    for config_path in &config_paths {
        if config_path.exists() {
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            
            let backup_path = config_path.with_extension(format!("json.backup.{}", timestamp));
            
            match fs::copy(config_path, &backup_path) {
                Ok(_) => {
                    info!("Backup created at: {:?}", backup_path);
                    return Ok(format!("Backup created: {}", backup_path.display()));
                }
                Err(e) => {
                    error!("Failed to create backup: {}", e);
                    return Err(format!("Failed to create backup: {}", e));
                }
            }
        }
    }
    
    Err("No Claude config file found to backup".to_string())
}

/// Server status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    /// Whether the server is running
    pub running: bool,
    /// Last error message if any
    pub error: Option<String>,
    /// Last checked timestamp
    pub last_checked: Option<u64>,
}

/// MCP configuration for project scope (.mcp.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPProjectConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, MCPServerConfig>,
}

/// Individual server configuration in .mcp.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Whether the server is disabled
    #[serde(default)]
    pub disabled: bool,
}

/// Result of adding a server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddServerResult {
    pub success: bool,
    pub message: String,
    pub server_name: Option<String>,
}

/// Import result for multiple servers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported_count: u32,
    pub failed_count: u32,
    pub servers: Vec<ImportServerResult>,
}

/// Result for individual server import
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportServerResult {
    pub name: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Executes a claude mcp command
async fn execute_claude_mcp_command(app_handle: &AppHandle, args: Vec<&str>) -> Result<String> {
    info!("Executing claude mcp command with args: {:?}", args);

    let claude_path = find_claude_binary(app_handle)?;

    // If using the bundled sidecar on macOS/Linux, run via tauri_plugin_shell to avoid PATH/sandbox issues
    if claude_path == "claude-code" {
        use tauri_plugin_shell::process::CommandEvent;

        // Build sidecar command: claude-code mcp <args...>
        let mut sidecar_cmd = app_handle
            .shell()
            .sidecar("claude-code")
            .map_err(|e| anyhow::anyhow!(format!("Failed to create sidecar command: {}", e)))?;

        let mut sidecar_args: Vec<String> = Vec::with_capacity(1 + args.len());
        sidecar_args.push("mcp".to_string());
        sidecar_args.extend(args.iter().map(|s| s.to_string()));
        sidecar_cmd = sidecar_cmd.args(sidecar_args);

        // Propagate essential environment variables similar to create_command_with_env
        for (key, value) in std::env::vars() {
            if key == "PATH"
                || key == "HOME"
                || key == "USER"
                || key == "SHELL"
                || key == "LANG"
                || key == "LC_ALL"
                || key.starts_with("LC_")
                || key == "NODE_PATH"
                || key == "NVM_DIR"
                || key == "NVM_BIN"
                || key == "HOMEBREW_PREFIX"
                || key == "HOMEBREW_CELLAR"
                || key == "HTTP_PROXY"
                || key == "HTTPS_PROXY"
                || key == "NO_PROXY"
                || key == "ALL_PROXY"
            {
                sidecar_cmd = sidecar_cmd.env(&key, &value);
            }
        }

        // macOS-specific: augment PATH to include common Node/Homebrew/NVM locations
        #[cfg(target_os = "macos")]
        {
            use std::fs;
            use std::path::PathBuf;

            let current_path = std::env::var("PATH").unwrap_or_default();
            let mut parts: Vec<String> = current_path.split(':').map(|s| s.to_string()).collect();
            let mut add_path = |p: String| {
                if !p.is_empty() && PathBuf::from(&p).exists() && !parts.iter().any(|x| x == &p) {
                    parts.insert(0, p);
                }
            };

            // Homebrew typical locations
            add_path("/opt/homebrew/bin".to_string());
            add_path("/usr/local/bin".to_string());

            if let Ok(home) = std::env::var("HOME") {
                add_path(format!("{}/.local/bin", home));
                add_path(format!("{}/bin", home));

                // Detect latest NVM Node bin
                let nvm_versions = PathBuf::from(&home).join(".nvm").join("versions").join("node");
                if nvm_versions.exists() {
                    if let Ok(entries) = fs::read_dir(&nvm_versions) {
                        let mut version_dirs: Vec<PathBuf> = entries.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect();
                        version_dirs.sort_by(|a,b| b.file_name().cmp(&a.file_name()));
                        if let Some(latest) = version_dirs.first() {
                            let bin = latest.join("bin");
                            add_path(bin.to_string_lossy().to_string());
                            // Also set NVM_DIR/NVM_BIN if not present
                            let nvm_dir = PathBuf::from(&home).join(".nvm");
                            sidecar_cmd = sidecar_cmd.env("NVM_DIR", nvm_dir.to_string_lossy().to_string());
                            sidecar_cmd = sidecar_cmd.env("NVM_BIN", latest.join("bin").to_string_lossy().to_string());
                        }
                    }
                }
            }

            // System fallbacks
            add_path("/usr/bin".to_string());
            add_path("/bin".to_string());

            let new_path = parts.join(":");
            sidecar_cmd = sidecar_cmd.env("PATH", new_path);
        }

        // Use temp dir as working directory
        let temp_dir = std::env::temp_dir();
        sidecar_cmd = sidecar_cmd.current_dir(temp_dir);

        let (mut rx, _child) = sidecar_cmd
            .spawn()
            .map_err(|e| anyhow::anyhow!(format!("Failed to spawn sidecar: {}", e)))?;

        let mut stdout_output = String::new();
        let mut stderr_output = String::new();
        let mut exit_success = false;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(data) => {
                    let s = String::from_utf8_lossy(&data);
                    stdout_output.push_str(&s);
                }
                CommandEvent::Stderr(data) => {
                    let s = String::from_utf8_lossy(&data);
                    stderr_output.push_str(&s);
                }
                CommandEvent::Terminated(payload) => {
                    exit_success = payload.code.unwrap_or(-1) == 0;
                    break;
                }
                _ => {}
            }
        }

        if exit_success {
            return Ok(stdout_output);
        } else {
            let combined = if stderr_output.is_empty() {
                stdout_output
            } else {
                format!("{}\n{}", stdout_output, stderr_output)
            };
            return Err(anyhow::anyhow!(format!("Command failed: {}", combined.trim())));
        }
    }

    // Otherwise, use system command execution as before
    let mut cmd = create_command_with_env(&claude_path);
    cmd.arg("mcp");
    for arg in args {
        cmd.arg(arg);
    }

    // On Windows, hide the console window to prevent CMD popup
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().context("Failed to execute claude command")?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(anyhow::anyhow!("Command failed: {}", stderr))
    }
}

/// Adds a new MCP server
#[tauri::command]
pub async fn mcp_add(
    app: AppHandle,
    name: String,
    transport: String,
    command: Option<String>,
    args: Vec<String>,
    env: HashMap<String, String>,
    url: Option<String>,
    scope: String,
) -> Result<AddServerResult, String> {
    info!("Adding MCP server: {} with transport: {}", name, transport);

    // Prepare owned strings for environment variables
    let env_args: Vec<String> = env
        .iter()
        .map(|(key, value)| format!("{}={}", key, value))
        .collect();

    let mut cmd_args = vec!["add"];

    // Add scope flag
    cmd_args.push("-s");
    cmd_args.push(&scope);

    // Add transport flag for SSE
    if transport == "sse" {
        cmd_args.push("--transport");
        cmd_args.push("sse");
    }

    // Add environment variables
    for (i, _) in env.iter().enumerate() {
        cmd_args.push("-e");
        cmd_args.push(&env_args[i]);
    }

    // Add name
    cmd_args.push(&name);

    // Add command/URL based on transport
    if transport == "stdio" {
        if let Some(cmd) = &command {
            // Add "--" separator before command to prevent argument parsing issues
            if !args.is_empty() || cmd.contains('-') {
                cmd_args.push("--");
            }
            cmd_args.push(cmd);
            // Add arguments
            for arg in &args {
                cmd_args.push(arg);
            }
        } else {
            return Ok(AddServerResult {
                success: false,
                message: "Command is required for stdio transport".to_string(),
                server_name: None,
            });
        }
    } else if transport == "sse" {
        if let Some(url_str) = &url {
            cmd_args.push(url_str);
        } else {
            return Ok(AddServerResult {
                success: false,
                message: "URL is required for SSE transport".to_string(),
                server_name: None,
            });
        }
    }

    match execute_claude_mcp_command(&app, cmd_args).await {
        Ok(output) => {
            info!("Successfully added MCP server: {}", name);
            Ok(AddServerResult {
                success: true,
                message: output.trim().to_string(),
                server_name: Some(name),
            })
        }
        Err(e) => {
            error!("Failed to add MCP server: {}", e);
            Ok(AddServerResult {
                success: false,
                message: e.to_string(),
                server_name: None,
            })
        }
    }
}

/// Lists all configured MCP servers
#[tauri::command]
pub async fn mcp_list(app: AppHandle) -> Result<Vec<MCPServer>, String> {
    info!("Listing MCP servers");

    match execute_claude_mcp_command(&app, vec!["list"]).await {
        Ok(output) => {
            info!("Raw output from 'claude mcp list': {:?}", output);
            let trimmed = output.trim();
            info!("Trimmed output: {:?}", trimmed);

            // Check if no servers are configured
            if trimmed.contains("No MCP servers configured") || trimmed.is_empty() {
                info!("No servers found - empty or 'No MCP servers' message");
                return Ok(vec![]);
            }

            // Read project .mcp.json config to get disabled status
            let current_project_path = std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .to_string_lossy()
                .to_string();
            
            let project_config = mcp_read_project_config(current_project_path).await.unwrap_or_else(|_| MCPProjectConfig {
                mcp_servers: HashMap::new(),
            });

            // Parse the text output, handling multi-line commands
            let mut servers = Vec::new();
            let lines: Vec<&str> = trimmed.lines().collect();
            info!("Total lines in output: {}", lines.len());
            for (idx, line) in lines.iter().enumerate() {
                info!("Line {}: {:?}", idx, line);
            }

            let mut i = 0;

            while i < lines.len() {
                let line = lines[i];
                info!("Processing line {}: {:?}", i, line);

                // Check if this line starts a new server entry
                if let Some(colon_pos) = line.find(':') {
                    info!("Found colon at position {} in line: {:?}", colon_pos, line);
                    // Make sure this is a server name line (not part of a path)
                    // Server names typically don't contain '/' or '\'
                    let potential_name = line[..colon_pos].trim();
                    info!("Potential server name: {:?}", potential_name);

                    if !potential_name.contains('/') && !potential_name.contains('\\') {
                        info!("Valid server name detected: {:?}", potential_name);
                        let name = potential_name.to_string();
                        let mut command_parts = vec![line[colon_pos + 1..].trim().to_string()];
                        info!("Initial command part: {:?}", command_parts[0]);

                        // Check if command continues on next lines
                        i += 1;
                        while i < lines.len() {
                            let next_line = lines[i];
                            info!("Checking next line {} for continuation: {:?}", i, next_line);

                            // If the next line starts with a server name pattern, break
                            if next_line.contains(':') {
                                let potential_next_name =
                                    next_line.split(':').next().unwrap_or("").trim();
                                info!(
                                    "Found colon in next line, potential name: {:?}",
                                    potential_next_name
                                );
                                if !potential_next_name.is_empty()
                                    && !potential_next_name.contains('/')
                                    && !potential_next_name.contains('\\')
                                {
                                    info!("Next line is a new server, breaking");
                                    break;
                                }
                            }
                            // Otherwise, this line is a continuation of the command
                            info!("Line {} is a continuation", i);
                            command_parts.push(next_line.trim().to_string());
                            i += 1;
                        }

                        // Join all command parts
                        let full_command = command_parts.join(" ");
                        info!("Full command for server '{}': {:?}", name, full_command);

                        // Check if server is disabled in project config
                        let disabled = project_config.mcp_servers
                            .get(&name)
                            .map(|config| config.disabled)
                            .unwrap_or(false);
                        
                        info!("Server '{}' disabled status from config: {}", name, disabled);

                        // For now, we'll create a basic server entry
                        servers.push(MCPServer {
                            name: name.clone(),
                            transport: "stdio".to_string(), // Default assumption
                            command: Some(full_command),
                            args: vec![],
                            env: HashMap::new(),
                            url: None,
                            scope: "local".to_string(), // Default assumption
                            is_active: false,
                            disabled, // Read from project config
                            status: ServerStatus {
                                running: false,
                                error: None,
                                last_checked: None,
                            },
                        });
                        info!("Added server: {:?}", name);

                        continue;
                    } else {
                        info!("Skipping line - name contains path separators");
                    }
                } else {
                    info!("No colon found in line {}", i);
                }

                i += 1;
            }

            info!("Found {} MCP servers total", servers.len());
            for (idx, server) in servers.iter().enumerate() {
                info!(
                    "Server {}: name='{}', command={:?}, disabled={}",
                    idx, server.name, server.command, server.disabled
                );
            }
            Ok(servers)
        }
        Err(e) => {
            error!("Failed to list MCP servers: {}", e);
            Err(e.to_string())
        }
    }
}

/// Gets details for a specific MCP server
#[tauri::command]
pub async fn mcp_get(app: AppHandle, name: String) -> Result<MCPServer, String> {
    info!("Getting MCP server details for: {}", name);

    match execute_claude_mcp_command(&app, vec!["get", &name]).await {
        Ok(output) => {
            // Parse the structured text output
            let mut scope = "local".to_string();
            let mut transport = "stdio".to_string();
            let mut command = None;
            let mut args = vec![];
            let env = HashMap::new();
            let mut url = None;

            for line in output.lines() {
                let line = line.trim();

                if line.starts_with("Scope:") {
                    let scope_part = line.replace("Scope:", "").trim().to_string();
                    if scope_part.to_lowercase().contains("local") {
                        scope = "local".to_string();
                    } else if scope_part.to_lowercase().contains("project") {
                        scope = "project".to_string();
                    } else if scope_part.to_lowercase().contains("user")
                        || scope_part.to_lowercase().contains("global")
                    {
                        scope = "user".to_string();
                    }
                } else if line.starts_with("Type:") {
                    transport = line.replace("Type:", "").trim().to_string();
                } else if line.starts_with("Command:") {
                    command = Some(line.replace("Command:", "").trim().to_string());
                } else if line.starts_with("Args:") {
                    let args_str = line.replace("Args:", "").trim().to_string();
                    if !args_str.is_empty() {
                        args = args_str.split_whitespace().map(|s| s.to_string()).collect();
                    }
                } else if line.starts_with("URL:") {
                    url = Some(line.replace("URL:", "").trim().to_string());
                } else if line.starts_with("Environment:") {
                    // TODO: Parse environment variables if they're listed
                    // For now, we'll leave it empty
                }
            }

            // Read project .mcp.json config to get disabled status
            let current_project_path = std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .to_string_lossy()
                .to_string();
            
            let project_config = mcp_read_project_config(current_project_path).await.unwrap_or_else(|_| MCPProjectConfig {
                mcp_servers: HashMap::new(),
            });

            // Check if server is disabled in project config
            let disabled = project_config.mcp_servers
                .get(&name)
                .map(|config| config.disabled)
                .unwrap_or(false);

            Ok(MCPServer {
                name,
                transport,
                command,
                args,
                env,
                url,
                scope,
                is_active: false,
                disabled, // Read from project config
                status: ServerStatus {
                    running: false,
                    error: None,
                    last_checked: None,
                },
            })
        }
        Err(e) => {
            error!("Failed to get MCP server: {}", e);
            Err(e.to_string())
        }
    }
}

/// Removes an MCP server
/// If server exists in multiple scopes, it will attempt to remove from project scope first,
/// then local scope, then user scope
#[tauri::command]
pub async fn mcp_remove(app: AppHandle, name: String) -> Result<String, String> {
    info!("Removing MCP server: {}", name);

    // First, try to remove without scope (original behavior)
    match execute_claude_mcp_command(&app, vec!["remove", &name]).await {
        Ok(output) => {
            info!("Successfully removed MCP server: {}", name);
            Ok(output.trim().to_string())
        }
        Err(e) => {
            let error_msg = e.to_string();
            
            // Check if error is about multiple scopes
            if error_msg.contains("exists in multiple scopes") {
                info!("Server {} exists in multiple scopes, trying to remove from each scope", name);
                
                // Try to remove from each scope in priority order: project -> local -> user
                let scopes = ["project", "local", "user"];
                let mut removal_results = Vec::new();
                
                for scope in &scopes {
                    match execute_claude_mcp_command(&app, vec!["remove", &name, "-s", scope]).await {
                        Ok(output) => {
                            info!("Successfully removed MCP server {} from {} scope", name, scope);
                            removal_results.push(format!("Removed from {} scope: {}", scope, output.trim()));
                        }
                        Err(e) => {
                            // Log but don't fail - server might not exist in this scope
                            info!("Failed to remove {} from {} scope: {}", name, scope, e);
                        }
                    }
                }
                
                if !removal_results.is_empty() {
                    Ok(removal_results.join("; "))
                } else {
                    error!("Failed to remove MCP server from any scope: {}", error_msg);
                    Err(format!("Failed to remove server from any scope: {}", error_msg))
                }
            } else {
                error!("Failed to remove MCP server: {}", error_msg);
                Err(error_msg)
            }
        }
    }
}

/// Removes an MCP server from a specific scope
#[tauri::command]
pub async fn mcp_remove_from_scope(app: AppHandle, name: String, scope: String) -> Result<String, String> {
    info!("Removing MCP server {} from {} scope", name, scope);

    match execute_claude_mcp_command(&app, vec!["remove", &name, "-s", &scope]).await {
        Ok(output) => {
            info!("Successfully removed MCP server {} from {} scope", name, scope);
            Ok(output.trim().to_string())
        }
        Err(e) => {
            error!("Failed to remove MCP server {} from {} scope: {}", name, scope, e);
            Err(e.to_string())
        }
    }
}

/// Toggles the disabled status of an MCP server
#[tauri::command]
pub async fn mcp_toggle_disabled(app: AppHandle, name: String, disabled: bool, project_path: Option<String>) -> Result<String, String> {
    info!("Toggling MCP server '{}' disabled status to: {}", name, disabled);
    
    // For now, we'll use the current working directory as the project path if not provided
    let current_project_path = project_path.unwrap_or_else(|| {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .to_string_lossy()
            .to_string()
    });
    
    // Read the current .mcp.json configuration
    match mcp_read_project_config(current_project_path.clone()).await {
        Ok(mut config) => {
            if let Some(server_config) = config.mcp_servers.get_mut(&name) {
                server_config.disabled = disabled;
            } else {
                // Server not found in config, try to get server details and create config entry
                info!("Server '{}' not found in .mcp.json, attempting to create config entry", name);
                
                // Get server details using claude mcp get command
                match execute_claude_mcp_command(&app, vec!["get", &name]).await {
                    Ok(output) => {
                        // Parse the command from output
                        let mut command = String::new();
                        let mut args = Vec::new();
                        let env = HashMap::new();
                        
                        for line in output.lines() {
                            let line = line.trim();
                            if line.starts_with("Command:") {
                                let full_command = line.replace("Command:", "").trim().to_string();
                                let parts: Vec<&str> = full_command.split_whitespace().collect();
                                if !parts.is_empty() {
                                    command = parts[0].to_string();
                                    args = parts[1..].iter().map(|s| s.to_string()).collect();
                                }
                            }
                            // TODO: Parse environment variables if needed
                        }
                        
                        // Create new server config entry
                        config.mcp_servers.insert(name.clone(), MCPServerConfig {
                            command,
                            args,
                            env,
                            disabled,
                        });
                        
                        info!("Created new config entry for server '{}'", name);
                    }
                    Err(e) => {
                        info!("Could not get server details for '{}': {}, creating minimal config entry", name, e);
                        
                        // Create minimal config entry
                        config.mcp_servers.insert(name.clone(), MCPServerConfig {
                            command: String::new(), // Will be empty, but that's ok for just tracking disabled status
                            args: Vec::new(),
                            env: HashMap::new(),
                            disabled,
                        });
                    }
                }
            }
            
            // Save the updated configuration
            match mcp_save_project_config(current_project_path, config).await {
                Ok(_) => {
                    let status = if disabled { "disabled" } else { "enabled" };
                    info!("Successfully {} MCP server: {}", status, name);
                    Ok(format!("Server '{}' has been {}", name, status))
                }
                Err(e) => {
                    error!("Failed to save MCP configuration: {}", e);
                    Err(e)
                }
            }
        }
        Err(e) => {
            error!("Failed to read MCP configuration: {}", e);
            Err(e)
        }
    }
}

/// Adds an MCP server from JSON configuration
#[tauri::command]
pub async fn mcp_add_json(
    app: AppHandle,
    name: String,
    json_config: String,
    scope: String,
) -> Result<AddServerResult, String> {
    info!(
        "Adding MCP server from JSON: {} with scope: {}",
        name, scope
    );

    // Build command args
    let mut cmd_args = vec!["add-json", &name, &json_config];

    // Add scope flag
    let scope_flag = "-s";
    cmd_args.push(scope_flag);
    cmd_args.push(&scope);

    match execute_claude_mcp_command(&app, cmd_args).await {
        Ok(output) => {
            info!("Successfully added MCP server from JSON: {}", name);
            Ok(AddServerResult {
                success: true,
                message: output.trim().to_string(),
                server_name: Some(name),
            })
        }
        Err(e) => {
            error!("Failed to add MCP server from JSON: {}", e);
            Ok(AddServerResult {
                success: false,
                message: e.to_string(),
                server_name: None,
            })
        }
    }
}

/// Imports MCP servers from Claude Desktop
#[tauri::command]
pub async fn mcp_add_from_claude_desktop(
    app: AppHandle,
    scope: String,
) -> Result<ImportResult, String> {
    info!(
        "Importing MCP servers from Claude Desktop with scope: {}",
        scope
    );

    // Get Claude Desktop config path based on platform
    let config_path = if cfg!(target_os = "macos") {
        dirs::home_dir()
            .ok_or_else(|| "Could not find home directory".to_string())?
            .join("Library")
            .join("Application Support")
            .join("Claude")
            .join("claude_desktop_config.json")
    } else if cfg!(target_os = "linux") {
        // For WSL/Linux, check common locations
        dirs::config_dir()
            .ok_or_else(|| "Could not find config directory".to_string())?
            .join("Claude")
            .join("claude_desktop_config.json")
    } else {
        return Err(
            "Import from Claude Desktop is only supported on macOS and Linux/WSL".to_string(),
        );
    };

    // Check if config file exists
    if !config_path.exists() {
        return Err(
            "Claude Desktop configuration not found. Make sure Claude Desktop is installed."
                .to_string(),
        );
    }

    // Read and parse the config file
    let config_content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read Claude Desktop config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse Claude Desktop config: {}", e))?;

    // Extract MCP servers
    let mcp_servers = config
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "No MCP servers found in Claude Desktop config".to_string())?;

    let mut imported_count = 0;
    let mut failed_count = 0;
    let mut server_results = Vec::new();

    // Import each server using add-json
    for (name, server_config) in mcp_servers {
        info!("Importing server: {}", name);

        // Convert Claude Desktop format to add-json format
        let mut json_config = serde_json::Map::new();

        // All Claude Desktop servers are stdio type
        json_config.insert(
            "type".to_string(),
            serde_json::Value::String("stdio".to_string()),
        );

        // Add command
        if let Some(command) = server_config.get("command").and_then(|v| v.as_str()) {
            json_config.insert(
                "command".to_string(),
                serde_json::Value::String(command.to_string()),
            );
        } else {
            failed_count += 1;
            server_results.push(ImportServerResult {
                name: name.clone(),
                success: false,
                error: Some("Missing command field".to_string()),
            });
            continue;
        }

        // Add args if present
        if let Some(args) = server_config.get("args").and_then(|v| v.as_array()) {
            json_config.insert("args".to_string(), args.clone().into());
        } else {
            json_config.insert("args".to_string(), serde_json::Value::Array(vec![]));
        }

        // Add env if present
        if let Some(env) = server_config.get("env").and_then(|v| v.as_object()) {
            json_config.insert("env".to_string(), env.clone().into());
        } else {
            json_config.insert(
                "env".to_string(),
                serde_json::Value::Object(serde_json::Map::new()),
            );
        }

        // Convert to JSON string
        let json_str = serde_json::to_string(&json_config)
            .map_err(|e| format!("Failed to serialize config for {}: {}", name, e))?;

        // Call add-json command
        match mcp_add_json(app.clone(), name.clone(), json_str, scope.clone()).await {
            Ok(result) => {
                if result.success {
                    imported_count += 1;
                    server_results.push(ImportServerResult {
                        name: name.clone(),
                        success: true,
                        error: None,
                    });
                    info!("Successfully imported server: {}", name);
                } else {
                    failed_count += 1;
                    let error_msg = result.message.clone();
                    server_results.push(ImportServerResult {
                        name: name.clone(),
                        success: false,
                        error: Some(result.message),
                    });
                    error!("Failed to import server {}: {}", name, error_msg);
                }
            }
            Err(e) => {
                failed_count += 1;
                let error_msg = e.clone();
                server_results.push(ImportServerResult {
                    name: name.clone(),
                    success: false,
                    error: Some(e),
                });
                error!("Error importing server {}: {}", name, error_msg);
            }
        }
    }

    info!(
        "Import complete: {} imported, {} failed",
        imported_count, failed_count
    );

    Ok(ImportResult {
        imported_count,
        failed_count,
        servers: server_results,
    })
}

/// Starts Claude Code as an MCP server
#[tauri::command]
pub async fn mcp_serve(app: AppHandle) -> Result<String, String> {
    info!("Starting Claude Code as MCP server");

    // Find binary path or sidecar indicator
    let claude_path = match find_claude_binary(&app) {
        Ok(path) => path,
        Err(e) => {
            error!("Failed to find claude binary: {}", e);
            return Err(e.to_string());
        }
    };

    // If using sidecar, spawn via tauri_plugin_shell to avoid PATH/sandbox issues
    if claude_path == "claude-code" {

        let mut sidecar_cmd = app
            .shell()
            .sidecar("claude-code")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

        sidecar_cmd = sidecar_cmd.args(["mcp".to_string(), "serve".to_string()]);

        // Propagate essential env vars
        for (key, value) in std::env::vars() {
            if key == "PATH"
                || key == "HOME"
                || key == "USER"
                || key == "SHELL"
                || key == "LANG"
                || key == "LC_ALL"
                || key.starts_with("LC_")
                || key == "NODE_PATH"
                || key == "NVM_DIR"
                || key == "NVM_BIN"
                || key == "HOMEBREW_PREFIX"
                || key == "HOMEBREW_CELLAR"
                || key == "HTTP_PROXY"
                || key == "HTTPS_PROXY"
                || key == "NO_PROXY"
                || key == "ALL_PROXY"
            {
                sidecar_cmd = sidecar_cmd.env(&key, &value);
            }
        }

        // Windows-specific SHELL/variables for CLI compatibility
        #[cfg(target_os = "windows")]
        {
            let shell_candidates = [
                "C:\\Program Files\\Git\\bin\\bash.exe",
                "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                "C:\\msys64\\usr\\bin\\bash.exe",
                "C:\\cygwin64\\bin\\bash.exe",
                "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
                "powershell.exe",
                "cmd.exe",
            ];
            let mut shell_found = false;
            for shell_path in &shell_candidates {
                if std::path::Path::new(shell_path).exists() {
                    sidecar_cmd = sidecar_cmd.env("SHELL", shell_path);
                    shell_found = true;
                    break;
                }
            }
            if !shell_found {
                sidecar_cmd = sidecar_cmd.env("SHELL", "bash");
            }
            if let Ok(userprofile) = std::env::var("USERPROFILE") {
                sidecar_cmd = sidecar_cmd.env("HOME", userprofile);
            }
            if let Ok(comspec) = std::env::var("COMSPEC") {
                sidecar_cmd = sidecar_cmd.env("COMSPEC", comspec);
            }
        }

        // Set working dir as temp
        sidecar_cmd = sidecar_cmd.current_dir(std::env::temp_dir());

        match sidecar_cmd.spawn() {
            Ok((_rx, _child)) => {
                // 不阻塞等待输出，直接返回已启动
                info!("Successfully started Claude Code MCP server (sidecar)");
                Ok("Claude Code MCP server started".to_string())
            }
            Err(e) => {
                error!("Failed to start MCP server via sidecar: {}", e);
                Err(e.to_string())
            }
        }
    } else {
        // Otherwise use system command execution
        let mut cmd = create_command_with_env(&claude_path);
        cmd.arg("mcp").arg("serve");

        // On Windows, hide the console window to prevent CMD popup
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(_) => {
                info!("Successfully started Claude Code MCP server");
                Ok("Claude Code MCP server started".to_string())
            }
            Err(e) => {
                error!("Failed to start MCP server: {}", e);
                Err(e.to_string())
            }
        }
    }
}

/// Tests connection to an MCP server
#[tauri::command]
pub async fn mcp_test_connection(app: AppHandle, name: String) -> Result<String, String> {
    info!("Testing connection to MCP server: {}", name);

    // For now, we'll use the get command to test if the server exists
    match execute_claude_mcp_command(&app, vec!["get", &name]).await {
        Ok(_) => Ok(format!("Connection to {} successful", name)),
        Err(e) => Err(e.to_string()),
    }
}

/// Resets project-scoped server approval choices
#[tauri::command]
pub async fn mcp_reset_project_choices(app: AppHandle) -> Result<String, String> {
    info!("Resetting MCP project choices");

    match execute_claude_mcp_command(&app, vec!["reset-project-choices"]).await {
        Ok(output) => {
            info!("Successfully reset MCP project choices");
            Ok(output.trim().to_string())
        }
        Err(e) => {
            error!("Failed to reset project choices: {}", e);
            Err(e.to_string())
        }
    }
}

/// Gets the status of MCP servers
#[tauri::command]
pub async fn mcp_get_server_status() -> Result<HashMap<String, ServerStatus>, String> {
    info!("Getting MCP server status");

    // TODO: Implement actual status checking
    // For now, return empty status
    Ok(HashMap::new())
}

/// Debug function to show which Claude binary and config path TermiClaude is using
#[tauri::command]
pub async fn mcp_debug_claude_info(app: AppHandle) -> Result<serde_json::Value, String> {
    info!("Getting Claude binary and config debug information");

    let mut debug_info = serde_json::Map::new();

    // Get Claude binary path
    match find_claude_binary(&app) {
        Ok(claude_path) => {
            debug_info.insert("claude_binary_path".to_string(), serde_json::Value::String(claude_path.clone()));
            
            // Test if the binary exists and get version
            if claude_path == "claude-code" {
                debug_info.insert("binary_type".to_string(), serde_json::Value::String("bundled_sidecar".to_string()));
            } else {
                let path_buf = PathBuf::from(&claude_path);
                debug_info.insert("binary_exists".to_string(), serde_json::Value::Bool(path_buf.exists()));
                debug_info.insert("binary_type".to_string(), serde_json::Value::String("system".to_string()));
                
                // Try to get version
                let mut cmd = create_command_with_env(&claude_path);
                cmd.arg("--version");
                
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }
                
                match cmd.output() {
                    Ok(output) if output.status.success() => {
                        let version_output = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        debug_info.insert("binary_version".to_string(), serde_json::Value::String(version_output));
                    }
                    _ => {
                        debug_info.insert("binary_version".to_string(), serde_json::Value::String("unknown".to_string()));
                    }
                }
            }
        }
        Err(e) => {
            debug_info.insert("claude_binary_error".to_string(), serde_json::Value::String(e.to_string()));
        }
    }

    // Get Claude config paths
    let config_paths = get_claude_config_paths();
    let config_paths_strs: Vec<String> = config_paths.iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    debug_info.insert("config_paths_checked".to_string(), serde_json::Value::Array(
        config_paths_strs.iter().map(|s| serde_json::Value::String(s.clone())).collect()
    ));

    // Check which config files actually exist
    let mut existing_configs = Vec::new();
    for config_path in &config_paths {
        if config_path.exists() {
            existing_configs.push(config_path.to_string_lossy().to_string());
        }
    }
    debug_info.insert("existing_config_files".to_string(), serde_json::Value::Array(
        existing_configs.iter().map(|s| serde_json::Value::String(s.clone())).collect()
    ));

    // Get current working directory
    match std::env::current_dir() {
        Ok(cwd) => {
            debug_info.insert("current_working_directory".to_string(), serde_json::Value::String(cwd.to_string_lossy().to_string()));
        }
        Err(e) => {
            debug_info.insert("cwd_error".to_string(), serde_json::Value::String(e.to_string()));
        }
    }

    // Test actual mcp list command to see what Claude CLI returns
    match execute_claude_mcp_command(&app, vec!["list"]).await {
        Ok(output) => {
            debug_info.insert("mcp_list_output".to_string(), serde_json::Value::String(output));
        }
        Err(e) => {
            debug_info.insert("mcp_list_error".to_string(), serde_json::Value::String(e.to_string()));
        }
    }

    // Test config list to see which config Claude CLI is using
    match execute_claude_mcp_command(&app, vec!["config", "list"]).await {
        Ok(output) => {
            debug_info.insert("config_list_output".to_string(), serde_json::Value::String(output));
        }
        Err(e) => {
            debug_info.insert("config_list_error".to_string(), serde_json::Value::String(e.to_string()));
        }
    }

    Ok(serde_json::Value::Object(debug_info))
}

/// Reads .mcp.json from the current project
#[tauri::command]
pub async fn mcp_read_project_config(project_path: String) -> Result<MCPProjectConfig, String> {
    info!("Reading .mcp.json from project: {}", project_path);

    let mcp_json_path = PathBuf::from(&project_path).join(".mcp.json");

    if !mcp_json_path.exists() {
        return Ok(MCPProjectConfig {
            mcp_servers: HashMap::new(),
        });
    }

    match fs::read_to_string(&mcp_json_path) {
        Ok(content) => match serde_json::from_str::<MCPProjectConfig>(&content) {
            Ok(config) => Ok(config),
            Err(e) => {
                error!("Failed to parse .mcp.json: {}", e);
                Err(format!("Failed to parse .mcp.json: {}", e))
            }
        },
        Err(e) => {
            error!("Failed to read .mcp.json: {}", e);
            Err(format!("Failed to read .mcp.json: {}", e))
        }
    }
}

/// Saves .mcp.json to the current project
#[tauri::command]
pub async fn mcp_save_project_config(
    project_path: String,
    config: MCPProjectConfig,
) -> Result<String, String> {
    info!("Saving .mcp.json to project: {}", project_path);

    let mcp_json_path = PathBuf::from(&project_path).join(".mcp.json");

    let json_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&mcp_json_path, json_content)
        .map_err(|e| format!("Failed to write .mcp.json: {}", e))?;

    Ok("Project MCP configuration saved".to_string())
}

/// Gets MCP scope priority for Claude Code session
/// Priority order: user -> project -> local
#[tauri::command]
pub async fn mcp_get_scope_priority() -> Result<String, String> {
    // Return scope priority as comma-separated string: user,project,local
    Ok("user,project,local".to_string())
}
