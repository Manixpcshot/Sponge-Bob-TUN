mod app_controller;
mod latency;
mod log_sanitizer;
mod npvs_codec;
mod secure_store;
mod subscription;
mod system_proxy;
mod types;
mod updater;
mod vless_parser;
mod xray_config;
mod xray_manager;
mod xray_stats;

use app_controller::{AppController, ControllerEvents};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use types::{
    AppLanguage, AppSettingsPatch, AppSnapshot, AppToast, ConnectResult, ConnectionMode,
    ConnectionState, ExportResult, PickMascotResult, SafeLogEntry, SubscriptionImportResult,
    UpdateStatus, WindowControlsState,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const TRAY_IDLE_PNG: &[u8] = include_bytes!("../../assets/icons/tray-idle.png");
const TRAY_CONNECTED_PNG: &[u8] = include_bytes!("../../assets/icons/tray-connected.png");
const TRAY_ALERT_PNG: &[u8] = include_bytes!("../../assets/icons/tray-alert.png");

struct AppRuntimeState {
    controller: Arc<AppController>,
    quit_requested: Arc<AtomicBool>,
    pending_import_bytes: std::sync::Mutex<Option<Vec<u8>>>,
}

struct TauriControllerEvents {
    app: AppHandle,
}

impl TauriControllerEvents {
    fn update_tray(&self, state: &ConnectionState, has_quota_alert: bool) {
        let Some(tray) = self.app.tray_by_id("main-tray") else {
            return;
        };

        let icon_bytes = if has_quota_alert {
            TRAY_ALERT_PNG
        } else if *state == ConnectionState::Connected {
            TRAY_CONNECTED_PNG
        } else {
            TRAY_IDLE_PNG
        };

        if let Ok(img) = Image::from_bytes(icon_bytes) {
            let _ = tray.set_icon(Some(img));
        }

        let tooltip = match state {
            ConnectionState::Connected => "Sponge bob tun — Connected",
            ConnectionState::Connecting | ConnectionState::Reconnecting => {
                "Sponge bob tun — Connecting..."
            }
            _ => "Sponge bob tun — باب اسفنجی",
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

impl ControllerEvents for TauriControllerEvents {
    fn on_snapshot(&self, snapshot: AppSnapshot) {
        let _ = self.app.emit("app:snapshot", snapshot);
    }

    fn on_toast(&self, toast: AppToast) {
        let _ = self.app.emit("app:toast", toast);
    }

    fn on_tray_state(&self, state: ConnectionState, has_quota_alert: bool) {
        self.update_tray(&state, has_quota_alert);
    }
}

fn read_window_controls_state(win: &tauri::WebviewWindow) -> WindowControlsState {
    WindowControlsState {
        is_maximized: win.is_maximized().unwrap_or(false),
        is_full_screen: win.is_fullscreen().unwrap_or(false),
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn get_snapshot(state: State<'_, AppRuntimeState>) -> AppSnapshot {
    state.controller.get_snapshot()
}

#[tauri::command]
fn get_subscription_url(state: State<'_, AppRuntimeState>) -> String {
    state.controller.get_subscription_url()
}

#[tauri::command]
async fn update_subscription(
    state: State<'_, AppRuntimeState>,
    url: Option<String>,
    password: Option<String>,
) -> Result<SubscriptionImportResult, String> {
    Ok(state.controller.update_subscription(url, password).await)
}

#[tauri::command]
async fn import_file_dialog(
    state: State<'_, AppRuntimeState>,
    password: Option<String>,
) -> Result<SubscriptionImportResult, String> {
    if password.is_some() {
        let cached = state.pending_import_bytes.lock().unwrap().clone();
        if let Some(bytes) = cached {
            let res = state
                .controller
                .import_bytes(&bytes, password.as_deref(), false);
            if res.ok {
                *state.pending_import_bytes.lock().unwrap() = None;
            }
            return Ok(res);
        }
    }

    let picked = rfd::AsyncFileDialog::new()
        .add_filter("Configs & Subscriptions", &["npvs", "txt", "conf", "json"])
        .pick_file()
        .await;

    let Some(file) = picked else {
        *state.pending_import_bytes.lock().unwrap() = None;
        return Ok(SubscriptionImportResult {
            ok: false,
            needs_password: None,
            invalid_password: None,
            server_count: None,
            error: None,
            canceled: Some(true),
        });
    };

    let bytes = file.read().await;
    let res = state
        .controller
        .import_bytes(&bytes, password.as_deref(), false);
    if res.needs_password.unwrap_or(false) || res.invalid_password.unwrap_or(false) {
        *state.pending_import_bytes.lock().unwrap() = Some(bytes);
    } else {
        *state.pending_import_bytes.lock().unwrap() = None;
    }
    Ok(res)
}

#[tauri::command]
fn import_raw_payload(
    state: State<'_, AppRuntimeState>,
    base64_or_text: String,
    is_base64_bytes: bool,
    password: Option<String>,
) -> SubscriptionImportResult {
    let raw = if is_base64_bytes {
        STANDARD
            .decode(base64_or_text.as_bytes())
            .unwrap_or_else(|_| base64_or_text.as_bytes().to_vec())
    } else {
        base64_or_text.into_bytes()
    };

    state
        .controller
        .import_bytes(&raw, password.as_deref(), false)
}

#[tauri::command]
async fn export_npvs_dialog(
    state: State<'_, AppRuntimeState>,
    password: Option<String>,
) -> Result<ExportResult, String> {
    let picked = rfd::AsyncFileDialog::new()
        .set_file_name("sponge-bob-tun.npvs")
        .add_filter("NPVS Encrypted Backup", &["npvs"])
        .save_file()
        .await;

    let Some(file) = picked else {
        return Ok(ExportResult {
            ok: false,
            canceled: Some(true),
        });
    };

    let ok = state
        .controller
        .export_npvs_to_file(file.path(), password.as_deref());
    Ok(ExportResult { ok, canceled: None })
}

#[tauri::command]
fn clear_subscription(state: State<'_, AppRuntimeState>) -> AppSnapshot {
    state.controller.clear_subscription()
}

#[tauri::command]
fn select_server(
    state: State<'_, AppRuntimeState>,
    server_id: Option<String>,
    mode: Option<ConnectionMode>,
) -> AppSnapshot {
    state.controller.select_server(server_id, mode)
}

#[tauri::command]
fn toggle_pin_server(state: State<'_, AppRuntimeState>, server_id: String) -> AppSnapshot {
    state.controller.toggle_pin_server(&server_id)
}

#[tauri::command]
async fn probe_latencies(state: State<'_, AppRuntimeState>) -> Result<(), String> {
    state.controller.probe_all_latencies().await;
    Ok(())
}

#[tauri::command]
async fn connect(
    state: State<'_, AppRuntimeState>,
    mode: Option<ConnectionMode>,
    server_id: Option<String>,
) -> Result<ConnectResult, String> {
    Ok(state.controller.connect(mode, server_id).await)
}

#[tauri::command]
async fn disconnect(state: State<'_, AppRuntimeState>) -> Result<(), String> {
    state.controller.disconnect().await;
    Ok(())
}

#[tauri::command]
fn update_settings(state: State<'_, AppRuntimeState>, patch: AppSettingsPatch) -> AppSnapshot {
    state.controller.update_settings(patch)
}

#[tauri::command]
async fn pick_mascot_image(
    state: State<'_, AppRuntimeState>,
    target: String,
) -> Result<PickMascotResult, String> {
    let picked = rfd::AsyncFileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
        .pick_file()
        .await;

    let Some(file) = picked else {
        return Ok(PickMascotResult {
            ok: false,
            data_url: None,
        });
    };

    let ext = file
        .path()
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };

    let bytes = fs::read(file.path()).map_err(|e| e.to_string())?;
    let data_url = format!("data:{};base64,{}", mime, STANDARD.encode(bytes));

    let mut patch = AppSettingsPatch::default();
    if target == "sponge" {
        patch.custom_sponge_mascot_data_url = Some(Some(data_url.clone()));
    } else {
        patch.custom_crab_mascot_data_url = Some(Some(data_url.clone()));
    }
    state.controller.update_settings(patch);

    Ok(PickMascotResult {
        ok: true,
        data_url: Some(data_url),
    })
}

#[tauri::command]
fn get_logs(state: State<'_, AppRuntimeState>) -> Vec<SafeLogEntry> {
    state.controller.get_logs()
}

#[tauri::command]
fn clear_logs(state: State<'_, AppRuntimeState>) {
    state.controller.clear_logs();
}

#[tauri::command]
async fn check_updates(state: State<'_, AppRuntimeState>) -> Result<UpdateStatus, String> {
    Ok(state.controller.check_updates().await)
}

#[tauri::command]
async fn install_update(state: State<'_, AppRuntimeState>) -> Result<(), String> {
    state.controller.install_update().await;
    Ok(())
}

#[tauri::command]
fn open_github_repo(subpath: Option<String>) {
    let base = "https://github.com/Manixpcshot/Sponge-Bob-TUN";
    let clean_sub = subpath
        .as_deref()
        .unwrap_or("")
        .trim_start_matches('/');
    let url = if clean_sub.is_empty() {
        base.to_string()
    } else {
        format!("{}/{}", base, clean_sub)
    };

    #[cfg(windows)]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", &url])
            .creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(&url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("xdg-open").arg(&url).spawn();
    }
}

#[tauri::command]
fn window_minimize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

#[tauri::command]
fn window_toggle_maximize(app: AppHandle) -> WindowControlsState {
    let Some(win) = app.get_webview_window("main") else {
        return WindowControlsState {
            is_maximized: false,
            is_full_screen: false,
        };
    };
    if win.is_fullscreen().unwrap_or(false) {
        let _ = win.set_fullscreen(false);
    } else if win.is_maximized().unwrap_or(false) {
        let _ = win.unmaximize();
    } else {
        let _ = win.maximize();
    }
    let state = read_window_controls_state(&win);
    let _ = app.emit("window:state-changed", &state);
    state
}

#[tauri::command]
fn window_toggle_fullscreen(app: AppHandle) -> WindowControlsState {
    let Some(win) = app.get_webview_window("main") else {
        return WindowControlsState {
            is_maximized: false,
            is_full_screen: false,
        };
    };
    let next = !win.is_fullscreen().unwrap_or(false);
    let _ = win.set_fullscreen(next);
    let state = read_window_controls_state(&win);
    let _ = app.emit("window:state-changed", &state);
    state
}

#[tauri::command]
fn window_close(app: AppHandle, state: State<'_, AppRuntimeState>) {
    if state.controller.should_minimize_to_tray() {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.hide();
        }
    } else {
        state.quit_requested.store(true, Ordering::SeqCst);
        state.controller.shutdown();
        app.exit(0);
    }
}

#[tauri::command]
fn window_get_state(app: AppHandle) -> WindowControlsState {
    if let Some(win) = app.get_webview_window("main") {
        read_window_controls_state(&win)
    } else {
        WindowControlsState {
            is_maximized: false,
            is_full_screen: false,
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    if updater::is_portable_runtime() && std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let candidate = exe_dir.join("SpongeBobTUN-Data").join("webview2");
                if fs::create_dir_all(&candidate).is_ok() {
                    let probe = candidate.join(".write-check");
                    if fs::write(&probe, b"1").is_ok() {
                        let _ = fs::remove_file(&probe);
                        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", candidate);
                    }
                }
            }
        }
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .setup(|app| {
            let handle = app.handle().clone();
            let default_app_data = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("SpongeBobTUN"));
            let data_dir = secure_store::resolve_data_dir(default_app_data);
            let resource_dir = app.path().resource_dir().ok();
            let app_version = app.package_info().version.to_string();

            let events = Arc::new(TauriControllerEvents {
                app: handle.clone(),
            });
            let controller = AppController::new(data_dir, resource_dir, app_version, events);
            let quit_requested = Arc::new(AtomicBool::new(false));

            controller.spawn_background_loops();

            let is_fa = controller.get_language() == AppLanguage::Fa;
            let open_item = MenuItemBuilder::with_id(
                "open",
                if is_fa { "باز کردن باب اسفنجی" } else { "Open Sponge bob tun" },
            )
            .build(app)?;
            let connect_item = MenuItemBuilder::with_id(
                "connect",
                if is_fa { "اتصال خودکار" } else { "Connect (Auto)" },
            )
            .build(app)?;
            let disconnect_item = MenuItemBuilder::with_id(
                "disconnect",
                if is_fa { "قطع اتصال" } else { "Disconnect" },
            )
            .build(app)?;
            let quit_item = MenuItemBuilder::with_id(
                "quit",
                if is_fa { "خروج کامل" } else { "Quit" },
            )
            .build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .items(&[&open_item, &connect_item, &disconnect_item, &quit_item])
                .build()?;

            let tray_icon = Image::from_bytes(TRAY_IDLE_PNG)?;
            let ctrl_menu = controller.clone();
            let quit_menu = quit_requested.clone();

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .tooltip("Sponge bob tun — باب اسفنجی")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "connect" => {
                        let c = ctrl_menu.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = c.connect(None, None).await;
                        });
                    }
                    "disconnect" => {
                        let c = ctrl_menu.clone();
                        tauri::async_runtime::spawn(async move {
                            c.disconnect().await;
                        });
                    }
                    "quit" => {
                        quit_menu.store(true, Ordering::SeqCst);
                        ctrl_menu.shutdown();
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            app.manage(AppRuntimeState {
                controller,
                quit_requested,
                pending_import_bytes: std::sync::Mutex::new(None),
            });

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                let state = window.app_handle().state::<AppRuntimeState>();
                if !state.quit_requested.load(Ordering::SeqCst)
                    && state.controller.should_minimize_to_tray()
                {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    state.controller.shutdown();
                }
            }
            WindowEvent::Resized(_) => {
                if let Some(win) = window.app_handle().get_webview_window("main") {
                    let st = read_window_controls_state(&win);
                    let _ = window.app_handle().emit("window:state-changed", st);
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            get_subscription_url,
            update_subscription,
            import_file_dialog,
            import_raw_payload,
            export_npvs_dialog,
            clear_subscription,
            select_server,
            toggle_pin_server,
            probe_latencies,
            connect,
            disconnect,
            update_settings,
            pick_mascot_image,
            get_logs,
            clear_logs,
            check_updates,
            install_update,
            open_github_repo,
            window_minimize,
            window_toggle_maximize,
            window_toggle_fullscreen,
            window_close,
            window_get_state,
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building Sponge bob tun (Tauri)")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                let state = app_handle.state::<AppRuntimeState>();
                state.controller.shutdown();
            }
        });
}
