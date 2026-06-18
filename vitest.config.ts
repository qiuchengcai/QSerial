import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@qserial/shared': resolve(__dirname, 'packages/shared/src'),
      '@': resolve(__dirname, 'packages/renderer/src'),
    },
  },
  test: {
    globals: true,
    include: ['packages/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/main/src/**/*.ts',
        'packages/shared/src/**/*.ts',
        'packages/renderer/src/**/*.{ts,tsx}',
      ],
      exclude: [
        'packages/main/src/services/mcp/manager.ts',
      ],
      thresholds: {
        'packages/shared/src': {
          statements: 85,
          branches: 80,
          functions: 85,
          lines: 85,
        },
      },
    },
  },
});
