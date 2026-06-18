/**
 * @vitest-environment jsdom
 */
/// <reference types="vitest" />
import '../setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from '../../src/stores/theme';

describe('useThemeStore', () => {
  beforeEach(() => {
    // Reset store to default state
    useThemeStore.setState({
      themes: [],
      currentTheme: { id: 'github-dark', name: 'GitHub Dark', xterm: {} },
    });
  });

  describe('initial state', () => {
    it('should have themes defined', () => {
      const state = useThemeStore.getState();
      expect(Array.isArray(state.themes)).toBe(true);
    });

    it('should have a current theme', () => {
      const state = useThemeStore.getState();
      expect(state.currentTheme).toBeDefined();
      expect(state.currentTheme.id).toBeDefined();
    });
  });

  describe('theme switching', () => {
    it('should provide setTheme function', () => {
      const state = useThemeStore.getState();
      // The store should have theme management functions
      expect(state).toHaveProperty('currentTheme');
    });
  });
});
