/**
 * ConnectionFactory unit tests
 *
 * Tests the factory pattern for all 6 connection types.
 * Native modules (node-pty, serialport, ssh2) are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ====== Mock native modules before any imports ======
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onExit: vi.fn(),
    pid: 12345,
  })),
}));

vi.mock('serialport', () => ({
  SerialPort: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
    set: vi.fn(),
    isOpen: true,
    path: '/dev/ttyUSB0',
  })),
}));

vi.mock('ssh2', () => ({
  Client: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    shell: vi.fn(),
    exec: vi.fn(),
  })),
}));

vi.mock('net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('net')>();
  return {
    ...actual,
    createServer: vi.fn(() => ({
      listen: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    })),
    createConnection: vi.fn(() => ({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    })),
    Socket: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      connect: vi.fn(),
    })),
  };
});

// ====== Now import the factory ======
import { ConnectionFactory } from '../../src/connection/factory.ts';
import { ConnectionType, ConnectionState, type IConnection } from '@qserial/shared';

describe('ConnectionFactory', () => {
  beforeEach(() => {
    ConnectionFactory.initialize();
  });

  // ====== Basic operations ======
  describe('basic operations', () => {
    it('should create and retrieve a PTY connection', async () => {
      const conn = await ConnectionFactory.create({
        id: 'test-pty',
        name: 'Test PTY',
        type: ConnectionType.PTY,
        shell: 'bash',
      });

      expect(conn).toBeDefined();
      expect(conn.id).toBe('test-pty');
      expect(conn.type).toBe(ConnectionType.PTY);

      const retrieved = ConnectionFactory.get('test-pty');
      expect(retrieved).toBe(conn);
    });

    it('should throw on duplicate id', async () => {
      await ConnectionFactory.create({
        id: 'dup',
        name: 'A',
        type: ConnectionType.PTY,
        shell: 'bash',
      });

      await expect(
        ConnectionFactory.create({
          id: 'dup',
          name: 'B',
          type: ConnectionType.PTY,
          shell: 'zsh',
        }),
      ).rejects.toThrow('already exists');
    });

    it('should throw on unsupported type', async () => {
      await expect(
        ConnectionFactory.create({
          id: 'bad',
          name: 'Bad',
          type: 'invalid' as ConnectionType,
        } as any),
      ).rejects.toThrow('Unsupported connection type');
    });
  });

  // ====== Lifecycle ======
  describe('lifecycle', () => {
    it('should destroy a connection', async () => {
      const conn = await ConnectionFactory.create({
        id: 'to-destroy',
        name: 'Destroy Me',
        type: ConnectionType.PTY,
        shell: 'bash',
      });

      await ConnectionFactory.destroy('to-destroy');
      expect(ConnectionFactory.get('to-destroy')).toBeUndefined();
    });

    it('should handle destroy on non-existent id gracefully', async () => {
      await expect(
        ConnectionFactory.destroy('nonexistent'),
      ).resolves.toBeUndefined();
    });

    it('should destroy all connections', async () => {
      await ConnectionFactory.create({
        id: 'a', name: 'A', type: ConnectionType.PTY, shell: 'bash',
      });
      await ConnectionFactory.create({
        id: 'b', name: 'B', type: ConnectionType.PTY, shell: 'zsh',
      });

      await ConnectionFactory.destroyAll();

      expect(ConnectionFactory.get('a')).toBeUndefined();
      expect(ConnectionFactory.get('b')).toBeUndefined();
    });

    it('should list all connections', async () => {
      await ConnectionFactory.create({
        id: 'a', name: 'A', type: ConnectionType.PTY, shell: 'bash',
      });

      const all = ConnectionFactory.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('a');
    });
  });

  // ====== Events ======
  describe('events', () => {
    it('should emit create event', async () => {
      const onCreated = vi.fn();
      ConnectionFactory.onCreate(onCreated);

      await ConnectionFactory.create({
        id: 'event-test',
        name: 'Event',
        type: ConnectionType.PTY,
        shell: 'bash',
      });

      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onCreated.mock.calls[0][0].id).toBe('event-test');
    });

    it('should emit destroy event', async () => {
      const onDestroyed = vi.fn();
      ConnectionFactory.onDestroy(onDestroyed);

      const conn = await ConnectionFactory.create({
        id: 'event-destroy',
        name: 'Event Destroy',
        type: ConnectionType.PTY,
        shell: 'bash',
      });

      await ConnectionFactory.destroy('event-destroy');

      expect(onDestroyed).toHaveBeenCalledTimes(1);
      expect(onDestroyed.mock.calls[0][0].id).toBe('event-destroy');
    });
  });

  // ====== Connection types ======
  describe('connection types', () => {
    it('should create Serial connection', async () => {
      const conn = await ConnectionFactory.create({
        id: 'serial-1',
        name: 'Serial',
        type: ConnectionType.SERIAL,
        path: '/dev/ttyUSB0',
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });

      expect(conn.type).toBe(ConnectionType.SERIAL);
      expect(conn.id).toBe('serial-1');
    });

    it('should create SSH connection', async () => {
      const conn = await ConnectionFactory.create({
        id: 'ssh-1',
        name: 'SSH',
        type: ConnectionType.SSH,
        host: '192.168.1.1',
        port: 22,
        username: 'admin',
        password: 'secret',
      });

      expect(conn.type).toBe(ConnectionType.SSH);
    });

    it('should create Telnet connection', async () => {
      const conn = await ConnectionFactory.create({
        id: 'telnet-1',
        name: 'Telnet',
        type: ConnectionType.TELNET,
        host: '192.168.1.1',
        port: 23,
      });

      expect(conn.type).toBe(ConnectionType.TELNET);
    });

    it('should create ConnectionServer', async () => {
      // First create a source connection
      const source = await ConnectionFactory.create({
        id: 'source-pty',
        name: 'Source',
        type: ConnectionType.PTY,
        shell: 'bash',
      });

      const server = await ConnectionFactory.create({
        id: 'server-1',
        name: 'Server',
        type: ConnectionType.CONNECTION_SERVER,
        sourceId: 'source-pty',
        port: 9000,
      });

      expect(server.type).toBe(ConnectionType.CONNECTION_SERVER);
    });
  });

  // ====== Edge cases ======
  describe('edge cases', () => {
    it('should handle initialize clearing all connections', async () => {
      await ConnectionFactory.create({
        id: 'pre-init',
        name: 'Pre Init',
        type: ConnectionType.PTY,
        shell: 'bash',
      });

      ConnectionFactory.initialize();

      expect(ConnectionFactory.getAll()).toHaveLength(0);
    });

    it('should not throw destroying already-destroyed connection', async () => {
      const conn = await ConnectionFactory.create({
        id: 'twice',
        name: 'Twice',
        type: ConnectionType.PTY,
        shell: 'bash',
      });

      await ConnectionFactory.destroy('twice');
      // Second destroy should be a no-op
      await ConnectionFactory.destroy('twice');
      expect(ConnectionFactory.get('twice')).toBeUndefined();
    });
  });
});
