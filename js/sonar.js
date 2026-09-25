'use strict';
/* Active sonar: an expanding ping that outlines cave walls, reveals the map and
   produces contacts — some of which are never there when you look. */

class Sonar {
  constructor(game) {
    this.game = game;
    this.pings = [];
    this.echoes = [];
    this.contacts = [];
    this.sweep = 0;
    this.cooldown = 0;
  }

  ping() {
    const g = this.game, sub = g.sub, st = sub.stats;
    if (this.cooldown > 0) return false;
    if (sub.battery < st.sonarCost) { g.msg('Sonar: insufficient battery.', 'warn'); AudioSys.sfx.error(); return false; }
    sub.battery -= st.sonarCost;
    sub.addNoise(28);
    this.cooldown = 1.1;
    const range = st.sonarRange;
    const ping = { x: sub.x, y: sub.y, r: 0, max: range, hits: [], hitIdx: 0, contacts: [], cIdx: 0 };
    const rays = 220;
    const w = g.world;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      const dx = Math.cos(a), dy = Math.sin(a);
      const h = w.raycast(sub.x, sub.y, dx, dy, range);
      for (let d = 0; d < h.dist; d += TILE * 0.8) w.reveal(Math.floor((sub.x + dx * d) / TILE), Math.floor((sub.y + dy * d) / TILE));
      if (h.hit) {
        w.reveal(h.tx, h.ty);
        ping.hits.push({ x: h.x, y: h.y, d: h.dist, tx: h.tx, ty: h.ty });
      }
    }
    // reveal the solid shell around every hit so the map shows proper walls
    for (const hp of ping.hits) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) w.reveal(hp.tx + ox, hp.ty + oy);
    ping.hits.sort((a, b) => a.d - b.d);

    // contacts: real creatures in range
    for (const c of g.creatures.list) {
      const d = dist(sub.x, sub.y, c.x, c.y);
      if (d < range && d > 20) ping.contacts.push({ x: c.x, y: c.y, d, info: CREATURE_INFO[c.type], ghost: false, ref: c });
    }
    const wd = g.warden;
    if (wd && wd.active) {
      const d = dist(sub.x, sub.y, wd.x, wd.y);
      if (d < range * 1.6) ping.contacts.push({ x: wd.x, y: wd.y, d: Math.min(d, range), info: CREATURE_INFO.warden, ghost: false, ref: wd, big: true });
    }
    // ghost contacts — more likely deeper, fewer with better classifiers
    const depth01 = clamp(sub.y / w.pxH, 0, 1);
    const ghostChance = (0.12 + depth01 * 0.45) * (st.sonarLevel >= 2 ? 0.5 : 1);
    if (sub.y > SAFE_DEPTH_TILES * TILE && Math.random() < ghostChance) {
      const p = w.randomAirNear(sub.x, sub.y, range * 0.45, range * 0.95);
      if (p) {
        const big = Math.random() < 0.35 + depth01 * 0.3;
        ping.contacts.push({ x: p.x, y: p.y, d: dist(sub.x, sub.y, p.x, p.y), info: { name: '???', size: big ? 'MASSIVE' : 'UNKNOWN' }, ghost: true, big });
      }
    }
    ping.contacts.sort((a, b) => a.d - b.d);
    this.pings.push(ping);
    AudioSys.sfx.ping();
    g.onSonarPing(ping);
    return true;
  }

  /** A contact that appears without a ping (passive hydrophone transient). */
  transient(x, y, big) {
    this.contacts.push({ x, y, life: 1.6, max: 1.6, info: { name: '???', size: big ? 'MASSIVE' : 'TRANSIENT' }, ghost: true, big, label: 'TRANSIENT' });
    AudioSys.sfx.blip();
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sweep = (this.sweep + dt * 1.6) % TAU;
    const lvl = this.game.sub.stats.sonarLevel;
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.r += 620 * dt;
      while (p.hitIdx < p.hits.length && p.hits[p.hitIdx].d <= p.r) {
        const h = p.hits[p.hitIdx++];
        this.echoes.push({ x: h.x, y: h.y, life: 2.6, max: 2.6 });
      }
      while (p.cIdx < p.contacts.length && p.contacts[p.cIdx].d <= p.r) {
        const c = p.contacts[p.cIdx++];
        let label = 'CONTACT';
        if (lvl >= 2 && !c.ghost) label = c.info.name.toUpperCase();
        else if (lvl >= 1) label = c.info.size;
        if (c.ghost && lvl >= 1) label = c.info.size;
        // ghosts vanish quickly — before you can identify them
        const life = c.ghost ? rand(0.7, 1.6) : 4;
        this.contacts.push({ x: c.x, y: c.y, life, max: life, info: c.info, ghost: c.ghost, big: c.big, label });
        AudioSys.sfx.blip();
        if (c.big) this.game.onBigContact(c);
      }
      if (p.r >= p.max && p.hitIdx >= p.hits.length) this.pings.splice(i, 1);
    }
    for (let i = this.echoes.length - 1; i >= 0; i--) { const e = this.echoes[i]; e.life -= dt; if (e.life <= 0) this.echoes.splice(i, 1); }
    for (let i = this.contacts.length - 1; i >= 0; i--) { const c = this.contacts[i]; c.life -= dt; if (c.life <= 0) this.contacts.splice(i, 1); }
    if (this.echoes.length > 1400) this.echoes.splice(0, this.echoes.length - 1400);
  }

  /* World-space overlay (drawn after darkness). */
  drawWorld(ctx, cam) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pings) {
      if (p.r > p.max) continue;
      const a = 0.35 * (1 - p.r / p.max);
      ctx.strokeStyle = `rgba(90,230,190,${a})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, TAU); ctx.stroke();
    }
    for (const e of this.echoes) {
      const a = (e.life / e.max);
      ctx.fillStyle = `rgba(80,230,180,${(a * a * 0.8).toFixed(3)})`;
      ctx.fillRect(Math.round(e.x - cam.x) - 1, Math.round(e.y - cam.y) - 1, 2, 2);
    }
    ctx.font = '8px monospace'; ctx.textAlign = 'center';
    for (const c of this.contacts) {
      const a = c.life / c.max;
      const sx = c.x - cam.x, sy = c.y - cam.y;
      const r = c.big ? 18 + (1 - a) * 10 : 6 + (1 - a) * 4;
      ctx.strokeStyle = c.big ? `rgba(230,120,110,${a})` : `rgba(230,200,120,${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = c.big ? `rgba(230,120,110,${a})` : `rgba(230,200,120,${a})`;
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
      ctx.fillText(c.label || 'CONTACT', sx, sy - r - 3);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* HUD scope. */
  drawScope(sctx, size) {
    const g = this.game, sub = g.sub, w = g.world;
    const R = size / 2;
    const range = sub.stats.sonarRange;
    const scale = R / range;
    sctx.clearRect(0, 0, size, size);
    sctx.save();
    sctx.beginPath(); sctx.arc(R, R, R - 1, 0, TAU); sctx.clip();
    sctx.fillStyle = '#021012'; sctx.fillRect(0, 0, size, size);
    w.flushMap();
    const rt = range / TILE;
    sctx.imageSmoothingEnabled = false;
    sctx.globalAlpha = 0.9;
    sctx.drawImage(w.mapCanvas, sub.x / TILE - rt, sub.y / TILE - rt, rt * 2, rt * 2, 0, 0, size, size);
    sctx.globalAlpha = 1;
    // range rings
    sctx.strokeStyle = 'rgba(90,220,180,0.18)';
    for (let k = 1; k <= 3; k++) { sctx.beginPath(); sctx.arc(R, R, R * k / 3, 0, TAU); sctx.stroke(); }
    sctx.beginPath(); sctx.moveTo(R, 0); sctx.lineTo(R, size); sctx.moveTo(0, R); sctx.lineTo(size, R); sctx.stroke();
    // sweep
    const grad = sctx.createLinearGradient(R, R, R + Math.cos(this.sweep) * R, R + Math.sin(this.sweep) * R);
    grad.addColorStop(0, 'rgba(90,230,190,0.0)'); grad.addColorStop(1, 'rgba(90,230,190,0.35)');
    sctx.strokeStyle = grad; sctx.lineWidth = 2;
    sctx.beginPath(); sctx.moveTo(R, R); sctx.lineTo(R + Math.cos(this.sweep) * R, R + Math.sin(this.sweep) * R); sctx.stroke();
    sctx.lineWidth = 1;
    // pings
    for (const p of this.pings) {
      if (p.r > p.max) continue;
      sctx.strokeStyle = `rgba(90,230,190,${0.6 * (1 - p.r / p.max)})`;
      sctx.beginPath(); sctx.arc(R + (p.x - sub.x) * scale, R + (p.y - sub.y) * scale, p.r * scale, 0, TAU); sctx.stroke();
    }
    // markers
    const mark = (x, y, color, shape) => {
      let dx = (x - sub.x) * scale, dy = (y - sub.y) * scale;
      const d = Math.hypot(dx, dy);
      const edge = d > R - 8;
      if (edge) { dx = dx / d * (R - 8); dy = dy / d * (R - 8); }
      sctx.fillStyle = color;
      if (shape === 'diamond' || edge) {
        sctx.beginPath(); sctx.moveTo(R + dx, R + dy - 4); sctx.lineTo(R + dx + 4, R + dy); sctx.lineTo(R + dx, R + dy + 4); sctx.lineTo(R + dx - 4, R + dy); sctx.fill();
      } else sctx.fillRect(R + dx - 2, R + dy - 2, 4, 4);
    };
    const P = w.pois;
    mark(P.station.dockX, P.station.dockY, '#7fe0bd', 'diamond');
    const obj = g.objectiveTarget();
    if (obj) mark(obj.x, obj.y, '#e2a44a', 'diamond');
    for (const it of g.contractItems()) mark(it.x, it.y, '#c8b060', 'diamond');
    // contacts
    for (const c of this.contacts) {
      const a = c.life / c.max;
      const dx = (c.x - sub.x) * scale, dy = (c.y - sub.y) * scale;
      if (Math.hypot(dx, dy) > R) continue;
      sctx.fillStyle = c.big ? `rgba(240,110,100,${a})` : `rgba(240,210,120,${a})`;
      const s = c.big ? 7 : 3;
      sctx.fillRect(R + dx - s / 2, R + dy - s / 2, s, s);
    }
    // passive tracking of the Warden (Sonar Mk IV)
    const wd = g.warden;
    if (wd && wd.active && sub.stats.sonarLevel >= 3) {
      const a = Math.atan2(wd.y - sub.y, wd.x - sub.x);
      const d = dist(sub.x, sub.y, wd.x, wd.y);
      if (d < 2600) {
        sctx.strokeStyle = `rgba(240,110,100,${clamp(1 - d / 2600, 0.2, 0.9)})`; sctx.lineWidth = 4;
        sctx.beginPath(); sctx.arc(R, R, R - 3, a - 0.18, a + 0.18); sctx.stroke(); sctx.lineWidth = 1;
      }
    }
    // own ship
    sctx.fillStyle = '#e8fff6';
    sctx.fillRect(R - 2, R - 1, 5, 3);
    const aa = sub.aim;
    sctx.strokeStyle = sub.lightsActive ? 'rgba(255,240,180,0.6)' : 'rgba(255,255,255,0.2)';
    sctx.beginPath(); sctx.moveTo(R, R); sctx.lineTo(R + Math.cos(aa) * 16, R + Math.sin(aa) * 16); sctx.stroke();
    sctx.restore();
    sctx.strokeStyle = 'rgba(120,220,185,0.5)';
    sctx.beginPath(); sctx.arc(R, R, R - 1, 0, TAU); sctx.stroke();
  }
}
