import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// 启用 HTTPS：手机浏览器调用 getUserMedia 需要 HTTPS 或 localhost
// 自签证书首次访问会有"不安全"警告，点"继续访问"即可
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
