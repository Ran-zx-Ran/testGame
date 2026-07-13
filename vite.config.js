import { defineConfig } from 'vite';

// 摄像头 API 在 localhost 下不需要 HTTPS
// 如需手机访问，可用 `vite --host` + HTTPS 代理或 mkcert
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
