use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProxyBackupState {
    pub proxy_enable: u32,
    pub proxy_server: Option<String>,
    pub proxy_override: Option<String>,
}

const DEFAULT_BYPASS_OVERRIDE: &str =
    "localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>";

#[cfg(windows)]
mod win_proxy {
    use super::ProxyBackupState;
    use std::ptr;
    use windows_sys::Win32::Networking::WinInet::{
        InternetSetOptionW, INTERNET_OPTION_REFRESH, INTERNET_OPTION_SETTINGS_CHANGED,
    };
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    pub fn notify_wininet_changed() {
        unsafe {
            InternetSetOptionW(
                ptr::null_mut(),
                INTERNET_OPTION_SETTINGS_CHANGED,
                ptr::null_mut(),
                0,
            );
            InternetSetOptionW(ptr::null_mut(), INTERNET_OPTION_REFRESH, ptr::null_mut(), 0);
        }
    }

    pub fn read_current() -> ProxyBackupState {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let Ok(key) = hkcu.open_subkey_with_flags(SUBKEY, KEY_READ) else {
            return ProxyBackupState::default();
        };
        let proxy_enable: u32 = key.get_value("ProxyEnable").unwrap_or(0);
        let proxy_server: Option<String> = key.get_value("ProxyServer").ok();
        let proxy_override: Option<String> = key.get_value("ProxyOverride").ok();
        ProxyBackupState {
            proxy_enable,
            proxy_server,
            proxy_override,
        }
    }

    pub fn write_enabled(http_port: u16, bypass_lan: bool) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey_with_flags(SUBKEY, KEY_WRITE)
            .map_err(|e| e.to_string())?;
        key.set_value("ProxyEnable", &1u32)
            .map_err(|e| e.to_string())?;
        key.set_value("ProxyServer", &format!("127.0.0.1:{}", http_port))
            .map_err(|e| e.to_string())?;
        if bypass_lan {
            key.set_value("ProxyOverride", &super::DEFAULT_BYPASS_OVERRIDE)
                .map_err(|e| e.to_string())?;
        }
        notify_wininet_changed();
        Ok(())
    }

    pub fn restore_state(state: &ProxyBackupState) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey_with_flags(SUBKEY, KEY_WRITE)
            .map_err(|e| e.to_string())?;
        key.set_value("ProxyEnable", &state.proxy_enable)
            .map_err(|e| e.to_string())?;
        if let Some(srv) = &state.proxy_server {
            let _ = key.set_value("ProxyServer", srv);
        } else {
            let _ = key.delete_value("ProxyServer");
        }
        if let Some(ovr) = &state.proxy_override {
            let _ = key.set_value("ProxyOverride", ovr);
        } else {
            let _ = key.delete_value("ProxyOverride");
        }
        notify_wininet_changed();
        Ok(())
    }
}

pub struct SystemProxyManager {
    backup_path: PathBuf,
}

impl SystemProxyManager {
    pub fn new(user_data_dir: &Path) -> Self {
        let _ = fs::create_dir_all(user_data_dir);
        Self {
            backup_path: user_data_dir.join("proxy-backup.json"),
        }
    }

    pub fn enable(&self, http_port: u16, bypass_lan: bool) -> Result<(), String> {
        #[cfg(windows)]
        {
            if !self.backup_path.exists() {
                let prev = win_proxy::read_current();
                if let Ok(json) = serde_json::to_string(&prev) {
                    let _ = fs::write(&self.backup_path, json);
                }
            }
            win_proxy::write_enabled(http_port, bypass_lan)?;
        }
        let _ = (http_port, bypass_lan);
        Ok(())
    }

    pub fn disable_and_restore(&self) -> Result<(), String> {
        #[cfg(windows)]
        {
            if self.backup_path.exists() {
                if let Ok(raw) = fs::read_to_string(&self.backup_path) {
                    if let Ok(prev) = serde_json::from_str::<ProxyBackupState>(&raw) {
                        win_proxy::restore_state(&prev)?;
                    }
                }
                let _ = fs::remove_file(&self.backup_path);
            } else {
                let current = win_proxy::read_current();
                if current
                    .proxy_server
                    .as_deref()
                    .map(|s| s.starts_with("127.0.0.1:"))
                    .unwrap_or(false)
                {
                    win_proxy::restore_state(&ProxyBackupState {
                        proxy_enable: 0,
                        proxy_server: None,
                        proxy_override: None,
                    })?;
                }
            }
        }
        Ok(())
    }

    pub fn recover_if_dirty(&self) {
        if self.backup_path.exists() {
            let _ = self.disable_and_restore();
        }
    }
}
