use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AppLanguage {
    Fa,
    En,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AppTheme {
    Obsidian,
    Bikinibottom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMode {
    Manual,
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionUserInfo {
    pub upload_bytes: u64,
    pub download_bytes: u64,
    pub total_bytes: u64,
    pub expire_timestamp_sec: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_interval_hours: Option<u32>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSecretRecord {
    pub id: String,
    pub remark: String,
    pub address: String,
    pub port: u16,
    pub uuid: String,
    pub encryption: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flow: Option<String>,
    pub network: String,
    pub security: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sni: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pbk: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spx: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alpn: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_insecure: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_header: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grpc_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
    pub country_code: String,
    pub country_name_fa: String,
    pub country_name_en: String,
    pub raw_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicServerInfo {
    pub id: String,
    pub remark: String,
    pub country_code: String,
    pub country_name_fa: String,
    pub country_name_en: String,
    pub network: String,
    pub security: String,
    pub is_pinned: bool,
    pub latency_ms: Option<u32>,
    pub healthy: bool,
    pub last_checked_at: Option<i64>,
    pub consecutive_failures: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BandwidthPoint {
    pub ts: i64,
    pub upload_bps: u64,
    pub download_bps: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrafficStatsSnapshot {
    pub upload_bps: u64,
    pub download_bps: u64,
    pub peak_upload_bps: u64,
    pub peak_download_bps: u64,
    pub session_upload_bytes: u64,
    pub session_download_bytes: u64,
    pub history: Vec<BandwidthPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaAlertState {
    pub should_alert: bool,
    pub percent_used: Option<f64>,
    pub days_remaining: Option<f64>,
    pub is_expired: bool,
    pub is_over80_percent: bool,
    pub is_expiring_soon: bool,
    pub used_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub language: AppLanguage,
    pub theme: AppTheme,
    pub socks_port: u16,
    pub http_port: u16,
    pub enable_system_proxy: bool,
    pub bypass_lan: bool,
    pub auto_best_server: bool,
    pub latency_check_interval_sec: u64,
    pub health_check_interval_sec: u64,
    pub fallback_failure_threshold: u32,
    pub auto_update_on_launch: bool,
    pub auto_install_update_on_launch: bool,
    pub minimize_to_tray_on_close: bool,
    pub custom_sponge_mascot_data_url: Option<String>,
    pub custom_crab_mascot_data_url: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: AppLanguage::Fa,
            theme: AppTheme::Obsidian,
            socks_port: 10808,
            http_port: 10809,
            enable_system_proxy: true,
            bypass_lan: true,
            auto_best_server: true,
            latency_check_interval_sec: 45,
            health_check_interval_sec: 15,
            fallback_failure_threshold: 3,
            auto_update_on_launch: true,
            auto_install_update_on_launch: true,
            minimize_to_tray_on_close: true,
            custom_sponge_mascot_data_url: None,
            custom_crab_mascot_data_url: None,
        }
    }
}

fn deserialize_double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsPatch {
    pub language: Option<AppLanguage>,
    pub theme: Option<AppTheme>,
    pub socks_port: Option<u16>,
    pub http_port: Option<u16>,
    pub enable_system_proxy: Option<bool>,
    pub bypass_lan: Option<bool>,
    pub auto_best_server: Option<bool>,
    pub latency_check_interval_sec: Option<u64>,
    pub health_check_interval_sec: Option<u64>,
    pub fallback_failure_threshold: Option<u32>,
    pub auto_update_on_launch: Option<bool>,
    pub auto_install_update_on_launch: Option<bool>,
    pub minimize_to_tray_on_close: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub custom_sponge_mascot_data_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub custom_crab_mascot_data_url: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub stage: String,
    pub current_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub connection_state: ConnectionState,
    pub connection_mode: ConnectionMode,
    pub active_server_id: Option<String>,
    pub selected_server_id: Option<String>,
    pub has_subscription_url: bool,
    pub masked_subscription_url: String,
    pub servers: Vec<PublicServerInfo>,
    pub user_info: Option<SubscriptionUserInfo>,
    pub quota_alert: Option<QuotaAlertState>,
    pub traffic: TrafficStatsSnapshot,
    pub settings: AppSettings,
    pub update_status: UpdateStatus,
    pub error_message: Option<String>,
    pub xray_available: bool,
    pub xray_version: Option<String>,
    pub connected_since: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionImportResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub needs_password: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_password: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppToast {
    pub id: String,
    pub level: String,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeLogEntry {
    pub ts: i64,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowControlsState {
    pub is_maximized: bool,
    pub is_full_screen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickMascotResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
}
