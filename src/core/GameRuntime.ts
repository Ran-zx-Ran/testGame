import type { RuntimeState } from '../types';

/** 游戏运行状态监听器。 */
export type RuntimeListener = (state: RuntimeState) => void;

/** 统一管理菜单、开始、暂停和结束状态。 */
export class GameRuntime {
  /** 当前游戏运行状态。 */
  private state: RuntimeState = 'menu';

  /** 已注册的运行状态监听器。 */
  private readonly listeners = new Set<RuntimeListener>();

  /** 页面可见性变化处理器。 */
  private readonly visibilityHandler = (): void => {
    if (document.hidden && this.state === 'playing') this.pause();
  };

  /** 创建运行状态管理器。 */
  constructor() {
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /** 获取当前运行状态。 */
  getState(): RuntimeState {
    return this.state;
  }

  /** 订阅运行状态并返回取消函数。 */
  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** 进入菜单状态。 */
  showMenu(): void {
    this.setState('menu');
  }

  /** 进入开始倒计时状态。 */
  startCountdown(): void {
    this.setState('countdown');
  }

  /** 进入正式游戏状态。 */
  play(): void {
    this.setState('playing');
  }

  /** 暂停当前正式游戏。 */
  pause(): void {
    if (this.state === 'playing' || this.state === 'countdown') this.setState('paused');
  }

  /** 从暂停状态恢复游戏。 */
  resume(): void {
    if (this.state === 'paused') this.setState('playing');
  }

  /** 标记当前游戏已经结束。 */
  end(): void {
    this.setState('ended');
  }

  /** 释放页面级事件监听。 */
  destroy(): void {
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.listeners.clear();
  }

  /** 更新状态并通知全部监听器。 */
  private setState(nextState: RuntimeState): void {
    if (this.state === nextState) return;
    this.state = nextState;
    this.listeners.forEach((listener) => listener(this.state));
  }
}
