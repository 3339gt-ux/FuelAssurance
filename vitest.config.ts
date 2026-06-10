import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      '.next',
      'tests/e2e/**',
      // Local-only seed script — requires real Sample Files and mutates local_db.json
      'tests/seed.test.ts',
      // Full acceptance suite — requires local Sample Files (run via npm run test:acceptance locally)
      'tests/acceptance/domain.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
