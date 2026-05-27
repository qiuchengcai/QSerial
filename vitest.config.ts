import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@qserial/shared': resolve(__dirname, 'packages/shared/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/main/src/**/*.ts',
        'packages/shared/src/**/*.ts',
      ],
      exclude: [
        'packages/main/src/mcp/manager.ts',
      ],
    },
  },
});
