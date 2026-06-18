/**
 * @vitest-environment jsdom
 */
/// <reference types="vitest" />
import '../setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { useSavedSessionsStore, type SavedSession } from '../../src/stores/sessions';

describe('useSavedSessionsStore', () => {
  beforeEach(() => {
    useSavedSessionsStore.setState({ sessions: [] });
  });

  describe('initial state', () => {
    it('should start with empty sessions', () => {
      const state = useSavedSessionsStore.getState();
      expect(state.sessions).toEqual([]);
    });
  });

  describe('addSession', () => {
    it('should add a serial session', () => {
      const store = useSavedSessionsStore.getState();
      const id = store.addSession({
        name: 'Test Serial',
        type: 'serial',
        serialConfig: {
          path: '/dev/ttyUSB0',
          baudRate: 115200,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
        },
        lastUsedAt: new Date(),
      });
      expect(id).toBeTruthy();
      const sessions = useSavedSessionsStore.getState().sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('Test Serial');
      expect(sessions[0].type).toBe('serial');
    });

    it('should add an SSH session', () => {
      const store = useSavedSessionsStore.getState();
      const id = store.addSession({
        name: 'Test SSH',
        type: 'ssh',
        sshConfig: {
          host: '192.168.1.1',
          port: 22,
          username: 'root',
        },
        lastUsedAt: new Date(),
      });
      expect(id).toBeTruthy();
      const sessions = useSavedSessionsStore.getState().sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].type).toBe('ssh');
    });

    it('should add a Telnet session', () => {
      const store = useSavedSessionsStore.getState();
      store.addSession({
        name: 'Test Telnet',
        type: 'telnet',
        telnetConfig: { host: '10.0.0.1', port: 23 },
        lastUsedAt: new Date(),
      });
      expect(useSavedSessionsStore.getState().sessions).toHaveLength(1);
    });

    it('should add a PTY session', () => {
      const store = useSavedSessionsStore.getState();
      store.addSession({
        name: 'Test PTY',
        type: 'pty',
        ptyConfig: { shell: '/bin/bash' },
        lastUsedAt: new Date(),
      });
      expect(useSavedSessionsStore.getState().sessions).toHaveLength(1);
    });
  });

  describe('removeSession', () => {
    it('should remove a session by id', () => {
      const store = useSavedSessionsStore.getState();
      const id = store.addSession({
        name: 'To Remove',
        type: 'pty',
        ptyConfig: { shell: '/bin/sh' },
        lastUsedAt: new Date(),
      });
      expect(useSavedSessionsStore.getState().sessions).toHaveLength(1);
      store.removeSession(id);
      expect(useSavedSessionsStore.getState().sessions).toHaveLength(0);
    });

    it('should not throw for non-existent id', () => {
      const store = useSavedSessionsStore.getState();
      expect(() => store.removeSession('non-existent')).not.toThrow();
    });
  });

  describe('updateSession', () => {
    it('should update session name', () => {
      const store = useSavedSessionsStore.getState();
      const id = store.addSession({
        name: 'Old Name',
        type: 'pty',
        ptyConfig: { shell: '/bin/bash' },
        lastUsedAt: new Date(),
      });
      store.updateSession(id, { name: 'New Name' });
      const updated = useSavedSessionsStore.getState().sessions.find((s: SavedSession) => s.id === id);
      expect(updated?.name).toBe('New Name');
    });
  });

  describe('reorderSessions', () => {
    it('should move a session from first to last', () => {
      const store = useSavedSessionsStore.getState();
      store.addSession({
        name: 'First',
        type: 'pty',
        ptyConfig: { shell: '/bin/sh' },
        lastUsedAt: new Date(),
      });
      store.addSession({
        name: 'Second',
        type: 'pty',
        ptyConfig: { shell: '/bin/bash' },
        lastUsedAt: new Date(),
      });
      store.addSession({
        name: 'Third',
        type: 'pty',
        ptyConfig: { shell: '/bin/zsh' },
        lastUsedAt: new Date(),
      });
      store.reorderSessions(0, 2);
      const sessions = useSavedSessionsStore.getState().sessions;
      expect(sessions[2].name).toBe('First');
    });
  });
});
