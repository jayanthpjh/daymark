import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = fileURLToPath(new URL('../public', import.meta.url));

// public/ also holds re-export shims for the server's JS models, so only the hashed bundle is cleaned.
const cleanAssets = () => ({ name: 'clean-assets', buildStart() { rmSync(out + '/assets', { recursive: true, force: true }); rmSync(out + '/index.html', { force: true }); } });

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss(), cleanAssets()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: out, emptyOutDir: false, sourcemap: false },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4173', '/_worker': 'http://127.0.0.1:4173' } },
});
