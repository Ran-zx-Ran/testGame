import { describe, expect, it } from 'vitest';
import { ActionDetector } from '../../src/core/ActionDetector';
import type { GameAction, PoseFrame, PosePoint } from '../../src/types';

/** 创建测试用可见关键点。 */
function point(x: number, y: number): PosePoint {
  return { x, y, visibility: 0.95 };
}

/** 创建稳定的正面全身人体帧。 */
function frame(timestamp: number, centerX = 0.5): PoseFrame {
  return {
    capturedAt: timestamp,
    bodyCenterX: centerX,
    confidence: 0.95,
    fullBodyVisible: true,
    points: {
      leftShoulder: point(centerX - 0.1, 0.27),
      rightShoulder: point(centerX + 0.1, 0.27),
      leftElbow: point(centerX - 0.14, 0.4),
      rightElbow: point(centerX + 0.14, 0.4),
      leftWrist: point(centerX - 0.17, 0.48),
      rightWrist: point(centerX + 0.17, 0.48),
      leftHip: point(centerX - 0.07, 0.55),
      rightHip: point(centerX + 0.07, 0.55),
      leftKnee: point(centerX - 0.07, 0.72),
      rightKnee: point(centerX + 0.07, 0.72),
      leftAnkle: point(centerX - 0.07, 0.92),
      rightAnkle: point(centerX + 0.07, 0.92),
    },
  };
}

describe('ActionDetector', () => {
  it('按校准中心识别左右移动', () => {
    /** 当前捕获的游戏动作。 */
    const actions: GameAction[] = [];
    /** 当前动作识别器。 */
    const detector = new ActionDetector((action) => actions.push(action));
    detector.calibrate(frame(0));
    detector.process(frame(100, 0.36));
    detector.process(frame(200, 0.64));
    expect(actions.map((action) => action.type)).toContain('moveLeft');
    expect(actions.map((action) => action.type)).toContain('moveRight');
  });

  it('识别交叉蓄力后展开双臂', () => {
    /** 当前捕获的游戏动作。 */
    const actions: GameAction[] = [];
    /** 当前动作识别器。 */
    const detector = new ActionDetector((action) => actions.push(action));
    /** 第一帧交叉手腕姿态。 */
    const crossed = frame(100);
    crossed.points.leftWrist = point(0.48, 0.39);
    crossed.points.rightWrist = point(0.52, 0.39);
    detector.process(crossed);
    /** 持续超过 600 毫秒的交叉姿态。 */
    const held = { ...crossed, capturedAt: 750 };
    detector.process(held);
    /** 交叉后快速展开的姿态。 */
    const opened = frame(850);
    opened.points.leftWrist = point(0.26, 0.34);
    opened.points.rightWrist = point(0.74, 0.34);
    detector.process(opened);
    expect(actions.map((action) => action.type)).toContain('skillCharge');
    expect(actions.map((action) => action.type)).toContain('skillRelease');
  });

  it('低置信度或人体不完整时不派发动作', () => {
    /** 当前捕获的游戏动作。 */
    const actions: GameAction[] = [];
    /** 当前动作识别器。 */
    const detector = new ActionDetector((action) => actions.push(action));
    /** 当前无效人体帧。 */
    const invalidFrame = frame(100);
    invalidFrame.fullBodyVisible = false;
    invalidFrame.confidence = 0.2;
    detector.process(invalidFrame);
    expect(actions).toHaveLength(0);
  });
});
