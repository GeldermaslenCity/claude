'use strict';
/* THE WARDEN — a colossal serpent that cannot be killed. It roams below 925 m,
   listens for noise and light, stalks the player at the edge of vision, and strikes
   when it is certain. Flares distract it, shock pulses startle it, silence loses it. */

class Warden {
  constructor(game) {
    this.game = game;
    const P = game.world.pois;
    this.x = P.relay.x + 700; this.y = P.relay.y + 500;
    this.clampPos();
    this.heading = 0; this.speed = 0;
    this.segs = [];
    const N = 38;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      this.segs.push({ x: this.x - i * 16, y: this.y, r: lerp(30, 7, Math.pow(u, 0.8)) });
    }
    this.awareness = 0;
    this.state = 'roam';
    this.target = null;
    this.timer = 0;
    this.groanT = rand(10, 20);
    this.grindT = 0;
    this.active = false;
    this.contactCd = 0;
    this.huntTime = 0;
    this.t = 0;
  }

  clampPos() {
    const w = this.game.world;
    this.x = clamp(this.x, 60, w.pxW - 60);
    this.y = clamp(this.y, WARDEN_CEILING * TILE, w.pxH - 60);
  }

  pickRoamTarget() {
    const g = this.game, sub = g.sub, w = g.world;
    for (let i = 0; i < 20; i++) {
      let p;
      if (this.active && Math.random() < 0.6) p = w.randomAirNear(sub.x, sub.y, 500, 1500, 5);
      else p = w.randomAirNear(this.x, this.y, 400, 1600, 5);
      if (p && p.y > (WARDEN_CEILING + 8) * TILE) return p;
    }
    return { x: clamp(this.x + rand(-800, 800), 100, w.pxW - 100), y: clamp(this.y + rand(-300, 300), (WARDEN_CEILING + 10) * TILE, w.pxH - 200) };
  }

  onPing(ping) {
    if (!this.active) return;
    const d = dist(this.x, this.y, ping.x, ping.y);
    if (d < 2600) this.awareness = Math.min(100, this.awareness + 14 * (1 - d / 3200));
  }
  onLaser(dt) { this.awareness = Math.min(100, this.awareness + 25 * dt); }
  onShock(x, y) {
    if (dist(x, y, this.x, this.y) < 300) {
      this.state = 'retreat'; this.timer = 14;
      this.awareness = Math.max(0, this.awareness - 30);
      this.target = { x: this.x + (this.x - x) * 4, y: this.y + (this.y - y) * 4 };
      AudioSys.sfx.wardenGroan(1, 0);
      this.game.msg('It recoils from the discharge.', 'story');
    }
  }

  update(dt) {
    const g = this.game, sub = g.sub;
    this.t += dt;
    const subTy = sub.y / TILE;
    this.active = subTy > WARDEN_CEILING - 10;
    const d = dist(this.x, this.y, sub.x, sub.y);
    this.dist = d;
    this.contactCd -= dt;

    // ---- senses ----
    if (this.active && !g.docked) {
      const hearR = 350 + sub.noise * 16;
      if (d < hearR && sub.noise > 8) this.awareness += (sub.noise / 100) * 22 * dt * (1.2 - d / hearR);
      if (sub.lightsActive && d < 520 && g.creatures.isLit(this.x, this.y)) this.awareness += 6 * dt;
      this.awareness -= (sub.noise < 10 ? 7 : 1) * dt;
    } else {
      this.awareness -= 10 * dt;
    }
    this.awareness = clamp(this.awareness, 0, 100);

    const flare = this.findFlare();
    if (flare && (this.state === 'stalk' || this.state === 'hunt')) {
      this.state = 'distracted'; this.flare = flare;
      g.msg('Hydrophone: the large contact is turning toward the flare.', 'radio');
    }

    // ---- state machine ----
    let speed = 55, tx = this.x, ty = this.y, useFlow = false;
    switch (this.state) {
      case 'roam':
        if (!this.target || dist(this.x, this.y, this.target.x, this.target.y) < 80 || (this.timer -= dt) <= 0) { this.target = this.pickRoamTarget(); this.timer = 25; }
        tx = this.target.x; ty = this.target.y; speed = 58;
        if (this.active && this.awareness > 32) { this.state = 'stalk'; g.onWardenStalk(); }
        break;
      case 'stalk': {
        // shadow the player just beyond the reach of the floodlight
        const away = sub.lightsActive ? sub.aim + Math.PI : Math.atan2(this.y - sub.y, this.x - sub.x);
        const keep = Math.max(380, sub.stats.lightRange + 170);
        tx = sub.x + Math.cos(away) * keep; ty = sub.y + Math.sin(away) * keep * 0.7;
        speed = d > 900 ? 120 : 80; useFlow = d > 700;
        this.groanT -= dt;
        if (this.groanT <= 0) { this.groanT = rand(12, 24); this.groan(); }
        if (this.awareness > 75) { this.state = 'hunt'; this.huntTime = 0; AudioSys.sfx.wardenRoar(); g.shake(6); g.msg('Hydrophone: LARGE CONTACT ACCELERATING — BEARING ' + bearing(sub.x, sub.y, this.x, this.y) + '°', 'danger'); }
        else if (this.awareness < 15 || !this.active) this.state = 'roam';
        break;
      }
      case 'hunt':
        tx = sub.x; ty = sub.y; speed = 124; useFlow = true;
        this.huntTime += dt;
        if (d < 64 && !g.docked) this.strike();
        else if (this.awareness < 40 || !this.active) { this.state = 'stalk'; g.msg('Hydrophone: the contact has slowed. It is listening.', 'radio'); }
        else if (this.huntTime > 28) { this.state = 'stalk'; this.awareness = 50; }
        break;
      case 'distracted':
        if (!this.flare || this.flare.life <= 0 || !g.flares.includes(this.flare)) { this.state = 'stalk'; this.awareness = Math.min(this.awareness, 45); break; }
        tx = this.flare.x + Math.cos(this.t) * 60; ty = this.flare.y + Math.sin(this.t) * 40; speed = 110;
        break;
      case 'retreat':
        tx = this.target.x; ty = this.target.y; speed = 95;
        this.timer -= dt;
        if (this.timer <= 0) { this.state = 'roam'; this.target = null; }
        break;
    }
    this.speed = speed;

    // ---- steering ----
    if (useFlow && d < 1700) {
      const n = g.creatures.flow.next(this.x, this.y);
      if (n) { tx = n.x; ty = n.y; }
    }
    ty = Math.max(ty, (WARDEN_CEILING + 2) * TILE);
    const want = Math.atan2(ty - this.y, tx - this.x) + Math.sin(this.t * 1.7) * 0.35;
    const turn = angleDiff(this.heading, want);
    this.heading += clamp(turn, -1.8 * dt, 1.8 * dt);
    const inRock = g.world.solidPx(this.x, this.y);
    const sp = speed * (inRock ? 0.5 : 1);
    this.x += Math.cos(this.heading) * sp * dt;
    this.y += Math.sin(this.heading) * sp * dt;
    this.clampPos();
    if (inRock && d < 900) {
      this.grindT -= dt;
      if (this.grindT <= 0) { AudioSys.sfx.grind(); this.grindT = rand(2, 4); if (d < 500) g.shake(1.5); }
    }

    // body follows head
    let px = this.x, py = this.y;
    for (const s of this.segs) {
      const dx = s.x - px, dy = s.y - py, dd = Math.hypot(dx, dy) || 1;
      if (dd > 15) { s.x = px + dx / dd * 15; s.y = py + dy / dd * 15; }
      px = s.x; py = s.y;
    }

    // body contact crushes the sub
    if (this.active && !g.docked && this.state !== 'retreat') {
      for (let i = 2; i < this.segs.length; i += 2) {
        const s = this.segs[i];
        const dd = dist(s.x, s.y, sub.x, sub.y);
        if (dd < s.r + sub.radius) {
          const nx = (sub.x - s.x) / (dd || 1), ny = (sub.y - s.y) / (dd || 1);
          sub.vx += nx * 200 * dt; sub.vy += ny * 200 * dt;
          sub.damage(7 * dt, 'Crushed against the Warden');
          if (this.contactCd <= 0) { g.shake(4); AudioSys.sfx.collide(0.5); this.contactCd = 1; }
        }
      }
    }
  }

  findFlare() {
    let best = null, bd = 900 * 900;
    for (const f of this.game.flares) { const d = dist2(this.x, this.y, f.x, f.y); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  groan() {
    const g = this.game, sub = g.sub;
    const d = dist(this.x, this.y, sub.x, sub.y);
    AudioSys.sfx.wardenGroan(clamp(1.2 - d / 1600, 0.15, 1), clamp((this.x - sub.x) / 700, -1, 1));
    if (Math.random() < 0.7) g.msg('Hydrophone: large displacement, bearing ' + bearing(sub.x, sub.y, this.x, this.y) + '°. Range unknown.', 'radio');
  }

  strike() {
    const g = this.game, sub = g.sub;
    sub.damage(34, 'Taken by the Warden');
    const a = Math.atan2(sub.y - this.y, sub.x - this.x);
    sub.vx += Math.cos(a) * 320; sub.vy += Math.sin(a) * 320;
    g.shake(16);
    AudioSys.sfx.wardenRoar();
    AudioSys.sfx.collide(1);
    g.flashScreen(0.6);
    g.msg('SOMETHING HAS YOU — HULL BREACHED', 'danger');
    this.state = 'retreat'; this.timer = 18; this.awareness = 20;
    this.target = { x: this.x - Math.cos(a) * 1500, y: this.y - Math.sin(a) * 600 + 300 };
  }

  draw(ctx, cam) {
    if (this.x < cam.x - 800 || this.x > cam.x + cam.w + 800 || this.y < cam.y - 800 || this.y > cam.y + cam.h + 800) return;
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      const sx = s.x - cam.x, sy = s.y - cam.y;
      if (sx < -60 || sy < -60 || sx > cam.w + 60 || sy > cam.h + 60) continue;
      ctx.fillStyle = '#1a1f1d';
      ctx.beginPath(); ctx.arc(sx, sy, s.r + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = i % 2 ? '#7d877f' : '#8a948a';
      ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5d665f';
      ctx.beginPath(); ctx.arc(sx, sy - s.r * 0.3, s.r * 0.6, Math.PI, TAU); ctx.fill();
      if (i % 5 === 2) {
        const prev = this.segs[Math.max(0, i - 1)];
        const a = Math.atan2(s.y - prev.y, s.x - prev.x) + Math.PI / 2;
        ctx.fillStyle = '#4b534d';
        ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * s.r, sy + Math.sin(a) * s.r);
        ctx.lineTo(sx + Math.cos(a) * (s.r + 18), sy + Math.sin(a) * (s.r + 18));
        ctx.lineTo(sx + Math.cos(a + 0.5) * s.r, sy + Math.sin(a + 0.5) * s.r); ctx.fill();
      }
    }
    // head
    const hx = this.x - cam.x, hy = this.y - cam.y;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(this.heading);
    ctx.fillStyle = '#8f998f';
    ctx.beginPath(); ctx.moveTo(-20, -30); ctx.lineTo(46, -16); ctx.lineTo(58, 0); ctx.lineTo(46, 16); ctx.lineTo(-20, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b0d0c';
    const jaw = this.state === 'hunt' ? 10 : 3;
    ctx.beginPath(); ctx.moveTo(58, 0); ctx.lineTo(10, -jaw); ctx.lineTo(10, jaw); ctx.fill();
    ctx.fillStyle = '#6a746b';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(20 + i * 8, -14 + i * 2, 3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(20 + i * 8, 14 - i * 2, 3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  lights(lights) {
    // eyeshine only when the floodlight actually finds it
    if (!this.active) return;
    const g = this.game;
    if (!g.creatures.isLit(this.x, this.y)) return;
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const lx = 20 + i * 8, ly = side * (14 - i * 2);
        const x = this.x + Math.cos(this.heading) * lx - Math.sin(this.heading) * ly;
        const y = this.y + Math.sin(this.heading) * lx + Math.cos(this.heading) * ly;
        lights.push({ x, y, r: 6, i: 0, color: [230, 255, 220], glow: 0.9, gr: 5, dot: 2 });
      }
    }
  }
}
