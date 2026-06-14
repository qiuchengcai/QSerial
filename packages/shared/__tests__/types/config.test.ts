import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/types/config.js';

describe('DEFAULT_CONFIG', () => {
  it('should have all top-level sections', () => {
    const keys = Object.keys(DEFAULT_CONFIG);
    expect(keys).toContain('app');
    expect(keys).toContain('terminal');
    expect(keys).toContain('serial');
    expect(keys).toContain('ssh');
    expect(keys).toContain('serialShare');
    expect(keys).toContain('connectionShare');
    expect(keys).toContain('mcp');
    expect(keys).toContain('window');
  });

  it('should have valid app settings', () => {
    const { app } = DEFAULT_CONFIG;
    expect(['zh-CN', 'en-US']).toContain(app.language);
    expect(typeof app.theme).toBe('string');
    expect(typeof app.uiFontFamily).toBe('string');
    expect(typeof app.autoUpdate).toBe('boolean');
  });

  it('should have valid terminal settings', () => {
    const { terminal } = DEFAULT_CONFIG;
    expect(terminal.fontSize).toBeGreaterThan(0);
    expect(terminal.scrollback).toBeGreaterThan(0);
    expect(terminal.reconnectInterval).toBeGreaterThan(0);
    expect(terminal.reconnectAttempts).toBeGreaterThan(0);
  });

  it('should have valid serial settings', () => {
    const { serial } = DEFAULT_CONFIG;
    expect(serial.defaultBaudRate).toBeGreaterThan(0);
    expect([5, 6, 7, 8]).toContain(serial.defaultDataBits);
    expect([1, 1.5, 2]).toContain(serial.defaultStopBits);
    expect(['none', 'even', 'odd']).toContain(serial.defaultParity);
  });

  it('should have valid SSH settings', () => {
    const { ssh } = DEFAULT_CONFIG;
    expect(ssh.keepaliveInterval).toBeGreaterThan(0);
    expect(ssh.defaultPort).toBe(22);
  });

  it('should have valid MCP settings', () => {
    const { mcp } = DEFAULT_CONFIG;
    expect(typeof mcp.enabled).toBe('boolean');
    expect(mcp.port).toBe(9800);
    expect(mcp.listenAddress).toBe('127.0.0.1');
    expect(typeof mcp.authPassword).toBe('string');
    expect(Array.isArray(mcp.corsOrigins)).toBe(true);
  });

  it('should have valid window settings', () => {
    const { window } = DEFAULT_CONFIG;
    expect(window.width).toBeGreaterThan(0);
    expect(window.height).toBeGreaterThan(0);
    expect(typeof window.maximized).toBe('boolean');
  });

  it('should have connection share default port', () => {
    expect(DEFAULT_CONFIG.connectionShare.defaultLocalPort).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.connectionShare.defaultListenAddress).toBe('0.0.0.0');
  });
});
