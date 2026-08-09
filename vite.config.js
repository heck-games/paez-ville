import { defineConfig } from 'vite';

// Paez Ville - Vite config.
// base: './' so the built game works when served from any subpath (e.g. Cloudflare Pages project dir).
export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    host: true,
  },
});
