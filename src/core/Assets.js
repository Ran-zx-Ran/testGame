// 程序化素材生成：所有图像/精灵用 Canvas 现绘，无外部资源依赖
// 返回 Canvas，可直接 drawImage
export class Assets {
  constructor() {
    this.cache = new Map();
  }

  _cache(key, fn) {
    if (this.cache.has(key)) return this.cache.get(key);
    const v = fn();
    this.cache.set(key, v);
    return v;
  }

  // ===== 切水果素材 =====
  fruit(type, size = 96) {
    return this._cache('fruit_' + type + '_' + size, () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const cx = size/2, cy = size/2, r = size*0.42;
      const palette = FRUIT_PALETTES[type] || FRUIT_PALETTES.watermelon;
      // 球体渐变
      const grad = g.createRadialGradient(cx - r*0.3, cy - r*0.3, r*0.1, cx, cy, r);
      grad.addColorStop(0, palette.hi);
      grad.addColorStop(0.6, palette.mid);
      grad.addColorStop(1, palette.lo);
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();
      // 高光
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.ellipse(cx - r*0.35, cy - r*0.4, r*0.25, r*0.15, -0.6, 0, Math.PI*2); g.fill();
      // 顶部叶子（西瓜/苹果）
      if (type === 'watermelon' || type === 'apple') {
        g.fillStyle = '#3aa84a';
        g.beginPath();
        g.moveTo(cx, cy - r);
        g.quadraticCurveTo(cx + r*0.2, cy - r*1.3, cx + r*0.05, cy - r*1.1);
        g.quadraticCurveTo(cx - r*0.1, cy - r*1.2, cx - r*0.15, cy - r*1.05);
        g.closePath(); g.fill();
      }
      // 西瓜纹路
      if (type === 'watermelon') {
        g.strokeStyle = 'rgba(20,80,30,0.55)';
        g.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          g.beginPath();
          g.moveTo(cx + Math.cos(a)*r*0.3, cy + Math.sin(a)*r*0.3);
          g.lineTo(cx + Math.cos(a)*r*0.95, cy + Math.sin(a)*r*0.95);
          g.stroke();
        }
      }
      return c;
    });
  }

  // 切开后的半边（汁水效果）
  fruitHalf(type, size = 80) {
    return this._cache('fruithalf_' + type + '_' + size, () => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      const palette = FRUIT_PALETTES[type] || FRUIT_PALETTES.watermelon;
      const cx = size/2, cy = size/2, r = size*0.45;
      // 切面
      const grad = g.createRadialGradient(cx, cy, 2, cx, cy, r);
      grad.addColorStop(0, palette.flesh || '#fff');
      grad.addColorStop(0.7, palette.mid);
      grad.addColorStop(1, palette.lo);
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();
      // 外皮
      g.strokeStyle = palette.lo; g.lineWidth = 4;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.stroke();
      return c;
    });
  }

  // 炸弹
  bomb(size = 96) {
    return this._cache('bomb_' + size, () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const cx = size/2, cy = size*0.55, r = size*0.36;
      // 球体
      const grad = g.createRadialGradient(cx - r*0.4, cy - r*0.4, r*0.1, cx, cy, r);
      grad.addColorStop(0, '#5a5a6a');
      grad.addColorStop(0.7, '#1a1a22');
      grad.addColorStop(1, '#000');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();
      // 高光
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.ellipse(cx - r*0.35, cy - r*0.4, r*0.22, r*0.13, -0.6, 0, Math.PI*2); g.fill();
      // 引线
      g.strokeStyle = '#7a4a1a'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx + r*0.3, cy - r*0.85);
      g.quadraticCurveTo(cx + r*0.9, cy - r*1.3, cx + r*0.6, cy - r*1.6);
      g.stroke();
      // 火星
      g.fillStyle = '#ffcc44';
      g.beginPath(); g.arc(cx + r*0.6, cy - r*1.6, 5, 0, Math.PI*2); g.fill();
      g.fillStyle = 'rgba(255,80,0,0.6)';
      g.beginPath(); g.arc(cx + r*0.6, cy - r*1.6, 9, 0, Math.PI*2); g.fill();
      return c;
    });
  }

  // ===== 光之巨人素材（角色立绘） =====
  // 绘制玩家"光之巨人"，根据动作姿态变形（原创形象，非奥特曼）
  // 注意：因计时器颜色随时间变化，不缓存
  heroSprite(pose) {
    // pose: { armL, armR, legL, legR } 0=放下 1=举起 2=前伸
    const w = 200, h = 320;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const cx = w/2;
      // 银红配色光之巨人
      // 头
      g.fillStyle = '#d8d8e0';
      g.beginPath(); g.ellipse(cx, 50, 28, 34, 0, 0, Math.PI*2); g.fill();
      // 头部花纹（两道竖线，眼睛椭圆）
      g.fillStyle = '#c01b2c';
      g.fillRect(cx-3, 18, 6, 28);
      // 眼睛（亮黄椭圆）
      g.fillStyle = '#ffe14a';
      g.beginPath(); g.ellipse(cx-11, 50, 5, 9, -0.3, 0, Math.PI*2); g.fill();
      g.beginPath(); g.ellipse(cx+11, 50, 5, 9, 0.3, 0, Math.PI*2); g.fill();
      // 身体（红银相间）
      g.fillStyle = '#c01b2c';
      g.beginPath();
      g.moveTo(cx-32, 90); g.lineTo(cx+32, 90);
      g.lineTo(cx+24, 180); g.lineTo(cx-24, 180); g.closePath(); g.fill();
      // 银色胸甲
      g.fillStyle = '#e0e0e8';
      g.beginPath();
      g.moveTo(cx-18, 95); g.lineTo(cx+18, 95);
      g.lineTo(cx+12, 140); g.lineTo(cx, 130); g.lineTo(cx-12, 140); g.closePath(); g.fill();
      // 计时器（彩色圆形能量核心）
      const t = (Date.now()/600) % 1;
      const timerColor = t < 0.5 ? '#39d35a' : (t < 0.8 ? '#ffd23a' : '#ff4a4a');
      g.fillStyle = timerColor;
      g.beginPath(); g.arc(cx, 110, 8, 0, Math.PI*2); g.fill();
      g.strokeStyle = '#1a1a22'; g.lineWidth = 2; g.stroke();

      // 手臂
      this._drawArm(g, cx-28, 95, pose.armL, -1);
      this._drawArm(g, cx+28, 95, pose.armR, 1);
      // 腿
      this._drawLeg(g, cx-14, 180, pose.legL, -1);
      this._drawLeg(g, cx+14, 180, pose.legR, 1);

      return c;
  }

  _drawArm(g, x, y, mode, side) {
    // mode: 0=放下, 1=举起(必杀), 2=前伸(出拳)
    g.strokeStyle = '#c01b2c';
    g.lineWidth = 14; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y);
    let ex, ey, mx, my;
    if (mode === 1) {
      mx = x + side*15; my = y - 35;
      ex = x + side*25; ey = y - 70;
    } else if (mode === 2) {
      mx = x + side*30; my = y + 10;
      ex = x + side*70; ey = y - 5;
    } else {
      mx = x + side*8; my = y + 40;
      ex = x + side*12; ey = y + 80;
    }
    g.quadraticCurveTo(mx, my, ex, ey);
    g.stroke();
    // 拳头
    g.fillStyle = '#e0e0e8';
    g.beginPath(); g.arc(ex, ey, 9, 0, Math.PI*2); g.fill();
  }

  _drawLeg(g, x, y, mode, side) {
    // mode: 0=站立, 1=抬腿踢
    g.strokeStyle = '#c01b2c';
    g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y);
    let ex, ey;
    if (mode === 1) {
      g.quadraticCurveTo(x + side*10, y + 30, x + side*60, y + 10);
      g.stroke();
      ex = x + side*60; ey = y + 10;
    } else {
      g.quadraticCurveTo(x + side*4, y + 40, x + side*8, y + 80);
      g.stroke();
      ex = x + side*8; ey = y + 80;
    }
    g.fillStyle = '#d8d8e0';
    g.beginPath(); g.ellipse(ex, ey, 12, 7, 0, 0, Math.PI*2); g.fill();
  }

  // 怪兽素材（原创形象：多眼龙兽）
  monsterSprite(type = 1, size = 220) {
    return this._cache('monster_' + type + '_' + size, () => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      const cx = size/2, cy = size*0.55, r = size*0.35;
      const palette = MONSTER_PALETTES[type] || MONSTER_PALETTES[1];
      // 身体
      const grad = g.createRadialGradient(cx, cy - r*0.3, r*0.2, cx, cy, r*1.2);
      grad.addColorStop(0, palette.hi);
      grad.addColorStop(0.6, palette.mid);
      grad.addColorStop(1, palette.lo);
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(cx, cy, r, r*1.05, 0, 0, Math.PI*2); g.fill();
      // 角
      g.fillStyle = palette.lo;
      g.beginPath();
      g.moveTo(cx - r*0.6, cy - r*0.6);
      g.quadraticCurveTo(cx - r*0.9, cy - r*1.2, cx - r*0.45, cy - r*0.85);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(cx + r*0.6, cy - r*0.6);
      g.quadraticCurveTo(cx + r*0.9, cy - r*1.2, cx + r*0.45, cy - r*0.85);
      g.closePath(); g.fill();
      // 眼睛（3只）
      const eyes = [[cx-r*0.4, cy-r*0.2], [cx+r*0.4, cy-r*0.2], [cx, cy-r*0.45]];
      eyes.forEach(([ex, ey]) => {
        g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(ex, ey, 12, 14, 0, 0, Math.PI*2); g.fill();
        g.fillStyle = '#111';
        g.beginPath(); g.arc(ex, ey, 6, 0, Math.PI*2); g.fill();
        g.fillStyle = '#ff3030';
        g.beginPath(); g.arc(ex+1, ey-1, 2, 0, Math.PI*2); g.fill();
      });
      // 牙齿
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(cx, cy + r*0.25, r*0.5, r*0.15, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = palette.lo;
      for (let i = -3; i <= 3; i++) {
        const tx = cx + i * (r*0.5/4);
        g.beginPath();
        g.moveTo(tx - 3, cy + r*0.18);
        g.lineTo(tx + 3, cy + r*0.18);
        g.lineTo(tx, cy + r*0.32);
        g.closePath(); g.fill();
      }
      return c;
    });
  }

  // 必杀光线
  beamCanvas() {
    return this._cache('beam', () => {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 256;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 32, 0);
      grad.addColorStop(0, 'rgba(120,220,255,0)');
      grad.addColorStop(0.5, 'rgba(180,240,255,1)');
      grad.addColorStop(1, 'rgba(120,220,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 256);
      // 中心高亮
      g.fillStyle = '#fff';
      g.fillRect(14, 0, 4, 256);
      return c;
    });
  }

  // 水果汁液粒子（用 canvas 直接画即可，这里返回颜色表）
  juiceColor(type) {
    const p = FRUIT_PALETTES[type] || FRUIT_PALETTES.watermelon;
    return p.mid;
  }
}

const FRUIT_PALETTES = {
  watermelon: { hi:'#7ed957', mid:'#43a047', lo:'#1b5e20', flesh:'#ff5a6e' },
  apple:      { hi:'#ff8a80', mid:'#e53935', lo:'#7f0000', flesh:'#fff3e0' },
  orange:     { hi:'#ffb74d', mid:'#fb8c00', lo:'#e65100', flesh:'#ffd54f' },
  lemon:      { hi:'#fff59d', mid:'#fdd835', lo:'#f57f17', flesh:'#fffde7' },
  grape:      { hi:'#ba68c8', mid:'#8e24aa', lo:'#4a148c', flesh:'#ce93d8' },
  peach:      { hi:'#ffccbc', mid:'#ff8a65', lo:'#bf360c', flesh:'#ffe0b2' },
  kiwi:       { hi:'#aed581', mid:'#689f38', lo:'#33691e', flesh:'#dcedc8' },
  blueberry:  { hi:'#7986cb', mid:'#3949ab', lo:'#1a237e', flesh:'#c5cae9' },
};

const MONSTER_PALETTES = {
  1: { hi:'#8e24aa', mid:'#4a148c', lo:'#1a0033' },
  2: { hi:'#43a047', mid:'#1b5e20', lo:'#0a2a10' },
  3: { hi:'#e53935', mid:'#7f0000', lo:'#330000' },
  4: { hi:'#fb8c00', mid:'#e65100', lo:'#3e1d00' },
};
