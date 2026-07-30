import { describe, expect, it } from 'vitest';
import { parseVoiceCommand } from '../../src/core/VoiceController';

describe('parseVoiceCommand', () => {
  it('识别开始与暂停命令', () => {
    expect(parseVoiceCommand('开始游戏')).toBe('start');
    expect(parseVoiceCommand('请暂停游戏。')).toBe('pause');
  });

  it('识别继续、重开和返回命令', () => {
    expect(parseVoiceCommand('继续游戏')).toBe('resume');
    expect(parseVoiceCommand('再来一次')).toBe('restart');
    expect(parseVoiceCommand('返回主页')).toBe('home');
  });

  it('忽略无关语音文本', () => {
    expect(parseVoiceCommand('今天天气不错')).toBeNull();
  });
});
