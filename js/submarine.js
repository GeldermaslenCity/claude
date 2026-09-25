'use strict';
/* The player's mining submarine: movement, collisions, vitals, noise, laser. */

const SUB_CIRCLES = [[-12, 0, 7], [0, 0, 8.5], [12, 0, 7]];

class Submarine {
  constructor(game) {
    this.game = game;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.aim = 0; this.facing = 1; this.tilt = 0;
    this.radius = 14;
    this.stats = null;
    this.hull = 100; this.oxygen = 100; this.battery = 100; this.fuel = 100;
    this.cargo = {};
    this.lightsOn = true;
    this.silent = false;
    this.noise = 0;
    this.flares = 3;
    this.shockCd = 0;
    this.thrust01 = 0;
    this.propPhase = 0;
    this.hurt = 0;
    this.flicker = 0;
    this.laser = { on: false, hit: false, x: 0, y: 0, ox: 0, oy: 0, warnT: 0 };
    this.warnT = { hull: 0, oxygen: 0, battery: 0, fuel: 0, pressure: 0 };
    this.creakT = 3;
    this.lastCause = 'Hull failure';
    this.moved = 0;
  }

  applyUpgrades(up) {
    const s = {};
    for (const k of UPGRADE_ORDER) Object.assign(s, UPGRADES[k].levels[up[k] || 0]);
    this.stats = s;
    this.hull = Math.min(this.hull, s.maxHull);
    this.oxygen = Math.min(this.oxygen, s.maxOxygen);
    this.battery = Math.min(this.battery, s.maxBattery);
    this.fuel = Math.min(this.fuel, s.maxFuel);
  }

  refillFree() {
    this.oxygen = this.stats.maxOxygen;
    this.battery = this.stats.maxBattery;
  }

  get lightsActive() { return this.lightsOn && this.battery > 0 && this.flicker <= 0; }
  cargoUsed() { let n = 0; for (const k in this.cargo) n += this.cargo[k]; return n; }
  cargoFree() { return this.stats.cargoMax - this.cargoUsed(); }
  cargoValue() { let v = 0; for (const k in this.cargo) v += this.cargo[k] * RESOURCES[k].price; return v; }
  speed() { return Math.hypot(this.vx, this.vy); }
  depthM() { return this.game.world.depthM(this.y); }

  addNoise(v) { this.noise = Math.min(100, this.noise + v * this.stats.noiseMult); }

  damage(amount, cause) {
    if (this.game.docked || amount <= 0) return;
    this.hull = Math.max(0, this.hull - amount);
    this.lastCause = cause;
    this.hurt = Math.min(1, this.hurt + amount / 25);
    this.game.shake(Math.min(12, 2 + amount * 0.4));
    this.addNoise(amount * 0.6);
  }

  update(dt) {
    const g = this.game, st = this.stats, w = g.world;
    // ---- aim ----
    const m = g.mouseWorld();
    this.aim = Math.atan2(m.y - this.y, m.x - this.x);
    const wantFace = Math.cos(this.aim) >= 0 ? 1 : -1;
    this.facing = wantFace;

    // ---- propulsion ----
    let ix = 0, iy = 0;
    if (Input.anyDown('KeyD', 'ArrowRight')) ix += 1;
    if (Input.anyDown('KeyA', 'ArrowLeft')) ix -= 1;
    if (Input.anyDown('KeyS', 'ArrowDown')) iy += 1;
    if (Input.anyDown('KeyW', 'ArrowUp')) iy -= 1;
    const len = Math.hypot(ix, iy);
    if (len > 0) { ix /= len; iy /= len; }
    this.silent = Input.anyDown('ShiftLeft', 'ShiftRight');
    let a = st.thrust;
    let mode = 'fuel';
    if (this.fuel <= 0) mode = this.battery > 0 ? 'battery' : 'none';
    if (mode === 'battery') a *= 0.45; else if (mode === 'none') a *= 0.2;
    if (this.silent) a *= 0.45;
    if (len > 0) {
      if (mode === 'fuel') this.fuel = Math.max(0, this.fuel - st.fuelUse * dt * (this.silent ? 0.5 : 1));
      else if (mode === 'battery') this.battery = Math.max(0, this.battery - 0.6 * dt);
    }
    this.propMode = mode;
    const k = st.thrust / st.maxSpeed;
    this.vx += (ix * a - this.vx * k) * dt;
    this.vy += (iy * a - this.vy * k) * dt;
    this.thrust01 = len > 0 ? a / st.thrust : 0;
    this.propPhase += dt * (4 + this.thrust01 * 30);
    this.tilt = lerp(this.tilt, clamp(this.vy * 0.0025, -0.3, 0.3), Math.min(1, dt * 5));

    // ---- move with collision (sub-stepped) ----
    const sp = this.speed();
    const steps = Math.max(1, Math.ceil(sp * dt / 4));
    let impact = 0;
    const px0 = this.x, py0 = this.y;
    for (let s = 0; s < steps; s++) {
      this.x += this.vx * dt / steps;
      this.y += this.vy * dt / steps;
      impact = Math.max(impact, this.collide());
    }
    if (w.solidPx(this.x, this.y)) { this.x = px0; this.y = py0; this.vx *= -0.3; this.vy *= -0.3; }
    this.moved += Math.hypot(this.x - px0, this.y - py0);
    if (impact > 55) {
      const dmg = (impact - 55) * 0.17;
      this.damage(dmg, 'Structural collapse after impact');
      AudioSys.sfx.collide(impact / 150);
      g.particles.silt(this.x + this.facing * 16, this.y, 10);
      g.particles.debris(this.x, this.y, [140, 120, 70], 4);
      this.addNoise(impact * 0.3);
      if (dmg > 4) g.msg('Hull impact — ' + Math.round(dmg) + ' damage', 'danger');
    } else if (impact > 22) {
      g.particles.silt(this.x, this.y + 6, 3);
      AudioSys.sfx.collide(0.15);
      this.addNoise(6);
    }

    if (this.thrust01 > 0 && Math.random() < dt * (6 + this.thrust01 * 20)) {
      g.particles.bubbles(this.x - this.facing * 26, this.y, 1, 2);
    }

    // ---- consumption ----
    this.oxygen = Math.max(0, this.oxygen - 0.33 * dt);
    let drain = 0.04;
    if (this.lightsOn && this.flicker <= 0) drain += st.lightDrain;
    this.battery = Math.max(0, this.battery - drain * dt);
    if (this.oxygen <= 0) {
      this.hull -= 3.5 * dt;
      this.lastCause = 'Asphyxiation — oxygen reserves exhausted';
      if (this.warnT.oxygen <= 0) { g.msg('OXYGEN DEPLETED — crew failing', 'danger'); this.warnT.oxygen = 4; AudioSys.sfx.alarm(); }
    }
    this.flicker = Math.max(0, this.flicker - dt);
    this.shockCd = Math.max(0, this.shockCd - dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.5);

    // ---- pressure ----
    const depth = this.depthM();
    const over = depth - st.depth;
    if (over > 0) {
      this.hull -= (1.5 + over / 35) * dt;
      this.lastCause = 'Crushed by pressure at ' + Math.round(depth) + ' m';
      this.creakT -= dt * 2.5;
      if (this.warnT.pressure <= 0) { g.msg('HULL STRESS — beyond crush depth. Ascend!', 'danger'); this.warnT.pressure = 5; AudioSys.sfx.alarm(); }
      if (Math.random() < dt * 3) g.shake(2);
    } else if (over > -120) {
      this.creakT -= dt;
    }
    if (this.creakT <= 0) { AudioSys.sfx.creak(); this.creakT = rand(4, 9); }

    // ---- warnings ----
    for (const key in this.warnT) this.warnT[key] -= dt;
    if (this.hull / st.maxHull < 0.25 && this.warnT.hull <= 0) { g.msg('HULL INTEGRITY CRITICAL', 'danger'); AudioSys.sfx.alarm(); this.warnT.hull = 8; }
    if (this.oxygen / st.maxOxygen < 0.2 && this.oxygen > 0 && this.warnT.oxygen <= 0) { g.msg('Oxygen low — return to station', 'warn'); AudioSys.sfx.alarm(); this.warnT.oxygen = 12; }
    if (this.battery <= 0 && this.warnT.battery <= 0) { g.msg('Battery depleted — lights, sonar and laser offline', 'danger'); this.warnT.battery = 15; }
    if (this.fuel <= 0 && this.warnT.fuel <= 0) { g.msg('Fuel exhausted — emergency battery propulsion', 'warn'); this.warnT.fuel = 15; }

    // ---- noise ----
    const target = (sp / st.maxSpeed) * 22 * (this.silent ? 0.3 : 1) * st.noiseMult;
    this.noise = Math.max(target, this.noise - 14 * dt);

    this.updateLaser(dt);
  }

  collide() {
    const w = this.game.world;
    let impact = 0;
    for (const [ox, oy, r] of SUB_CIRCLES) {
      let cx = this.x + ox, cy = this.y + oy;
      const tx0 = Math.floor((cx - r) / TILE), tx1 = Math.floor((cx + r) / TILE);
      const ty0 = Math.floor((cy - r) / TILE), ty1 = Math.floor((cy + r) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!w.solid(tx, ty)) continue;
        const nx = clamp(cx, tx * TILE, tx * TILE + TILE), ny = clamp(cy, ty * TILE, ty * TILE + TILE);
        let dx = cx - nx, dy = cy - ny;
        const d = Math.hypot(dx, dy);
        if (d >= r || d < 0.0001) continue;
        dx /= d; dy /= d;
        const pen = r - d;
        this.x += dx * pen; this.y += dy * pen; cx += dx * pen; cy += dy * pen;
        const vn = this.vx * dx + this.vy * dy;
        if (vn < 0) {
          impact = Math.max(impact, -vn);
          this.vx -= vn * dx * 1.3; this.vy -= vn * dy * 1.3;
        }
      }
    }
    return impact;
  }

  laserOrigin() {
    return { x: this.x + this.facing * 5, y: this.y + 9 };
  }

  updateLaser(dt) {
    const g = this.game, st = this.stats, L = this.laser;
    L.on = Input.mouse.left && !g.docked && this.battery > 0 && g.state === 'play';
    L.hit = false; L.target = null;
    L.warnT -= dt;
    if (!L.on) return;
    this.battery = Math.max(0, this.battery - 1.4 * dt);
    const o = this.laserOrigin();
    L.ox = o.x; L.oy = o.y;
    const dx = Math.cos(this.aim), dy = Math.sin(this.aim);
    const h = g.world.raycast(o.x, o.y, dx, dy, st.laserRange);
    let endD = h.dist;
    // creatures in the beam?
    let victim = null;
    for (const c of g.creatures.list) {
      const t = rayCircle(o.x, o.y, dx, dy, c.x, c.y, c.r + 2);
      if (t >= 0 && t < endD) { endD = t; victim = c; }
    }
    const wd = g.warden;
    let wardenHit = false;
    if (wd && wd.active) {
      for (let i = 0; i < wd.segs.length; i += 2) {
        const s = wd.segs[i];
        const t = rayCircle(o.x, o.y, dx, dy, s.x, s.y, s.r);
        if (t >= 0 && t < endD) { endD = t; victim = null; wardenHit = true; }
      }
    }
    L.x = o.x + dx * endD; L.y = o.y + dy * endD;
    this.noise = Math.max(this.noise, 12 * st.noiseMult);
    if (wardenHit) {
      L.hit = true;
      if (L.warnT <= 0) { g.msg('The beam scatters across its hide. It does not notice. Yet.', 'story'); L.warnT = 6; }
      wd.onLaser(dt);
      if (Math.random() < dt * 20) g.particles.sparks(L.x, L.y, [255, 230, 200], 2);
      return;
    }
    if (victim) {
      L.hit = true;
      g.creatures.hurt(victim, (22 + 12 * st.laserPower) * dt, 'laser');
      if (Math.random() < dt * 25) g.particles.sparks(L.x, L.y, [255, 200, 160], 2);
      return;
    }
    if (!h.hit || endD >= st.laserRange) return;
    L.hit = true;
    if (Math.random() < dt * 30) g.particles.sparks(L.x, L.y, [255, 220, 160], 2, 60);
    if (Math.random() < dt * 8) AudioSys.sfx.crackle();
    const dep = g.world.depositAtTile(h.tx, h.ty);
    if (!dep) return;
    const R = RESOURCES[dep.type];
    L.target = dep;
    this.noise = Math.max(this.noise, 30 * st.noiseMult);
    if (st.laserPower < R.hardness) {
      if (L.warnT <= 0) { g.msg(`${R.name} is too hard — requires Mining Laser Mk ${['I', 'II', 'III'][R.hardness - 1]}`, 'warn'); L.warnT = 3; }
      return;
    }
    if (this.cargoFree() <= 0) {
      if (L.warnT <= 0) { g.msg('Cargo hold full — return to Anchor Station', 'warn'); L.warnT = 3; AudioSys.sfx.error(); }
      return;
    }
    dep.progress += (st.laserRate * dt) / R.time;
    if (Math.random() < dt * 12) g.particles.debris(L.x, L.y, R.color, 1, 40);
    if (dep.progress >= 1) {
      dep.progress = 0;
      dep.amount--;
      this.cargo[dep.type] = (this.cargo[dep.type] || 0) + 1;
      g.onMined(dep);
      AudioSys.sfx.collect();
      for (let i = 0; i < 3; i++) g.particles.chunk(L.x, L.y, R.light, this);
      if (dep.amount <= 0) {
        g.particles.debris(L.x, L.y, R.color, 8, 60);
        g.msg(`${R.name} deposit depleted`, '');
      }
    }
  }

  lights(lights) {
    const col = [255, 236, 190];
    lights.push({ x: this.x, y: this.y, r: this.lightsActive ? 60 : 34, i: this.lightsActive ? 0.55 : 0.3 });
    if (this.lightsActive) {
      const ox = this.x + Math.cos(this.aim) * 14, oy = this.y + Math.sin(this.aim) * 4;
      const poly = Lighting.cone(this.game.world, ox, oy, this.aim, this.stats.lightCone, this.stats.lightRange, 60);
      lights.push({ x: ox, y: oy, r: this.stats.lightRange, i: 0.98, poly, color: col, glow: 0.14 });
    }
    // window glow
    const wx = this.x + this.facing * 13, wy = this.y - 1;
    lights.push({ x: wx, y: wy, r: 14, i: 0, color: [255, 200, 120], glow: 0.5, dot: 2 });
    if (this.laser.on) {
      lights.push({ x: this.laser.x, y: this.laser.y, r: 46, i: 0.5, color: [255, 120, 90], glow: 0.5, dot: 3 });
    }
  }

  draw(ctx, cam) {
    const sx = Math.round(this.x - cam.x), sy = Math.round(this.y - cam.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(this.facing, 1);
    ctx.rotate(this.tilt);
    // propeller
    ctx.fillStyle = '#3a3a36'; ctx.fillRect(-27, -2, 5, 4);
    const ph = Math.abs(Math.sin(this.propPhase));
    ctx.fillStyle = '#8f8a74'; ctx.fillRect(-30, Math.round(-7 * ph), 2, Math.max(1, Math.round(14 * ph)));
    // fins
    ctx.fillStyle = '#7a6230';
    ctx.beginPath(); ctx.moveTo(-18, -5); ctx.lineTo(-27, -11); ctx.lineTo(-24, -4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-18, 5); ctx.lineTo(-27, 11); ctx.lineTo(-24, 4); ctx.fill();
    // hull
    ctx.fillStyle = '#b08b3a';
    ctx.beginPath(); ctx.ellipse(0, 0, 23, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7c632c'; ctx.fillRect(-19, 3, 38, 4);
    ctx.fillStyle = '#d6b462'; ctx.fillRect(-15, -8, 25, 2);
    // sail
    ctx.fillStyle = '#9a7834'; ctx.fillRect(-7, -15, 13, 7);
    ctx.fillStyle = '#d6b462'; ctx.fillRect(-7, -15, 13, 1);
    ctx.fillStyle = '#50462a'; ctx.fillRect(-3, -19, 1, 4);
    // viewport
    ctx.fillStyle = '#132a2c'; ctx.beginPath(); ctx.arc(13, -1, 4.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e6c888'; ctx.fillRect(12, -3, 2, 2);
    // lamp + hazard stripes
    ctx.fillStyle = '#d8d8cc'; ctx.fillRect(21, -2, 3, 4);
    ctx.fillStyle = '#2a2418';
    for (let i = 0; i < 3; i++) ctx.fillRect(-14 + i * 5, 4, 2, 2);
    // damage
    const dmg = 1 - this.hull / this.stats.maxHull;
    if (dmg > 0.35) {
      ctx.strokeStyle = 'rgba(30,20,10,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-2, -1); ctx.lineTo(-5, 3); ctx.stroke();
      if (dmg > 0.6) { ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(9, -2); ctx.stroke(); }
    }
    if (this.hurt > 0) { ctx.fillStyle = `rgba(255,60,40,${this.hurt * 0.5})`; ctx.beginPath(); ctx.ellipse(0, 0, 23, 9, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    // laser turret (world-oriented)
    const o = this.laserOrigin();
    ctx.strokeStyle = '#5a5a52'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(o.x - cam.x, o.y - cam.y - 2); ctx.lineTo(o.x - cam.x + Math.cos(this.aim) * 7, o.y - cam.y + Math.sin(this.aim) * 7); ctx.stroke();
    ctx.lineWidth = 1;
    if (Math.random() < 0.2 && dmg > 0.7) this.game.particles.sparks(this.x + rand(-10, 10), this.y + rand(-5, 5), [255, 200, 120], 1, 40);
  }

  drawBeam(ctx, cam) {
    if (!this.laser.on) return;
    const L = this.laser;
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.75 + Math.random() * 0.25;
    ctx.strokeStyle = `rgba(255,90,70,${0.35 * flick})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(L.ox - cam.x, L.oy - cam.y); ctx.lineTo(L.x - cam.x, L.y - cam.y); ctx.stroke();
    ctx.strokeStyle = `rgba(255,230,210,${0.9 * flick})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.ox - cam.x, L.oy - cam.y); ctx.lineTo(L.x - cam.x, L.y - cam.y); ctx.stroke();
    if (L.target) {
      const p = L.target.progress;
      ctx.strokeStyle = 'rgba(255,220,140,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(L.target.x - cam.x, L.target.y - cam.y, 11, -Math.PI / 2, -Math.PI / 2 + p * TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
