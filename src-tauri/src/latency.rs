use crate::log_sanitizer::now_millis;
use crate::types::{PublicServerInfo, ServerSecretRecord};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::TcpStream;
use tokio::sync::Semaphore;

#[derive(Debug, Clone)]
pub struct LatencyCheckResult {
    pub latency_ms: Option<u32>,
    pub healthy: bool,
    pub checked_at: i64,
}

pub async fn tcp_ping(host: &str, port: u16, timeout_ms: u64) -> Option<u32> {
    let start = Instant::now();
    let fut = TcpStream::connect((host, port));
    match tokio::time::timeout(Duration::from_millis(timeout_ms), fut).await {
        Ok(Ok(stream)) => {
            drop(stream);
            Some(start.elapsed().as_millis().max(1) as u32)
        }
        _ => None,
    }
}

pub async fn measure_all_servers(
    servers: &[ServerSecretRecord],
    concurrency: usize,
    timeout_ms: u64,
) -> HashMap<String, LatencyCheckResult> {
    let sem = Arc::new(Semaphore::new(concurrency.max(1)));
    let mut handles = Vec::with_capacity(servers.len());

    for srv in servers {
        let sem_c = sem.clone();
        let id = srv.id.clone();
        let addr = srv.address.clone();
        let port = srv.port;
        handles.push(tokio::spawn(async move {
            let _permit = sem_c.acquire_owned().await;
            let lat = tcp_ping(&addr, port, timeout_ms).await;
            (
                id,
                LatencyCheckResult {
                    latency_ms: lat,
                    healthy: lat.is_some(),
                    checked_at: now_millis(),
                },
            )
        }));
    }

    let mut map = HashMap::with_capacity(servers.len());
    for h in handles {
        if let Ok((id, res)) = h.await {
            map.insert(id, res);
        }
    }
    map
}

pub async fn check_proxy_egress_health(http_port: u16, timeout_ms: u64) -> bool {
    let Ok(proxy) = reqwest::Proxy::all(format!("http://127.0.0.1:{}", http_port)) else {
        return false;
    };
    let Ok(client) = reqwest::Client::builder()
        .proxy(proxy)
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    else {
        return false;
    };

    match client
        .get("https://www.gstatic.com/generate_204")
        .send()
        .await
    {
        Ok(resp) => resp.status().as_u16() == 204 || resp.status().is_success(),
        Err(_) => false,
    }
}

pub fn pick_best_server<'a>(
    servers: &'a [PublicServerInfo],
    pinned_ids: &HashSet<String>,
    exclude_ids: &HashSet<String>,
) -> Option<&'a PublicServerInfo> {
    let mut candidates: Vec<&PublicServerInfo> = servers
        .iter()
        .filter(|s| !exclude_ids.contains(&s.id))
        .collect();
    if candidates.is_empty() {
        candidates = servers.iter().collect();
    }
    if candidates.is_empty() {
        return None;
    }

    candidates.sort_by(|a, b| {
        let a_healthy = a.healthy && a.latency_ms.is_some();
        let b_healthy = b.healthy && b.latency_ms.is_some();
        b_healthy
            .cmp(&a_healthy)
            .then_with(|| {
                let a_pin = pinned_ids.contains(&a.id);
                let b_pin = pinned_ids.contains(&b.id);
                b_pin.cmp(&a_pin)
            })
            .then_with(|| a.latency_ms.unwrap_or(99_999).cmp(&b.latency_ms.unwrap_or(99_999)))
    });

    candidates.into_iter().next()
}
