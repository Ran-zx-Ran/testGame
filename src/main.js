import './styles.css';
import { Router } from './core/Router.js';
import { Assets } from './core/Assets.js';
import { AudioManager } from './core/Audio.js';
import { Camera } from './core/Camera.js';
import { PoseDetector } from './core/PoseDetector.js';

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
router.go('menu');

// 注册 Service Worker 的位置留空——H5 体感游戏不强依赖 PWA
// 如需离线可后续补 sw.js

// 防止 iOS 双指缩放、双击放大
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
