import {
  Apple,
  BicepsFlexed,
  Camera,
  CameraOff,
  ChevronLeft,
  Eye,
  EyeOff,
  Footprints,
  House,
  Maximize,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Swords,
  Volume2,
  VolumeX,
  Zap,
  createIcons,
} from 'lucide';
import './styles.css';
import { HEROES } from './config';
import { AudioManager } from './core/AudioManager';
import { GameRuntime } from './core/GameRuntime';
import { InputController, type InputStatus } from './core/InputController';
import { VoiceController, type VoiceStatusCallback } from './core/VoiceController';
import { GameHost } from './game/GameHost';
import type { GameMode, GameResult, HeroId, RuntimeState, VoiceCommand } from './types';

/** Lucide 图标注册表。 */
const ICONS = {
  Apple,
  BicepsFlexed,
  Camera,
  CameraOff,
  ChevronLeft,
  Eye,
  EyeOff,
  Footprints,
  House,
  Maximize,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Swords,
  Volume2,
  VolumeX,
  Zap,
};

/** 主应用外壳，负责权限、菜单与游戏生命周期。 */
class MotionArcadeApp {
  /** 应用根节点。 */
  private readonly root: HTMLElement;

  /** 统一输入控制器。 */
  private readonly input = new InputController();

  /** 统一运行状态管理器。 */
  private readonly runtime = new GameRuntime();

  /** 游戏音频管理器。 */
  private readonly audio = new AudioManager();

  /** 语音命令控制器。 */
  private readonly voice: VoiceController;

  /** 当前 Phaser 游戏宿主。 */
  private gameHost: GameHost | null = null;

  /** 即将进入或正在运行的游戏模式。 */
  private currentMode: GameMode | null = null;

  /** 当前选择的英雄。 */
  private selectedHero: HeroId = 'zero';

  /** 本次会话是否已完成人体校准。 */
  private calibrated = false;

  /** 摄像头预览是否被用户隐藏。 */
  private cameraPreviewHidden = false;

  /** 语音监听是否由用户开启。 */
  private voiceEnabled = false;

  /** 输入状态取消订阅函数。 */
  private readonly unsubscribeInputStatus: () => void;

  /** 运行状态取消订阅函数。 */
  private readonly unsubscribeRuntime: () => void;

  /** 创建并初始化体感游戏应用。 */
  constructor(root: HTMLElement) {
    this.root = root;
    this.render();
    this.voice = new VoiceController(
      (command) => this.handleVoiceCommand(command),
      (status) => this.handleVoiceStatus(status),
    );
    this.unsubscribeInputStatus = this.input.subscribeStatus((status) => this.handleInputStatus(status));
    this.unsubscribeRuntime = this.runtime.subscribe((state) => this.handleRuntimeState(state));
    this.bindEvents();
    this.refreshIcons();
    window.addEventListener('beforeunload', () => this.destroy(), { once: true });
  }

  /** 构建菜单、工具栏、弹层和游戏挂载区域。 */
  private render(): void {
    /** 英雄选择按钮。 */
    const heroButtons = HEROES.map(
      (hero) => `
        <button class="hero-option ${hero.id === this.selectedHero ? 'is-selected' : ''}" data-hero="${hero.id}" type="button">
          <span class="hero-portrait hero-${hero.id}" aria-hidden="true"><span></span></span>
          <span class="hero-option-copy"><strong>${hero.name}</strong><small>${hero.title}</small></span>
          <span class="selection-mark" aria-hidden="true"></span>
        </button>`,
    ).join('');
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <button class="brand-button" data-action="home" type="button" aria-label="返回游戏选择">
            <span class="brand-mark" aria-hidden="true"></span>
            <span>体感竞技场</span>
          </button>
          <div class="device-status" aria-live="polite">
            <span class="status-item" data-camera-status><i data-lucide="camera-off"></i><span>体感未连接</span></span>
            <span class="status-item" data-mic-status><i data-lucide="mic-off"></i><span>语音未开启</span></span>
          </div>
          <div class="toolbar">
            <button class="icon-button is-hidden" data-action="pause" type="button" title="暂停游戏" aria-label="暂停游戏"><i data-lucide="pause"></i></button>
            <button class="icon-button" data-action="toggle-mic" type="button" title="开启语音" aria-label="开启语音"><i data-lucide="mic-off"></i></button>
            <button class="icon-button" data-action="toggle-sound" type="button" title="静音" aria-label="静音"><i data-lucide="volume-2"></i></button>
            <button class="icon-button" data-action="fullscreen" type="button" title="全屏" aria-label="全屏"><i data-lucide="maximize"></i></button>
          </div>
        </header>

        <main class="content-area">
          <section class="menu-screen" data-screen="menu">
            <div class="menu-intro">
              <p class="eyebrow">选择挑战</p>
              <h1>用身体进入游戏</h1>
              <div class="menu-status-row">
                <span>摄像头体感</span><span>中文语音</span><span>手机横屏</span>
              </div>
            </div>
            <div class="game-grid">
              <button class="game-card fruit-card" data-game="fruit" type="button" data-testid="fruit-game">
                <span class="game-art fruit-art" aria-hidden="true">
                  <span class="fruit-orbit fruit-orbit-one"></span><span class="fruit-orbit fruit-orbit-two"></span><span class="blade-streak"></span>
                </span>
                <span class="game-card-copy"><span class="mode-label">5 分钟挑战</span><strong>切水果</strong><small>双手挥动 · 连击 · 金色水果</small></span>
                <span class="enter-icon"><i data-lucide="apple"></i></span>
              </button>
              <button class="game-card battle-card" data-game="battle" type="button" data-testid="battle-game">
                <span class="game-art battle-art" aria-hidden="true"><span class="hero-silhouette"></span><span class="monster-silhouette"></span><span class="beam-streak"></span></span>
                <span class="game-card-copy"><span class="mode-label">体感对决</span><strong>光之英雄</strong><small>出拳 · 踢腿 · 移动闪避</small></span>
                <span class="enter-icon"><i data-lucide="swords"></i></span>
              </button>
            </div>
            <div class="local-records">
              <span>本机记录</span>
              <strong data-best-score>切水果最高分 0</strong>
              <strong data-battle-wins>战斗胜利 0 次</strong>
            </div>
          </section>

          <section class="hero-screen is-hidden" data-screen="heroes">
            <div class="section-heading">
              <button class="icon-button" data-action="back-menu" type="button" title="返回" aria-label="返回"><i data-lucide="chevron-left"></i></button>
              <div><p class="eyebrow">选择英雄</p><h2>准备迎战怪兽</h2></div>
            </div>
            <div class="hero-grid">${heroButtons}</div>
            <button class="primary-command" data-action="confirm-hero" type="button"><i data-lucide="swords"></i><span>进入战场</span></button>
          </section>

          <section class="game-screen is-hidden" data-screen="game">
            <div class="game-canvas" data-game-canvas data-testid="game-canvas"></div>
            <div class="touch-controls is-hidden" data-touch-controls>
              <div class="move-controls">
                <button data-control="moveLeft" type="button" aria-label="向左闪避"><i data-lucide="chevron-left"></i></button>
                <button data-control="moveRight" type="button" aria-label="向右闪避"><i data-lucide="chevron-left"></i></button>
              </div>
              <div class="attack-controls">
                <button data-control="punchRight" type="button"><i data-lucide="biceps-flexed"></i><span>拳</span></button>
                <button data-control="kickRight" type="button"><i data-lucide="footprints"></i><span>踢</span></button>
                <button class="skill-control" data-control="skillRelease" type="button"><i data-lucide="zap"></i><span>光线</span></button>
              </div>
            </div>
          </section>
        </main>

        <aside class="camera-dock is-hidden" data-camera-dock>
          <video data-camera-video playsinline muted></video>
          <canvas data-pose-overlay width="320" height="180"></canvas>
          <div class="camera-dock-status"><span class="camera-dot"></span><span data-pose-label>等待人体</span></div>
          <button class="camera-hide-button" data-action="toggle-camera" type="button" title="隐藏摄像头预览" aria-label="隐藏摄像头预览"><i data-lucide="eye-off"></i></button>
        </aside>
        <button class="camera-restore-button is-hidden" data-action="toggle-camera" type="button" title="显示摄像头预览" aria-label="显示摄像头预览"><i data-lucide="eye"></i></button>

        <div class="modal-layer is-hidden" data-modal="permission" role="dialog" aria-modal="true" aria-labelledby="permission-title">
          <div class="modal-panel permission-panel">
            <div class="modal-icon"><i data-lucide="camera"></i></div>
            <h2 id="permission-title">连接体感控制</h2>
            <p>摄像头画面仅在本机处理，不上传或保存。语音识别可能使用浏览器厂商的在线服务。</p>
            <div class="permission-actions">
              <button class="primary-command" data-action="enable-motion" type="button"><i data-lucide="camera"></i><span>开启摄像头与语音</span></button>
              <button class="secondary-command" data-action="manual-mode" type="button">使用触控进入</button>
            </div>
            <p class="permission-error is-hidden" data-permission-error>无法访问设备，仍可使用触控和鼠标游玩。</p>
          </div>
        </div>

        <div class="modal-layer is-hidden" data-modal="calibration" role="dialog" aria-modal="true" aria-labelledby="calibration-title">
          <div class="calibration-panel">
            <div class="calibration-figure" aria-hidden="true"><span class="figure-head"></span><span class="figure-body"></span><span class="figure-arms"></span><span class="figure-legs"></span></div>
            <div class="calibration-copy">
              <p class="eyebrow">体感校准</p>
              <h2 id="calibration-title">保持全身入镜</h2>
              <p data-calibration-status>后退一步，让手腕和脚踝都出现在画面中</p>
              <div class="calibration-progress"><span data-calibration-progress></span></div>
              <button class="secondary-command" data-action="skip-calibration" type="button">跳过，使用触控</button>
            </div>
          </div>
        </div>

        <div class="modal-layer pause-layer is-hidden" data-modal="pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div class="pause-panel">
            <span class="pause-symbol"><i data-lucide="pause"></i></span>
            <h2 id="pause-title">游戏已暂停</h2>
            <div class="pause-actions">
              <button class="primary-command" data-action="resume" type="button"><i data-lucide="play"></i><span>继续游戏</span></button>
              <button class="secondary-command" data-action="restart" type="button"><i data-lucide="rotate-ccw"></i><span>重新开始</span></button>
              <button class="text-command" data-action="home" type="button"><i data-lucide="house"></i><span>返回主页</span></button>
            </div>
          </div>
        </div>

        <div class="modal-layer result-layer is-hidden" data-modal="result" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div class="result-panel">
            <p class="eyebrow" data-result-eyebrow>挑战完成</p>
            <h2 id="result-title" data-result-title>本局得分</h2>
            <strong class="result-score" data-result-score>0</strong>
            <div class="result-stats" data-result-stats></div>
            <div class="result-actions">
              <button class="primary-command" data-action="restart" type="button"><i data-lucide="rotate-ccw"></i><span>再来一次</span></button>
              <button class="secondary-command" data-action="home" type="button"><i data-lucide="house"></i><span>返回主页</span></button>
            </div>
          </div>
        </div>

        <div class="orientation-notice" aria-live="polite"><span><i data-lucide="maximize"></i></span><strong>请横屏游玩</strong></div>
      </div>`;
    this.updateRecords();
  }

  /** 绑定应用内所有界面按钮和游戏选项。 */
  private bindEvents(): void {
    this.root.querySelectorAll<HTMLElement>('[data-action]').forEach((element) => {
      element.addEventListener('click', () => this.handleUiAction(element.dataset.action ?? ''));
    });
    this.root.querySelectorAll<HTMLElement>('[data-game]').forEach((element) => {
      element.addEventListener('click', () => this.chooseGame(element.dataset.game as GameMode));
    });
    this.root.querySelectorAll<HTMLElement>('[data-hero]').forEach((element) => {
      element.addEventListener('click', () => this.selectHero(element.dataset.hero as HeroId));
    });
    this.root.querySelectorAll<HTMLElement>('[data-control]').forEach((element) => {
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.input.trigger(element.dataset.control as Parameters<InputController['trigger']>[0], 'touch');
      });
    });
  }

  /** 处理统一界面命令。 */
  private handleUiAction(action: string): void {
    void this.audio.unlock();
    if (action === 'home' || action === 'back-menu') this.goHome();
    if (action === 'confirm-hero') this.requestGameStart('battle');
    if (action === 'enable-motion') void this.enableMotion();
    if (action === 'manual-mode' || action === 'skip-calibration') this.startCurrentGame();
    if (action === 'pause') this.togglePause();
    if (action === 'resume') this.runtime.resume();
    if (action === 'restart') this.restartGame();
    if (action === 'toggle-camera') this.toggleCameraPreview();
    if (action === 'toggle-mic') this.toggleVoice();
    if (action === 'toggle-sound') this.toggleSound();
    if (action === 'fullscreen') void this.enterFullscreen();
  }

  /** 选择一款游戏并进入对应准备流程。 */
  private chooseGame(mode: GameMode): void {
    this.currentMode = mode;
    this.audio.ui();
    if (mode === 'battle') {
      this.showScreen('heroes');
      return;
    }
    this.requestGameStart(mode);
  }

  /** 更新英雄选择状态。 */
  private selectHero(heroId: HeroId): void {
    this.selectedHero = heroId;
    this.root.querySelectorAll<HTMLElement>('[data-hero]').forEach((element) => {
      element.classList.toggle('is-selected', element.dataset.hero === heroId);
    });
    this.audio.ui();
  }

  /** 根据现有体感状态决定直接进入或显示权限弹层。 */
  private requestGameStart(mode: GameMode): void {
    this.currentMode = mode;
    if (this.input.isCameraActive() && this.calibrated) {
      this.startCurrentGame();
      return;
    }
    this.setModal('permission', true);
  }

  /** 请求摄像头、启动语音并执行全身校准。 */
  private async enableMotion(): Promise<void> {
    /** 权限弹层中的失败提示。 */
    const permissionError = this.getElement<HTMLElement>('[data-permission-error]');
    permissionError.classList.add('is-hidden');
    if (!window.isSecureContext) {
      permissionError.textContent = '当前地址不是安全的 HTTPS 页面，iPhone 无法申请摄像头和麦克风权限。请改用电脑提供的 HTTPS 地址访问。';
      permissionError.classList.remove('is-hidden');
      return;
    }
    await this.audio.unlock();
    this.setModal('permission', false);
    this.setModal('calibration', true);
    this.voiceEnabled = true;
    this.voice.start();
    /** 摄像头视频元素。 */
    const video = this.getElement<HTMLVideoElement>('[data-camera-video]');
    /** 骨架预览画布。 */
    const overlay = this.getElement<HTMLCanvasElement>('[data-pose-overlay]');
    /** 摄像头与姿态模型是否初始化成功。 */
    const started = await this.input.startCamera(video, overlay);
    if (!started) {
      this.setModal('calibration', false);
      this.setModal('permission', true);
      permissionError.textContent = '无法访问设备。请在浏览器设置中允许摄像头与麦克风权限，或使用触控进入。';
      permissionError.classList.remove('is-hidden');
      return;
    }
    this.getElement('[data-camera-dock]').classList.remove('is-hidden');
    /** 三秒全身校准是否成功。 */
    const calibrated = await this.input.beginCalibration((progress, ready) => this.updateCalibration(progress, ready));
    if (!calibrated) return;
    this.calibrated = true;
    this.startCurrentGame();
  }

  /** 更新校准弹层的状态和进度。 */
  private updateCalibration(progress: number, ready: boolean): void {
    /** 校准进度条。 */
    const progressBar = this.getElement<HTMLElement>('[data-calibration-progress]');
    progressBar.style.width = `${Math.round(progress * 100)}%`;
    this.getElement('[data-calibration-status]').textContent = ready
      ? `保持站姿 ${Math.ceil((1 - progress) * 3)} 秒`
      : '后退一步，让手腕和脚踝都出现在画面中';
  }

  /** 销毁旧场景并创建当前选择的 Phaser 游戏。 */
  private startCurrentGame(): void {
    if (!this.currentMode) return;
    this.setModal('permission', false);
    this.setModal('calibration', false);
    this.setModal('pause', false);
    this.setModal('result', false);
    this.gameHost?.destroy();
    /** Phaser 挂载区域。 */
    const canvasHost = this.getElement<HTMLElement>('[data-game-canvas]');
    canvasHost.replaceChildren();
    this.showScreen('game');
    this.input.attachFallbacks(canvasHost);
    this.gameHost = new GameHost(this.currentMode, {
      parent: canvasHost,
      input: this.input,
      runtime: this.runtime,
      audio: this.audio,
      heroId: this.selectedHero,
      onResult: (result) => this.showResult(result),
    });
    this.getElement('[data-touch-controls]').classList.toggle('is-hidden', this.currentMode !== 'battle');
    this.getElement('[data-action="pause"]').classList.remove('is-hidden');
    void this.lockLandscape();
    this.refreshIcons();
  }

  /** 在当前游戏内切换暂停和恢复。 */
  private togglePause(): void {
    /** 当前运行状态。 */
    const state = this.runtime.getState();
    if (state === 'playing' || state === 'countdown') this.runtime.pause();
    else if (state === 'paused') this.runtime.resume();
  }

  /** 重新创建当前游戏。 */
  private restartGame(): void {
    if (!this.currentMode) return;
    this.startCurrentGame();
  }

  /** 返回游戏选择并释放当前 Phaser 场景。 */
  private goHome(): void {
    this.gameHost?.destroy();
    this.gameHost = null;
    this.input.detachFallbacks();
    this.currentMode = null;
    this.runtime.showMenu();
    this.showScreen('menu');
    this.setModal('permission', false);
    this.setModal('calibration', false);
    this.setModal('pause', false);
    this.setModal('result', false);
    this.getElement('[data-action="pause"]').classList.add('is-hidden');
    this.updateRecords();
  }

  /** 展示本局结算并保存浏览器本地记录。 */
  private showResult(result: GameResult): void {
    /** 结算标题。 */
    const title = this.getElement('[data-result-title]');
    /** 结算主数值。 */
    const score = this.getElement('[data-result-score]');
    /** 结算辅助数据。 */
    const stats = this.getElement('[data-result-stats]');
    if (result.mode === 'fruit') {
      /** 当前历史最高分。 */
      const bestScore = Number(localStorage.getItem('motionArcade.bestFruitScore') ?? 0);
      localStorage.setItem('motionArcade.bestFruitScore', String(Math.max(bestScore, result.score ?? 0)));
      this.getElement('[data-result-eyebrow]').textContent = (result.score ?? 0) > bestScore ? '新的本机纪录' : '挑战完成';
      title.textContent = '本局得分';
      score.textContent = String(result.score ?? 0);
      stats.innerHTML = `<span><small>最高连击</small><strong>${result.maxCombo ?? 0}</strong></span><span><small>切中目标</small><strong>${result.hits ?? 0}</strong></span>`;
    } else {
      if (result.victory) {
        /** 更新后的战斗胜利次数。 */
        const wins = Number(localStorage.getItem('motionArcade.battleWins') ?? 0) + 1;
        localStorage.setItem('motionArcade.battleWins', String(wins));
      }
      this.getElement('[data-result-eyebrow]').textContent = result.victory ? '怪兽已被击败' : '能量耗尽';
      title.textContent = result.victory ? '战斗胜利' : '战斗失败';
      score.textContent = result.victory ? 'WIN' : 'LOSE';
      stats.innerHTML = `<span><small>使用英雄</small><strong>${HEROES.find((hero) => hero.id === this.selectedHero)?.name ?? '英雄'}</strong></span><span><small>本机胜场</small><strong>${localStorage.getItem('motionArcade.battleWins') ?? 0}</strong></span>`;
    }
    this.updateRecords();
    this.setModal('result', true);
  }

  /** 处理运行状态变化并更新暂停界面。 */
  private handleRuntimeState(state: RuntimeState): void {
    this.setModal('pause', state === 'paused');
    /** 顶栏暂停按钮。 */
    const pauseButton = this.root.querySelector<HTMLElement>('[data-action="pause"]');
    if (pauseButton) {
      pauseButton.innerHTML = state === 'paused' ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
      pauseButton.setAttribute('aria-label', state === 'paused' ? '继续游戏' : '暂停游戏');
      pauseButton.setAttribute('title', state === 'paused' ? '继续游戏' : '暂停游戏');
      this.refreshIcons();
    }
  }

  /** 将输入控制器状态转换为界面提示。 */
  private handleInputStatus(status: InputStatus): void {
    /** 摄像头状态元素。 */
    const element = this.root.querySelector<HTMLElement>('[data-camera-status]');
    if (!element) return;
    /** 各输入状态的显示文本。 */
    const labels: Record<InputStatus, string> = {
      idle: '体感未连接',
      requesting: '请求摄像头',
      loadingModel: '加载识别模型',
      ready: '体感已就绪',
      noBody: '请保持全身入镜',
      insecure: '需要 HTTPS 访问',
      denied: '摄像头被拒绝',
      error: '体感不可用',
    };
    element.classList.toggle('is-active', status === 'ready');
    element.classList.toggle('is-warning', status === 'noBody' || status === 'denied' || status === 'error');
    element.innerHTML = `<i data-lucide="${status === 'ready' || status === 'noBody' ? 'camera' : 'camera-off'}"></i><span>${labels[status]}</span>`;
    /** 摄像头预览中的状态文字。 */
    const poseLabel = this.root.querySelector<HTMLElement>('[data-pose-label]');
    if (poseLabel) poseLabel.textContent = status === 'ready' ? '全身已识别' : labels[status];
    this.refreshIcons();
  }

  /** 将语音控制器状态转换为界面提示。 */
  private handleVoiceStatus: VoiceStatusCallback = (status): void => {
    /** 麦克风状态元素。 */
    const element = this.root.querySelector<HTMLElement>('[data-mic-status]');
    if (!element) return;
    /** 语音状态显示文本。 */
    const label = status === 'listening' ? '语音监听中' : status === 'unsupported' ? '语音不受支持' : status === 'error' ? '语音暂不可用' : '语音未开启';
    element.classList.toggle('is-active', status === 'listening');
    element.innerHTML = `<i data-lucide="${status === 'listening' ? 'mic' : 'mic-off'}"></i><span>${label}</span>`;
    this.refreshIcons();
  };

  /** 执行识别到的语音命令。 */
  private handleVoiceCommand(command: VoiceCommand): void {
    if (command === 'pause') this.runtime.pause();
    if (command === 'resume' || (command === 'start' && this.runtime.getState() === 'paused')) this.runtime.resume();
    if (command === 'restart') this.restartGame();
    if (command === 'home') this.goHome();
  }

  /** 切换摄像头预览的显示状态。 */
  private toggleCameraPreview(): void {
    this.cameraPreviewHidden = !this.cameraPreviewHidden;
    this.getElement('[data-camera-dock]').classList.toggle('is-hidden', this.cameraPreviewHidden);
    this.getElement('[data-action="toggle-camera"].camera-restore-button').classList.toggle('is-hidden', !this.cameraPreviewHidden || !this.input.isCameraActive());
  }

  /** 切换连续语音监听。 */
  private toggleVoice(): void {
    this.voiceEnabled = !this.voiceEnabled;
    if (this.voiceEnabled) this.voice.start();
    else this.voice.stop();
    /** 顶栏语音按钮。 */
    const button = this.getElement('[data-action="toggle-mic"]');
    button.innerHTML = `<i data-lucide="${this.voiceEnabled ? 'mic' : 'mic-off'}"></i>`;
    button.setAttribute('title', this.voiceEnabled ? '关闭语音' : '开启语音');
    button.setAttribute('aria-label', this.voiceEnabled ? '关闭语音' : '开启语音');
    this.refreshIcons();
  }

  /** 切换游戏主音量静音状态。 */
  private toggleSound(): void {
    /** 切换后的静音状态。 */
    const muted = this.audio.toggleMuted();
    /** 顶栏音量按钮。 */
    const button = this.getElement('[data-action="toggle-sound"]');
    button.innerHTML = `<i data-lucide="${muted ? 'volume-x' : 'volume-2'}"></i>`;
    button.setAttribute('title', muted ? '开启声音' : '静音');
    button.setAttribute('aria-label', muted ? '开启声音' : '静音');
    this.refreshIcons();
  }

  /** 尝试进入浏览器全屏并锁定横屏。 */
  private async enterFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
      await this.lockLandscape();
    } catch {
      // 不支持全屏或横屏锁定时保持当前布局。
    }
  }

  /** 在支持的移动浏览器中尝试锁定横屏。 */
  private async lockLandscape(): Promise<void> {
    try {
      await screen.orientation.lock('landscape');
    } catch {
      // 浏览器未授权方向锁定时由 CSS 提示用户旋转设备。
    }
  }

  /** 切换当前主内容页面。 */
  private showScreen(name: 'menu' | 'heroes' | 'game'): void {
    this.root.querySelectorAll<HTMLElement>('[data-screen]').forEach((screen) => {
      screen.classList.toggle('is-hidden', screen.dataset.screen !== name);
    });
  }

  /** 切换指定模态层。 */
  private setModal(name: 'permission' | 'calibration' | 'pause' | 'result', visible: boolean): void {
    /** 指定的模态层。 */
    const modal = this.root.querySelector<HTMLElement>(`[data-modal="${name}"]`);
    modal?.classList.toggle('is-hidden', !visible);
    modal?.setAttribute('aria-hidden', String(!visible));
  }

  /** 读取并展示浏览器本地记录。 */
  private updateRecords(): void {
    /** 本机最高切水果得分。 */
    const bestScore = localStorage.getItem('motionArcade.bestFruitScore') ?? '0';
    /** 本机战斗胜利次数。 */
    const battleWins = localStorage.getItem('motionArcade.battleWins') ?? '0';
    /** 最高分显示元素。 */
    const bestScoreElement = this.root.querySelector<HTMLElement>('[data-best-score]');
    /** 胜场显示元素。 */
    const battleWinsElement = this.root.querySelector<HTMLElement>('[data-battle-wins]');
    if (bestScoreElement) bestScoreElement.textContent = `切水果最高分 ${bestScore}`;
    if (battleWinsElement) battleWinsElement.textContent = `战斗胜利 ${battleWins} 次`;
  }

  /** 获取必须存在的应用内元素。 */
  private getElement<T extends HTMLElement = HTMLElement>(selector: string): T {
    /** 查询得到的元素。 */
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`缺少界面元素：${selector}`);
    return element;
  }

  /** 将动态生成的 Lucide 占位元素替换为图标。 */
  private refreshIcons(): void {
    createIcons({ icons: ICONS, attrs: { 'stroke-width': 2 } });
  }

  /** 释放应用占用的浏览器资源。 */
  private destroy(): void {
    this.unsubscribeInputStatus();
    this.unsubscribeRuntime();
    this.voice.stop();
    this.input.destroy();
    this.runtime.destroy();
    this.gameHost?.destroy();
  }
}

/** 页面中的应用挂载节点。 */
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('缺少应用挂载节点');

/** 当前体感游戏应用实例。 */
const app = new MotionArcadeApp(root);
void app;
