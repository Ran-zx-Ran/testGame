// 场景基类：处理摄像头启动、模型加载、主循环、镜像绘制、骨架可视化、边缘场景检测
// 子类需实现：onReady()、onUpdate(dt, pose, ts)、onRenderGame(g, dt, pose, ts)、onDestroy()
import { POSE } from '../core/PoseDetector.js';

const SKELETON = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
  [27,29],[29,31],[27,31],[28,30],[30,32],[28,32],
  [15,17],[15,19],[15,21],[17,19],  // 左手
  [16,18],[16,20],[16,22],[18,20],  // 右手
  [0,11],[0,12],
];

export class SceneBase {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = null;
    this.stage = null;
    this.video = null;
    this.camCanvas = null;
    this.gameCanvas = null;
    this.uiLayer = null;
    this.banner = null;
    this.camCtx = null;
    this.gameCtx = null;
    this.rafId = 0;
    this.lastTs = 0;
    this.running = false;
    this.showSkeleton = false;
    this._dimCheckTs = 0;
    this._brightCanvas = document.createElement('canvas');
    this._brightCanvas.width = 64; this._brightCanvas.height = 48;
    this._brightCtx = this._brightCanvas.getContext('2d', { willReadFrequently: true });
    this._lastPersonTs = 0;
    this._lowFpsCount = 0;
    this._cover = { dx: 0, dy: 0, dw: 0, dh: 0 }; // 视频在 camCanvas 上的 cover 显示区域
  }

  async mount(root) {
    this.root = root;
    this._buildDOM();
    this._showLoading('正在初始化…');

    // 提前 resume 音频（用户进入此页前的点击已触发）
    try { await this.ctx.audio.resume(); } catch {}

    // 总超时保护：30 秒还没成功就提示
    let timedOut = false;
    const timeoutGuard = setTimeout(() => {
      timedOut = true;
      this._hideLoading();
      this._showError('加载超时：网络较慢或无法访问模型服务器。请检查网络后重试，或科学上网。', 'TIMEOUT');
    }, 45000);

    // 并行：启动摄像头 + 加载姿态模型，各自带进度
    try {
      const results = await Promise.allSettled([
        this.ctx.camera.start({ facingMode: 'user' }),
        this.ctx.pose.init(),
      ]);
      if (timedOut) return;
      clearTimeout(timeoutGuard);

      const camRes = results[0];
      const poseRes = results[1];
      if (camRes.status === 'rejected') {
        throw camRes.reason;
      }
      if (poseRes.status === 'rejected') {
        throw poseRes.reason;
      }
      this.video = camRes.value;
      this._hideLoading();
      this.onReady?.();
      this.startLoop();
    } catch (e) {
      if (timedOut) return;
      clearTimeout(timeoutGuard);
      this._hideLoading();
      this._showError(e.message || String(e), e.code);
    }
  }

  _buildDOM() {
    const stage = document.createElement('div');
    stage.className = 'stage';
    stage.innerHTML = `
      <video id="camVideo" autoplay playsinline muted></video>
      <canvas id="camCanvas"></canvas>
      <canvas id="gameCanvas"></canvas>
      <div id="uiLayer"></div>
      <div class="banner" id="banner"></div>
    `;
    this.root.appendChild(stage);
    this.stage = stage;
    this.camCanvas = stage.querySelector('#camCanvas');
    this.gameCanvas = stage.querySelector('#gameCanvas');
    this.uiLayer = stage.querySelector('#uiLayer');
    this.banner = stage.querySelector('#banner');
    this.camCtx = this.camCanvas.getContext('2d');
    this.gameCtx = this.gameCanvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', this._resize);
    window.addEventListener('orientationchange', this._resize);
  }

  _resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    [this.camCanvas, this.gameCanvas].forEach(cv => {
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
    });
    this.camCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.gameCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._dpr = dpr;
    this._w = w; this._h = h;
  };

  startLoop() {
    this.running = true;
    this.lastTs = performance.now();
    const tick = (ts) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this._frame(ts, dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _frame(ts, dt) {
    const pose = this.ctx.pose.detect(this.video, ts);
    this._drawCamera();
    if (this.showSkeleton && pose?.hasPerson) this._drawSkeleton(pose.landmarks);
    // 子类逻辑
    this.onUpdate?.(dt, pose, ts);
    // 子类渲染
    const g = this.gameCtx;
    g.clearRect(0, 0, this._w, this._h);
    this.onRenderGame?.(g, dt, pose, ts);
    // 边缘场景检测
    this._checkEdge(ts, pose);
  }

  _drawCamera() {
    const g = this.camCtx;
    const cw = this._w, ch = this._h;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale, dh = vh * scale;
    const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    this._cover = { dx, dy, dw, dh, vw, vh };
    g.save();
    g.translate(cw, 0); g.scale(-1, 1);  // 水平镜像（前置摄像头照镜子感）
    g.drawImage(this.video, cw - dx - dw, dy, dw, dh);  // 反向后 x 坐标需调整
    g.restore();
    // 暗化遮罩，让游戏内容更突出
    g.fillStyle = 'rgba(5,6,15,0.4)';
    g.fillRect(0, 0, cw, ch);
  }

  _drawSkeleton(lm) {
    const g = this.camCtx;
    const { dx, dy, dw, dh } = this._cover;
    const toPx = (p) => ({ x: p.x * dw + dx, y: p.y * dh + dy });
    g.strokeStyle = 'rgba(120,220,255,0.85)';
    g.lineWidth = 4; g.lineCap = 'round';
    SKELETON.forEach(([a, b]) => {
      const pa = lm[a], pb = lm[b];
      if (!pa || !pb) return;
      if ((pa.visibility ?? 1) < 0.3 || (pb.visibility ?? 1) < 0.3) return;
      const A = toPx(pa), B = toPx(pb);
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
    });
    // 关键点
    g.fillStyle = '#ffe14a';
    lm.forEach((p, i) => {
      if ((p.visibility ?? 1) < 0.3) return;
      const P = toPx(p);
      g.beginPath(); g.arc(P.x, P.y, i === POSE.LEFT_WRIST || i === POSE.RIGHT_WRIST ? 8 : 4, 0, Math.PI*2); g.fill();
    });
  }

  // 关键点归一化坐标 -> canvas 像素坐标（与镜像后的视频对齐）
  poseToPx(p) {
    if (!p) return null;
    const { dx, dy, dw, dh } = this._cover;
    return { x: p.x * dw + dx, y: p.y * dh + dy };
  }

  // 边缘场景检测：光线不足、无人、低帧率
  async _checkEdge(ts, pose) {
    // 无人提示
    if (pose && !pose.hasPerson) {
      if (!this._noPersonTs) this._noPersonTs = ts;
      if (ts - this._noPersonTs > 2500) {
        this.showBanner('未检测到人体，请退后两步让全身入镜', 2500);
        this._noPersonTs = ts; // 避免重复
      }
    } else {
      this._noPersonTs = 0;
    }
    // 低帧率提示（每 3 秒检查一次）
    if (!this._edgeTs || ts - this._edgeTs > 3000) {
      this._edgeTs = ts;
      const fps = this.ctx.pose.fps;
      if (fps && fps < 12) {
        this._lowFpsCount++;
        if (this._lowFpsCount >= 2) {
          this.showBanner('设备性能较低，已自动降级画质', 3000);
        }
      } else { this._lowFpsCount = 0; }
      // 亮度检测
      const b = await this.ctx.camera.getBrightness(this._brightCanvas, this._brightCtx);
      if (b < 0.12) this.showBanner('环境光过暗，请开灯或移到明亮处', 3000);
    }
  }

  showBanner(text, ms = 2500) {
    this.banner.textContent = text;
    this.banner.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.banner.classList.remove('show'), ms);
  }

  popScore(text, x, y, color = '#ffe66c') {
    const el = document.createElement('div');
    el.className = 'score-pop';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color;
    this.uiLayer.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  _showLoading(text) {
    const div = document.createElement('div');
    div.className = 'overlay';
    div.id = 'loadingOverlay';
    div.innerHTML = `
      <div class="spinner"></div>
      <h1 style="font-size:22px;margin:0;">${text}</h1>
      <p style="font-size:13px;color:#9aa0c0;">首次加载需下载姿态识别模型（约 6MB），请稍候<br>如长时间无响应，请检查网络或科学上网</p>
      <p id="loadTip" style="font-size:12px;color:#6a6f8a;"></p>
    `;
    this.root.appendChild(div);
    this._loadTip = div.querySelector('#loadTip');
    // 模拟进度提示
    let step = 0;
    const tips = ['正在请求摄像头权限…', '正在加载 WASM 内核…', '正在下载姿态识别模型…', '正在初始化推理引擎…'];
    this._loadTimer = setInterval(() => {
      if (this._loadTip) {
        this._loadTip.textContent = tips[step % tips.length];
        step++;
      }
    }, 3000);
  }
  _hideLoading() {
    if (this._loadTimer) { clearInterval(this._loadTimer); this._loadTimer = null; }
    this.root.querySelector('#loadingOverlay')?.remove();
  }

  _showError(msg, code) {
    const div = document.createElement('div');
    div.className = 'overlay';
    const isHttps = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    let httpsHint = '';
    if (!isHttps && code !== 'UNSUPPORTED') {
      httpsHint = '<p style="color:#ffb84a">⚠ 当前为 HTTP，浏览器禁止调用摄像头。请：<br>1) 电脑用 <code>https://localhost:5173</code> 访问；<br>2) 手机用 <code>https://你的IP:5173</code>（自签证书点"继续访问"）。</p>';
    }
    // 模型加载失败的额外提示
    let modelHint = '';
    if (msg.includes('模型') || msg.includes('CDN') || msg.includes('超时')) {
      modelHint = '<p style="color:#9be15d">💡 模型需要从 Google/CDN 下载，国内网络可能不通。请：<br>· 开启科学上网后重试<br>· 或换个网络环境<br>· 模型仅首次加载，成功后浏览器会缓存</p>';
    }
    div.innerHTML = `
      <h1 style="color:#ff6b6b">⚠ 出错了</h1>
      <p>${msg}</p>
      ${httpsHint}
      ${modelHint}
      <p style="font-size:12px;color:#6a6f8a;">协议: ${location.protocol} | 主机: ${location.hostname} | 错误码: ${code || 'N/A'}</p>
      <div class="row">
        <button class="btn btn-primary" id="errRetry">重试</button>
        <button class="btn btn-ghost" id="errBack">返回菜单</button>
      </div>
    `;
    this.root.appendChild(div);
    div.querySelector('#errRetry').onclick = () => { div.remove(); this.mount(this.root); };
    div.querySelector('#errBack').onclick = () => this.ctx.router.go('menu');
  }

  async destroy() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this._resize);
    window.removeEventListener('orientationchange', this._resize);
    this.ctx.audio.stopBGM();
    try { await this.onDestroy?.(); } catch (e) { console.warn(e); }
    // 不停摄像头与 pose（共享单例），由路由切换时复用
    // 但完全退出时由 main 统一释放
    this.root.innerHTML = '';
  }
}
