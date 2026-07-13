// Web Audio API 程序化音效合成，零外部音频文件
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.bgmNodes = [];
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
  }

  // 移动端需要在用户手势内 resume
  resume() {
    this._ensure();
    if (this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  // 切水果切中音：短促上扬
  playSlice() {
    if (this.muted) return;
    this._ensure();
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  // 炸弹爆炸
  playBomb() {
    if (this.muted) return;
    this._ensure();
    const c = this.ctx, t = c.currentTime;
    // 白噪声
    const buf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 0.4);
    const g = c.createGain(); g.gain.value = 0.7;
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
  }

  // 出拳
  playPunch() {
    if (this.muted) return;
    this._ensure();
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    const lp = c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 800;
    o.connect(lp).connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  // 必杀技
  playSpecial() {
    if (this.muted) return;
    this._ensure();
    const c = this.ctx, t = c.currentTime;
    [880, 1320, 1760, 2200].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t + i*0.05);
      g.gain.setValueAtTime(0.0001, t + i*0.05);
      g.gain.exponentialRampToValueAtTime(0.25, t + i*0.05 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i*0.05 + 0.25);
      o.connect(g).connect(this.master);
      o.start(t + i*0.05); o.stop(t + i*0.05 + 0.3);
    });
  }

  // 怪兽受击
  playHit() {
    if (this.muted) return;
    this._ensure();
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.22);
  }

  // 玩家受击
  playHurt() {
    if (this.muted) return;
    this._ensure();
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.4);
  }

  // 简易背景循环：低频脉冲 + 偶尔高音
  startBGM(mode = 'fruit') {
    this._ensure();
    this.stopBGM();
    const c = this.ctx;
    const tempo = mode === 'hero' ? 0.45 : 0.5;
    const bassFreq = mode === 'hero' ? 55 : 110;

    const tick = () => {
      if (!this._bgmRunning) return;
      const t = c.currentTime;
      // bass
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = bassFreq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + tempo*0.9);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + tempo);
      // 偶尔高音点缀
      if (Math.random() < 0.3) {
        const o2 = c.createOscillator(), g2 = c.createGain();
        o2.type = 'triangle';
        o2.frequency.value = mode === 'hero' ? 660 : 880;
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + tempo*0.4);
        o2.connect(g2).connect(this.master);
        o2.start(t); o2.stop(t + tempo*0.5);
      }
      this._bgmTimer = setTimeout(tick, tempo * 1000);
    };
    this._bgmRunning = true;
    tick();
  }

  stopBGM() {
    this._bgmRunning = false;
    if (this._bgmTimer) { clearTimeout(this._bgmTimer); this._bgmTimer = null; }
  }

  destroy() {
    this.stopBGM();
    if (this.ctx) { try { this.ctx.close(); } catch {} }
    this.ctx = null; this.master = null;
  }
}
