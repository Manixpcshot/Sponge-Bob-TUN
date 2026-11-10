use crate::latency::{
    check_proxy_egress_health, measure_all_servers, pick_best_server, LatencyCheckResult,
};
use crate::log_sanitizer::{
    mask_url_for_display, now_millis, register_secret, register_secrets_from_servers,
    sanitize_log_message, SafeLogger,
};
use crate::npvs_codec::{decode_npvs_or_subscription_payload, export_npvs_payload, NpvsStatus};
use crate::secure_store::{SecureVaultStore, VaultState};
use crate::subscription::{evaluate_quota_alert, fetch_subscription_from_url, FetchStatus};
use crate::system_proxy::SystemProxyManager;
use crate::types::{
    AppLanguage, AppSettingsPatch, AppSnapshot, AppToast, BandwidthPoint, ConnectResult,
    ConnectionMode, ConnectionState, PublicServerInfo, QuotaAlertState, SafeLogEntry,
    ServerSecretRecord, SubscriptionImportResult, TrafficStatsSnapshot, UpdateStatus,
};
use crate::updater::UpdaterService;
use crate::xray_manager::XrayManager;
use crate::xray_stats::query_xray_traffic_stats;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub trait ControllerEvents: Send + Sync {
    fn on_snapshot(&self, snapshot: AppSnapshot);
    fn on_toast(&self, toast: AppToast);
    fn on_tray_state(&self, state: ConnectionState, has_quota_alert: bool);
}

#[derive(Debug, Clone)]
struct RuntimeServerMetric {
    latency_ms: Option<u32>,
    healthy: bool,
    last_checked_at: Option<i64>,
    consecutive_failures: u32,
}

struct MutableControllerState {
    vault: VaultState,
    connection_state: ConnectionState,
    connection_mode: ConnectionMode,
    active_server_id: Option<String>,
    error_message: Option<String>,
    connected_since: Option<i64>,
    quota_alert: Option<QuotaAlertState>,
    last_notified_alert_key: Option<String>,
    metrics: HashMap<String, RuntimeServerMetric>,
    failed_in_cycle: HashSet<String>,
    active_consecutive_failures: u32,
    traffic: TrafficStatsSnapshot,
    last_sample_ms: i64,
    last_up_total: u64,
    last_down_total: u64,
}

pub struct AppController {
    data_dir: PathBuf,
    store: SecureVaultStore,
    logger: Arc<SafeLogger>,
    xray: Arc<XrayManager>,
    system_proxy: Arc<SystemProxyManager>,
    updater: Arc<UpdaterService>,
    events: Arc<dyn ControllerEvents>,
    state: Mutex<MutableControllerState>,
    connecting_lock: tokio::sync::Mutex<()>,
    latency_running: AtomicBool,
    shutting_down: AtomicBool,
}

impl AppController {
    pub fn new(
        data_dir: PathBuf,
        resource_dir: Option<PathBuf>,
        app_version: String,
        events: Arc<dyn ControllerEvents>,
    ) -> Arc<Self> {
        let logger = Arc::new(SafeLogger::new());
        let store = SecureVaultStore::new(&data_dir);
        let vault = store.load();
        let connection_mode = if vault.settings.auto_best_server {
            ConnectionMode::Auto
        } else {
            ConnectionMode::Manual
        };

        let system_proxy = Arc::new(SystemProxyManager::new(&data_dir));
        let xray = Arc::new(XrayManager::new(
            logger.clone(),
            data_dir.clone(),
            resource_dir,
        ));

        let events_for_upd = events.clone();
        let xray_for_upd = xray.clone();
        let proxy_for_upd = system_proxy.clone();

        let ctrl_weak: Arc<Mutex<Option<std::sync::Weak<AppController>>>> =
            Arc::new(Mutex::new(None));
        let ctrl_weak_upd = ctrl_weak.clone();

        let updater = Arc::new(UpdaterService::new(
            logger.clone(),
            app_version,
            Arc::new(move |_st| {
                if let Some(weak) = ctrl_weak_upd.lock().ok().and_then(|g| g.clone()) {
                    if let Some(c) = weak.upgrade() {
                        c.emit_snapshot();
                    }
                }
            }),
            Arc::new(move || {
                xray_for_upd.stop();
                let _ = proxy_for_upd.disable_and_restore();
            }),
        ));

        let quota_alert = evaluate_quota_alert(vault.user_info.as_ref(), now_millis());

        let controller = Arc::new(Self {
            data_dir,
            store,
            logger,
            xray,
            system_proxy,
            updater,
            events: events_for_upd,
            state: Mutex::new(MutableControllerState {
                vault,
                connection_state: ConnectionState::Disconnected,
                connection_mode,
                active_server_id: None,
                error_message: None,
                connected_since: None,
                quota_alert,
                last_notified_alert_key: None,
                metrics: HashMap::new(),
                failed_in_cycle: HashSet::new(),
                active_consecutive_failures: 0,
                traffic: TrafficStatsSnapshot::default(),
                last_sample_ms: 0,
                last_up_total: 0,
                last_down_total: 0,
            }),
            connecting_lock: tokio::sync::Mutex::new(()),
            latency_running: AtomicBool::new(false),
            shutting_down: AtomicBool::new(false),
        });

        if let Ok(mut w) = ctrl_weak.lock() {
            *w = Some(Arc::downgrade(&controller));
        }

        controller
    }

    pub fn spawn_background_loops(self: &Arc<Self>) {
        self.system_proxy.recover_if_dirty();

        // Initial latency probe
        let c1 = self.clone();
        tauri::async_runtime::spawn(async move {
            c1.probe_all_latencies().await;
        });

        // Auto-update check on launch
        let c2 = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(1800)).await;
            if c2.shutting_down.load(Ordering::Relaxed) {
                return;
            }
            let (auto_chk, auto_inst) = {
                let g = c2.state.lock().unwrap();
                (
                    g.vault.settings.auto_update_on_launch,
                    g.vault.settings.auto_install_update_on_launch,
                )
            };
            if auto_chk {
                let temp_dir = c2.data_dir.join("updates");
                let _ = c2.updater.check_for_updates(auto_inst, &temp_dir).await;
            }
        });

        // 1s stats & unexpected exit watcher loop
        let c3 = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(1));
            loop {
                ticker.tick().await;
                if c3.shutting_down.load(Ordering::Relaxed) {
                    break;
                }
                c3.tick_stats_and_process().await;
            }
        });

        // Dynamic latency scan loop
        let c4 = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                let interval_sec = {
                    let g = c4.state.lock().unwrap();
                    g.vault.settings.latency_check_interval_sec.max(15)
                };
                tokio::time::sleep(Duration::from_secs(interval_sec)).await;
                if c4.shutting_down.load(Ordering::Relaxed) {
                    break;
                }
                c4.probe_all_latencies().await;
            }
        });

        // Dynamic active proxy health & smart fallback loop
        let c5 = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                let interval_sec = {
                    let g = c5.state.lock().unwrap();
                    g.vault.settings.health_check_interval_sec.max(5)
                };
                tokio::time::sleep(Duration::from_secs(interval_sec)).await;
                if c5.shutting_down.load(Ordering::Relaxed) {
                    break;
                }
                c5.tick_health_check().await;
            }
        });
    }

    pub fn get_snapshot(&self) -> AppSnapshot {
        let g = self.state.lock().unwrap();
        let pinned_set: HashSet<&String> = g.vault.pinned_ids.iter().collect();

        let mut servers: Vec<PublicServerInfo> = g
            .vault
            .servers
            .iter()
            .map(|s| {
                let m = g.metrics.get(&s.id);
                PublicServerInfo {
                    id: s.id.clone(),
                    remark: s.remark.clone(),
                    country_code: s.country_code.clone(),
                    country_name_fa: s.country_name_fa.clone(),
                    country_name_en: s.country_name_en.clone(),
                    network: s.network.clone(),
                    security: s.security.clone(),
                    is_pinned: pinned_set.contains(&s.id),
                    latency_ms: m.and_then(|x| x.latency_ms),
                    healthy: m.map(|x| x.healthy).unwrap_or(true),
                    last_checked_at: m.and_then(|x| x.last_checked_at),
                    consecutive_failures: m.map(|x| x.consecutive_failures).unwrap_or(0),
                }
            })
            .collect();

        servers.sort_by_key(|s| if s.is_pinned { 0 } else { 1 });

        AppSnapshot {
            connection_state: g.connection_state.clone(),
            connection_mode: g.connection_mode.clone(),
            active_server_id: g.active_server_id.clone(),
            selected_server_id: g.vault.selected_server_id.clone(),
            has_subscription_url: !g.vault.subscription_url.is_empty(),
            masked_subscription_url: mask_url_for_display(&g.vault.subscription_url),
            servers,
            user_info: g.vault.user_info.clone(),
            quota_alert: g.quota_alert.clone(),
            traffic: g.traffic.clone(),
            settings: g.vault.settings.clone(),
            update_status: self.updater.get_status(),
            error_message: g.error_message.clone(),
            xray_available: self.xray.is_binary_available(),
            xray_version: self.xray.get_version(),
            connected_since: g.connected_since,
        }
    }

    fn emit_snapshot(&self) {
        let snap = self.get_snapshot();
        let conn = snap.connection_state.clone();
        let has_alert = snap
            .quota_alert
            .as_ref()
            .map(|a| a.should_alert)
            .unwrap_or(false);
        self.events.on_snapshot(snap);
        self.events.on_tray_state(conn, has_alert);
    }

    fn emit_toast(&self, level: &str, title_fa: &str, title_en: &str, msg_fa: &str, msg_en: &str) {
        let is_fa = self
            .state
            .lock()
            .map(|g| g.vault.settings.language == AppLanguage::Fa)
            .unwrap_or(true);
        self.events.on_toast(AppToast {
            id: format!("{}-{}", now_millis(), rand::random::<u32>()),
            level: level.to_string(),
            title: if is_fa { title_fa } else { title_en }.to_string(),
            message: if is_fa { msg_fa } else { msg_en }.to_string(),
        });
    }

    fn localize_error(&self, code: &str) -> String {
        let is_fa = self
            .state
            .lock()
            .map(|g| g.vault.settings.language == AppLanguage::Fa)
            .unwrap_or(true);
        let mapped = match code {
            "SUBSCRIPTION_URL_EMPTY" => Some((
                "لطفاً لینک اشتراک را وارد کنید.",
                "Please enter a subscription URL.",
            )),
            "SUBSCRIPTION_URL_INVALID_SCHEME" => Some((
                "لینک اشتراک باید با http یا https شروع شود.",
                "Subscription URL must start with http:// or https://.",
            )),
            "SUBSCRIPTION_URL_INVALID" => Some((
                "فرمت لینک اشتراک معتبر نیست.",
                "Invalid subscription URL format.",
            )),
            "SUBSCRIPTION_TIMEOUT" => Some((
                "زمان دریافت اشتراک به پایان رسید. اتصال اینترنت را بررسی کنید.",
                "Subscription request timed out. Please check your internet connection.",
            )),
            "SUBSCRIPTION_NETWORK_ERROR" => Some((
                "خطا در برقراری ارتباط برای دریافت اشتراک.",
                "Network error while fetching subscription.",
            )),
            "INVALID_PASSWORD" => Some((
                "رمز عبور وارد شده اشتباه است.",
                "Incorrect password.",
            )),
            "NO_VLESS_FOUND" => Some((
                "هیچ کانفیگ معتبر VLESS در محتوای دریافتی پیدا نشد.",
                "No valid VLESS configurations were found.",
            )),
            "NO_SERVERS" => Some((
                "هیچ سروری در فهرست موجود نیست. ابتدا اشتراک یا فایل npvs را وارد کنید.",
                "No servers available. Import a subscription URL or .npvs file first.",
            )),
            _ => None,
        };
        if let Some((fa, en)) = mapped {
            return if is_fa { fa } else { en }.to_string();
        }
        if let Some(http_code) = code.strip_prefix("SUBSCRIPTION_HTTP_") {
            return if is_fa {
                format!("سرور اشتراک کد خطای {} برگرداند.", http_code)
            } else {
                format!("Subscription server returned HTTP {}.", http_code)
            };
        }
        sanitize_log_message(code)
    }

    fn recompute_quota_alert_locked(g: &mut MutableControllerState, notify: bool) -> Option<QuotaAlertState> {
        let alert = evaluate_quota_alert(g.vault.user_info.as_ref(), now_millis());
        g.quota_alert = alert.clone();
        let Some(ref a) = alert else {
            g.last_notified_alert_key = None;
            return None;
        };
        if !a.should_alert {
            g.last_notified_alert_key = None;
            return None;
        }
        if notify {
            let key = format!(
                "{}-{}-{}",
                if a.is_over80_percent { "80" } else { "" },
                if a.is_expired {
                    "exp"
                } else if a.is_expiring_soon {
                    "soon"
                } else {
                    ""
                },
                a.percent_used.unwrap_or(0.0).floor() as i64
            );
            if g.last_notified_alert_key.as_deref() != Some(key.as_str()) {
                g.last_notified_alert_key = Some(key);
                return alert;
            }
        }
        None
    }

    fn maybe_notify_quota_toast(&self, alert: QuotaAlertState) {
        let pct_text = alert
            .percent_used
            .map(|p| format!("{}%", p.round() as i64))
            .unwrap_or_default();
        let days_text = alert
            .days_remaining
            .map(|d| format!("{}", d.ceil().max(0.0) as i64))
            .unwrap_or_default();

        if alert.is_expired {
            self.emit_toast(
                "warning",
                "هشدار انقضای اشتراک",
                "Subscription Expired",
                "اعتبار زمانی اشتراک شما به پایان رسیده است.",
                "Your subscription validity has expired.",
            );
        } else if alert.is_over80_percent && alert.is_expiring_soon {
            self.emit_toast(
                "warning",
                "هشدار حجم و زمان اشتراک",
                "Quota & Expiry Alert",
                &format!(
                    "مصرف به {} رسیده و کمتر از {} روز به پایان باقی مانده است.",
                    pct_text, days_text
                ),
                &format!(
                    "Data usage reached {} with less than {} day(s) remaining.",
                    pct_text, days_text
                ),
            );
        } else if alert.is_over80_percent {
            self.emit_toast(
                "warning",
                "هشدار مصرف بیش از ۸۰٪",
                "Data Usage Over 80%",
                &format!("{} از حجم اشتراک شما مصرف شده است.", pct_text),
                &format!("You have used {} of your subscription quota.", pct_text),
            );
        } else if alert.is_expiring_soon {
            self.emit_toast(
                "warning",
                "هشدار نزدیک شدن به انقضا",
                "Expiring Soon",
                &format!("کمتر از {} روز تا انقضای اشتراک باقی مانده است.", days_text),
                &format!(
                    "Less than {} day(s) remaining before subscription expires.",
                    days_text
                ),
            );
        }
    }

    pub fn get_subscription_url(&self) -> String {
        self.state.lock().unwrap().vault.subscription_url.clone()
    }

    pub async fn update_subscription(
        self: &Arc<Self>,
        url: Option<String>,
        password: Option<String>,
    ) -> SubscriptionImportResult {
        let target_url = match url {
            Some(u) => u.trim().to_string(),
            None => self.state.lock().unwrap().vault.subscription_url.trim().to_string(),
        };
        if target_url.is_empty() {
            return SubscriptionImportResult {
                ok: false,
                needs_password: None,
                invalid_password: None,
                server_count: None,
                error: Some(self.localize_error("SUBSCRIPTION_URL_EMPTY")),
                canceled: None,
            };
        }

        register_secret(&target_url);
        let res = fetch_subscription_from_url(&target_url, password.as_deref()).await;

        match res.status {
            FetchStatus::NeedsPassword => SubscriptionImportResult {
                ok: false,
                needs_password: Some(true),
                invalid_password: None,
                server_count: None,
                error: None,
                canceled: None,
            },
            FetchStatus::InvalidPassword => SubscriptionImportResult {
                ok: false,
                needs_password: None,
                invalid_password: Some(true),
                server_count: None,
                error: Some(self.localize_error("INVALID_PASSWORD")),
                canceled: None,
            },
            FetchStatus::Error => {
                let msg = self.localize_error(
                    res.error_code
                        .as_deref()
                        .unwrap_or("SUBSCRIPTION_NETWORK_ERROR"),
                );
                {
                    let mut g = self.state.lock().unwrap();
                    g.error_message = Some(msg.clone());
                }
                self.emit_snapshot();
                SubscriptionImportResult {
                    ok: false,
                    needs_password: None,
                    invalid_password: None,
                    server_count: None,
                    error: Some(msg),
                    canceled: None,
                }
            }
            FetchStatus::Ok => {
                let count = res.servers.len();
                let valid_ids: HashSet<String> = res.servers.iter().map(|s| s.id.clone()).collect();
                let notify_alert = {
                    let mut g = self.state.lock().unwrap();
                    g.vault.subscription_url = target_url;
                    g.vault.servers = res.servers;
                    g.vault.pinned_ids.retain(|id| valid_ids.contains(id));
                    if let Some(sel) = &g.vault.selected_server_id {
                        if !valid_ids.contains(sel) {
                            g.vault.selected_server_id =
                                g.vault.servers.first().map(|s| s.id.clone());
                        }
                    } else {
                        g.vault.selected_server_id =
                            g.vault.servers.first().map(|s| s.id.clone());
                    }
                    if let Some(ui) = res.user_info {
                        g.vault.user_info = Some(ui);
                    }
                    g.error_message = None;
                    self.store.save(&g.vault);
                    Self::recompute_quota_alert_locked(&mut g, true)
                };

                if let Some(alert) = notify_alert {
                    self.maybe_notify_quota_toast(alert);
                }
                self.emit_snapshot();

                let c = self.clone();
                tauri::async_runtime::spawn(async move {
                    c.probe_all_latencies().await;
                });

                SubscriptionImportResult {
                    ok: true,
                    needs_password: None,
                    invalid_password: None,
                    server_count: Some(count),
                    error: None,
                    canceled: None,
                }
            }
        }
    }

    pub fn import_bytes(
        self: &Arc<Self>,
        raw_bytes: &[u8],
        password: Option<&str>,
        merge: bool,
    ) -> SubscriptionImportResult {
        let decoded = decode_npvs_or_subscription_payload(raw_bytes, password);
        match decoded.status {
            NpvsStatus::NeedsPassword => SubscriptionImportResult {
                ok: false,
                needs_password: Some(true),
                invalid_password: None,
                server_count: None,
                error: None,
                canceled: None,
            },
            NpvsStatus::InvalidPassword => SubscriptionImportResult {
                ok: false,
                needs_password: None,
                invalid_password: Some(true),
                server_count: None,
                error: Some(self.localize_error("INVALID_PASSWORD")),
                canceled: None,
            },
            NpvsStatus::Unsupported => SubscriptionImportResult {
                ok: false,
                needs_password: None,
                invalid_password: None,
                server_count: None,
                error: Some(
                    self.localize_error(decoded.error_code.as_deref().unwrap_or("NO_VLESS_FOUND")),
                ),
                canceled: None,
            },
            NpvsStatus::Ok => {
                register_secrets_from_servers(&decoded.servers);
                let count = decoded.servers.len();
                {
                    let mut g = self.state.lock().unwrap();
                    if merge && !g.vault.servers.is_empty() {
                        let mut existing: HashMap<String, usize> = HashMap::new();
                        for (idx, srv) in g.vault.servers.iter().enumerate() {
                            existing.insert(srv.id.clone(), idx);
                        }
                        for srv in decoded.servers {
                            if let Some(&idx) = existing.get(&srv.id) {
                                g.vault.servers[idx] = srv;
                            } else {
                                existing.insert(srv.id.clone(), g.vault.servers.len());
                                g.vault.servers.push(srv);
                            }
                        }
                    } else {
                        g.vault.servers = decoded.servers;
                    }

                    let valid: HashSet<String> =
                        g.vault.servers.iter().map(|s| s.id.clone()).collect();
                    if g.vault
                        .selected_server_id
                        .as_ref()
                        .map(|id| !valid.contains(id))
                        .unwrap_or(true)
                    {
                        g.vault.selected_server_id = g.vault.servers.first().map(|s| s.id.clone());
                    }
                    g.error_message = None;
                    self.store.save(&g.vault);
                }

                self.emit_snapshot();
                let c = self.clone();
                tauri::async_runtime::spawn(async move {
                    c.probe_all_latencies().await;
                });

                SubscriptionImportResult {
                    ok: true,
                    needs_password: None,
                    invalid_password: None,
                    server_count: Some(count),
                    error: None,
                    canceled: None,
                }
            }
        }
    }

    pub fn export_npvs_to_file(&self, path: &Path, password: Option<&str>) -> bool {
        let servers = {
            let g = self.state.lock().unwrap();
            g.vault.servers.clone()
        };
        if servers.is_empty() {
            return false;
        }
        let payload = export_npvs_payload(&servers, password);
        fs::write(path, payload).is_ok()
    }

    pub fn clear_subscription(&self) -> AppSnapshot {
        {
            let mut g = self.state.lock().unwrap();
            g.vault.subscription_url.clear();
            g.vault.servers.clear();
            g.vault.pinned_ids.clear();
            g.vault.selected_server_id = None;
            g.vault.user_info = None;
            g.quota_alert = None;
            g.metrics.clear();
            self.store.save(&g.vault);
        }
        self.emit_snapshot();
        self.get_snapshot()
    }

    pub fn select_server(&self, server_id: Option<String>, mode: Option<ConnectionMode>) -> AppSnapshot {
        {
            let mut g = self.state.lock().unwrap();
            if let Some(m) = mode {
                g.vault.settings.auto_best_server = m == ConnectionMode::Auto;
                g.connection_mode = m;
            }
            if let Some(sid) = server_id {
                g.vault.selected_server_id = Some(sid);
            }
            self.store.save(&g.vault);
        }
        self.emit_snapshot();
        self.get_snapshot()
    }

    pub fn toggle_pin_server(&self, server_id: &str) -> AppSnapshot {
        {
            let mut g = self.state.lock().unwrap();
            if let Some(pos) = g.vault.pinned_ids.iter().position(|id| id == server_id) {
                g.vault.pinned_ids.remove(pos);
            } else {
                g.vault.pinned_ids.push(server_id.to_string());
            }
            self.store.save(&g.vault);
        }
        self.emit_snapshot();
        self.get_snapshot()
    }

    pub async fn probe_all_latencies(&self) {
        if self.latency_running.swap(true, Ordering::SeqCst) {
            return;
        }
        let servers = {
            let g = self.state.lock().unwrap();
            g.vault.servers.clone()
        };

        if !servers.is_empty() {
            let results: HashMap<String, LatencyCheckResult> =
                measure_all_servers(&servers, 8, 2200).await;
            {
                let mut g = self.state.lock().unwrap();
                for (id, info) in results {
                    let prev_fails = g
                        .metrics
                        .get(&id)
                        .map(|m| m.consecutive_failures)
                        .unwrap_or(0);
                    g.metrics.insert(
                        id,
                        RuntimeServerMetric {
                            latency_ms: info.latency_ms,
                            healthy: info.healthy,
                            last_checked_at: Some(info.checked_at),
                            consecutive_failures: if info.healthy { 0 } else { prev_fails },
                        },
                    );
                }
            }
            self.emit_snapshot();
        }
        self.latency_running.store(false, Ordering::SeqCst);
    }

    pub async fn connect(
        self: &Arc<Self>,
        mode_override: Option<ConnectionMode>,
        server_id_override: Option<String>,
    ) -> ConnectResult {
        let Ok(_guard) = self.connecting_lock.try_lock() else {
            return ConnectResult {
                ok: false,
                error: Some("CONNECT_IN_PROGRESS".to_string()),
            };
        };

        let server_count = {
            let mut g = self.state.lock().unwrap();
            if let Some(m) = mode_override {
                g.vault.settings.auto_best_server = m == ConnectionMode::Auto;
                g.connection_mode = m;
            }
            g.failed_in_cycle.clear();
            g.active_consecutive_failures = 0;
            g.error_message = None;
            g.vault.servers.len()
        };

        if server_count == 0 {
            let msg = self.localize_error("NO_SERVERS");
            self.state.lock().unwrap().error_message = Some(msg.clone());
            self.emit_snapshot();
            return ConnectResult {
                ok: false,
                error: Some(msg),
            };
        }

        self.state.lock().unwrap().connection_state = ConnectionState::Connecting;
        self.emit_snapshot();

        let (mode, has_measured) = {
            let g = self.state.lock().unwrap();
            let any_m = g
                .vault
                .servers
                .iter()
                .any(|s| g.metrics.get(&s.id).and_then(|m| m.last_checked_at).is_some());
            (g.connection_mode.clone(), any_m)
        };

        if mode == ConnectionMode::Auto && !has_measured {
            self.probe_all_latencies().await;
        }

        let target: Option<ServerSecretRecord> = {
            let snap = self.get_snapshot();
            let mut g = self.state.lock().unwrap();
            let chosen_id = if g.connection_mode == ConnectionMode::Auto {
                let pinned: HashSet<String> = g.vault.pinned_ids.iter().cloned().collect();
                let empty_ex = HashSet::new();
                pick_best_server(&snap.servers, &pinned, &empty_ex).map(|s| s.id.clone())
            } else {
                server_id_override.or_else(|| g.vault.selected_server_id.clone())
            };

            let srv = chosen_id
                .and_then(|id| g.vault.servers.iter().find(|s| s.id == id).cloned())
                .or_else(|| g.vault.servers.first().cloned());

            if let Some(ref s) = srv {
                g.vault.selected_server_id = Some(s.id.clone());
                self.store.save(&g.vault);
            }
            srv
        };

        let Some(srv) = target else {
            let msg = self.localize_error("NO_SERVERS");
            let mut g = self.state.lock().unwrap();
            g.connection_state = ConnectionState::Error;
            g.error_message = Some(msg.clone());
            self.emit_snapshot();
            return ConnectResult {
                ok: false,
                error: Some(msg),
            };
        };

        match self.start_tunnel_for_server(&srv) {
            Ok(()) => ConnectResult {
                ok: true,
                error: None,
            },
            Err(err) => {
                let clean = self.localize_error(&err);
                let _ = self.system_proxy.disable_and_restore();
                {
                    let mut g = self.state.lock().unwrap();
                    g.connection_state = ConnectionState::Error;
                    g.active_server_id = None;
                    g.connected_since = None;
                    g.error_message = Some(clean.clone());
                }
                self.emit_snapshot();
                ConnectResult {
                    ok: false,
                    error: Some(clean),
                }
            }
        }
    }

    fn start_tunnel_for_server(&self, server: &ServerSecretRecord) -> Result<(), String> {
        let settings = {
            let g = self.state.lock().unwrap();
            g.vault.settings.clone()
        };

        self.xray.start(server, &settings)?;

        if settings.enable_system_proxy {
            self.system_proxy
                .enable(settings.http_port, settings.bypass_lan)?;
        } else {
            let _ = self.system_proxy.disable_and_restore();
        }

        {
            let mut g = self.state.lock().unwrap();
            g.active_server_id = Some(server.id.clone());
            g.connection_state = ConnectionState::Connected;
            g.connected_since = Some(now_millis());
            g.error_message = None;
            g.traffic = TrafficStatsSnapshot::default();
            g.last_sample_ms = now_millis();
            g.last_up_total = 0;
            g.last_down_total = 0;
            g.active_consecutive_failures = 0;
        }
        self.emit_snapshot();
        Ok(())
    }

    pub async fn disconnect(&self) {
        self.xray.stop();
        let _ = self.system_proxy.disable_and_restore();
        {
            let mut g = self.state.lock().unwrap();
            g.connection_state = ConnectionState::Disconnected;
            g.active_server_id = None;
            g.connected_since = None;
            g.active_consecutive_failures = 0;
            g.traffic.upload_bps = 0;
            g.traffic.download_bps = 0;
        }
        self.emit_snapshot();
    }

    async fn tick_stats_and_process(self: &Arc<Self>) {
        let is_connected = {
            let g = self.state.lock().unwrap();
            g.connection_state == ConnectionState::Connected
        };
        if !is_connected {
            return;
        }

        if let Some(exit_code) = self.xray.poll_unexpected_exit() {
            self.logger
                .warn(&format!("Xray exited unexpectedly with code {}", exit_code));
            let can_fallback = {
                let mut g = self.state.lock().unwrap();
                if let Some(aid) = g.active_server_id.clone() {
                    g.failed_in_cycle.insert(aid);
                }
                g.connection_mode == ConnectionMode::Auto && g.vault.servers.len() > 1
            };

            if can_fallback && self.perform_smart_fallback().await {
                return;
            }

            let _ = self.system_proxy.disable_and_restore();
            {
                let mut g = self.state.lock().unwrap();
                g.connection_state = ConnectionState::Error;
                g.active_server_id = None;
                g.connected_since = None;
                g.error_message = Some(format!("Xray process exited (code {})", exit_code));
            }
            self.emit_snapshot();
            return;
        }

        let api_port = self.xray.get_api_port();
        let delta = query_xray_traffic_stats(api_port, false).await;

        {
            let mut g = self.state.lock().unwrap();
            if g.connection_state != ConnectionState::Connected {
                return;
            }
            let now = now_millis();
            let dt_sec = ((now - g.last_sample_ms) as f64 / 1000.0).max(0.2);

            if delta.uplink_bytes >= g.last_up_total || delta.downlink_bytes >= g.last_down_total {
                let d_up = delta.uplink_bytes.saturating_sub(g.last_up_total);
                let d_down = delta.downlink_bytes.saturating_sub(g.last_down_total);
                let up_bps = (d_up as f64 / dt_sec).round() as u64;
                let down_bps = (d_down as f64 / dt_sec).round() as u64;

                g.last_sample_ms = now;
                g.last_up_total = delta.uplink_bytes;
                g.last_down_total = delta.downlink_bytes;

                g.traffic.upload_bps = up_bps;
                g.traffic.download_bps = down_bps;
                g.traffic.peak_upload_bps = g.traffic.peak_upload_bps.max(up_bps);
                g.traffic.peak_download_bps = g.traffic.peak_download_bps.max(down_bps);
                g.traffic.session_upload_bytes = delta.uplink_bytes;
                g.traffic.session_download_bytes = delta.downlink_bytes;
                g.traffic.history.push(BandwidthPoint {
                    ts: now,
                    upload_bps: up_bps,
                    download_bps: down_bps,
                });
                if g.traffic.history.len() > 60 {
                    let drop_n = g.traffic.history.len() - 60;
                    g.traffic.history.drain(0..drop_n);
                }
            }
        }
        self.emit_snapshot();
    }

    async fn tick_health_check(self: &Arc<Self>) {
        let (is_connected, http_port, active_id, threshold, total_servers) = {
            let g = self.state.lock().unwrap();
            (
                g.connection_state == ConnectionState::Connected,
                g.vault.settings.http_port,
                g.active_server_id.clone(),
                g.vault.settings.fallback_failure_threshold.max(1),
                g.vault.servers.len(),
            )
        };
        if !is_connected {
            return;
        }
        let Some(aid) = active_id else {
            return;
        };

        let ok = check_proxy_egress_health(http_port, 5000).await;
        if ok {
            {
                let mut g = self.state.lock().unwrap();
                g.active_consecutive_failures = 0;
                if let Some(m) = g.metrics.get_mut(&aid) {
                    m.healthy = true;
                    m.consecutive_failures = 0;
                    m.last_checked_at = Some(now_millis());
                }
            }
            self.emit_snapshot();
            return;
        }

        let (count, should_switch) = {
            let mut g = self.state.lock().unwrap();
            g.active_consecutive_failures += 1;
            let count = g.active_consecutive_failures;
            let sw = count >= threshold;
            let entry = g.metrics.entry(aid.clone()).or_insert(RuntimeServerMetric {
                latency_ms: None,
                healthy: true,
                last_checked_at: None,
                consecutive_failures: 0,
            });
            entry.healthy = !sw;
            entry.consecutive_failures = count;
            entry.last_checked_at = Some(now_millis());
            if sw {
                g.failed_in_cycle.insert(aid.clone());
            }
            (count, sw)
        };

        self.logger.warn(&format!(
            "Active connection health check failed ({}/{})",
            count, threshold
        ));

        if should_switch && total_servers > 1 {
            let _ = self.perform_smart_fallback().await;
        } else {
            self.emit_snapshot();
        }
    }

    async fn perform_smart_fallback(self: &Arc<Self>) -> bool {
        let Ok(_guard) = self.connecting_lock.try_lock() else {
            return false;
        };

        {
            let mut g = self.state.lock().unwrap();
            g.connection_state = ConnectionState::Reconnecting;
        }
        self.emit_snapshot();

        self.probe_all_latencies().await;

        let next_srv: Option<ServerSecretRecord> = {
            let snap = self.get_snapshot();
            let mut g = self.state.lock().unwrap();
            if g.failed_in_cycle.len() >= g.vault.servers.len() {
                g.failed_in_cycle.clear();
                if let Some(aid) = &g.active_server_id {
                    g.failed_in_cycle.insert(aid.clone());
                }
            }
            let pinned: HashSet<String> = g.vault.pinned_ids.iter().cloned().collect();
            let exclude = g.failed_in_cycle.clone();
            pick_best_server(&snap.servers, &pinned, &exclude)
                .and_then(|pub_srv| g.vault.servers.iter().find(|s| s.id == pub_srv.id).cloned())
        };

        let Some(srv) = next_srv else {
            return false;
        };

        match self.start_tunnel_for_server(&srv) {
            Ok(()) => {
                self.emit_toast(
                    "info",
                    "سوئیچ هوشمند به سرور سریع‌تر",
                    "Smart Auto-Fallback",
                    &format!("اتصال خودکار به «{}» برقرار شد.", srv.remark),
                    &format!("Automatically switched to \"{}\".", srv.remark),
                );
                true
            }
            Err(e) => {
                self.logger.error(&format!("Smart fallback failed: {}", e));
                false
            }
        }
    }

    pub fn update_settings(&self, patch: AppSettingsPatch) -> AppSnapshot {
        let (reconfigure, connected_srv) = {
            let mut g = self.state.lock().unwrap();
            let prev = g.vault.settings.clone();

            if let Some(v) = patch.language {
                g.vault.settings.language = v;
            }
            if let Some(v) = patch.theme {
                g.vault.settings.theme = v;
            }
            if let Some(v) = patch.socks_port {
                g.vault.settings.socks_port = v;
            }
            if let Some(v) = patch.http_port {
                g.vault.settings.http_port = v;
            }
            if let Some(v) = patch.enable_system_proxy {
                g.vault.settings.enable_system_proxy = v;
            }
            if let Some(v) = patch.bypass_lan {
                g.vault.settings.bypass_lan = v;
            }
            if let Some(v) = patch.auto_best_server {
                g.vault.settings.auto_best_server = v;
                g.connection_mode = if v {
                    ConnectionMode::Auto
                } else {
                    ConnectionMode::Manual
                };
            }
            if let Some(v) = patch.latency_check_interval_sec {
                g.vault.settings.latency_check_interval_sec = v;
            }
            if let Some(v) = patch.health_check_interval_sec {
                g.vault.settings.health_check_interval_sec = v;
            }
            if let Some(v) = patch.fallback_failure_threshold {
                g.vault.settings.fallback_failure_threshold = v;
            }
            if let Some(v) = patch.auto_update_on_launch {
                g.vault.settings.auto_update_on_launch = v;
            }
            if let Some(v) = patch.auto_install_update_on_launch {
                g.vault.settings.auto_install_update_on_launch = v;
            }
            if let Some(v) = patch.minimize_to_tray_on_close {
                g.vault.settings.minimize_to_tray_on_close = v;
            }
            if let Some(v) = patch.custom_sponge_mascot_data_url {
                g.vault.settings.custom_sponge_mascot_data_url = v;
            }
            if let Some(v) = patch.custom_crab_mascot_data_url {
                g.vault.settings.custom_crab_mascot_data_url = v;
            }

            let next = &g.vault.settings;
            let proxy_changed = prev.socks_port != next.socks_port
                || prev.http_port != next.http_port
                || prev.bypass_lan != next.bypass_lan
                || prev.enable_system_proxy != next.enable_system_proxy;

            let srv = if proxy_changed && g.connection_state == ConnectionState::Connected {
                g.active_server_id
                    .as_ref()
                    .and_then(|aid| g.vault.servers.iter().find(|s| &s.id == aid).cloned())
            } else {
                None
            };

            self.store.save(&g.vault);
            (proxy_changed, srv)
        };

        if reconfigure {
            if let Some(srv) = connected_srv {
                let _ = self.start_tunnel_for_server(&srv);
            }
        }

        self.emit_snapshot();
        self.get_snapshot()
    }

    pub fn get_logs(&self) -> Vec<SafeLogEntry> {
        self.logger.get_entries()
    }

    pub fn clear_logs(&self) {
        self.logger.clear();
    }

    pub async fn check_updates(&self) -> UpdateStatus {
        let temp_dir = self.data_dir.join("updates");
        self.updater.check_for_updates(false, &temp_dir).await
    }

    pub async fn install_update(&self) {
        let temp_dir = self.data_dir.join("updates");
        let _ = self.updater.check_for_updates(true, &temp_dir).await;
    }

    pub fn should_minimize_to_tray(&self) -> bool {
        self.state
            .lock()
            .map(|g| {
                g.vault.settings.minimize_to_tray_on_close
                    && matches!(
                        g.connection_state,
                        ConnectionState::Connected
                            | ConnectionState::Connecting
                            | ConnectionState::Reconnecting
                    )
            })
            .unwrap_or(false)
    }

    pub fn get_language(&self) -> AppLanguage {
        self.state
            .lock()
            .map(|g| g.vault.settings.language.clone())
            .unwrap_or(AppLanguage::Fa)
    }

    pub fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.xray.stop();
        let _ = self.system_proxy.disable_and_restore();
    }
}
