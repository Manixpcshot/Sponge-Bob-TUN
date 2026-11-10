use crate::log_sanitizer::{register_secret, sanitize_log_message, SafeLogger};
use crate::types::{AppSettings, ServerSecretRecord};
use crate::xray_config::build_xray_config;
use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const EMBEDDED_XRAY_GZ: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/xray.bin.gz"));
const EMBEDDED_XRAY_SHA256: &str = include_str!(concat!(env!("OUT_DIR"), "/xray.sha256"));

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn get_free_loopback_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(19480)
}

pub fn resolve_or_extract_xray_binary(
    data_dir: &Path,
    resource_dir: Option<&Path>,
) -> Option<PathBuf> {
    let bin_name = if cfg!(windows) { "xray.exe" } else { "xray" };
    let platform_dir = if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };

    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("bin").join(bin_name));
            candidates.push(dir.join("bin").join(platform_dir).join(bin_name));
            candidates.push(dir.join("resources").join("bin").join(platform_dir).join(bin_name));
            candidates.push(dir.join("..").join("resources").join("bin").join(platform_dir).join(bin_name));
        }
    }
    if let Some(res) = resource_dir {
        candidates.push(res.join("bin").join(platform_dir).join(bin_name));
        candidates.push(res.join("bin").join(bin_name));
        candidates.push(res.join("resources").join("bin").join(platform_dir).join(bin_name));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("resources").join("bin").join(platform_dir).join(bin_name));
        candidates.push(cwd.join("..").join("resources").join("bin").join(platform_dir).join(bin_name));
    }

    for path in candidates {
        if path.is_file() {
            return Some(path);
        }
    }

    // Portable single-file mode: extract embedded gzipped xray.exe if compiled with --features embed-xray
    if !EMBEDDED_XRAY_GZ.is_empty() {
        let target_dir = data_dir.join("bin");
        if fs::create_dir_all(&target_dir).is_ok() {
            let target_bin = target_dir.join(bin_name);
            let expected_sha = EMBEDDED_XRAY_SHA256.trim();

            if target_bin.is_file() {
                if let Ok(existing) = fs::read(&target_bin) {
                    let digest = hex::encode(Sha256::digest(&existing));
                    if !expected_sha.is_empty() && digest == expected_sha {
                        return Some(target_bin);
                    }
                }
            }

            let mut decoder = GzDecoder::new(EMBEDDED_XRAY_GZ);
            let mut raw = Vec::new();
            if decoder.read_to_end(&mut raw).is_ok() && !raw.is_empty() {
                let actual_sha = hex::encode(Sha256::digest(&raw));
                if expected_sha.is_empty() || actual_sha == expected_sha {
                    if fs::write(&target_bin, &raw).is_ok() {
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            let _ = fs::set_permissions(&target_bin, fs::Permissions::from_mode(0o755));
                        }
                        return Some(target_bin);
                    }
                }
            }
        }
    }

    None
}

pub struct XrayManager {
    logger: Arc<SafeLogger>,
    data_dir: PathBuf,
    resource_dir: Option<PathBuf>,
    child: Mutex<Option<Child>>,
    api_port: Mutex<u16>,
    cached_version: Mutex<Option<String>>,
    stopping_intentionally: Mutex<bool>,
}

impl XrayManager {
    pub fn new(logger: Arc<SafeLogger>, data_dir: PathBuf, resource_dir: Option<PathBuf>) -> Self {
        Self {
            logger,
            data_dir,
            resource_dir,
            child: Mutex::new(None),
            api_port: Mutex::new(19480),
            cached_version: Mutex::new(None),
            stopping_intentionally: Mutex::new(false),
        }
    }

    pub fn is_binary_available(&self) -> bool {
        resolve_or_extract_xray_binary(&self.data_dir, self.resource_dir.as_deref()).is_some()
    }

    pub fn get_api_port(&self) -> u16 {
        *self.api_port.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn get_version(&self) -> Option<String> {
        if let Some(cached) = self.cached_version.lock().ok().and_then(|g| g.clone()) {
            return Some(cached);
        }
        let bin = resolve_or_extract_xray_binary(&self.data_dir, self.resource_dir.as_deref())?;
        let mut cmd = Command::new(&bin);
        cmd.arg("version")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(output) = cmd.output() {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = text.lines().next() {
                if let Some(ver_token) = first_line.split_whitespace().find(|t| t.contains('.')) {
                    let clean = ver_token.trim().to_string();
                    if let Ok(mut g) = self.cached_version.lock() {
                        *g = Some(clean.clone());
                    }
                    return Some(clean);
                }
            }
        }
        None
    }

    pub fn is_running(&self) -> bool {
        let Ok(mut guard) = self.child.lock() else {
            return false;
        };
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(None) => true,
                _ => {
                    *guard = None;
                    false
                }
            }
        } else {
            false
        }
    }

    pub fn start(&self, server: &ServerSecretRecord, settings: &AppSettings) -> Result<(), String> {
        self.stop();

        let Some(bin_path) =
            resolve_or_extract_xray_binary(&self.data_dir, self.resource_dir.as_deref())
        else {
            return Err("Xray core binary not found (resources/bin/win32/xray.exe)".to_string());
        };

        register_secret(&server.address);
        register_secret(&server.uuid);
        if let Some(p) = &server.pbk {
            register_secret(p);
        }
        if let Some(s) = &server.sni {
            register_secret(s);
        }

        let api_port = get_free_loopback_port();
        if let Ok(mut g) = self.api_port.lock() {
            *g = api_port;
        }

        let cfg_value = build_xray_config(server, settings, api_port);
        let cfg_json = serde_json::to_string(&cfg_value).map_err(|e| e.to_string())?;

        if let Ok(mut f) = self.stopping_intentionally.lock() {
            *f = false;
        }

        let bin_dir = bin_path.parent().unwrap_or(&self.data_dir);
        let mut cmd = Command::new(&bin_path);
        cmd.args(["run", "-c", "stdin:", "-format", "json"])
            .current_dir(bin_dir)
            .env("XRAY_LOCATION_ASSET", bin_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start Xray core: {}", sanitize_log_message(&e.to_string())))?;

        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(cfg_json.as_bytes());
            let _ = stdin.flush();
            drop(stdin);
        }

        if let Some(stdout) = child.stdout.take() {
            let log_out = self.logger.clone();
            std::thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                for line in BufReader::new(stdout).lines().flatten() {
                    let t = line.trim();
                    if !t.is_empty() {
                        log_out.info(&format!("[xray] {}", t));
                    }
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let log_err = self.logger.clone();
            std::thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                for line in BufReader::new(stderr).lines().flatten() {
                    let t = line.trim();
                    if !t.is_empty() {
                        log_err.warn(&format!("[xray] {}", t));
                    }
                }
            });
        }

        if let Ok(mut g) = self.child.lock() {
            *g = Some(child);
        }

        // Wait up to 4.5s for SOCKS5 port to begin listening cleanly
        let deadline = Instant::now() + Duration::from_millis(4500);
        while Instant::now() < deadline {
            if !self.is_running() {
                return Err("Xray exited prematurely during startup".to_string());
            }
            if TcpStream::connect_timeout(
                &format!("127.0.0.1:{}", settings.socks_port).parse().unwrap(),
                Duration::from_millis(200),
            )
            .is_ok()
            {
                break;
            }
            std::thread::sleep(Duration::from_millis(120));
        }

        Ok(())
    }

    pub fn poll_unexpected_exit(&self) -> Option<i32> {
        let stopping = *self.stopping_intentionally.lock().unwrap_or_else(|e| e.into_inner());
        let mut guard = self.child.lock().ok()?;
        let child = guard.as_mut()?;
        match child.try_wait() {
            Ok(Some(status)) => {
                *guard = None;
                if stopping {
                    None
                } else {
                    Some(status.code().unwrap_or(-1))
                }
            }
            _ => None,
        }
    }

    pub fn stop(&self) {
        if let Ok(mut f) = self.stopping_intentionally.lock() {
            *f = true;
        }
        let Ok(mut guard) = self.child.lock() else {
            return;
        };
        if let Some(mut child) = guard.take() {
            let pid = child.id();
            #[cfg(windows)]
            {
                let mut tk = Command::new("taskkill");
                tk.args(["/PID", &pid.to_string(), "/T", "/F"])
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .creation_flags(CREATE_NO_WINDOW);
                let _ = tk.output();
            }
            let _ = child.kill();
            let _ = child.wait();
            let _ = pid;
        }
    }
}

impl Drop for XrayManager {
    fn drop(&mut self) {
        self.stop();
    }
}
