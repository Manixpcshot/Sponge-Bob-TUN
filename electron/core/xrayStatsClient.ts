import http2 from 'node:http2';

export interface XrayStatEntry {
  name: string;
  value: number;
}

function encodeVarint(num: number): Buffer {
  const bytes: number[] = [];
  let n = num >>> 0;
  while (n >= 0x80) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return Buffer.from(bytes);
}

export function encodeQueryStatsRequest(pattern = '', reset = false): Buffer {
  const parts: Buffer[] = [];
  if (pattern.length > 0) {
    const strBuf = Buffer.from(pattern, 'utf8');
    parts.push(Buffer.from([0x0a]), encodeVarint(strBuf.length), strBuf);
  }
  if (reset) {
    parts.push(Buffer.from([0x10, 0x01]));
  }
  const body = Buffer.concat(parts);
  const frame = Buffer.alloc(5 + body.length);
  frame[0] = 0x00; // uncompressed
  frame.writeUInt32BE(body.length, 1);
  body.copy(frame, 5);
  return frame;
}

function readVarint(buf: Buffer, offset: number): { value: bigint; nextOffset: number } {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result, nextOffset: pos };
    }
    shift += 7n;
    if (shift > 70n) {
      throw new Error('Malformed varint');
    }
  }
  throw new Error('Truncated varint');
}

function skipField(buf: Buffer, offset: number, wireType: number): number {
  switch (wireType) {
    case 0:
      return readVarint(buf, offset).nextOffset;
    case 1:
      return offset + 8;
    case 2: {
      const len = Number(readVarint(buf, offset).value);
      return readVarint(buf, offset).nextOffset + len;
    }
    case 5:
      return offset + 4;
    default:
      throw new Error(`Unsupported protobuf wire type: ${wireType}`);
  }
}

function decodeStatMessage(buf: Buffer): XrayStatEntry {
  let offset = 0;
  let name = '';
  let value = 0;

  while (offset < buf.length) {
    const tagRes = readVarint(buf, offset);
    const tag = Number(tagRes.value);
    offset = tagRes.nextOffset;
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if (fieldNum === 1 && wireType === 2) {
      const lenRes = readVarint(buf, offset);
      const len = Number(lenRes.value);
      offset = lenRes.nextOffset;
      name = buf.subarray(offset, offset + len).toString('utf8');
      offset += len;
    } else if (fieldNum === 2 && wireType === 0) {
      const valRes = readVarint(buf, offset);
      // Convert signed 64-bit two's complement safely if needed
      const unsigned = valRes.value;
      const signed =
        unsigned >= 0x8000000000000000n ? unsigned - 0x10000000000000000n : unsigned;
      value = Number(signed);
      offset = valRes.nextOffset;
    } else {
      offset = skipField(buf, offset, wireType);
    }
  }

  return { name, value };
}

export function decodeQueryStatsResponse(grpcPayload: Buffer): XrayStatEntry[] {
  const entries: XrayStatEntry[] = [];
  let frameOffset = 0;

  while (frameOffset + 5 <= grpcPayload.length) {
    const compressed = grpcPayload[frameOffset];
    const msgLen = grpcPayload.readUInt32BE(frameOffset + 1);
    frameOffset += 5;
    if (frameOffset + msgLen > grpcPayload.length) break;
    if (compressed !== 0) {
      frameOffset += msgLen;
      continue;
    }

    const msg = grpcPayload.subarray(frameOffset, frameOffset + msgLen);
    frameOffset += msgLen;

    let offset = 0;
    while (offset < msg.length) {
      const tagRes = readVarint(msg, offset);
      const tag = Number(tagRes.value);
      offset = tagRes.nextOffset;
      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;

      if (fieldNum === 1 && wireType === 2) {
        const lenRes = readVarint(msg, offset);
        const len = Number(lenRes.value);
        offset = lenRes.nextOffset;
        const statSlice = msg.subarray(offset, offset + len);
        entries.push(decodeStatMessage(statSlice));
        offset += len;
      } else {
        offset = skipField(msg, offset, wireType);
      }
    }
  }

  return entries;
}

export class XrayStatsClient {
  private client: http2.ClientHttp2Session | null = null;
  private currentPort: number | null = null;

  private getSession(apiPort: number): http2.ClientHttp2Session {
    if (this.client && !this.client.closed && !this.client.destroyed && this.currentPort === apiPort) {
      return this.client;
    }
    this.close();
    const session = http2.connect(`http://127.0.0.1:${apiPort}`);
    session.on('error', () => {
      // Errors handled per-request cleanly
    });
    this.client = session;
    this.currentPort = apiPort;
    return session;
  }

  async queryOutboundTraffic(
    apiPort: number,
    outboundTag = 'proxy',
    timeoutMs = 1500,
  ): Promise<{ uplinkBytes: number; downlinkBytes: number } | null> {
    const pattern = `outbound>>>${outboundTag}>>>traffic>>>`;
    const reqFrame = encodeQueryStatsRequest(pattern, false);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (val: { uplinkBytes: number; downlinkBytes: number } | null) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      };

      const timer = setTimeout(() => {
        finish(null);
      }, timeoutMs);

      try {
        const session = this.getSession(apiPort);
        const req = session.request({
          ':method': 'POST',
          ':path': '/xray.app.stats.command.StatsService/QueryStats',
          'content-type': 'application/grpc',
          te: 'trailers',
        });

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const payload = Buffer.concat(chunks);
            const stats = decodeQueryStatsResponse(payload);
            let uplinkBytes = 0;
            let downlinkBytes = 0;
            for (const item of stats) {
              if (item.name === `outbound>>>${outboundTag}>>>traffic>>>uplink`) {
                uplinkBytes = item.value;
              } else if (item.name === `outbound>>>${outboundTag}>>>traffic>>>downlink`) {
                downlinkBytes = item.value;
              }
            }
            finish({ uplinkBytes, downlinkBytes });
          } catch {
            finish(null);
          }
        });
        req.on('error', () => finish(null));
        req.write(reqFrame);
        req.end();
      } catch {
        finish(null);
      }
    });
  }

  close(): void {
    if (this.client && !this.client.destroyed) {
      try {
        this.client.close();
      } catch {
        // ignore
      }
    }
    this.client = null;
    this.currentPort = null;
  }
}
