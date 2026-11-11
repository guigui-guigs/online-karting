import { defineConfig } from 'vite';

const backendPort = process.env.PORT || 3001;

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': {
        target: `ws://localhost:${backendPort}`,
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
