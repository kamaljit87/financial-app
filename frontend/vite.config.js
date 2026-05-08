import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/financial-app';
  const apiProxy = {
    [`${basePath}/api`]: {
      target: 'http://backend:3001',
      rewrite: path => path.replace(new RegExp(`^${basePath}`), ''),
      changeOrigin: true,
    },
  };

  return {
    base: `${basePath}/`,
    plugins: [
      react({
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
      proxy: apiProxy,
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
      proxy: apiProxy,
    },
    build: {
      outDir: 'build',
      sourcemap: false,
    },
  };
});
