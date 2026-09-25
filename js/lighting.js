'use strict';
/* Darkness overlay with light "holes" (destination-out), shadow-casting floodlight cones,
   and an additive glow pass for emissive things. */

class Lighting {
  constructor() {
    this.c = document.createElement('canvas');
    this.g = this.c.getContext('2d');
    this.w = 0; this.h = 0;
  }
  resize(w, h) { this.c.width = this.w = w; this.c.height = this.h = h; }

  /** Visibility polygon of a cone, occluded by the tile grid. */
  static cone(world, x, y, angle, half, range, rays = 56) {
    const pts = [[x, y]];
    for (let i = 0; i <= rays; i++) {
      const a = angle - half + (2 * half * i) / rays;
      const dx = Math.cos(a), dy = Math.sin(a);
      const h = world.raycast(x, y, dx, dy, range);
      const d = h.hit ? Math.min(range, h.dist + 7) : range;
      pts.push([x + dx * d, y + dy * d]);
    }
    return pts;
  }

  render(ctx, cam, lights, darkness) {
    const g = this.g, w = this.w, h = this.h;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(1,4,7,${darkness.toFixed(3)})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    for (const L of lights) {
      if (!(L.i > 0)) continue;
      const sx = L.x - cam.x, sy = L.y - cam.y;
      if (sx < -L.r || sy < -L.r || sx > w + L.r || sy > h + L.r) continue;
      const grad = g.createRadialGradient(sx, sy, 0, sx, sy, L.r);
      const i = Math.min(1, L.i);
      grad.addColorStop(0, `rgba(0,0,0,${i})`);
      grad.addColorStop(L.poly ? 0.65 : 0.4, `rgba(0,0,0,${i * (L.poly ? 0.8 : 0.5)})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      if (L.poly) {
        g.beginPath();
        g.moveTo(L.poly[0][0] - cam.x, L.poly[0][1] - cam.y);
        for (let k = 1; k < L.poly.length; k++) g.lineTo(L.poly[k][0] - cam.x, L.poly[k][1] - cam.y);
        g.closePath();
        g.fill();
      } else {
        g.fillRect(sx - L.r, sy - L.r, L.r * 2, L.r * 2);
      }
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.c, 0, 0);
  }

  glow(ctx, cam, lights) {
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      if (!L.color || !(L.glow > 0)) continue;
      const sx = L.x - cam.x, sy = L.y - cam.y;
      const r = L.gr || L.r * 0.6;
      if (sx < -r || sy < -r || sx > this.w + r || sy > this.h + r) continue;
      if (L.poly) {
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, L.r);
        grad.addColorStop(0, rgb(L.color, L.glow));
        grad.addColorStop(1, rgb(L.color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(L.poly[0][0] - cam.x, L.poly[0][1] - cam.y);
        for (let k = 1; k < L.poly.length; k++) ctx.lineTo(L.poly[k][0] - cam.x, L.poly[k][1] - cam.y);
        ctx.closePath(); ctx.fill();
        continue;
      }
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, rgb(L.color, L.glow));
      grad.addColorStop(1, rgb(L.color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      if (L.dot) {
        ctx.fillStyle = rgb(mixC(L.color, [255, 255, 255], 0.5), Math.min(1, L.glow * 2.5));
        ctx.fillRect(Math.round(sx - L.dot / 2), Math.round(sy - L.dot / 2), L.dot, L.dot);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
