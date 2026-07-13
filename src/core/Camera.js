// 摄像头管理：getUserMedia 封装，前后置自动选择，权限错误友好提示
export class Camera {
  constructor() {
    this.video = null;
    this.stream = null;
    this.facingMode = 'user'; // 体感游戏默认前置（自拍视角）
    this.ready = false;
  }

  async start({ facingMode = 'user' } = {}) {
    this.facingMode = facingMode;
    if (this.stream) this.stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      const e = new Error('当前浏览器不支持摄像头 API');
      e.code = 'UNSUPPORTED';
      throw e;
    }

    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // 部分安卓对 facingMode 严格，回退不指定
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err2) {
        const e = new Error(this._humanizeError(err2));
        e.code = err2.name || 'CAMERA_ERROR';
        e.raw = err2;
        throw e;
      }
    }

    this.stream = stream;
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => {});
    this.video = video;
    this.ready = true;
    return video;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.ready = false;
  }

  // 检测环境光是否过暗（取视频中心像素亮度均值）
  async getBrightness(canvas, ctx2d) {
    if (!this.video || !canvas) return 1;
    const w = 64, h = 48;
    try {
      ctx2d.drawImage(this.video, 0, 0, w, h);
      const data = ctx2d.getImageData(0, 0, w, h).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      }
      return sum / (data.length / 4) / 255;
    } catch { return 1; }
  }

  _humanizeError(err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return '摄像头授权被拒绝，请在浏览器设置中允许摄像头权限后重试';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return '未检测到摄像头设备';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return '摄像头被其他程序占用，请关闭后重试';
    }
    if (err.name === 'OverconstrainedError') {
      return '摄像头不满足约束条件，请换一台设备';
    }
    return '摄像头开启失败：' + (err.message || err.name);
  }
}
