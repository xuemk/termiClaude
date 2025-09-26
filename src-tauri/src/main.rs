// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod checkpoint;
mod claude_binary;
mod commands;
mod logger;
mod process;

use checkpoint::state::CheckpointState;
use commands::agents::{
    cleanup_finished_processes, create_agent, delete_agent, delete_native_agents, execute_agent, export_agent,
    export_agent_to_file, fetch_github_agent_content, fetch_github_agents, get_agent,
    get_agent_run, get_agent_run_with_real_time_metrics, get_claude_binary_path, refresh_claude_binary_path,
    get_live_session_output, get_session_output, get_session_status, import_agent,
    import_agent_from_file, import_agent_from_github, import_native_agents, init_database, kill_agent_session,
    list_agent_runs, list_agent_runs_with_metrics, list_agents, list_claude_installations,
    list_native_agents, list_running_sessions, load_agent_session_history, set_claude_binary_path, stream_session_output, update_agent, AgentDb,
    get_environment_variables, save_environment_variables, get_enabled_environment_variables,
    get_environment_variable_groups, create_environment_variable_group, update_environment_variable_group, delete_environment_variable_group,
    toggle_environment_variable_group_exclusive, get_available_models,
};
use commands::claude::{
    cancel_claude_execution, check_auto_checkpoint, check_claude_version, cleanup_old_checkpoints,
    clear_checkpoint_manager, continue_claude_code, create_checkpoint, delete_session, execute_claude_code,
    find_claude_md_files, fork_from_checkpoint, get_checkpoint_diff, get_checkpoint_settings,
    get_checkpoint_state_stats, get_claude_session_output, get_claude_settings, get_project_sessions,
    get_recently_modified_files, get_session_timeline, get_system_prompt, list_checkpoints,
    list_directory_contents, list_projects, list_running_claude_sessions, load_session_history,
    open_new_session, read_claude_md_file, restore_checkpoint, resume_claude_code,
    save_claude_md_file, delete_claude_md_file, save_claude_settings, update_claude_settings_with_env_group, update_claude_settings_with_model, save_system_prompt, search_files,
    track_checkpoint_message, track_session_messages, update_checkpoint_settings,
    get_hooks_config, update_hooks_config, validate_hook_command,
    ClaudeProcessState,
};
use commands::mcp::{
    mcp_add, mcp_add_from_claude_desktop, mcp_add_json, mcp_get, mcp_get_server_status, mcp_list,
    mcp_read_project_config, mcp_remove, mcp_remove_from_scope, mcp_reset_project_choices, mcp_save_project_config,
    mcp_serve, mcp_test_connection, mcp_toggle_disabled, mcp_get_scope_priority,
    mcp_read_claude_global_config, mcp_write_claude_global_config, mcp_backup_claude_global_config,
    mcp_debug_claude_info,
};
use commands::settings_monitor::{
    check_configuration_consistency, start_settings_monitor, mark_internal_settings_update, refresh_configuration,
    trigger_configuration_check, get_detailed_configuration_status, check_config_consistency_simple, 
    refresh_configuration_keep_model, SettingsMonitor,
};

use commands::usage::{
    get_session_stats, get_usage_by_date_range, get_usage_details, get_usage_stats,
};
use commands::storage::{
    storage_list_tables, storage_read_table, storage_update_row, storage_delete_row,
    storage_insert_row, storage_execute_sql, storage_reset_database,
    get_app_setting, save_app_setting,
};
use commands::proxy::{get_proxy_settings, save_proxy_settings, apply_proxy_settings};
use process::ProcessRegistryState;
use std::sync::Mutex;
use tauri::Manager;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize unified logger
    logger::init_logger();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // Initialize agents database
            let conn = init_database(&app.handle()).map_err(|e| {
                log::error!("Failed to initialize agents database: {}", e);
                format!("Database initialization failed: {}", e)
            })?;

            // Load and apply proxy settings from the database
            {
                let db = AgentDb(Mutex::new(conn));
                let proxy_settings = match db.0.lock() {
                    Ok(conn) => {
                        // Directly query proxy settings from the database
                        let mut settings = commands::proxy::ProxySettings::default();

                        let keys = vec![
                            ("proxy_enabled", "enabled"),
                            ("proxy_http", "http_proxy"),
                            ("proxy_https", "https_proxy"),
                            ("proxy_no", "no_proxy"),
                            ("proxy_all", "all_proxy"),
                        ];

                        for (db_key, field) in keys {
                            if let Ok(value) = conn.query_row(
                                "SELECT value FROM app_settings WHERE key = ?1",
                                rusqlite::params![db_key],
                                |row| row.get::<_, String>(0),
                            ) {
                                match field {
                                    "enabled" => settings.enabled = value == "true",
                                    "http_proxy" => settings.http_proxy = Some(value).filter(|s| !s.is_empty()),
                                    "https_proxy" => settings.https_proxy = Some(value).filter(|s| !s.is_empty()),
                                    "no_proxy" => settings.no_proxy = Some(value).filter(|s| !s.is_empty()),
                                    "all_proxy" => settings.all_proxy = Some(value).filter(|s| !s.is_empty()),
                                    _ => {}
                                }
                            }
                        }

                        log::info!("Loaded proxy settings: enabled={}", settings.enabled);
                        settings
                    }
                    Err(e) => {
                        log::warn!("Failed to lock database for proxy settings: {}", e);
                        commands::proxy::ProxySettings::default()
                    }
                };

                // Apply the proxy settings
                apply_proxy_settings(&proxy_settings);
            }

            // Re-open the connection for the app to manage
            let conn = init_database(&app.handle()).map_err(|e| {
                log::error!("Failed to re-initialize agents database: {}", e);
                format!("Database re-initialization failed: {}", e)
            })?;
            app.manage(AgentDb(Mutex::new(conn)));

            // Initialize checkpoint state
            let checkpoint_state = CheckpointState::new();

            // Set the Claude directory path
            if let Ok(claude_dir) = dirs::home_dir()
                .ok_or_else(|| "Could not find home directory")
                .and_then(|home| {
                    let claude_path = home.join(".claude");
                    claude_path
                        .canonicalize()
                        .map_err(|_| "Could not find ~/.claude directory")
                })
            {
                let state_clone = checkpoint_state.clone();
                tauri::async_runtime::spawn(async move {
                    state_clone.set_claude_dir(claude_dir).await;
                });
            }

            app.manage(checkpoint_state);

            // Initialize process registry
            app.manage(ProcessRegistryState::default());

            // Initialize Claude process state
            app.manage(ClaudeProcessState::default());

            // Initialize settings monitor
            app.manage(SettingsMonitor::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Claude & Project Management
            list_projects,
            get_project_sessions,
            get_claude_settings,
            open_new_session,
            get_system_prompt,
            check_claude_version,
            save_system_prompt,
            save_claude_settings,
            update_claude_settings_with_env_group,
            update_claude_settings_with_model,
            find_claude_md_files,
            read_claude_md_file,
            save_claude_md_file,
            delete_claude_md_file,
            load_session_history,
            execute_claude_code,
            continue_claude_code,
            resume_claude_code,
            cancel_claude_execution,
            list_running_claude_sessions,
            get_claude_session_output,
            list_directory_contents,
            search_files,
            get_recently_modified_files,
            delete_session,
            get_hooks_config,
            update_hooks_config,
            validate_hook_command,

            // Checkpoint Management
            create_checkpoint,
            restore_checkpoint,
            list_checkpoints,
            fork_from_checkpoint,
            get_session_timeline,
            update_checkpoint_settings,
            get_checkpoint_diff,
            track_checkpoint_message,
            track_session_messages,
            check_auto_checkpoint,
            cleanup_old_checkpoints,
            get_checkpoint_settings,
            clear_checkpoint_manager,
            get_checkpoint_state_stats,

            // Agent Management
            list_agents,
            list_native_agents,
            import_native_agents,
            create_agent,
            update_agent,
            delete_agent,
            delete_native_agents,
            get_agent,
            execute_agent,
            list_agent_runs,
            get_agent_run,
            list_agent_runs_with_metrics,
            get_agent_run_with_real_time_metrics,
            list_running_sessions,
            kill_agent_session,
            get_session_status,
            cleanup_finished_processes,
            get_session_output,
            get_live_session_output,
            stream_session_output,
            load_agent_session_history,
            get_claude_binary_path,
            set_claude_binary_path,
            refresh_claude_binary_path,
            list_claude_installations,
            export_agent,
            export_agent_to_file,
            import_agent,
            import_agent_from_file,
            fetch_github_agents,
            fetch_github_agent_content,
            import_agent_from_github,

            // Environment Variables
            get_environment_variables,
            save_environment_variables,
            get_enabled_environment_variables,
            get_environment_variable_groups,
            create_environment_variable_group,
            update_environment_variable_group,
            delete_environment_variable_group,
            toggle_environment_variable_group_exclusive,
            get_available_models,

            // Usage & Analytics
            get_usage_stats,
            get_usage_by_date_range,
            get_usage_details,
            get_session_stats,

            // MCP (Model Context Protocol)
            mcp_add,
            mcp_list,
            mcp_get,
            mcp_remove,
            mcp_remove_from_scope,
            mcp_toggle_disabled,
            mcp_add_json,
            mcp_add_from_claude_desktop,
            mcp_serve,
            mcp_test_connection,
            mcp_reset_project_choices,
            mcp_get_server_status,
            mcp_read_project_config,
            mcp_save_project_config,
            mcp_read_claude_global_config,
            mcp_write_claude_global_config,
            mcp_backup_claude_global_config,
            mcp_debug_claude_info,
            mcp_get_scope_priority,

            // Storage Management
            storage_list_tables,
            storage_read_table,
            storage_update_row,
            storage_delete_row,
            storage_insert_row,
            storage_execute_sql,
            storage_reset_database,
            get_app_setting,
            save_app_setting,

            // Slash Commands
            commands::slash_commands::slash_commands_list,
            commands::slash_commands::slash_command_get,
            commands::slash_commands::slash_command_save,
            commands::slash_commands::slash_command_delete,

            // Proxy Settings
            get_proxy_settings,
            save_proxy_settings,

            // Configuration Monitoring
            check_configuration_consistency,
            start_settings_monitor,
            mark_internal_settings_update,
            refresh_configuration,
            trigger_configuration_check,
            get_detailed_configuration_status,
            check_config_consistency_simple,
            refresh_configuration_keep_model,
        ])
        .run(tauri::generate_context!())
        .map_err(|e| {
            log::error!("Failed to run Tauri application: {}", e);
            e
        })?;

    Ok(())
}
