import Phaser from 'phaser';
import type { GameResult, HeroId } from '../types';
import { AudioManager } from '../core/AudioManager';
import { GameRuntime } from '../core/GameRuntime';
import { InputController } from '../core/InputController';
import { BattleScene } from './BattleScene';
import { FruitScene } from './FruitScene';

/** 可由应用层控制的游戏场景。 */
interface ControllableScene {
  /** 暂停或恢复场景。 */
  setPaused(paused: boolean): void;
}

/** 游戏宿主创建参数。 */
export interface GameHostOptions {
  /** Phaser 挂载目标。 */
  parent: HTMLElement;
  /** 全局输入控制器。 */
  input: InputController;
  /** 全局运行状态。 */
  runtime: GameRuntime;
  /** 音频控制器。 */
  audio: AudioManager;
  /** 选择的英雄。 */
  heroId?: HeroId;
  /** 游戏结束回调。 */
  onResult: (result: GameResult) => void;
}

/** 封装 Phaser 实例的生命周期。 */
export class GameHost {
  /** Phaser 游戏实例。 */
  private readonly game: Phaser.Game;

  /** 当前可控制场景。 */
  private readonly scene: Phaser.Scene & ControllableScene;

  /** 运行状态取消订阅函数。 */
  private readonly unsubscribeRuntime: () => void;

  /** 创建并挂载指定游戏。 */
  constructor(mode: 'fruit' | 'battle', options: GameHostOptions) {
    this.scene = mode === 'fruit'
      ? new FruitScene(options)
      : new BattleScene({ ...options, heroId: options.heroId ?? 'zero' });
    /** Phaser 画布配置。 */
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: options.parent,
      backgroundColor: '#101317',
      transparent: false,
      scene: [this.scene],
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: '100%', height: '100%' },
      fps: { target: 60, forceSetTimeOut: false },
      input: { activePointers: 2 },
    };
    this.game = new Phaser.Game(config);
    this.unsubscribeRuntime = options.runtime.subscribe((state) => {
      if (state === 'paused') this.scene.setPaused(true);
      if (state === 'playing') this.scene.setPaused(false);
    });
  }

  /** 释放 Phaser 画布和状态订阅。 */
  destroy(): void {
    this.unsubscribeRuntime();
    this.game.destroy(true);
  }
}
