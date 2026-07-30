import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import type { PoseFrame, PosePoint, PosePointName } from '../types';

/** MediaPipe 关键点索引到项目字段的映射。 */
const LANDMARK_INDEX: Readonly<Record<PosePointName, number>> = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

/** 骨架预览使用的关键点连接。 */
const SKELETON_CONNECTIONS: ReadonlyArray<readonly [PosePointName, PosePointName]> = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

/** 将单个 MediaPipe 关键点转换为镜像坐标。 */
function normalizeLandmark(landmark: NormalizedLandmark): PosePoint {
  return {
    x: 1 - landmark.x,
    y: landmark.y,
    visibility: landmark.visibility ?? 0,
  };
}

/** 对新旧关键点做指数平滑。 */
function smoothPoint(previous: PosePoint | undefined, current: PosePoint): PosePoint {
  if (!previous) return current;
  /** 新关键点在平滑结果中的权重。 */
  const alpha = 0.48;
  return {
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha,
    visibility: current.visibility,
  };
}

/** 把 MediaPipe 结果转换为游戏统一人体帧。 */
export function createPoseFrame(
  landmarks: NormalizedLandmark[],
  capturedAt: number,
  previousFrame: PoseFrame | null = null,
): PoseFrame {
  /** 标准化并平滑后的关键点。 */
  const points: Partial<Record<PosePointName, PosePoint>> = {};
  /** 需要处理的关键点名称。 */
  const names = Object.keys(LANDMARK_INDEX) as PosePointName[];
  names.forEach((name) => {
    /** 当前字段对应的模型关键点。 */
    const landmark = landmarks[LANDMARK_INDEX[name]];
    if (!landmark) return;
    points[name] = smoothPoint(previousFrame?.points[name], normalizeLandmark(landmark));
  });
  /** 左髋关键点。 */
  const leftHip = points.leftHip;
  /** 右髋关键点。 */
  const rightHip = points.rightHip;
  /** 身体中心横坐标。 */
  const bodyCenterX = leftHip && rightHip ? (leftHip.x + rightHip.x) / 2 : 0.5;
  /** 判断全身入镜所需的关键点名称。 */
  const requiredNames: PosePointName[] = [
    'leftShoulder',
    'rightShoulder',
    'leftHip',
    'rightHip',
    'leftWrist',
    'rightWrist',
    'leftAnkle',
    'rightAnkle',
  ];
  /** 所需关键点的可见度集合。 */
  const visibilities = requiredNames.map((name) => points[name]?.visibility ?? 0);
  /** 综合关键点置信度。 */
  const confidence = visibilities.reduce((sum, visibility) => sum + visibility, 0) / visibilities.length;
  /** 是否检测到足够完整的人体。 */
  const fullBodyVisible = visibilities.every((visibility) => visibility >= 0.38);
  return { points, bodyCenterX, confidence, fullBodyVisible, capturedAt };
}

/** 封装 MediaPipe 模型加载、推理和骨架绘制。 */
export class PoseController {
  /** MediaPipe 姿态模型实例。 */
  private readonly landmarker: PoseLandmarker;

  /** 上一帧平滑后的人体数据。 */
  private previousFrame: PoseFrame | null = null;

  /** 创建姿态控制器。 */
  private constructor(landmarker: PoseLandmarker) {
    this.landmarker = landmarker;
  }

  /** 从本地 WASM 与模型文件创建姿态控制器。 */
  static async create(): Promise<PoseController> {
    /** 本地 MediaPipe WASM 文件集。 */
    const fileset = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
    /** 姿态模型公共配置。 */
    const options = {
      baseOptions: {
        modelAssetPath: './models/pose_landmarker_lite.task',
        delegate: 'GPU' as const,
      },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
      outputSegmentationMasks: false,
    };
    try {
      /** 优先创建的 GPU 姿态模型。 */
      const landmarker = await PoseLandmarker.createFromOptions(fileset, options);
      return new PoseController(landmarker);
    } catch {
      /** GPU 不可用时创建的 CPU 姿态模型。 */
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
      return new PoseController(landmarker);
    }
  }

  /** 分析一帧视频并返回标准化人体数据。 */
  detect(video: HTMLVideoElement, timestamp: number): PoseFrame | null {
    /** 当前视频帧的模型结果。 */
    const result = this.landmarker.detectForVideo(video, timestamp);
    /** 第一位玩家的人体关键点。 */
    const landmarks = result.landmarks[0];
    if (!landmarks) {
      this.previousFrame = null;
      return null;
    }
    /** 当前标准化人体帧。 */
    const frame = createPoseFrame(landmarks, timestamp, this.previousFrame);
    this.previousFrame = frame;
    return frame;
  }

  /** 在摄像头预览画布中绘制简洁骨架。 */
  draw(frame: PoseFrame | null, canvas: HTMLCanvasElement): void {
    /** 预览画布的二维绘图上下文。 */
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!frame) return;
    context.lineCap = 'round';
    context.lineWidth = 3;
    context.strokeStyle = frame.fullBodyVisible ? '#8df7c7' : '#ffcf5c';
    SKELETON_CONNECTIONS.forEach(([startName, endName]) => {
      /** 连线起点。 */
      const start = frame.points[startName];
      /** 连线终点。 */
      const end = frame.points[endName];
      if (!start || !end || start.visibility < 0.25 || end.visibility < 0.25) return;
      context.beginPath();
      context.moveTo(start.x * canvas.width, start.y * canvas.height);
      context.lineTo(end.x * canvas.width, end.y * canvas.height);
      context.stroke();
    });
    Object.values(frame.points).forEach((point) => {
      if (!point || point.visibility < 0.25) return;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, 3.5, 0, Math.PI * 2);
      context.fill();
    });
  }

  /** 释放 MediaPipe 模型资源。 */
  close(): void {
    this.landmarker.close();
    this.previousFrame = null;
  }
}
