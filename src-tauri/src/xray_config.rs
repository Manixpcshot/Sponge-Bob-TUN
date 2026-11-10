use crate::types::{AppSettings, ServerSecretRecord};
use serde_json::{json, Map, Value};

pub fn build_xray_config(
    server: &ServerSecretRecord,
    settings: &AppSettings,
    api_port: u16,
) -> Value {
    let mut outbound_settings = json!({
        "vnext": [{
            "address": server.address,
            "port": server.port,
            "users": [{
                "id": server.uuid,
                "encryption": if server.encryption.is_empty() { "none" } else { &server.encryption },
                "flow": server.flow.clone().unwrap_or_default(),
            }]
        }]
    });
    let _ = &mut outbound_settings;

    let normalized_net = match server.network.as_str() {
        "h2" => "http",
        "splithttp" => "xhttp",
        other => other,
    };
    let mut stream_settings = Map::new();
    stream_settings.insert("network".to_string(), json!(normalized_net));
    stream_settings.insert("security".to_string(), json!(server.security));

    if server.security == "tls" {
        let mut tls = Map::new();
        tls.insert(
            "serverName".to_string(),
            json!(server.sni.clone().unwrap_or_else(|| server.address.clone())),
        );
        tls.insert(
            "allowInsecure".to_string(),
            json!(server.allow_insecure.unwrap_or(false)),
        );
        tls.insert(
            "fingerprint".to_string(),
            json!(server.fp.clone().unwrap_or_else(|| "chrome".to_string())),
        );
        if let Some(alpn) = &server.alpn {
            if !alpn.is_empty() {
                tls.insert("alpn".to_string(), json!(alpn));
            }
        }
        stream_settings.insert("tlsSettings".to_string(), Value::Object(tls));
    } else if server.security == "reality" {
        let mut reality = Map::new();
        reality.insert(
            "serverName".to_string(),
            json!(server.sni.clone().unwrap_or_default()),
        );
        reality.insert(
            "fingerprint".to_string(),
            json!(server.fp.clone().unwrap_or_else(|| "chrome".to_string())),
        );
        reality.insert(
            "publicKey".to_string(),
            json!(server.pbk.clone().unwrap_or_default()),
        );
        reality.insert(
            "shortId".to_string(),
            json!(server.sid.clone().unwrap_or_default()),
        );
        reality.insert(
            "spiderX".to_string(),
            json!(server.spx.clone().unwrap_or_else(|| "/".to_string())),
        );
        reality.insert("show".to_string(), json!(false));
        stream_settings.insert("realitySettings".to_string(), Value::Object(reality));
    }

    match server.network.as_str() {
        "ws" => {
            let mut ws = Map::new();
            ws.insert(
                "path".to_string(),
                json!(server.path.clone().unwrap_or_else(|| "/".to_string())),
            );
            if let Some(h) = server.host_header.as_ref().or(server.sni.as_ref()) {
                ws.insert("headers".to_string(), json!({ "Host": h }));
            }
            stream_settings.insert("wsSettings".to_string(), Value::Object(ws));
        }
        "grpc" => {
            let mut grpc = Map::new();
            grpc.insert(
                "serviceName".to_string(),
                json!(server.service_name.clone().unwrap_or_default()),
            );
            grpc.insert(
                "multiMode".to_string(),
                json!(server.grpc_mode.as_deref() == Some("multi")),
            );
            if let Some(auth) = &server.authority {
                grpc.insert("authority".to_string(), json!(auth));
            }
            stream_settings.insert("grpcSettings".to_string(), Value::Object(grpc));
        }
        "httpupgrade" => {
            let mut hu = Map::new();
            hu.insert(
                "path".to_string(),
                json!(server.path.clone().unwrap_or_else(|| "/".to_string())),
            );
            if let Some(h) = server.host_header.as_ref().or(server.sni.as_ref()) {
                hu.insert("host".to_string(), json!(h));
            }
            stream_settings.insert("httpupgradeSettings".to_string(), Value::Object(hu));
        }
        "xhttp" | "splithttp" => {
            let mut xh = Map::new();
            xh.insert(
                "path".to_string(),
                json!(server.path.clone().unwrap_or_else(|| "/".to_string())),
            );
            if let Some(h) = server.host_header.as_ref().or(server.sni.as_ref()) {
                xh.insert("host".to_string(), json!(h));
            }
            if let Some(m) = &server.grpc_mode {
                xh.insert("mode".to_string(), json!(m));
            }
            if let Some(extra) = &server.extra {
                xh.insert("extra".to_string(), json!(extra));
            }
            stream_settings.insert("xhttpSettings".to_string(), Value::Object(xh));
        }
        "h2" | "http" => {
            let mut h2 = Map::new();
            h2.insert(
                "path".to_string(),
                json!(server.path.clone().unwrap_or_else(|| "/".to_string())),
            );
            if let Some(h) = &server.host_header {
                let hosts: Vec<&str> = h.split(',').map(|x| x.trim()).filter(|x| !x.is_empty()).collect();
                h2.insert("host".to_string(), json!(hosts));
            }
            stream_settings.insert("httpSettings".to_string(), Value::Object(h2));
        }
        "kcp" => {
            let mut kcp = Map::new();
            kcp.insert(
                "header".to_string(),
                json!({ "type": server.header_type.clone().unwrap_or_else(|| "none".to_string()) }),
            );
            if let Some(seed) = &server.seed {
                kcp.insert("seed".to_string(), json!(seed));
            }
            stream_settings.insert("kcpSettings".to_string(), Value::Object(kcp));
        }
        _ => {
            if server.header_type.as_deref() == Some("http") {
                let hosts: Vec<String> = server
                    .host_header
                    .as_deref()
                    .map(|h| {
                        h.split(',')
                            .map(|x| x.trim().to_string())
                            .filter(|x| !x.is_empty())
                            .collect()
                    })
                    .unwrap_or_default();
                let paths = vec![server.path.clone().unwrap_or_else(|| "/".to_string())];
                stream_settings.insert(
                    "tcpSettings".to_string(),
                    json!({
                        "header": {
                            "type": "http",
                            "request": {
                                "path": paths,
                                "headers": { "Host": hosts }
                            }
                        }
                    }),
                );
            }
        }
    }

    let mut rules = Vec::new();
    rules.push(json!({
        "type": "field",
        "inboundTag": ["api-in"],
        "outboundTag": "api"
    }));
    if settings.bypass_lan {
        rules.push(json!({
            "type": "field",
            "ip": [
                "127.0.0.0/8",
                "10.0.0.0/8",
                "172.16.0.0/12",
                "192.168.0.0/16",
                "169.254.0.0/16",
                "::1/128",
                "fc00::/7",
                "fe80::/10"
            ],
            "outboundTag": "direct"
        }));
        rules.push(json!({
            "type": "field",
            "domain": ["localhost", "domain:local"],
            "outboundTag": "direct"
        }));
    }
    rules.push(json!({
        "type": "field",
        "inboundTag": ["socks-in", "http-in"],
        "outboundTag": "proxy"
    }));

    json!({
        "log": {
            "loglevel": "warning"
        },
        "stats": {},
        "api": {
            "tag": "api",
            "services": ["StatsService"]
        },
        "policy": {
            "levels": {
                "0": {
                    "statsUserUplink": true,
                    "statsUserDownlink": true
                }
            },
            "system": {
                "statsInboundUplink": true,
                "statsInboundDownlink": true,
                "statsOutboundUplink": true,
                "statsOutboundDownlink": true
            }
        },
        "inbounds": [
            {
                "tag": "socks-in",
                "port": settings.socks_port,
                "listen": "127.0.0.1",
                "protocol": "socks",
                "settings": {
                    "auth": "noauth",
                    "udp": true
                },
                "sniffing": {
                    "enabled": true,
                    "destOverride": ["http", "tls", "quic"],
                    "routeOnly": true
                }
            },
            {
                "tag": "http-in",
                "port": settings.http_port,
                "listen": "127.0.0.1",
                "protocol": "http",
                "settings": {
                    "allowTransparent": false
                },
                "sniffing": {
                    "enabled": true,
                    "destOverride": ["http", "tls", "quic"],
                    "routeOnly": true
                }
            },
            {
                "tag": "api-in",
                "port": api_port,
                "listen": "127.0.0.1",
                "protocol": "dokodemo-door",
                "settings": {
                    "address": "127.0.0.1"
                }
            }
        ],
        "outbounds": [
            {
                "tag": "proxy",
                "protocol": "vless",
                "settings": outbound_settings,
                "streamSettings": Value::Object(stream_settings)
            },
            {
                "tag": "direct",
                "protocol": "freedom",
                "settings": {}
            },
            {
                "tag": "block",
                "protocol": "blackhole",
                "settings": {}
            }
        ],
        "routing": {
            "domainStrategy": "AsIs",
            "rules": rules
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vless_parser::parse_vless_uri;

    #[test]
    fn generates_local_proxy_only_without_tun_or_wintun() {
        let srv = parse_vless_uri(
            "vless://11111111-2222-4333-8444-555555555555@198.51.100.12:443?security=reality&sni=www.google.com&fp=chrome&pbk=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890&sid=aa11&type=tcp&flow=xtls-rprx-vision#Test",
            0,
        )
        .unwrap();
        let cfg = build_xray_config(&srv, &AppSettings::default(), 19001);
        let serialized = serde_json::to_string(&cfg).unwrap();
        assert!(!serialized.contains("wintun"));
        assert!(!serialized.contains("\"protocol\":\"tun\""));
        assert!(serialized.contains("\"protocol\":\"socks\""));
        assert!(serialized.contains("\"protocol\":\"http\""));
        assert!(serialized.contains("\"StatsService\""));
    }
}
