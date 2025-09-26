use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use std::fs;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Manager, Emitter};
use crate::commands::claude::get_claude_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigStatus {
    pub needs_refresh: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedConfigStatus {
    pub needs_refresh: bool,
    pub message: String,
    pub external_env: std::collections::HashMap<String, String>,
    pub internal_vars: std::collections::HashMap<String, String>,
    pub comparison_details: Vec<ComparisonDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonDetail {
    pub key: String,
    pub external_value: Option<String>,
    pub internal_value: Option<String>,
    pub is_consistent: bool,
    pub reason: String,
}

pub struct SettingsMonitor {
    last_check_time: Arc<Mutex<Option<SystemTime>>>,
    is_internal_update: Arc<Mutex<bool>>,
}

impl SettingsMonitor {
    pub fn new() -> Self {
        Self {
            last_check_time: Arc::new(Mutex::new(None)),
            is_internal_update: Arc::new(Mutex::new(false)),
        }
    }

    /// 标记即将进行内部更新（避免误报）
    pub fn mark_internal_update(&self) {
        *self.is_internal_update.lock().unwrap() = true;
    }

    /// 清除内部更新标记
    pub fn clear_internal_update(&self) {
        *self.is_internal_update.lock().unwrap() = false;
    }

    /// 开始监听设置文件变化
    pub fn start_monitoring(&self, app_handle: AppHandle) -> Result<(), String> {
        let last_check = self.last_check_time.clone();
        let is_internal = self.is_internal_update.clone();

        // 更新初始检查时间
        if let Ok(claude_dir) = get_claude_dir() {
            let settings_path = claude_dir.join("settings.json");
            if let Ok(metadata) = fs::metadata(&settings_path) {
                if let Ok(modified) = metadata.modified() {
                    *last_check.lock().unwrap() = Some(modified);
                    log::info!("Settings monitor: Initial timestamp recorded");
                }
            }
        }

        // 启动定期检查任务
        let app_clone = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            // 等待3秒后开始监听，避免启动时的配置更新被误判
            tokio::time::sleep(Duration::from_secs(3)).await;
            log::info!("Settings monitor: Starting file change detection after startup delay");
            
            // 更频繁的检测间隔以提高响应性
            let mut interval = tokio::time::interval(Duration::from_millis(1500));
            
            loop {
                interval.tick().await;
                
                // 检查是否是内部更新
                let is_internal_update = {
                    let guard = is_internal.lock().unwrap();
                    *guard
                };
                
                if is_internal_update {
                    log::debug!("Settings monitor: Skipping check during internal update");
                    continue;
                }

                if let Err(e) = Self::check_file_changes(&app_clone, &last_check).await {
                    log::error!("Failed to check file changes: {}", e);
                }
            }
        });

        log::info!("Settings monitor started with 3s startup delay, 1.5s check interval");
        Ok(())
    }

    async fn check_file_changes(
        app: &AppHandle,
        last_check: &Arc<Mutex<Option<SystemTime>>>,
    ) -> Result<(), String> {
        let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
        let settings_path = claude_dir.join("settings.json");

        if !settings_path.exists() {
            return Ok(());
        }

        let metadata = fs::metadata(&settings_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;
        
        let current_modified = metadata.modified()
            .map_err(|e| format!("Failed to get modification time: {}", e))?;

        let needs_check = {
            let mut last_time = last_check.lock().unwrap();
            
            let should_check = if let Some(last) = *last_time {
                let changed = current_modified > last;
                if changed {
                    log::info!("Settings monitor: File change detected. Last: {:?}, Current: {:?}", 
                              last.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                              current_modified.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs());
                }
                changed
            } else {
                log::info!("Settings monitor: First check, initializing timestamp");
                false // 首次检查不触发
            };

            if should_check {
                *last_time = Some(current_modified);
            }

            should_check
        }; // MutexGuard is dropped here

        if needs_check {
            // 文件被修改了，通知前端进行检测
            log::info!("Settings monitor: External file modification detected, notifying frontend");
            
            // 发送事件让前端检测一致性
            let _ = app.emit("settings-file-changed", ());
        }

        Ok(())
    }

    async fn check_configuration_consistency(app: &AppHandle) -> Result<ConfigStatus, String> {
        use crate::commands::agents::{AgentDb, get_enabled_environment_variables};

        // 简化逻辑：只要外部配置存在且与内部不一致，就提示刷新
        let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
        let settings_path = claude_dir.join("settings.json");
        
        if !settings_path.exists() {
            log::debug!("Settings monitor: No settings file found");
            return Ok(ConfigStatus {
                needs_refresh: false,
                message: "No external configuration found".to_string(),
            });
        }

        // 读取外部配置
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        
        log::debug!("Settings monitor: Read settings file, length: {} bytes", content.len());
        
        let external_config: serde_json::Value = serde_json::from_str(&content)
            .unwrap_or_else(|_| {
                log::warn!("Settings monitor: Failed to parse JSON, treating as empty");
                serde_json::json!({})
            });

        // 获取内部环境变量
        let db_state = app.state::<AgentDb>();
        let internal_env_vars = get_enabled_environment_variables(db_state).await
            .unwrap_or_default();

        log::debug!("Settings monitor: Internal vars: {:?}", internal_env_vars.keys().collect::<Vec<_>>());

        // 检查一致性
        let needs_refresh = Self::has_inconsistency(&external_config, &internal_env_vars);
        
        log::info!("Settings monitor: Consistency check completed - needs_refresh: {}", needs_refresh);

        Ok(ConfigStatus {
            needs_refresh,
            message: if needs_refresh {
                "检测到系统配置与当前环境不一致，请刷新后继续使用".to_string()
            } else {
                "Configuration is consistent".to_string()
            },
        })
    }

    fn has_inconsistency(
        external_config: &serde_json::Value,
        internal_vars: &std::collections::HashMap<String, String>
    ) -> bool {
        let external_env = external_config
            .get("env")
            .and_then(|e| e.as_object());

        log::debug!("Settings monitor: Checking consistency - internal vars count: {}", internal_vars.len());

        // 如果内部没有任何环境变量，可能是还没加载完成，不检测
        if internal_vars.is_empty() {
            log::debug!("Settings monitor: No internal variables found, skipping check");
            return false;
        }

        // 如果外部没有env配置，但内部有配置，需要刷新
        if external_env.is_none() {
            log::debug!("Settings monitor: No external env section found, but internal vars exist");
            return true;
        }

        if let Some(ext_env) = external_env {
            // 读取settings.json中当前正在使用的3个参数
            let current_model = ext_env.get("ANTHROPIC_MODEL").and_then(|v| v.as_str());
            let current_token = ext_env.get("ANTHROPIC_AUTH_TOKEN").and_then(|v| v.as_str());
            let current_url = ext_env.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str());

            log::info!("Settings monitor: Current config in settings.json - model: {:?}, token: {:?}, url: {:?}", 
                      current_model, current_token, current_url);

            // 检查这个配置组合是否与数据库中的配置一致
            let mut inconsistencies = 0;

            // 1. 检查当前模型是否在数据库的模型列表中
            if let Some(model) = current_model {
                let mut found_model = false;
                for (key, value) in internal_vars {
                    if key.starts_with("MID_") && value == model {
                        found_model = true;
                        log::debug!("Settings monitor: Current model '{}' found in database as {}", model, key);
                        break;
                    }
                }
                if !found_model {
                    log::info!("Settings monitor: Current model '{}' not found in database MID_* list", model);
                    inconsistencies += 1;
                }
            } else {
                log::info!("Settings monitor: No ANTHROPIC_MODEL in settings.json");
                inconsistencies += 1;
            }

            // 2. 检查AUTH_TOKEN是否与数据库一致
            let db_token = internal_vars.get("ANTHROPIC_AUTH_TOKEN");
            if !values_match(current_token, db_token.map(|s| s.as_str())) {
                log::info!("Settings monitor: AUTH_TOKEN mismatch - current: {:?}, database: {:?}", current_token, db_token);
                inconsistencies += 1;
            }

            // 3. 检查BASE_URL是否与数据库一致  
            let db_url = internal_vars.get("ANTHROPIC_BASE_URL");
            if !values_match(current_url, db_url.map(|s| s.as_str())) {
                log::info!("Settings monitor: BASE_URL mismatch - current: {:?}, database: {:?}", current_url, db_url);
                inconsistencies += 1;
            }

            if inconsistencies > 0 {
                log::info!("Settings monitor: Found {} configuration inconsistencies", inconsistencies);
                return true;
            }
        }

        false
    }
}

/// 检测当前配置是否需要刷新
#[tauri::command]
pub async fn check_configuration_consistency(app: AppHandle) -> Result<ConfigStatus, String> {
    SettingsMonitor::check_configuration_consistency(&app).await
}

/// 启动设置监听器
#[tauri::command]
pub async fn start_settings_monitor(app: AppHandle) -> Result<(), String> {
    let monitor = SettingsMonitor::new();
    monitor.start_monitoring(app.clone())?;
    
    // 存储监听器实例到应用状态
    app.manage(monitor);
    
    Ok(())
}

/// 标记即将进行内部更新
#[tauri::command]
pub async fn mark_internal_settings_update(app: AppHandle) -> Result<(), String> {
    log::info!("Settings monitor: Marking internal update");
    if let Some(monitor) = app.try_state::<SettingsMonitor>() {
        monitor.mark_internal_update();
        
        // 5秒后清除标记，给足够时间完成配置更新
        let monitor_ref = monitor.inner();
        let is_internal_update = monitor_ref.is_internal_update.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(5)).await;
            *is_internal_update.lock().unwrap() = false;
            log::info!("Settings monitor: Internal update protection cleared");
        });
    }
    Ok(())
}

/// 刷新配置（重新应用工具内配置到外部文件）
#[tauri::command]
pub async fn refresh_configuration(app: AppHandle, group_id: Option<i64>) -> Result<String, String> {
    // 标记为内部更新
    mark_internal_settings_update(app.clone()).await?;
    
    // 调用现有的更新函数
    crate::commands::claude::update_claude_settings_with_env_group(app, group_id).await
}

/// 刷新配置（保持当前选择的模型）
#[tauri::command]
pub async fn refresh_configuration_keep_model(
    app: AppHandle, 
    group_id: Option<i64>,
    current_selected_model: String
) -> Result<String, String> {
    log::info!("Refreshing configuration while keeping current model: {}", current_selected_model);
    
    // 标记为内部更新
    mark_internal_settings_update(app.clone()).await?;
    
    // 1. 首先更新环境变量组配置
    crate::commands::claude::update_claude_settings_with_env_group(app.clone(), group_id).await?;
    
    // 2. 然后单独设置用户当前选择的模型
    crate::commands::claude::update_claude_settings_with_model(app.clone(), current_selected_model.clone()).await?;
    
    log::info!("Configuration refreshed successfully with model: {}", current_selected_model);
    Ok("Configuration refreshed while keeping selected model".to_string())
}

/// 手动触发一次配置检测（用于测试）
#[tauri::command]
pub async fn trigger_configuration_check(app: AppHandle) -> Result<ConfigStatus, String> {
    log::info!("Settings monitor: Manual configuration check triggered");
    
    let status = SettingsMonitor::check_configuration_consistency(&app).await?;
    
    if status.needs_refresh {
        // 发送刷新提示到前端
        let _ = app.emit("settings-refresh-needed", &status);
        log::info!("Settings monitor: Manual check - refresh notification sent");
    } else {
        log::info!("Settings monitor: Manual check - configuration is consistent");
    }
    
    Ok(status)
}

/// 详细的配置检测（用于调试）
#[tauri::command]
pub async fn get_detailed_configuration_status(
    app: AppHandle, 
    current_selected_model: String
) -> Result<DetailedConfigStatus, String> {
    use crate::commands::agents::{AgentDb, get_enabled_environment_variables};

    log::info!("Getting detailed configuration status for current model: {}", current_selected_model);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");
    
    // 获取内部环境变量
    let db_state = app.state::<AgentDb>();
    let internal_env_vars = get_enabled_environment_variables(db_state).await
        .unwrap_or_default();

    // 读取外部配置
    let external_env = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        
        let config: serde_json::Value = serde_json::from_str(&content)
            .unwrap_or_else(|_| serde_json::json!({}));
        
        config
            .get("env")
            .and_then(|e| e.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    let mut comparison_details = Vec::new();
    let mut inconsistencies = 0;
    
    // 1. 检查ANTHROPIC_AUTH_TOKEN
    let ext_token = external_env.get("ANTHROPIC_AUTH_TOKEN").cloned();
    let int_token = internal_env_vars.get("ANTHROPIC_AUTH_TOKEN").cloned();
    let token_consistent = values_match(
        ext_token.as_deref(), 
        int_token.as_deref()
    );
    if !token_consistent { inconsistencies += 1; }
    
    comparison_details.push(ComparisonDetail {
        key: "ANTHROPIC_AUTH_TOKEN".to_string(),
        external_value: ext_token,
        internal_value: int_token,
        is_consistent: token_consistent,
        reason: if token_consistent { "令牌一致".to_string() } else { "令牌不一致或缺失".to_string() },
    });

    // 2. 检查ANTHROPIC_BASE_URL
    let ext_url = external_env.get("ANTHROPIC_BASE_URL").cloned();
    let int_url = internal_env_vars.get("ANTHROPIC_BASE_URL").cloned();
    let url_consistent = values_match(
        ext_url.as_deref(), 
        int_url.as_deref()
    );
    if !url_consistent { inconsistencies += 1; }
    
    comparison_details.push(ComparisonDetail {
        key: "ANTHROPIC_BASE_URL".to_string(),
        external_value: ext_url,
        internal_value: int_url,
        is_consistent: url_consistent,
        reason: if url_consistent { "地址一致".to_string() } else { "地址不一致或缺失".to_string() },
    });

    // 3. 检查ANTHROPIC_MODEL：从数据库获取真实的内部选择，而不是依赖localStorage
    let ext_model = external_env.get("ANTHROPIC_MODEL").cloned();
    
    // 🔧 关键修复：从数据库app_settings表获取真实的当前选择模型
    let real_internal_model = match crate::commands::storage::get_app_setting(
        app.clone(), 
        "current_selected_model".to_string()
    ).await {
        Ok(Some(stored_model)) if !stored_model.is_empty() => {
            log::info!("Retrieved real internal model from app_settings: {}", stored_model);
            Some(stored_model)
        },
        _ => {
            log::warn!("No current_selected_model found in app_settings database");
            None
        }
    };
    
    // 如果数据库中没有，尝试从环境变量中找到首选模型
    let effective_internal_model = real_internal_model.clone().or_else(|| {
        // 从当前启用的环境变量中找到首选模型（MID_1）
        for i in 1..=10 {
            let mid_key = format!("MID_{}", i);
            if let Some(model) = internal_env_vars.get(&mid_key) {
                if !model.trim().is_empty() {
                    log::info!("Using preferred model from environment variables: {}", model);
                    return Some(model.clone());
                }
            }
        }
        None
    });
    
    let model_consistent = match (&ext_model, &effective_internal_model) {
        (Some(settings_model), Some(internal_model)) => settings_model == internal_model,
        (None, None) => true, // 都没有值，认为一致
        _ => false, // 一个有值一个没有，不一致
    };
    
    if !model_consistent { inconsistencies += 1; }
    
    let model_reason = match (&ext_model, &effective_internal_model) {
        (Some(settings_model), Some(internal_model)) if settings_model == internal_model => 
            "模型一致".to_string(),
        (Some(settings_model), Some(internal_model)) => 
            format!("模型不一致：工具选择='{}', 配置文件='{}'", internal_model, settings_model),
        (Some(_), None) => 
            "工具内部未选择模型".to_string(),
        (None, Some(_)) => 
            "配置文件缺少ANTHROPIC_MODEL".to_string(),
        (None, None) => 
            "模型配置缺失".to_string(),
    };
    
    comparison_details.push(ComparisonDetail {
        key: "ANTHROPIC_MODEL".to_string(),
        external_value: ext_model,
        internal_value: effective_internal_model, // 🔧 使用真实的数据库值，而不是localStorage
        is_consistent: model_consistent,
        reason: model_reason,
    });

    let needs_refresh = inconsistencies > 0;

    Ok(DetailedConfigStatus {
        needs_refresh,
        message: if needs_refresh {
            format!("发现 {} 个配置不一致", inconsistencies)
        } else {
            "所有配置参数都一致".to_string()
        },
        external_env,
        internal_vars: internal_env_vars,
        comparison_details,
    })
}

/// 获取用户当前选择的模型（从localStorage读取）
#[tauri::command]
pub async fn get_current_selected_model_from_storage(_app: AppHandle) -> Result<Option<String>, String> {
    // 这个需要在前端调用，因为localStorage在Rust中无法直接访问
    // 所以这个函数实际上不会被使用，逻辑在前端处理
    Ok(None)
}

/// 检查配置一致性（简化版）
#[tauri::command] 
pub async fn check_config_consistency_simple(
    app: AppHandle,
    current_selected_model: String,
) -> Result<ConfigStatus, String> {
    use crate::commands::agents::{AgentDb, get_enabled_environment_variables};

    log::info!("Settings monitor: Checking consistency for current model: {}", current_selected_model);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");
    
    if !settings_path.exists() {
        log::debug!("Settings monitor: No settings file found");
        return Ok(ConfigStatus {
            needs_refresh: true,
            message: "配置文件不存在，需要刷新".to_string(),
        });
    }

    // 读取settings.json中的配置
    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    
    let external_config: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or_else(|_| {
            log::warn!("Settings monitor: Failed to parse JSON");
            serde_json::json!({})
        });

    let external_env = external_config
        .get("env")
        .and_then(|e| e.as_object());

    if external_env.is_none() {
        log::info!("Settings monitor: No env section in settings.json");
        return Ok(ConfigStatus {
            needs_refresh: true,
            message: "配置文件缺少环境配置，需要刷新".to_string(),
        });
    }

    let ext_env = external_env.unwrap();
    
    // 获取数据库中的环境变量
    let db_state = app.state::<AgentDb>();
    let internal_env_vars = get_enabled_environment_variables(db_state).await
        .unwrap_or_default();

    // 简单检查：比较当前选择的模型与settings.json中的ANTHROPIC_MODEL
    let settings_model = ext_env.get("ANTHROPIC_MODEL").and_then(|v| v.as_str());
    let settings_token = ext_env.get("ANTHROPIC_AUTH_TOKEN").and_then(|v| v.as_str());
    let settings_url = ext_env.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str());

    log::info!("Settings monitor: settings.json has - model: {:?}, token: {:?}, url: {:?}", 
              settings_model, settings_token, settings_url);

    let db_token = internal_env_vars.get("ANTHROPIC_AUTH_TOKEN");
    let db_url = internal_env_vars.get("ANTHROPIC_BASE_URL");

    log::info!("Settings monitor: database has - token: {:?}, url: {:?}", db_token, db_url);

    let mut inconsistencies = Vec::new();

    // 1. 检查模型
    if let Some(settings_model_val) = settings_model {
        if settings_model_val != current_selected_model {
            inconsistencies.push(format!("模型不一致: 工具选择='{}', 配置文件='{}'", current_selected_model, settings_model_val));
        }
    } else {
        inconsistencies.push("配置文件缺少ANTHROPIC_MODEL".to_string());
    }

    // 2. 检查令牌
    match (settings_token, db_token) {
        (Some(s), Some(d)) if s != d => {
            inconsistencies.push("认证令牌不一致".to_string());
        }
        (Some(_), None) => {
            inconsistencies.push("数据库缺少认证令牌".to_string());
        }
        (None, Some(_)) => {
            inconsistencies.push("配置文件缺少认证令牌".to_string());
        }
        _ => {} // 一致或都为空
    }

    // 3. 检查URL
    match (settings_url, db_url) {
        (Some(s), Some(d)) if s != d => {
            inconsistencies.push("API地址不一致".to_string());
        }
        (Some(_), None) => {
            inconsistencies.push("数据库缺少API地址".to_string());
        }
        (None, Some(_)) => {
            inconsistencies.push("配置文件缺少API地址".to_string());
        }
        _ => {} // 一致或都为空
    }

    let needs_refresh = !inconsistencies.is_empty();

    if needs_refresh {
        log::info!("Settings monitor: Found inconsistencies: {:?}", inconsistencies);
    } else {
        log::info!("Settings monitor: All parameters are consistent");
    }

    Ok(ConfigStatus {
        needs_refresh,
        message: if needs_refresh {
            "检测到配置不一致，请刷新后继续使用".to_string()
        } else {
            "配置一致".to_string()
        },
    })
}

/// 辅助函数：检查两个值是否匹配
fn values_match(external: Option<&str>, internal: Option<&str>) -> bool {
    match (external, internal) {
        (Some(ext), Some(int)) => ext == int,
        (None, None) => true,
        _ => false,
    }
}

 