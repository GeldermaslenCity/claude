// Low-poly zombies built from boxes, with chase / attack / death behaviour.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const ZC = CONFIG.zombie;
const box = new THREE.BoxGeometry(1, 1, 1);
const SKINS = [0x7f9a6a, 0x8aa07a, 0x6f8a5e, 0x9aa487];
const SHIRTS = [0x5a3a3a, 0x3a4a5a, 0x4a4a3a, 0x6a5a4a, 0x3a3a3a, 0x5a5a6a];
const PANTS = [0x2a2a3a, 0x3a3228, 0x26303a, 0x403a30];
const pick = a => a[(Math.random() * a.length) | 0];

let nextId = 1;

export class Zombie {
  constructor(type, stats) {
    this.id = nextId++;
    this.type = type;
    this.maxHealth = stats.health;
    this.health = stats.health;
    this.speed = stats.speed;
    this.damage = stats.damage;
    this.scale = type === 'brute' ? 1.3 : 1;
    this.radius = ZC.radius * this.scale;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.state = 'rising'; // rising | chase | attack | dying | dead
    this.stateTime = 0;
    this.attackCooldown = 0;
    this.phase = Math.random() * 10;
    this.groanTimer = 1 + Math.random() * 5;
    this.losTimer = Math.random() * 0.2;
    this.hasLOS = false;
    this.flash = 0;
    this.heading = 0;
    this.headless = false;
    this.stuckTimer = 0;
    this.build();
  }

  build() {
    const skinColor = this.type === 'brute' ? 0x6b7f5a : pick(SKINS);
    const shirtColor = this.type === 'runner' ? 0x7a2a2a : this.type === 'brute' ? 0x3a3530 : pick(SHIRTS);
    this.mats = [
      new THREE.MeshLambertMaterial({ color: skinColor, flatShading: true }),
      new THREE.MeshLambertMaterial({ color: shirtColor, flatShading: true }),
      new THREE.MeshLambertMaterial({ color: pick(PANTS), flatShading: true }),
    ];
    const [skin, shirt, pants] = this.mats;
    const g = new THREE.Group();
    this.group = g;
    g.scale.setScalar(this.scale);
    this.parts = [];
    const part = (parent, mat, x, y, z, sx, sy, sz, isHead = false) => {
      const m = new THREE.Mesh(box, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.userData.zombie = this;
      m.userData.head = isHead;
      parent.add(m);
      this.parts.push(m);
      return m;
    };
    const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };

    this.body = pivot(g, 0, 0.95, 0); // hips
    this.torso = pivot(this.body, 0, 0, 0);
    part(this.torso, shirt, 0, 0.35, 0, 0.56, 0.7, 0.3);
    // torn shirt detail
    part(this.torso, skin, 0.12, 0.12, 0.155, 0.16, 0.14, 0.02);
    this.headPivot = pivot(this.torso, 0, 0.72, 0);
    this.head = part(this.headPivot, skin, 0, 0.17, 0.02, 0.34, 0.36, 0.34, true);
    // glowing eyes and a jaw
    const eyeMat = new THREE.MeshBasicMaterial({ color: this.type === 'runner' ? 0xff5030 : 0xd8ff60 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(box, eyeMat);
      e.position.set(s * 0.08, 0.2, 0.19); e.scale.set(0.07, 0.05, 0.02);
      this.headPivot.add(e);
    }
    part(this.headPivot, skin, 0, 0.0, 0.07, 0.26, 0.08, 0.22, true); // jaw
    this.eyes = eyeMat;

    this.armL = pivot(this.torso, -0.36, 0.62, 0);
    this.armR = pivot(this.torso, 0.36, 0.62, 0);
    for (const a of [this.armL, this.armR]) {
      part(a, shirt, 0, -0.18, 0, 0.17, 0.36, 0.17);
      part(a, skin, 0, -0.52, 0, 0.14, 0.34, 0.14);
    }
    this.legL = pivot(this.body, -0.15, 0, 0);
    this.legR = pivot(this.body, 0.15, 0, 0);
    for (const l of [this.legL, this.legR]) {
      part(l, pants, 0, -0.45, 0, 0.21, 0.9, 0.22);
      part(l, skin, 0, -0.92, 0.05, 0.2, 0.08, 0.3);
    }
  }

  spawn(scene, x, z) {
    this.pos.set(x, 0, z);
    this.group.position.set(x, -1.9 * this.scale, z);
    scene.add(this.group);
  }

  hit(dmg) {
    this.health -= dmg;
    this.flash = 0.09;
    return this.health <= 0;
  }

  die(headshot) {
    this.state = 'dying';
    this.stateTime = 0;
    this.fallDir = Math.random() < 0.5 ? -1 : 1;
    if (headshot) { this.headPivot.visible = false; this.headless = true; }
  }

  get alive() { return this.state !== 'dying' && this.state !== 'dead'; }

  // World-space centre of the head, for blood effects.
  headWorld(out) { return this.head.getWorldPosition(out); }

  update(dt, ctx) {
    this.stateTime += dt;
    const { player, world, audio } = ctx;

    // hit flash
    if (this.flash > 0) {
      this.flash -= dt;
      const on = this.flash > 0;
      for (const m of this.mats) m.emissive.setHex(on ? 0x801010 : 0x000000);
    }

    if (this.state === 'rising') {
      const t = Math.min(1, this.stateTime / ZC.riseTime);
      this.group.position.y = (-1.9 + 1.9 * (1 - Math.pow(1 - t, 3))) * this.scale;
      this.armL.rotation.x = this.armR.rotation.x = -2.6 + t * 1.2;
      this.faceTowards(player.pos.x - this.pos.x, player.pos.z - this.pos.z, dt, 3);
      if (t >= 1) { this.state = 'chase'; this.stateTime = 0; }
      return;
    }

    if (this.state === 'dying') {
      const t = Math.min(1, this.stateTime / 0.55);
      this.body.rotation.x = -this.fallDir * t * (Math.PI / 2) * 0.95;
      this.body.position.y = 0.95 - t * 0.7;
      this.armL.rotation.x = this.armR.rotation.x = -0.5;
      if (this.stateTime > 2.5) this.group.position.y = -(this.stateTime - 2.5) * 0.6;
      if (this.stateTime > 4) this.state = 'dead';
      return;
    }

    // ---- alive: chase / attack ----
    this.attackCooldown -= dt;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 3 + Math.random() * 6;
      if (dist < 30) audio.groan(this.pos, this.type === 'brute' ? 0.7 : this.type === 'runner' ? 1.3 : 1);
    }

    if (this.state === 'attack') {
      this.vel.multiplyScalar(0.8);
      this.faceTowards(dx, dz, dt, 8);
      const t = this.stateTime / ZC.attackWindup;
      // arms raise then slam down
      const swing = t < 1 ? -1.6 - t * 1.0 : -2.6 + Math.min(1, (t - 1) * 4) * 2.2;
      this.armL.rotation.x = this.armR.rotation.x = swing;
      this.torso.rotation.x = t < 1 ? -0.15 * t : 0.3;
      if (!this.swung && this.stateTime >= ZC.attackWindup) {
        this.swung = true;
        audio.zombieAttack(this.pos);
        if (dist < ZC.hitRange * this.scale && !player.dead) player.takeDamage(this.damage, this.pos);
      }
      if (this.stateTime >= ZC.attackWindup + 0.3) {
        this.state = 'chase';
        this.stateTime = 0;
        this.attackCooldown = ZC.attackCooldown;
        this.torso.rotation.x = 0;
      }
    } else {
      // pick a steering target
      this.losTimer -= dt;
      if (this.losTimer <= 0) {
        this.losTimer = 0.2;
        this.hasLOS = dist < 3 || world.gridLineClear(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
      }
      let tx = player.pos.x, tz = player.pos.z;
      if (!this.hasLOS) {
        const wp = world.nextWaypoint(this.pos.x, this.pos.z);
        if (wp) { tx = wp.x; tz = wp.z; }
      }
      let sx = tx - this.pos.x, sz = tz - this.pos.z;
      const sl = Math.hypot(sx, sz) || 1;
      sx /= sl; sz /= sl;

      // separation from other zombies
      for (const o of ctx.zombies) {
        if (o === this || !o.alive || o.state === 'rising') continue;
        const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
        const d2 = ox * ox + oz * oz;
        if (d2 < 1.2 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          sx += (ox / d) * (1.1 - d) * 1.5;
          sz += (oz / d) * (1.1 - d) * 1.5;
        }
      }
      const l = Math.hypot(sx, sz) || 1;
      const speed = player.dead ? this.speed * 0.3 : this.speed;
      const desiredX = (sx / l) * speed, desiredZ = (sz / l) * speed;
      const k = Math.min(1, dt * 6);
      this.vel.x += (desiredX - this.vel.x) * k;
      this.vel.z += (desiredZ - this.vel.z) * k;

      if (dist < ZC.attackRange * this.scale && this.attackCooldown <= 0 && !player.dead) {
        this.state = 'attack';
        this.stateTime = 0;
        this.swung = false;
      }
      this.faceTowards(this.vel.x, this.vel.z, dt, 6);
    }

    // integrate and collide
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolveCircle(this.pos, this.radius);
    // keep out of the player
    const px = this.pos.x - player.pos.x, pz = this.pos.z - player.pos.z;
    const minD = this.radius + CONFIG.player.radius;
    const pd = Math.hypot(px, pz);
    if (pd < minD && pd > 1e-5) {
      const push = minD - pd;
      this.pos.x += (px / pd) * push * 0.75;
      this.pos.z += (pz / pd) * push * 0.75;
      player.pos.x -= (px / pd) * push * 0.25;
      player.pos.z -= (pz / pd) * push * 0.25;
      world.resolveCircle(this.pos, this.radius);
    }
    // stuck detection: if barely moving while chasing, nudge sideways
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (this.state === 'chase' && dist > 2 && moved < this.speed * dt * 0.15) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.6) {
        this.hasLOS = false; // fall back to the flow field
        this.vel.x += (Math.random() - 0.5) * 4;
        this.vel.z += (Math.random() - 0.5) * 4;
        this.stuckTimer = 0;
      }
    } else this.stuckTimer = 0;

    this.group.position.set(this.pos.x, 0, this.pos.z);

    // walk cycle
    const spd = Math.hypot(this.vel.x, this.vel.z);
    const cadence = this.type === 'runner' ? 2.6 : 1.9;
    this.phase += dt * spd * cadence;
    const swing = Math.sin(this.phase) * Math.min(0.7, spd * 0.35);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    if (this.state === 'chase') {
      const reach = this.type === 'runner' ? -1.2 : -1.45;
      this.armL.rotation.x = reach + Math.sin(this.phase * 0.5) * 0.15;
      this.armR.rotation.x = reach + Math.cos(this.phase * 0.5) * 0.15;
      this.torso.rotation.x = this.type === 'runner' ? 0.25 : 0.1;
      this.torso.rotation.z = Math.sin(this.phase * 0.5) * 0.08;
      this.body.position.y = 0.95 + Math.abs(Math.cos(this.phase)) * 0.04;
    }
  }

  faceTowards(dx, dz, dt, rate) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    const target = Math.atan2(dx, dz);
    let d = target - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, dt * rate);
    this.group.rotation.y = this.heading;
  }

  dispose(scene) {
    scene.remove(this.group);
    for (const m of this.mats) m.dispose();
    this.eyes.dispose();
  }
}
