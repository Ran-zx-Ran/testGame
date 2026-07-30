/** 使用 Web Audio 合成轻量游戏音效。 */
export class AudioManager {
  /** 浏览器音频上下文。 */
  private context: AudioContext | null = null;

  /** 当前是否静音。 */
  private muted = false;

  /** 当前主音量。 */
  private volume = 0.55;

  /** 在用户交互后创建并恢复音频上下文。 */
  async unlock(): Promise<void> {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  /** 设置静音状态并返回最新值。 */
  setMuted(muted: boolean): boolean {
    this.muted = muted;
    return this.muted;
  }

  /** 切换静音状态并返回最新值。 */
  toggleMuted(): boolean {
    return this.setMuted(!this.muted);
  }

  /** 获取当前静音状态。 */
  isMuted(): boolean {
    return this.muted;
  }

  /** 设置 0 到 1 的主音量。 */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /** 播放切水果音效。 */
  slice(): void {
    this.tone(520, 0.08, 'triangle', 840);
  }

  /** 播放爆炸音效。 */
  explosion(): void {
    this.tone(110, 0.34, 'sawtooth', 48);
  }

  /** 播放普通打击音效。 */
  hit(): void {
    this.tone(145, 0.12, 'square', 88);
  }

  /** 播放光线技能音效。 */
  beam(): void {
    this.tone(260, 0.72, 'sawtooth', 980);
  }

  /** 播放轻量界面反馈。 */
  ui(): void {
    this.tone(420, 0.06, 'sine', 510);
  }

  /** 播放胜负结果音效。 */
  result(victory: boolean): void {
    this.tone(victory ? 520 : 180, 0.5, 'triangle', victory ? 880 : 110);
  }

  /** 合成一段从起始频率滑向结束频率的音效。 */
  private tone(startFrequency: number, duration: number, type: OscillatorType, endFrequency: number): void {
    if (!this.context || this.muted) return;
    /** 当前音频时间。 */
    const now = this.context.currentTime;
    /** 本次音效振荡器。 */
    const oscillator = this.context.createOscillator();
    /** 本次音效音量包络。 */
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
    gain.gain.setValueAtTime(this.volume * 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
