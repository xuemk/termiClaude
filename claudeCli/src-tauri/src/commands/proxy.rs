use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;

use crate::commands::agents::AgentDb;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProxySettings {
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<String>,
    pub all_proxy: Option<String>,
    pub enabled: bool,
}

impl Default for ProxySettings {
    fn default() -> Self {
        Self {
            http_proxy: None,
            https_proxy: None,
            no_proxy: None,
            all_proxy: None,
            enabled: false,
        }
    }
}

/// Get proxy settings from the database
#[tauri::command]
pub async fn get_proxy_settings(db: State<'_, AgentDb>) -> Result<ProxySettings, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    let mut settings = ProxySettings::default();
    
    // Query each proxy setting
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
            params![db_key],
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
    
    Ok(settings)
}

/// Save proxy settings to the database
#[tauri::command]
pub async fn save_proxy_settings(
    db: State<'_, AgentDb>,
    settings: ProxySettings,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    // Save each setting
    let values = vec![
        ("proxy_enabled", settings.enabled.to_string()),
        ("proxy_http", settings.http_proxy.clone().unwrap_or_default()),
        ("proxy_https", settings.https_proxy.clone().unwrap_or_default()),
        ("proxy_no", settings.no_proxy.clone().unwrap_or_default()),
        ("proxy_all", settings.all_proxy.clone().unwrap_or_default()),
    ];
    
    for (key, value) in values {
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        ).map_err(|e| format!("Failed to save {}: {}", key, e))?;
    }
    
    // Apply the proxy settings immediately to the current process
    apply_proxy_settings(&settings);
    
    Ok(())
}

/// Apply proxy settings as environment variables
pub fn apply_proxy_settings(settings: &ProxySettings) {
    log::info!("Applying proxy settings: enabled={}", settings.enabled);
    
    if !settings.enabled {
        // Clear proxy environment variables if disabled
        log::info!("Clearing proxy environment variables");
        std::env::remove_var("HTTP_PROXY");
        std::env::remove_var("HTTPS_PROXY");
        std::env::remove_var("NO_PROXY");
        std::env::remove_var("ALL_PROXY");
        // Also clear lowercase versions
        std::env::remove_var("http_proxy");
        std::env::remove_var("https_proxy");
        std::env::remove_var("no_proxy");
        std::env::remove_var("all_proxy");
        return;
    }
    
    // Ensure NO_PROXY includes localhost by default
    let mut no_proxy_list = vec!["localhost", "127.0.0.1", "::1", "0.0.0.0"];
    if let Some(user_no_proxy) = &settings.no_proxy {
        if !user_no_proxy.is_empty() {
            no_proxy_list.push(user_no_proxy.as_str());
        }
    }
    let no_proxy_value = no_proxy_list.join(",");
    
    // Set proxy environment variables (uppercase is standard)
    if let Some(http_proxy) = &settings.http_proxy {
        if !http_proxy.is_empty() {
            log::info!("Setting HTTP_PROXY={}", http_proxy);
            std::env::set_var("HTTP_PROXY", http_proxy);
        }
    }
    
    if let Some(https_proxy) = &settings.https_proxy {
        if !https_proxy.is_empty() {
            log::info!("Setting HTTPS_PROXY={}", https_proxy);
            std::env::set_var("HTTPS_PROXY", https_proxy);
        }
    }
    
    // Always set NO_PROXY to include localhost
    log::info!("Setting NO_PROXY={}", no_proxy_value);
    std::env::set_var("NO_PROXY", &no_proxy_value);
    
    if let Some(all_proxy) = &settings.all_proxy {
        if !all_proxy.is_empty() {
            log::info!("Setting ALL_PROXY={}", all_proxy);
            std::env::set_var("ALL_PROXY", all_proxy);
        }
    }
    
    // Log current proxy environment variables for debugging
    log::info!("Current proxy environment variables:");
    for (key, value) in std::env::vars() {
        if key.contains("PROXY") || key.contains("proxy") {
            log::info!("  {}={}", key, value);
        }
    }
}

/// Test proxy connection to verify if proxy settings work
#[tauri::command]
pub async fn test_proxy_connection(settings: ProxySettings) -> Result<String, String> {
    log::info!("Testing proxy connection with settings: {:?}", settings);
    
    if !settings.enabled {
        return Ok("代理已禁用，无需测试".to_string());
    }
    
    // 临时应用代理设置
    apply_proxy_settings(&settings);
    
    // 创建HTTP客户端使用代理设置
    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10));
    
    // 设置代理
    if let Some(https_proxy_url) = &settings.https_proxy {
        match reqwest::Proxy::https(https_proxy_url) {
            Ok(proxy) => {
                client_builder = client_builder.proxy(proxy);
                log::info!("Added HTTPS proxy: {}", https_proxy_url);
            },
            Err(e) => {
                return Err(format!("HTTPS代理URL格式错误: {}", e));
            }
        }
    }
    
    if let Some(http_proxy_url) = &settings.http_proxy {
        match reqwest::Proxy::http(http_proxy_url) {
            Ok(proxy) => {
                client_builder = client_builder.proxy(proxy);
                log::info!("Added HTTP proxy: {}", http_proxy_url);
            },
            Err(e) => {
                return Err(format!("HTTP代理URL格式错误: {}", e));
            }
        }
    }
    
    if let Some(all_proxy_url) = &settings.all_proxy {
        match reqwest::Proxy::all(all_proxy_url) {
            Ok(proxy) => {
                client_builder = client_builder.proxy(proxy);
                log::info!("Added ALL proxy: {}", all_proxy_url);
            },
            Err(e) => {
                return Err(format!("ALL代理URL格式错误: {}", e));
            }
        }
    }
    
    let client = client_builder.build().map_err(|e| {
        format!("创建HTTP客户端失败: {}", e)
    })?;
    
    // 测试连接多个目标
    let test_urls = vec![
        ("检测IP", "https://httpbin.org/ip"),
        ("Anthropic API", "https://api.anthropic.com/v1"),
        ("OpenAI API", "https://api.openai.com/v1"),
        ("anyrouter.top", "https://anyrouter.top"),
    ];
    
    let mut results = Vec::new();
    
    for (name, url) in test_urls {
        log::info!("Testing connection to: {} ({})", name, url);
        match client.get(url).send().await {
            Ok(response) => {
                let status = response.status();
                let success = status.is_success() || status.as_u16() == 401 || status.as_u16() == 403;
                
                if success {
                    results.push(format!("✅ {}: 连接成功 ({})", name, status));
                } else {
                    results.push(format!("⚠️ {}: HTTP {} (可能需要认证)", name, status));
                }
                log::info!("Response from {} ({}): {}", name, url, status);
            },
            Err(e) => {
                results.push(format!("❌ {}: 连接失败 - {}", name, e));
                log::error!("Failed to connect to {} ({}): {}", name, url, e);
            }
        }
    }
    
    let result_text = format!(
        "代理测试结果:\n\n{}\n\n当前代理配置:\n- HTTP: {:?}\n- HTTPS: {:?}\n- ALL: {:?}\n- NO_PROXY: {:?}",
        results.join("\n"),
        settings.http_proxy,
        settings.https_proxy, 
        settings.all_proxy,
        settings.no_proxy
    );
    
    Ok(result_text)
}