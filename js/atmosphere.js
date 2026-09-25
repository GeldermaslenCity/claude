'use strict';
/* The horror director: parallax backdrop, passing shadows, marine snow, the recurring
   signal, distant calls, hull knocks, radio ghosts, flickers and the Warden's heartbeat. */

const RADIO_LINES = [
  'RADIO: carrier wave on the company band. No source.',
  'RADIO: three pulses. Silence. Three pulses.',
  'RADIO: "…Kestrel to Anchor, do you… we can hear it under the…" [signal lost]',
  'RADIO: a voice, slowed down until it is barely a voice.',
  'RADIO: your own sonar ping, played back to you. You did not ping.',
  'RADIO: "…lights off, Teo. It sees the lights…"',
];

class Atmosphere {
  constructor(game) {
    this.game = game;
    this.eventT = rand(20, 35);
    this.signalT = 5;
    this.signalAge = 99;
    this.heartT = 0;
    this.shadow = null;
    this.distressT = 0;
    this.stalkFlickerT = 5;
    this.snow = [];
    for (let i = 0; i < 170; i++) this.snow.push({ x: Math.random(), y: Math.random(), z: rand(0.4, 1.3), s: Math.random() < 0.2 ? 2 : 1, ph: Math.random() * 10 });
    this.far1 = this.makeLayer(512, 0.012, 11, 0.52);
    this.far2 = this.makeLayer(512, 0.02, 29, 0.56);
  }

  /** Tileable blob texture for the far cave walls. */
  makeLayer(size, freq, seed, thresh) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const period = Math.round(size * freq);
    const pn = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const h = (a, b) => hash2(((a % period) + period) % period, ((b % period) + period) % period, seed);
      return lerp(lerp(h(ix, iy), h(ix + 1, iy), ux), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux), uy);
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size * period, v = y / size * period;
      const n = pn(u, v) * 0.65 + pn(u * 2, v * 2) * 0.35 * 1;
      const a = smoothstep(thresh, thresh + 0.06, n);
      const o = (y * size + x) * 4;
      img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 0; img.data[o + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  signalStrength() {
    const g = this.game;
    const d01 = clamp(g.sub.y / g.world.pxH, 0, 1);
    let s = 0.08 + d01 * 0.9;
    const gate = g.world.pois.gate;
    const dg = dist(g.sub.x, g.sub.y, gate.x, gate.y);
    if (dg < 800) s += (1 - dg / 800) * 0.3;
    return clamp(s, 0, 1);
  }

  update(dt) {
    const g = this.game, sub = g.sub;
    const d01 = clamp(sub.y / g.world.pxH, 0, 1);
    const zone = zoneAt(Math.floor(sub.y / TILE)).id;

    // the signal: three pulses every nine seconds, louder with depth
    this.signalT -= dt; this.signalAge += dt;
    if (this.signalT <= 0) { this.signalT = 9; this.signalAge = 0; AudioSys.sfx.signal(this.signalStrength() * (g.docked ? 0.4 : 1)); }
    let pulse = 0;
    for (let k = 0; k < 3; k++) { const e = (this.signalAge - k * 0.5) / 0.15; pulse = Math.max(pulse, Math.exp(-e * e)); }
    g.signalPulse = pulse;

    if (g.docked) return;

    // heartbeat when the Warden is close or hunting
    const wd = g.warden;
    if (wd && wd.active) {
      const near = wd.state === 'hunt' || wd.dist < 800;
      if (near) {
        this.heartT -= dt;
        if (this.heartT <= 0) {
          const v = wd.state === 'hunt' ? 0.9 : clamp(1 - wd.dist / 800, 0.2, 0.8);
          AudioSys.sfx.heartbeat(v);
          this.heartT = wd.state === 'hunt' ? 0.75 : 1.3;
        }
      }
      if (wd.state === 'stalk' && wd.dist < 650) {
        this.stalkFlickerT -= dt;
        if (this.stalkFlickerT <= 0) { sub.flicker = rand(0.2, 0.7); this.stalkFlickerT = rand(6, 14); }
      }
    }

    // Marrow distress loop
    const mw = g.world.pois.marrow;
    if (dist(sub.x, sub.y, mw.x, mw.y) < 520) {
      this.distressT -= dt;
      if (this.distressT <= 0) { AudioSys.sfx.distress(); this.distressT = 2.4; }
    }

    // random unsettling events
    if (sub.y > SAFE_DEPTH_TILES * TILE) {
      this.eventT -= dt;
      if (this.eventT <= 0) { this.fire(zone); this.eventT = rand(16, 38) * (1 - d01 * 0.35); }
    }

    if (this.shadow) {
      const s = this.shadow;
      s.t += dt;
      s.x += s.vx * dt;
      if (s.t > s.dur) this.shadow = null;
    }
  }

  fire(zone) {
    const g = this.game, sub = g.sub;
    const opts = ['groan', 'transient', 'radio'];
    if (zone <= 2) opts.push('shadow', 'shadow');
    if (zone >= 2) opts.push('knock', 'flicker', 'rockfall', 'wardenfar');
    if (zone >= 3) opts.push('knock', 'transient');
    const e = opts[randInt(0, opts.length - 1)];
    switch (e) {
      case 'groan': {
        const pan = rand(-1, 1);
        AudioSys.sfx.distantCall(pan);
        const b = Math.round((pan > 0 ? 90 : 270) + rand(-40, 40));
        g.msg(`Hydrophone: distant biologic, bearing ${(b + 360) % 360}°`, 'radio');
        break;
      }
      case 'transient': {
        const p = g.world.randomAirNear(sub.x, sub.y, 250, sub.stats.sonarRange * 0.8);
        if (p) { g.sonar.transient(p.x, p.y, Math.random() < 0.5); g.msg('Sonar: transient contact. Gone.', 'radio'); }
        break;
      }
      case 'radio':
        AudioSys.sfx.whisper();
        g.msg(RADIO_LINES[randInt(0, RADIO_LINES.length - 1)], 'radio');
        break;
      case 'shadow':
        this.shadow = { x: Math.random() < 0.5 ? -400 : g.vw + 400, y: rand(g.vh * 0.2, g.vh * 0.7), t: 0, dur: 28, len: rand(420, 700) };
        this.shadow.vx = (this.shadow.x < 0 ? 1 : -1) * rand(45, 70);
        if (Math.random() < 0.5) AudioSys.sfx.distantCall(this.shadow.vx > 0 ? -0.6 : 0.6);
        break;
      case 'knock':
        AudioSys.sfx.knock();
        if (Math.random() < 0.4) g.msg('…something taps against the hull. Three times.', 'radio');
        break;
      case 'flicker':
        sub.flicker = rand(0.6, 1.5);
        AudioSys.sfx.creak();
        break;
      case 'rockfall':
        AudioSys.sfx.rumble(0.7);
        g.shake(4);
        for (let i = 0; i < 12; i++) g.particles.debris(sub.x + rand(-160, 160), sub.y - rand(60, 160), [80, 80, 75], 1, 20);
        g.particles.silt(sub.x + rand(-100, 100), sub.y - 80, 6);
        break;
      case 'wardenfar': {
        const wd = g.warden;
        if (wd && wd.active && wd.state === 'roam' && wd.dist > 900) {
          AudioSys.sfx.wardenGroan(0.25, clamp((wd.x - sub.x) / 1500, -1, 1));
          g.msg(`Hydrophone: very large displacement, bearing ${bearing(sub.x, sub.y, wd.x, wd.y)}°. Far. Probably far.`, 'radio');
        } else AudioSys.sfx.distantCall(rand(-1, 1));
        break;
      }
    }
  }

  /* ---------- backdrop ---------- */
  drawBackdrop(ctx, cam, vw, vh, t) {
    const w = this.game.world;
    const top = w.paletteAtPx(cam.y), bot = w.paletteAtPx(cam.y + vh);
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, rgb(top.water)); grad.addColorStop(1, rgb(bot.water));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, vw, vh);
    // far walls, two parallax layers
    this.tileLayer(ctx, this.far1, cam.x * 0.25, cam.y * 0.25, vw, vh, 0.22);
    if (this.shadow) this.drawShadow(ctx, vw, vh);
    this.tileLayer(ctx, this.far2, cam.x * 0.5 + 200, cam.y * 0.5 + 100, vw, vh, 0.3);
    // light shafts through the ice near the surface
    if (cam.y < 700) {
      const a = (1 - cam.y / 700) * 0.06;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = ((i * 233 - cam.x * 0.6) % (vw + 400) + vw + 400) % (vw + 400) - 200;
        const sway = Math.sin(t * 0.2 + i) * 30;
        ctx.fillStyle = `rgba(150,200,210,${a * (0.6 + 0.4 * Math.sin(t * 0.5 + i * 2))})`;
        ctx.beginPath(); ctx.moveTo(x, -cam.y * 0.6); ctx.lineTo(x + 40, -cam.y * 0.6);
        ctx.lineTo(x + 180 + sway, vh); ctx.lineTo(x + 100 + sway, vh); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  tileLayer(ctx, img, ox, oy, vw, vh, alpha) {
    const s = img.width;
    const sx = -(((ox % s) + s) % s), sy = -(((oy % s) + s) % s);
    ctx.globalAlpha = alpha;
    for (let y = sy; y < vh; y += s) for (let x = sx; x < vw; x += s) ctx.drawImage(img, Math.round(x), Math.round(y));
    ctx.globalAlpha = 1;
  }

  drawShadow(ctx, vw, vh) {
    const s = this.shadow;
    const fade = Math.min(1, s.t / 4, (s.dur - s.t) / 4);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * fade})`;
    const dir = s.vx > 0 ? -1 : 1;
    for (let i = 0; i < 26; i++) {
      const u = i / 25;
      const x = s.x + dir * u * s.len;
      const y = s.y + Math.sin(s.t * 0.8 + u * 4) * 22 * u;
      const r = lerp(46, 6, Math.pow(u, 0.7));
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.4, r, 0, 0, TAU); ctx.fill();
    }
  }

  drawSnow(ctx, cam, vw, vh, t, color) {
    ctx.fillStyle = rgb(color, 0.5);
    for (const p of this.snow) {
      const W = vw + 40, H = vh + 40;
      const x = ((p.x * W - cam.x * p.z + Math.sin(t * 0.3 + p.ph) * 8) % W + W) % W - 20;
      const y = ((p.y * H - cam.y * p.z + t * 6 * p.z) % H + H) % H - 20;
      ctx.fillRect(Math.round(x), Math.round(y), p.s, p.s);
    }
  }
}
