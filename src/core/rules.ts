import { BATTLE_RULES } from '../config';

/** 切水果单局计分状态。 */
export class FruitScoreState {
  /** 当前总分。 */
  score = 0;

  /** 当前连续命中次数。 */
  combo = 0;

  /** 单局最高连续命中次数。 */
  maxCombo = 0;

  /** 单局切中的目标数量。 */
  hits = 0;

  /** 最近一次命中时间。 */
  private lastHitAt = 0;

  /** 记录切中普通或金色水果。 */
  hit(kind: 'normal' | 'golden', timestamp: number): number {
    if (timestamp - this.lastHitAt <= 850) this.combo += 1;
    else this.combo = 1;
    this.lastHitAt = timestamp;
    this.hits += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    /** 当前连击对应的得分倍率。 */
    const multiplier = Math.min(5, Math.max(1, Math.ceil(this.combo / 3)));
    /** 当前水果的基础分。 */
    const baseScore = kind === 'golden' ? 50 : 10;
    /** 本次实际增加的分数。 */
    const gainedScore = baseScore * multiplier;
    this.score += gainedScore;
    return gainedScore;
  }

  /** 记录切中炸弹并返回扣除分数。 */
  hitBomb(): number {
    /** 扣分前分数。 */
    const previousScore = this.score;
    this.score = Math.max(0, this.score - 30);
    this.combo = 0;
    return this.score - previousScore;
  }
}

/** 战斗数值状态。 */
export class BattleState {
  /** 英雄当前生命值。 */
  heroHealth: number = BATTLE_RULES.heroMaxHealth;

  /** 怪兽当前生命值。 */
  monsterHealth: number = BATTLE_RULES.monsterMaxHealth;

  /** 英雄当前能量。 */
  energy: number = 0;

  /** 对怪兽执行拳击。 */
  punch(): number {
    return this.attack(BATTLE_RULES.punchDamage, BATTLE_RULES.punchEnergy);
  }

  /** 对怪兽执行踢击。 */
  kick(): number {
    return this.attack(BATTLE_RULES.kickDamage, BATTLE_RULES.kickEnergy);
  }

  /** 能量满时释放光线技能。 */
  beam(): number {
    if (this.energy < BATTLE_RULES.maxEnergy) return 0;
    this.energy = 0;
    this.monsterHealth = Math.max(0, this.monsterHealth - BATTLE_RULES.beamDamage);
    return BATTLE_RULES.beamDamage;
  }

  /** 让英雄承受怪兽攻击。 */
  receiveDamage(damage: number): number {
    /** 实际生效的非负伤害。 */
    const appliedDamage = Math.max(0, damage);
    this.heroHealth = Math.max(0, this.heroHealth - appliedDamage);
    return appliedDamage;
  }

  /** 判断战斗是否已经结束。 */
  isEnded(): boolean {
    return this.heroHealth <= 0 || this.monsterHealth <= 0;
  }

  /** 获取战斗是否胜利。 */
  isVictory(): boolean {
    return this.monsterHealth <= 0 && this.heroHealth > 0;
  }

  /** 应用普通攻击与能量恢复。 */
  private attack(damage: number, gainedEnergy: number): number {
    if (this.isEnded()) return 0;
    this.monsterHealth = Math.max(0, this.monsterHealth - damage);
    this.energy = Math.min(BATTLE_RULES.maxEnergy, this.energy + gainedEnergy);
    return damage;
  }
}
