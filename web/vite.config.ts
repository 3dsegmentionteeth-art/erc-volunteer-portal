/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// API endpoint the *browser* is served at. Empty '' means same-origin: the
// dev/preview servers proxy /api to the API host below, so the session and
// CSRF cookies stay same-site and CORS never comes into play. Bake a real URL
// with VITE_API_URL only when the SPA is deliberately served cross-origin.
const previewApiTarget = process.env.ERC_PREVIEW_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Dev: SPA talks to the API same-origin through this proxy.
      '/api': { target: 'http://localhost:4000', changeOrigin: false },
    },
  },
  preview: {
    port: 5173,
    host: true,
    proxy: {
      // `vite preview` (local `npm run preview`, or the compose `web`
      // container): same-origin again. The container overrides the target with
      // ERC_PREVIEW_PROXY_TARGET=http://app:4000; locally it hits the API dev
      // server on the host.
      '/api': { target: previewApiTarget, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});