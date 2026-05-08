import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Filter harmless EPIPE errors from WS proxy reconnection
function suppressWsErrors() {
  return {
    name: 'suppress-ws-errors',
    configureServer() {
      const originalError = console.error;
      console.error = (...args) => {
        const msg = args[0]?.toString?.() || '';
        if (msg.includes('ws proxy socket error') || msg.includes('EPIPE')) {
          return;
        }
        originalError.apply(console, args);
      };
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), suppressWsErrors()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Only proxy API calls during development
    ...(command === 'serve' && {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'http://localhost:3000',
          ws: true,
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/embed': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      // Configure for use behind Caddy reverse proxy
      hmr: {
        protocol: 'wss',
        host: 'dev.testing',
      },
    }),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          styles: ['styled-components'],
        },
      },
    },
  },
}));
