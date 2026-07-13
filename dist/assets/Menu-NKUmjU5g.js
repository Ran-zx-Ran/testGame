class n{constructor(e){this.ctx=e,this.root=null}async mount(e){this.root=e;try{await this.ctx.audio.resume()}catch{}const t=document.createElement("div");t.style.cssText="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;background:radial-gradient(ellipse at top, #1a1f3a, #05060f 70%);",t.innerHTML=`
      <div class="menu-card">
        <div class="menu-title">体感小游戏</div>
        <p style="text-align:center;color:#9aa0c0;font-size:13px;margin:0;">用手机/电脑摄像头识别身体动作 · 边玩边锻炼</p>
        <div class="game-pick">
          <button class="btn btn-primary" id="goFruit">
            🍉 切水果
            <small>挥动双臂切水果，躲开炸弹。锻炼手臂与反应</small>
          </button>
          <button class="btn" id="goHero" style="background:linear-gradient(135deg,#3949ab,#c01b2c);">
            ⚡ 光之巨人打怪兽
            <small>出拳/踢腿/防御/必杀，全身运动打怪兽</small>
          </button>
        </div>
        <details style="background:rgba(255,255,255,0.05);border-radius:12px;padding:10px 14px;font-size:13px;color:#c7cbe0;">
          <summary style="cursor:pointer;font-weight:700;">玩法 & 说明</summary>
          <ul style="margin:10px 0 0;padding-left:18px;line-height:1.8;">
            <li>请用<b>前置摄像头</b>，手机立放在身前 1.5~2 米</li>
            <li>尽量让<b>全身入镜</b>（头到脚）</li>
            <li>光线充足，背景简洁效果更佳</li>
            <li>手机浏览器需 HTTPS 才能开摄像头；电脑访问请用同局域网 IP</li>
            <li>所有图形与音效均为程序化生成，无外部资源依赖</li>
          </ul>
        </details>
        <button class="btn btn-ghost" id="toggleAudio">🔊 音效：开</button>
        <p style="text-align:center;color:#6a6f8a;font-size:11px;margin:0;">© 原创角色，无版权风险 · 适合家庭锻炼</p>
      </div>
    `,e.appendChild(t),t.querySelector("#goFruit").onclick=()=>this.ctx.router.go("fruit"),t.querySelector("#goHero").onclick=()=>this.ctx.router.go("hero");const i=t.querySelector("#toggleAudio");i.onclick=()=>{const o=!this.ctx.audio.muted;this.ctx.audio.setMuted(o),i.textContent=o?"🔇 音效：关":"🔊 音效：开"}}async destroy(){}}export{n as Menu};
