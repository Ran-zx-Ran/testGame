import type { GameAction, GameActionType, PoseFrame, PosePoint, PosePointName } from '../types';

/** 动作识别器依赖的动作回调。 */
export type ActionCallback = (action: GameAction) => void;

/** 计算两个关键点之间的距离。 */
export function pointDistance(first: PosePoint, second: PosePoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

/** 计算三个关键点在中间点形成的夹角。 */
export function jointAngle(first: PosePoint, center: PosePoint, last: PosePoint): number {
  /** 第一条向量。 */
  const vectorA = { x: first.x - center.x, y: first.y - center.y };
  /** 第二条向量。 */
  const vectorB = { x: last.x - center.x, y: last.y - center.y };
  /** 两条向量长度的乘积。 */
  const denominator = Math.hypot(vectorA.x, vectorA.y) * Math.hypot(vectorB.x, vectorB.y);
  if (denominator === 0) return 0;
  /** 限定后的夹角余弦。 */
  const cosine = Math.max(-1, Math.min(1, (vectorA.x * vectorB.x + vectorA.y * vectorB.y) / denominator));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/** 将数值限制在 0 到 1。 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 把 MediaPipe 帧转换为游戏动作。 */
export class ActionDetector {
  /** 上一帧人体数据。 */
  private previousFrame: PoseFrame | null = null;

  /** 校准时记录的身体中心。 */
  private baselineCenterX = 0.5;

  /** 每类动作最近一次触发时间。 */
  private readonly lastActionAt = new Map<GameActionType, number>();

  /** 当前身体所在的横向区域。 */
  private currentMoveAction: GameActionType = 'moveCenter';

  /** 双臂交叉开始时间。 */
  private skillHoldStartedAt: number | null = null;

  /** 招牌动作完成蓄力后的有效截止时间。 */
  private skillPrimedUntil = 0;

  /** 动作识别结果回调。 */
  private readonly callback: ActionCallback;

  /** 创建统一动作识别器。 */
  constructor(callback: ActionCallback) {
    this.callback = callback;
  }

  /** 使用稳定站姿校准横向移动中心。 */
  calibrate(frame: PoseFrame): void {
    this.baselineCenterX = frame.bodyCenterX;
    this.previousFrame = frame;
    this.currentMoveAction = 'moveCenter';
  }

  /** 清空短时动作状态。 */
  reset(): void {
    this.previousFrame = null;
    this.skillHoldStartedAt = null;
    this.skillPrimedUntil = 0;
  }

  /** 处理一帧人体数据并派发可能存在的动作。 */
  process(frame: PoseFrame): void {
    if (!frame.fullBodyVisible || frame.confidence < 0.42) {
      this.reset();
      return;
    }
    this.detectMovement(frame);
    this.detectSkill(frame);
    if (this.previousFrame) {
      this.detectArm(frame, 'left');
      this.detectArm(frame, 'right');
      this.detectLeg(frame, 'left');
      this.detectLeg(frame, 'right');
    }
    this.previousFrame = frame;
  }

  /** 识别身体左右移动区域。 */
  private detectMovement(frame: PoseFrame): void {
    /** 身体中心相对校准点的偏移。 */
    const offset = frame.bodyCenterX - this.baselineCenterX;
    /** 当前偏移对应的移动动作。 */
    const action: GameActionType = offset < -0.1 ? 'moveLeft' : offset > 0.1 ? 'moveRight' : 'moveCenter';
    if (action !== this.currentMoveAction) {
      this.currentMoveAction = action;
      this.emit(action, Math.min(1, Math.abs(offset) * 4), frame.bodyCenterX, 0.62, frame.capturedAt, 0);
    }
  }

  /** 识别手臂挥动和出拳。 */
  private detectArm(frame: PoseFrame, side: 'left' | 'right'): void {
    /** 当前手腕名称。 */
    const wristName: PosePointName = side === 'left' ? 'leftWrist' : 'rightWrist';
    /** 当前手肘名称。 */
    const elbowName: PosePointName = side === 'left' ? 'leftElbow' : 'rightElbow';
    /** 当前肩膀名称。 */
    const shoulderName: PosePointName = side === 'left' ? 'leftShoulder' : 'rightShoulder';
    /** 当前帧手腕。 */
    const wrist = frame.points[wristName];
    /** 上一帧手腕。 */
    const previousWrist = this.previousFrame?.points[wristName];
    /** 当前帧手肘。 */
    const elbow = frame.points[elbowName];
    /** 当前帧肩膀。 */
    const shoulder = frame.points[shoulderName];
    if (!wrist || !previousWrist || !elbow || !shoulder || !this.previousFrame) return;
    /** 两帧之间的秒数。 */
    const elapsedSeconds = Math.max(0.016, (frame.capturedAt - this.previousFrame.capturedAt) / 1000);
    /** 手腕移动速度。 */
    const speed = pointDistance(wrist, previousWrist) / elapsedSeconds;
    if (speed > 0.72) {
      this.emit('slash', clamp01(speed / 2.1), wrist.x, wrist.y, frame.capturedAt, 150);
    }
    /** 当前手臂伸展角度。 */
    const angle = jointAngle(shoulder, elbow, wrist);
    /** 手腕距离肩膀的伸展长度。 */
    const extension = pointDistance(shoulder, wrist);
    if (speed > 0.62 && angle > 142 && extension > 0.2) {
      this.emit(side === 'left' ? 'punchLeft' : 'punchRight', clamp01(speed / 1.8), wrist.x, wrist.y, frame.capturedAt, 420);
    }
  }

  /** 识别抬腿与踢腿动作。 */
  private detectLeg(frame: PoseFrame, side: 'left' | 'right'): void {
    /** 当前脚踝名称。 */
    const ankleName: PosePointName = side === 'left' ? 'leftAnkle' : 'rightAnkle';
    /** 当前膝盖名称。 */
    const kneeName: PosePointName = side === 'left' ? 'leftKnee' : 'rightKnee';
    /** 当前髋部名称。 */
    const hipName: PosePointName = side === 'left' ? 'leftHip' : 'rightHip';
    /** 当前帧脚踝。 */
    const ankle = frame.points[ankleName];
    /** 上一帧脚踝。 */
    const previousAnkle = this.previousFrame?.points[ankleName];
    /** 当前帧膝盖。 */
    const knee = frame.points[kneeName];
    /** 当前帧髋部。 */
    const hip = frame.points[hipName];
    if (!ankle || !previousAnkle || !knee || !hip || !this.previousFrame) return;
    /** 两帧之间的秒数。 */
    const elapsedSeconds = Math.max(0.016, (frame.capturedAt - this.previousFrame.capturedAt) / 1000);
    /** 脚踝移动速度。 */
    const speed = pointDistance(ankle, previousAnkle) / elapsedSeconds;
    /** 当前腿部伸展角度。 */
    const angle = jointAngle(hip, knee, ankle);
    /** 脚踝是否已经明显抬高。 */
    const raised = ankle.y < hip.y + 0.43 || previousAnkle.y - ankle.y > 0.025;
    if (speed > 0.48 && angle > 128 && raised) {
      this.emit(side === 'left' ? 'kickLeft' : 'kickRight', clamp01(speed / 1.5), ankle.x, ankle.y, frame.capturedAt, 720);
    }
  }

  /** 识别交叉蓄力后展开双臂的招牌动作。 */
  private detectSkill(frame: PoseFrame): void {
    /** 左手腕。 */
    const leftWrist = frame.points.leftWrist;
    /** 右手腕。 */
    const rightWrist = frame.points.rightWrist;
    /** 左肩。 */
    const leftShoulder = frame.points.leftShoulder;
    /** 右肩。 */
    const rightShoulder = frame.points.rightShoulder;
    /** 左髋。 */
    const leftHip = frame.points.leftHip;
    /** 右髋。 */
    const rightHip = frame.points.rightHip;
    if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftHip || !rightHip) return;
    /** 双手之间的距离。 */
    const wristDistance = pointDistance(leftWrist, rightWrist);
    /** 肩部平均高度。 */
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    /** 髋部平均高度。 */
    const hipY = (leftHip.y + rightHip.y) / 2;
    /** 双手是否位于胸前交叉区域。 */
    const crossedAtChest = wristDistance < 0.14 && leftWrist.y > shoulderY - 0.04 && leftWrist.y < hipY + 0.04;
    if (crossedAtChest) {
      if (this.skillHoldStartedAt === null) this.skillHoldStartedAt = frame.capturedAt;
      if (frame.capturedAt - this.skillHoldStartedAt >= 600 && this.skillPrimedUntil < frame.capturedAt) {
        this.skillPrimedUntil = frame.capturedAt + 1500;
        this.emit('skillCharge', 1, frame.bodyCenterX, shoulderY, frame.capturedAt, 1200);
      }
      return;
    }
    if (this.skillPrimedUntil >= frame.capturedAt && wristDistance > 0.36) {
      this.emit('skillRelease', 1, frame.bodyCenterX, shoulderY, frame.capturedAt, 3000);
      this.skillPrimedUntil = 0;
    }
    this.skillHoldStartedAt = null;
  }

  /** 根据动作冷却时间安全派发动作。 */
  private emit(type: GameActionType, strength: number, x: number, y: number, timestamp: number, cooldown: number): void {
    /** 同类动作最近触发时间。 */
    const lastTriggeredAt = this.lastActionAt.get(type) ?? -Infinity;
    if (timestamp - lastTriggeredAt < cooldown) return;
    this.lastActionAt.set(type, timestamp);
    this.callback({ type, strength, x, y, source: 'pose', timestamp });
  }
}
