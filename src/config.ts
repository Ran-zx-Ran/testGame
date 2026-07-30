import type { AssetManifest, HeroId, MonsterId } from './types';

/** 切水果正式游戏时长，单位为毫秒。 */
export const FRUIT_GAME_DURATION = 5 * 60 * 1000;

/** 战斗模式数值配置。 */
export const BATTLE_RULES = {
  heroMaxHealth: 100,
  monsterMaxHealth: 150,
  punchDamage: 8,
  punchEnergy: 12,
  kickDamage: 14,
  kickEnergy: 18,
  beamDamage: 40,
  maxEnergy: 100,
} as const;

/** 英雄展示信息。 */
export const HEROES: ReadonlyArray<{ id: HeroId; name: string; title: string; color: number }> = [
  { id: 'zero', name: '赛罗', title: '光之利刃', color: 0x49a8ff },
  { id: 'tiga', name: '迪迦', title: '复合之光', color: 0xb765ff },
  { id: 'z', name: '泽塔', title: '热血新星', color: 0x52d6c4 },
];

/** 怪兽展示信息。 */
export const MONSTERS: ReadonlyArray<{ id: MonsterId; name: string; color: number }> = [
  { id: 'gomora', name: '哥莫拉', color: 0xd95f45 },
  { id: 'kingJoe', name: '金古桥', color: 0xd7a93d },
  { id: 'eleking', name: '艾雷王', color: 0xb8d44d },
];

/** 项目当前使用的素材清单。 */
export const ASSET_MANIFEST: ReadonlyArray<AssetManifest> = [
  {
    id: 'menu-background',
    localPath: 'src/styles.css#menu-screen',
    sourceUrl: 'project-local',
    author: '项目内 CSS 程序化绘制',
    license: '项目自有；当前会话 imagegen 不可用时的视觉兜底',
  },
  {
    id: 'fruit-background',
    localPath: 'src/game/FruitScene.ts#createBackground',
    sourceUrl: 'project-local',
    author: '项目内 Phaser 程序化绘制',
    license: '项目自有；当前会话 imagegen 不可用时的视觉兜底',
  },
  {
    id: 'battle-background',
    localPath: 'src/game/BattleScene.ts#createBackground',
    sourceUrl: 'project-local',
    author: '项目内 Phaser 程序化绘制',
    license: '项目自有；当前会话 imagegen 不可用时的视觉兜底',
  },
];
