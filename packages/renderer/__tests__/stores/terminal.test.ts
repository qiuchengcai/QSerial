/**
 * @vitest-environment jsdom
 */
/// <reference types="vitest" />
import '../setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { useTerminalStore } from '../../src/stores/terminal';
import { ConnectionType, ConnectionState } from '@qserial/shared';

describe('useTerminalStore', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      tabs: [],
      activeTabId: null,
      sessions: {},
    });
  });

  describe('initial state', () => {
    it('should start with empty tabs', () => {
      const state = useTerminalStore.getState();
      expect(state.tabs).toEqual([]);
      expect(state.activeTabId).toBeNull();
      expect(state.sessions).toEqual({});
    });
  });

  describe('createTab', () => {
    it('should create a new tab and set it active', () => {
      const store = useTerminalStore.getState();
      const tabId = store.createTab('Test Tab');
      expect(tabId).toBeTruthy();
      const state = useTerminalStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].name).toBe('Test Tab');
      expect(state.activeTabId).toBe(tabId);
    });

    it('should auto-name tab if name is empty', () => {
      const store = useTerminalStore.getState();
      store.createTab('');
      const state = useTerminalStore.getState();
      expect(state.tabs[0].name).toContain('Tab');
    });

    it('should create multiple tabs', () => {
      const store = useTerminalStore.getState();
      store.createTab('A');
      store.createTab('B');
      store.createTab('C');
      expect(useTerminalStore.getState().tabs).toHaveLength(3);
    });
  });

  describe('createSession', () => {
    it('should create a session in the active tab', () => {
      const store = useTerminalStore.getState();
      store.createTab('Main');
      const connId = crypto.randomUUID();
      const sessionId = store.createSession(connId, ConnectionType.SERIAL, '/dev/ttyUSB0');
      expect(sessionId).toBeTruthy();
      const state = useTerminalStore.getState();
      expect(state.sessions[sessionId]).toBeDefined();
      expect(state.sessions[sessionId].connectionType).toBe(ConnectionType.SERIAL);
    });
  });

  describe('setActiveTab', () => {
    it('should change active tab', () => {
      const store = useTerminalStore.getState();
      const tab1 = store.createTab('Tab 1');
      const tab2 = store.createTab('Tab 2');
      // tab2 should be active (last created)
      expect(useTerminalStore.getState().activeTabId).toBe(tab2);
      store.setActiveTab(tab1);
      expect(useTerminalStore.getState().activeTabId).toBe(tab1);
    });
  });

  describe('renameTab', () => {
    it('should rename a tab', () => {
      const store = useTerminalStore.getState();
      const tabId = store.createTab('Old Name');
      store.renameTab(tabId, 'New Name');
      const state = useTerminalStore.getState();
      expect(state.tabs[0].name).toBe('New Name');
    });
  });

  describe('updateSessionState', () => {
    it('should update session connection state', () => {
      const store = useTerminalStore.getState();
      store.createTab('Main');
      const sessionId = store.createSession('conn-1', ConnectionType.SERIAL, '/dev/ttyUSB0');
      store.updateSessionState(sessionId, ConnectionState.CONNECTED);
      const state = useTerminalStore.getState();
      expect(state.sessions[sessionId].connectionState).toBe(ConnectionState.CONNECTED);
    });
  });
});
