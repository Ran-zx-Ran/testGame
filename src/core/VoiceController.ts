import type { VoiceCommand } from '../types';

/** 将中文语音文本转换为游戏命令。 */
export function parseVoiceCommand(transcript: string): VoiceCommand | null {
  /** 移除空格和常见标点后的识别文本。 */
  const normalized = transcript.replace(/[\s，。！？,.!?]/g, '');
  if (/返回(主页|首页)|退出游戏/.test(normalized)) return 'home';
  if (/重新开始|再来一次|重开/.test(normalized)) return 'restart';
  if (/继续(游戏)?|恢复(游戏)?/.test(normalized)) return 'resume';
  if (/暂停(游戏)?/.test(normalized)) return 'pause';
  if (/开始(游戏)?/.test(normalized)) return 'start';
  return null;
}

/** 语音命令识别器状态回调。 */
export type VoiceStatusCallback = (status: 'idle' | 'listening' | 'unsupported' | 'error') => void;

/** 管理浏览器连续中文语音识别。 */
export class VoiceController {
  /** 浏览器语音识别实例。 */
  private recognition: BrowserSpeechRecognition | null = null;

  /** 是否允许识别结束后自动重启。 */
  private shouldListen = false;

  /** 最近一次语音命令触发时间。 */
  private lastCommandAt = 0;

  /** 语音命令回调。 */
  private readonly onCommand: (command: VoiceCommand) => void;

  /** 语音状态回调。 */
  private readonly onStatus: VoiceStatusCallback;

  /** 创建语音控制器。 */
  constructor(onCommand: (command: VoiceCommand) => void, onStatus: VoiceStatusCallback) {
    this.onCommand = onCommand;
    this.onStatus = onStatus;
  }

  /** 初始化并开始连续语音识别。 */
  start(): void {
    /** 当前浏览器提供的语音识别构造器。 */
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      this.onStatus('unsupported');
      return;
    }
    if (!this.recognition) this.recognition = this.createRecognition(Recognition);
    this.shouldListen = true;
    try {
      this.recognition.start();
      this.onStatus('listening');
    } catch {
      this.onStatus('listening');
    }
  }

  /** 停止语音识别且不再自动重启。 */
  stop(): void {
    this.shouldListen = false;
    this.recognition?.stop();
    this.onStatus('idle');
  }

  /** 创建并配置浏览器语音识别实例。 */
  private createRecognition(Recognition: BrowserSpeechRecognitionConstructor): BrowserSpeechRecognition {
    /** 新建的识别实例。 */
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = () => this.onStatus('error');
    recognition.onend = () => {
      if (!this.shouldListen) return;
      window.setTimeout(() => {
        try {
          recognition.start();
          this.onStatus('listening');
        } catch {
          this.onStatus('error');
        }
      }, 300);
    };
    return recognition;
  }

  /** 解析语音识别结果并过滤短时间重复命令。 */
  private handleResult(event: BrowserSpeechRecognitionEvent): void {
    /** 当前稳定识别结果。 */
    const result = event.results[event.resultIndex];
    /** 当前最优识别候选。 */
    const candidate = result?.[0];
    if (!result?.isFinal || !candidate) return;
    /** 识别得到的游戏命令。 */
    const command = parseVoiceCommand(candidate.transcript);
    /** 当前浏览器时间。 */
    const now = performance.now();
    if (!command || now - this.lastCommandAt < 1200) return;
    this.lastCommandAt = now;
    this.onCommand(command);
  }
}
