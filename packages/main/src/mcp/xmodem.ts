/**
 * XMODEM / YMODEM 发送端协议实现
 *
 * XMODEM-CRC: 128 字节块, CRC-16 (CCITT), 握手 'C'
 * YMODEM:     块0为元数据(文件名+大小), 1024 字节块 (STX), CRC-16
 */

const SOH = 0x01; // 128-byte block
const STX = 0x02; // 1024-byte block (YMODEM)
const EOT = 0x04; // End of Transmission
const ACK = 0x06;
const NAK = 0x15;
const C = 0x43; // CRC mode request

const MAX_RETRIES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function crc16(data: Buffer): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
  }
  return crc & 0xffff;
}

function buildPacket(blockNum: number, data: Buffer, blockSize: number): Buffer {
  const header = blockSize === 1024 ? STX : SOH;
  const blk = blockNum & 0xff;
  const blkComp = (~blockNum) & 0xff;
  const padded = Buffer.alloc(blockSize);
  data.copy(padded);
  const crc = crc16(padded);
  return Buffer.concat([
    Buffer.from([header, blk, blkComp]),
    padded,
    Buffer.from([(crc >> 8) & 0xff, crc & 0xff]),
  ]);
}

export type XmodemProtocol = 'xmodem' | 'ymodem';

export interface XmodemOptions {
  timeout?: number;   // per-byte read timeout in seconds, default 10
  retries?: number;   // max retries per packet, default 10
}

/**
 * @param write  发送二进制数据到连接
 * @param readByte  读取单个响应字节，超时返回 -1
 * @param fileData  文件内容
 * @param protocol  "xmodem" | "ymodem"
 * @param opts  可选参数
 */
export async function xmodemSend(
  write: (data: Buffer) => void,
  readByte: (timeoutMs: number) => Promise<number>,
  fileData: Buffer,
  protocol: XmodemProtocol,
  opts?: XmodemOptions,
): Promise<void> {
  const timeout = (opts?.timeout ?? 10) * 1000;
  const maxRetries = opts?.retries ?? MAX_RETRIES;
  const blockSize = protocol === 'ymodem' ? 1024 : 128;

  if (fileData.length === 0) {
    throw new Error('文件为空');
  }
  if (fileData.length > MAX_FILE_SIZE) {
    throw new Error(`文件过大 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  // 1. Wait for 'C' (CRC mode handshake) from receiver
  let handshakeCount = 0;
  let handshakeOk = false;
  while (handshakeCount < maxRetries) {
    const b = await readByte(timeout);
    if (b === C) { handshakeOk = true; break; }
    if (b === NAK) { handshakeCount++; continue; }
    handshakeCount++;
  }
  if (!handshakeOk) {
    throw new Error(`握手超时：未收到接收端 CRC 模式请求 ('C')，重试 ${maxRetries} 次`);
  }

  // 2. YMODEM: send block 0 (metadata)
  let blockNum = 0;
  if (protocol === 'ymodem') {
    const metaStr = `qserial-file\x00${fileData.length} `;
    const metaBuf = Buffer.from(metaStr.padEnd(128, '\x00'), 'utf-8').slice(0, 128);
    const metaPacket = buildPacket(0, metaBuf, 128); // block 0 always 128 bytes
    await sendPacketWithRetry(write, readByte, metaPacket, timeout, maxRetries);
    blockNum = 1;
  }

  // 3. Send data blocks
  const totalBlocks = Math.ceil(fileData.length / blockSize);

  for (let i = 0; i < totalBlocks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, fileData.length);
    const chunk = fileData.subarray(start, end);
    const packet = buildPacket(blockNum + i, chunk, blockSize);
    await sendPacketWithRetry(write, readByte, packet, timeout, maxRetries);
  }

  // 4. Send EOT
  let eotRetries = 0;
  while (eotRetries < maxRetries) {
    write(Buffer.from([EOT]));
    const b = await readByte(timeout);
    if (b === ACK) break;
    eotRetries++;
    if (eotRetries >= maxRetries) {
      throw new Error('EOT 确认超时：接收端未确认传输结束');
    }
  }
}

async function sendPacketWithRetry(
  write: (data: Buffer) => void,
  readByte: (timeoutMs: number) => Promise<number>,
  packet: Buffer,
  timeout: number,
  maxRetries: number,
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    write(packet);
    const b = await readByte(timeout);
    if (b === ACK) return;
    if (b === NAK) continue;
    // Unknown response or timeout — retry
  }
  throw new Error(`数据包确认超时：${maxRetries} 次重试均未收到 ACK`);
}
