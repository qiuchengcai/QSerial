/**
 * @vitest-environment jsdom
 */
/// <reference types="vitest" />
import '../setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { useConfigStore } from '../../src/stores/config';
import { DEFAULT_CONFIG } from '@qserial/shared';

describe('useConfigStore', () => {
  beforeEach(() => {
    useConfigStore.setState({
      config: DEFAULT_CONFIG,
      isLoading: true,
    });
  });

  describe('initial state', () => {
    it('should start with default config', () => {
      const state = useConfigStore.getState();
      expect(state.config).toEqual(DEFAULT_CONFIG);
      expect(state.isLoading).toBe(true);
    });

    it('should have initialize function', () => {
      const state = useConfigStore.getState();
      expect(typeof state.initialize).toBe('function');
    });

    it('should have updateConfig function', () => {
      const state = useConfigStore.getState();
      expect(typeof state.updateConfig).toBe('function');
    });

    it('should have resetConfig function', () => {
      const state = useConfigStore.getState();
      expect(typeof state.resetConfig).toBe('function');
    });
  });

  describe('updateConfig', () => {
    it('should update terminal fontSize directly via setState', () => {
      useConfigStore.setState({
        config: {
          ...DEFAULT_CONFIG,
          terminal: { ...DEFAULT_CONFIG.terminal, fontSize: 20 },
        },
      });
      const updated = useConfigStore.getState();
      expect(updated.config.terminal.fontSize).toBe(20);
    });

    it('should update app language', () => {
      useConfigStore.setState({
        config: {
          ...DEFAULT_CONFIG,
          app: { ...DEFAULT_CONFIG.app, language: 'en-US' },
        },
      });
      const updated = useConfigStore.getState();
      expect(updated.config.app.language).toBe('en-US');
    });
  });

  describe('resetConfig', () => {
    it('should reset to default config', () => {
      // First change something
      useConfigStore.setState({
        config: {
          ...DEFAULT_CONFIG,
          terminal: { ...DEFAULT_CONFIG.terminal, fontSize: 20 },
        },
      });
      expect(useConfigStore.getState().config.terminal.fontSize).toBe(20);

      // Then reset
      useConfigStore.getState().resetConfig();
      expect(useConfigStore.getState().config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('initialize', () => {
    it('should set isLoading to false after successful init', async () => {
      // The mock qserial.config.getAll is already set up in setup.ts
      await useConfigStore.getState().initialize();
      const state = useConfigStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });
});
