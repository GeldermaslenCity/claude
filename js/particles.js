'use strict';
/* Lightweight particle system: bubbles, sparks, debris, ichor, sediment puffs. */

class Particles {
  constructor(world) { this.world = world; this.list = []; }

  add(p) {
    if (this.list.length > 900) this.list.shift();
    p.max = p.life;
    this.list.push(p);
  }

  bubbles(x, y, n = 1, spread = 3) {
    for (let i = 0; i < n; i++) this.add({ kind: 'bubble', x: x + rand(-spread, spread), y: y + rand(-spread, spread), vx: rand(-10, 10), vy: rand(-20, -5), life: rand(1, 2.5), size: Math.random() < 0.3 ? 2 : 1, seed: Math.random() * 10 });
  }
  sparks(x, y, color, n = 4, speed = 80) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(speed * 0.3, speed);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.6), size: 1, color });
    }
  }
  debris(x, y, color, n = 5, speed = 50) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(10, speed);
      this.add({ kind: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.8, 2), size: Math.random() < 0.4 ? 2 : 1, color });
    }
  }
  ichor(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(5, 45);
      this.add({ kind: 'ichor', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(1.5, 3), size: rand(2, 4), color: [70, 150, 90] });
    }
  }
  silt(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(5, 30);
      this.add({ kind: 'silt', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 5, life: rand(1.5, 3.5), size: rand(3, 7), color: [90, 100, 95] });
    }
  }
  /** Ore chunk that flies to the submarine. */
  chunk(x, y, color, target) {
    this.add({ kind: 'chunk', x, y, vx: rand(-40, 40), vy: rand(-40, 40), life: 1.2, size: 2, color, target });
  }

  update(dt) {
    const w = this.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      switch (p.kind) {
        case 'bubble':
          p.vy -= 25 * dt; p.vx += Math.sin(p.life * 6 + p.seed) * 20 * dt;
          p.vx *= 0.96; p.vy = Math.max(p.vy, -45);
          break;
        case 'spark': p.vx *= 0.9; p.vy *= 0.9; break;
        case 'debris': p.vy += 30 * dt; p.vx *= 0.97; p.vy *= 0.97; break;
        case 'ichor': case 'silt': p.vx *= 0.95; p.vy *= 0.95; p.size += dt * 2; break;
        case 'chunk':
          if (p.target) {
            const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy) || 1;
            p.vx += dx / d * 600 * dt; p.vy += dy / d * 600 * dt;
            p.vx *= 0.9; p.vy *= 0.9;
            if (d < 10) p.life = 0;
          }
          break;
      }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.kind !== 'chunk' && w.solidPx(nx, ny)) {
        if (p.kind === 'bubble') { p.life = 0; continue; }
        p.vx *= -0.3; p.vy *= -0.3;
      } else { p.x = nx; p.y = ny; }
    }
  }

  draw(ctx, cam) {
    for (const p of this.list) {
      const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'bubble') {
        ctx.fillStyle = `rgba(170,220,230,${0.55 * a})`;
        ctx.fillRect(sx, sy, p.size, p.size);
      } else if (p.kind === 'debris' || p.kind === 'chunk') {
        ctx.fillStyle = rgb(p.color, a);
        ctx.fillRect(sx, sy, p.size, p.size);
      } else if (p.kind === 'ichor' || p.kind === 'silt') {
        ctx.fillStyle = rgb(p.color, 0.25 * a);
        ctx.beginPath(); ctx.arc(sx, sy, p.size, 0, TAU); ctx.fill();
      }
    }
  }

  drawGlow(ctx, cam) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (p.kind !== 'spark') continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = rgb(p.color, a);
      ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
