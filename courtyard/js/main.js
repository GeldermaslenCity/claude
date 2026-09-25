// Game bootstrap: renderer, main loop, round flow, shop and screens.
import * as THREE from 'three';
import { CONFIG, UPGRADES } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Zombie } from './zombies.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';

const $ = id => document.getElementById(id);
const RC = CONFIG.round;
const TEST = new URLSearchParams(location.search).has('test');

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem('deadcourtyard.' + key);
    localStorage.setItem('deadcourtyard.' + key, value);
  } catch { /* storage may be unavailable (private mode); settings just won't persist */ }
  return null;
}

class Game {
  constructor() {
    this.canvas = $('game');
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      $('menu').classList.add('hidden');
      $('nowebgl').classList.remove('hidden');
      throw err;
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;

    // main scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x3d2a36, 22, 85);
    this.scene.background = new THREE.Color(0x3d2a36);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0x9a88b8, 0x3a2a20, 1.4));
    const sun = new THREE.DirectionalLight(0xffc89a, 1.9);
    sun.position.set(-26, 34, -40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 140 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 14, 1.5);
    this.scene.add(this.flashLight);
    this.flashLightTime = 0;

    // viewmodel scene, drawn on top so the gun never clips into walls
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xb0a0c8, 0x40302a, 1.6));
    const vmSun = new THREE.DirectionalLight(0xffd0a0, 1.6);
    vmSun.position.set(-1, 2, 1);
    this.vmScene.add(vmSun);

    this.world = new World(this.scene);
    this.effects = new Effects(this.scene);
    this.audio = new Audio();
    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.player = new Player(this.camera, this.vmScene);
    this.player.onHurt = () => { this.hud.damage(); this.audio.playerHurt(); };
    this.player.onDeath = () => this.onPlayerDeath();

    this.zombies = [];
    this.state = 'menu'; // menu | playing | shop | gameover
    this.paused = false;
    this.testMode = TEST;
    this.round = 0;
    this.points = 0;
    this.kills = 0;
    this.headshots = 0;
    this.flowTimer = 0;
    this.time = 0;

    this.input.onLockChange = locked => this.onLockChange(locked);
    this.bindUI();
    this.resize();
    addEventListener('resize', () => this.resize());

    // idle camera for the menu
    this.player.reset();
    this.player.yaw = 0.6;
    this.player.updateCamera(0, CONFIG.player.eye, 0);

    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- UI wiring ----------
  bindUI() {
    const sens = parseFloat(store('sens')) || 1;
    const volStored = store('vol');
    const vol = volStored === null ? 0.6 : parseFloat(volStored);
    this.setSensitivity(sens);
    this.setVolume(vol);
    for (const id of ['sens', 'sens2']) $(id).addEventListener('input', e => this.setSensitivity(parseFloat(e.target.value)));
    for (const id of ['vol', 'vol2']) $(id).addEventListener('input', e => this.setVolume(parseFloat(e.target.value)));

    $('btn-play').addEventListener('click', () => this.startGame());
    $('btn-restart').addEventListener('click', () => this.startGame());
    $('btn-restart-pause').addEventListener('click', () => this.startGame());
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-quit').addEventListener('click', () => this.toMenu());
    $('btn-menu').addEventListener('click', () => this.toMenu());
    $('btn-next').addEventListener('click', () => this.closeShop());
    document.addEventListener('pointerlockerror', () => {
      if (this.state === 'playing') {
        $('lock-msg').textContent = 'The browser refused mouse capture. Wait a second, then click Resume again.';
        this.pause();
      }
    });
    addEventListener('keydown', e => {
      if (e.code === 'KeyP' && this.state === 'playing' && !this.paused) { this.input.unlock(); this.pause(); }
      if (e.code === 'Enter' && this.state === 'shop') this.closeShop();
    });
    this.updateBest();
  }

  setSensitivity(v) {
    this.input.sensitivity = v;
    $('sens').value = $('sens2').value = v;
    $('sens-out').textContent = v.toFixed(2);
    store('sens', v);
  }

  setVolume(v) {
    this.audio.setVolume(v);
    $('vol').value = $('vol2').value = v;
    $('vol-out').textContent = Math.round(v * 100) + '%';
    store('vol', v);
  }

  updateBest() {
    const best = parseInt(store('best') || '0', 10);
    $('best').textContent = best > 0 ? `Best: survived ${best} round${best === 1 ? '' : 's'}` : '';
  }

  showOverlay(id) {
    for (const o of ['menu', 'pause', 'shop', 'gameover']) $(o).classList.toggle('hidden', o !== id);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.vmCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.updateProjectionMatrix();
  }

  // ---------- flow control ----------
  clearZombies() {
    for (const z of this.zombies) z.dispose(this.scene);
    this.zombies = [];
  }

  startGame() {
    this.audio.init();
    this.clearZombies();
    this.effects.clear();
    this.player.reset();
    this.round = 0;
    this.points = 0;
    this.kills = 0;
    this.headshots = 0;
    this.hud.show(true);
    this.showOverlay(null);
    this.requestLock();
    this.nextRound();
  }

  toMenu() {
    this.clearZombies();
    this.effects.clear();
    this.state = 'menu';
    this.paused = false;
    this.input.unlock();
    this.hud.show(false);
    this.updateBest();
    this.showOverlay('menu');
  }

  requestLock() {
    this.paused = false;
    this.input.clearButtons();
    if (this.testMode) return;
    this.input.lock();
    // If the browser silently ignores the request, fall back to the pause screen.
    clearTimeout(this.lockTimeout);
    this.lockTimeout = setTimeout(() => {
      if (this.state === 'playing' && !this.input.locked && !this.player.dead) this.pause();
    }, 1200);
  }

  onLockChange(locked) {
    if (locked) {
      this.input.mouseClicked = false; // the click that captured the mouse shouldn't fire the gun
      if (this.state === 'playing') { this.paused = false; this.showOverlay(null); }
    } else if (this.state === 'playing' && !this.player.dead && !this.testMode) {
      this.pause();
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.paused = true;
    this.showOverlay('pause');
  }

  resume() {
    this.audio.init();
    $('lock-msg').textContent = 'Click Resume to recapture the mouse.';
    this.showOverlay(null);
    this.requestLock();
  }

  nextRound() {
    this.round++;
    this.state = 'playing';
    this.phase = 'pre';
    this.phaseTimer = CONFIG.preRoundDelay;
    this.toSpawn = RC.count(this.round);
    this.spawnTimer = 0;
    // A free top-up so a player who ran dry can always fight: at least two magazines of pistol ammo.
    const pw = this.player.weapons.pistol;
    pw.reserve = Math.max(pw.reserve, this.player.magSize('pistol') * 2);
    this.hud.banner(`ROUND ${this.round}`, this.round === 1 ? 'They are coming.' : `${this.toSpawn} zombies incoming`, 2.8);
    this.audio.roundStart();
  }

  roundCleared() {
    this.phase = 'cleared';
    this.phaseTimer = 2.5;
    const bonus = CONFIG.points.roundBonusPerRound * this.round;
    this.addPoints(bonus);
    this.hud.banner(`ROUND ${this.round} SURVIVED`, `+${bonus} round bonus`, 2.4);
    this.audio.roundEnd();
    const best = parseInt(store('best') || '0', 10);
    if (this.round > best) store('best', this.round);
  }

  openShop() {
    this.state = 'shop';
    this.paused = false;
    this.shopTimer = CONFIG.intermission;
    this.input.unlock();
    $('shop-round').textContent = this.round;
    $('shop-next').textContent = this.round + 1;
    this.renderShop();
    this.showOverlay('shop');
  }

  closeShop() {
    if (this.state !== 'shop') return;
    this.audio.init();
    this.showOverlay(null);
    this.nextRound();
    this.requestLock();
  }

  onPlayerDeath() {
    this.audio.gameOver();
    this.hud.banner('', '', 0);
    this.deathTimer = 2.2;
  }

  showGameOver() {
    this.state = 'gameover';
    this.input.unlock();
    const survived = Math.max(0, this.round - 1);
    const best = parseInt(store('best') || '0', 10);
    if (survived > best) store('best', survived);
    $('go-rounds').textContent = survived;
    const acc = this.player.stats.shots ? Math.round((this.player.stats.hits / this.player.stats.shots) * 100) : 0;
    $('go-stats').innerHTML = [
      ['Reached round', this.round], ['Kills', this.kills], ['Headshots', this.headshots],
      ['Points', this.points], ['Accuracy', acc + '%'],
    ].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
    this.showOverlay('gameover');
  }

  // ---------- shop ----------
  upgradeLevel(u) {
    const p = this.player;
    if (u.id === 'rifle') return p.weapons.rifle.owned ? 1 : 0;
    if (u.consumable) return 0;
    return p.upgrades[u.id];
  }

  canBuy(u) {
    const p = this.player;
    const level = this.upgradeLevel(u);
    if (level >= u.max) return [false, 'Maxed'];
    if (u.id === 'heal' && p.health >= p.maxHealth) return [false, 'Full health'];
    if (u.id === 'ammo' && Object.entries(p.weapons).every(([k, w]) => !w.owned || w.reserve >= CONFIG.weapons[k].reserve)) return [false, 'Ammo full'];
    const cost = u.cost(level);
    if (this.points < cost) return [false, `${cost} pts`];
    return [true, `Buy: ${cost} pts`];
  }

  buy(id) {
    const u = UPGRADES.find(x => x.id === id);
    const [ok] = this.canBuy(u);
    if (!ok) { this.audio.denied(); return false; }
    this.points -= u.cost(this.upgradeLevel(u));
    this.player.applyUpgrade(id);
    this.audio.buy();
    this.renderShop();
    return true;
  }

  renderShop() {
    $('shop-points').textContent = this.points;
    const wrap = $('shop-items');
    wrap.innerHTML = '';
    for (const u of UPGRADES) {
      const level = this.upgradeLevel(u);
      const [ok, label] = this.canBuy(u);
      const div = document.createElement('div');
      div.className = 'item';
      const pips = u.consumable || u.max === 1 ? '' : Array.from({ length: u.max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      div.innerHTML = `<h3>${u.name}</h3><p>${u.desc}</p><div class="pips">${pips}</div>`;
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = !ok;
      b.dataset.id = u.id;
      b.addEventListener('click', () => this.buy(u.id));
      div.appendChild(b);
      wrap.appendChild(div);
    }
  }

  // ---------- combat ----------
  addPoints(n) {
    this.points += n;
    this.hud.popup('+' + n);
  }

  damageZombie(z, dmg, kind, point, dir) {
    if (!z.alive) return;
    this.effects.burst(point, 'blood', kind === 'head' ? 14 : 7, { speed: 2.5, up: 2.5, size: 0.07, life: 0.7 });
    this.audio.flesh(point);
    z.vel.x += dir.x * 0.8;
    z.vel.z += dir.z * 0.8;
    const killed = z.hit(dmg);
    if (!killed) {
      if (kind !== 'melee') this.addPoints(CONFIG.points.hit);
      this.hud.hit(false);
      this.audio.hitmarker();
      return;
    }
    const head = kind === 'head';
    z.die(head);
    this.kills++;
    if (head) {
      this.headshots++;
      this.audio.headshot();
      this.effects.burst(z.headWorld(new THREE.Vector3()), 'blood', 20, { speed: 4, up: 4, size: 0.09, life: 0.9 });
    }
    this.addPoints(head ? CONFIG.points.headshotKill : kind === 'melee' ? CONFIG.points.meleeKill : CONFIG.points.kill);
    this.hud.hit(true);
  }

  muzzleLight(pos) {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 25;
    this.flashLightTime = 0.05;
  }

  zombiesRemaining() {
    if (this.state !== 'playing') return 0;
    return this.toSpawn + this.zombies.filter(z => z.alive).length;
  }

  spawnZombie() {
    const r = this.round;
    const roll = Math.random();
    const type = roll < RC.bruteChance(r) ? 'brute' : roll < RC.bruteChance(r) + RC.runnerChance(r) ? 'runner' : 'walker';
    const baseHp = RC.health(r);
    const walk = RC.walkSpeed(r) * (0.85 + Math.random() * 0.3);
    const stats = {
      walker: { health: baseHp, speed: walk, damage: RC.damage(r) },
      runner: { health: Math.round(baseHp * 0.8), speed: Math.min(3.6 + r * 0.05, 5.0), damage: RC.damage(r) },
      brute: { health: Math.round(baseHp * 2.8), speed: walk * 0.8, damage: Math.round(RC.damage(r) * 1.6) },
    }[type];

    // pick a spawn point away from the player, preferring the farther half
    const p = this.player.pos;
    const candidates = this.world.spawnPoints
      .map(s => ({ s, d: Math.hypot(s.x - p.x, s.z - p.z) }))
      .filter(c => c.d > 12)
      .sort((a, b) => b.d - a.d);
    const pool = candidates.length ? candidates.slice(0, Math.max(3, Math.ceil(candidates.length * 0.6))) : this.world.spawnPoints.map(s => ({ s }));
    const sp = pool[(Math.random() * pool.length) | 0].s;
    const spot = this.world.nearestFree(sp.x + (Math.random() - 0.5) * 3, sp.z + (Math.random() - 0.5) * 3);

    const z = new Zombie(type, stats);
    z.spawn(this.scene, spot.x, spot.z);
    this.zombies.push(z);
    this.effects.burst(new THREE.Vector3(spot.x, 0.1, spot.z), 'dirt', 14, { speed: 2.5, up: 3, size: 0.12, life: 1.1 });
    this.audio.rise(z.pos);
    return z;
  }

  // ---------- main loop ----------
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render();
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    const running = (this.state === 'playing' && !this.paused) || this.state === 'shop' || this.state === 'gameover';
    const active = this.state === 'playing' && !this.paused && (this.input.locked || this.testMode);

    if (this.state === 'menu') {
      // slow orbit on the title screen
      this.camera.position.set(Math.sin(this.time * 0.05) * 14, 6, Math.cos(this.time * 0.05) * 14);
      this.camera.lookAt(0, 1.5, 0);
    }

    if (running) {
      this.player.update(dt, this.input, this, active);
      this.updateRound(dt);

      this.flowTimer -= dt;
      if (this.flowTimer <= 0 && this.zombies.length) {
        this.flowTimer = 0.25;
        this.world.computeFlow(this.player.pos.x, this.player.pos.z);
      }
      for (const z of this.zombies) z.update(dt, this);
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        if (this.zombies[i].state === 'dead') { this.zombies[i].dispose(this.scene); this.zombies.splice(i, 1); }
      }
      this.effects.update(dt);
    }

    if (this.state === 'shop') {
      this.shopTimer -= dt;
      $('shop-timer').textContent = Math.max(0, Math.ceil(this.shopTimer));
      if (this.shopTimer <= 0) this.closeShop();
    }

    if (this.player.dead && this.state === 'playing') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.showGameOver();
    }

    this.flashLightTime -= dt;
    if (this.flashLightTime <= 0) this.flashLight.intensity = 0;

    if (this.state !== 'menu') this.hud.update(dt, this);
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    this.audio.setListener(this.camera.position, fwd);
  }

  updateRound(dt) {
    if (this.state !== 'playing' || this.player.dead) return;
    this.phaseTimer -= dt;
    if (this.phase === 'pre') {
      if (this.phaseTimer <= 0) this.phase = 'wave';
    } else if (this.phase === 'wave') {
      this.spawnTimer -= dt;
      const alive = this.zombies.filter(z => z.alive).length;
      if (this.toSpawn > 0 && this.spawnTimer <= 0 && alive < RC.maxAlive(this.round)) {
        this.spawnZombie();
        this.toSpawn--;
        this.spawnTimer = RC.spawnInterval(this.round) * (0.6 + Math.random() * 0.8);
      } else if (this.toSpawn === 0 && alive === 0) this.roundCleared();
    } else if (this.phase === 'cleared') {
      if (this.phaseTimer <= 0) this.openShop();
    }
  }

  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.state !== 'menu' && !this.player.dead) {
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, this.vmCamera);
    }
  }

  // Test helper: advance the simulation deterministically.
  step(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) { this.update(dt); this.input.endFrame(); }
  }
}

window.game = new Game();
