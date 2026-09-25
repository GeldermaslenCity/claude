'use strict';
/* Procedural cave world: tile grid, points of interest, ore deposits, decor,
   chunked rendering, raycasting, and the sonar map. */

class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.W = WORLD_W; this.H = WORLD_H;
    this.pxW = this.W * TILE; this.pxH = this.H * TILE;
    this.tiles = new Uint8Array(this.W * this.H);
    this.rng = new RNG(this.seed);
    this.deposits = [];
    this.depositMap = new Int32Array(this.W * this.H);
    this.decor = [];
    this.pois = {};
    this.pathPts = [];
    this.chunks = new Map();
    this.chunksW = Math.ceil(this.W / CHUNK);
    this.chunksH = Math.ceil(this.H / CHUNK);
    this.buckets = new Map(); // chunk index -> {deposits:[], decor:[]}
    this.explored = new Uint8Array(this.W * this.H);
    this.buildPalette();
    this.generate();
    this.placeDeposits();
    this.placeDecor();
    this.initMap();
  }

  /* ---------------- basic queries ---------------- */
  idx(x, y) { return y * this.W + x; }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return 2;
    return this.tiles[y * this.W + x];
  }
  solid(x, y) { return this.get(x, y) !== 0; }
  solidPx(px, py) { return this.solid(Math.floor(px / TILE), Math.floor(py / TILE)); }
  depthM(py) { return Math.max(0, py / TILE * METERS_PER_TILE); }

  buildPalette() {
    const centers = ZONES.map(z => (z.y0 + z.y1) / 2);
    centers[0] = 10;
    this.palette = new Array(this.H);
    for (let ty = 0; ty < this.H; ty++) {
      let i = 0;
      while (i < centers.length - 1 && ty > centers[i + 1]) i++;
      const a = ZONES[i], b = ZONES[Math.min(i + 1, ZONES.length - 1)];
      const t = i >= centers.length - 1 ? 0 : clamp((ty - centers[i]) / (centers[i + 1] - centers[i]), 0, 1);
      const s = smoothstep(0, 1, t);
      this.palette[ty] = {
        water: mixC(a.water, b.water, s), rock: mixC(a.rock, b.rock, s), edge: mixC(a.edge, b.edge, s),
        snow: mixC(a.snow, b.snow, s), dark: lerp(a.dark, b.dark, s), drone: lerp(a.drone, b.drone, s),
      };
    }
  }
  paletteAtPx(py) { return this.palette[clamp(Math.floor(py / TILE), 0, this.H - 1)]; }

  /* ---------------- generation ---------------- */
  carveCircle(cx, cy, r) {
    const r2 = r * r;
    const x0 = Math.max(3, Math.floor(cx - r)), x1 = Math.min(this.W - 4, Math.ceil(cx + r));
    const y0 = Math.max(5, Math.floor(cy - r)), y1 = Math.min(this.H - 3, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) this.tiles[y * this.W + x] = 0;
    }
  }
  carveEllipse(cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 3 || x >= this.W - 3 || y < 5 || y >= this.H - 3) continue;
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const wob = 1 + (noise2(x * 0.3, y * 0.3, this.seed) - 0.5) * 0.35;
      if (dx * dx + dy * dy <= wob) this.tiles[y * this.W + x] = 0;
    }
  }
  worm(x0, y0, x1, y1, rmin, rmax, wander = 0.8) {
    const r = this.rng;
    let x = x0, y = y0, ang = Math.atan2(y1 - y0, x1 - x0), steps = 0;
    const s = r.int(0, 9999);
    while (dist(x, y, x1, y1) > 2 && steps < 6000) {
      const target = Math.atan2(y1 - y, x1 - x);
      ang += angleDiff(ang, target) * 0.12 + (r.next() - 0.5) * wander;
      x += Math.cos(ang) * 1.3; y += Math.sin(ang) * 1.3;
      x = clamp(x, 5, this.W - 6); y = clamp(y, 6, this.H - 5);
      const rad = lerp(rmin, rmax, noise1(steps * 0.045, s));
      this.carveCircle(x, y, rad);
      if (steps % 3 === 0) this.pathPts.push([x, y]);
      steps++;
    }
  }
  freeWorm(x, y, len, rmin, rmax, yMin, yMax) {
    const r = this.rng;
    let ang = (r.chance(0.5) ? 0 : Math.PI) + r.range(-0.7, 0.7);
    const s = r.int(0, 9999);
    for (let i = 0; i < len; i++) {
      ang += r.range(-0.32, 0.32);
      const horiz = Math.cos(ang) >= 0 ? 0 : Math.PI;
      ang += angleDiff(ang, horiz) * 0.035;
      if (y < yMin + 4) ang += angleDiff(ang, Math.PI / 2) * 0.3;
      if (y > yMax - 4) ang += angleDiff(ang, -Math.PI / 2) * 0.3;
      if (x < 10) ang += angleDiff(ang, 0) * 0.3;
      if (x > this.W - 10) ang += angleDiff(ang, Math.PI) * 0.3;
      x += Math.cos(ang) * 1.3; y += Math.sin(ang) * 1.3;
      x = clamp(x, 5, this.W - 6); y = clamp(y, 6, this.H - 5);
      this.carveCircle(x, y, lerp(rmin, rmax, noise1(i * 0.07, s)));
      if (i % 4 === 0) this.pathPts.push([x, y]);
    }
    return [x, y];
  }
  nearestPathPt(x, y, yMin = -1e9, yMax = 1e9) {
    let best = null, bd = Infinity;
    for (const p of this.pathPts) {
      if (p[1] < yMin || p[1] > yMax) continue;
      const d = dist2(x, y, p[0], p[1]);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  randomPathPt(yMin, yMax) {
    for (let i = 0; i < 200; i++) {
      const p = this.rng.pick(this.pathPts);
      if (p[1] >= yMin && p[1] <= yMax) return p;
    }
    return null;
  }

  generate() {
    const r = this.rng, W = this.W;
    this.tiles.fill(1);
    const cx = W >> 1;
    const side = r.chance(0.5) ? 1 : -1;
    const P = this.pois;
    const def = (key, tx, ty, rx, ry) => { P[key] = { key, tx: clamp(tx, rx + 8, W - rx - 8), ty, rx, ry }; };
    def('station', cx, 15, 36, 10);
    def('rig', cx + side * r.int(55, 85), r.int(75, 100), 14, 8);
    def('kestrel', cx - side * r.int(40, 90), r.int(150, 172), 16, 9);
    def('vesna', cx + side * r.int(20, 90), r.int(272, 292), 24, 11);
    def('skeleton', cx - side * r.int(30, 80), r.int(345, 368), 40, 15);
    def('marrow', cx + side * r.int(30, 100), r.int(412, 426), 14, 8);
    def('relay', cx - side * r.int(10, 70), r.int(442, 452), 14, 9);
    def('gate', cx + side * r.int(0, 40), r.int(582, 590), 20, 9);
    def('abyss', P.gate.tx + r.int(-25, 25), 698, 36, 14);

    for (const k in P) { const p = P[k]; this.carveEllipse(p.tx, p.ty, p.rx, p.ry); }

    // Main chain linking all points of interest (guarantees the story path exists).
    const chain = ['station', 'rig', 'kestrel', 'vesna', 'skeleton', 'marrow', 'relay', 'gate'];
    for (let i = 0; i < chain.length - 1; i++) {
      const a = P[chain[i]], b = P[chain[i + 1]];
      const deep = b.ty > 200;
      this.worm(a.tx, a.ty + (i === 0 ? 6 : 0), b.tx, b.ty, deep ? 3 : 3.2, deep ? 5.5 : 5, 0.9);
    }
    // Secondary descending route for loops.
    let px = cx - side * 30, py = 20;
    const waypoints = [[cx - side * r.int(80, 130), r.int(60, 110)], [cx + side * r.int(-40, 40), r.int(180, 230)],
      [cx - side * r.int(60, 130), r.int(300, 340)], [cx + side * r.int(70, 130), r.int(380, 400)], [P.relay.tx, P.relay.ty]];
    for (const [wx, wy] of waypoints) { this.worm(px, py, clamp(wx, 12, W - 12), wy, 2.6, 4.6, 1.0); px = clamp(wx, 12, W - 12); py = wy; }
    // Trench: narrow descending chasm from the gate to the abyss.
    this.worm(P.gate.tx, P.gate.ty + 4, P.abyss.tx, P.abyss.ty, 2.4, 4.2, 1.1);

    // Side branches and chambers per zone.
    const branchPlan = [[34, 200, 26], [200, 400, 30], [400, 600, 28], [600, 690, 4]];
    for (const [y0, y1, n] of branchPlan) {
      for (let i = 0; i < n; i++) {
        const p = this.randomPathPt(y0 + 3, y1 - 3);
        if (!p) continue;
        const [ex, ey] = this.freeWorm(p[0], p[1], r.int(40, 120), 1.9, r.range(3.2, 5.2), y0, y1);
        if (r.chance(0.45)) this.carveEllipse(ex, ey, r.int(5, 12), r.int(4, 8));
      }
      const chambers = y1 > 600 ? 1 : 8;
      for (let i = 0; i < chambers; i++) {
        const ex = r.int(20, W - 20), ey = r.int(y0 + 10, y1 - 10);
        this.carveEllipse(ex, ey, r.int(7, 16), r.int(5, 10));
        const np = this.nearestPathPt(ex, ey, y0, y1);
        if (np) this.worm(ex, ey, np[0], np[1], 2.2, 3.8, 0.8);
      }
    }

    this.roughen();
    this.smooth(); this.smooth();
    for (const k in P) { const p = P[k]; this.carveEllipse(p.tx, p.ty, p.rx * 0.75, p.ry * 0.7); }
    this.carveStationClearance();
    this.floodSeal();

    // Border + ice
    for (let y = 0; y < this.H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x < 2 || x >= W - 2 || y >= this.H - 2) this.tiles[i] = 2;
      else if (y < 5) this.tiles[i] = 3;
    }

    for (const k in P) {
      const p = P[k];
      p.x = p.tx * TILE + TILE / 2; p.y = p.ty * TILE + TILE / 2;
      let fy = p.ty;
      while (fy < this.H - 1 && !this.solid(p.tx, fy)) fy++;
      p.floorY = fy * TILE;
      let cy = p.ty;
      while (cy > 0 && !this.solid(p.tx, cy)) cy--;
      p.ceilY = (cy + 1) * TILE;
    }
    P.station.dockX = P.station.x;
    P.station.dockY = P.station.ceilY + 150;
  }

  carveStationClearance() {
    const P = this.pois.station;
    for (let y = 5; y < 27; y++) for (let x = P.tx - 24; x <= P.tx + 24; x++) {
      const dx = (x - P.tx) / 24, dy = (y - 5) / 22;
      if (dx * dx + dy * dy <= 1) this.tiles[y * this.W + x] = 0;
    }
  }

  roughen() {
    const W = this.W, t = this.tiles, copy = t.slice();
    for (let y = 6; y < this.H - 3; y++) for (let x = 3; x < W - 3; x++) {
      const i = y * W + x;
      let edge = false;
      if (copy[i - 1] !== copy[i] || copy[i + 1] !== copy[i] || copy[i - W] !== copy[i] || copy[i + W] !== copy[i]) edge = true;
      if (edge && hash2(x, y, this.seed + 3) < 0.14) t[i] = copy[i] ? 0 : 1;
    }
  }

  smooth() {
    const W = this.W, t = this.tiles, copy = t.slice();
    for (let y = 6; y < this.H - 3; y++) for (let x = 3; x < W - 3; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += copy[(y + dy) * W + x + dx] ? 1 : 0;
      t[y * W + x] = n >= 5 ? 1 : 0;
    }
  }

  floodSeal() {
    const W = this.W, H = this.H, t = this.tiles;
    const seen = new Uint8Array(W * H);
    const q = new Int32Array(W * H);
    const s = this.pois.station;
    let head = 0, tail = 0;
    const start = s.ty * W + s.tx;
    t[start] = 0;
    q[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const i = q[head++];
      const x = i % W;
      const nb = [i - 1, i + 1, i - W, i + W];
      for (let k = 0; k < 4; k++) {
        const j = nb[k];
        if (j < 0 || j >= W * H) continue;
        if ((k === 0 && x === 0) || (k === 1 && x === W - 1)) continue;
        if (!seen[j] && t[j] === 0) { seen[j] = 1; q[tail++] = j; }
      }
    }
    for (let i = 0; i < W * H; i++) if (t[i] === 0 && !seen[i]) t[i] = 1;
  }

  bucket(px, py) {
    const k = Math.floor(px / (CHUNK * TILE)) + Math.floor(py / (CHUNK * TILE)) * this.chunksW;
    let b = this.buckets.get(k);
    if (!b) { b = { deposits: [], decor: [] }; this.buckets.set(k, b); }
    return b;
  }

  airDirs(tx, ty) {
    const d = [];
    if (!this.solid(tx, ty - 1)) d.push([0, -1]);
    if (!this.solid(tx, ty + 1)) d.push([0, 1]);
    if (!this.solid(tx - 1, ty)) d.push([-1, 0]);
    if (!this.solid(tx + 1, ty)) d.push([1, 0]);
    return d;
  }

  placeDeposits() {
    const r = new RNG(this.seed ^ 0xabc123);
    const occupied = new Set();
    for (let ty = SAFE_DEPTH_TILES - 4; ty < 600; ty++) {
      const z = zoneAt(ty);
      if (!z.res) continue;
      for (let tx = 3; tx < this.W - 3; tx++) {
        if (this.tiles[ty * this.W + tx] !== 1) continue;
        const dirs = this.airDirs(tx, ty);
        if (!dirs.length) continue;
        if (!r.chance(z.depositChance)) continue;
        const key = (tx >> 2) + ',' + (ty >> 2);
        if (occupied.has(key)) continue;
        occupied.add(key);
        // Deeper parts of a zone skew toward its rarer minerals.
        const type = r.weighted(z.res);
        const amount = type === 'resonite' ? r.int(2, 4) : r.int(3, 6);
        const d = {
          id: this.deposits.length, tx, ty, type, amount, max: amount, progress: 0,
          x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, dir: dirs[0], seed: r.int(0, 1e6),
        };
        this.deposits.push(d);
        this.depositMap[ty * this.W + tx] = d.id + 1;
        this.bucket(d.x, d.y).deposits.push(d);
      }
    }
  }

  depositAtTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return null;
    const v = this.depositMap[ty * this.W + tx];
    if (!v) return null;
    const d = this.deposits[v - 1];
    return d.amount > 0 ? d : null;
  }

  /** Called when docking: some depleted deposits slowly re-crystallise. */
  regrowDeposits() {
    let n = 0;
    for (const d of this.deposits) {
      if (d.amount <= 0 && Math.random() < 0.2) {
        d.amount = d.type === 'resonite' ? randInt(1, 3) : randInt(2, 4);
        d.max = d.amount; d.progress = 0; n++;
      }
    }
    return n;
  }

  placeDecor() {
    const r = new RNG(this.seed ^ 0x5eed);
    for (let ty = 8; ty < this.H - 3; ty++) for (let tx = 3; tx < this.W - 3; tx++) {
      if (this.tiles[ty * this.W + tx] !== 0) continue;
      const floor = this.solid(tx, ty + 1), ceil = this.solid(tx, ty - 1);
      const z = zoneAt(ty).id;
      const x = tx * TILE + r.range(2, 14);
      let d = null;
      if (floor && ty > 30) {
        const roll = r.next();
        if (z === 1) {
          if (roll < 0.09) d = { kind: 'kelp', x, y: (ty + 1) * TILE, h: r.int(18, 60) };
          else if (roll < 0.12) d = { kind: 'glowstalk', x, y: (ty + 1) * TILE, h: r.int(6, 14), color: [90, 230, 210] };
        } else if (z === 2) {
          if (roll < 0.05) d = { kind: 'coral', x, y: (ty + 1) * TILE, h: r.int(8, 22) };
          else if (roll < 0.085) d = { kind: 'glowstalk', x, y: (ty + 1) * TILE, h: r.int(6, 16), color: [150, 240, 140] };
          else if (roll < 0.1) d = { kind: 'bones', x, y: (ty + 1) * TILE, h: r.int(6, 12) };
        } else if (z === 3) {
          if (roll < 0.05) d = { kind: 'tubeworm', x, y: (ty + 1) * TILE, h: r.int(8, 20), color: [230, 70, 90] };
          else if (roll < 0.065) d = { kind: 'bones', x, y: (ty + 1) * TILE, h: r.int(6, 14) };
        } else if (z === 4) {
          if (roll < 0.03) d = { kind: 'tubeworm', x, y: (ty + 1) * TILE, h: r.int(10, 26), color: [140, 90, 230] };
        }
      } else if (ceil && ty > 34 && z >= 2 && r.chance(0.035)) {
        d = { kind: 'strand', x, y: ty * TILE, h: r.int(14, 50), color: z === 2 ? [120, 220, 255] : [200, 120, 255] };
      }
      if (d) { d.seed = r.next() * 100; this.decor.push(d); this.bucket(d.x, d.y).decor.push(d); }
    }
  }

  /* ---------------- sonar map ---------------- */
  initMap() {
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.W; this.mapCanvas.height = this.H;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapData = this.mapCtx.createImageData(this.W, this.H);
    this.mapDirty = true;
  }
  paintMapTile(tx, ty) {
    const i = ty * this.W + tx, o = i * 4, d = this.mapData.data;
    const t = this.tiles[i];
    if (t === 0) { d[o] = 6; d[o + 1] = 34; d[o + 2] = 36; d[o + 3] = 255; }
    else {
      const edge = !this.solid(tx - 1, ty) || !this.solid(tx + 1, ty) || !this.solid(tx, ty - 1) || !this.solid(tx, ty + 1);
      if (edge) { d[o] = 70; d[o + 1] = 190; d[o + 2] = 150; d[o + 3] = 255; }
      else { d[o] = 12; d[o + 1] = 40; d[o + 2] = 36; d[o + 3] = 255; }
    }
  }
  reveal(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return;
    const i = ty * this.W + tx;
    if (this.explored[i]) return;
    this.explored[i] = 1;
    this.paintMapTile(tx, ty);
    this.mapDirty = true;
  }
  revealRadius(px, py, rTiles) {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
    for (let y = -rTiles; y <= rTiles; y++) for (let x = -rTiles; x <= rTiles; x++) {
      if (x * x + y * y <= rTiles * rTiles) this.reveal(cx + x, cy + y);
    }
  }
  loadExplored(bits) {
    this.explored = bits;
    for (let ty = 0; ty < this.H; ty++) for (let tx = 0; tx < this.W; tx++) if (bits[ty * this.W + tx]) this.paintMapTile(tx, ty);
    this.mapDirty = true;
  }
  flushMap() {
    if (this.mapDirty) { this.mapCtx.putImageData(this.mapData, 0, 0); this.mapDirty = false; }
  }

  /* ---------------- raycasting (DDA) ---------------- */
  raycast(x0, y0, dx, dy, maxDist) {
    let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
    if (this.solid(tx, ty)) return { hit: true, dist: 0, x: x0, y: y0, tx, ty };
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMX = dx > 0 ? ((tx + 1) * TILE - x0) / dx : dx < 0 ? (tx * TILE - x0) / dx : Infinity;
    let tMY = dy > 0 ? ((ty + 1) * TILE - y0) / dy : dy < 0 ? (ty * TILE - y0) / dy : Infinity;
    let t = 0;
    for (let guard = 0; guard < 2000; guard++) {
      if (tMX < tMY) { t = tMX; tMX += tDX; tx += stepX; } else { t = tMY; tMY += tDY; ty += stepY; }
      if (t > maxDist) break;
      if (this.solid(tx, ty)) return { hit: true, dist: t, x: x0 + dx * t, y: y0 + dy * t, tx, ty };
    }
    return { hit: false, dist: maxDist, x: x0 + dx * maxDist, y: y0 + dy * maxDist, tx: -1, ty: -1 };
  }
  lineOfSight(x0, y0, x1, y1) {
    const d = dist(x0, y0, x1, y1);
    if (d < 1) return true;
    const h = this.raycast(x0, y0, (x1 - x0) / d, (y1 - y0) / d, d);
    return !h.hit;
  }

  randomAirNear(px, py, minD, maxD, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * TAU, d = rand(minD, maxD);
      const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (ty < 6 || ty >= this.H - 3) continue;
      if (!this.solid(tx, ty) && !this.solid(tx + 1, ty) && !this.solid(tx - 1, ty) && !this.solid(tx, ty + 1) && !this.solid(tx, ty - 1)) {
        return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, tx, ty };
      }
    }
    return null;
  }

  /* ---------------- rendering ---------------- */
  renderChunk(cx, cy) {
    const size = CHUNK * TILE;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const seed = this.seed;
    for (let ly = 0; ly < CHUNK; ly++) {
      const ty = cy * CHUNK + ly;
      if (ty >= this.H) break;
      const pal = this.palette[ty];
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = cx * CHUNK + lx;
        if (tx >= this.W) break;
        const t = this.get(tx, ty);
        const X = lx * TILE, Y = ly * TILE;
        const n = hash2(tx, ty, seed);
        if (t !== 0) {
          let base = pal.rock;
          if (t === 3) base = [70, 96, 110];
          const nb = noise2(tx * 0.18, ty * 0.18, seed + 11);
          g.fillStyle = rgb(scaleC(base, 0.92 + nb * 0.5 + n * 0.1));
          g.fillRect(X, Y, TILE, TILE);
          // speckles / strata
          g.fillStyle = rgb(scaleC(base, 0.7 + n * 0.35));
          if (n > 0.55) g.fillRect(X + ((n * 97) | 0) % 12, Y + ((n * 53) | 0) % 12, 3, 2);
          if (n < 0.2) g.fillRect(X + 2, Y + ((n * 60) | 0) % 14, 9, 1);
          if (t === 3) { g.fillStyle = 'rgba(170,210,230,0.25)'; g.fillRect(X, Y + (n * 12 | 0), TILE, 2); }
          // lit edges facing open water
          const edge = t === 3 ? [150, 190, 210] : pal.edge;
          const up = !this.solid(tx, ty - 1), dn = !this.solid(tx, ty + 1);
          const lf = !this.solid(tx - 1, ty), rt = !this.solid(tx + 1, ty);
          if (up || dn || lf || rt) {
            g.fillStyle = rgb(scaleC(edge, 1 + n * 0.3));
            if (up) { g.fillRect(X, Y, TILE, 3); g.fillStyle = rgb(scaleC(edge, 0.5)); g.fillRect(X, Y + 3, TILE, 2); g.fillStyle = rgb(scaleC(edge, 0.8 + n * 0.3)); }
            if (dn) g.fillRect(X, Y + TILE - 2, TILE, 2);
            if (lf) g.fillRect(X, Y, 2, TILE);
            if (rt) g.fillRect(X + TILE - 2, Y, 2, TILE);
          }
        } else {
          // smooth diagonal corners and add hanging rock / rubble
          const up = this.solid(tx, ty - 1), dn = this.solid(tx, ty + 1);
          const lf = this.solid(tx - 1, ty), rt = this.solid(tx + 1, ty);
          const rockC = rgb(scaleC(pal.rock, 0.85));
          const edgeC = rgb(scaleC(pal.edge, 0.85));
          g.fillStyle = rockC;
          const tri = (ax, ay, bx, by, cx2, cy2) => { g.beginPath(); g.moveTo(X + ax, Y + ay); g.lineTo(X + bx, Y + by); g.lineTo(X + cx2, Y + cy2); g.closePath(); g.fill(); };
          if (up && lf && !dn && !rt) { tri(0, 0, TILE, 0, 0, TILE); g.strokeStyle = edgeC; g.lineWidth = 2; g.beginPath(); g.moveTo(X + TILE, Y); g.lineTo(X, Y + TILE); g.stroke(); }
          if (up && rt && !dn && !lf) { tri(0, 0, TILE, 0, TILE, TILE); g.strokeStyle = edgeC; g.lineWidth = 2; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + TILE, Y + TILE); g.stroke(); }
          if (dn && lf && !up && !rt) { tri(0, 0, 0, TILE, TILE, TILE); g.fillStyle = edgeC; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + TILE, Y + TILE); g.lineTo(X + TILE - 3, Y + TILE); g.lineTo(X, Y + 3); g.fill(); }
          if (dn && rt && !up && !lf) { tri(TILE, 0, TILE, TILE, 0, TILE); g.fillStyle = edgeC; g.beginPath(); g.moveTo(X + TILE, Y); g.lineTo(X, Y + TILE); g.lineTo(X + 3, Y + TILE); g.lineTo(X + TILE, Y + 3); g.fill(); }
          if (up && !dn && n > 0.78) {
            g.fillStyle = rockC;
            const w = 3 + (n * 40 | 0) % 6, h = 5 + (n * 90 | 0) % 11, ox = (n * 131 | 0) % (TILE - w);
            g.beginPath(); g.moveTo(X + ox, Y); g.lineTo(X + ox + w, Y); g.lineTo(X + ox + w / 2, Y + h); g.fill();
          }
          if (dn && !up && n < 0.12) {
            g.fillStyle = rockC;
            g.fillRect(X + (n * 300 | 0) % 10, Y + TILE - 3, 5, 3);
          }
        }
      }
    }
    return c;
  }

  getChunk(cx, cy) {
    const key = cx + cy * this.chunksW;
    let c = this.chunks.get(key);
    if (c) { this.chunks.delete(key); this.chunks.set(key, c); return c; }
    c = this.renderChunk(cx, cy);
    this.chunks.set(key, c);
    if (this.chunks.size > 36) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  }

  forVisibleChunks(cam, vw, vh, fn) {
    const size = CHUNK * TILE;
    const cx0 = Math.max(0, Math.floor(cam.x / size)), cx1 = Math.min(this.chunksW - 1, Math.floor((cam.x + vw) / size));
    const cy0 = Math.max(0, Math.floor(cam.y / size)), cy1 = Math.min(this.chunksH - 1, Math.floor((cam.y + vh) / size));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) fn(cx, cy);
  }

  draw(ctx, cam, vw, vh) {
    const size = CHUNK * TILE;
    this.forVisibleChunks(cam, vw, vh, (cx, cy) => {
      ctx.drawImage(this.getChunk(cx, cy), Math.round(cx * size - cam.x), Math.round(cy * size - cam.y));
    });
  }

  visibleBuckets(cam, vw, vh, margin = 64) {
    const out = [];
    const size = CHUNK * TILE;
    const cx0 = Math.max(0, Math.floor((cam.x - margin) / size)), cx1 = Math.min(this.chunksW - 1, Math.floor((cam.x + vw + margin) / size));
    const cy0 = Math.max(0, Math.floor((cam.y - margin) / size)), cy1 = Math.min(this.chunksH - 1, Math.floor((cam.y + vh + margin) / size));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const b = this.buckets.get(cx + cy * this.chunksW);
      if (b) out.push(b);
    }
    return out;
  }

  drawDeposits(ctx, cam, vw, vh, t) {
    for (const b of this.visibleBuckets(cam, vw, vh)) for (const d of b.deposits) {
      if (d.amount <= 0) continue;
      const sx = Math.round(d.tx * TILE - cam.x), sy = Math.round(d.ty * TILE - cam.y);
      if (sx < -TILE || sy < -TILE || sx > vw || sy > vh) continue;
      const R = RESOURCES[d.type];
      ctx.fillStyle = rgb(scaleC(R.color, 0.45));
      ctx.fillRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
      const rr = new RNG(d.seed);
      const n = 3 + Math.min(3, d.amount);
      for (let i = 0; i < n; i++) {
        const cx = sx + 3 + rr.next() * 10 + d.dir[0] * 3, cy = sy + 3 + rr.next() * 10 + d.dir[1] * 3;
        const s = 2 + rr.next() * 3;
        ctx.fillStyle = rgb(R.color);
        ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.7, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.7, cy); ctx.fill();
        ctx.fillStyle = rgb(R.light);
        ctx.fillRect(Math.round(cx - 1), Math.round(cy - s + 1), 1, 2);
      }
      // occasional glint so ore can be spotted at the edge of the light
      const gl = Math.sin(t * 2.2 + d.seed) > 0.93;
      if (gl) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx + 7, sy + 6, 2, 2); }
    }
  }

  drawDecor(ctx, cam, vw, vh, t) {
    for (const b of this.visibleBuckets(cam, vw, vh, 80)) for (const d of b.decor) {
      const sx = d.x - cam.x, sy = d.y - cam.y;
      if (sx < -60 || sx > vw + 60 || sy < -80 || sy > vh + 80) continue;
      const sway = Math.sin(t * 0.8 + d.seed) * 0.5;
      if (d.kind === 'kelp') {
        ctx.strokeStyle = 'rgb(28,58,40)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        for (let i = 1; i <= 6; i++) {
          const f = i / 6;
          ctx.lineTo(sx + Math.sin(t * 0.9 + d.seed + f * 3) * 6 * f, sy - d.h * f);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgb(40,78,50)';
        for (let i = 2; i < 6; i += 2) ctx.fillRect(sx + Math.sin(t * 0.9 + d.seed + i / 2) * 5 * i / 6 - 3, sy - d.h * i / 6, 4, 2);
      } else if (d.kind === 'coral') {
        ctx.strokeStyle = 'rgb(150,150,130)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - d.h);
        ctx.moveTo(sx, sy - d.h * 0.5); ctx.lineTo(sx - d.h * 0.35, sy - d.h * 0.85);
        ctx.moveTo(sx, sy - d.h * 0.35); ctx.lineTo(sx + d.h * 0.4, sy - d.h * 0.7);
        ctx.stroke();
      } else if (d.kind === 'bones') {
        ctx.strokeStyle = 'rgb(170,168,150)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, d.h, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx + 6, sy, d.h * 0.8, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
        ctx.fillStyle = 'rgb(170,168,150)'; ctx.fillRect(sx - d.h, sy - 2, d.h * 2, 2);
      } else if (d.kind === 'glowstalk' || d.kind === 'tubeworm') {
        ctx.strokeStyle = d.kind === 'tubeworm' ? 'rgb(120,110,100)' : 'rgb(40,70,60)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sway * 3, sy - d.h); ctx.stroke();
        if (d.kind === 'tubeworm') { ctx.beginPath(); ctx.moveTo(sx + 4, sy); ctx.lineTo(sx + 4 + sway * 2, sy - d.h * 0.7); ctx.stroke(); }
      } else if (d.kind === 'strand') {
        ctx.strokeStyle = 'rgba(80,100,110,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sway * 4, sy + d.h); ctx.stroke();
      }
    }
  }

  /** Emissive decor: drawn after darkness so it glows. Also pushes lights. */
  decorLights(cam, vw, vh, t, lights) {
    for (const b of this.visibleBuckets(cam, vw, vh, 60)) {
      for (const d of b.decor) {
        if (!d.color) continue;
        const sway = Math.sin(t * 0.8 + d.seed) * 0.5;
        const p = 0.6 + 0.4 * Math.sin(t * 1.3 + d.seed * 3);
        let x = d.x, y = d.y;
        if (d.kind === 'strand') { x += sway * 4; y += d.h; } else { x += sway * 3; y -= d.h; }
        lights.push({ x, y, r: 26 + d.h * 0.6, i: 0.28 * p, color: d.color, glow: 0.35 * p, dot: 2 });
      }
      for (const d of b.deposits) {
        if (d.amount <= 0) continue;
        const R = RESOURCES[d.type];
        if (!R.glow) continue;
        const p = d.type === 'resonite' ? 0.6 + 0.4 * Math.sin(t * 2 + d.seed) : 0.7;
        lights.push({ x: d.x, y: d.y, r: d.type === 'resonite' ? 56 : 36, i: 0.35 * p, color: R.glow, glow: 0.3 * p });
      }
    }
  }
}
