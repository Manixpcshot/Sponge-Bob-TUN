use bytes::{BufMut, Bytes, BytesMut};
use h2::client;
use http::Request;
use std::time::Duration;
use tokio::net::TcpStream;

#[derive(Debug, Clone, Default)]
pub struct XrayTrafficDelta {
    pub uplink_bytes: u64,
    pub downlink_bytes: u64,
}

fn encode_varint(mut value: u64, out: &mut Vec<u8>) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
}

fn encode_query_stats_request(pattern: &str, reset: bool) -> Vec<u8> {
    let mut proto = Vec::new();
    if !pattern.is_empty() {
        proto.push(0x0a); // field 1 string
        encode_varint(pattern.len() as u64, &mut proto);
        proto.extend_from_slice(pattern.as_bytes());
    }
    if reset {
        proto.push(0x10); // field 2 bool
        proto.push(1);
    }

    let mut frame = BytesMut::with_capacity(5 + proto.len());
    frame.put_u8(0); // uncompressed
    frame.put_u32(proto.len() as u32);
    frame.extend_from_slice(&proto);
    frame.to_vec()
}

fn read_varint(buf: &[u8], offset: &mut usize) -> Option<u64> {
    let mut result: u64 = 0;
    let mut shift = 0u32;
    while *offset < buf.len() {
        let b = buf[*offset];
        *offset += 1;
        result |= ((b & 0x7f) as u64) << shift;
        if (b & 0x80) == 0 {
            return Some(result);
        }
        shift += 7;
        if shift > 63 {
            return None;
        }
    }
    None
}

fn decode_stat(buf: &[u8]) -> Option<(String, u64)> {
    let mut offset = 0usize;
    let mut name = String::new();
    let mut value = 0u64;
    while offset < buf.len() {
        let tag = read_varint(buf, &mut offset)?;
        let field = tag >> 3;
        let wire = tag & 0x07;
        if field == 1 && wire == 2 {
            let len = read_varint(buf, &mut offset)? as usize;
            if offset + len > buf.len() {
                return None;
            }
            name = String::from_utf8_lossy(&buf[offset..offset + len]).to_string();
            offset += len;
        } else if field == 2 && wire == 0 {
            value = read_varint(buf, &mut offset)?;
        } else if wire == 2 {
            let len = read_varint(buf, &mut offset)? as usize;
            offset = (offset + len).min(buf.len());
        } else if wire == 0 {
            let _ = read_varint(buf, &mut offset)?;
        } else {
            break;
        }
    }
    Some((name, value))
}

fn decode_query_stats_response(raw_grpc_frames: &[u8]) -> XrayTrafficDelta {
    let mut out = XrayTrafficDelta::default();
    let mut cursor = 0usize;
    while cursor + 5 <= raw_grpc_frames.len() {
        let compressed = raw_grpc_frames[cursor];
        let len = u32::from_be_bytes([
            raw_grpc_frames[cursor + 1],
            raw_grpc_frames[cursor + 2],
            raw_grpc_frames[cursor + 3],
            raw_grpc_frames[cursor + 4],
        ]) as usize;
        cursor += 5;
        if cursor + len > raw_grpc_frames.len() || compressed != 0 {
            break;
        }
        let msg = &raw_grpc_frames[cursor..cursor + len];
        cursor += len;

        let mut off = 0usize;
        while off < msg.len() {
            let Some(tag) = read_varint(msg, &mut off) else {
                break;
            };
            let field = tag >> 3;
            let wire = tag & 0x07;
            if field == 1 && wire == 2 {
                let Some(slen) = read_varint(msg, &mut off) else {
                    break;
                };
                let slen = slen as usize;
                if off + slen > msg.len() {
                    break;
                }
                if let Some((name, val)) = decode_stat(&msg[off..off + slen]) {
                    if name == "outbound>>>proxy>>>traffic>>>uplink" {
                        out.uplink_bytes = out.uplink_bytes.saturating_add(val);
                    } else if name == "outbound>>>proxy>>>traffic>>>downlink" {
                        out.downlink_bytes = out.downlink_bytes.saturating_add(val);
                    }
                }
                off += slen;
            } else if wire == 2 {
                let Some(slen) = read_varint(msg, &mut off) else {
                    break;
                };
                off = (off + slen as usize).min(msg.len());
            } else if wire == 0 {
                if read_varint(msg, &mut off).is_none() {
                    break;
                }
            } else {
                break;
            }
        }
    }
    out
}

pub async fn query_xray_traffic_stats(api_port: u16, reset: bool) -> XrayTrafficDelta {
    let fut = async {
        let stream = TcpStream::connect(("127.0.0.1", api_port)).await.ok()?;
        let (mut send_req, conn) = client::handshake(stream).await.ok()?;
        tokio::spawn(async move {
            let _ = conn.await;
        });

        let req = Request::builder()
            .method("POST")
            .uri(format!(
                "http://127.0.0.1:{}/xray.app.stats.command.StatsService/QueryStats",
                api_port
            ))
            .header("content-type", "application/grpc")
            .header("te", "trailers")
            .body(())
            .ok()?;

        let (response_fut, mut send_stream) = send_req.send_request(req, false).ok()?;
        let payload = encode_query_stats_request("outbound>>>proxy>>>traffic>>>", reset);
        send_stream.send_data(Bytes::from(payload), true).ok()?;

        let response = response_fut.await.ok()?;
        let mut body = response.into_body();
        let mut raw = Vec::new();
        while let Some(chunk) = body.data().await {
            if let Ok(bytes) = chunk {
                let _ = body.flow_control().release_capacity(bytes.len());
                raw.extend_from_slice(&bytes);
            } else {
                break;
            }
        }
        Some(decode_query_stats_response(&raw))
    };

    match tokio::time::timeout(Duration::from_millis(1200), fut).await {
        Ok(Some(delta)) => delta,
        _ => XrayTrafficDelta::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrips_grpc_query_stats_wire_encoding() {
        let req = encode_query_stats_request("outbound>>>proxy>>>traffic>>>", true);
        assert_eq!(req[0], 0);
        let len = u32::from_be_bytes([req[1], req[2], req[3], req[4]]) as usize;
        assert_eq!(req.len(), 5 + len);

        // Construct fake Stat("outbound>>>proxy>>>traffic>>>downlink", 4096) inside QueryStatsResponse
        let name = b"outbound>>>proxy>>>traffic>>>downlink";
        let mut stat = vec![0x0a];
        encode_varint(name.len() as u64, &mut stat);
        stat.extend_from_slice(name);
        stat.push(0x10);
        encode_varint(4096, &mut stat);

        let mut resp_proto = vec![0x0a];
        encode_varint(stat.len() as u64, &mut resp_proto);
        resp_proto.extend_from_slice(&stat);

        let mut frame = vec![0u8];
        frame.extend_from_slice(&(resp_proto.len() as u32).to_be_bytes());
        frame.extend_from_slice(&resp_proto);

        let decoded = decode_query_stats_response(&frame);
        assert_eq!(decoded.downlink_bytes, 4096);
        assert_eq!(decoded.uplink_bytes, 0);
    }
}
