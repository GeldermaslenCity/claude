'use strict';
/* Procedurally drawn set pieces: Anchor Station, wrecks, the research station,
   the giant skeleton, the relay, the trench gate and the abyss. */

const Structures = {
  steel: '#2c3438', steelHi: '#56666c', steelDk: '#161c1f',

  /* Things drawn BEHIND the rock tiles (so rock can overlap them). */
  drawBack(ctx, game, cam, t) {
    const P = game.world.pois;
    this.skeleton(ctx, P.skeleton, cam);
    this.abyss(ctx, P.abyss, cam, t);
  },

  /* Things drawn in front of rock. */
  drawFront(ctx, game, cam, t) {
    const P = game.world.pois, st = game.profile ? game.profile.story : { stage: 0 };
    this.station(ctx, P.station, cam, t);
    this.rig(ctx, P.rig, cam, t);
    this.kestrel(ctx, P.kestrel, cam, t, st);
    this.vesna(ctx, P.vesna, cam, t);
    this.marrow(ctx, P.marrow, cam, t);
    this.relay(ctx, P.relay, cam, t, st.relayRepaired);
    this.gate(ctx, P.gate, cam, t, game);
    if (game.contractItems) for (const it of game.contractItems()) this.salvageItem(ctx, it, cam, t);
  },

  onScreen(p, cam, margin) {
    return p.x > cam.x - margin && p.x < cam.x + cam.w + margin && p.y > cam.y - margin && p.y < cam.y + cam.h + margin;
  },

  station(ctx, s, cam, t) {
    if (!this.onScreen(s, cam, 400)) return;
    const ox = Math.round(s.x - cam.x), oy = Math.round(s.ceilY - cam.y);
    ctx.save(); ctx.translate(ox, oy);
    // pylons into the ice
    for (const px of [-52, 48]) {
      ctx.fillStyle = this.steel; ctx.fillRect(px, -90, 8, 132);
      ctx.strokeStyle = this.steelDk; ctx.lineWidth = 1;
      for (let y = -80; y < 40; y += 16) { ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + 8, y + 16); ctx.stroke(); }
    }
    // side pods
    for (const sx of [-108, 108]) {
      ctx.fillStyle = '#323c40'; ctx.beginPath(); ctx.arc(sx, 70, 19, 0, TAU); ctx.fill();
      ctx.strokeStyle = this.steelHi; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#2a3236'; ctx.fillRect(sx > 0 ? 88 : -96, 64, 8, 10);
    }
    // main hub
    ctx.fillStyle = '#3b464b'; ctx.fillRect(-92, 40, 184, 56);
    ctx.fillStyle = this.steelHi; ctx.fillRect(-92, 40, 184, 3);
    ctx.fillStyle = this.steelDk; ctx.fillRect(-92, 92, 184, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let x = -72; x < 92; x += 22) { ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x, 92); ctx.stroke(); }
    // lower ring
    ctx.fillStyle = '#2f383c'; ctx.beginPath(); ctx.ellipse(0, 104, 62, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#41505a'; ctx.fillRect(-62, 102, 124, 2);
    // docking arm and clamp
    ctx.fillStyle = this.steel; ctx.fillRect(-5, 112, 10, 22);
    ctx.fillStyle = '#4a565c'; ctx.fillRect(-26, 132, 52, 5); ctx.fillRect(-26, 132, 4, 12); ctx.fillRect(22, 132, 4, 12);
    // lettering
    ctx.fillStyle = 'rgba(210,190,120,0.8)'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('ANCHOR STATION · HM-7741', 0, 88);
    // antenna
    ctx.strokeStyle = this.steelHi; ctx.beginPath(); ctx.moveTo(70, 40); ctx.lineTo(70, 18); ctx.stroke();
    ctx.restore();
  },

  stationGlow(ctx, s, cam, t) {
    if (!this.onScreen(s, cam, 400)) return;
    const ox = s.x - cam.x, oy = s.ceilY - cam.y;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const wx = -80 + i * 14;
      const f = hash2(i, Math.floor(t * 0.7 + i), 3) > 0.08 ? 1 : 0.2;
      ctx.fillStyle = `rgba(232,176,96,${0.75 * f})`;
      ctx.fillRect(Math.round(ox + wx), Math.round(oy + 56), 7, 5);
    }
    for (const sx of [-108, 108]) { ctx.fillStyle = 'rgba(160,230,220,0.6)'; ctx.fillRect(Math.round(ox + sx - 3), Math.round(oy + 66), 6, 6); }
    const blink = Math.sin(t * 3) > 0;
    ctx.fillStyle = blink ? 'rgba(90,255,140,0.95)' : 'rgba(40,120,60,0.6)';
    ctx.fillRect(Math.round(ox - 24), Math.round(oy + 146), 3, 3); ctx.fillRect(Math.round(ox + 21), Math.round(oy + 146), 3, 3);
    ctx.fillStyle = Math.sin(t * 1.5) > 0.6 ? 'rgba(255,60,50,1)' : 'rgba(90,20,20,0.6)';
    ctx.fillRect(Math.round(ox + 69), Math.round(oy + 16), 3, 3);
    ctx.globalCompositeOperation = 'source-over';
  },

  rig(ctx, p, cam, t) {
    if (!this.onScreen(p, cam, 200)) return;
    const ox = Math.round(p.x - cam.x), oy = Math.round(p.floorY - cam.y);
    ctx.save(); ctx.translate(ox, oy);
    ctx.strokeStyle = '#3d3a30'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-8, -70); ctx.moveTo(34, 0); ctx.lineTo(8, -70); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#524c3c';
    for (let y = -10; y > -70; y -= 12) { ctx.beginPath(); ctx.moveTo(-30 + (-y) * 0.32, y); ctx.lineTo(30 - (-y) * 0.32, y); ctx.stroke(); }
    ctx.fillStyle = '#5a4a2c'; ctx.fillRect(-26, -78, 52, 9);
    ctx.fillStyle = '#2a2a26'; ctx.fillRect(-3, -120, 6, 42);
    ctx.fillStyle = '#44403a'; ctx.fillRect(-2, -69, 4, 75);
    ctx.fillStyle = 'rgba(200,170,90,0.7)'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('RIG-4', 0, -71);
    ctx.restore();
  },

  kestrel(ctx, p, cam, t, st) {
    if (!this.onScreen(p, cam, 260)) return;
    const ox = Math.round(p.x - cam.x), oy = Math.round(p.floorY - cam.y);
    ctx.save(); ctx.translate(ox, oy - 16); ctx.rotate(0.24);
    ctx.fillStyle = '#6a5634';
    ctx.beginPath(); ctx.ellipse(0, 0, 48, 16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4c3e26'; ctx.fillRect(-40, 4, 80, 8);
    ctx.fillStyle = '#5c4a2e'; ctx.fillRect(-8, -26, 22, 12);
    ctx.fillStyle = '#0c0f10';
    ctx.beginPath(); ctx.moveTo(-48, -6); ctx.lineTo(-30, -14); ctx.lineTo(-26, -4); ctx.lineTo(-18, -10); ctx.lineTo(-22, 6); ctx.lineTo(-34, 12); ctx.lineTo(-44, 6); ctx.fill();
    ctx.strokeStyle = '#8a7650'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-18, -10); ctx.lineTo(-10, -2); ctx.lineTo(-16, 8); ctx.stroke();
    ctx.fillStyle = '#1e2a2c'; ctx.beginPath(); ctx.arc(34, -3, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(210,190,130,0.75)'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText('KESTREL', 6, 4);
    ctx.restore();
    // debris
    ctx.fillStyle = '#4c3e26';
    ctx.fillRect(ox - 90, oy - 4, 10, 4); ctx.fillRect(ox - 70, oy - 3, 5, 3); ctx.fillRect(ox + 64, oy - 5, 8, 5);
    if (st.stage <= 1 && !st.blackBox) {
      ctx.fillStyle = '#d06a20'; ctx.fillRect(ox - 62, oy - 8, 10, 8);
      ctx.fillStyle = '#2a1a10'; ctx.fillRect(ox - 60, oy - 6, 6, 2);
    }
  },

  vesna(ctx, p, cam, t) {
    if (!this.onScreen(p, cam, 320)) return;
    const ox = Math.round(p.x - cam.x), oy = Math.round(p.floorY - cam.y);
    ctx.save(); ctx.translate(ox, oy);
    ctx.fillStyle = '#39443f'; ctx.fillRect(-150, -52, 86, 52);
    ctx.fillStyle = '#4e5c55'; ctx.fillRect(-150, -52, 86, 3);
    ctx.fillStyle = '#121816'; for (let i = 0; i < 5; i++) ctx.fillRect(-142 + i * 16, -40, 9, 7);
    ctx.fillStyle = 'rgba(200,210,170,0.6)'; ctx.font = '8px monospace'; ctx.textAlign = 'left'; ctx.fillText('VESNA', -140, -14);
    ctx.fillStyle = '#2d3531'; ctx.fillRect(-64, -26, 26, 10); ctx.fillRect(52, -26, 22, 10);
    ctx.save(); ctx.translate(8, 0); ctx.rotate(0.16);
    ctx.fillStyle = '#343f3a'; ctx.fillRect(-46, -46, 92, 44);
    ctx.strokeStyle = '#101512'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -46); ctx.lineTo(0, -28); ctx.lineTo(-6, -16); ctx.lineTo(4, -2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#35403b'; ctx.beginPath(); ctx.arc(112, 0, 40, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#0e1311'; ctx.beginPath(); ctx.arc(112, -14, 9, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#56645c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(112, -40); ctx.lineTo(112, -70); ctx.lineTo(128, -62); ctx.stroke();
    // lifepod
    ctx.fillStyle = '#b86a28'; ctx.beginPath(); ctx.ellipse(176, -11, 16, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0c0f0e'; ctx.fillRect(170, -18, 10, 8);
    ctx.fillStyle = 'rgba(30,30,20,0.9)'; ctx.font = '5px monospace'; ctx.fillText('LP-2', 166, -4);
    ctx.fillStyle = '#2d3531'; ctx.fillRect(-60, -3, 8, 3); ctx.fillRect(40, -4, 12, 4); ctx.fillRect(140, -3, 6, 3);
    ctx.restore();
  },

  skeleton(ctx, p, cam) {
    if (!this.onScreen(p, cam, 700)) return;
    const ox = p.x - cam.x, oy = p.floorY - cam.y;
    const bone = '#a3a28c', boneDk = '#6e6d5c';
    const sp = (u) => [ox - 520 + u * 900, oy - 44 - Math.sin(u * Math.PI) * 110];
    ctx.lineCap = 'round';
    // ribs
    for (let u = 0.18; u < 0.72; u += 0.045) {
      const [x, y] = sp(u);
      const len = 80 + Math.sin((u - 0.18) / 0.54 * Math.PI) * 90;
      ctx.strokeStyle = boneDk; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 30, y - len * 0.55, x + 10, y - len); ctx.stroke();
      ctx.strokeStyle = bone; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 36, y + len * 0.4, x + 18, y + Math.min(len * 0.75, oy - y - 4)); ctx.stroke();
    }
    // spine
    for (let u = 0; u <= 1.0; u += 0.022) {
      const [x, y] = sp(u);
      const s = 5 + Math.sin(u * Math.PI) * 6;
      ctx.fillStyle = boneDk; ctx.fillRect(x - s, y - s * 0.7, s * 2, s * 1.4);
      ctx.fillStyle = bone; ctx.fillRect(x - s + 1, y - s * 0.7 + 1, s * 2 - 3, s * 0.6);
    }
    // skull
    const [sx, sy] = sp(1.0);
    ctx.fillStyle = bone;
    ctx.beginPath(); ctx.moveTo(sx, sy - 30); ctx.lineTo(sx + 150, sy - 18); ctx.lineTo(sx + 170, sy + 4); ctx.lineTo(sx + 20, sy + 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = boneDk;
    ctx.beginPath(); ctx.moveTo(sx + 20, sy + 30); ctx.lineTo(sx + 160, sy + 16); ctx.lineTo(sx + 150, sy + 30); ctx.lineTo(sx + 30, sy + 46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b0d0c';
    ctx.beginPath(); ctx.ellipse(sx + 40, sy - 8, 12, 9, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + 76, sy - 6, 7, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = bone;
    for (let i = 0; i < 12; i++) {
      const tx = sx + 36 + i * 10;
      ctx.beginPath(); ctx.moveTo(tx, sy + 20 - i * 0.8); ctx.lineTo(tx + 4, sy + 34 - i); ctx.lineTo(tx + 7, sy + 19 - i * 0.8); ctx.fill();
    }
    // tail
    const [tx0, ty0] = sp(0);
    ctx.strokeStyle = bone; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.quadraticCurveTo(tx0 - 80, ty0 + 30, tx0 - 150, ty0 + 10); ctx.stroke();
    ctx.lineCap = 'butt';
  },

  marrow(ctx, p, cam, t) {
    if (!this.onScreen(p, cam, 220)) return;
    const ox = Math.round(p.x - cam.x), oy = Math.round(p.floorY - cam.y);
    ctx.save(); ctx.translate(ox, oy - 20); ctx.rotate(-0.45);
    ctx.fillStyle = '#3c474c'; ctx.beginPath(); ctx.ellipse(0, 0, 44, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a3236'; ctx.fillRect(-36, 5, 72, 7); ctx.fillRect(-6, -24, 20, 11);
    ctx.fillStyle = '#101416'; ctx.beginPath(); ctx.arc(30, -2, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1a2023'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-20 + i * 9, -12); ctx.lineTo(-14 + i * 9, 10); ctx.stroke(); }
    ctx.fillStyle = 'rgba(180,190,190,0.6)'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText('MARROW', 0, 3);
    ctx.restore();
  },

  relay(ctx, p, cam, t, repaired) {
    if (!this.onScreen(p, cam, 200)) return;
    const ox = Math.round(p.x - cam.x), oy = Math.round(p.floorY - cam.y);
    ctx.save(); ctx.translate(ox, oy);
    ctx.fillStyle = '#333b3e'; ctx.fillRect(-22, -18, 44, 18);
    ctx.fillStyle = '#4d585c'; ctx.fillRect(-22, -18, 44, 2);
    ctx.strokeStyle = '#4a5458'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, -18); ctx.lineTo(-3, -108); ctx.moveTo(8, -18); ctx.lineTo(3, -108); ctx.stroke();
    ctx.lineWidth = 1;
    for (let y = -26; y > -104; y -= 10) { ctx.beginPath(); ctx.moveTo(-7 + (-18 - y) * -0.05, y); ctx.lineTo(7 - (-18 - y) * -0.05, y - 10); ctx.stroke(); }
    ctx.save(); ctx.translate(0, -108); ctx.rotate(repaired ? -0.35 : 1.4);
    ctx.strokeStyle = '#8a969a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -10, 20, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -8); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(210,200,150,0.7)'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('RELAY 7', 0, -6);
    ctx.restore();
  },

  gateSpires(p, world) {
    if (!p.spires) {
      p.spires = [-250, -150, -60, 50, 150, 240].map((dx, i) => {
        const x = p.x + dx;
        const tx = Math.floor(x / TILE);
        let ty = p.ty;
        while (ty < world.H - 1 && !world.solid(tx, ty)) ty++;
        return { x, y: ty * TILE + 4, h: 90 + ((i * 53) % 5) * 22, w: 12 + (i % 3) * 3 };
      });
    }
    return p.spires;
  },

  gate(ctx, p, cam, t, game) {
    if (!this.onScreen(p, cam, 450)) return;
    for (const s of this.gateSpires(p, game.world)) {
      const sx = s.x - cam.x, sy = s.y - cam.y;
      ctx.fillStyle = '#0a0b0d';
      ctx.beginPath(); ctx.moveTo(sx - s.w, sy); ctx.lineTo(sx - 3, sy - s.h); ctx.lineTo(sx + 2, sy - s.h - 10); ctx.lineTo(sx + s.w, sy); ctx.fill();
      ctx.strokeStyle = '#262a30'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx - s.w, sy); ctx.lineTo(sx - 3, sy - s.h); ctx.stroke();
    }
  },

  gateGlow(ctx, p, cam, t, game, lights) {
    if (!this.onScreen(p, cam, 450)) return;
    const pulse = game.signalPulse || 0;
    for (const s of this.gateSpires(p, game.world)) {
      for (let k = 0; k < 6; k++) {
        const gy = s.y - 16 - k * (s.h - 24) / 6;
        const a = 0.15 + pulse * 0.8;
        lights.push({ x: s.x, y: gy, r: 30 + pulse * 30, i: 0.15 + pulse * 0.4, color: [90, 230, 210], glow: a * 0.5, dot: 2 });
      }
    }
  },

  abyss(ctx, p, cam, t) {
    if (!this.onScreen(p, cam, 700)) return;
    const ox = p.x - cam.x, oy = p.floorY - cam.y;
    const breathe = Math.sin(t * 0.4) * 6;
    for (let i = 0; i < 14; i++) {
      const w = 600 - i * 28;
      ctx.strokeStyle = i % 2 ? '#1c1418' : '#2a1d22'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(ox, oy + 10 + i * 3, w * 0.5, 30 + i * 4 + breathe * (i / 14), 0, Math.PI, TAU); ctx.stroke();
    }
  },

  abyssLights(p, cam, t, lights) {
    if (!this.onScreen(p, cam, 700)) return;
    const b = 0.5 + 0.5 * Math.sin(t * 0.4);
    for (let i = 0; i < 9; i++) {
      const x = p.x - 280 + i * 70, y = p.floorY - 20 - Math.sin(i / 8 * Math.PI) * 50;
      lights.push({ x, y, r: 70, i: 0.25 * b, color: [150, 60, 200], glow: 0.35 * b, dot: 3 });
    }
  },

  salvageItem(ctx, it, cam, t) {
    const sx = Math.round(it.x - cam.x), sy = Math.round(it.y - cam.y);
    if (sx < -40 || sy < -40 || sx > cam.w + 40 || sy > cam.h + 40) return;
    ctx.fillStyle = '#c8a040'; ctx.fillRect(sx - 6, sy - 4, 12, 8);
    ctx.fillStyle = '#403018'; ctx.fillRect(sx - 4, sy - 2, 8, 2);
  },

  /* Light sources contributed by structures. */
  lights(game, cam, t, lights) {
    const P = game.world.pois, st = game.profile ? game.profile.story : { stage: 0 };
    const s = P.station;
    lights.push({ x: s.x, y: s.ceilY + 70, r: 430, i: 0.8, color: [255, 210, 150], glow: 0.08 });
    lights.push({ x: s.x - 80, y: s.ceilY + 150, r: 170, i: 0.5 });
    lights.push({ x: s.x + 80, y: s.ceilY + 150, r: 170, i: 0.5 });
    lights.push({ x: s.dockX, y: s.dockY, r: 60, i: 0.4, color: [90, 255, 150], glow: 0.08 + 0.06 * Math.sin(t * 3) });
    // rig amber beacon
    const rb = Math.sin(t * 2.2) > 0.3;
    lights.push({ x: P.rig.x, y: P.rig.floorY - 122, r: 70, i: rb ? 0.5 : 0.1, color: [255, 170, 60], glow: rb ? 0.5 : 0.1, dot: 3 });
    // kestrel: one dying light
    const kf = hash2(Math.floor(t * 9), 1, 7) > 0.55 ? 1 : 0.15;
    lights.push({ x: P.kestrel.x + 30, y: P.kestrel.floorY - 12, r: 55, i: 0.45 * kf, color: [230, 220, 170], glow: 0.35 * kf, dot: 2 });
    if (st.stage <= 1 && !st.blackBox) {
      const bl = Math.sin(t * 5) > 0;
      lights.push({ x: P.kestrel.x - 57, y: P.kestrel.floorY - 8, r: 26, i: bl ? 0.3 : 0.05, color: [255, 60, 40], glow: bl ? 0.6 : 0.05, dot: 2 });
    }
    // vesna emergency light
    const vf = 0.5 + 0.5 * Math.sin(t * 1.7);
    lights.push({ x: P.vesna.x - 108, y: P.vesna.floorY - 56, r: 110, i: 0.45 * vf, color: [255, 40, 30], glow: 0.35 * vf, dot: 3 });
    lights.push({ x: P.vesna.x + 112, y: P.vesna.floorY - 14, r: 30, i: hash2(Math.floor(t * 4), 3, 9) > 0.7 ? 0.3 : 0, color: [120, 200, 255], glow: 0.3 });
    // marrow distress pulse
    const mp = Math.max(0, Math.sin(t * 1.2)) ** 4;
    lights.push({ x: P.marrow.x + 8, y: P.marrow.floorY - 34, r: 80, i: 0.35 * mp, color: [255, 30, 20], glow: 0.4 * mp, dot: 2 });
    // relay
    if (st.relayRepaired) {
      const on = Math.sin(t * 4) > 0;
      lights.push({ x: P.relay.x, y: P.relay.floorY - 128, r: 90, i: on ? 0.55 : 0.2, color: [80, 255, 140], glow: on ? 0.6 : 0.15, dot: 3 });
    } else if (Math.random() < 0.06) {
      lights.push({ x: P.relay.x + rand(-10, 10), y: P.relay.floorY - 104, r: 50, i: 0.6, color: [180, 220, 255], glow: 0.8, dot: 2 });
      if (game.particles && this.onScreen(P.relay, cam, 50)) game.particles.sparks(P.relay.x, P.relay.floorY - 104, [180, 220, 255], 3);
    }
    this.gateGlow(null, P.gate, cam, t, game, lights);
    this.abyssLights(P.abyss, cam, t, lights);
  },
};
