import Phaser from 'phaser';
import { FRUIT_GAME_DURATION } from '../config';
import type { GameAction, GameResult } from '../types';
import { AudioManager } from '../core/AudioManager';
import { GameRuntime } from '../core/GameRuntime';
import { InputController } from '../core/InputController';
import { FruitScoreState } from '../core/rules';

/** 水果目标类型。 */
type FruitKind = 'normal' | 'golden' | 'bomb';

/** 场景内单个抛物目标。 */
interface FruitEntity {
  /** 水果显示容器。 */
  container: Phaser.GameObjects.Container;
  /** 水果种类。 */
  kind: FruitKind;
  /** 水平速度。 */
  velocityX: number;
  /** 垂直速度。 */
  velocityY: number;
  /** 每秒旋转角度。 */
  angularVelocity: number;
  /** 有效碰撞半径。 */
  radius: number;
  /** 是否已经被切中。 */
  sliced: boolean;
}

/** 切水果场景所需依赖。 */
export interface FruitSceneDependencies {
  /** 全局输入控制器。 */
  input: InputController;
  /** 全局运行状态。 */
  runtime: GameRuntime;
  /** 音频控制器。 */
  audio: AudioManager;
  /** 游戏结束回调。 */
  onResult: (result: GameResult) => void;
}

/** 双手体感切水果游戏场景。 */
export class FruitScene extends Phaser.Scene {
  /** 场景外部依赖。 */
  private readonly dependencies: FruitSceneDependencies;

  /** 当前局计分状态。 */
  private readonly scoreState = new FruitScoreState();

  /** 当前所有抛物目标。 */
  private readonly fruits: FruitEntity[] = [];

  /** 可随画布尺寸重绘的背景。 */
  private backgroundGraphics!: Phaser.GameObjects.Graphics;

  /** 得分文字。 */
  private scoreText!: Phaser.GameObjects.Text;

  /** 倒计时文字。 */
  private timerText!: Phaser.GameObjects.Text;

  /** 连击文字。 */
  private comboText!: Phaser.GameObjects.Text;

  /** 中央提示文字。 */
  private messageText!: Phaser.GameObjects.Text;

  /** 切割轨迹绘图对象。 */
  private trailGraphics!: Phaser.GameObjects.Graphics;

  /** 上一个切割轨迹点。 */
  private previousSlashPoint: Phaser.Math.Vector2 | null = null;

  /** 轨迹自动消失计时。 */
  private trailLife = 0;

  /** 游戏正式开始的场景时间。 */
  private startedAt = 0;

  /** 下一次生成水果的场景时间。 */
  private nextSpawnAt = 0;

  /** 当前是否已经开始正式计时。 */
  private playing = false;

  /** 当前是否已经完成结算。 */
  private finished = false;

  /** 输入动作取消订阅函数。 */
  private unsubscribeAction: (() => void) | null = null;

  /** 创建切水果场景。 */
  constructor(dependencies: FruitSceneDependencies) {
    super({ key: 'FruitScene' });
    this.dependencies = dependencies;
  }

  /** 构建场景视觉、HUD 与开始倒计时。 */
  create(): void {
    this.createBackground();
    this.trailGraphics = this.add.graphics().setDepth(20);
    this.scoreText = this.createHudText(28, 22, '得分 0');
    this.timerText = this.createHudText(this.scale.width / 2, 22, '05:00').setOrigin(0.5, 0);
    this.comboText = this.createHudText(this.scale.width - 28, 22, '').setOrigin(1, 0);
    /** 根据画布宽度选择的倒计时字号。 */
    const countdownFontSize = `${Math.round(Math.max(48, Math.min(96, this.scale.width * 0.07)))}px`;
    this.messageText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: countdownFontSize,
        color: '#ffffff',
        stroke: '#15191f',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.unsubscribeAction = this.dependencies.input.subscribeActions((action) => this.handleAction(action));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.startCountdown();
  }

  /** 更新抛物运动、生成节奏和正式计时。 */
  update(_time: number, delta: number): void {
    if (!this.playing || this.finished) return;
    /** 受单帧上限保护的秒级时间差。 */
    const deltaSeconds = Math.min(0.04, delta / 1000);
    this.updateFruits(deltaSeconds);
    this.updateTrail(delta);
    /** 当前已经游玩的时间。 */
    const elapsed = this.time.now - this.startedAt;
    /** 当前剩余游戏时间。 */
    const remaining = Math.max(0, this.getDuration() - elapsed);
    this.timerText.setText(this.formatTime(remaining));
    if (this.time.now >= this.nextSpawnAt) this.spawnWave(elapsed / this.getDuration());
    if (remaining <= 0) this.finishGame();
  }

  /** 暂停或恢复 Phaser 场景。 */
  setPaused(paused: boolean): void {
    if (paused) this.scene.pause();
    else if (this.scene.isPaused()) this.scene.resume();
  }

  /** 绘制具有景深层次的果园训练场背景。 */
  private createBackground(): void {
    /** 背景绘图对象。 */
    const background = this.backgroundGraphics ?? this.add.graphics();
    this.backgroundGraphics = background;
    background.clear();
    background.fillStyle(0x152126).fillRect(0, 0, this.scale.width, this.scale.height);
    background.fillStyle(0x243b34).fillRect(0, this.scale.height * 0.5, this.scale.width, this.scale.height * 0.5);
    background.fillStyle(0xd4553f, 0.86).fillCircle(this.scale.width * 0.78, this.scale.height * 0.21, this.scale.height * 0.12);
    background.fillStyle(0x101719, 0.46).fillRect(0, 0, this.scale.width, 72);
    for (let index = 0; index < 9; index += 1) {
      /** 远景树干水平坐标。 */
      const x = (index / 8) * this.scale.width;
      background.fillStyle(0x172923).fillRect(x - 8, this.scale.height * 0.36, 16, this.scale.height * 0.44);
      background.fillStyle(index % 2 ? 0x396447 : 0x31553c).fillCircle(x, this.scale.height * 0.36, 74);
    }
    background.fillStyle(0x6fbf68, 0.16).fillRect(0, this.scale.height * 0.77, this.scale.width, 3);
  }

  /** 在浏览器尺寸变化时重排 HUD 并重绘背景。 */
  private handleResize(gameSize: Phaser.Structs.Size): void {
    if (!this.scene.isActive()) return;
    this.createBackground();
    this.timerText?.setPosition(gameSize.width / 2, 22);
    this.comboText?.setPosition(gameSize.width - 28, 22);
    this.messageText?.setPosition(gameSize.width / 2, gameSize.height / 2);
    this.fruits.forEach((fruit) => {
      fruit.container.x = Phaser.Math.Clamp(fruit.container.x, 54, gameSize.width - 54);
    });
  }

  /** 创建统一样式的 HUD 文字。 */
  private createHudText(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#f7fbf9',
        stroke: '#101719',
        strokeThickness: 5,
      })
      .setDepth(25);
  }

  /** 播放三秒倒计时并进入正式游戏。 */
  private startCountdown(): void {
    this.dependencies.runtime.startCountdown();
    if (window.__MOTION_TEST__?.skipCountdown) {
      this.beginPlaying();
      return;
    }
    /** 当前倒计时数字。 */
    let count = 3;
    this.messageText.setText(String(count));
    this.time.addEvent({
      delay: 1000,
      repeat: 3,
      callback: () => {
        count -= 1;
        if (count > 0) {
          this.messageText.setText(String(count));
          this.dependencies.audio.ui();
          return;
        }
        this.messageText.setText(count === 0 ? '开切！' : '');
        if (count < 0) this.beginPlaying();
      },
    });
  }

  /** 正式启动计时、目标生成与输入消费。 */
  private beginPlaying(): void {
    this.messageText.setText('');
    this.playing = true;
    this.startedAt = this.time.now;
    this.nextSpawnAt = this.time.now;
    this.dependencies.runtime.play();
  }

  /** 按游戏进度生成一波目标。 */
  private spawnWave(progress: number): void {
    /** 随进度增加的本波数量。 */
    const count = 1 + Math.floor(Math.random() * (progress > 0.65 ? 4 : progress > 0.3 ? 3 : 2));
    for (let index = 0; index < count; index += 1) this.spawnFruit(index, count, progress);
    /** 当前阶段的生成间隔。 */
    const interval = Phaser.Math.Linear(980, 480, progress);
    this.nextSpawnAt = this.time.now + Phaser.Math.Between(Math.floor(interval * 0.78), Math.floor(interval * 1.16));
  }

  /** 创建单个水果、金色水果或炸弹。 */
  private spawnFruit(index: number, count: number, progress: number): void {
    /** 用于确定目标类型的随机值。 */
    const roll = Math.random();
    /** 本次生成的目标类型。 */
    const kind: FruitKind = roll < 0.1 ? 'bomb' : roll < 0.17 ? 'golden' : 'normal';
    /** 本次目标基础颜色。 */
    const color = kind === 'bomb' ? 0x25282a : kind === 'golden' ? 0xffc72e : Phaser.Utils.Array.GetRandom([0xff5b4d, 0x70c64d, 0xff9f3e, 0xe65b99]);
    /** 本次目标水平位置。 */
    const x = Phaser.Math.Clamp(((index + 0.5) / count) * this.scale.width + Phaser.Math.Between(-120, 120), 70, this.scale.width - 70);
    /** 目标主图形。 */
    const body = this.add.circle(0, 0, kind === 'bomb' ? 31 : 36, color).setStrokeStyle(4, kind === 'golden' ? 0xffef9e : 0xffffff, 0.35);
    /** 水果叶片或炸弹引线。 */
    const accent = kind === 'bomb'
      ? this.add.rectangle(17, -31, 5, 22, 0xffc558).setRotation(0.6)
      : this.add.ellipse(15, -34, 24, 11, 0x5ea84b).setRotation(-0.45);
    /** 组合后的目标容器。 */
    const container = this.add.container(x, this.scale.height + 70, [body, accent]).setDepth(8);
    if (kind === 'golden') container.add(this.add.circle(-8, -8, 8, 0xffffff, 0.32));
    /** 本次目标实体。 */
    const entity: FruitEntity = {
      container,
      kind,
      velocityX: Phaser.Math.Between(-150, 150),
      velocityY: Phaser.Math.Between(-880 - progress * 90, -710 - progress * 70),
      angularVelocity: Phaser.Math.Between(-220, 220),
      radius: kind === 'bomb' ? 39 : 44,
      sliced: false,
    };
    this.fruits.push(entity);
  }

  /** 更新全部目标的抛物轨迹并回收离屏对象。 */
  private updateFruits(deltaSeconds: number): void {
    for (let index = this.fruits.length - 1; index >= 0; index -= 1) {
      /** 当前更新的目标。 */
      const fruit = this.fruits[index];
      if (!fruit || fruit.sliced) continue;
      fruit.velocityY += 1080 * deltaSeconds;
      fruit.container.x += fruit.velocityX * deltaSeconds;
      fruit.container.y += fruit.velocityY * deltaSeconds;
      fruit.container.angle += fruit.angularVelocity * deltaSeconds;
      if (fruit.container.y > this.scale.height + 120) this.removeFruit(index);
    }
  }

  /** 消费切割动作并检测目标碰撞。 */
  private handleAction(action: GameAction): void {
    if (!this.playing || this.finished || action.type !== 'slash') return;
    /** 切割动作在场景中的坐标。 */
    const point = new Phaser.Math.Vector2(action.x * this.scale.width, action.y * this.scale.height);
    this.drawTrail(point);
    for (let index = this.fruits.length - 1; index >= 0; index -= 1) {
      /** 当前检测的目标。 */
      const fruit = this.fruits[index];
      if (!fruit || fruit.sliced) continue;
      /** 切割点到目标中心的距离。 */
      const distance = Phaser.Math.Distance.Between(point.x, point.y, fruit.container.x, fruit.container.y);
      if (distance <= fruit.radius + 24) this.sliceFruit(fruit, index);
    }
  }

  /** 绘制并暂存切割轨迹。 */
  private drawTrail(point: Phaser.Math.Vector2): void {
    this.trailGraphics.clear();
    if (this.previousSlashPoint) {
      this.trailGraphics.lineStyle(9, 0xe9fff8, 0.95);
      this.trailGraphics.lineBetween(this.previousSlashPoint.x, this.previousSlashPoint.y, point.x, point.y);
      this.trailGraphics.lineStyle(3, 0x69f2c2, 1);
      this.trailGraphics.lineBetween(this.previousSlashPoint.x, this.previousSlashPoint.y, point.x, point.y);
    }
    this.previousSlashPoint = point;
    this.trailLife = 110;
  }

  /** 随时间清理切割轨迹。 */
  private updateTrail(delta: number): void {
    this.trailLife -= delta;
    if (this.trailLife <= 0) {
      this.trailGraphics.clear();
      this.previousSlashPoint = null;
    }
  }

  /** 处理水果或炸弹命中。 */
  private sliceFruit(fruit: FruitEntity, index: number): void {
    fruit.sliced = true;
    if (fruit.kind === 'bomb') {
      /** 本次炸弹造成的分数变化。 */
      const lost = this.scoreState.hitBomb();
      this.dependencies.audio.explosion();
      this.cameras.main.shake(220, 0.012);
      this.cameras.main.flash(160, 255, 105, 70, false);
      this.showFloatingText(fruit.container.x, fruit.container.y, String(lost), '#ff705a');
    } else {
      /** 本次水果增加的分数。 */
      const gained = this.scoreState.hit(fruit.kind, this.time.now);
      this.dependencies.audio.slice();
      this.createJuiceBurst(fruit.container.x, fruit.container.y, fruit.kind === 'golden' ? 0xffd84a : 0x73e28b);
      this.showFloatingText(fruit.container.x, fruit.container.y, `+${gained}`, fruit.kind === 'golden' ? '#ffe781' : '#ffffff');
    }
    this.scoreText.setText(`得分 ${this.scoreState.score}`);
    this.comboText.setText(this.scoreState.combo >= 3 ? `${this.scoreState.combo} 连击` : '');
    this.tweens.add({
      targets: fruit.container,
      scaleX: 1.45,
      scaleY: 0.25,
      alpha: 0,
      duration: 230,
      onComplete: () => this.removeFruit(index),
    });
  }

  /** 在命中位置创建果汁粒子。 */
  private createJuiceBurst(x: number, y: number, color: number): void {
    for (let index = 0; index < 9; index += 1) {
      /** 单个果汁粒子。 */
      const particle = this.add.circle(x, y, Phaser.Math.Between(3, 8), color, 0.88).setDepth(9);
      /** 单个粒子的随机方向。 */
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      /** 单个粒子的移动距离。 */
      const distance = Phaser.Math.Between(35, 110);
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.25,
        duration: Phaser.Math.Between(260, 440),
        onComplete: () => particle.destroy(),
      });
    }
  }

  /** 显示命中得分浮字。 */
  private showFloatingText(x: number, y: number, text: string, color: string): void {
    /** 当前浮动文字。 */
    const label = this.add
      .text(x, y, text, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '28px', fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(18);
    this.tweens.add({ targets: label, y: y - 72, alpha: 0, duration: 620, onComplete: () => label.destroy() });
  }

  /** 从目标数组和场景中安全移除实体。 */
  private removeFruit(index: number): void {
    /** 等待移除的目标。 */
    const fruit = this.fruits[index];
    if (!fruit) return;
    fruit.container.destroy(true);
    this.fruits.splice(index, 1);
  }

  /** 完成当前局并交给应用显示结算。 */
  private finishGame(): void {
    if (this.finished) return;
    this.finished = true;
    this.playing = false;
    this.dependencies.runtime.end();
    this.dependencies.audio.result(true);
    this.dependencies.onResult({
      mode: 'fruit',
      score: this.scoreState.score,
      maxCombo: this.scoreState.maxCombo,
      hits: this.scoreState.hits,
    });
  }

  /** 获取正式游戏时长，测试模式允许缩短。 */
  private getDuration(): number {
    return window.__MOTION_TEST__?.fruitDuration ?? FRUIT_GAME_DURATION;
  }

  /** 将毫秒格式化为分秒。 */
  private formatTime(milliseconds: number): string {
    /** 向上取整后的剩余秒数。 */
    const seconds = Math.ceil(milliseconds / 1000);
    /** 剩余分钟。 */
    const minutesPart = Math.floor(seconds / 60).toString().padStart(2, '0');
    /** 不足一分钟的剩余秒。 */
    const secondsPart = (seconds % 60).toString().padStart(2, '0');
    return `${minutesPart}:${secondsPart}`;
  }

  /** 清理场景订阅和目标对象。 */
  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.unsubscribeAction?.();
    this.unsubscribeAction = null;
    this.fruits.splice(0).forEach((fruit) => fruit.container.destroy(true));
  }
}
