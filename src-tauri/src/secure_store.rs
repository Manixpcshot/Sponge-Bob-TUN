use crate::log_sanitizer::{register_secret, register_secrets_from_servers};
use crate::types::{AppSettings, ServerSecretRecord, SubscriptionUserInfo};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultState {
    pub subscription_url: String,
    pub servers: Vec<ServerSecretRecord>,
    pub pinned_ids: Vec<String>,
    pub selected_server_id: Option<String>,
    pub user_info: Option<SubscriptionUserInfo>,
    pub settings: AppSettings,
}

impl Default for VaultState {
    fn default() -> Self {
        Self {
            subscription_url: String::new(),
            servers: Vec::new(),
            pinned_ids: Vec::new(),
            selected_server_id: None,
            user_info: None,
            settings: AppSettings::default(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct EncryptedVaultFile {
    version: u8,
    mode: String,
    iv: Option<String>,
    tag: Option<String>,
    payload: String,
}

#[cfg(windows)]
mod dpapi {
    use std::ptr;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    pub fn encrypt(plain: &[u8]) -> Option<Vec<u8>> {
        let mut in_blob = CRYPT_INTEGER_BLOB {
            cbData: plain.len() as u32,
            pbData: plain.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &mut in_blob,
                ptr::null(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            )
        };
        if ok == 0 || out_blob.pbData.is_null() {
            return None;
        }
        let slice =
            unsafe { std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize) };
        let res = slice.to_vec();
        unsafe { LocalFree(out_blob.pbData as _) };
        Some(res)
    }

    pub fn decrypt(encrypted: &[u8]) -> Option<Vec<u8>> {
        let mut in_blob = CRYPT_INTEGER_BLOB {
            cbData: encrypted.len() as u32,
            pbData: encrypted.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &mut in_blob,
                ptr::null_mut(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            )
        };
        if ok == 0 || out_blob.pbData.is_null() {
            return None;
        }
        let slice =
            unsafe { std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize) };
        let res = slice.to_vec();
        unsafe { LocalFree(out_blob.pbData as _) };
        Some(res)
    }
}

pub fn resolve_data_dir(default_app_data: PathBuf) -> PathBuf {
    if crate::updater::is_portable_runtime() {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let candidate = exe_dir.join("SpongeBobTUN-Data");
                if fs::create_dir_all(&candidate).is_ok() {
                    let probe = candidate.join(".write-check");
                    if fs::write(&probe, b"1").is_ok() {
                        let _ = fs::remove_file(&probe);
                        return candidate;
                    }
                }
            }
        }
    }
    let _ = fs::create_dir_all(&default_app_data);
    default_app_data
}

pub struct SecureVaultStore {
    vault_path: PathBuf,
    key_path: PathBuf,
    use_dpapi: bool,
}

impl SecureVaultStore {
    pub fn new(user_data_dir: &Path) -> Self {
        let _ = fs::create_dir_all(user_data_dir);
        Self {
            vault_path: user_data_dir.join("vault.sbx"),
            key_path: user_data_dir.join(".vault.key"),
            use_dpapi: cfg!(windows),
        }
    }

    fn get_or_create_fallback_key(&self) -> [u8; 32] {
        if let Ok(hex_str) = fs::read_to_string(&self.key_path) {
            if let Ok(bytes) = hex::decode(hex_str.trim()) {
                if bytes.len() == 32 {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&bytes);
                    return arr;
                }
            }
        }
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        let _ = fs::write(&self.key_path, hex::encode(key));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&self.key_path, fs::Permissions::from_mode(0o600));
        }
        key
    }

    pub fn load(&self) -> VaultState {
        let Ok(raw) = fs::read_to_string(&self.vault_path) else {
            return VaultState::default();
        };
        let Ok(env) = serde_json::from_str::<EncryptedVaultFile>(&raw) else {
            return VaultState::default();
        };

        let plain_bytes: Option<Vec<u8>> = if env.mode == "dpapi" {
            #[cfg(windows)]
            {
                STANDARD
                    .decode(&env.payload)
                    .ok()
                    .and_then(|b| dpapi::decrypt(&b))
            }
            #[cfg(not(windows))]
            {
                None
            }
        } else if env.mode == "aes-256-gcm" {
            let iv = env
                .iv
                .as_deref()
                .and_then(|s| STANDARD.decode(s).ok())
                .unwrap_or_default();
            let tag = env
                .tag
                .as_deref()
                .and_then(|s| STANDARD.decode(s).ok())
                .unwrap_or_default();
            let data = STANDARD.decode(&env.payload).unwrap_or_default();
            if iv.len() == 12 && tag.len() == 16 {
                let key = self.get_or_create_fallback_key();
                if let Ok(cipher) = Aes256Gcm::new_from_slice(&key) {
                    let mut combined = data;
                    combined.extend_from_slice(&tag);
                    cipher.decrypt(Nonce::from_slice(&iv), combined.as_ref()).ok()
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let Some(bytes) = plain_bytes else {
            return VaultState::default();
        };

        let Ok(state) = serde_json::from_slice::<VaultState>(&bytes) else {
            return VaultState::default();
        };

        if !state.subscription_url.is_empty() {
            register_secret(&state.subscription_url);
        }
        if !state.servers.is_empty() {
            register_secrets_from_servers(&state.servers);
        }

        state
    }

    pub fn save(&self, state: &VaultState) {
        if !state.subscription_url.is_empty() {
            register_secret(&state.subscription_url);
        }
        if !state.servers.is_empty() {
            register_secrets_from_servers(&state.servers);
        }

        let Ok(json) = serde_json::to_vec(state) else {
            return;
        };

        let mut env_opt: Option<EncryptedVaultFile> = None;

        if self.use_dpapi {
            #[cfg(windows)]
            if let Some(enc) = dpapi::encrypt(&json) {
                env_opt = Some(EncryptedVaultFile {
                    version: 1,
                    mode: "dpapi".to_string(),
                    iv: None,
                    tag: None,
                    payload: STANDARD.encode(enc),
                });
            }
        }

        if env_opt.is_none() {
            let key = self.get_or_create_fallback_key();
            let mut iv = [0u8; 12];
            rand::thread_rng().fill_bytes(&mut iv);
            if let Ok(cipher) = Aes256Gcm::new_from_slice(&key) {
                if let Ok(mut encrypted) = cipher.encrypt(Nonce::from_slice(&iv), json.as_ref()) {
                    let tag_start = encrypted.len() - 16;
                    let tag = encrypted.split_off(tag_start);
                    env_opt = Some(EncryptedVaultFile {
                        version: 1,
                        mode: "aes-256-gcm".to_string(),
                        iv: Some(STANDARD.encode(iv)),
                        tag: Some(STANDARD.encode(tag)),
                        payload: STANDARD.encode(encrypted),
                    });
                }
            }
        }

        if let Some(env) = env_opt {
            if let Ok(out) = serde_json::to_string(&env) {
                let tmp = self.vault_path.with_extension("sbx.tmp");
                if fs::write(&tmp, out).is_ok() {
                    let _ = fs::rename(&tmp, &self.vault_path);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vless_parser::parse_vless_uri;

    #[test]
    fn saves_vault_encrypted_without_plaintext_leaks() {
        let tmp = std::env::temp_dir().join(format!("sbt-rust-vault-{}", rand::random::<u32>()));
        let store = SecureVaultStore::new(&tmp);
        let mut state = VaultState::default();
        state.subscription_url = "https://secret-panel.example.org/sub/my-token".to_string();
        state.servers.push(
            parse_vless_uri(
                "vless://11111111-2222-4333-8444-555555555555@198.51.100.88:443?type=tcp#TopSecretNode",
                0,
            )
            .unwrap(),
        );
        store.save(&state);

        let disk_contents = fs::read_to_string(tmp.join("vault.sbx")).unwrap();
        assert!(!disk_contents.contains("secret-panel.example.org"));
        assert!(!disk_contents.contains("198.51.100.88"));
        assert!(!disk_contents.contains("11111111-2222-4333-8444-555555555555"));

        let loaded = store.load();
        assert_eq!(loaded.subscription_url, state.subscription_url);
        assert_eq!(loaded.servers.len(), 1);
        let _ = fs::remove_dir_all(&tmp);
    }
}
