import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The web app calls /api/* on its own origin. In development Vite forwards it to the NestJS API,
// so login cookies are first-party. In production, Vercel rewrites /api/* to the Render API (see vercel.json).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
