import { describe, it, expect } from 'vitest';
import {
  BAUD_RATES,
  DATA_BITS,
  STOP_BITS,
  PARITY_OPTIONS,
  FLOW_CONTROL_OPTIONS,
  DEFAULT_SHELLS,
  CONNECTION_TYPE_NAMES,
  CONNECTION_STATE_NAMES,
} from '../../src/constants/connection.js';

describe('BAUD_RATES', () => {
  it('should contain standard baud rates', () => {
    expect(BAUD_RATES).toContain(9600);
    expect(BAUD_RATES).toContain(115200);
    expect(BAUD_RATES).toContain(921600);
  });

  it('should be sorted ascending', () => {
    for (let i = 1; i < BAUD_RATES.length; i++) {
      expect(BAUD_RATES[i]).toBeGreaterThan(BAUD_RATES[i - 1]);
    }
  });

  it('should have 13 entries', () => {
    expect(BAUD_RATES).toHaveLength(13);
  });
});

describe('DATA_BITS', () => {
  it('should contain 5, 6, 7, 8', () => {
    expect(DATA_BITS).toEqual([5, 6, 7, 8]);
  });
});

describe('STOP_BITS', () => {
  it('should contain 1, 1.5, 2', () => {
    expect(STOP_BITS).toEqual([1, 1.5, 2]);
  });
});

describe('PARITY_OPTIONS', () => {
  it('should contain all parity types', () => {
    expect(PARITY_OPTIONS).toContain('none');
    expect(PARITY_OPTIONS).toContain('even');
    expect(PARITY_OPTIONS).toContain('odd');
    expect(PARITY_OPTIONS).toContain('mark');
    expect(PARITY_OPTIONS).toContain('space');
  });
});

describe('FLOW_CONTROL_OPTIONS', () => {
  it('should contain flow control types', () => {
    expect(FLOW_CONTROL_OPTIONS).toContain('none');
    expect(FLOW_CONTROL_OPTIONS).toContain('hardware');
    expect(FLOW_CONTROL_OPTIONS).toContain('software');
  });
});

describe('DEFAULT_SHELLS', () => {
  it('should have entry for each platform', () => {
    expect(DEFAULT_SHELLS.win32).toBe('powershell.exe');
    expect(DEFAULT_SHELLS.darwin).toBe('/bin/zsh');
    expect(DEFAULT_SHELLS.linux).toBe('/bin/bash');
  });
});

describe('CONNECTION_TYPE_NAMES', () => {
  it('should have Chinese names for connection types', () => {
    expect(CONNECTION_TYPE_NAMES.pty).toBe('本地终端');
    expect(CONNECTION_TYPE_NAMES.serial).toBe('串口');
    expect(CONNECTION_TYPE_NAMES.ssh).toBe('SSH');
    expect(CONNECTION_TYPE_NAMES.telnet).toBe('Telnet');
  });
});

describe('CONNECTION_STATE_NAMES', () => {
  it('should have Chinese names for connection states', () => {
    expect(CONNECTION_STATE_NAMES.disconnected).toBe('已断开');
    expect(CONNECTION_STATE_NAMES.connecting).toBe('连接中');
    expect(CONNECTION_STATE_NAMES.connected).toBe('已连接');
    expect(CONNECTION_STATE_NAMES.reconnecting).toBe('重连中');
    expect(CONNECTION_STATE_NAMES.error).toBe('错误');
  });
});
