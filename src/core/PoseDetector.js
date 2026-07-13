// MediaPipe Pose 封装：加载 wasm + 模型，detectForVideo，关键点一阶低通平滑
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// WASM 走本地 public/wasm（已从 node_modules 拷贝，避免 CDN 卡住导致黑屏）
const WASM_URL = '/wasm';
// 模型走多个 CDN 源，带超时，全部失败才报错
const MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/pose_landmarker_lite.task',
  'https://huggingface.co/mediapipe/pose_landmarker/resolve/main/pose_landmarker_lite.task',
];
// 单个模型 URL 加载超时（毫秒）
const MODEL_TIMEOUT_MS = 12000;

// 33 关键点索引（BlazePose）
export const POSE = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

// 带 fetch 超时的模型加载
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 1000) throw new Error('模型文件过小，可能是错误页');
    return new Uint8Array(buf);
  } finally {
    clearTimeout(timer);
  }
}

export class PoseDetector {
  constructor() {
    this.landmarker = null;
    this.prev = null;       // 上一帧平滑后关键点
    this.prevTs = 0;
    this.loading = false;
    this.lastResult = null;
    this.lastTs = 0;
    // 速度缓存：{ index: { x, y, mag } }
    this.velocity = {};
    // 简单帧率统计
    this._fpsFrames = 0;
    this._fpsT0 = 0;
    this.fps = 0;
    this.lastError = null;
  }

  async init() {
    if (this.landmarker || this.loading) return;
    this.loading = true;
    this.lastError = null;

    // 1. 加载 wasm（本地，几乎不会失败）
    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(WASM_URL);
    } catch (e) {
      this.loading = false;
      this.lastError = 'WASM 加载失败：' + (e.message || e);
      throw new Error(this.lastError);
    }

    // 2. 加载模型：依次尝试多个 CDN，每个带超时
    let lastErr;
    let modelBuffer = null;
    for (const url of MODEL_URLS) {
      try {
        console.log('[Pose] 尝试加载模型:', url);
        modelBuffer = await fetchWithTimeout(url, MODEL_TIMEOUT_MS);
        console.log('[Pose] 模型加载成功:', url, modelBuffer.byteLength, 'bytes');
        break;
      } catch (e) {
        console.warn('[Pose] 模型加载失败:', url, e.message);
        lastErr = e;
      }
    }
    if (!modelBuffer) {
      this.loading = false;
      this.lastError = '姿态模型加载失败（所有 CDN 均不可达）。请检查网络，或科学上网后重试。';
      throw new Error(this.lastError);
    }

    // 3. 创建 landmarker，GPU 失败回退 CPU
    const tryCreate = async (delegate) => {
      // 用 FilesetResolver 的 vision + 内联模型 buffer
      // PoseLandmarker 不直接支持 buffer，需要先用 fetch URL。
      // 改用 createFromOptions + modelAssetPath：先把 buffer 转成 blob URL
      const blob = new Blob([modelBuffer], { type: 'application/octet-stream' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        const lm = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: blobUrl, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        return lm;
      } finally {
        // 创建完成后可释放 blob URL（landmarker 内部已拷贝）
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      }
    };

    try {
      this.landmarker = await tryCreate('GPU');
    } catch (e) {
      console.warn('[Pose] GPU 模式失败，回退 CPU:', e);
      try {
        this.landmarker = await tryCreate('CPU');
      } catch (e2) {
        this.loading = false;
        this.lastError = '姿态识别初始化失败：' + (e2.message || e2);
        throw new Error(this.lastError);
      }
    }
    this.loading = false;
  }

  /**
   * 检测一帧。返回 { landmarks, ts, hasPerson } 或 null
   * landmarks 为 33 个 { x, y, z, visibility }，已镜像（x = 1 - x）和低通平滑
   */
  detect(video, ts) {
    if (!this.landmarker) return null;
    if (!video.videoWidth) return null;
    let res;
    try {
      res = this.landmarker.detectForVideo(video, ts);
    } catch (e) {
      // 偶发 WebGL 上下文丢失，吞掉
      return null;
    }
    const list = res?.landmarks;
    if (!list || list.length === 0) {
      // 丢人时清空历史避免速度计算错乱
      this.prev = null;
      this.velocity = {};
      this.lastResult = null;
      return { hasPerson: false, ts };
    }
    const raw = list[0];
    // 镜像（前置摄像头用户视角左右对应）
    const mirrored = raw.map(p => ({ x: 1 - p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 }));
    const smoothed = this._smooth(mirrored);

    // 速度（单位：归一化坐标/秒）
    const dt = this.prevTs ? (ts - this.prevTs) / 1000 : 1/30;
    this._computeVelocity(smoothed, dt);
    this.prevTs = ts;
    this.lastResult = smoothed;
    this.lastTs = ts;

    // FPS 统计
    this._fpsFrames++;
    if (!this._fpsT0) this._fpsT0 = ts;
    if (ts - this._fpsT0 >= 1000) {
      this.fps = this._fpsFrames * 1000 / (ts - this._fpsT0);
      this._fpsFrames = 0;
      this._fpsT0 = ts;
    }
    return { landmarks: smoothed, ts, hasPerson: true, fps: this.fps };
  }

  _smooth(curr) {
    if (!this.prev) { this.prev = curr.map(p => ({ ...p })); return curr; }
    const a = 0.45; // 越大越跟随、越小越平滑
    const out = curr.map((p, i) => ({
      x: p.x * a + this.prev[i].x * (1 - a),
      y: p.y * a + this.prev[i].y * (1 - a),
      z: p.z * a + this.prev[i].z * (1 - a),
      visibility: p.visibility,
    }));
    this.prev = out;
    return out;
  }

  _computeVelocity(curr, dt) {
    if (!this.prev || dt <= 0) return;
    if (dt > 0.5) { this.velocity = {}; return; } // 卡顿后清空
    const prev = this.prev;
    this.velocity = {};
    for (let i = 0; i < curr.length; i++) {
      const dx = (curr[i].x - prev[i].x) / dt;
      const dy = (curr[i].y - prev[i].y) / dt;
      this.velocity[i] = { x: dx, y: dy, mag: Math.hypot(dx, dy) };
    }
  }

  vel(idx) { return this.velocity[idx] || { x: 0, y: 0, mag: 0 }; }
  point(idx) { return this.lastResult?.[idx] || null; }

  destroy() {
    try { this.landmarker?.close?.(); } catch {}
    this.landmarker = null;
    this.prev = null;
    this.velocity = {};
  }
}
