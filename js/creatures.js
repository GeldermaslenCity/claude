'use strict';
/* Killable fauna: Needlejaws (drawn to light), Hollow Stalkers (hunt noise, hate light),
   Lantern Maws (blind ambushers that feel vibration) and harmless Lamp Jellies.
   Also the BFS flow field every hunter uses to navigate the caves toward the player. */

const CREATURE_INFO = {
  needle: { name: 'Needlejaw', size: 'SMALL BIOLOGIC', hp: 18, r: 5 },
  eel:    { name: 'Hollow Stalker', size: 'LARGE BIOLOGIC', hp: 75, r: 8 },
  maw:    { name: 'Lantern Maw', size: 'LARGE BIOLOGIC', hp: 150, r: 14 },
  jelly:  { name: 'Lamp Jelly', size: 'SMALL BIOLOGIC', hp: 8, r: 7 },
  warden: { name: 'THE WARDEN', size: 'MASSIVE' },
};

class FlowField {
  constructor(world) {
    this.w = world;
    this.dist = new Uint16Array(world.W * world.H);
    this.queue = new Int32Array(world.W * world.H);
    this.dist.fill(65535);
  }
  compute(px, py, maxD = 110) {
    const w = this.w, W = w.W, t = w.tiles, D = this.dist, q = this.queue;
    D.fill(65535);
    const sx = Math.floor(px / TILE), sy = Math.floor(py / TILE);
    if (w.solid(sx, sy)) return;
    let head = 0, tail = 0;
    const s = sy * W + sx;
    D[s] = 0; q[tail++] = s;
    while (head < tail) {
      const i = q[head++];
      const d = D[i];
      if (d >= maxD) continue;
      const x = i % W;
      if (x > 0 && t[i - 1] === 0 && D[i - 1] === 65535) { D[i - 1] = d + 1; q[tail++] = i - 1; }
      if (x < W - 1 && t[i + 1] === 0 && D[i + 1] === 65535) { D[i + 1] = d + 1; q[tail++] = i + 1; }
      if (t[i - W] === 0 && D[i - W] === 65535) { D[i - W] = d + 1; q[tail++] = i - W; }
      if (t[i + W] === 0 && D[i + W] === 65535) { D[i + W] = d + 1; q[tail++] = i + W; }
    }
  }
  at(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w.W || ty >= this.w.H) return 65535;
    return this.dist[ty * this.w.W + tx];
  }
  /** World point of the neighbouring tile that is one step closer to the player. */
  next(px, py) {
    const w = this.w, W = w.W;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 1 || ty < 1 || tx >= w.W - 1 || ty >= w.H - 1) return null;
    let best = this.dist[ty * W + tx], bx = -1, by = -1;
    if (best === 65535) return null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (dx && dy && (w.solid(tx + dx, ty) || w.solid(tx, ty + dy))) continue;
      const v = this.dist[(ty + dy) * W + tx + dx];
      if (v < best) { best = v; bx = tx + dx; by = ty + dy; }
    }
    if (bx < 0) return null;
    return { x: bx * TILE + TILE / 2, y: by * TILE + TILE / 2 };
  }
}

class Creature {
  constructor(type, x, y) {
    const info = CREATURE_INFO[type];
    this.type = type; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hp = info.hp; this.r = info.r;
    this.state = type === 'maw' ? 'idle' : type === 'eel' ? 'lurk' : 'wander';
    this.timer = 0; this.heading = Math.random() * TAU; this.stun = 0; this.cool = 0;
    this.dead = false; this.phase = Math.random() * TAU; this.flash = 0; this.lost = 0;
    this.id = ++Creature.nextId;
    this.segs = [];
    if (type === 'eel') for (let i = 0; i < 12; i++) this.segs.push({ x, y });
    if (type === 'maw') { this.ax = x; this.ay = y; this.face = 1; }
  }
}
Creature.nextId = 0;

class CreatureManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.flow = new FlowField(game.world);
    this.flowTimer = 0;
    this.spawnTimer = 1;
  }

  clear() { this.list.length = 0; }

  /* ---------- senses ---------- */
  isLit(x, y) {
    const g = this.game, sub = g.sub;
    for (const f of g.flares) if (dist2(x, y, f.x, f.y) < 150 * 150) return true;
    if (!sub.lightsActive) return false;
    const d = dist(sub.x, sub.y, x, y);
    if (d < 45) return true;
    if (d > sub.stats.lightRange) return false;
    const a = Math.atan2(y - sub.y, x - sub.x);
    if (Math.abs(angleDiff(sub.aim, a)) > sub.stats.lightCone) return false;
    return g.world.lineOfSight(sub.x, sub.y, x, y);
  }
  nearestFlare(c, maxD) {
    let best = null, bd = maxD * maxD;
    for (const f of this.game.flares) { const d = dist2(c.x, c.y, f.x, f.y); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  /* ---------- steering helpers ---------- */
  steer(c, tx, ty, speed, accel, dt) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
    c.vx += (dx / d * speed - c.vx) * Math.min(1, accel * dt);
    c.vy += (dy / d * speed - c.vy) * Math.min(1, accel * dt);
  }
  pathToward(c, tx, ty) {
    const sub = this.game.sub;
    if (tx === sub.x && ty === sub.y) {
      if (dist2(c.x, c.y, tx, ty) < 60 * 60 && this.game.world.lineOfSight(c.x, c.y, tx, ty)) return { x: tx, y: ty };
      const n = this.flow.next(c.x, c.y);
      if (n) return n;
    }
    return { x: tx, y: ty };
  }
  wander(c, speed, dt) {
    const w = this.game.world;
    c.timer -= dt;
    if (c.timer <= 0) { c.heading += rand(-1.6, 1.6); c.timer = rand(1.5, 4); }
    for (let k = 0; k < 4; k++) {
      if (!w.solidPx(c.x + Math.cos(c.heading) * 30, c.y + Math.sin(c.heading) * 30)) break;
      c.heading += 1.3;
    }
    this.steer(c, c.x + Math.cos(c.heading) * 50, c.y + Math.sin(c.heading) * 50, speed, 2, dt);
  }
  move(c, dt) {
    const w = this.game.world;
    const nx = c.x + c.vx * dt;
    if (w.solidPx(nx + Math.sign(c.vx) * c.r * 0.8, c.y)) { c.vx *= -0.4; c.heading = Math.PI - c.heading; } else c.x = nx;
    const ny = c.y + c.vy * dt;
    if (w.solidPx(c.x, ny + Math.sign(c.vy) * c.r * 0.8)) { c.vy *= -0.4; c.heading = -c.heading; } else c.y = ny;
  }
  touching(c, extra = 0) {
    const sub = this.game.sub;
    return dist(c.x, c.y, sub.x, sub.y) < sub.radius + c.r + extra;
  }

  hurt(c, amt, src) {
    if (c.dead) return;
    c.hp -= amt; c.flash = 0.15;
    if (c.type === 'needle' && c.state !== 'flee') { c.state = 'flee'; c.timer = 1.5; }
    if (c.type === 'eel' && (c.state === 'lurk' || c.state === 'hunt')) { c.state = 'retreat'; c.timer = 2; AudioSys.sfx.hiss(this.pan(c)); }
    if (c.type === 'maw' && c.state === 'idle' && dist(c.x, c.y, this.game.sub.x, this.game.sub.y) < 220) this.startLunge(c);
    if (c.hp <= 0) {
      c.dead = true;
      this.game.particles.ichor(c.x, c.y, c.type === 'maw' ? 22 : 10);
      AudioSys.sfx.creatureDie();
      if (c.type !== 'jelly') this.game.msg(CREATURE_INFO[c.type].name + ' neutralised', '');
    }
  }
  stunAll(x, y, radius, power) {
    for (const c of this.list) {
      const d = dist(x, y, c.x, c.y);
      if (d > radius) continue;
      c.stun = 3 + power;
      this.hurt(c, (c.type === 'needle' || c.type === 'jelly' ? 30 : 25) * power * (1 - d / radius * 0.5), 'shock');
      if (c.type === 'eel') c.state = 'retreat', c.timer = 5;
      if (c.type === 'maw') c.state = 'return';
    }
  }
  pan(c) { return clamp((c.x - this.game.sub.x) / 400, -1, 1); }

  /* ---------- spawning ---------- */
  spawnCheck() {
    const g = this.game, sub = g.sub, w = g.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (dist2(c.x, c.y, sub.x, sub.y) > 1900 * 1900) this.list.splice(i, 1);
    }
    const sty = sub.y / TILE;
    if (sty < SAFE_DEPTH_TILES) return;
    const z = zoneAt(Math.floor(sty));
    const want = z.spawns || {};
    for (const type in want) {
      let n = 0;
      for (const c of this.list) if (c.type === type && dist2(c.x, c.y, sub.x, sub.y) < 1500 * 1500) n++;
      if (n >= want[type]) continue;
      let p = null;
      if (type === 'maw') p = this.findMawSpot(sub);
      else p = w.randomAirNear(sub.x, sub.y, 560, 1100);
      if (!p) continue;
      if (p.y / TILE < SAFE_DEPTH_TILES + 6) continue;
      if (this.isLit(p.x, p.y)) continue;
      this.list.push(new Creature(type, p.x, p.y));
    }
  }
  findMawSpot(sub) {
    const w = this.game.world;
    for (let i = 0; i < 30; i++) {
      const p = w.randomAirNear(sub.x, sub.y, 450, 1100, 10);
      if (!p) continue;
      let ty = p.ty;
      while (ty < p.ty + 12 && !w.solid(p.tx, ty + 1)) ty++;
      if (w.solid(p.tx, ty + 1) && !w.solid(p.tx, ty) && !w.solid(p.tx, ty - 1)) return { x: p.tx * TILE + 8, y: ty * TILE + 2 };
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) { this.flow.compute(g.sub.x, g.sub.y); this.flowTimer = 0.35; }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnCheck(); this.spawnTimer = 1; }
    for (const c of this.list) {
      c.flash = Math.max(0, c.flash - dt);
      c.cool -= dt;
      c.phase += dt;
      if (c.stun > 0) { c.stun -= dt; c.vx *= 0.94; c.vy *= 0.94; this.move(c, dt); this.follow(c); continue; }
      this['update_' + c.type](c, dt);
      this.follow(c);
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].dead) this.list.splice(i, 1);
  }

  follow(c) {
    if (!c.segs.length) return;
    let px = c.x, py = c.y;
    for (const s of c.segs) {
      const dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy) || 1;
      if (d > 6) { s.x = px + dx / d * 6; s.y = py + dy / d * 6; }
      px = s.x; py = s.y;
    }
  }

  update_jelly(c, dt) {
    c.vy = Math.sin(c.phase * 0.8) * 8 - 2;
    c.vx = Math.cos(c.phase * 0.3 + c.id) * 6;
    this.move(c, dt);
  }

  update_needle(c, dt) {
    const g = this.game, sub = g.sub;
    const d = dist(c.x, c.y, sub.x, sub.y);
    const flare = this.nearestFlare(c, 340);
    switch (c.state) {
      case 'wander':
        this.wander(c, 50, dt);
        if (flare) { c.state = 'flare'; break; }
        if ((sub.lightsActive && d < sub.stats.lightRange * 1.3 && (d < 110 || this.isLit(c.x, c.y))) || d < sub.noise * 3) {
          c.state = 'attracted'; c.timer = 4;
        }
        break;
      case 'flare':
        if (!flare) { c.state = 'wander'; break; }
        this.steer(c, flare.x + Math.cos(c.phase * 3 + c.id) * 24, flare.y + Math.sin(c.phase * 3 + c.id) * 24, 90, 3, dt);
        break;
      case 'attracted': {
        if (flare) { c.state = 'flare'; break; }
        const p = this.pathToward(c, sub.x, sub.y);
        this.steer(c, p.x, p.y, 108, 3, dt);
        if (sub.lightsActive && (d < 130 || this.isLit(c.x, c.y))) c.timer = 4; else c.timer -= dt;
        if (c.timer <= 0 || d > 900) c.state = 'wander';
        if (this.touching(c, 3) && c.cool <= 0) {
          sub.damage(4, 'Torn apart by Needlejaws');
          AudioSys.sfx.bite(this.pan(c));
          g.particles.debris(c.x, c.y, [150, 130, 80], 3);
          c.cool = 1.4; c.state = 'flee'; c.timer = 1.1;
        }
        break;
      }
      case 'flee':
        this.steer(c, c.x + (c.x - sub.x), c.y + (c.y - sub.y), 120, 4, dt);
        c.timer -= dt;
        if (c.timer <= 0) c.state = 'attracted', c.timer = 3;
        break;
    }
    this.move(c, dt);
  }

  update_eel(c, dt) {
    const g = this.game, sub = g.sub;
    const d = dist(c.x, c.y, sub.x, sub.y);
    const hearR = sub.noise * 9 + 40;
    const flare = this.nearestFlare(c, 400);
    const lit = this.isLit(c.x, c.y);
    switch (c.state) {
      case 'lurk':
        this.wander(c, 32, dt);
        if (d < hearR || flare) { c.state = 'hunt'; c.lost = 0; if (d < 600) AudioSys.sfx.growl(this.pan(c), 0.6); }
        break;
      case 'hunt': {
        if (lit && !flare) { c.state = 'recoil'; c.timer = 2.2; AudioSys.sfx.hiss(this.pan(c)); break; }
        let tx = sub.x, ty = sub.y;
        if (flare) { tx = flare.x; ty = flare.y; }
        const p = this.pathToward(c, tx, ty);
        this.steer(c, p.x, p.y, 88, 2.5, dt);
        if (!flare && d < 125 && !lit && g.world.lineOfSight(c.x, c.y, sub.x, sub.y)) {
          c.state = 'strike'; c.timer = 0.7;
          const a = Math.atan2(sub.y - c.y, sub.x - c.x);
          c.vx = Math.cos(a) * 240; c.vy = Math.sin(a) * 240;
          AudioSys.sfx.growl(this.pan(c), 1);
        }
        if (d > hearR * 1.5 && d > 450) { c.lost += dt; if (c.lost > 6) c.state = 'lurk'; } else c.lost = 0;
        break;
      }
      case 'strike':
        c.timer -= dt;
        if (this.touching(c, 2)) {
          sub.damage(13, 'Bitten through by a Hollow Stalker');
          AudioSys.sfx.bite(this.pan(c));
          g.particles.debris(c.x, c.y, [150, 130, 80], 5);
          sub.vx += c.vx * 0.4; sub.vy += c.vy * 0.4;
          c.state = 'retreat'; c.timer = 2.8;
        } else if (c.timer <= 0) { c.state = 'retreat'; c.timer = 1.4; }
        break;
      case 'recoil':
      case 'retreat':
        this.steer(c, c.x + (c.x - sub.x), c.y + (c.y - sub.y), c.state === 'recoil' ? 130 : 90, 3, dt);
        c.timer -= dt;
        if (c.timer <= 0) c.state = 'hunt';
        break;
    }
    this.move(c, dt);
  }

  startLunge(c) {
    const sub = this.game.sub;
    const a = Math.atan2(sub.y - c.y, sub.x - c.x);
    c.state = 'lunge'; c.timer = 0.55;
    c.vx = Math.cos(a) * 280; c.vy = Math.sin(a) * 280;
    c.face = Math.sign(c.vx) || 1;
    AudioSys.sfx.growl(this.pan(c), 1);
  }

  update_maw(c, dt) {
    const g = this.game, sub = g.sub;
    const d = dist(c.x, c.y, sub.x, sub.y);
    switch (c.state) {
      case 'idle': {
        c.vx *= 0.9; c.vy *= 0.9;
        c.x = lerp(c.x, c.ax, dt * 2); c.y = lerp(c.y, c.ay + Math.sin(c.phase) * 2, dt * 2);
        c.face = sub.x > c.x ? 1 : -1;
        const flare = this.nearestFlare(c, 110);
        if (flare) {
          const a = Math.atan2(flare.y - c.y, flare.x - c.x);
          c.state = 'lunge'; c.timer = 0.5; c.vx = Math.cos(a) * 260; c.vy = Math.sin(a) * 260; flare.life = Math.min(flare.life, 0.3);
          break;
        }
        if (((d < 155 && sub.noise > 14) || d < 60) && g.world.lineOfSight(c.x, c.y, sub.x, sub.y)) this.startLunge(c);
        break;
      }
      case 'lunge':
        c.timer -= dt;
        if (this.touching(c, 2) && c.cool <= 0) {
          sub.damage(22, 'Swallowed by a Lantern Maw');
          AudioSys.sfx.bite(this.pan(c));
          g.particles.debris(c.x, c.y, [150, 130, 80], 6);
          c.cool = 2; c.state = 'return';
        } else if (c.timer <= 0) c.state = 'return';
        this.move(c, dt);
        break;
      case 'return':
        this.steer(c, c.ax, c.ay, 70, 2, dt);
        this.move(c, dt);
        if (dist(c.x, c.y, c.ax, c.ay) < 6) c.state = 'idle';
        break;
    }
  }

  /* ---------- rendering ---------- */
  draw(ctx, cam) {
    for (const c of this.list) {
      const sx = c.x - cam.x, sy = c.y - cam.y;
      if (sx < -120 || sy < -120 || sx > cam.w + 120 || sy > cam.h + 120) continue;
      this['draw_' + c.type](ctx, c, sx, sy, cam);
      if (c.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(sx, sy, c.r, 0, TAU); ctx.fill(); }
    }
  }
  draw_needle(ctx, c, sx, sy) {
    const a = Math.atan2(c.vy, c.vx);
    ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(a);
    ctx.fillStyle = '#8c9c98';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-3, -3); ctx.lineTo(-6, 0); ctx.lineTo(-3, 3); ctx.fill();
    const tw = Math.sin(c.phase * 20) * 2;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-10, -3 + tw); ctx.lineTo(-10, 3 + tw); ctx.fill();
    ctx.fillStyle = '#d8e8e0'; ctx.fillRect(5, -1, 4, 1); ctx.fillRect(5, 1, 3, 1);
    ctx.restore();
  }
  draw_jelly(ctx, c, sx, sy) {
    ctx.strokeStyle = 'rgba(120,200,255,0.35)'; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(sx + i * 2.5, sy + 2);
      ctx.quadraticCurveTo(sx + i * 3 + Math.sin(c.phase * 2 + i) * 3, sy + 10, sx + i * 2 + Math.sin(c.phase * 2 + i) * 4, sy + 18);
      ctx.stroke();
    }
  }
  draw_eel(ctx, c, sx, sy, cam) {
    for (let i = c.segs.length - 1; i >= 0; i--) {
      const s = c.segs[i];
      const r = 2 + (1 - i / c.segs.length) * 6;
      ctx.fillStyle = i % 2 ? '#1d2622' : '#232e29';
      ctx.beginPath(); ctx.arc(s.x - cam.x, s.y - cam.y, r, 0, TAU); ctx.fill();
      if (i % 3 === 0) { ctx.fillStyle = '#4a5a50'; ctx.fillRect(Math.round(s.x - cam.x), Math.round(s.y - cam.y - r), 1, 2); }
    }
    const a = Math.atan2(c.vy, c.vx);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
    ctx.fillStyle = '#26332d';
    ctx.beginPath(); ctx.ellipse(2, 0, 11, 7, 0, 0, TAU); ctx.fill();
    const open = c.state === 'strike' ? 5 : 1;
    ctx.fillStyle = '#0a0d0c'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(4, -open); ctx.lineTo(4, open); ctx.fill();
    ctx.fillStyle = '#c8c8b4';
    for (let i = 0; i < 3; i++) { ctx.fillRect(6 + i * 2, -open, 1, 2); ctx.fillRect(6 + i * 2, open - 2, 1, 2); }
    ctx.restore();
  }
  draw_maw(ctx, c, sx, sy) {
    ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.scale(c.face || 1, 1);
    const open = c.state === 'lunge' ? 10 : 3;
    ctx.fillStyle = '#231c20';
    ctx.beginPath(); ctx.ellipse(-2, -8, 18, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2e2429'; ctx.fillRect(-18, -12, 10, 3);
    ctx.fillStyle = '#0a0708';
    ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(18, -8 - open); ctx.lineTo(18, -8 + open); ctx.fill();
    ctx.fillStyle = '#d6d0c0';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(6 + i * 3, -8 - open * (0.3 + i * 0.15)); ctx.lineTo(7 + i * 3, -8 - open * (0.3 + i * 0.15) + 4); ctx.lineTo(8 + i * 3, -8 - open * (0.3 + i * 0.15)); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6 + i * 3, -8 + open * (0.3 + i * 0.15)); ctx.lineTo(7 + i * 3, -8 + open * (0.3 + i * 0.15) - 4); ctx.lineTo(8 + i * 3, -8 + open * (0.3 + i * 0.15)); ctx.fill();
    }
    ctx.strokeStyle = '#3a2e34'; ctx.lineWidth = 1;
    const lx = 22 + Math.sin(c.phase * 1.3) * 3, ly = -30 + Math.cos(c.phase) * 2;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(10, -36, lx, ly); ctx.stroke();
    ctx.restore();
  }

  lights(lights, cam) {
    for (const c of this.list) {
      if (c.x < cam.x - 150 || c.y < cam.y - 150 || c.x > cam.x + cam.w + 150 || c.y > cam.y + cam.h + 150) continue;
      if (c.type === 'jelly') {
        const p = 0.6 + 0.4 * Math.sin(c.phase * 2);
        lights.push({ x: c.x, y: c.y, r: 50, i: 0.35 * p, color: [110, 190, 255], glow: 0.45 * p, gr: 12, dot: 0 });
        lights.push({ x: c.x, y: c.y - 1, r: 8, i: 0, color: [170, 230, 255], glow: 0.9 * p, gr: 8 });
      } else if (c.type === 'maw') {
        const f = c.face || 1;
        const lx = c.x + f * (22 + Math.sin(c.phase * 1.3) * 3), ly = c.y - 30 + Math.cos(c.phase) * 2;
        const p = c.state === 'idle' ? 0.75 + 0.25 * Math.sin(c.phase * 2.3) : 0.3;
        lights.push({ x: lx, y: ly, r: 75, i: 0.42 * p, color: [120, 255, 200], glow: 0.7 * p, gr: 18, dot: 3 });
      } else if (c.type === 'needle') {
        const a = Math.atan2(c.vy, c.vx);
        lights.push({ x: c.x + Math.cos(a) * 3, y: c.y + Math.sin(a) * 3, r: 4, i: 0, color: [150, 255, 230], glow: 0.7, gr: 3, dot: 1 });
      } else if (c.type === 'eel' && this.isLit(c.x, c.y)) {
        lights.push({ x: c.x, y: c.y - 2, r: 5, i: 0, color: [230, 255, 200], glow: 0.9, gr: 4, dot: 1 });
      }
    }
  }
}
