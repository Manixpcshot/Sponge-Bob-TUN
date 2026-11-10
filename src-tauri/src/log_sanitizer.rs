use crate::types::{SafeLogEntry, ServerSecretRecord};
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::{HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

static REGISTERED_SECRETS: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

static RE_PROXY_URI: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)\b(?:vless|vmess|trojan|ss|ssr|hy2|hysteria2|tuic|wireguard)://[^\s"'<>]+"#)
        .unwrap()
});
static RE_HTTP_URL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)https?://[^\s"'<>]+"#).unwrap());
static RE_UUID: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b").unwrap()
});
static RE_KV_SECRET: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)\b(pbk|sid|spx|sni|password|pass|pwd|secret|token|auth|key|uuid|id)\s*[:=]\s*([^\s,&;"'}]+)"#)
        .unwrap()
});
static RE_IPV4: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(\d{1,3}(?:\.\d{1,3}){3})(:\d+)?\b").unwrap());
static RE_IPV6: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}(?::\d+)?").unwrap()
});
static RE_LONG_B64: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b[A-Za-z0-9+/_-]{32,}={0,2}\b").unwrap());

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn register_secret(secret: &str) {
    let trimmed = secret.trim();
    if trimmed.len() >= 4 && trimmed != "127.0.0.1" && trimmed != "0.0.0.0" {
        if let Ok(mut guard) = REGISTERED_SECRETS.lock() {
            guard.insert(trimmed.to_string());
        }
    }
}

pub fn register_secrets_from_servers(servers: &[ServerSecretRecord]) {
    for s in servers {
        register_secret(&s.address);
        register_secret(&s.uuid);
        if let Some(v) = &s.pbk {
            register_secret(v);
        }
        if let Some(v) = &s.sid {
            register_secret(v);
        }
        if let Some(v) = &s.sni {
            register_secret(v);
        }
        if let Some(v) = &s.host_header {
            register_secret(v);
        }
        if let Some(v) = &s.authority {
            register_secret(v);
        }
    }
}

#[cfg(test)]
pub fn clear_registered_secrets() {
    if let Ok(mut guard) = REGISTERED_SECRETS.lock() {
        guard.clear();
    }
}

pub fn sanitize_log_message(input: &str) -> String {
    let mut msg = input.to_string();

    if let Ok(guard) = REGISTERED_SECRETS.lock() {
        let mut sorted: Vec<&String> = guard.iter().collect();
        sorted.sort_by(|a, b| b.len().cmp(&a.len()));
        for secret in sorted {
            if secret.len() >= 4 && secret.as_str() != "127.0.0.1" && secret.as_str() != "0.0.0.0"
            {
                if let Ok(re) = Regex::new(&format!("(?i){}", regex::escape(secret))) {
                    msg = re.replace_all(&msg, "[REDACTED]").into_owned();
                }
            }
        }
    }

    msg = RE_PROXY_URI
        .replace_all(&msg, "[REDACTED_CONFIG_URI]")
        .into_owned();
    msg = RE_HTTP_URL
        .replace_all(&msg, "[REDACTED_URL]")
        .into_owned();
    msg = RE_UUID.replace_all(&msg, "[REDACTED_UUID]").into_owned();
    msg = RE_KV_SECRET
        .replace_all(&msg, "$1=[REDACTED]")
        .into_owned();
    msg = RE_IPV4
        .replace_all(&msg, |caps: &regex::Captures| {
            let ip = &caps[1];
            if ip == "127.0.0.1" || ip == "0.0.0.0" {
                caps[0].to_string()
            } else {
                "[REDACTED_IP]".to_string()
            }
        })
        .into_owned();
    msg = RE_IPV6
        .replace_all(&msg, |caps: &regex::Captures| {
            if &caps[0] == "::1" {
                "::1".to_string()
            } else {
                "[REDACTED_IP6]".to_string()
            }
        })
        .into_owned();
    msg = RE_LONG_B64
        .replace_all(&msg, "[REDACTED_TOKEN]")
        .into_owned();

    msg
}

pub fn mask_url_for_display(raw_url: &str) -> String {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    match Url::parse(trimmed) {
        Ok(u) => format!("{}://••••••••••/••••", u.scheme()),
        Err(_) => "••••••••••••••••••••".to_string(),
    }
}

pub struct SafeLogger {
    entries: Mutex<VecDeque<SafeLogEntry>>,
    max_entries: usize,
}

impl SafeLogger {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(VecDeque::with_capacity(200)),
            max_entries: 200,
        }
    }

    fn push(&self, level: &str, raw: &str) {
        let sanitized = sanitize_log_message(raw);
        if let Ok(mut guard) = self.entries.lock() {
            guard.push_back(SafeLogEntry {
                ts: now_millis(),
                level: level.to_string(),
                message: sanitized,
            });
            while guard.len() > self.max_entries {
                guard.pop_front();
            }
        }
    }

    pub fn info(&self, msg: &str) {
        self.push("info", msg);
    }

    pub fn warn(&self, msg: &str) {
        self.push("warn", msg);
    }

    pub fn error(&self, msg: &str) {
        self.push("error", msg);
    }

    pub fn get_entries(&self) -> Vec<SafeLogEntry> {
        self.entries
            .lock()
            .map(|g| g.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.entries.lock() {
            guard.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_all_sensitive_patterns_but_keeps_loopback() {
        clear_registered_secrets();
        let sub_url = "https://panel.secret.example.org/sub/mySecretToken99";
        register_secret(sub_url);
        register_secret("panel.secret.example.org");

        let input = format!(
            "Error connecting {} with vless://11111111-2222-4333-8444-555555555555@198.51.100.42:443?pbk=MyPubKey123456&sid=ab12 on 127.0.0.1:10808",
            sub_url
        );
        let cleaned = sanitize_log_message(&input);
        assert!(!cleaned.contains("panel.secret.example.org"));
        assert!(!cleaned.contains("198.51.100.42"));
        assert!(!cleaned.contains("11111111-2222-4333-8444-555555555555"));
        assert!(!cleaned.contains("MyPubKey123456"));
        assert!(cleaned.contains("127.0.0.1:10808"));
        clear_registered_secrets();
    }
}
