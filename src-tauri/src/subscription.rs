use crate::log_sanitizer::{now_millis, register_secret, register_secrets_from_servers, sanitize_log_message};
use crate::npvs_codec::{decode_npvs_or_subscription_payload, NpvsStatus};
use crate::types::{QuotaAlertState, ServerSecretRecord, SubscriptionUserInfo};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use regex::Regex;
use std::time::Duration;
use url::Url;

pub fn parse_subscription_user_info(header_val: Option<&str>) -> Option<SubscriptionUserInfo> {
    let header = header_val?;
    let extract = |name: &str| -> Option<u64> {
        let re = Regex::new(&format!(r"(?i){}\s*=\s*(\d+)", name)).ok()?;
        re.captures(header)
            .and_then(|c| c[1].parse::<u64>().ok())
    };

    let up = extract("upload");
    let down = extract("download");
    let total = extract("total");
    let expire = extract("expire");

    if up.is_none() && down.is_none() && total.is_none() && expire.is_none() {
        return None;
    }

    Some(SubscriptionUserInfo {
        upload_bytes: up.unwrap_or(0),
        download_bytes: down.unwrap_or(0),
        total_bytes: total.unwrap_or(0),
        expire_timestamp_sec: expire.filter(|&e| e > 0).map(|e| e as i64),
        profile_title: None,
        update_interval_hours: None,
        updated_at: now_millis(),
    })
}

pub fn evaluate_quota_alert(
    info: Option<&SubscriptionUserInfo>,
    now_ms: i64,
) -> Option<QuotaAlertState> {
    let u = info?;
    let used_bytes = u.upload_bytes.saturating_add(u.download_bytes);
    let total_bytes = u.total_bytes;
    let percent_used = if total_bytes > 0 {
        Some(((used_bytes as f64 / total_bytes as f64) * 100.0).min(100.0))
    } else {
        None
    };

    let days_remaining = u
        .expire_timestamp_sec
        .filter(|&ts| ts > 0)
        .map(|ts| ((ts * 1000 - now_ms) as f64) / 86_400_000.0);

    let is_expired = days_remaining.map(|d| d <= 0.0).unwrap_or(false);
    let is_over80_percent = percent_used.map(|p| p >= 80.0).unwrap_or(false);
    let is_expiring_soon = days_remaining.map(|d| d < 3.0).unwrap_or(false);

    Some(QuotaAlertState {
        should_alert: is_over80_percent || is_expiring_soon,
        percent_used,
        days_remaining,
        is_expired,
        is_over80_percent,
        is_expiring_soon,
        used_bytes,
        total_bytes,
    })
}

fn decode_profile_title(raw: Option<&str>) -> Option<String> {
    let trimmed = raw?.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.len() >= 7 && trimmed[..7].eq_ignore_ascii_case("base64:") {
        let b64 = trimmed[7..].trim();
        return STANDARD
            .decode(b64.as_bytes())
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
            .map(|s| s.trim().to_string());
    }
    Some(trimmed.to_string())
}

pub enum FetchStatus {
    Ok,
    NeedsPassword,
    InvalidPassword,
    Error,
}

pub struct FetchSubscriptionResult {
    pub status: FetchStatus,
    pub servers: Vec<ServerSecretRecord>,
    pub user_info: Option<SubscriptionUserInfo>,
    pub error_code: Option<String>,
}

pub async fn fetch_subscription_from_url(
    subscription_url: &str,
    password: Option<&str>,
) -> FetchSubscriptionResult {
    let cleaned = subscription_url.trim();
    if cleaned.is_empty() {
        return FetchSubscriptionResult {
            status: FetchStatus::Error,
            servers: vec![],
            user_info: None,
            error_code: Some("SUBSCRIPTION_URL_EMPTY".to_string()),
        };
    }

    let Ok(parsed) = Url::parse(cleaned) else {
        return FetchSubscriptionResult {
            status: FetchStatus::Error,
            servers: vec![],
            user_info: None,
            error_code: Some("SUBSCRIPTION_URL_INVALID".to_string()),
        };
    };

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return FetchSubscriptionResult {
            status: FetchStatus::Error,
            servers: vec![],
            user_info: None,
            error_code: Some("SUBSCRIPTION_URL_INVALID_SCHEME".to_string()),
        };
    }

    register_secret(cleaned);
    if let Some(host) = parsed.host_str() {
        register_secret(host);
    }
    register_secret(parsed.path());

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("SpongeBobTUN/1.1 (v2rayNG-compatible)")
        .build()
    {
        Ok(c) => c,
        Err(_) => {
            return FetchSubscriptionResult {
                status: FetchStatus::Error,
                servers: vec![],
                user_info: None,
                error_code: Some("SUBSCRIPTION_NETWORK_ERROR".to_string()),
            };
        }
    };

    let response = match client
        .get(cleaned)
        .header("Accept", "text/plain, application/json, application/octet-stream, */*")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let is_timeout = e.is_timeout() || sanitize_log_message(&e.to_string()).to_lowercase().contains("timed out");
            return FetchSubscriptionResult {
                status: FetchStatus::Error,
                servers: vec![],
                user_info: None,
                error_code: Some(if is_timeout {
                    "SUBSCRIPTION_TIMEOUT".to_string()
                } else {
                    "SUBSCRIPTION_NETWORK_ERROR".to_string()
                }),
            };
        }
    };

    if !response.status().is_success() {
        return FetchSubscriptionResult {
            status: FetchStatus::Error,
            servers: vec![],
            user_info: None,
            error_code: Some(format!("SUBSCRIPTION_HTTP_{}", response.status().as_u16())),
        };
    }

    let hdr_user_info = response
        .headers()
        .get("subscription-userinfo")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let hdr_title = response
        .headers()
        .get("profile-title")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let hdr_interval = response
        .headers()
        .get("profile-update-interval")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let Ok(bytes) = response.bytes().await else {
        return FetchSubscriptionResult {
            status: FetchStatus::Error,
            servers: vec![],
            user_info: None,
            error_code: Some("SUBSCRIPTION_NETWORK_ERROR".to_string()),
        };
    };

    let decoded = decode_npvs_or_subscription_payload(&bytes, password);
    match decoded.status {
        NpvsStatus::NeedsPassword => FetchSubscriptionResult {
            status: FetchStatus::NeedsPassword,
            servers: vec![],
            user_info: None,
            error_code: None,
        },
        NpvsStatus::InvalidPassword => FetchSubscriptionResult {
            status: FetchStatus::InvalidPassword,
            servers: vec![],
            user_info: None,
            error_code: Some("INVALID_PASSWORD".to_string()),
        },
        NpvsStatus::Unsupported => FetchSubscriptionResult {
            status: FetchStatus::Error,
            servers: vec![],
            user_info: None,
            error_code: decoded.error_code.or_else(|| Some("NO_VLESS_FOUND".to_string())),
        },
        NpvsStatus::Ok => {
            register_secrets_from_servers(&decoded.servers);
            let combined_ui = hdr_user_info
                .as_deref()
                .or_else(|| decoded.inline_headers.get("subscription-userinfo").map(|s| s.as_str()));
            let title = decode_profile_title(
                hdr_title
                    .as_deref()
                    .or_else(|| decoded.inline_headers.get("profile-title").map(|s| s.as_str())),
            );
            let interval_hours = hdr_interval
                .as_deref()
                .or_else(|| decoded.inline_headers.get("profile-update-interval").map(|s| s.as_str()))
                .and_then(|s| s.trim().parse::<u32>().ok());

            let user_info = if let Some(mut ui) = parse_subscription_user_info(combined_ui) {
                ui.profile_title = title;
                ui.update_interval_hours = interval_hours;
                Some(ui)
            } else if title.is_some() {
                Some(SubscriptionUserInfo {
                    upload_bytes: 0,
                    download_bytes: 0,
                    total_bytes: 0,
                    expire_timestamp_sec: None,
                    profile_title: title,
                    update_interval_hours: interval_hours,
                    updated_at: now_millis(),
                })
            } else {
                None
            };

            FetchSubscriptionResult {
                status: FetchStatus::Ok,
                servers: decoded.servers,
                user_info,
                error_code: None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn triggers_quota_alert_over_80_or_under_3_days() {
        let now_ms = 1_700_000_000_000i64;
        let expire_sec = (now_ms / 1000) + 2 * 86400;
        let hdr = format!("upload=100; download=750; total=1000; expire={}", expire_sec);
        let ui = parse_subscription_user_info(Some(&hdr)).unwrap();
        let alert = evaluate_quota_alert(Some(&ui), now_ms).unwrap();
        assert!(alert.should_alert);
        assert!(alert.is_over80_percent);
        assert!(alert.is_expiring_soon);
        assert!(!alert.is_expired);
    }
}
