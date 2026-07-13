// 光之巨人打怪兽：原创角色，全身姿态识别出拳/踢腿/防御/必杀
import { SceneBase } from './SceneBase.js';
import { POSE } from '../core/PoseDetector.js';

const PLAYER_HP = 100;
const SPECIAL_MAX = 100;
const GAME_DURATION = 90;          // 秒
const PUNCH_DMG = 18;
const KICK_DMG = 28;
const SPECIAL_DMG = 80;
const PUNCH_CD = 0.35;             // 秒
const KICK_CD = 0.7;
const PUNCH_GAIN = 8;
const KICK_GAIN = 12;
const MONSTER_ATTACK_DMG = 10;
const MONSTER_ATTACK_INTERVAL = 1.6;

export class HeroGame extends SceneBase {
  constructor(ctx) { super(ctx); }

  onReady() {
    this.state = 'ready';           // ready/playing/over
    this.hp = PLAYER_HP;
    this.special = 0;
    this.timeLeft = GAME_DURATION;
    this.monsters = [];             // {x,y,size,type,hp,maxHp,attackCD,hurtT,deadT,vx}
    this.effects = [];              // {x,y,life,type,vx,vy,r}
    this.beam = null;               // 必杀光线 {life}
    this.shakeT = 0;
    this.flashT = 0;
    this.lastSpawn = 0;
    this.spawnInterval = 3.0;
    this.playerPose = { armL: 0, armR: 0, legL: 0, legR: 0 };
    this.lastAction = 'idle';
    this.actionT = 0;
    this.specialChargeT = 0;
    this.punchCD = 0;
    this.kickCD = 0;
    this.defending = false;
    this.score = 0;
    this.kills = 0;
    this.showSkeleton = true;
    this._buildHUD();
    this._showReady();
    this.ctx.audio.startBGM('hero');
  }

  _buildHUD() {
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;">
        <span class="hud-chip" id="scoreChip">⚔ 击败 0</span>
        <span class="hud-chip" id="timeChip">⏱ 90</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="hud-chip" id="skelBtn" style="cursor:pointer;">骨架</button>
        <button class="hud-chip" id="backBtn" style="cursor:pointer;">返回</button>
      </div>
    `;
    this.uiLayer.appendChild(hud);
    this.scoreChip = hud.querySelector('#scoreChip');
    this.timeChip = hud.querySelector('#timeChip');
    hud.querySelector('#skelBtn').onclick = () => { this.showSkeleton = !this.showSkeleton; };
    hud.querySelector('#backBtn').onclick = () => this.ctx.router.go('menu');

    // 玩家状态条
    const status = document.createElement('div');
    status.style.cssText = 'position:absolute;left:14px;bottom:14px;width:46vw;min-width:160px;max-width:280px;z-index:6;';
    status.innerHTML = `
      <div style="font-size:12px;font-weight:700;margin-bottom:4px;">❤ 生命</div>
      <div style="height:14px;background:rgba(0,0,0,0.55);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.2);">
        <div id="hpBar" style="height:100%;width:100%;background:linear-gradient(90deg,#ff3d6b,#ff8a3d);transition:width .2s;"></div>
      </div>
      <div style="font-size:12px;font-weight:700;margin:8px 0 4px;">⚡ 必杀槽</div>
      <div style="height:10px;background:rgba(0,0,0,0.55);border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.2);">
        <div id="spBar" style="height:100%;width:0%;background:linear-gradient(90deg,#3dc7ff,#a06cff);transition:width .2s;"></div>
      </div>
      <div id="actionHint" style="margin-top:6px;font-size:13px;font-weight:700;color:#ffe14a;min-height:18px;"></div>
    `;
    this.uiLayer.appendChild(status);
    this.hpBar = status.querySelector('#hpBar');
    this.spBar = status.querySelector('#spBar');
    this.actionHint = status.querySelector('#actionHint');

    // 玩法提示
    const tips = document.createElement('div');
    tips.style.cssText = 'position:absolute;right:14px;bottom:14px;background:rgba(0,0,0,0.45);padding:8px 12px;border-radius:10px;font-size:11px;color:#c7cbe0;line-height:1.6;z-index:6;max-width:46vw;';
    tips.innerHTML = `👊 出拳  🦵 踢腿<br>🛡 双手交叉防御<br>🙌 双手举头蓄必杀`;
    this.uiLayer.appendChild(tips);
  }

  _showReady() {
    const div = document.createElement('div');
    div.className = 'overlay';
    div.id = 'readyOverlay';
    div.innerHTML = `
      <h1 style="background:linear-gradient(90deg,#ffd76c,#ff7ad0,#6cd0ff);-webkit-background-clip:text;background-clip:text;color:transparent;">⚡ 光之巨人</h1>
      <p>全身动作打怪兽 · 边玩边锻炼<br>出拳/踢腿攻击 · 双手交叉防御 · 双手举头蓄必杀</p>
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

  // 动作识别：返回 { action, side }
  _recognize(pose) {
    if (!pose?.hasPerson) return { action: 'idle' };
    const lm = pose.landmarks;
    const lw = lm[POSE.LEFT_WRIST], rw = lm[POSE.RIGHT_WRIST];
    const la = lm[POSE.LEFT_ANKLE], ra = lm[POSE.RIGHT_ANKLE];
    const lwV = this.ctx.pose.vel(POSE.LEFT_WRIST);
    const rwV = this.ctx.pose.vel(POSE.RIGHT_WRIST);
    const laV = this.ctx.pose.vel(POSE.LEFT_ANKLE);
    const raV = this.ctx.pose.vel(POSE.RIGHT_ANKLE);
    const vis = (p) => p && (p.visibility ?? 1) > 0.4;

    // 必杀：双腕都高于肩（y < 0.25）
    if (vis(lw) && vis(rw) && lw.y < 0.25 && rw.y < 0.25) {
      return { action: 'special' };
    }
    // 防御：双腕在胸前交叉（接近中线，y 0.3~0.6）
    if (vis(lw) && vis(rw) && Math.abs(lw.x - rw.x) < 0.1 && lw.y > 0.3 && lw.y < 0.6 && rw.y > 0.3 && rw.y < 0.6) {
      return { action: 'defend' };
    }
    // 踢腿：脚踝抬高（y < 0.55）且速度快
    if (vis(la) && la.y < 0.55 && laV.mag > 1.2) return { action: 'kick', side: 'left' };
    if (vis(ra) && ra.y < 0.55 && raV.mag > 1.2) return { action: 'kick', side: 'right' };
    // 出拳：手腕速度 > 2.0
    if (lwV.mag > 2.0) return { action: 'punch', side: 'left' };
    if (rwV.mag > 2.0) return { action: 'punch', side: 'right' };
    return { action: 'idle' };
  }

  onUpdate(dt, pose, ts) {
    if (this.state === 'ready') {
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
    if (this.timeLeft <= 0) { this._gameOver(true); return; }

    // 难度曲线
    const progress = 1 - this.timeLeft / GAME_DURATION;
    this.spawnInterval = 3.2 - progress * 2.0;  // 3.2s -> 1.2s

    // 生成怪兽
    if (!this.lastSpawn) this.lastSpawn = ts;
    if ((ts - this.lastSpawn) / 1000 >= this.spawnInterval) {
      this.lastSpawn = ts;
      this._spawnMonster(progress);
    }

    // 动作识别
    const act = this._recognize(pose);
    this._handleAction(act, dt, ts);

    // 更新立绘姿态
    this._updateSpritePose(act);

    // 冷却
    if (this.punchCD > 0) this.punchCD -= dt;
    if (this.kickCD > 0) this.kickCD -= dt;
    if (this.actionT > 0) this.actionT -= dt;
    if (this.actionT <= 0 && this.lastAction !== 'idle') {
      this.lastAction = 'idle';
      this.actionHint.textContent = '';
    }

    // 怪兽 AI
    const playerX = this._w * 0.22;  // 玩家屏幕位置
    for (const m of this.monsters) {
      if (m.deadT !== undefined) {
        m.deadT += dt;
        continue;
      }
      // 向玩家移动
      const targetX = playerX + 180;
      if (m.x > targetX) {
        m.x -= m.vx * dt;
      } else {
        // 到达攻击位置，定时攻击
        m.attackCD -= dt;
        if (m.attackCD <= 0) {
          m.attackCD = MONSTER_ATTACK_INTERVAL;
          // 玩家不防御时受伤
          const dmg = this.defending ? MONSTER_ATTACK_DMG * 0.3 : MONSTER_ATTACK_DMG;
          this.hp = Math.max(0, this.hp - dmg);
          this.hpBar.style.width = (this.hp / PLAYER_HP * 100) + '%';
          this.shakeT = 0.3;
          if (this.defending) {
            this.actionHint.textContent = '🛡 防御成功！';
          } else {
            this.actionHint.textContent = `💢 受到 ${Math.round(dmg)} 伤害`;
            this.ctx.audio.playHurt();
          }
          if (this.hp <= 0) { this._gameOver(false); return; }
        }
      }
      if (m.hurtT > 0) m.hurtT -= dt;
    }
    // 清理死亡怪兽
    this.monsters = this.monsters.filter(m => m.deadT === undefined || m.deadT < 0.8);

    // 特效
    for (const e of this.effects) {
      e.x += (e.vx || 0) * dt;
      e.y += (e.vy || 0) * dt;
      e.life -= dt;
    }
    this.effects = this.effects.filter(e => e.life > 0);

    // 必杀光线
    if (this.beam) {
      this.beam.life -= dt;
      if (this.beam.life <= 0) this.beam = null;
    }

    // 震屏衰减
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flashT > 0) this.flashT -= dt;

    this.scoreChip.textContent = '⚔ 击败 ' + this.kills;
  }

  _handleAction(act, dt, ts) {
    if (act.action === 'special') {
      this.specialChargeT += dt;
      if (this.specialChargeT >= 1.2 && this.special >= SPECIAL_MAX) {
        this._fireSpecial();
        this.specialChargeT = 0;
      } else if (this.special < SPECIAL_MAX) {
        // 蓄力时也缓慢充能
        this.special = Math.min(SPECIAL_MAX, this.special + 15 * dt);
        this.spBar.style.width = (this.special / SPECIAL_MAX * 100) + '%';
      }
      this.defending = false;
      if (this.lastAction !== 'special') {
        this.lastAction = 'special';
        this.actionT = 0.5;
        this.actionHint.textContent = this.special >= SPECIAL_MAX ? '🙌 蓄力中…' : '🙌 必杀槽未满';
      }
      return;
    }
    this.specialChargeT = 0;

    if (act.action === 'defend') {
      this.defending = true;
      if (this.lastAction !== 'defend') {
        this.lastAction = 'defend';
        this.actionT = 0.3;
        this.actionHint.textContent = '🛡 防御中';
      }
      return;
    }
    this.defending = false;

    if (act.action === 'punch' && this.punchCD <= 0) {
      this.punchCD = PUNCH_CD;
      this._doAttack(PUNCH_DMG, 'punch', act.side);
    } else if (act.action === 'kick' && this.kickCD <= 0) {
      this.kickCD = KICK_CD;
      this._doAttack(KICK_DMG, 'kick', act.side);
    }
  }

  _doAttack(dmg, type, side) {
    // 找屏幕中部偏右、最近的怪兽
    const targetX = this._w * 0.55;
    let target = null;
    let bestDist = Infinity;
    for (const m of this.monsters) {
      if (m.deadT !== undefined) continue;
      if (m.x < this._w * 0.85) {  // 在屏幕内
        const d = Math.abs(m.x - targetX);
        if (d < bestDist) { bestDist = d; target = m; }
      }
    }
    this.lastAction = type;
    this.actionT = 0.4;
    this.actionHint.textContent = type === 'punch' ? '👊 出拳！' : '🦵 踢腿！';

    if (target) {
      target.hp -= dmg;
      target.hurtT = 0.2;
      this.special = Math.min(SPECIAL_MAX, this.special + (type === 'punch' ? PUNCH_GAIN : KICK_GAIN));
      this.spBar.style.width = (this.special / SPECIAL_MAX * 100) + '%';
      this.popScore('-' + dmg, target.x, target.y - target.size/2, '#ffe14a');
      this.ctx.audio.playPunch();
      // 特效：拳头/脚攻击粒子
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        this.effects.push({
          x: target.x, y: target.y, life: 0.3,
          vx: Math.cos(ang)*200, vy: Math.sin(ang)*200, r: 4 + Math.random()*3,
          color: type === 'punch' ? '#ffe14a' : '#ff7ad0',
        });
      }
      if (target.hp <= 0) {
        target.deadT = 0;
        this.kills++;
        this.score += 100;
        this.popScore('K.O.', target.x, target.y - target.size/2, '#ff5a6e');
        this.ctx.audio.playHit();
        // 死亡爆炸
        for (let i = 0; i < 18; i++) {
          const ang = Math.random() * Math.PI * 2;
          this.effects.push({
            x: target.x, y: target.y, life: 0.6,
            vx: Math.cos(ang)*(150+Math.random()*200), vy: Math.sin(ang)*(150+Math.random()*200) - 100,
            r: 4 + Math.random()*4,
            color: i%2 ? '#ff7a3d' : '#ffe14a',
          });
        }
      }
    } else {
      this.ctx.audio.playPunch();
    }
  }

  _fireSpecial() {
    this.special = 0;
    this.spBar.style.width = '0%';
    this.beam = { life: 1.2 };
    this.flashT = 0.6;
    this.lastAction = 'special';
    this.actionT = 1.2;
    this.actionHint.textContent = '💥 必杀·光之光线！';
    this.ctx.audio.playSpecial();
    // 对所有屏幕内怪兽造成大量伤害
    for (const m of this.monsters) {
      if (m.deadT !== undefined) continue;
      m.hp -= SPECIAL_DMG;
      m.hurtT = 0.3;
      if (m.hp <= 0) {
        m.deadT = 0;
        this.kills++;
        this.score += 150;
      }
    }
  }

  _updateSpritePose(act) {
    // 0=放下 1=举起 2=前伸
    if (act.action === 'punch') {
      this.playerPose.armL = act.side === 'left' ? 2 : 0;
      this.playerPose.armR = act.side === 'right' ? 2 : 0;
      this.playerPose.legL = 0; this.playerPose.legR = 0;
    } else if (act.action === 'kick') {
      this.playerPose.armL = 0; this.playerPose.armR = 0;
      this.playerPose.legL = act.side === 'left' ? 1 : 0;
      this.playerPose.legR = act.side === 'right' ? 1 : 0;
    } else if (act.action === 'defend') {
      this.playerPose.armL = 2; this.playerPose.armR = 2;
      this.playerPose.legL = 0; this.playerPose.legR = 0;
    } else if (act.action === 'special') {
      this.playerPose.armL = 1; this.playerPose.armR = 1;
      this.playerPose.legL = 0; this.playerPose.legR = 0;
    } else {
      this.playerPose.armL = 0; this.playerPose.armR = 0;
      this.playerPose.legL = 0; this.playerPose.legR = 0;
    }
  }

  _spawnMonster(progress) {
    const type = 1 + Math.floor(Math.random() * 4);
    const size = 180 + progress * 60 + Math.random() * 40;
    const maxHp = 60 + progress * 80 + (type === 3 ? 40 : 0);
    this.monsters.push({
      x: this._w + size/2,
      y: this._h * 0.55,
      vx: 60 + progress * 50,
      size, type,
      hp: maxHp, maxHp,
      attackCD: MONSTER_ATTACK_INTERVAL,
      hurtT: 0,
    });
  }

  _gameOver(win) {
    this.state = 'over';
    const div = document.createElement('div');
    div.className = 'overlay';
    div.innerHTML = `
      <h1 style="color:${win ? '#ffd76c' : '#ff6b6b'}">${win ? '胜利！' : '战败'}</h1>
      <p style="font-size:24px;font-weight:700;">击败怪兽：${this.kills}</p>
      <p>得分：${this.score}</p>
      <p style="color:#9be15d;">运动强度：${this._exerciseIntensity()}</p>
      <div class="row">
        <button class="btn btn-primary" id="again">再战一次</button>
        <button class="btn btn-ghost" id="home">返回菜单</button>
      </div>
    `;
    this.uiLayer.appendChild(div);
    div.querySelector('#again').onclick = () => this.ctx.router.go('hero');
    div.querySelector('#home').onclick = () => this.ctx.router.go('menu');
  }

  _exerciseIntensity() {
    // 简单估算：基于击杀数
    if (this.kills >= 12) return '🔥 高强度（约 250+ 千卡/小时）';
    if (this.kills >= 6) return '💪 中强度（约 150 千卡/小时）';
    return '🚶 轻度热身';
  }

  onRenderGame(g, dt, pose, ts) {
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      ox = (Math.random() - 0.5) * 16 * this.shakeT;
      oy = (Math.random() - 0.5) * 16 * this.shakeT;
    }
    g.save();
    g.translate(ox, oy);

    // 地面阴影
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, this._h * 0.78, this._w, this._h * 0.22);

    // 玩家立绘（左下）
    const heroImg = this.ctx.assets.heroSprite(this.playerPose);
    const heroW = 200, heroH = 320;
    const heroX = this._w * 0.22 - heroW/2;
    const heroY = this._h * 0.78 - heroH + 20;
    g.drawImage(heroImg, heroX, heroY, heroW, heroH);
    // 玩家受击发光
    if (this.defending) {
      g.strokeStyle = 'rgba(120,220,255,0.8)';
      g.lineWidth = 4;
      g.beginPath(); g.ellipse(heroX + heroW/2, heroY + heroH*0.6, heroW*0.7, heroH*0.55, 0, 0, Math.PI*2); g.stroke();
    }

    // 怪兽
    for (const m of this.monsters) {
      const img = this.ctx.assets.monsterSprite(m.type, m.size);
      let alpha = 1;
      if (m.deadT !== undefined) {
        alpha = Math.max(0, 1 - m.deadT / 0.8);
      }
      g.save();
      g.globalAlpha = alpha;
      const dx = m.hurtT > 0 ? (Math.random() - 0.5) * 12 : 0;
      g.drawImage(img, m.x - m.size/2 + dx, m.y - m.size/2, m.size, m.size);
      g.restore();
      // 血条
      if (m.deadT === undefined && m.hp < m.maxHp) {
        const bw = m.size * 0.8;
        const bx = m.x - bw/2, by = m.y - m.size/2 - 14;
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(bx, by, bw, 6);
        g.fillStyle = '#ff5a6e';
        g.fillRect(bx, by, bw * (m.hp / m.maxHp), 6);
      }
    }

    // 必杀光线（从玩家中心射向右侧）
    if (this.beam) {
      const beamImg = this.ctx.assets.beamCanvas();
      const bx = this._w * 0.22 + 80;
      const by = this._h * 0.55;
      const w = this._w - bx;
      const beamH = 60 * (this.beam.life / 1.2);
      g.save();
      g.globalAlpha = this.beam.life;
      // 拉伸光线
      g.drawImage(beamImg, 0, 0, 32, 256, bx, by - beamH/2, w, beamH);
      // 中心强光
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(bx, by - 4, w, 8);
      g.restore();
    }

    // 特效粒子
    for (const e of this.effects) {
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, e.life * 3));
      g.fillStyle = e.color;
      g.beginPath(); g.arc(e.x, e.y, e.r, 0, Math.PI*2); g.fill();
      g.restore();
    }

    g.restore();

    // 必杀白屏
    if (this.flashT > 0) {
      g.fillStyle = `rgba(180,240,255,${this.flashT * 0.5})`;
      g.fillRect(0, 0, this._w, this._h);
    }
  }

  onDestroy() {
    this.readyDiv?.remove();
  }
}
