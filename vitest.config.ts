import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests for the web app's pure helpers (web/src/lib). Components are covered by the browser scripts in tests/.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  test: { environment: 'node', include: ['web/src/**/*.test.ts'], restoreMocks: true },
});
