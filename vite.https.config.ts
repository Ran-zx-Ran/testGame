import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import baseConfig from './vite.config';

/** 本地开发证书目录。 */
const CERTIFICATE_DIRECTORY = resolve(__dirname, '.certs');

/** HTTPS 服务使用的 PFX 证书路径。 */
const PFX_PATH = resolve(CERTIFICATE_DIRECTORY, 'dev-cert.pfx');

/** 供 iPhone 安装的本地根证书路径。 */
const CA_CERTIFICATE_PATH = resolve(CERTIFICATE_DIRECTORY, 'local-dev-ca.cer');

/** 证书中记录的当前局域网 IPv4 地址文件。 */
const LAN_IP_PATH = resolve(CERTIFICATE_DIRECTORY, 'lan-ip.txt');

/** 本地 PFX 文件的固定开发口令。 */
const PFX_PASSPHRASE = 'motion-arcade-local';

/** 仅通过 HTTP 提供公开根证书，便于 iPhone 在信任 HTTPS 前完成安装。 */
function createCertificateDownloadPlugin(lanIp: string): Plugin {
  return {
    name: 'local-certificate-download',
    configureServer(viteServer) {
      /** 只提供公开根证书的临时 HTTP 服务。 */
      const certificateServer = createHttpServer((request, response) => {
        if (request.url !== '/local-dev-ca.cer') {
          response.writeHead(404).end('Not Found');
          return;
        }
        /** 返回给手机安装的 DER 格式根证书。 */
        const certificate = readFileSync(CA_CERTIFICATE_PATH);
        response.writeHead(200, {
          'Content-Type': 'application/x-x509-ca-cert',
          'Content-Disposition': 'attachment; filename="motion-arcade-local-ca.cer"',
          'Cache-Control': 'no-store',
        });
        response.end(certificate);
      });
      certificateServer.on('error', (error) => {
        viteServer.config.logger.warn(`根证书下载服务启动失败：${error.message}`);
      });
      certificateServer.listen(5174, '0.0.0.0', () => {
        viteServer.config.logger.info(`  手机证书下载: http://${lanIp}:5174/local-dev-ca.cer`);
        viteServer.config.logger.info(`  手机游戏地址: https://${lanIp}:5173`);
      });
      viteServer.httpServer?.once('close', () => certificateServer.close());
    },
  };
}

/** 使用本地签发证书扩展基础 Vite 开发配置。 */
export default defineConfig(() => {
  /** 证书签发时使用的局域网 IPv4 地址。 */
  const lanIp = readFileSync(LAN_IP_PATH, 'utf8').trim();
  return mergeConfig(baseConfig, {
    plugins: [createCertificateDownloadPlugin(lanIp)],
    server: {
      https: {
        pfx: readFileSync(PFX_PATH),
        passphrase: PFX_PASSPHRASE,
      },
    },
  });
});
