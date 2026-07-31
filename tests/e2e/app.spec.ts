import { expect, test } from '@playwright/test';

test('首页可以进入切水果并通过触控降级完成缩时结算', async ({ page }) => {
  await page.addInitScript(() => {
    window.__MOTION_TEST__ = { fruitDuration: 900, skipCountdown: true };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '用身体进入游戏' })).toBeVisible();
  await page.getByTestId('fruit-game').click();
  await expect(page.getByRole('heading', { name: '连接体感控制' })).toBeVisible();
  await page.getByRole('button', { name: '使用触控进入' }).click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: '本局得分' })).toBeVisible({ timeout: 15000 });
});

test('战斗模式可以选择英雄并显示完整触控控制', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('battle-game').click();
  await page.getByRole('button', { name: '迪迦 复合之光' }).click();
  await page.getByRole('button', { name: '进入战场' }).click();
  await page.getByRole('button', { name: '使用触控进入' }).click();
  await expect(page.getByRole('button', { name: '拳' })).toBeVisible();
  await expect(page.getByRole('button', { name: '踢' })).toBeVisible();
  await expect(page.getByRole('button', { name: '光线' })).toBeVisible();
});

test('摄像头被拒绝时保留触控入口', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
  });
  await page.goto('/');
  await page.getByTestId('fruit-game').click();
  await page.getByRole('button', { name: '开启摄像头与语音' }).click();
  await expect(page.getByText('无法访问设备。请在浏览器设置中允许摄像头与麦克风权限，或使用触控进入。')).toBeVisible();
  await expect(page.getByRole('button', { name: '使用触控进入' })).toBeVisible();
});

test('非 HTTPS 地址会明确提示 iPhone 无法申请设备权限', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  });
  await page.goto('/');
  await page.getByTestId('fruit-game').click();
  await page.getByRole('button', { name: '开启摄像头与语音' }).click();
  await expect(page.getByText('当前地址不是安全的 HTTPS 页面，iPhone 无法申请摄像头和麦克风权限。请改用电脑提供的 HTTPS 地址访问。')).toBeVisible();
  await expect(page.getByRole('button', { name: '使用触控进入' })).toBeVisible();
});
