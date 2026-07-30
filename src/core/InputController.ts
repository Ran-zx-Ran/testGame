import type { GameAction, GameActionType, PoseFrame } from '../types';
import { ActionDetector } from './ActionDetector';
import { PoseController } from './PoseController';

/** 摄像头与体感识别状态。 */
export type InputStatus = 'idle' | 'requesting' | 'loadingModel' | 'ready' | 'noBody' | 'denied' | 'error';

/** 输入状态监听器。 */
export type InputStatusListener = (status: InputStatus) => void;

/** 统一管理体感、鼠标、触摸与键盘输入。 */
export class InputController {
  /** 游戏动作监听器集合。 */
  private readonly actionListeners = new Set<(action: GameAction) => void>();

  /** 人体帧监听器集合。 */
  private readonly poseListeners = new Set<(frame: PoseFrame | null) => void>();

  /** 输入状态监听器集合。 */
  private readonly statusListeners = new Set<InputStatusListener>();

  /** 统一动作识别器。 */
  private readonly actionDetector = new ActionDetector((action) => this.emit(action));

  /** MediaPipe 姿态控制器。 */
  private poseController: PoseController | null = null;

  /** 当前摄像头媒体流。 */
  private mediaStream: MediaStream | null = null;

  /** 当前摄像头视频元素。 */
  private video: HTMLVideoElement | null = null;

  /** 当前骨架预览画布。 */
  private overlayCanvas: HTMLCanvasElement | null = null;

  /** 当前识别循环编号。 */
  private animationFrameId = 0;

  /** 上一次执行模型推理的时间。 */
  private lastDetectionAt = 0;

  /** 校准开始时间。 */
  private calibrationStartedAt: number | null = null;

  /** 校准进度回调。 */
  private calibrationProgress: ((progress: number, ready: boolean) => void) | null = null;

  /** 校准完成回调。 */
  private calibrationResolve: ((success: boolean) => void) | null = null;

  /** 指针上一个位置。 */
  private previousPointer: { x: number; y: number } | null = null;

  /** 指针降级控制的目标元素。 */
  private fallbackTarget: HTMLElement | null = null;

  /** 键盘事件处理器。 */
  private readonly keyboardHandler = (event: KeyboardEvent): void => this.handleKeyboard(event);

  /** 指针按下处理器。 */
  private readonly pointerDownHandler = (event: PointerEvent): void => this.handlePointerDown(event);

  /** 指针移动处理器。 */
  private readonly pointerMoveHandler = (event: PointerEvent): void => this.handlePointerMove(event);

  /** 指针结束处理器。 */
  private readonly pointerUpHandler = (): void => {
    this.previousPointer = null;
  };

  /** 订阅统一游戏动作。 */
  subscribeActions(listener: (action: GameAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  /** 订阅人体帧，用于状态和调试展示。 */
  subscribePose(listener: (frame: PoseFrame | null) => void): () => void {
    this.poseListeners.add(listener);
    return () => this.poseListeners.delete(listener);
  }

  /** 订阅摄像头输入状态。 */
  subscribeStatus(listener: InputStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.mediaStream ? 'ready' : 'idle');
    return () => this.statusListeners.delete(listener);
  }

  /** 获取摄像头当前是否处于工作状态。 */
  isCameraActive(): boolean {
    return Boolean(this.mediaStream);
  }

  /** 请求摄像头并启动本地姿态识别。 */
  async startCamera(video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.notifyStatus('error');
      return false;
    }
    this.video = video;
    this.overlayCanvas = overlayCanvas;
    this.notifyStatus('requesting');
    try {
      /** 请求得到的前置摄像头媒体流。 */
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.mediaStream = stream;
      video.srcObject = stream;
      await video.play();
      this.notifyStatus('loadingModel');
      this.poseController = await PoseController.create();
      this.notifyStatus('ready');
      this.startDetectionLoop();
      return true;
    } catch (error) {
      /** 浏览器返回的媒体或模型错误名称。 */
      const errorName = error instanceof DOMException ? error.name : '';
      this.notifyStatus(errorName === 'NotAllowedError' ? 'denied' : 'error');
      this.stopCamera();
      return false;
    }
  }

  /** 关闭摄像头、模型和识别循环。 */
  stopCamera(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    if (this.video) this.video.srcObject = null;
    this.poseController?.close();
    this.poseController = null;
    this.actionDetector.reset();
    this.notifyStatus('idle');
  }

  /** 要求玩家保持全身入镜三秒并完成校准。 */
  beginCalibration(progress: (progress: number, ready: boolean) => void): Promise<boolean> {
    if (!this.mediaStream || !this.poseController) return Promise.resolve(false);
    if (this.calibrationResolve) this.calibrationResolve(false);
    this.calibrationStartedAt = null;
    this.calibrationProgress = progress;
    return new Promise<boolean>((resolve) => {
      this.calibrationResolve = resolve;
    });
  }

  /** 绑定鼠标、触摸和键盘降级输入。 */
  attachFallbacks(target: HTMLElement): void {
    this.detachFallbacks();
    this.fallbackTarget = target;
    target.addEventListener('pointerdown', this.pointerDownHandler);
    target.addEventListener('pointermove', this.pointerMoveHandler);
    target.addEventListener('pointerup', this.pointerUpHandler);
    target.addEventListener('pointercancel', this.pointerUpHandler);
    window.addEventListener('keydown', this.keyboardHandler);
  }

  /** 解绑鼠标、触摸和键盘降级输入。 */
  detachFallbacks(): void {
    if (this.fallbackTarget) {
      this.fallbackTarget.removeEventListener('pointerdown', this.pointerDownHandler);
      this.fallbackTarget.removeEventListener('pointermove', this.pointerMoveHandler);
      this.fallbackTarget.removeEventListener('pointerup', this.pointerUpHandler);
      this.fallbackTarget.removeEventListener('pointercancel', this.pointerUpHandler);
    }
    this.fallbackTarget = null;
    window.removeEventListener('keydown', this.keyboardHandler);
    this.previousPointer = null;
  }

  /** 由界面按钮主动派发一项降级动作。 */
  trigger(type: GameActionType, source: GameAction['source'] = 'touch'): void {
    this.emit({ type, strength: 1, x: 0.5, y: 0.5, source, timestamp: performance.now() });
  }

  /** 释放全部输入资源。 */
  destroy(): void {
    this.stopCamera();
    this.detachFallbacks();
    this.actionListeners.clear();
    this.poseListeners.clear();
    this.statusListeners.clear();
  }

  /** 启动约 20 FPS 的姿态推理循环。 */
  private startDetectionLoop(): void {
    /** 单次视频帧处理函数。 */
    const processFrame = (timestamp: number): void => {
      if (!this.poseController || !this.video || !this.overlayCanvas) return;
      if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && timestamp - this.lastDetectionAt >= 50) {
        this.lastDetectionAt = timestamp;
        /** 当前识别得到的人体帧。 */
        const frame = this.poseController.detect(this.video, timestamp);
        this.poseController.draw(frame, this.overlayCanvas);
        this.poseListeners.forEach((listener) => listener(frame));
        if (frame) {
          this.actionDetector.process(frame);
          this.updateCalibration(frame);
          this.notifyStatus(frame.fullBodyVisible ? 'ready' : 'noBody');
        } else {
          this.calibrationStartedAt = null;
          this.calibrationProgress?.(0, false);
          this.notifyStatus('noBody');
        }
      }
      this.animationFrameId = requestAnimationFrame(processFrame);
    };
    this.animationFrameId = requestAnimationFrame(processFrame);
  }

  /** 根据当前人体帧推进三秒校准。 */
  private updateCalibration(frame: PoseFrame): void {
    if (!this.calibrationResolve || !this.calibrationProgress) return;
    if (!frame.fullBodyVisible) {
      this.calibrationStartedAt = null;
      this.calibrationProgress(0, false);
      return;
    }
    if (this.calibrationStartedAt === null) this.calibrationStartedAt = frame.capturedAt;
    /** 本次连续全身入镜时间。 */
    const elapsed = frame.capturedAt - this.calibrationStartedAt;
    /** 当前校准进度。 */
    const progress = Math.min(1, elapsed / 3000);
    this.calibrationProgress(progress, true);
    if (progress < 1) return;
    this.actionDetector.calibrate(frame);
    /** 当前待完成的校准回调。 */
    const resolve = this.calibrationResolve;
    this.calibrationResolve = null;
    this.calibrationProgress = null;
    this.calibrationStartedAt = null;
    resolve(true);
  }

  /** 记录指针起始位置。 */
  private handlePointerDown(event: PointerEvent): void {
    /** 指针在目标区域中的标准化坐标。 */
    const point = this.normalizePointer(event);
    this.previousPointer = point;
    this.fallbackTarget?.setPointerCapture?.(event.pointerId);
  }

  /** 将持续指针轨迹转换为切割动作。 */
  private handlePointerMove(event: PointerEvent): void {
    if (!this.previousPointer || (event.buttons === 0 && event.pointerType === 'mouse')) return;
    /** 当前指针标准化坐标。 */
    const point = this.normalizePointer(event);
    /** 相邻指针点之间的距离。 */
    const distance = Math.hypot(point.x - this.previousPointer.x, point.y - this.previousPointer.y);
    if (distance >= 0.018) {
      this.emit({
        type: 'slash',
        strength: Math.min(1, distance * 9),
        x: point.x,
        y: point.y,
        source: event.pointerType === 'touch' ? 'touch' : 'pointer',
        timestamp: performance.now(),
      });
      this.previousPointer = point;
    }
  }

  /** 读取键盘降级控制并派发动作。 */
  private handleKeyboard(event: KeyboardEvent): void {
    /** 按键对应的游戏动作。 */
    const keyMap: Partial<Record<string, GameActionType>> = {
      a: 'moveLeft',
      d: 'moveRight',
      j: 'punchLeft',
      k: 'kickRight',
      l: 'skillRelease',
    };
    /** 当前按键映射到的动作。 */
    const action = keyMap[event.key.toLowerCase()];
    if (action) this.trigger(action, 'keyboard');
  }

  /** 将浏览器指针坐标转换为 0 到 1。 */
  private normalizePointer(event: PointerEvent): { x: number; y: number } {
    /** 指针目标区域。 */
    const bounds = this.fallbackTarget?.getBoundingClientRect();
    if (!bounds) return { x: 0.5, y: 0.5 };
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  /** 向游戏层广播动作。 */
  private emit(action: GameAction): void {
    this.actionListeners.forEach((listener) => listener(action));
  }

  /** 向界面广播输入状态。 */
  private notifyStatus(status: InputStatus): void {
    this.statusListeners.forEach((listener) => listener(status));
  }
}
