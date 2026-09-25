// Pooled particles (blood, dust, sparks) and bullet tracers.
import * as THREE from 'three';

const MAX_PARTICLES = 220;
const MAX_TRACERS = 8;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.materials = {
      blood: new THREE.MeshBasicMaterial({ color: 0x7a0c0c }),
      dust: new THREE.MeshBasicMaterial({ color: 0x9a9280 }),
      spark: new THREE.MeshBasicMaterial({ color: 0xffd070 }),
      dirt: new THREE.MeshBasicMaterial({ color: 0x4a3a2a }),
    };
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const m = new THREE.Mesh(geo, this.materials.dust);
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1, size: 0.05, gravity: 9 });
    }
    this.next = 0;

    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.nextTracer = 0;
  }

  burst(pos, type, count, { speed = 3, up = 2, size = 0.06, life = 0.6, gravity = 9 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.next];
      this.next = (this.next + 1) % MAX_PARTICLES;
      p.mesh.material = this.materials[type];
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * speed, Math.random() * up, (Math.random() - 0.5) * speed);
      p.life = p.max = life * (0.6 + Math.random() * 0.8);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.gravity = gravity;
      p.mesh.scale.setScalar(p.size);
      p.mesh.visible = true;
    }
  }

  tracer(from, to) {
    const t = this.tracers[this.nextTracer];
    this.nextTracer = (this.nextTracer + 1) % MAX_TRACERS;
    const a = t.line.geometry.attributes.position;
    a.setXYZ(0, from.x, from.y, from.z);
    a.setXYZ(1, to.x, to.y, to.z);
    a.needsUpdate = true;
    t.life = 0.06;
    t.line.material.opacity = 0.8;
  }

  update(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.vel.set(0, 0, 0); }
      p.mesh.scale.setScalar(p.size * Math.min(1, p.life / p.max * 2));
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.06) * 0.8;
    }
  }

  clear() {
    for (const p of this.particles) { p.life = 0; p.mesh.visible = false; }
    for (const t of this.tracers) { t.life = 0; t.line.material.opacity = 0; }
  }
}
