/** 支持识别的人体关键点名称。 */
export type PosePointName =
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle';

/** 标准化后的单个人体关键点。 */
export interface PosePoint {
  /** 镜像后的水平坐标，范围为 0 到 1。 */
  x: number;
  /** 垂直坐标，范围为 0 到 1。 */
  y: number;
  /** 模型给出的可见度。 */
  visibility: number;
}

/** 传给游戏层的标准化人体帧。 */
export interface PoseFrame {
  /** 当前帧内可用的关键点。 */
  points: Partial<Record<PosePointName, PosePoint>>;
  /** 当前身体中心的水平位置。 */
  bodyCenterX: number;
  /** 当前帧综合置信度。 */
  confidence: number;
  /** 是否检测到足够完整的身体。 */
  fullBodyVisible: boolean;
  /** 当前帧采集时间。 */
  capturedAt: number;
}

/** 游戏可以消费的统一动作名称。 */
export type GameActionType =
  | 'slash'
  | 'punchLeft'
  | 'punchRight'
  | 'kickLeft'
  | 'kickRight'
  | 'moveLeft'
  | 'moveCenter'
  | 'moveRight'
  | 'skillCharge'
  | 'skillRelease';

/** 输入层派发给游戏层的动作数据。 */
export interface GameAction {
  /** 被识别的动作。 */
  type: GameActionType;
  /** 动作强度，范围为 0 到 1。 */
  strength: number;
  /** 动作结束点的水平坐标。 */
  x: number;
  /** 动作结束点的垂直坐标。 */
  y: number;
  /** 产生动作的输入源。 */
  source: 'pose' | 'pointer' | 'keyboard' | 'touch';
  /** 动作发生时间。 */
  timestamp: number;
}

/** 语音控制支持的统一命令。 */
export type VoiceCommand = 'start' | 'pause' | 'resume' | 'restart' | 'home';

/** 游戏运行时状态。 */
export type RuntimeState = 'menu' | 'countdown' | 'playing' | 'paused' | 'ended';

/** 当前可进入的游戏模式。 */
export type GameMode = 'fruit' | 'battle';

/** 可选择的英雄编号。 */
export type HeroId = 'zero' | 'tiga' | 'z';

/** 怪兽编号。 */
export type MonsterId = 'gomora' | 'kingJoe' | 'eleking';

/** 项目内素材的来源记录。 */
export interface AssetManifest {
  /** 素材在代码中的唯一编号。 */
  id: string;
  /** 素材本地路径。 */
  localPath: string;
  /** 素材原始来源地址。 */
  sourceUrl: string;
  /** 作者或来源站点。 */
  author: string;
  /** 已知授权或风险提示。 */
  license: string;
}

/** 游戏结束时展示的结果数据。 */
export interface GameResult {
  /** 游戏模式。 */
  mode: GameMode;
  /** 是否取得战斗胜利。 */
  victory?: boolean;
  /** 切水果最终得分。 */
  score?: number;
  /** 切水果最高连击数。 */
  maxCombo?: number;
  /** 切水果命中数量。 */
  hits?: number;
}
