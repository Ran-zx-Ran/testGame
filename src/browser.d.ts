/** 浏览器厂商提供的语音识别结果。 */
interface BrowserSpeechRecognitionResult {
  /** 是否已经得到稳定的最终识别结果。 */
  isFinal: boolean;
  /** 当前结果的候选文本。 */
  readonly [index: number]: { transcript: string; confidence: number };
}

/** 浏览器厂商提供的语音识别事件。 */
interface BrowserSpeechRecognitionEvent extends Event {
  /** 本次结果开始写入的位置。 */
  resultIndex: number;
  /** 本次识别产生的结果集合。 */
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

/** 浏览器厂商提供的语音识别实例。 */
interface BrowserSpeechRecognition extends EventTarget {
  /** 是否持续监听后续语音。 */
  continuous: boolean;
  /** 是否返回临时结果。 */
  interimResults: boolean;
  /** 识别语言。 */
  lang: string;
  /** 识别结束回调。 */
  onend: (() => void) | null;
  /** 识别错误回调。 */
  onerror: ((event: Event) => void) | null;
  /** 识别结果回调。 */
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  /** 开始语音识别。 */
  start(): void;
  /** 停止语音识别。 */
  stop(): void;
}

/** 浏览器厂商提供的语音识别构造器。 */
interface BrowserSpeechRecognitionConstructor {
  /** 创建语音识别实例。 */
  new (): BrowserSpeechRecognition;
}

interface Window {
  /** Chrome 提供的语音识别入口。 */
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  /** 标准化后的语音识别入口。 */
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  /** 自动化测试注入的缩时配置。 */
  __MOTION_TEST__?: {
    /** 切水果测试局时长。 */
    fruitDuration?: number;
    /** 是否在自动化环境中跳过三秒开场倒计时。 */
    skipCountdown?: boolean;
  };
}

interface ScreenOrientation {
  /** 在浏览器允许时锁定指定屏幕方向。 */
  lock(orientation: 'landscape'): Promise<void>;
}
