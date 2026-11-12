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
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) {
            return 'three';
          }
          if (/[\\/]node_modules[\\/]peerjs[\\/]/.test(id)) {
            return 'peerjs';
          }
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) {
            return 'supabase';
          }
        },
      },
    },
  },
});
