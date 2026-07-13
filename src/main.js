import './styles.css';
import { Router } from './core/Router.js';
import { Assets } from './core/Assets.js';
import { AudioManager } from './core/Audio.js';
import { Camera } from './core/Camera.js';
import { PoseDetector } from './core/PoseDetector.js';

// 全局错误兜底：任何 JS 错误都显示在页面上，避免黑屏无提示
window.addEventListener('error', (e) => {
  const app = document.getElementById('app');
  if (app && !app.innerHTML) {
    app.innerHTML = `<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ff6b6b;font-family:monospace;padding:20px;text-align:center;z-index:9999;">
      <h2>页面加载出错</h2>
      <pre style="max-width:90vw;overflow:auto;">${(e.error?.stack || e.message || String(e)).replace(/</g,'&lt;')}</pre>
    </div>`;
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
});

// 全局共享单例
const app = document.getElementById('app');
export const ctx = {
  app,
  assets: new Assets(),
  audio: new AudioManager(),
  camera: new Camera(),
  pose: new PoseDetector(),
};

// 路由：菜单 / 切水果 / 光之巨人
const router = new Router(app, {
  menu: () => import('./scenes/Menu.js').then(m => new m.Menu(ctx)),
  fruit: () => import('./scenes/FruitGame.js').then(m => new m.FruitGame(ctx)),
  hero: () => import('./scenes/HeroGame.js').then(m => new m.HeroGame(ctx)),
});
ctx.router = router;

// 启动到菜单
router.go('menu').catch(err => {
  app.innerHTML = `<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ff6b6b;font-family:monospace;padding:20px;text-align:center;z-index:9999;">
    <h2>启动失败</h2>
    <pre style="max-width:90vw;overflow:auto;">${(err?.stack || err?.message || String(err)).replace(/</g,'&lt;')}</pre>
  </div>`;
});

// 防止 iOS 双指缩放、双击放大
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
