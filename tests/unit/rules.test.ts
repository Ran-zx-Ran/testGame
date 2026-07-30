import { describe, expect, it } from 'vitest';
import { BattleState, FruitScoreState } from '../../src/core/rules';

describe('FruitScoreState', () => {
  it('累计连击倍率与最高连击', () => {
    /** 当前测试计分状态。 */
    const state = new FruitScoreState();
    expect(state.hit('normal', 1000)).toBe(10);
    expect(state.hit('normal', 1500)).toBe(10);
    expect(state.hit('normal', 2000)).toBe(10);
    expect(state.hit('normal', 2500)).toBe(20);
    expect(state.score).toBe(50);
    expect(state.maxCombo).toBe(4);
  });

  it('金色水果计分且炸弹清空连击', () => {
    /** 当前测试计分状态。 */
    const state = new FruitScoreState();
    expect(state.hit('golden', 1000)).toBe(50);
    expect(state.hitBomb()).toBe(-30);
    expect(state.score).toBe(20);
    expect(state.combo).toBe(0);
  });
});

describe('BattleState', () => {
  it('按规则应用拳击、踢腿和能量上限', () => {
    /** 当前测试战斗状态。 */
    const state = new BattleState();
    expect(state.punch()).toBe(8);
    expect(state.kick()).toBe(14);
    for (let index = 0; index < 6; index += 1) state.kick();
    expect(state.energy).toBe(100);
    expect(state.monsterHealth).toBe(44);
  });

  it('仅在满能量时释放光线', () => {
    /** 当前测试战斗状态。 */
    const state = new BattleState();
    expect(state.beam()).toBe(0);
    for (let index = 0; index < 9; index += 1) state.punch();
    expect(state.beam()).toBe(40);
    expect(state.energy).toBe(0);
  });

  it('生命归零后给出正确胜负', () => {
    /** 英雄失败测试状态。 */
    const failedState = new BattleState();
    failedState.receiveDamage(120);
    expect(failedState.isEnded()).toBe(true);
    expect(failedState.isVictory()).toBe(false);

    /** 英雄胜利测试状态。 */
    const victoryState = new BattleState();
    for (let index = 0; index < 19; index += 1) victoryState.punch();
    expect(victoryState.isEnded()).toBe(true);
    expect(victoryState.isVictory()).toBe(true);
  });
});
