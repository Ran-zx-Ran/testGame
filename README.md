# 体感竞技场

一个横屏 Web 体感游戏，包含“切水果”和“光之英雄打怪兽”两种模式。摄像头姿态识别在浏览器本地完成，并提供鼠标、触摸和键盘降级输入。

## 环境与启动

- Node.js `20.19+`
- pnpm `11+`
- Chrome 或 Edge 新版浏览器

```powershell
pnpm install
pnpm dev
```

电脑本地使用 `http://localhost:5173` 即可获得摄像头权限。局域网手机访问 `http://电脑IP:5173` 时不属于安全上下文，iPhone Safari 不会开放摄像头与麦克风 API。

### iPhone 局域网调试

在启动服务的 Windows 电脑执行：

```powershell
pnpm https:setup
pnpm dev:https
```

`https:setup` 会为电脑当前局域网 IPv4 地址生成仅保存在 `.certs` 中的本地开发证书。`dev:https` 启动后，终端会显示“手机证书下载”和“手机游戏地址”，然后在 iPhone 上完成以下设置：

1. 使用 Safari 打开终端显示的 `http://电脑IP:5174/local-dev-ca.cer`，下载描述文件。
2. 打开“设置 > 通用 > VPN 与设备管理”，安装 `Motion Arcade Local Development CA`。
3. 打开“设置 > 通用 > 关于本机 > 证书信任设置”，为该证书启用完全信任。
4. 使用 Safari 打开终端显示的 `https://电脑IP:5173`，再点击“开启摄像头与语音”。

iPhone 和电脑必须处于同一局域网，Windows 防火墙需要允许 Node.js 使用专用网络。若电脑局域网 IP 改变，请重新执行 `pnpm https:setup` 并在手机上重新安装新证书。正式部署时不应使用本地开发证书，应将 `pnpm build` 生成的 `dist` 部署到具有可信 HTTPS 证书的静态站点。

## 控制方式

- 切水果：双手快速挥动；鼠标按住拖动或触摸滑动也可切割。
- 战斗：挥拳、踢腿、左右移动；双手在胸前交叉保持约 600 毫秒，再向两侧展开释放光线。
- 语音：开始游戏、暂停游戏、继续游戏、重新开始、返回主页。
- 键盘降级：`A/D` 移动，`J` 出拳，`K` 踢腿，`L` 释放光线。

## 验证命令

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

MediaPipe 模型与 WASM 已放入 `public`，摄像头画面不会被应用上传或保存。浏览器语音识别可能使用浏览器厂商提供的在线服务。
