import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputController, type InputStatus } from '../../src/core/InputController';

describe('InputController 摄像头启动', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('在非安全上下文中返回 insecure 状态', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    /** 本次测试的输入控制器。 */
    const controller = new InputController();
    /** 控制器依次广播的摄像头状态。 */
    const statuses: InputStatus[] = [];
    controller.subscribeStatus((status) => statuses.push(status));

    /** 非安全上下文中的摄像头启动结果。 */
    const started = await controller.startCamera(document.createElement('video'), document.createElement('canvas'));

    expect(started).toBe(false);
    expect(statuses.at(-1)).toBe('insecure');
    controller.destroy();
  });

  it('用户拒绝权限后保留 denied 状态', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) },
    });
    /** 本次测试的输入控制器。 */
    const controller = new InputController();
    /** 控制器依次广播的摄像头状态。 */
    const statuses: InputStatus[] = [];
    controller.subscribeStatus((status) => statuses.push(status));

    /** 权限被拒绝后的摄像头启动结果。 */
    const started = await controller.startCamera(document.createElement('video'), document.createElement('canvas'));

    expect(started).toBe(false);
    expect(statuses).toContain('requesting');
    expect(statuses.at(-1)).toBe('denied');
    controller.destroy();
  });
});
