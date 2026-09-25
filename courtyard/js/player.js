// First-person player: movement, collisions, weapons, shooting, reloading and melee.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const PC = CONFIG.player;
const WEAPONS = CONFIG.weapons;
const vmBox = new THREE.BoxGeometry(1, 1, 1);

function vmMat(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }); }

function vmPart(parent, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(vmBox, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

// Viewmodels are built in camera space: +x right, +y up, -z forward.
function buildPistol() {
  const g = new THREE.Group();
  const metal = vmMat(0x2b2d31), grip = vmMat(0x4a3526), hand = vmMat(0xc99a78), sleeve = vmMat(0x3b4a33);
  vmPart(g, metal, 0, 0.05, -0.12, 0.07, 0.08, 0.34); // slide
  vmPart(g, metal, 0, 0.0, -0.08, 0.06, 0.05, 0.22);
  vmPart(g, grip, 0, -0.08, 0.0, 0.06, 0.16, 0.08).rotation.x = -0.25;
  vmPart(g, metal, 0, 0.1, -0.27, 0.015, 0.02, 0.02); // front sight
  vmPart(g, hand, 0, -0.1, 0.03, 0.1, 0.1, 0.12);
  vmPart(g, sleeve, 0.02, -0.14, 0.2, 0.13, 0.13, 0.3);
  g.userData.muzzle = new THREE.Vector3(0, 0.05, -0.31);
  g.userData.rest = new THREE.Vector3(0.2, -0.19, -0.5);
  g.scale.setScalar(0.75);
  return g;
}

function buildRifle() {
  const g = new THREE.Group();
  const metal = vmMat(0x25272a), poly = vmMat(0x3a3b33), hand = vmMat(0xc99a78), sleeve = vmMat(0x3b4a33);
  vmPart(g, metal, 0, 0.03, -0.2, 0.07, 0.1, 0.5); // receiver
  vmPart(g, poly, 0, 0.03, -0.55, 0.08, 0.08, 0.25); // handguard
  vmPart(g, metal, 0, 0.04, -0.78, 0.025, 0.025, 0.25); // barrel
  vmPart(g, metal, 0, 0.11, -0.2, 0.03, 0.04, 0.3); // top rail
  vmPart(g, metal, 0, 0.16, -0.12, 0.05, 0.05, 0.08); // rear sight
  vmPart(g, poly, 0, -0.1, -0.28, 0.05, 0.18, 0.08).rotation.x = 0.2; // magazine
  vmPart(g, poly, 0, -0.07, -0.05, 0.05, 0.13, 0.06).rotation.x = -0.3; // grip
  vmPart(g, poly, 0, 0.0, 0.14, 0.06, 0.1, 0.22); // stock
  vmPart(g, hand, 0, -0.08, -0.03, 0.1, 0.1, 0.12);
  vmPart(g, hand, -0.02, -0.03, -0.55, 0.1, 0.08, 0.12);
  vmPart(g, sleeve, 0.02, -0.12, 0.2, 0.13, 0.13, 0.3);
  vmPart(g, sleeve, -0.12, -0.09, -0.38, 0.12, 0.12, 0.35).rotation.y = 0.5;
  g.userData.muzzle = new THREE.Vector3(0, 0.04, -0.92);
  g.userData.rest = new THREE.Vector3(0.19, -0.19, -0.42);
  g.scale.setScalar(0.8);
  return g;
}

export class Player {
  constructor(camera, vmScene) {
    this.camera = camera;
    this.vmScene = vmScene;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 200;

    this.views = { pistol: buildPistol(), rifle: buildRifle() };
    for (const v of Object.values(this.views)) { v.visible = false; vmScene.add(v); }
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 });
    this.flashMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), flashMat);
    this.flashMesh.scale.set(1, 1, 1.8);
    this.flashMesh.visible = false;
    vmScene.add(this.flashMesh);

    this.reset();
  }

  reset() {
    this.pos.set(PC.spawn.x, 0, PC.spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = 0; // facing -Z (north)
    this.pitch = 0;
    this.onGround = true;
    this.upgrades = { vitality: 0, damage: 0, reload: 0, mag: 0, speed: 0 };
    this.maxHealth = PC.maxHealth;
    this.health = this.maxHealth;
    this.sinceDamage = 99;
    this.dead = false;
    this.deathTime = 0;
    this.weapons = {
      pistol: { owned: true, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
      rifle: { owned: false, mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve },
    };
    this.current = 'pistol';
    this.fireCooldown = 0;
    this.reloading = false;
    this.reloadTime = 0;
    this.reloadTotal = 1;
    this.meleeCooldown = 0;
    this.meleeAnim = 0;
    this.switchAnim = 0;
    this.recoilKick = 0;
    this.flashTime = 0;
    this.bobPhase = 0;
    this.stepTimer = 0;
    this.hurtShake = 0;
    this.triggerHeld = false;
    this.stats = { shots: 0, hits: 0 };
    this.setView();
  }

  // ---------- derived stats ----------
  get def() { return WEAPONS[this.current]; }
  get weapon() { return this.weapons[this.current]; }
  magSize(id = this.current) { return Math.round(WEAPONS[id].mag * (1 + 0.3 * this.upgrades.mag)); }
  damageMult() { return 1 + 0.2 * this.upgrades.damage; }
  reloadDuration() { return this.def.reload * Math.pow(0.85, this.upgrades.reload); }
  speedMult() { return 1 + 0.08 * this.upgrades.speed; }

  applyUpgrade(id) {
    if (id === 'vitality') {
      this.upgrades.vitality++;
      this.maxHealth = PC.maxHealth + 25 * this.upgrades.vitality;
      this.health = Math.min(this.maxHealth, this.health + 25);
    } else if (id === 'rifle') {
      this.weapons.rifle.owned = true;
      this.weapons.rifle.mag = this.magSize('rifle');
      this.switchTo('rifle');
    } else if (id === 'ammo') {
      for (const k of Object.keys(this.weapons)) this.weapons[k].reserve = WEAPONS[k].reserve;
    } else if (id === 'heal') {
      this.health = this.maxHealth;
    } else {
      this.upgrades[id]++;
    }
  }

  setView() {
    for (const [k, v] of Object.entries(this.views)) v.visible = k === this.current;
  }

  switchTo(id) {
    if (!this.weapons[id].owned || id === this.current) return;
    this.current = id;
    this.reloading = false;
    this.switchAnim = 0.35;
    this.fireCooldown = 0.3;
    this.setView();
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  takeDamage(amount, fromPos) {
    if (this.dead) return;
    this.health -= amount;
    this.sinceDamage = 0;
    this.hurtShake = 0.25;
    this.onHurt?.(amount, fromPos);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deathTime = 0;
      this.reloading = false;
      this.onDeath?.();
    }
  }

  startReload(audio) {
    const w = this.weapon;
    if (this.reloading || w.mag >= this.magSize() || w.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTotal = this.reloadDuration();
    this.reloadTime = this.reloadTotal;
    audio.reloadStart();
    return true;
  }

  // ---------- per-frame ----------
  update(dt, input, ctx, active) {
    const { world, audio } = ctx;

    if (this.dead) {
      this.deathTime += dt;
      const t = Math.min(1, this.deathTime / 1.2);
      this.updateCamera(dt, 1.65 - t * 1.35, t * 0.9);
      return;
    }

    // look
    if (active) {
      const s = 0.0022 * input.sensitivity;
      this.yaw -= input.dx * s;
      this.pitch -= input.dy * s;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    }

    // move
    const k = active ? input.keys : new Set();
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && mz < 0 && !this.reloading;
    const len = Math.hypot(mx, mz);
    const speed = (sprint ? PC.sprintSpeed : PC.walkSpeed) * this.speedMult();
    let wx = 0, wz = 0;
    if (len > 0) {
      mx /= len; mz /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // rotate local (mx, mz) by yaw; local -Z is forward
      wx = mx * cos + mz * sin;
      wz = -mx * sin + mz * cos;
    }
    const accel = this.onGround ? 14 : 3;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, dt * accel);

    if (active && input.pressed.has('Space') && this.onGround) { this.vel.y = PC.jumpSpeed; this.onGround = false; }
    this.vel.y -= PC.gravity * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }
    world.resolveCircle(this.pos, PC.radius);

    // footsteps & head bob
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.bobPhase += dt * hs * 1.6;
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) { this.stepTimer = sprint ? 2.9 : 2.3; audio.footstep(sprint); }
    } else this.bobPhase += (Math.round(this.bobPhase / Math.PI) * Math.PI - this.bobPhase) * Math.min(1, dt * 6);

    // health regen
    this.sinceDamage += dt;
    if (this.sinceDamage > PC.regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + PC.regenRate * dt);
    }

    // place the camera before firing so shots use this frame's aim
    this.updateCamera(dt, PC.eye, 0);

    // weapon handling
    this.fireCooldown -= dt;
    this.meleeCooldown -= dt;
    if (active) {
      if (input.pressed.has('Digit1')) this.switchTo('pistol');
      if (input.pressed.has('Digit2')) this.switchTo('rifle');
      if (input.pressed.has('KeyQ')) this.switchTo(this.current === 'pistol' ? 'rifle' : 'pistol');
      if (input.pressed.has('KeyR')) this.startReload(audio);
      if (input.pressed.has('KeyV') || input.pressed.has('KeyF')) this.melee(ctx);

      const wantFire = this.def.auto ? input.mouseDown : input.mouseClicked;
      if (wantFire && this.fireCooldown <= 0 && this.meleeAnim <= 0 && this.switchAnim <= 0) {
        if (this.reloading) { /* can't fire mid-reload */ }
        else if (this.weapon.mag > 0) this.fire(ctx, hs, sprint);
        else if (input.mouseClicked) {
          audio.dryFire();
          this.fireCooldown = 0.25;
          if (!this.startReload(audio)) ctx.hud.flashAmmo();
        }
      }
    }

    // auto-reload an empty magazine
    if (!this.reloading && this.weapon.mag === 0 && this.weapon.reserve > 0 && this.fireCooldown <= 0) this.startReload(audio);

    if (this.reloading) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) {
        const w = this.weapon;
        const take = Math.min(this.magSize() - w.mag, w.reserve);
        w.mag += take;
        w.reserve -= take;
        this.reloading = false;
        audio.reloadEnd();
      }
    }

    this.updateViewmodel(dt, hs, sprint);
  }

  updateCamera(dt, eye, roll) {
    this.hurtShake = Math.max(0, this.hurtShake - dt);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 6);
    const bob = Math.sin(this.bobPhase * 2) * 0.045;
    const shake = this.hurtShake * 0.15;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * shake,
      this.pos.y + eye + bob,
      this.pos.z + (Math.random() - 0.5) * shake,
    );
    this.camera.rotation.set(this.pitch + this.recoilKick * 0.5, this.yaw, roll, 'YXZ');
  }

  updateViewmodel(dt, hs, sprint) {
    const v = this.views[this.current];
    const rest = v.userData.rest;
    const bobX = Math.cos(this.bobPhase) * 0.012 * Math.min(1, hs / 5);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.015 * Math.min(1, hs / 5);
    let x = rest.x + bobX, y = rest.y - bobY, z = rest.z;
    let rx = 0, ry = 0, rz = 0;

    // recoil
    z += this.recoilKick * 0.35;
    rx += this.recoilKick * 1.2;

    if (sprint) { x -= 0.05; y -= 0.04; ry += 0.6; rx -= 0.2; }

    if (this.reloading) {
      const p = 1 - this.reloadTime / this.reloadTotal; // 0..1
      const dip = Math.sin(p * Math.PI);
      y -= dip * 0.18; rx -= dip * 0.6; rz += dip * 0.5;
    }
    if (this.switchAnim > 0) {
      this.switchAnim -= dt;
      y -= Math.max(0, this.switchAnim) * 1.2;
    }
    if (this.meleeAnim > 0) {
      this.meleeAnim -= dt;
      const p = 1 - Math.max(0, this.meleeAnim) / 0.35;
      const s = Math.sin(p * Math.PI);
      x -= s * 0.25; z -= s * 0.15; ry += s * 0.9; rz += s * 0.6;
    }
    v.position.set(x, y, z);
    v.rotation.set(rx, ry, rz);

    this.flashTime -= dt;
    this.flashMesh.visible = this.flashTime > 0;
    if (this.flashMesh.visible) {
      this.flashMesh.position.copy(v.userData.muzzle).applyMatrix4(v.matrix);
      this.flashMesh.rotation.z = Math.random() * Math.PI;
    }
  }

  // World-space position of the muzzle, for tracers.
  muzzleWorld(out) {
    const v = this.views[this.current];
    v.updateMatrix();
    out.copy(v.userData.muzzle).applyMatrix4(v.matrix);
    this.camera.updateMatrixWorld();
    return this.camera.localToWorld(out);
  }

  fire(ctx, moveSpeed, sprint) {
    const { world, audio, effects } = ctx, game = ctx;
    const def = this.def;
    this.weapon.mag--;
    this.fireCooldown = def.fireInterval;
    this.recoilKick = Math.min(0.12, this.recoilKick + def.recoil * 2.2);
    this.pitch = Math.min(1.5, this.pitch + def.recoil * 0.6);
    this.yaw += (Math.random() - 0.5) * def.recoil * 0.4;
    this.flashTime = 0.05;
    game.muzzleLight(this.camera.position);
    audio.shot(def.sound);
    this.stats.shots++;

    // aim ray with spread
    this.camera.updateMatrixWorld();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const spread = def.spread + (sprint ? 0.05 : moveSpeed > 1 ? 0.012 : 0) + (this.onGround ? 0 : 0.04);
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread * 2;
    dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
    this.raycaster.set(origin, dir);

    const targets = [];
    for (const z of game.zombies) {
      if (!z.alive) continue;
      z.group.updateMatrixWorld(true); // hit-test against this frame's pose, not the last rendered one
      for (const p of z.parts) targets.push(p);
    }
    for (const m of world.solidMeshes) targets.push(m);
    const hits = this.raycaster.intersectObjects(targets, false);
    const hit = hits.find(h => h.object.visible);
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 120);
    effects.tracer(this.muzzleWorld(new THREE.Vector3()), end);

    if (!hit) return;
    const z = hit.object.userData.zombie;
    if (z) {
      const head = hit.object.userData.head;
      const dmg = def.damage * this.damageMult() * (head ? def.headMult : 1);
      this.stats.hits++;
      game.damageZombie(z, dmg, head ? 'head' : 'body', hit.point, dir);
    } else {
      effects.burst(hit.point, hit.object === world.ground ? 'dirt' : 'dust', 6, { speed: 2, up: 2, size: 0.05, life: 0.4 });
      effects.burst(hit.point, 'spark', 2, { speed: 3, up: 2, size: 0.03, life: 0.15 });
      audio.impact(hit.point);
    }
  }

  melee(ctx) {
    if (this.meleeCooldown > 0 || this.reloading) return;
    const { audio } = ctx, game = ctx;
    this.meleeCooldown = CONFIG.melee.cooldown;
    this.meleeAnim = 0.35;
    audio.melee();
    const fwd = this.forward(new THREE.Vector3());
    let best = null, bestD = Infinity;
    for (const z of game.zombies) {
      if (!z.alive) continue;
      const dx = z.pos.x - this.pos.x, dz = z.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > CONFIG.melee.range + z.radius) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / (d * Math.hypot(fwd.x, fwd.z) || 1);
      if (dot < 0.4) continue;
      if (d < bestD) { bestD = d; best = z; }
    }
    if (best) {
      const p = best.pos.clone(); p.y = 1.3 * best.scale;
      game.damageZombie(best, CONFIG.melee.damage * this.damageMult(), 'melee', p, fwd);
      // knockback
      best.vel.x += fwd.x * 4; best.vel.z += fwd.z * 4;
    }
  }
}
