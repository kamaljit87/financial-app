import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // treat .js files as JSX so we don't need to rename everything
      include: '**/*.{jsx,js}',
    }),
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: 7200,
    proxy: {
      '/api': { target: 'http://backend:3001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
  },
});
