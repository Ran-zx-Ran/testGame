import { defineConfig } from 'vite';

/** Vite 开发与生产构建配置。 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
