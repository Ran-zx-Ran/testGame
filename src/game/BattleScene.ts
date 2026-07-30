import Phaser from 'phaser';
import { BATTLE_RULES, HEROES, MONSTERS } from '../config';
import type { GameAction, GameResult, HeroId } from '../types';
import { AudioManager } from '../core/AudioManager';
import { GameRuntime } from '../core/GameRuntime';
import { InputController } from '../core/InputController';
import { BattleState } from '../core/rules';

/** 玩家可处于的横向闪避区域。 */
type BattleLane = 'left' | 'center' | 'right';

/** 战斗角色可动画部件。 */
interface FighterParts {
  /** 角色完整容器。 */
  container: Phaser.GameObjects.Container;
  /** 左臂图形。 */
  leftArm: Phaser.GameObjects.Rectangle;
  /** 右臂图形。 */
  rightArm: Phaser.GameObjects.Rectangle;
  /** 左腿图形。 */
  leftLeg: Phaser.GameObjects.Rectangle;
  /** 右腿图形。 */
  rightLeg: Phaser.GameObjects.Rectangle;
  /** 受击闪烁主体列表。 */
  bodyParts: Phaser.GameObjects.Shape[];
}

/** 战斗场景所需依赖。 */
export interface BattleSceneDependencies {
  /** 当前选择的英雄。 */
  heroId: HeroId;
  /** 全局输入控制器。 */
  input: InputController;
  /** 全局运行状态。 */
  runtime: GameRuntime;
  /** 音频控制器。 */
  audio: AudioManager;
  /** 游戏结束回调。 */
  onResult: (result: GameResult) => void;
}

/** 英雄体感打怪兽场景。 */
export class BattleScene extends Phaser.Scene {
  /** 场景外部依赖。 */
  private readonly dependencies: BattleSceneDependencies;

  /** 当前战斗数值状态。 */
  private readonly battleState = new BattleState();

  /** 当前英雄信息。 */
  private readonly hero;

  /** 本局随机怪兽信息。 */
  private readonly monster;

  /** 可随画布尺寸重绘的背景。 */
  private backgroundGraphics!: Phaser.GameObjects.Graphics;

  /** 英雄可动画部件。 */
  private heroParts!: FighterParts;

  /** 怪兽可动画部件。 */
  private monsterParts!: FighterParts;

  /** 血量与能量绘图对象。 */
  private hudGraphics!: Phaser.GameObjects.Graphics;

  /** 英雄名称文字。 */
  private heroNameText!: Phaser.GameObjects.Text;

  /** 怪兽名称文字。 */
  private monsterNameText!: Phaser.GameObjects.Text;

  /** 战斗状态提示文字。 */
  private statusText!: Phaser.GameObjects.Text;

  /** 攻击预警区域。 */
  private warningZone!: Phaser.GameObjects.Rectangle;

  /** 玩家当前所处区域。 */
  private currentLane: BattleLane = 'center';

  /** 怪兽正在锁定的区域。 */
  private targetedLane: BattleLane | null = null;

  /** 怪兽攻击是否处于预警阶段。 */
  private attackTelegraphing = false;

  /** 当前场景是否已经正式开始。 */
  private playing = false;

  /** 当前战斗是否已经结算。 */
  private finished = false;

  /** 各类战斗动作最近一次执行时间。 */
  private readonly lastActionAt = new Map<string, number>();

  /** 输入动作取消订阅函数。 */
  private unsubscribeAction: (() => void) | null = null;

  /** 创建英雄战斗场景。 */
  constructor(dependencies: BattleSceneDependencies) {
    super({ key: 'BattleScene' });
    this.dependencies = dependencies;
    this.hero = HEROES.find((hero) => hero.id === dependencies.heroId) ?? HEROES[0]!;
    this.monster = Phaser.Utils.Array.GetRandom([...MONSTERS]);
  }

  /** 构建战斗场地、角色、HUD 与倒计时。 */
  create(): void {
    this.createBackground();
    this.warningZone = this.add.rectangle(0, 0, 170, this.scale.height * 0.54, 0xff4c46, 0).setDepth(2);
    this.heroParts = this.createHero(this.scale.width * 0.28, this.scale.height * 0.72, this.hero.color);
    this.monsterParts = this.createMonster(this.scale.width * 0.72, this.scale.height * 0.58, this.monster.color);
    this.layoutFighters(this.scale.width, this.scale.height);
    this.hudGraphics = this.add.graphics().setDepth(20);
    this.heroNameText = this.createHudText(28, 22, `${this.hero.name} · ${this.hero.title}`);
    this.monsterNameText = this.createHudText(this.scale.width - 28, 22, this.monster.name).setOrigin(1, 0);
    this.statusText = this.add
      .text(this.scale.width / 2, this.scale.height * 0.24, '', {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#111419',
        strokeThickness: 7,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(24);
    this.drawHud();
    this.unsubscribeAction = this.dependencies.input.subscribeActions((action) => this.handleAction(action));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.startCountdown();
  }

  /** 暂停或恢复 Phaser 战斗场景。 */
  setPaused(paused: boolean): void {
    if (paused) this.scene.pause();
    else if (this.scene.isPaused()) this.scene.resume();
  }

  /** 绘制城市废墟战斗场地。 */
  private createBackground(): void {
    /** 战斗背景绘图对象。 */
    const background = this.backgroundGraphics ?? this.add.graphics();
    this.backgroundGraphics = background;
    background.clear();
    background.fillStyle(0x14171a).fillRect(0, 0, this.scale.width, this.scale.height);
    background.fillStyle(0x522f34).fillRect(0, this.scale.height * 0.55, this.scale.width, this.scale.height * 0.45);
    background.fillStyle(0xf05a47, 0.52).fillCircle(this.scale.width * 0.72, this.scale.height * 0.22, this.scale.height * 0.13);
    for (let index = 0; index < 12; index += 1) {
      /** 单栋远景建筑高度。 */
      const buildingHeight = Phaser.Math.Between(100, 260);
      /** 单栋远景建筑宽度。 */
      const buildingWidth = this.scale.width / 12 + 4;
      background.fillStyle(index % 2 ? 0x24282c : 0x2c3034).fillRect(index * buildingWidth, this.scale.height * 0.58 - buildingHeight, buildingWidth - 4, buildingHeight);
    }
    background.fillStyle(0x0c0f11, 0.5).fillRect(0, 0, this.scale.width, 76);
    background.lineStyle(3, 0xf0aa53, 0.34).lineBetween(0, this.scale.height * 0.82, this.scale.width, this.scale.height * 0.82);
  }

  /** 在浏览器尺寸变化时重排角色、HUD 与预警区域。 */
  private handleResize(gameSize: Phaser.Structs.Size): void {
    if (!this.scene.isActive()) return;
    this.createBackground();
    this.layoutFighters(gameSize.width, gameSize.height);
    this.heroNameText?.setPosition(28, 22);
    this.monsterNameText?.setPosition(gameSize.width - 28, 22);
    this.statusText?.setPosition(gameSize.width / 2, gameSize.height * 0.24);
    this.warningZone?.setSize(170, gameSize.height * 0.54);
    this.drawHud();
  }

  /** 按画布尺寸缩放并摆放英雄与怪兽。 */
  private layoutFighters(width: number, height: number): void {
    if (!this.heroParts || !this.monsterParts) return;
    /** 低高度画布使用的角色缩放比例。 */
    const fighterScale = Phaser.Math.Clamp(height / 600, 0.58, 1);
    /** 当前闪避区域对应的英雄水平位置。 */
    const heroX = this.currentLane === 'left' ? width * 0.16 : this.currentLane === 'right' ? width * 0.4 : width * 0.28;
    this.heroParts.container.setScale(fighterScale).setPosition(heroX, height * 0.72);
    this.monsterParts.container.setScale(fighterScale).setPosition(width * 0.72, height * 0.58);
  }

  /** 创建背向玩家的科幻英雄部件。 */
  private createHero(x: number, y: number, color: number): FighterParts {
    /** 英雄头部。 */
    const head = this.add.circle(0, -126, 29, 0xd7dce0).setStrokeStyle(5, color);
    /** 英雄躯干。 */
    const torso = this.add.rectangle(0, -58, 82, 116, 0x6f757c).setStrokeStyle(7, color);
    /** 英雄核心灯。 */
    const core = this.add.circle(0, -70, 12, 0x8ff5ea).setStrokeStyle(3, 0xffffff, 0.75);
    /** 英雄左臂。 */
    const leftArm = this.add.rectangle(-58, -58, 25, 108, 0x878d92).setOrigin(0.5, 0.12).setRotation(0.18);
    /** 英雄右臂。 */
    const rightArm = this.add.rectangle(58, -58, 25, 108, 0x878d92).setOrigin(0.5, 0.12).setRotation(-0.18);
    /** 英雄左腿。 */
    const leftLeg = this.add.rectangle(-23, 22, 29, 120, 0x555b62).setOrigin(0.5, 0.05).setRotation(0.05);
    /** 英雄右腿。 */
    const rightLeg = this.add.rectangle(23, 22, 29, 120, 0x555b62).setOrigin(0.5, 0.05).setRotation(-0.05);
    /** 英雄完整容器。 */
    const container = this.add.container(x, y, [leftLeg, rightLeg, leftArm, rightArm, torso, core, head]).setDepth(8);
    return { container, leftArm, rightArm, leftLeg, rightLeg, bodyParts: [head, torso, core, leftArm, rightArm, leftLeg, rightLeg] };
  }

  /** 创建正面面向玩家的怪兽部件。 */
  private createMonster(x: number, y: number, color: number): FighterParts {
    /** 怪兽主体。 */
    const torso = this.add.ellipse(0, 0, 170, 210, color).setStrokeStyle(7, 0x2a1b1a, 0.7);
    /** 怪兽头部。 */
    const head = this.add.ellipse(0, -128, 112, 92, Phaser.Display.Color.ValueToColor(color).darken(16).color);
    /** 怪兽左眼。 */
    const leftEye = this.add.ellipse(-22, -137, 18, 10, 0xffe36c);
    /** 怪兽右眼。 */
    const rightEye = this.add.ellipse(22, -137, 18, 10, 0xffe36c);
    /** 怪兽左角。 */
    const leftHorn = this.add.triangle(-38, -181, 0, 42, 14, 0, 28, 42, 0xe8d2b7).setRotation(-0.3);
    /** 怪兽右角。 */
    const rightHorn = this.add.triangle(38, -181, 0, 42, 14, 0, 28, 42, 0xe8d2b7).setRotation(0.3);
    /** 怪兽左臂。 */
    const leftArm = this.add.rectangle(-96, -15, 42, 152, color).setOrigin(0.5, 0.18).setRotation(0.28);
    /** 怪兽右臂。 */
    const rightArm = this.add.rectangle(96, -15, 42, 152, color).setOrigin(0.5, 0.18).setRotation(-0.28);
    /** 怪兽左腿。 */
    const leftLeg = this.add.rectangle(-44, 92, 50, 142, color).setOrigin(0.5, 0.1).setRotation(0.08);
    /** 怪兽右腿。 */
    const rightLeg = this.add.rectangle(44, 92, 50, 142, color).setOrigin(0.5, 0.1).setRotation(-0.08);
    /** 怪兽完整容器。 */
    const container = this.add.container(x, y, [leftLeg, rightLeg, leftArm, rightArm, torso, head, leftHorn, rightHorn, leftEye, rightEye]).setDepth(7);
    return {
      container,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      bodyParts: [torso, head, leftHorn, rightHorn, leftEye, rightEye, leftArm, rightArm, leftLeg, rightLeg],
    };
  }

  /** 创建统一样式的战斗 HUD 文字。 */
  private createHudText(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#101317',
        strokeThickness: 5,
      })
      .setDepth(22);
  }

  /** 绘制英雄生命、怪兽生命和英雄能量。 */
  private drawHud(): void {
    /** 单条生命槽宽度。 */
    const barWidth = Math.min(360, this.scale.width * 0.3);
    /** 英雄生命比例。 */
    const heroRatio = this.battleState.heroHealth / BATTLE_RULES.heroMaxHealth;
    /** 怪兽生命比例。 */
    const monsterRatio = this.battleState.monsterHealth / BATTLE_RULES.monsterMaxHealth;
    /** 英雄能量比例。 */
    const energyRatio = this.battleState.energy / BATTLE_RULES.maxEnergy;
    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x080a0c, 0.72).fillRoundedRect(28, 56, barWidth, 18, 4);
    this.hudGraphics.fillStyle(heroRatio > 0.3 ? 0x5ee39b : 0xff5b52).fillRoundedRect(28, 56, barWidth * heroRatio, 18, 4);
    this.hudGraphics.fillStyle(0x080a0c, 0.72).fillRoundedRect(28, 80, barWidth, 9, 3);
    this.hudGraphics.fillStyle(energyRatio >= 1 ? 0xffdf68 : 0x63d8ee).fillRoundedRect(28, 80, barWidth * energyRatio, 9, 3);
    this.hudGraphics.fillStyle(0x080a0c, 0.72).fillRoundedRect(this.scale.width - 28 - barWidth, 56, barWidth, 18, 4);
    this.hudGraphics.fillStyle(monsterRatio > 0.3 ? 0xff816c : 0xff443d).fillRoundedRect(this.scale.width - 28 - barWidth, 56, barWidth * monsterRatio, 18, 4);
  }

  /** 播放开战倒计时并启动怪兽攻击循环。 */
  private startCountdown(): void {
    this.dependencies.runtime.startCountdown();
    /** 当前倒计时数字。 */
    let count = 3;
    this.statusText.setText(String(count));
    this.time.addEvent({
      delay: 1000,
      repeat: 3,
      callback: () => {
        count -= 1;
        if (count > 0) {
          this.statusText.setText(String(count));
          this.dependencies.audio.ui();
          return;
        }
        this.statusText.setText(count === 0 ? '战斗开始' : '');
        if (count < 0) {
          this.playing = true;
          this.dependencies.runtime.play();
          this.scheduleMonsterAttack();
          this.time.delayedCall(520, () => this.statusText.setText(''));
        }
      },
    });
  }

  /** 消费体感或降级战斗动作。 */
  private handleAction(action: GameAction): void {
    if (!this.playing || this.finished) return;
    if (action.type === 'moveLeft' || action.type === 'moveCenter' || action.type === 'moveRight') {
      this.moveHero(action.type === 'moveLeft' ? 'left' : action.type === 'moveRight' ? 'right' : 'center');
      return;
    }
    if (action.type === 'punchLeft' || action.type === 'punchRight') this.performPunch(action.type === 'punchLeft');
    if (action.type === 'kickLeft' || action.type === 'kickRight') this.performKick(action.type === 'kickLeft');
    if (action.type === 'skillCharge') this.showStatus('能量汇聚', '#9df7ff');
    if (action.type === 'skillRelease') this.performBeam();
  }

  /** 将英雄移动到指定闪避区域。 */
  private moveHero(lane: BattleLane): void {
    if (this.currentLane === lane) return;
    this.currentLane = lane;
    /** 指定区域对应的水平位置。 */
    const x = lane === 'left' ? this.scale.width * 0.16 : lane === 'right' ? this.scale.width * 0.4 : this.scale.width * 0.28;
    this.tweens.add({ targets: this.heroParts.container, x, duration: 180, ease: 'Sine.Out' });
  }

  /** 执行拳击动画并应用伤害。 */
  private performPunch(useLeftArm: boolean): void {
    if (!this.canTrigger('punch', 400)) return;
    /** 当前攻击使用的手臂。 */
    const arm = useLeftArm ? this.heroParts.leftArm : this.heroParts.rightArm;
    this.tweens.add({ targets: arm, angle: useLeftArm ? -76 : 76, scaleY: 1.2, duration: 100, yoyo: true, ease: 'Quad.Out' });
    this.tweens.add({ targets: this.heroParts.container, x: this.heroParts.container.x + 34, duration: 90, yoyo: true });
    this.battleState.punch();
    this.dependencies.audio.hit();
    this.flashFighter(this.monsterParts, 0xffffff);
    this.showImpact(this.monsterParts.container.x - 80, this.monsterParts.container.y - 60, 0x8deeff);
    this.afterPlayerAttack();
  }

  /** 执行踢腿动画并应用伤害。 */
  private performKick(useLeftLeg: boolean): void {
    if (!this.canTrigger('kick', 720)) return;
    /** 当前攻击使用的腿部。 */
    const leg = useLeftLeg ? this.heroParts.leftLeg : this.heroParts.rightLeg;
    this.tweens.add({ targets: leg, angle: useLeftLeg ? -72 : 72, scaleY: 1.18, duration: 150, yoyo: true, ease: 'Back.Out' });
    this.tweens.add({ targets: this.heroParts.container, angle: useLeftLeg ? -4 : 4, duration: 150, yoyo: true });
    this.battleState.kick();
    this.dependencies.audio.hit();
    this.flashFighter(this.monsterParts, 0xffffff);
    this.showImpact(this.monsterParts.container.x - 70, this.monsterParts.container.y + 20, 0xffd46a);
    this.afterPlayerAttack();
  }

  /** 能量满时释放光线并应用伤害。 */
  private performBeam(): void {
    if (!this.canTrigger('beam', 3000)) return;
    /** 光线技能实际造成的伤害。 */
    const damage = this.battleState.beam();
    if (damage === 0) {
      this.showStatus(`能量 ${this.battleState.energy}/${BATTLE_RULES.maxEnergy}`, '#ffdc73');
      return;
    }
    /** 光线主体绘图对象。 */
    const beam = this.add.graphics().setDepth(15);
    beam.lineStyle(30, this.hero.color, 0.28).lineBetween(this.heroParts.container.x + 45, this.heroParts.container.y - 80, this.monsterParts.container.x - 70, this.monsterParts.container.y - 40);
    beam.lineStyle(10, 0xf7ffff, 1).lineBetween(this.heroParts.container.x + 45, this.heroParts.container.y - 80, this.monsterParts.container.x - 70, this.monsterParts.container.y - 40);
    this.dependencies.audio.beam();
    this.cameras.main.shake(480, 0.01);
    this.flashFighter(this.monsterParts, 0xffffff);
    this.tweens.add({ targets: beam, alpha: 0, duration: 560, onComplete: () => beam.destroy() });
    this.afterPlayerAttack();
  }

  /** 更新 HUD 并检查玩家攻击后的战斗结束条件。 */
  private afterPlayerAttack(): void {
    this.drawHud();
    if (this.battleState.isEnded()) this.finishBattle();
  }

  /** 在随机间隔后开始一次怪兽攻击。 */
  private scheduleMonsterAttack(): void {
    if (this.finished) return;
    /** 下一次攻击前的随机等待时间。 */
    const delay = Phaser.Math.Between(2500, 4000);
    this.time.delayedCall(delay, () => this.telegraphMonsterAttack());
  }

  /** 锁定玩家当前区域并显示攻击预警。 */
  private telegraphMonsterAttack(): void {
    if (this.finished || !this.playing || this.attackTelegraphing) return;
    this.attackTelegraphing = true;
    this.targetedLane = this.currentLane;
    /** 被锁定区域对应的水平位置。 */
    const laneX = this.targetedLane === 'left' ? this.scale.width * 0.16 : this.targetedLane === 'right' ? this.scale.width * 0.4 : this.scale.width * 0.28;
    this.warningZone.setPosition(laneX, this.scale.height * 0.68).setFillStyle(0xff514b, 0.28);
    this.showStatus('攻击预警', '#ff8b79');
    this.tweens.add({ targets: this.warningZone, alpha: { from: 0.25, to: 0.8 }, duration: 180, yoyo: true, repeat: 4 });
    this.time.delayedCall(1100, () => this.resolveMonsterAttack());
  }

  /** 根据玩家是否离开锁定区域结算怪兽攻击。 */
  private resolveMonsterAttack(): void {
    if (this.finished) return;
    /** 玩家是否已经移出被锁定区域。 */
    const dodged = this.currentLane !== this.targetedLane;
    this.tweens.add({ targets: this.monsterParts.rightArm, angle: 88, duration: 120, yoyo: true, ease: 'Back.Out' });
    this.tweens.add({ targets: this.monsterParts.container, x: this.monsterParts.container.x - 45, duration: 120, yoyo: true });
    if (dodged) {
      this.showStatus('闪避成功', '#7ef1ba');
    } else {
      /** 本次怪兽攻击伤害。 */
      const damage = Phaser.Math.Between(12, 18);
      this.battleState.receiveDamage(damage);
      this.dependencies.audio.explosion();
      this.cameras.main.shake(180, 0.009);
      this.flashFighter(this.heroParts, 0xff554b);
      this.showStatus(`-${damage}`, '#ff776b');
    }
    this.warningZone.setFillStyle(0xff514b, 0);
    this.attackTelegraphing = false;
    this.targetedLane = null;
    this.drawHud();
    if (this.battleState.isEnded()) this.finishBattle();
    else this.scheduleMonsterAttack();
  }

  /** 创建一组短促的攻击命中特效。 */
  private showImpact(x: number, y: number, color: number): void {
    for (let index = 0; index < 7; index += 1) {
      /** 单个命中特效线段。 */
      const spark = this.add.rectangle(x, y, Phaser.Math.Between(22, 52), 4, color).setAngle(Phaser.Math.Between(0, 359)).setDepth(14);
      this.tweens.add({ targets: spark, scaleX: 1.7, alpha: 0, duration: 260, onComplete: () => spark.destroy() });
    }
  }

  /** 让角色所有部件短暂闪烁。 */
  private flashFighter(fighter: FighterParts, color: number): void {
    fighter.bodyParts.forEach((part) => {
      part.setStrokeStyle(6, color, 1);
      this.time.delayedCall(130, () => part.setStrokeStyle());
    });
  }

  /** 显示短时战斗状态提示。 */
  private showStatus(message: string, color: string): void {
    this.statusText.setColor(color).setText(message).setAlpha(1);
    this.tweens.killTweensOf(this.statusText);
    this.tweens.add({ targets: this.statusText, alpha: 0, delay: 560, duration: 300 });
  }

  /** 根据场景时间限制动作触发频率。 */
  private canTrigger(key: string, cooldown: number): boolean {
    /** 当前动作最近执行时间。 */
    const lastTriggeredAt = this.lastActionAt.get(key) ?? -Infinity;
    if (this.time.now - lastTriggeredAt < cooldown) return false;
    this.lastActionAt.set(key, this.time.now);
    return true;
  }

  /** 结束战斗并上报胜负结果。 */
  private finishBattle(): void {
    if (this.finished) return;
    this.finished = true;
    this.playing = false;
    /** 当前战斗是否胜利。 */
    const victory = this.battleState.isVictory();
    this.dependencies.runtime.end();
    this.dependencies.audio.result(victory);
    this.statusText.setAlpha(1).setColor(victory ? '#9cf6c5' : '#ff8b7d').setText(victory ? '胜利' : '战斗失败');
    this.tweens.add({
      targets: victory ? this.monsterParts.container : this.heroParts.container,
      alpha: 0.18,
      angle: victory ? 12 : -12,
      y: '+=80',
      duration: 650,
      onComplete: () => this.dependencies.onResult({ mode: 'battle', victory }),
    });
  }

  /** 清理战斗场景输入订阅。 */
  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.unsubscribeAction?.();
    this.unsubscribeAction = null;
  }
}
