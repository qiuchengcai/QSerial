/**
 * 编码工具函数
 */

/**
 * Buffer 转 Base64 (Node.js 环境)
 */
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Base64 转 Uint8Array (浏览器环境)
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64 转 Buffer (Node.js 环境)
 */
export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * 字符串转 Hex
 */
export function stringToHex(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hex 转字符串
 */
export function hexToString(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * 格式化 Hex 显示
 */
export function formatHex(data: Uint8Array | Buffer, bytesPerLine = 16): string {
  const lines: string[] = [];

  for (let i = 0; i < data.length; i += bytesPerLine) {
    const slice = data.slice(i, i + bytesPerLine);

    // 地址
    const address = i.toString(16).padStart(8, '0').toUpperCase();

    // Hex 部分
    const hexParts: string[] = [];
    for (let j = 0; j < slice.length; j++) {
      hexParts.push(slice[j].toString(16).padStart(2, '0').toUpperCase());
      if (j === 7) hexParts.push('');
    }

    // ASCII 部分
    const ascii = Array.from(slice)
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
      .join('');

    lines.push(`${address}  ${hexParts.join(' ').padEnd(49)}  |${ascii}|`);
  }

  return lines.join('\n');
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(date: Date = new Date()): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `[${hours}:${minutes}:${seconds}.${ms}]`;
}
