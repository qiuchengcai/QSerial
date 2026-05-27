/**
 * Shared types unit tests
 * Validates ConnectionType, ConnectionState enums and type guards
 */

import { describe, it, expect } from 'vitest';
import { ConnectionType, ConnectionState } from '../../src/types/connection.js';

describe('ConnectionType', () => {
  it('should have 6 connection types', () => {
    const values = Object.values(ConnectionType);
    expect(values).toHaveLength(6);
  });

  it('should map correctly', () => {
    expect(ConnectionType.PTY).toBe('pty');
    expect(ConnectionType.SERIAL).toBe('serial');
    expect(ConnectionType.SSH).toBe('ssh');
    expect(ConnectionType.TELNET).toBe('telnet');
    expect(ConnectionType.CONNECTION_SERVER).toBe('connection_server');
  });

  it('should detect serial type', () => {
    const isSerial = (t: ConnectionType) =>
      t === ConnectionType.SERIAL || t === ConnectionType.SERIAL_SERVER;
    expect(isSerial(ConnectionType.SERIAL)).toBe(true);
    expect(isSerial(ConnectionType.SERIAL_SERVER)).toBe(true);
    expect(isSerial(ConnectionType.PTY)).toBe(false);
  });

  it('should detect remote type', () => {
    const isRemote = (t: ConnectionType) =>
      [ConnectionType.SSH, ConnectionType.TELNET].includes(t);
    expect(isRemote(ConnectionType.SSH)).toBe(true);
    expect(isRemote(ConnectionType.TELNET)).toBe(true);
    expect(isRemote(ConnectionType.PTY)).toBe(false);
    expect(isRemote(ConnectionType.SERIAL)).toBe(false);
  });
});

describe('ConnectionState', () => {
  it('should have 5 states', () => {
    const values = Object.values(ConnectionState);
    expect(values).toHaveLength(5);
  });

  it('should have correct values', () => {
    expect(ConnectionState.DISCONNECTED).toBe('disconnected');
    expect(ConnectionState.CONNECTING).toBe('connecting');
    expect(ConnectionState.CONNECTED).toBe('connected');
    expect(ConnectionState.RECONNECTING).toBe('reconnecting');
    expect(ConnectionState.ERROR).toBe('error');
  });
});
