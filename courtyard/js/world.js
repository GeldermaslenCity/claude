// The abandoned courtyard: scenery built from primitives, oriented-box colliders,
// and a navigation grid that zombies use to path around obstacles.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const HALF = CONFIG.mapHalf;
const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return mats.get(key);
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {x, z, hx, hz, cos, sin}
    this.solidMeshes = []; // meshes bullets can hit
    this.lamps = [];
    this.spawnPoints = [];
    this.root = new THREE.Group();
    scene.add(this.root);
    this.build();
    this.buildNavGrid();
  }

  // ---------- primitive helpers ----------

  // Adds a visual box. rotY follows three.js convention. Returns the mesh.
  box(x, y, z, sx, sy, sz, color, { rotY = 0, parent = this.root, solid = true, shadow = true, opts } = {}) {
    const m = new THREE.Mesh(boxGeo, mat(color, opts));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.y = rotY;
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    if (solid) this.solidMeshes.push(m);
    return m;
  }

  // Registers an oriented rectangular footprint that blocks movement.
  collider(x, z, sx, sz, rotY = 0) {
    // Local +X axis of a three.js object rotated by rotY points to (cos, -sin) in world XZ.
    this.colliders.push({ x, z, hx: sx / 2, hz: sz / 2, cos: Math.cos(rotY), sin: -Math.sin(rotY) });
  }

  solidBox(x, y, z, sx, sy, sz, color, rotY = 0) {
    const m = this.box(x, y, z, sx, sy, sz, color, { rotY });
    this.collider(x, z, sx, sz, rotY);
    return m;
  }

  // ---------- scene construction ----------

  build() {
    this.buildGround();
    this.buildSky();
    this.buildPerimeter();
    this.buildBuildings();
    this.buildCars();
    this.buildBarriers();
    this.buildProps();
    this.buildLamps();

    this.spawnPoints = [
      [0, -27], [-10, -27], [8, -27],
      [27, -13], [27, -1], [27, 11],
      [0, 27], [9, 27], [-13, 27],
      [-27, -12], [-27, 2], [-27, 13],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  }

  buildGround() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#4a4744';
    g.fillRect(0, 0, 512, 512);
    // speckle
    for (let i = 0; i < 9000; i++) {
      const v = 55 + Math.random() * 30;
      g.fillStyle = `rgba(${v},${v - 3},${v - 6},0.5)`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    // cracks
    g.strokeStyle = 'rgba(25,22,20,0.8)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      let x = Math.random() * 512, y = Math.random() * 512;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    // dark stains
    for (let i = 0; i < 10; i++) {
      g.fillStyle = 'rgba(30,25,22,0.25)';
      g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 40, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 40), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    this.ground = ground;
    this.solidMeshes.push(ground);

    // faded parking lines and dead grass patches
    for (let i = -3; i <= 3; i++) this.box(i * 3.2, 0.01, -9, 0.12, 0.01, 4, 0xb8b09a, { solid: false, shadow: false });
    for (const [x, z, s] of [[-12, -4, 5], [14, 8, 6], [-5, 15, 4], [6, -15, 5]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(s, 7), mat(0x5b6236));
      p.rotation.x = -Math.PI / 2; p.position.set(x, 0.02, z); p.receiveShadow = true;
      this.root.add(p);
    }
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(400, 24, 12);
    const top = new THREE.Color(0x1b1f3a), mid = new THREE.Color(0x8a4a4a), bot = new THREE.Color(0xd08a55);
    const colors = [];
    const pos = geo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / 400;
      if (h > 0.15) c.lerpColors(mid, top, Math.min(1, (h - 0.15) / 0.6));
      else c.lerpColors(bot, mid, Math.max(0, (h + 0.05) / 0.2));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.root.add(sky);
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 1), new THREE.MeshBasicMaterial({ color: 0xffe2b8, fog: false }));
    moon.position.set(-160, 120, -300);
    this.root.add(moon);
  }

  buildPerimeter() {
    const h = 3.4, t = 1, L = HALF * 2 + 1;
    const wall = 0x7d4c3a;
    this.solidBox(0, h / 2, -HALF - t / 2, L + t, h, t, wall);
    this.solidBox(0, h / 2, HALF + t / 2, L + t, h, t, wall);
    this.solidBox(-HALF - t / 2, h / 2, 0, t, h, L, wall);
    this.solidBox(HALF + t / 2, h / 2, 0, t, h, L, wall);
    // cap stones and pillars for silhouette
    for (let i = -HALF; i <= HALF; i += 6) {
      for (const [x, z] of [[i, -HALF - 0.5], [i, HALF + 0.5], [-HALF - 0.5, i], [HALF + 0.5, i]]) {
        this.box(x, h / 2 + 0.2, z, 1.4, h + 0.4, 1.4, 0x6b3f30, { solid: false });
      }
    }
    // chain-link style fence toppers
    for (const s of [-1, 1]) {
      this.box(0, h + 0.8, s * (HALF + 0.5), L, 1.2, 0.05, 0x333333, { solid: false, shadow: false, opts: { transparent: true, opacity: 0.35 } });
      this.box(s * (HALF + 0.5), h + 0.8, 0, 0.05, 1.2, L, 0x333333, { solid: false, shadow: false, opts: { transparent: true, opacity: 0.35 } });
    }
  }

  windows(cx, cz, sx, sz, h, floors, face, color = 0x1d2430) {
    // face: 'n' | 's' | 'e' | 'w' — which side of the building gets windows
    const floorH = h / floors;
    const along = face === 'n' || face === 's' ? sx : sz;
    const count = Math.max(1, Math.floor(along / 3));
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count - 0.5;
        const y = floorH * f + floorH * 0.55;
        const lit = Math.random() < 0.08;
        const c = lit ? 0xffc46b : (Math.random() < 0.3 ? 0x2b1d18 : color);
        const opts = lit ? { emissive: 0xffa040, emissiveIntensity: 0.8 } : undefined;
        if (face === 's') this.box(cx + t * sx, y, cz + sz / 2 + 0.03, 1.3, 1.4, 0.1, c, { solid: false, shadow: false, opts });
        if (face === 'n') this.box(cx + t * sx, y, cz - sz / 2 - 0.03, 1.3, 1.4, 0.1, c, { solid: false, shadow: false, opts });
        if (face === 'e') this.box(cx + sx / 2 + 0.03, y, cz + t * sz, 0.1, 1.4, 1.3, c, { solid: false, shadow: false, opts });
        if (face === 'w') this.box(cx - sx / 2 - 0.03, y, cz + t * sz, 0.1, 1.4, 1.3, c, { solid: false, shadow: false, opts });
      }
    }
  }

  buildBuildings() {
    // NW apartment block
    this.solidBox(-22.5, 4.5, -24.5, 14, 9, 10, 0x8c8577);
    this.box(-22.5, 9.2, -24.5, 14.4, 0.4, 10.4, 0x5c5850);
    this.windows(-22.5, -24.5, 14, 10, 9, 3, 's');
    this.windows(-22.5, -24.5, 14, 10, 9, 3, 'e');
    this.box(-22.5, 1.2, -19.45, 2, 2.4, 0.15, 0x3b2a20); // door
    this.box(-22.5, 2.6, -19, 3, 0.15, 1.2, 0x555555); // canopy

    // NE convenience store with awning and sign
    this.solidBox(21.5, 2.6, -25.5, 16, 5.2, 8, 0xa9a28c);
    this.box(21.5, 5.3, -25.5, 16.4, 0.3, 8.4, 0x6a655b);
    this.box(21.5, 3.1, -21.0, 16, 0.2, 1.6, 0x8b2a2a, { rotY: 0 }); // awning
    for (let i = 0; i < 4; i++) this.box(15 + i * 4.3, 1.4, -21.45, 3.2, 2.0, 0.1, 0x2d3a44, { solid: false, shadow: false });
    this.box(21.5, 4.3, -21.45, 6, 0.9, 0.2, 0x1e5d3a, { opts: { emissive: 0x1e5d3a, emissiveIntensity: 0.4 } });

    // SE garage with roll-up door
    this.solidBox(23.5, 2.75, 23.5, 12, 5.5, 12, 0x6f7a80);
    this.box(23.5, 5.6, 23.5, 12.4, 0.3, 12.4, 0x4c5357);
    this.box(17.45, 1.8, 23.5, 0.15, 3.6, 5, 0x9aa0a0);
    for (let i = 0; i < 6; i++) this.box(17.4, 0.3 + i * 0.6, 23.5, 0.1, 0.06, 5, 0x6d7373, { solid: false, shadow: false });
    this.windows(23.5, 23.5, 12, 12, 5.5, 1, 'n');

    // SW house with pitched roof
    this.solidBox(-24.5, 2.25, 24.5, 10, 4.5, 10, 0xb99f7a);
    const shape = new THREE.Shape([new THREE.Vector2(-5.6, 0), new THREE.Vector2(5.6, 0), new THREE.Vector2(0, 3)]);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 10.8, bevelEnabled: false }), mat(0x6d3226));
    roof.position.set(-24.5, 4.5, 24.5 - 5.4);
    roof.castShadow = true;
    this.root.add(roof);
    this.windows(-24.5, 24.5, 10, 10, 4.5, 1, 'n');
    this.windows(-24.5, 24.5, 10, 10, 4.5, 1, 'e');
    this.box(-19.45, 1.1, 22, 0.15, 2.2, 1.2, 0x4a2e1e); // door
    // porch
    this.box(-18.8, 0.15, 22, 1.2, 0.3, 3, 0x7a6048);

    // Bus shelter near the west wall
    this.solidBox(-27.5, 1.3, -6, 1.2, 2.6, 5, 0x4a5a6a);
    this.box(-27.2, 2.7, -6, 2.4, 0.15, 5.4, 0x3b4450);
  }

  car(x, z, rotY, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.root.add(g);
    this.box(0, 0.75, 0, 2.0, 0.8, 4.4, color, { parent: g });
    this.box(0, 1.45, -0.2, 1.8, 0.65, 2.3, color, { parent: g });
    this.box(0, 1.45, 0.96, 1.6, 0.55, 0.05, 0x1f2a33, { parent: g, solid: false });
    this.box(0, 1.45, -1.36, 1.6, 0.55, 0.05, 0x1f2a33, { parent: g, solid: false });
    this.box(0, 0.8, 2.22, 1.6, 0.25, 0.05, 0x999999, { parent: g, solid: false }); // bumper
    this.box(0.7, 0.85, 2.22, 0.35, 0.18, 0.04, 0xfff3c0, { parent: g, solid: false });
    this.box(-0.7, 0.85, 2.22, 0.35, 0.18, 0.04, 0xfff3c0, { parent: g, solid: false });
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 8);
    for (const [wx, wz] of [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]]) {
      const w = new THREE.Mesh(wheelGeo, mat(0x1a1a1a));
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.38, wz);
      w.castShadow = true;
      g.add(w);
    }
    this.collider(x, z, 2.1, 4.5, rotY);
  }

  buildCars() {
    this.car(-7, -12, 0.35, 0x7a2e2e);
    this.car(11, -7, 1.35, 0x2f5a78);
    this.car(-13, 7, -0.2, 0x5d6b3a);
    this.car(9, 15, 2.6, 0x8a8a8a);
    // van
    const vx = -2, vz = -22, vr = Math.PI / 2 - 0.1;
    const g = new THREE.Group(); g.position.set(vx, 0, vz); g.rotation.y = vr; this.root.add(g);
    this.box(0, 1.35, 0, 2.2, 2.2, 5.2, 0xd6cfb8, { parent: g });
    this.box(0, 1.8, 2.61, 1.9, 0.8, 0.05, 0x1f2a33, { parent: g, solid: false });
    this.box(1.11, 1.3, -0.5, 0.03, 0.4, 3, 0x8b2a2a, { parent: g, solid: false });
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8);
    for (const [wx, wz] of [[-1.1, 1.7], [1.1, 1.7], [-1.1, -1.7], [1.1, -1.7]]) {
      const w = new THREE.Mesh(wheelGeo, mat(0x1a1a1a)); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); g.add(w);
    }
    this.collider(vx, vz, 2.3, 5.3, vr);
  }

  jersey(x, z, rotY) {
    // concrete barrier: wide base, narrow top
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; this.root.add(g);
    this.box(0, 0.25, 0, 0.8, 0.5, 3, 0xb5b0a4, { parent: g });
    this.box(0, 0.75, 0, 0.4, 0.6, 3, 0xb5b0a4, { parent: g });
    this.box(0, 0.6, 0, 0.42, 0.12, 3.02, 0xc9a23a, { parent: g, solid: false, shadow: false });
    this.collider(x, z, 0.8, 3, rotY);
  }

  sandbags(x, z, rotY, len = 3) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; this.root.add(g);
    for (let row = 0; row < 3; row++) {
      const n = Math.floor(len / 0.7);
      for (let i = 0; i < n; i++) {
        const off = row % 2 ? 0.35 : 0;
        const px = -len / 2 + 0.35 + i * 0.7 + off;
        if (px > len / 2 - 0.2) continue;
        this.box(px, 0.17 + row * 0.3, 0, 0.66, 0.3, 0.5, 0x9c8a62, { parent: g });
      }
    }
    this.collider(x, z, len, 0.6, rotY);
  }

  buildBarriers() {
    this.jersey(-3.5, 19, 0.05); this.jersey(0.3, 19.3, Math.PI / 2); this.jersey(4, 19, -0.1);
    this.jersey(18, 4, Math.PI / 2 + 0.2); this.jersey(18, 8, Math.PI / 2 - 0.15);
    this.jersey(-18, -8, Math.PI / 2); this.jersey(-19, -3.5, 0.5);
    this.sandbags(13, -1, 0.3, 3.5);
    this.sandbags(-8, 13, -0.4, 3);
    this.sandbags(3, -13, 1.2, 2.8);
  }

  crate(x, z, s = 1.1, rotY = 0, stack = 1) {
    for (let i = 0; i < stack; i++) {
      this.box(x, s / 2 + i * s, z, s, s, s, i % 2 ? 0x8a6a3c : 0x7a5b30, { rotY: rotY + i * 0.3 });
    }
    this.collider(x, z, s * 1.05, s * 1.05, rotY);
  }

  barrel(x, z, color = 0x6a7a3a) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 8), mat(color));
    m.position.set(x, 0.55, z); m.castShadow = m.receiveShadow = true;
    this.root.add(m); this.solidMeshes.push(m);
    this.collider(x, z, 0.8, 0.8);
  }

  tree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 4, 6), mat(0x3d2c20));
    trunk.position.set(x, 2, z); trunk.castShadow = true;
    this.root.add(trunk); this.solidMeshes.push(trunk);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.8, 5), mat(0x3d2c20));
      const a = (i / 4) * Math.PI * 2 + Math.random();
      b.position.set(x + Math.cos(a) * 0.5, 3.2 + i * 0.2, z + Math.sin(a) * 0.5);
      b.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
      b.castShadow = true;
      this.root.add(b);
    }
    this.collider(x, z, 0.6, 0.6);
  }

  buildProps() {
    // central fountain (dry)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.7, 8), mat(0x9b968a));
    base.position.set(0, 0.35, 0); base.castShadow = base.receiveShadow = true;
    this.root.add(base); this.solidMeshes.push(base);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.1, 8), mat(0x3d3a33));
    inner.position.set(0, 0.68, 0); this.root.add(inner);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 6), mat(0x9b968a));
    pillar.position.set(0, 1.4, 0); pillar.castShadow = true; this.root.add(pillar); this.solidMeshes.push(pillar);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.4, 0.4, 8), mat(0x9b968a));
    bowl.position.set(0, 2.5, 0); bowl.castShadow = true; this.root.add(bowl); this.solidMeshes.push(bowl);
    this.collider(0, 0, 4.6, 4.6, Math.PI / 8);

    // crates, barrels, dumpsters
    this.crate(-10, -18, 1.2, 0.2, 2); this.crate(-8.7, -18.4, 1.1, -0.3);
    this.crate(14, 12, 1.2, 0.5); this.crate(15.2, 13.1, 1.0, 0.1, 2);
    this.crate(-15, 16, 1.1, 0.1);
    this.barrel(7, -18); this.barrel(7.9, -17.4, 0x8a3a2a); this.barrel(-17, 1);
    this.barrel(20, -12, 0x2a4a6a); this.barrel(-4, 9.5, 0x8a3a2a);
    // dumpsters
    this.solidBox(-12, 0.75, -26.8, 3, 1.5, 1.6, 0x2c5a3a);
    this.box(-12, 1.55, -26.8, 3.1, 0.1, 1.7, 0x234830, { solid: false });
    this.solidBox(12.2, 0.75, 27, 3, 1.5, 1.6, 0x2c5a3a);
    // benches
    this.solidBox(-5, 0.45, 4, 2.2, 0.15, 0.6, 0x6b4a2e);
    this.box(-5, 0.2, 4, 2.0, 0.4, 0.3, 0x333333, { solid: false });
    this.solidBox(5, 0.45, -4, 2.2, 0.15, 0.6, 0x6b4a2e);
    this.box(5, 0.2, -4, 2.0, 0.4, 0.3, 0x333333, { solid: false });
    // dead trees
    this.tree(-9, -2); this.tree(10, 4); this.tree(-2, -9); this.tree(20, -16); this.tree(-19, 12);
    // rubble
    for (let i = 0; i < 26; i++) {
      const x = (Math.random() - 0.5) * 54, z = (Math.random() - 0.5) * 54;
      const s = 0.15 + Math.random() * 0.3;
      this.box(x, s / 2, z, s, s, s * 1.3, 0x7a756a, { rotY: Math.random() * 3, solid: false });
    }
  }

  buildLamps() {
    const spots = [[-9, 10], [11, -12], [16, 14], [-16, -12]];
    spots.forEach(([x, z], i) => {
      this.box(x, 2.3, z, 0.18, 4.6, 0.18, 0x2a2a2a);
      this.box(x + 0.45, 4.6, z, 1.0, 0.12, 0.12, 0x2a2a2a);
      this.box(x + 0.9, 4.45, z, 0.4, 0.2, 0.3, 0xffd89a, { opts: { emissive: 0xffb050, emissiveIntensity: 1.2 } });
      this.collider(x, z, 0.35, 0.35);
      if (i < 2) { // only two real lights, to keep the shader cheap
        const l = new THREE.PointLight(0xffb060, 18, 16, 1.6);
        l.position.set(x + 0.9, 4.2, z);
        this.root.add(l);
        this.lamps.push(l);
      }
    });
  }

  // ---------- collision ----------

  // Pushes a circle (pos.x, pos.z, radius r) out of every collider. Returns true if it touched any.
  resolveCircle(pos, r) {
    let hit = false;
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      if (Math.abs(dx) > c.hx + c.hz + r + 0.1 || Math.abs(dz) > c.hx + c.hz + r + 0.1) continue;
      const lx = dx * c.cos + dz * c.sin;
      const lz = -dx * c.sin + dz * c.cos;
      const qx = Math.max(-c.hx, Math.min(c.hx, lx));
      const qz = Math.max(-c.hz, Math.min(c.hz, lz));
      const ox = lx - qx, oz = lz - qz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;
      let nx, nz, pen;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        nx = ox / d; nz = oz / d; pen = r - d;
      } else {
        const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
        if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + r; }
        else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + r; }
      }
      pos.x += (nx * c.cos - nz * c.sin) * pen;
      pos.z += (nx * c.sin + nz * c.cos) * pen;
      hit = true;
    }
    const lim = HALF - r;
    if (pos.x < -lim) { pos.x = -lim; hit = true; }
    if (pos.x > lim) { pos.x = lim; hit = true; }
    if (pos.z < -lim) { pos.z = -lim; hit = true; }
    if (pos.z > lim) { pos.z = lim; hit = true; }
    return hit;
  }

  // Distance from a point to the nearest collider surface (negative = inside).
  pointClearance(x, z) {
    let best = Infinity;
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z;
      const lx = dx * c.cos + dz * c.sin;
      const lz = -dx * c.sin + dz * c.cos;
      const ox = Math.abs(lx) - c.hx, oz = Math.abs(lz) - c.hz;
      const outside = Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
      const inside = Math.min(Math.max(ox, oz), 0);
      best = Math.min(best, outside + inside);
    }
    best = Math.min(best, HALF - Math.abs(x), HALF - Math.abs(z));
    return best;
  }

  // ---------- navigation grid & flow field ----------

  buildNavGrid() {
    this.cell = 1;
    this.n = Math.round((HALF * 2) / this.cell);
    const n = this.n;
    this.blocked = new Uint8Array(n * n);
    const r = CONFIG.zombie.radius + 0.1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const { x, z } = this.cellCenter(i, j);
        this.blocked[j * n + i] = this.pointClearance(x, z) < r ? 1 : 0;
      }
    }
    this.flow = new Float32Array(n * n).fill(Infinity);
    this.heap = new Int32Array(n * n * 8);
  }

  cellOf(x, z) {
    const i = Math.max(0, Math.min(this.n - 1, Math.floor((x + HALF) / this.cell)));
    const j = Math.max(0, Math.min(this.n - 1, Math.floor((z + HALF) / this.cell)));
    return [i, j];
  }

  cellCenter(i, j) {
    return { x: -HALF + (i + 0.5) * this.cell, z: -HALF + (j + 0.5) * this.cell };
  }

  isBlockedAt(x, z) {
    const [i, j] = this.cellOf(x, z);
    return this.blocked[j * this.n + i] === 1;
  }

  // Dijkstra from the target position over 8-connected free cells (no corner cutting).
  computeFlow(tx, tz) {
    const n = this.n, flow = this.flow, blocked = this.blocked;
    flow.fill(Infinity);
    const [si, sj] = this.cellOf(tx, tz);
    // simple binary heap of (cost, idx) pairs stored in parallel arrays
    const hc = [], hi = [];
    const push = (c, idx) => {
      let k = hc.length; hc.push(c); hi.push(idx);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hc[p] <= hc[k]) break;
        [hc[p], hc[k]] = [hc[k], hc[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p;
      }
    };
    const pop = () => {
      const c = hc[0], idx = hi[0];
      const lc = hc.pop(), li = hi.pop();
      if (hc.length) {
        hc[0] = lc; hi[0] = li;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < hc.length && hc[l] < hc[m]) m = l;
          if (r < hc.length && hc[r] < hc[m]) m = r;
          if (m === k) break;
          [hc[m], hc[k]] = [hc[k], hc[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m;
        }
      }
      return [c, idx];
    };
    const start = sj * n + si;
    flow[start] = 0;
    push(0, start);
    const D = Math.SQRT2;
    while (hc.length) {
      const [c, idx] = pop();
      if (c > flow[idx]) continue;
      const i = idx % n, j = (idx / n) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const nIdx = nj * n + ni;
          if (blocked[nIdx]) continue;
          if (di && dj && (blocked[j * n + ni] || blocked[nj * n + i])) continue;
          const nc = c + (di && dj ? D : 1);
          if (nc < flow[nIdx]) { flow[nIdx] = nc; push(nc, nIdx); }
        }
      }
    }
  }

  // Best next waypoint for something standing at (x, z), following the flow field.
  nextWaypoint(x, z) {
    const n = this.n, flow = this.flow, blocked = this.blocked;
    const [i, j] = this.cellOf(x, z);
    let best = flow[j * n + i], bi = -1, bj = -1;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const idx = nj * n + ni;
        if (blocked[idx]) continue;
        if (di && dj && (blocked[j * n + ni] || blocked[nj * n + i])) continue;
        if (flow[idx] < best) { best = flow[idx]; bi = ni; bj = nj; }
      }
    }
    if (bi < 0) return null;
    return this.cellCenter(bi, bj);
  }

  // Conservative line-of-sight test on the inflated nav grid.
  gridLineClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / 0.4);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (this.isBlockedAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  // Nearest walkable spot to (x, z) — used to make sure spawn points are valid.
  nearestFree(x, z) {
    if (!this.isBlockedAt(x, z)) return { x, z };
    const [ci, cj] = this.cellOf(x, z);
    for (let r = 1; r < 10; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
          if (!this.blocked[j * this.n + i]) return this.cellCenter(i, j);
        }
      }
    }
    return { x, z };
  }
}
