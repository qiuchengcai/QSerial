/**
 * 验证工具函数
 */

import type { SerialConnectionOptions, SshConnectionOptions } from '../types/connection.js';

/**
 * 验证串口配置
 */
export function validateSerialOptions(options: SerialConnectionOptions): string[] {
  const errors: string[] = [];

  if (!options.path) {
    errors.push('串口路径不能为空');
  }

  const validBaudRates = [300, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
  if (!validBaudRates.includes(options.baudRate)) {
    errors.push(`无效的波特率: ${options.baudRate}`);
  }

  if (![5, 6, 7, 8].includes(options.dataBits)) {
    errors.push(`无效的数据位: ${options.dataBits}`);
  }

  if (![1, 1.5, 2].includes(options.stopBits)) {
    errors.push(`无效的停止位: ${options.stopBits}`);
  }

  if (!['none', 'even', 'odd', 'mark', 'space'].includes(options.parity)) {
    errors.push(`无效的校验位: ${options.parity}`);
  }

  return errors;
}

/**
 * 验证 SSH 配置
 */
export function validateSshOptions(options: SshConnectionOptions): string[] {
  const errors: string[] = [];

  if (!options.host) {
    errors.push('主机地址不能为空');
  } else if (!isValidHost(options.host)) {
    errors.push(`无效的主机地址: ${options.host}`);
  }

  if (options.port < 1 || options.port > 65535) {
    errors.push(`无效的端口: ${options.port}`);
  }

  if (!options.username) {
    errors.push('用户名不能为空');
  }

  if (!options.password && !options.privateKey) {
    errors.push('密码或私钥至少需要提供一个');
  }

  return errors;
}

/**
 * 验证主机名或 IP 地址
 */
export function isValidHost(host: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(host)) {
    const parts = host.split('.').map(Number);
    return parts.every((part) => part >= 0 && part <= 255);
  }

  // IPv6 (简化验证)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (ipv6Regex.test(host)) {
    return true;
  }

  // 域名
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  return domainRegex.test(host);
}

/**
 * 验证端口号
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * 验证非空字符串
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
