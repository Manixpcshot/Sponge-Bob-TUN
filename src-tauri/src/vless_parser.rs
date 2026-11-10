use crate::types::ServerSecretRecord;
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use regex::Regex;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use url::Url;

struct CountryDef {
    code: &'static str,
    fa: &'static str,
    en: &'static str,
    keywords: &'static [&'static str],
}

const COUNTRIES: &[CountryDef] = &[
    CountryDef { code: "DE", fa: "آلمان", en: "Germany", keywords: &["germany", "deutschland", "آلمان", "المان", "frankfurt", "falkenstein", "nuremberg", "nuernberg", "berlin", "munich", "hetzner", "fsn1", "nbg1", "fra"] },
    CountryDef { code: "TR", fa: "ترکیه", en: "Turkey", keywords: &["turkey", "türkiye", "turkiye", "ترکیه", "istanbul", "ankara", "izmir", "ist"] },
    CountryDef { code: "NL", fa: "هلند", en: "Netherlands", keywords: &["netherlands", "holland", "هلند", "amsterdam", "rotterdam", "ams", "nl-"] },
    CountryDef { code: "FI", fa: "فنلاند", en: "Finland", keywords: &["finland", "suomi", "فنلاند", "helsinki", "hel1", "hel"] },
    CountryDef { code: "FR", fa: "فرانسه", en: "France", keywords: &["france", "فرانسه", "paris", "marseille", "lyon", "gravelines", "rbx", "sbg", "par"] },
    CountryDef { code: "GB", fa: "بریتانیا", en: "United Kingdom", keywords: &["united kingdom", "britain", "england", "انگلیس", "انگلستان", "بریتانیا", "london", "manchester", "uk", "lon"] },
    CountryDef { code: "US", fa: "آمریکا", en: "United States", keywords: &["united states", "america", "usa", "آمریکا", "امریکا", "ایالات متحده", "new york", "los angeles", "ashburn", "dallas", "miami", "chicago", "seattle", "silicon valley", "san jose", "nyc", "lax", "iad"] },
    CountryDef { code: "SE", fa: "سوئد", en: "Sweden", keywords: &["sweden", "سوئد", "stockholm", "sto", "arn"] },
    CountryDef { code: "CH", fa: "سوئیس", en: "Switzerland", keywords: &["switzerland", "سوئیس", "سوییس", "zurich", "zürich", "geneva", "zrh"] },
    CountryDef { code: "AT", fa: "اتریش", en: "Austria", keywords: &["austria", "اتریش", "vienna", "wien", "vie"] },
    CountryDef { code: "PL", fa: "لهستان", en: "Poland", keywords: &["poland", "لهستان", "warsaw", "waw"] },
    CountryDef { code: "AE", fa: "امارات", en: "UAE", keywords: &["uae", "emirates", "امارات", "دبی", "dubai", "abudhabi", "dxb"] },
    CountryDef { code: "SG", fa: "سنگاپور", en: "Singapore", keywords: &["singapore", "سنگاپور", "sin", "sgp"] },
    CountryDef { code: "JP", fa: "ژاپن", en: "Japan", keywords: &["japan", "ژاپن", "tokyo", "osaka", "nrt", "tyo"] },
    CountryDef { code: "CA", fa: "کانادا", en: "Canada", keywords: &["canada", "کانادا", "toronto", "montreal", "vancouver", "yyz", "yul"] },
    CountryDef { code: "RU", fa: "روسیه", en: "Russia", keywords: &["russia", "روسیه", "moscow", "petersburg", "spb", "msk"] },
    CountryDef { code: "IT", fa: "ایتالیا", en: "Italy", keywords: &["italy", "ایتالیا", "milan", "rome", "mil"] },
    CountryDef { code: "ES", fa: "اسپانیا", en: "Spain", keywords: &["spain", "اسپانیا", "madrid", "barcelona", "mad"] },
    CountryDef { code: "NO", fa: "نروژ", en: "Norway", keywords: &["norway", "نروژ", "oslo", "osl"] },
    CountryDef { code: "DK", fa: "دانمارک", en: "Denmark", keywords: &["denmark", "دانمارک", "copenhagen", "cph"] },
    CountryDef { code: "BE", fa: "بلژیک", en: "Belgium", keywords: &["belgium", "بلژیک", "brussels", "bru"] },
    CountryDef { code: "IE", fa: "ایرلند", en: "Ireland", keywords: &["ireland", "ایرلند", "dublin", "dub"] },
    CountryDef { code: "RO", fa: "رومانی", en: "Romania", keywords: &["romania", "رومانی", "bucharest", "otp"] },
    CountryDef { code: "CZ", fa: "چک", en: "Czechia", keywords: &["czech", "چک", "prague", "prg"] },
    CountryDef { code: "HU", fa: "مجارستان", en: "Hungary", keywords: &["hungary", "مجارستان", "budapest", "bud"] },
    CountryDef { code: "BG", fa: "بلغارستان", en: "Bulgaria", keywords: &["bulgaria", "بلغارستان", "sofia", "sof"] },
    CountryDef { code: "LU", fa: "لوکزامبورگ", en: "Luxembourg", keywords: &["luxembourg", "لوکزامبورگ", "lux"] },
    CountryDef { code: "EE", fa: "استونی", en: "Estonia", keywords: &["estonia", "استونی", "tallinn", "tll"] },
    CountryDef { code: "LV", fa: "لتونی", en: "Latvia", keywords: &["latvia", "لتونی", "riga", "rix"] },
    CountryDef { code: "LT", fa: "لیتوانی", en: "Lithuania", keywords: &["lithuania", "لیتوانی", "vilnius", "vno"] },
    CountryDef { code: "UA", fa: "اوکراین", en: "Ukraine", keywords: &["ukraine", "اوکراین", "kyiv", "kiev"] },
    CountryDef { code: "MD", fa: "مولداوی", en: "Moldova", keywords: &["moldova", "مولداوی", "chisinau"] },
    CountryDef { code: "HK", fa: "هنگ‌کنگ", en: "Hong Kong", keywords: &["hong kong", "hongkong", "هنگ کنگ", "هنگ‌کنگ", "hkg"] },
    CountryDef { code: "TW", fa: "تایوان", en: "Taiwan", keywords: &["taiwan", "تایوان", "taipei", "tpe"] },
    CountryDef { code: "KR", fa: "کره جنوبی", en: "South Korea", keywords: &["korea", "کره", "seoul", "icn"] },
    CountryDef { code: "IN", fa: "هند", en: "India", keywords: &["india", "هند", "mumbai", "bangalore", "bom"] },
    CountryDef { code: "AU", fa: "استرالیا", en: "Australia", keywords: &["australia", "استرالیا", "sydney", "melbourne", "syd"] },
    CountryDef { code: "BR", fa: "برزیل", en: "Brazil", keywords: &["brazil", "برزیل", "sao paulo", "gru"] },
    CountryDef { code: "OM", fa: "عمان", en: "Oman", keywords: &["oman", "عمان", "muscat"] },
    CountryDef { code: "QA", fa: "قطر", en: "Qatar", keywords: &["qatar", "قطر", "doha"] },
    CountryDef { code: "BH", fa: "بحرین", en: "Bahrain", keywords: &["bahrain", "بحرین", "manama"] },
    CountryDef { code: "AM", fa: "ارمنستان", en: "Armenia", keywords: &["armenia", "ارمنستان", "yerevan"] },
    CountryDef { code: "GE", fa: "گرجستان", en: "Georgia", keywords: &["georgia", "گرجستان", "tbilisi"] },
    CountryDef { code: "AZ", fa: "آذربایجان", en: "Azerbaijan", keywords: &["azerbaijan", "آذربایجان", "baku"] },
    CountryDef { code: "IR", fa: "ایران", en: "Iran", keywords: &["iran", "ایران", "tehran", "تهران"] },
];

pub fn extract_flag_emoji_code(text: &str) -> Option<String> {
    let chars: Vec<char> = text.chars().collect();
    for pair in chars.windows(2) {
        let cp1 = pair[0] as u32;
        let cp2 = pair[1] as u32;
        if (0x1F1E6..=0x1F1FF).contains(&cp1) && (0x1F1E6..=0x1F1FF).contains(&cp2) {
            let c1 = char::from_u32(cp1 - 0x1F1E6 + 65)?;
            let c2 = char::from_u32(cp2 - 0x1F1E6 + 65)?;
            let code: String = [c1, c2].into_iter().collect();
            return Some(if code == "UK" { "GB".to_string() } else { code });
        }
    }
    None
}

pub fn detect_country(remark: &str, address: Option<&str>) -> (String, String, String) {
    if let Some(code) = extract_flag_emoji_code(remark) {
        if let Some(c) = COUNTRIES.iter().find(|c| c.code == code) {
            return (c.code.to_string(), c.fa.to_string(), c.en.to_string());
        }
        return (code.clone(), code.clone(), code);
    }

    let combined = format!("{} {}", remark, address.unwrap_or("")).to_lowercase();
    for country in COUNTRIES {
        for kw in country.keywords {
            if kw.len() <= 4 && kw.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') {
                let pat = format!(
                    r"(?i)(?:^|[\s\[\]()\-_.:|,]){}(?:$|[\s\[\]()\-_.:|,0-9])",
                    regex::escape(kw)
                );
                if let Ok(re) = Regex::new(&pat) {
                    if re.is_match(&combined) {
                        return (
                            country.code.to_string(),
                            country.fa.to_string(),
                            country.en.to_string(),
                        );
                    }
                }
            } else if combined.contains(&kw.to_lowercase()) {
                return (
                    country.code.to_string(),
                    country.fa.to_string(),
                    country.en.to_string(),
                );
            }
        }
    }

    let upper = remark.to_uppercase();
    if let Ok(re) = Regex::new(r"(?:^|[\s\[\]()\-_.:|,])([A-Z]{2})(?:$|[\s\[\]()\-_.:|,0-9])") {
        for cap in re.captures_iter(&upper) {
            let tok = &cap[1];
            let code = if tok == "UK" { "GB" } else { tok };
            if let Some(c) = COUNTRIES.iter().find(|c| c.code == code) {
                return (c.code.to_string(), c.fa.to_string(), c.en.to_string());
            }
        }
    }

    ("UN".to_string(), "جهانی".to_string(), "Global".to_string())
}

fn percent_decode(input: &str) -> String {
    let replaced = input.replace('+', " ");
    url::form_urlencoded::parse(replaced.as_bytes())
        .map(|(k, v)| {
            if v.is_empty() {
                k.into_owned()
            } else {
                format!("{}={}", k, v)
            }
        })
        .collect::<Vec<_>>()
        .join("&")
}

fn decode_fragment_or_user(raw: &str) -> String {
    let mut out = Vec::new();
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex_str, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| percent_decode(raw))
}

fn normalize_network(raw: Option<&str>) -> String {
    let val = raw.unwrap_or("tcp").to_lowercase();
    match val.as_str() {
        "raw" | "tcp" => "tcp".to_string(),
        "ws" | "grpc" | "http" | "h2" | "httpupgrade" | "splithttp" | "xhttp" | "kcp" | "quic" => val,
        _ => "tcp".to_string(),
    }
}

fn normalize_security(raw: Option<&str>) -> String {
    let val = raw.unwrap_or("none").to_lowercase();
    match val.as_str() {
        "tls" | "reality" | "none" => val,
        "xtls" => "tls".to_string(),
        _ => "none".to_string(),
    }
}

fn make_server_id(canonical: &str) -> String {
    let digest = Sha256::digest(canonical.as_bytes());
    hex::encode(digest)[..16].to_string()
}

pub fn parse_vless_uri(raw_uri: &str, index: usize) -> Option<ServerSecretRecord> {
    let trimmed = raw_uri.trim();
    if !trimmed.to_lowercase().starts_with("vless://") {
        return None;
    }

    let parsed = Url::parse(trimmed).ok()?;
    let uuid = decode_fragment_or_user(parsed.username());
    let host = parsed.host_str()?.trim_matches(|c| c == '[' || c == ']').to_string();
    let port = parsed.port().unwrap_or(443);

    if uuid.is_empty() || host.is_empty() || port == 0 {
        return None;
    }

    let params: HashMap<String, String> = parsed
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    let raw_hash_text = parsed
        .fragment()
        .map(|f| decode_fragment_or_user(f).trim().to_string())
        .unwrap_or_default();
    let remark = if raw_hash_text.is_empty() {
        format!("Server #{}", index + 1)
    } else {
        raw_hash_text
    };

    let network = normalize_network(params.get("type").map(|s| s.as_str()));
    let security = normalize_security(params.get("security").map(|s| s.as_str()));
    let encryption = params
        .get("encryption")
        .cloned()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "none".to_string());
    let flow = params.get("flow").cloned().filter(|s| !s.is_empty());
    let sni = params
        .get("sni")
        .or_else(|| params.get("peer"))
        .cloned()
        .filter(|s| !s.is_empty());
    let fp = params.get("fp").cloned().filter(|s| !s.is_empty());
    let pbk = params.get("pbk").cloned().filter(|s| !s.is_empty());
    let sid = params.get("sid").cloned().filter(|s| !s.is_empty());
    let spx = params.get("spx").cloned().filter(|s| !s.is_empty());
    let alpn = params.get("alpn").map(|raw| {
        raw.split(',')
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect::<Vec<_>>()
    });
    let allow_insecure = matches!(
        params
            .get("allowInsecure")
            .or_else(|| params.get("insecure"))
            .map(|s| s.as_str()),
        Some("1") | Some("true")
    );

    let host_header = params.get("host").cloned().filter(|s| !s.is_empty());
    let path = params.get("path").cloned().filter(|s| !s.is_empty());
    let header_type = params.get("headerType").cloned().filter(|s| !s.is_empty());
    let service_name = params.get("serviceName").cloned().filter(|s| !s.is_empty());
    let grpc_mode = params.get("mode").cloned().filter(|s| !s.is_empty());
    let authority = params.get("authority").cloned().filter(|s| !s.is_empty());
    let seed = params.get("seed").cloned().filter(|s| !s.is_empty());
    let extra = params
        .get("extra")
        .and_then(|raw| serde_json::from_str::<HashMap<String, serde_json::Value>>(raw).ok());

    let (country_code, country_name_fa, country_name_en) = detect_country(&remark, Some(&host));
    let canonical = format!(
        "{}@{}:{}|{}|{}|{}|{}|{}|{}|{}",
        uuid,
        host,
        port,
        network,
        security,
        sni.as_deref().unwrap_or(""),
        pbk.as_deref().unwrap_or(""),
        path.as_deref().unwrap_or(""),
        service_name.as_deref().unwrap_or(""),
        remark
    );

    Some(ServerSecretRecord {
        id: make_server_id(&canonical),
        remark,
        address: host,
        port,
        uuid,
        encryption,
        flow,
        network,
        security,
        sni,
        fp,
        pbk,
        sid,
        spx,
        alpn,
        allow_insecure: if allow_insecure { Some(true) } else { None },
        host_header,
        path,
        header_type,
        service_name,
        grpc_mode,
        authority,
        extra,
        seed,
        country_code,
        country_name_fa,
        country_name_en,
        raw_hash: make_server_id(trimmed),
    })
}

pub fn parse_vless_json_value(val: &serde_json::Value) -> Vec<ServerSecretRecord> {
    let mut results = Vec::new();
    visit_json(val, None, &mut results);
    dedupe_servers(results)
}

fn visit_json(
    node: &serde_json::Value,
    fallback_remark: Option<&str>,
    results: &mut Vec<ServerSecretRecord>,
) {
    match node {
        serde_json::Value::Array(arr) => {
            for (idx, item) in arr.iter().enumerate() {
                let fallback = fallback_remark
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("Server #{}", idx + 1));
                visit_json(item, Some(&fallback), results);
            }
        }
        serde_json::Value::Object(map) => {
            if map.get("protocol").and_then(|v| v.as_str()) == Some("vless") {
                if let Some(settings) = map.get("settings").and_then(|v| v.as_object()) {
                    let vnext_list = settings
                        .get("vnext")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let stream = map.get("streamSettings").and_then(|v| v.as_object());

                    for v in vnext_list {
                        let Some(vo) = v.as_object() else { continue };
                        let address = vo.get("address").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        let port = vo.get("port").and_then(|x| x.as_u64()).unwrap_or(443) as u16;
                        let user = vo
                            .get("users")
                            .and_then(|x| x.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|x| x.as_object());
                        let uuid = user
                            .and_then(|u| u.get("id"))
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string();
                        if address.is_empty() || uuid.is_empty() || port == 0 {
                            continue;
                        }

                        let remark = map
                            .get("remark")
                            .or_else(|| map.get("name"))
                            .or_else(|| map.get("tag"))
                            .and_then(|x| x.as_str())
                            .or(fallback_remark)
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| format!("VLESS {}", results.len() + 1));

                        let network = normalize_network(
                            stream
                                .and_then(|s| s.get("network"))
                                .and_then(|x| x.as_str()),
                        );
                        let security = normalize_security(
                            stream
                                .and_then(|s| s.get("security"))
                                .and_then(|x| x.as_str()),
                        );

                        let tls = stream.and_then(|s| s.get("tlsSettings")).and_then(|x| x.as_object());
                        let reality = stream.and_then(|s| s.get("realitySettings")).and_then(|x| x.as_object());
                        let ws = stream.and_then(|s| s.get("wsSettings")).and_then(|x| x.as_object());
                        let grpc = stream.and_then(|s| s.get("grpcSettings")).and_then(|x| x.as_object());
                        let xhttp = stream
                            .and_then(|s| s.get("xhttpSettings").or_else(|| s.get("splithttpSettings")))
                            .and_then(|x| x.as_object());
                        let httpupgrade = stream
                            .and_then(|s| s.get("httpupgradeSettings"))
                            .and_then(|x| x.as_object());

                        let sni = reality
                            .and_then(|r| r.get("serverName"))
                            .or_else(|| tls.and_then(|t| t.get("serverName")))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());
                        let fp = reality
                            .and_then(|r| r.get("fingerprint"))
                            .or_else(|| tls.and_then(|t| t.get("fingerprint")))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());
                        let pbk = reality
                            .and_then(|r| r.get("publicKey"))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());
                        let sid = reality
                            .and_then(|r| r.get("shortId"))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());
                        let spx = reality
                            .and_then(|r| r.get("spiderX"))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());
                        let alpn = tls.and_then(|t| t.get("alpn")).and_then(|x| x.as_array()).map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect::<Vec<_>>()
                        });
                        let allow_insecure = tls
                            .and_then(|t| t.get("allowInsecure"))
                            .and_then(|x| x.as_bool())
                            .filter(|b| *b);

                        let path = ws
                            .and_then(|w| w.get("path"))
                            .or_else(|| httpupgrade.and_then(|h| h.get("path")))
                            .or_else(|| xhttp.and_then(|h| h.get("path")))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());
                        let host_header = ws
                            .and_then(|w| w.get("host"))
                            .or_else(|| {
                                ws.and_then(|w| w.get("headers"))
                                    .and_then(|h| h.as_object())
                                    .and_then(|h| h.get("Host"))
                            })
                            .or_else(|| httpupgrade.and_then(|h| h.get("host")))
                            .or_else(|| xhttp.and_then(|h| h.get("host")))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());

                        let service_name = grpc
                            .and_then(|g| g.get("serviceName"))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string());

                        let (country_code, country_name_fa, country_name_en) =
                            detect_country(&remark, Some(&address));
                        let canonical = format!(
                            "{}@{}:{}|{}|{}|{}|{}|{}|{}",
                            uuid,
                            address,
                            port,
                            network,
                            security,
                            sni.as_deref().unwrap_or(""),
                            pbk.as_deref().unwrap_or(""),
                            path.as_deref().unwrap_or(""),
                            remark
                        );

                        results.push(ServerSecretRecord {
                            id: make_server_id(&canonical),
                            remark,
                            address,
                            port,
                            uuid,
                            encryption: user
                                .and_then(|u| u.get("encryption"))
                                .and_then(|x| x.as_str())
                                .unwrap_or("none")
                                .to_string(),
                            flow: user
                                .and_then(|u| u.get("flow"))
                                .and_then(|x| x.as_str())
                                .filter(|s| !s.is_empty())
                                .map(|s| s.to_string()),
                            network,
                            security,
                            sni,
                            fp,
                            pbk,
                            sid,
                            spx,
                            alpn,
                            allow_insecure,
                            host_header,
                            path,
                            header_type: None,
                            service_name,
                            grpc_mode: None,
                            authority: None,
                            extra: None,
                            seed: None,
                            country_code,
                            country_name_fa,
                            country_name_en,
                            raw_hash: make_server_id(&serde_json::Value::Object(map.clone()).to_string()),
                        });
                    }
                    return;
                }
            }

            for key in ["uri", "url", "link", "config", "vlessUri"] {
                if let Some(s) = map.get(key).and_then(|v| v.as_str()) {
                    if let Some(parsed) = parse_vless_uri(s, results.len()) {
                        results.push(parsed);
                    }
                }
            }

            let nested_remark = map
                .get("remark")
                .or_else(|| map.get("name"))
                .and_then(|v| v.as_str())
                .or(fallback_remark);
            for v in map.values() {
                if v.is_object() || v.is_array() {
                    visit_json(v, nested_remark, results);
                }
            }
        }
        _ => {}
    }
}

pub fn dedupe_servers(servers: Vec<ServerSecretRecord>) -> Vec<ServerSecretRecord> {
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(servers.len());
    for s in servers {
        if seen.insert(s.id.clone()) {
            out.push(s);
        }
    }
    out
}

pub fn decode_base64_flexible(input: &str) -> Option<Vec<u8>> {
    let cleaned: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    if cleaned.len() < 8 {
        return None;
    }
    let standard = cleaned.replace('-', "+").replace('_', "/");
    let pad_len = (4 - (standard.len() % 4)) % 4;
    let padded = format!("{}{}", standard, "=".repeat(pad_len));
    STANDARD
        .decode(padded.as_bytes())
        .or_else(|_| URL_SAFE_NO_PAD.decode(cleaned.as_bytes()))
        .ok()
}

pub fn try_decode_base64_text(input: &str) -> Option<String> {
    let bytes = decode_base64_flexible(input)?;
    let text = String::from_utf8(bytes).ok()?;
    let lower = text.to_lowercase();
    if lower.contains("vless://")
        || lower.contains("vmess://")
        || lower.contains("trojan://")
        || text.trim_start().starts_with('{')
        || text.trim_start().starts_with('[')
        || lower.contains("#profile")
        || lower.contains("#subscription")
    {
        return Some(text);
    }

    if let Some(inner_bytes) = decode_base64_flexible(&text) {
        if let Ok(inner_text) = String::from_utf8(inner_bytes) {
            if inner_text.to_lowercase().contains("vless://") || inner_text.trim_start().starts_with('{') {
                return Some(inner_text);
            }
        }
    }
    None
}

pub fn parse_vless_payload(raw_payload: &str) -> (Vec<ServerSecretRecord>, HashMap<String, String>) {
    let mut working = raw_payload.trim().to_string();
    let mut inline_headers = HashMap::new();

    if !working.to_lowercase().contains("vless://")
        && !working.starts_with('{')
        && !working.starts_with('[')
    {
        if let Some(decoded) = try_decode_base64_text(&working) {
            working = decoded.trim().to_string();
        }
    }

    let mut candidate_lines = Vec::new();
    for line in working.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix('#') {
            if let Some((k, v)) = rest.split_once(':') {
                let key = k.trim().to_lowercase();
                if !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
                    inline_headers.insert(key, v.trim().to_string());
                    continue;
                }
            }
        }
        candidate_lines.push(trimmed.to_string());
    }

    let joined = candidate_lines.join("\n");
    let joined_trim = joined.trim();
    if joined_trim.starts_with('{') || joined_trim.starts_with('[') {
        if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(joined_trim) {
            let json_servers = parse_vless_json_value(&json_val);
            if !json_servers.is_empty() {
                return (json_servers, inline_headers);
            }
        }
    }

    let mut servers = Vec::new();
    for line in candidate_lines {
        if line.to_lowercase().starts_with("vless://") {
            if let Some(srv) = parse_vless_uri(&line, servers.len()) {
                servers.push(srv);
            }
        } else if let Some(decoded) = try_decode_base64_text(&line) {
            for sub in decoded.lines() {
                let s = sub.trim();
                if s.to_lowercase().starts_with("vless://") {
                    if let Some(srv) = parse_vless_uri(s, servers.len()) {
                        servers.push(srv);
                    }
                }
            }
        }
    }

    (dedupe_servers(servers), inline_headers)
}

pub fn build_vless_uri_from_record(s: &ServerSecretRecord) -> String {
    let mut url = Url::parse("vless://placeholder@127.0.0.1:443").unwrap();
    url.set_username(&s.uuid).ok();
    let host_fmt = if s.address.contains(':') && !s.address.starts_with('[') {
        format!("[{}]", s.address)
    } else {
        s.address.clone()
    };
    url.set_host(Some(&host_fmt)).ok();
    url.set_port(Some(s.port)).ok();

    {
        let mut q = url.query_pairs_mut();
        q.clear();
        q.append_pair("type", &s.network);
        q.append_pair("security", &s.security);
        if s.encryption != "none" && !s.encryption.is_empty() {
            q.append_pair("encryption", &s.encryption);
        }
        if let Some(v) = &s.flow {
            q.append_pair("flow", v);
        }
        if let Some(v) = &s.sni {
            q.append_pair("sni", v);
        }
        if let Some(v) = &s.fp {
            q.append_pair("fp", v);
        }
        if let Some(v) = &s.pbk {
            q.append_pair("pbk", v);
        }
        if let Some(v) = &s.sid {
            q.append_pair("sid", v);
        }
        if let Some(v) = &s.spx {
            q.append_pair("spx", v);
        }
        if let Some(alpn) = &s.alpn {
            if !alpn.is_empty() {
                q.append_pair("alpn", &alpn.join(","));
            }
        }
        if s.allow_insecure == Some(true) {
            q.append_pair("allowInsecure", "1");
        }
        if let Some(v) = &s.host_header {
            q.append_pair("host", v);
        }
        if let Some(v) = &s.path {
            q.append_pair("path", v);
        }
        if let Some(v) = &s.header_type {
            q.append_pair("headerType", v);
        }
        if let Some(v) = &s.service_name {
            q.append_pair("serviceName", v);
        }
        if let Some(v) = &s.grpc_mode {
            q.append_pair("mode", v);
        }
        if let Some(v) = &s.authority {
            q.append_pair("authority", v);
        }
        if let Some(v) = &s.seed {
            q.append_pair("seed", v);
        }
    }

    url.set_fragment(Some(&s.remark));
    url.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vless_reality_and_base64_subscription() {
        let uri = "vless://a1b2c3d4-e5f6-4789-9012-abcdef123456@de1.example.net:443?type=tcp&security=reality&fp=chrome&pbk=pubKeyXYZ&sid=ab12&spx=%2F&sni=www.microsoft.com&flow=xtls-rprx-vision#%F0%9F%87%A9%F0%9F%87%AA%20Frankfurt%20VIP";
        let srv = parse_vless_uri(uri, 0).expect("should parse vless");
        assert_eq!(srv.country_code, "DE");
        assert_eq!(srv.security, "reality");
        assert_eq!(srv.flow.as_deref(), Some("xtls-rprx-vision"));

        let sub = format!(
            "#subscription-userinfo: upload=10; download=20; total=100\n{}",
            uri
        );
        let b64 = STANDARD.encode(sub.as_bytes());
        let (servers, headers) = parse_vless_payload(&b64);
        assert_eq!(servers.len(), 1);
        assert!(headers.contains_key("subscription-userinfo"));
    }
}
