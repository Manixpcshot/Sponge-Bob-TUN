use crate::log_sanitizer::{sanitize_log_message, SafeLogger};
use crate::types::UpdateStatus;
use semver::Version;
use serde::Deserialize;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const GITHUB_RELEASE_API: &str =
    "https://api.github.com/repos/Manixpcshot/Sponge-Bob-TUN/releases/latest";

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    html_url: String,
    assets: Vec<GhAsset>,
}

pub fn is_portable_runtime() -> bool {
    if cfg!(feature = "embed-xray") {
        return true;
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if dir.join("PORTABLE_MODE.txt").exists() || dir.join(".portable").exists() {
                return true;
            }
            if let Some(name) = exe.file_name().and_then(|n| n.to_str()) {
                if name.to_lowercase().contains("portable") {
                    return true;
                }
            }
        }
    }
    false
}

fn normalize_semver(raw: &str) -> Option<Version> {
    let cleaned = raw.trim().trim_start_matches(['v', 'V']);
    Version::parse(cleaned).ok()
}

pub struct UpdaterService {
    logger: Arc<SafeLogger>,
    current_version: String,
    status: Arc<Mutex<UpdateStatus>>,
    on_status: Arc<dyn Fn(UpdateStatus) + Send + Sync>,
    before_install_cleanup: Arc<dyn Fn() + Send + Sync>,
}

impl UpdaterService {
    pub fn new(
        logger: Arc<SafeLogger>,
        current_version: String,
        on_status: Arc<dyn Fn(UpdateStatus) + Send + Sync>,
        before_install_cleanup: Arc<dyn Fn() + Send + Sync>,
    ) -> Self {
        let init = UpdateStatus {
            stage: "idle".to_string(),
            current_version: current_version.clone(),
            latest_version: None,
            percent: None,
            message: None,
            release_url: None,
        };
        Self {
            logger,
            current_version,
            status: Arc::new(Mutex::new(init)),
            on_status,
            before_install_cleanup,
        }
    }

    pub fn get_status(&self) -> UpdateStatus {
        self.status
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| UpdateStatus {
                stage: "idle".to_string(),
                current_version: self.current_version.clone(),
                latest_version: None,
                percent: None,
                message: None,
                release_url: None,
            })
    }

    fn emit(&self, next: UpdateStatus) {
        if let Ok(mut g) = self.status.lock() {
            *g = next.clone();
        }
        (self.on_status)(next);
    }

    pub async fn check_for_updates(
        &self,
        auto_install: bool,
        temp_dir: &Path,
    ) -> UpdateStatus {
        self.emit(UpdateStatus {
            stage: "checking".to_string(),
            current_version: self.current_version.clone(),
            latest_version: None,
            percent: None,
            message: None,
            release_url: None,
        });

        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("SpongeBobTUN-Tauri-Updater/1.1")
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                let st = UpdateStatus {
                    stage: "error".to_string(),
                    current_version: self.current_version.clone(),
                    latest_version: None,
                    percent: None,
                    message: Some(sanitize_log_message(&e.to_string())),
                    release_url: None,
                };
                self.emit(st.clone());
                return st;
            }
        };

        let resp = match client
            .get(GITHUB_RELEASE_API)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                let st = UpdateStatus {
                    stage: "error".to_string(),
                    current_version: self.current_version.clone(),
                    latest_version: None,
                    percent: None,
                    message: Some(sanitize_log_message(&e.to_string())),
                    release_url: None,
                };
                self.emit(st.clone());
                return st;
            }
        };

        if !resp.status().is_success() {
            let st = UpdateStatus {
                stage: "error".to_string(),
                current_version: self.current_version.clone(),
                latest_version: None,
                percent: None,
                message: Some(format!("GitHub API HTTP {}", resp.status().as_u16())),
                release_url: None,
            };
            self.emit(st.clone());
            return st;
        }

        let release: GhRelease = match resp.json().await {
            Ok(r) => r,
            Err(e) => {
                let st = UpdateStatus {
                    stage: "error".to_string(),
                    current_version: self.current_version.clone(),
                    latest_version: None,
                    percent: None,
                    message: Some(sanitize_log_message(&e.to_string())),
                    release_url: None,
                };
                self.emit(st.clone());
                return st;
            }
        };

        let current_v = normalize_semver(&self.current_version);
        let latest_v = normalize_semver(&release.tag_name);
        let latest_str = latest_v
            .as_ref()
            .map(|v| v.to_string())
            .unwrap_or_else(|| release.tag_name.trim_start_matches(['v', 'V']).to_string());

        let is_newer = match (latest_v, current_v) {
            (Some(l), Some(c)) => l > c,
            _ => false,
        };

        if !is_newer {
            let st = UpdateStatus {
                stage: "up-to-date".to_string(),
                current_version: self.current_version.clone(),
                latest_version: Some(latest_str),
                percent: None,
                message: None,
                release_url: Some(release.html_url),
            };
            self.emit(st.clone());
            return st;
        }

        let portable = is_portable_runtime();
        let target_asset = if portable {
            release.assets.iter().find(|a| {
                let n = a.name.to_lowercase();
                n.contains("tauri") && n.contains("portable") && n.ends_with(".exe")
            })
        } else {
            release.assets.iter().find(|a| {
                let n = a.name.to_lowercase();
                n.contains("tauri") && n.contains("setup") && n.ends_with(".exe")
            })
        };

        let Some(asset) = target_asset else {
            let st = UpdateStatus {
                stage: "available".to_string(),
                current_version: self.current_version.clone(),
                latest_version: Some(latest_str),
                percent: None,
                message: Some("Update available on GitHub Releases".to_string()),
                release_url: Some(release.html_url),
            };
            self.emit(st.clone());
            return st;
        };

        if !auto_install || !cfg!(windows) {
            let st = UpdateStatus {
                stage: "available".to_string(),
                current_version: self.current_version.clone(),
                latest_version: Some(latest_str),
                percent: None,
                message: None,
                release_url: Some(release.html_url),
            };
            self.emit(st.clone());
            return st;
        }

        self.emit(UpdateStatus {
            stage: "downloading".to_string(),
            current_version: self.current_version.clone(),
            latest_version: Some(latest_str.clone()),
            percent: Some(5),
            message: None,
            release_url: Some(release.html_url.clone()),
        });

        let _ = fs::create_dir_all(temp_dir);
        let dest = temp_dir.join(&asset.name);

        let dl_resp = match client.get(&asset.browser_download_url).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                let st = UpdateStatus {
                    stage: "error".to_string(),
                    current_version: self.current_version.clone(),
                    latest_version: Some(latest_str),
                    percent: None,
                    message: Some(format!("Download HTTP {}", r.status().as_u16())),
                    release_url: Some(release.html_url),
                };
                self.emit(st.clone());
                return st;
            }
            Err(e) => {
                let st = UpdateStatus {
                    stage: "error".to_string(),
                    current_version: self.current_version.clone(),
                    latest_version: Some(latest_str),
                    percent: None,
                    message: Some(sanitize_log_message(&e.to_string())),
                    release_url: Some(release.html_url),
                };
                self.emit(st.clone());
                return st;
            }
        };

        let bytes = match dl_resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                let st = UpdateStatus {
                    stage: "error".to_string(),
                    current_version: self.current_version.clone(),
                    latest_version: Some(latest_str),
                    percent: None,
                    message: Some(sanitize_log_message(&e.to_string())),
                    release_url: Some(release.html_url),
                };
                self.emit(st.clone());
                return st;
            }
        };

        // Verify valid Windows PE header ('MZ') and minimum binary size (> 1 MB)
        if bytes.len() < 1_000_000 || &bytes[..2] != b"MZ" {
            let st = UpdateStatus {
                stage: "error".to_string(),
                current_version: self.current_version.clone(),
                latest_version: Some(latest_str),
                percent: None,
                message: Some("Downloaded update binary failed PE verification".to_string()),
                release_url: Some(release.html_url),
            };
            self.emit(st.clone());
            return st;
        }

        if let Ok(mut f) = File::create(&dest) {
            let _ = f.write_all(&bytes);
        }

        self.emit(UpdateStatus {
            stage: "downloaded".to_string(),
            current_version: self.current_version.clone(),
            latest_version: Some(latest_str.clone()),
            percent: Some(100),
            message: None,
            release_url: Some(release.html_url),
        });

        self.logger
            .info(&format!("Update v{} downloaded; applying silently...", latest_str));
        (self.before_install_cleanup)();

        #[cfg(windows)]
        {
            if portable {
                if let Ok(curr_exe) = std::env::current_exe() {
                    let pid = std::process::id();
                    let script = format!(
                        "$p = {}; while (Get-Process -Id $p -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 250 }}; Move-Item -LiteralPath '{}' -Destination '{}' -Force; Start-Process -FilePath '{}'",
                        pid,
                        dest.display().to_string().replace('\'', "''"),
                        curr_exe.display().to_string().replace('\'', "''"),
                        curr_exe.display().to_string().replace('\'', "''")
                    );
                    let _ = Command::new("powershell.exe")
                        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .creation_flags(CREATE_NO_WINDOW)
                        .spawn();
                    std::process::exit(0);
                }
            } else {
                let _ = Command::new(&dest)
                    .args(["/S"])
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
                std::process::exit(0);
            }
        }

        #[allow(unreachable_code)]
        self.get_status()
    }
}
