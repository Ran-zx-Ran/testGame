// 切水果游戏：双手腕做刀尖，挥动切开抛物线水果，躲开炸弹
import { SceneBase } from './SceneBase.js';
import { POSE } from '../core/PoseDetector.js';

const FRUIT_TYPES = ['watermelon','apple','orange','lemon','grape','peach','kiwi','blueberry'];
const GRAVITY = 1600;          // 像素/秒²
const SLICE_VEL_THRESHOLD = 1.0; // 归一化坐标速度阈值（1/秒）
const GAME_DURATION = 60;       // 秒
const FRUIT_BASE_SCORE = 10;
const BOMB_PENALTY = 30;

export class FruitGame extends SceneBase {
  constructor(ctx) { super(ctx); }

  onReady() {
    this.state = 'ready';        // ready / playing / over
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.timeLeft = GAME_DURATION;
    this.fruits = [];            // {x,y,vx,vy,type,size,sliced,rot,vr}
    this.bombs = [];
    this.particles = [];         // 汁水粒子
    this.halves = [];            // 切开的半边
    this.trailL = [];            // 左腕轨迹 [{x,y,ts}]
    this.trailR = [];
    this.lastSpawn = 0;
    this.spawnInterval = 1.0;
    this.readyT = 3;
    this.shakeT = 0;
    this.flashT = 0;             // 切炸弹红屏
    this.showSkeleton = true;    // 默认显示骨架便于调试，玩家可关闭
    this._buildHUD();
    this._showReady();
    this.ctx.audio.startBGM('fruit');
  }

  _buildHUD() {
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="hud-chip" id="scoreChip">🍉 0</span>
        <span class="hud-chip" id="comboChip" style="display:none;">连击 x0</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="hud-chip" id="timeChip">⏱ 60</span>
        <button class="hud-chip" id="skelBtn" style="cursor:pointer;">骨架</button>
        <button class="hud-chip" id="backBtn" style="cursor:pointer;">返回</button>
      </div>
    `;
    this.uiLayer.appendChild(hud);
    this.scoreChip = hud.querySelector('#scoreChip');
    this.comboChip = hud.querySelector('#comboChip');
    this.timeChip = hud.querySelector('#timeChip');
    hud.querySelector('#skelBtn').onclick = () => { this.showSkeleton = !this.showSkeleton; };
    hud.querySelector('#backBtn').onclick = () => this.ctx.router.go('menu');
  }

  _showReady() {
    const div = document.createElement('div');
    div.className = 'overlay';
    div.id = 'readyOverlay';
    div.innerHTML = `
      <h1>🍉 切水果</h1>
      <p>双手举起，<b>挥动双臂</b>切水果<br>避开炸弹 💣，越快越准分数越高</p>
      <div id="countdown" style="font-size:64px;font-weight:900;color:#ffd76c;">3</div>
      <button class="btn btn-ghost" id="startNow">立即开始</button>
    `;
    this.uiLayer.appendChild(div);
    this.readyDiv = div;
    div.querySelector('#startNow').onclick = () => this._startPlaying();
    this._countdownStart = performance.now();
  }

  _startPlaying() {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.readyDiv?.remove();
    this.readyDiv = null;
    this.gameStartTs = performance.now();
  }

  onUpdate(dt, pose, ts) {
    if (this.state === 'ready') {
      // 倒计时
      const elapsed = (ts - this._countdownStart) / 1000;
      const remain = Math.max(0, 3 - elapsed);
      const cd = this.readyDiv?.querySelector('#countdown');
      if (cd) cd.textContent = Math.ceil(remain);
      if (remain <= 0) this._startPlaying();
      return;
    }
    if (this.state !== 'playing') return;

    // 时间
    this.timeLeft = Math.max(0, GAME_DURATION - (ts - this.gameStartTs) / 1000);
    this.timeChip.textContent = '⏱ ' + Math.ceil(this.timeLeft);
    if (this.timeLeft <= 0) { this._gameOver(); return; }

    // 难度曲线：随时间提升
    const progress = 1 - this.timeLeft / GAME_DURATION;
    this.spawnInterval = 1.1 - progress * 0.6;  // 1.1s -> 0.5s

    // 生成水果/炸弹
    if (!this.lastSpawn) this.lastSpawn = ts;
    if ((ts - this.lastSpawn) / 1000 >= this.spawnInterval) {
      this.lastSpawn = ts;
      this._spawnWave(progress);
    }

    // 双腕位置（像素）
    const lw = pose?.hasPerson ? pose.landmarks[POSE.LEFT_WRIST] : null;
    const rw = pose?.hasPerson ? pose.landmarks[POSE.RIGHT_WRIST] : null;
    const lwPx = this.poseToPx(lw);
    const rwPx = this.poseToPx(rw);
    const lwVis = lw && (lw.visibility ?? 1) > 0.3;
    const rwVis = rw && (rw.visibility ?? 1) > 0.3;

    // 更新轨迹
    if (lwVis && lwPx) {
      this.trailL.push({ x: lwPx.x, y: lwPx.y, ts });
      if (this.trailL.length > 8) this.trailL.shift();
    } else { this.trailL.length = 0; }
    if (rwVis && rwPx) {
      this.trailR.push({ x: rwPx.x, y: rwPx.y, ts });
      if (this.trailR.length > 8) this.trailR.shift();
    } else { this.trailR.length = 0; }

    // 物理更新
    const h = this._h;
    for (const f of this.fruits) {
      f.vy += GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
    }
    for (const b of this.bombs) {
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
    }
    for (const half of this.halves) {
      half.vy += GRAVITY * dt;
      half.x += half.vx * dt;
      half.y += half.vy * dt;
      half.rot += half.vr * dt;
      half.life -= dt;
    }
    for (const p of this.particles) {
      p.vy += GRAVITY * 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    // 清理掉出屏幕的
    this.fruits = this.fruits.filter(f => f.y < h + 100);
    this.bombs = this.bombs.filter(b => b.y < h + 100);
    this.halves = this.halves.filter(h => h.life > 0 && h.y < this._h + 100);
    this.particles = this.particles.filter(p => p.life > 0);

    // 切割判定：双腕速度 + 线段-圆碰撞
    if (lwVis) this._trySlice(lw, this.trailL, ts);
    if (rwVis) this._trySlice(rw, this.trailR, ts);

    // 震屏衰减
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
  }

  _trySlice(wrist, trail, ts) {
    // 用 trail 末两点计算归一化速度，超过阈值才算挥刀
    if (trail.length < 2) return;
    const a = trail[trail.length - 2], b = trail[trail.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const dtMs = b.ts - a.ts;
    if (dtMs <= 0) return;
    const normSpeed = dist / this._w * 1000 / dtMs;
    if (normSpeed < SLICE_VEL_THRESHOLD) return;

    // 线段 a->b 与水果/炸弹碰撞
    this._sliceObjects(this.fruits, a, b, false);
    this._sliceObjects(this.bombs, a, b, true);
  }

  _sliceObjects(arr, a, b, isBomb) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const o = arr[i];
      const d = this._pointSegDist(o.x, o.y, a.x, a.y, b.x, b.y);
      if (d < o.size * 0.5) {
        arr.splice(i, 1);
        if (isBomb) this._onBombHit(o);
        else this._onFruitSliced(o);
      }
    }
  }

  _pointSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx*dx + dy*dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  _onFruitSliced(f) {
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const mult = 1 + Math.min(this.combo, 10) * 0.2;
    const gain = Math.round(FRUIT_BASE_SCORE * mult);
    this.score += gain;
    this.scoreChip.textContent = '🍉 ' + this.score;
    if (this.combo >= 2) {
      this.comboChip.style.display = '';
      this.comboChip.textContent = `连击 x${this.combo}`;
    }
    this.popScore('+' + gain, f.x, f.y, '#9be15d');
    // 切开两半
    const half = this.ctx.assets.fruitHalf(f.type, f.size * 0.9);
    this.halves.push({
      x: f.x, y: f.y, vx: f.vx - 200, vy: f.vy - 100, rot: f.rot, vr: -6,
      life: 1.2, img: half, size: f.size * 0.9,
    });
    this.halves.push({
      x: f.x, y: f.y, vx: f.vx + 200, vy: f.vy - 100, rot: f.rot, vr: 6,
      life: 1.2, img: half, size: f.size * 0.9,
    });
    // 汁水粒子
    const col = this.ctx.assets.juiceColor(f.type);
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 250;
      this.particles.push({
        x: f.x, y: f.y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 100,
        life: 0.6 + Math.random() * 0.4, color: col, r: 3 + Math.random()*3,
      });
    }
    this.ctx.audio.playSlice();
  }

  _onBombHit(b) {
    this.score = Math.max(0, this.score - BOMB_PENALTY);
    this.combo = 0;
    this.comboChip.style.display = 'none';
    this.scoreChip.textContent = '🍉 ' + this.score;
    this.shakeT = 0.5;
    this.flashT = 0.5;
    this.popScore('-' + BOMB_PENALTY, b.x, b.y, '#ff5a6e');
    // 爆炸粒子
    for (let i = 0; i < 24; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * 400;
      this.particles.push({
        x: b.x, y: b.y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 0.5 + Math.random() * 0.4, color: i%2 ? '#ff7a3d' : '#ffcc44', r: 3 + Math.random()*4,
      });
    }
    this.ctx.audio.playBomb();
    this.showBanner('💥 切到炸弹！连击中断', 1200);
  }

  _spawnWave(progress) {
    // 1-3 个一组从下方抛出
    const count = 1 + Math.floor(Math.random() * (1 + progress * 2));
    const baseY = this._h + 80;
    const w = this._w;
    // 这一波是否带炸弹（难度越高越可能）
    const bombChance = 0.08 + progress * 0.18;
    const hasBomb = Math.random() < bombChance;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({ isBomb: false });
    }
    if (hasBomb) items.push({ isBomb: true });
    // 打乱
    items.sort(() => Math.random() - 0.5);
    items.forEach((it, idx) => {
      const x = w * (0.2 + Math.random() * 0.6) + (idx - count/2) * 30;
      const vy = -(1500 + Math.random() * 700 + progress * 300);
      const vx = (w/2 - x) * 0.6 + (Math.random() - 0.5) * 200;
      if (it.isBomb) {
        this.bombs.push({ x, y: baseY, vx, vy, size: 96, rot: 0, vr: (Math.random()-0.5)*4 });
      } else {
        const type = FRUIT_TYPES[Math.floor(Math.random()*FRUIT_TYPES.length)];
        this.fruits.push({ x, y: baseY, vx, vy, type, size: 90 + Math.random()*30, rot: Math.random()*Math.PI*2, vr: (Math.random()-0.5)*4 });
      }
    });
  }

  _gameOver() {
    this.state = 'over';
    const div = document.createElement('div');
    div.className = 'overlay';
    div.innerHTML = `
      <h1>游戏结束</h1>
      <p style="font-size:42px;font-weight:900;color:#ffd76c;margin:8px 0;">${this.score} 分</p>
      <p>最高连击：x${this.bestCombo}</p>
      <div class="row">
        <button class="btn btn-primary" id="again">再玩一次</button>
        <button class="btn btn-ghost" id="home">返回菜单</button>
      </div>
    `;
    this.uiLayer.appendChild(div);
    div.querySelector('#again').onclick = () => { this.ctx.router.go('fruit'); };
    div.querySelector('#home').onclick = () => this.ctx.router.go('menu');
  }

  onRenderGame(g, dt, pose, ts) {
    // 震屏偏移
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      ox = (Math.random() - 0.5) * 20 * this.shakeT;
      oy = (Math.random() - 0.5) * 20 * this.shakeT;
    }
    g.save();
    g.translate(ox, oy);

    // 水果
    for (const f of this.fruits) {
      const img = this.ctx.assets.fruit(f.type, f.size);
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.rot);
      g.drawImage(img, -f.size/2, -f.size/2, f.size, f.size);
      g.restore();
    }
    // 炸弹
    for (const b of this.bombs) {
      const img = this.ctx.assets.bomb(b.size);
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      g.drawImage(img, -b.size/2, -b.size/2, b.size, b.size);
      g.restore();
    }
    // 切开半边
    for (const half of this.halves) {
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, half.life));
      g.translate(half.x, half.y);
      g.rotate(half.rot);
      g.drawImage(half.img, -half.size/2, -half.size/2, half.size, half.size);
      g.restore();
    }
    // 粒子
    for (const p of this.particles) {
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI*2); g.fill();
      g.restore();
    }
    g.restore();

    // 双腕刀光轨迹
    this._drawTrail(g, this.trailL, ts, '#7fe7ff');
    this._drawTrail(g, this.trailR, ts, '#ff7ad0');

    // 切炸弹红屏
    if (this.flashT > 0) {
      g.fillStyle = `rgba(255,40,40,${this.flashT * 0.5})`;
      g.fillRect(0, 0, this._w, this._h);
    }
  }

  _drawTrail(g, trail, ts, color) {
    if (trail.length < 2) return;
    // 仅画最近 200ms 内的
    const cutoff = ts - 200;
    const pts = trail.filter(p => p.ts >= cutoff);
    if (pts.length < 2) return;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i-1], b = pts[i];
      const t = (b.ts - cutoff) / 200;
      g.strokeStyle = color;
      g.globalAlpha = t * 0.9;
      g.lineWidth = 4 + t * 8;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.globalAlpha = 1;
    // 刀尖光点
    const last = pts[pts.length-1];
    const grad = g.createRadialGradient(last.x, last.y, 0, last.x, last.y, 22);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(last.x, last.y, 22, 0, Math.PI*2); g.fill();
  }

  onDestroy() {
    this.readyDiv?.remove();
  }
}
