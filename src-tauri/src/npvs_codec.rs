use crate::types::ServerSecretRecord;
use crate::vless_parser::{build_vless_uri_from_record, decode_base64_flexible, parse_vless_payload};
use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use flate2::{
    read::{GzDecoder, ZlibDecoder},
    write::ZlibEncoder,
    Compression,
};
use hmac::Hmac;
use md5::Md5;
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};

type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;
type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;

#[derive(Debug, PartialEq, Eq)]
pub enum NpvsStatus {
    Ok,
    NeedsPassword,
    InvalidPassword,
    Unsupported,
}

pub struct NpvsDecodeResult {
    pub status: NpvsStatus,
    pub servers: Vec<ServerSecretRecord>,
    pub inline_headers: HashMap<String, String>,
    pub error_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SpongeNpvsEnvelope {
    format: String,
    cipher: String,
    kdf: String,
    iterations: u32,
    salt: String,
    iv: String,
    tag: String,
    data: String,
}

fn try_decompress(buf: &[u8]) -> Option<Vec<u8>> {
    if buf.len() < 2 {
        return None;
    }
    if buf[0] == 0x1F && buf[1] == 0x8B {
        let mut decoder = GzDecoder::new(buf);
        let mut out = Vec::new();
        if decoder.read_to_end(&mut out).is_ok() {
            return Some(out);
        }
    } else if buf[0] == 0x78 && matches!(buf[1], 0x9C | 0xDA | 0x01) {
        let mut decoder = ZlibDecoder::new(buf);
        let mut out = Vec::new();
        if decoder.read_to_end(&mut out).is_ok() {
            return Some(out);
        }
    }
    None
}

fn evp_bytes_to_key(
    password: &str,
    salt: &[u8],
    key_len: usize,
    iv_len: usize,
    use_sha256: bool,
) -> (Vec<u8>, Vec<u8>) {
    let mut derived = Vec::new();
    let mut prev: Vec<u8> = Vec::new();
    while derived.len() < key_len + iv_len {
        if use_sha256 {
            let mut h = Sha256::new();
            h.update(&prev);
            h.update(password.as_bytes());
            h.update(salt);
            prev = h.finalize().to_vec();
        } else {
            let mut h = Md5::new();
            h.update(&prev);
            h.update(password.as_bytes());
            h.update(salt);
            prev = h.finalize().to_vec();
        }
        derived.extend_from_slice(&prev);
    }
    (
        derived[..key_len].to_vec(),
        derived[key_len..key_len + iv_len].to_vec(),
    )
}

fn is_likely_config_payload(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_lowercase();
    if lower.contains("vless://") {
        return true;
    }
    if (trimmed.starts_with('{') || trimmed.starts_with('['))
        && (lower.contains("vnext")
            || lower.contains("vless")
            || lower.contains("outbounds")
            || lower.contains("servers")
            || lower.contains("configs"))
    {
        return true;
    }
    let (servers, _) = parse_vless_payload(trimmed);
    !servers.is_empty()
}

fn try_decrypt_openssl_salted(salted_buf: &[u8], password: &str) -> Option<String> {
    if salted_buf.len() <= 16 || &salted_buf[..8] != b"Salted__" {
        return None;
    }
    let salt = &salted_buf[8..16];
    let ciphertext = &salted_buf[16..];

    let candidates = [
        evp_bytes_to_key(password, salt, 32, 16, false),
        evp_bytes_to_key(password, salt, 32, 16, true),
        {
            let mut derived = [0u8; 48];
            pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, 10000, &mut derived);
            (derived[..32].to_vec(), derived[32..48].to_vec())
        },
        evp_bytes_to_key(password, salt, 16, 16, false),
    ];

    for (key, iv) in candidates {
        let mut buf = ciphertext.to_vec();
        let plain_res = if key.len() == 32 {
            Aes256CbcDec::new_from_slices(&key, &iv)
                .ok()
                .and_then(|d| d.decrypt_padded_mut::<Pkcs7>(&mut buf).ok().map(|p| p.to_vec()))
        } else {
            Aes128CbcDec::new_from_slices(&key, &iv)
                .ok()
                .and_then(|d| d.decrypt_padded_mut::<Pkcs7>(&mut buf).ok().map(|p| p.to_vec()))
        };

        if let Some(plain) = plain_res {
            let final_bytes = try_decompress(&plain).unwrap_or(plain);
            if let Ok(text) = String::from_utf8(final_bytes) {
                if is_likely_config_payload(&text) {
                    return Some(text);
                }
            }
        }
    }
    None
}

fn try_decrypt_sponge_envelope(env: &SpongeNpvsEnvelope, password: &str) -> Option<String> {
    let salt = STANDARD.decode(&env.salt).ok()?;
    let iv = STANDARD.decode(&env.iv).ok()?;
    let tag = STANDARD.decode(&env.tag).ok()?;
    let data = STANDARD.decode(&env.data).ok()?;
    let iterations = if env.iterations >= 1000 {
        env.iterations
    } else {
        120_000
    };

    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, iterations, &mut key);
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;
    let mut combined = Vec::with_capacity(data.len() + tag.len());
    combined.extend_from_slice(&data);
    combined.extend_from_slice(&tag);

    let plain = cipher.decrypt(Nonce::from_slice(&iv), combined.as_ref()).ok()?;
    let decompressed = try_decompress(&plain).unwrap_or(plain);
    String::from_utf8(decompressed).ok()
}

fn try_decrypt_generic_envelope(
    obj: &serde_json::Map<String, serde_json::Value>,
    password: &str,
) -> Option<String> {
    let data_raw = obj
        .get("data")
        .or_else(|| obj.get("payload"))
        .and_then(|v| v.as_str())?;
    let data_buf = STANDARD.decode(data_raw).ok()?;
    if data_buf.starts_with(b"Salted__") {
        if let Some(s) = try_decrypt_openssl_salted(&data_buf, password) {
            return Some(s);
        }
    }

    let iv_buf = obj
        .get("iv")
        .and_then(|v| v.as_str())
        .and_then(|s| STANDARD.decode(s).ok())
        .unwrap_or_else(|| vec![0u8; 16]);
    let tag_buf = obj
        .get("tag")
        .and_then(|v| v.as_str())
        .and_then(|s| STANDARD.decode(s).ok());

    let mut key_candidates = Vec::new();
    if let Some(salt_str) = obj.get("salt").and_then(|v| v.as_str()) {
        if let Ok(salt) = STANDARD.decode(salt_str) {
            let mut k1 = [0u8; 32];
            pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, 100_000, &mut k1);
            key_candidates.push(k1.to_vec());
            let mut k2 = [0u8; 32];
            pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, 10_000, &mut k2);
            key_candidates.push(k2.to_vec());
        }
    }
    key_candidates.push(Sha256::digest(password.as_bytes()).to_vec());
    key_candidates.push(Md5::digest(password.as_bytes()).to_vec());

    for key in key_candidates {
        if let Some(tag) = &tag_buf {
            if key.len() == 32 && iv_buf.len() == 12 {
                if let Ok(cipher) = Aes256Gcm::new_from_slice(&key) {
                    let mut combined = data_buf.clone();
                    combined.extend_from_slice(tag);
                    if let Ok(plain) = cipher.decrypt(Nonce::from_slice(&iv_buf), combined.as_ref()) {
                        if let Ok(s) = String::from_utf8(plain) {
                            if is_likely_config_payload(&s) {
                                return Some(s);
                            }
                        }
                    }
                }
            }
        }
        if iv_buf.len() == 16 {
            let mut buf = data_buf.clone();
            let plain_opt = if key.len() == 32 {
                Aes256CbcDec::new_from_slices(&key, &iv_buf)
                    .ok()
                    .and_then(|d| d.decrypt_padded_mut::<Pkcs7>(&mut buf).ok().map(|p| p.to_vec()))
            } else {
                Aes128CbcDec::new_from_slices(&key, &iv_buf)
                    .ok()
                    .and_then(|d| d.decrypt_padded_mut::<Pkcs7>(&mut buf).ok().map(|p| p.to_vec()))
            };
            if let Some(plain) = plain_opt {
                if let Ok(s) = String::from_utf8(plain) {
                    if is_likely_config_payload(&s) {
                        return Some(s);
                    }
                }
            }
        }
    }

    None
}

enum EncryptedKind {
    None,
    Sponge(SpongeNpvsEnvelope),
    Salted(Vec<u8>),
    Generic(serde_json::Map<String, serde_json::Value>),
    RawBinary,
}

fn detect_encrypted(raw_buf: &[u8], trimmed_text: &str) -> EncryptedKind {
    if raw_buf.starts_with(b"Salted__") {
        return EncryptedKind::Salted(raw_buf.to_vec());
    }
    if trimmed_text.starts_with("U2FsdGVkX1") {
        let compact: String = trimmed_text.chars().filter(|c| !c.is_whitespace()).collect();
        if let Ok(decoded) = STANDARD.decode(compact.as_bytes()) {
            return EncryptedKind::Salted(decoded);
        }
    }
    if trimmed_text.starts_with('{') {
        if let Ok(env) = serde_json::from_str::<SpongeNpvsEnvelope>(trimmed_text) {
            if env.format == "sponge-npvs-v1" {
                return EncryptedKind::Sponge(env);
            }
        }
        if let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(trimmed_text) {
            let has_data = map.get("data").and_then(|v| v.as_str()).is_some();
            let has_enc = map.get("encrypted").and_then(|v| v.as_bool()) == Some(true)
                || map.contains_key("iv")
                || map.contains_key("salt")
                || map.contains_key("cipher");
            if has_data && has_enc {
                return EncryptedKind::Generic(map);
            }
        }
    }
    if let Some(decoded) = decode_base64_flexible(trimmed_text) {
        if decoded.starts_with(b"Salted__") {
            return EncryptedKind::Salted(decoded);
        }
        if let Ok(inner_text) = String::from_utf8(decoded) {
            if let Ok(env) = serde_json::from_str::<SpongeNpvsEnvelope>(inner_text.trim()) {
                if env.format == "sponge-npvs-v1" {
                    return EncryptedKind::Sponge(env);
                }
            }
        }
    }

    let sample_len = raw_buf.len().min(256);
    if sample_len > 16 {
        let non_printable = raw_buf[..sample_len]
            .iter()
            .filter(|&&b| b < 9 || (b > 13 && b < 32))
            .count();
        if non_printable * 100 / sample_len > 15 {
            return EncryptedKind::RawBinary;
        }
    }

    EncryptedKind::None
}

pub fn decode_npvs_or_subscription_payload(
    raw_input: &[u8],
    password: Option<&str>,
) -> NpvsDecodeResult {
    let decompressed = try_decompress(raw_input);
    let working_buf = decompressed.as_deref().unwrap_or(raw_input);
    let text = String::from_utf8_lossy(working_buf)
        .trim_start_matches('\u{feff}')
        .trim()
        .to_string();

    if text.is_empty() && working_buf.is_empty() {
        return NpvsDecodeResult {
            status: NpvsStatus::Unsupported,
            servers: vec![],
            inline_headers: HashMap::new(),
            error_code: Some("EMPTY_INPUT".to_string()),
        };
    }

    match detect_encrypted(working_buf, &text) {
        EncryptedKind::None => {}
        kind => {
            let Some(pwd) = password.filter(|p| !p.is_empty()) else {
                return NpvsDecodeResult {
                    status: NpvsStatus::NeedsPassword,
                    servers: vec![],
                    inline_headers: HashMap::new(),
                    error_code: None,
                };
            };

            let decrypted = match kind {
                EncryptedKind::Sponge(env) => try_decrypt_sponge_envelope(&env, pwd),
                EncryptedKind::Salted(buf) => try_decrypt_openssl_salted(&buf, pwd),
                EncryptedKind::Generic(map) => try_decrypt_generic_envelope(&map, pwd),
                EncryptedKind::RawBinary => try_decrypt_openssl_salted(working_buf, pwd),
                EncryptedKind::None => None,
            };

            let Some(plain_text) = decrypted else {
                return NpvsDecodeResult {
                    status: NpvsStatus::InvalidPassword,
                    servers: vec![],
                    inline_headers: HashMap::new(),
                    error_code: Some("INVALID_PASSWORD".to_string()),
                };
            };

            let (servers, headers) = parse_vless_payload(&plain_text);
            if servers.is_empty() {
                return NpvsDecodeResult {
                    status: NpvsStatus::Unsupported,
                    servers: vec![],
                    inline_headers: headers,
                    error_code: Some("NO_VLESS_FOUND".to_string()),
                };
            }
            return NpvsDecodeResult {
                status: NpvsStatus::Ok,
                servers,
                inline_headers: headers,
                error_code: None,
            };
        }
    }

    let (servers, headers) = parse_vless_payload(&text);
    if !servers.is_empty() {
        return NpvsDecodeResult {
            status: NpvsStatus::Ok,
            servers,
            inline_headers: headers,
            error_code: None,
        };
    }

    NpvsDecodeResult {
        status: NpvsStatus::Unsupported,
        servers: vec![],
        inline_headers: headers,
        error_code: Some("NO_VLESS_FOUND".to_string()),
    }
}

pub fn export_npvs_payload(servers: &[ServerSecretRecord], password: Option<&str>) -> String {
    let uris = servers
        .iter()
        .map(build_vless_uri_from_record)
        .collect::<Vec<_>>()
        .join("\n");

    let Some(pwd) = password.filter(|p| !p.is_empty()) else {
        return STANDARD.encode(uris.as_bytes());
    };

    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(uris.as_bytes()).unwrap();
    let compressed = encoder.finish().unwrap();

    let mut salt = [0u8; 16];
    let mut iv = [0u8; 12];
    let mut rng = rand::thread_rng();
    rng.fill_bytes(&mut salt);
    rng.fill_bytes(&mut iv);

    let iterations = 120_000u32;
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(pwd.as_bytes(), &salt, iterations, &mut key);

    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    let mut encrypted = cipher
        .encrypt(Nonce::from_slice(&iv), compressed.as_ref())
        .unwrap();
    let tag_start = encrypted.len() - 16;
    let tag = encrypted.split_off(tag_start);

    let env = SpongeNpvsEnvelope {
        format: "sponge-npvs-v1".to_string(),
        cipher: "aes-256-gcm".to_string(),
        kdf: "pbkdf2-sha256".to_string(),
        iterations,
        salt: STANDARD.encode(salt),
        iv: STANDARD.encode(iv),
        tag: STANDARD.encode(tag),
        data: STANDARD.encode(encrypted),
    };

    serde_json::to_string_pretty(&env).unwrap()
}

// Keep Hmac referenced cleanly for pbkdf2 type checks if needed
#[allow(dead_code)]
type _HmacSha256 = Hmac<Sha256>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vless_parser::parse_vless_uri;

    #[test]
    fn roundtrips_encrypted_sponge_npvs_v1() {
        let srv = parse_vless_uri(
            "vless://aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee@198.51.100.10:443?type=tcp&security=reality&pbk=pk123&sid=12#DE-Test",
            0,
        )
        .unwrap();
        let exported = export_npvs_payload(&[srv], Some("krabby-secret"));

        let no_pwd = decode_npvs_or_subscription_payload(exported.as_bytes(), None);
        assert_eq!(no_pwd.status, NpvsStatus::NeedsPassword);

        let bad_pwd = decode_npvs_or_subscription_payload(exported.as_bytes(), Some("plankton"));
        assert_eq!(bad_pwd.status, NpvsStatus::InvalidPassword);

        let ok = decode_npvs_or_subscription_payload(exported.as_bytes(), Some("krabby-secret"));
        assert_eq!(ok.status, NpvsStatus::Ok);
        assert_eq!(ok.servers.len(), 1);
        assert_eq!(ok.servers[0].remark, "DE-Test");
    }
}
