'use strict';
/* Game orchestrator: state machine, main loop, expedition flow, rendering pipeline. */

const Game = {
  canvas: null, ctx: null, vw: 960, vh: 540,
  state: 'title',          // title | play | pause | log | gameover | ending
  world: null, profile: null, sub: null, creatures: null, warden: null,
  sonar: null, particles: null, lighting: null, atmos: null,
  flares: [], shocks: [],
  cam: { x: 0, y: 0, w: 960, h: 540, shakeX: 0, shakeY: 0 },
  shakeAmt: 0, flash: 0,
  time: 0, last: 0, fps: 60,
  docked: false, mapOpen: false, prompt: null,
  tut: { moved: 0, pinged: false, toggled: false, mined: 0 },
  holdE: 0, revealT: 0, discoverT: 0,
  settings: null,
  signalPulse: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.lighting = new Lighting();
    this.settings = Save.loadSettings();
    Input.init(this.canvas);
    HUD.init();
    UI.init(this);
    this.applySettings(true);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointerdown', () => { AudioSys.ensure(); AudioSys.setVolumes(this.settings); }, { once: false });
    window.addEventListener('keydown', () => { AudioSys.ensure(); }, { once: true });
    this.grain = this.makeGrain();
    this.resize();
    this.enterTitle();
    requestAnimationFrame(t => this.frame(t));
  },

  applySettings(initial) {
    const s = this.settings;
    AudioSys.setVolumes(s);
    Save.saveSettings(s);
    if (!initial) this.resize();
  },

  resize() {
    const w = window.innerWidth || 960, h = window.innerHeight || 540;
    this.vh = this.settings.quality === 'high' ? 720 : 540;
    this.vw = Math.round(this.vh * w / h);
    this.canvas.width = this.vw; this.canvas.height = this.vh;
    this.cam.w = this.vw; this.cam.h = this.vh;
    this.lighting.resize(this.vw, this.vh);
    this.vignette = this.makeVignette();
    this.ctx.imageSmoothingEnabled = false;
  },

  makeGrain() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22; }
    g.putImageData(img, 0, 0);
    return c;
  },
  makeVignette() {
    const c = document.createElement('canvas'); c.width = this.vw; c.height = this.vh;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.3, this.vw / 2, this.vh / 2, this.vw * 0.62);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = grad; g.fillRect(0, 0, this.vw, this.vh);
    return c;
  },

  /* ---------------- flow ---------------- */
  enterTitle() {
    this.state = 'title';
    const saved = Save.read();
    const seed = saved ? saved.seed : 1337;
    if (!this.world || this.world.seed !== seed) this.world = new World(seed);
    this.titleCam = { x: this.world.pois.station.x - this.vw / 2, y: 40 };
    this.profile = null; this.sub = null;
    this.docked = false;
    this.particles = new Particles(this.world);
    this.atmos = new Atmosphere(this);
    this.flares = [];
    HUD.show(false); HUD.clearMessages();
    ['screen-station', 'screen-pause', 'screen-gameover', 'screen-ending', 'screen-map', 'screen-log'].forEach(id => UI.hide(id));
    UI.show('screen-title');
    UI.refreshTitle();
    AudioSys.silenceContinuous();
  },

  defaultProfile(seed) {
    const up = {};
    for (const k of UPGRADE_ORDER) up[k] = 0;
    return {
      version: 1, seed, credits: START_CREDITS, upgrades: up,
      story: { stage: 0, blackBox: false, relayRepaired: false, trenchUnlocked: false, complete: false },
      logs: [], discovered: ['station'], contracts: [], contractSeq: 0,
      tutorial: { active: true, step: 0 },
      stats: { dives: 0, deaths: 0, earned: 0, maxDepth: 0, mined: 0 },
      sub: null, deposits: {}, explored: '',
    };
  },

  newGame() {
    Save.clear();
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.world = new World(seed);
    this.profile = this.defaultProfile(seed);
    this.startSession(null);
    this.saveGame();
  },

  continueGame() {
    const data = Save.read();
    if (!data) { UI.refreshTitle(); return; }
    if (!this.world || this.world.seed !== data.seed) this.world = new World(data.seed);
    this.profile = Object.assign(this.defaultProfile(data.seed), data);
    for (const id in data.deposits) {
      const d = this.world.deposits[id];
      if (d) { d.amount = data.deposits[id]; d.progress = 0; }
    }
    this.world.loadExplored(Save.decodeBits(data.explored, this.world.W * this.world.H));
    this.startSession(data.sub);
  },

  startSession(subState) {
    const w = this.world;
    this.sub = new Submarine(this);
    this.sub.applyUpgrades(this.profile.upgrades);
    const s = this.sub;
    s.hull = s.stats.maxHull; s.oxygen = s.stats.maxOxygen; s.battery = s.stats.maxBattery; s.fuel = s.stats.maxFuel; s.flares = s.stats.flares;
    this.particles = new Particles(w);
    this.creatures = new CreatureManager(this);
    this.warden = new Warden(this);
    this.sonar = new Sonar(this);
    this.atmos = new Atmosphere(this);
    this.flares = []; this.shocks = [];
    this.tut = { moved: 0, pinged: false, toggled: false, mined: 0 };
    Missions.ensureContracts(this);
    UI.hide('screen-title');
    HUD.show(true); HUD.clearMessages();
    this.state = 'play';
    if (subState && !subState.docked) {
      Object.assign(s, { x: subState.x, y: subState.y, hull: subState.hull, oxygen: subState.oxygen, battery: subState.battery, fuel: subState.fuel, flares: subState.flares, cargo: subState.cargo || {}, lightsOn: subState.lightsOn !== false });
      s.applyUpgrades(this.profile.upgrades);
      this.docked = false;
      this.snapCamera();
      this.msg('Expedition resumed.', '');
    } else {
      if (subState) Object.assign(s, { hull: subState.hull, fuel: subState.fuel, flares: subState.flares, cargo: subState.cargo || {} });
      s.applyUpgrades(this.profile.upgrades);
      this.dock(true);
    }
    w.revealRadius(s.x, s.y, 12);
  },

  quitToTitle() {
    if (this.profile && this.state !== 'gameover') this.saveGame();
    UI.hide('screen-pause');
    this.enterTitle();
  },

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    const p = this.profile.stats;
    UI.$('pause-stats').innerHTML = `Dives ${p.dives} · Losses ${p.deaths} · Deepest ${fmt(p.maxDepth)} m<br>Earned ₵${fmt(p.earned)} · Ore mined ${p.mined}`;
    UI.show('screen-pause');
    AudioSys.silenceContinuous();
  },
  resume() {
    if (this.state !== 'pause') return;
    UI.hide('screen-pause'); UI.hide('screen-settings'); UI.hide('screen-howto');
    this.state = 'play';
  },

  saveGame() {
    if (!this.profile || !this.sub) return;
    const p = this.profile, s = this.sub, w = this.world;
    p.sub = { docked: this.docked, x: s.x, y: s.y, hull: s.hull, oxygen: s.oxygen, battery: s.battery, fuel: s.fuel, flares: s.flares, cargo: s.cargo, lightsOn: s.lightsOn };
    const dep = {};
    for (const d of w.deposits) if (d.amount !== d.max || d.amount <= 0) dep[d.id] = d.amount;
    p.deposits = dep;
    p.explored = Save.encodeBits(w.explored);
    p.seed = w.seed;
    Save.write(p);
  },

  /* ---------------- docking ---------------- */
  dock(silent) {
    const s = this.sub, P = this.world.pois.station;
    this.docked = true;
    s.x = P.dockX; s.y = P.dockY; s.vx = s.vy = 0; s.aim = 0; s.facing = 1;
    s.refillFree();
    s.noise = 0;
    this.creatures.clear();
    this.flares = [];
    this.warden.state = 'roam'; this.warden.awareness = 0;
    this.snapCamera();
    if (!silent) {
      AudioSys.sfx.dock();
      const regrown = this.world.regrowDeposits();
      if (regrown > 0 && this.profile.stats.dives > 1) this.msg('Survey: some mined-out veins have re-crystallised.', '');
    }
    const logs = Missions.onDock(this);
    Missions.updateTutorial(this);
    this.saveGame();
    UI.tab = logs.length ? 'missions' : (s.cargoUsed() ? 'market' : UI.tab);
    UI.openStation();
    for (const id of logs) { this.readLog(id); }
  },

  launch() {
    if (!this.docked) return;
    this.docked = false;
    UI.closeStation();
    this.sub.y += 30; this.sub.vy = 70;
    this.profile.stats.dives++;
    AudioSys.sfx.launch();
    this.particles.bubbles(this.sub.x, this.sub.y - 10, 20, 20);
    this.atmos.eventT = rand(25, 40);
    Missions.updateTutorial(this);
    this.saveGame();
    this.msg('Clamp released. Good hunting, pilot.', '');
  },

  sell(res, n) {
    const s = this.sub;
    n = Math.min(n, s.cargo[res] || 0);
    if (n <= 0) return;
    const v = n * RESOURCES[res].price;
    s.cargo[res] -= n;
    if (!s.cargo[res]) delete s.cargo[res];
    this.profile.credits += v;
    this.profile.stats.earned += v;
  },

  buyUpgrade(key) {
    const p = this.profile, U = UPGRADES[key];
    const lvl = p.upgrades[key];
    if (lvl >= U.levels.length - 1) return false;
    const next = lvl + 1;
    if (U.lockLast === 'trench' && next === U.levels.length - 1 && !p.story.trenchUnlocked) return false;
    const cost = U.costs[next];
    if (p.credits < cost) return false;
    p.credits -= cost;
    p.upgrades[key] = next;
    const s = this.sub;
    const oldMax = s.stats.maxHull;
    s.applyUpgrades(p.upgrades);
    if (key === 'hull') s.hull += s.stats.maxHull - oldMax;
    if (key === 'defense') s.flares = s.stats.flares;
    if (key === 'engine') s.fuel = s.stats.maxFuel;
    s.refillFree();
    this.msg(`Installed: ${U.names ? U.names[next] : U.name + ' Mk ' + ['I', 'II', 'III', 'IV'][next]}`, 'story');
    this.saveGame();
    return true;
  },

  /* ---------------- death ---------------- */
  gameOver() {
    const s = this.sub, p = this.profile;
    this.state = 'gameover';
    const lostValue = s.cargoValue();
    const salvage = Math.floor(lostValue * 0.2);
    const fee = Math.min(Math.floor(p.credits * 0.1), 150);
    let lostItems = [];
    if (p.story.blackBox) lostItems.push('The Kestrel black box');
    for (const c of p.contracts) if (c.carried) lostItems.push(c.name);
    Missions.onDeath(this);
    p.credits = Math.max(0, p.credits + salvage - fee);
    p.stats.deaths++;
    const depth = s.depthM();
    s.cargo = {};
    s.hull = s.stats.maxHull * 0.5;
    s.fuel = Math.max(s.fuel, s.stats.maxFuel * 0.4);
    AudioSys.silenceContinuous();
    AudioSys.sfx.collide(1); AudioSys.sfx.rumble(1);
    this.docked = true; // saved as "at the station"
    const P = this.world.pois.station;
    s.x = P.dockX; s.y = P.dockY; s.vx = s.vy = 0;
    this.saveGame();
    this.docked = false;
    s.x = this.deathX; s.y = this.deathY;
    UI.closeStation(); UI.closeMap(); this.mapOpen = false;
    UI.showGameOver({ cause: s.lastCause, depth, lostValue, salvage, fee, lostItems: lostItems.join(', ') });
  },

  relaunch() {
    UI.hide('screen-gameover');
    this.state = 'play';
    this.sub.hurt = 0;
    this.dock(true);
    AudioSys.sfx.dock();
    this.msg('Rebuilt hull fitted. The company has deducted the recovery fee.', 'warn');
  },

  /* ---------------- logs / ending ---------------- */
  readLog(id) {
    if (!LOGS[id]) return;
    if (!this.profile.logs.includes(id)) this.profile.logs.push(id);
    UI.showLog(id);
    if (this.state === 'play') this.state = 'log';
    AudioSys.silenceContinuous();
  },
  closeLog() {
    UI.hide('screen-log');
    if (this.state === 'log') this.state = 'play';
    if (this.docked) UI.renderStation();
  },
  triggerEnding() {
    const st = this.profile.story;
    st.stage = 7; st.complete = true;
    this.state = 'ending';
    AudioSys.silenceContinuous();
    AudioSys.sfx.wardenGroan(1, 0);
    setTimeout(() => AudioSys.sfx.signal(1), 3000);
    UI.showEnding();
    this.saveGame();
  },
  closeEnding() {
    UI.hide('screen-ending');
    HUD.show(true);
    if (this.state === 'ending') this.state = 'play';
  },

  /* ---------------- helpers used by subsystems ---------------- */
  msg(text, type) { HUD.message(text, type); },
  shake(a) { if (this.settings.shake) this.shakeAmt = Math.min(20, Math.max(this.shakeAmt, a)); },
  flashScreen(a) { this.flash = Math.max(this.flash, a); },
  mouseWorld() {
    const r = this.canvas.getBoundingClientRect();
    const mx = (Input.mouse.cx - r.left) / (r.width || 1) * this.vw;
    const my = (Input.mouse.cy - r.top) / (r.height || 1) * this.vh;
    return { x: mx + this.cam.x, y: my + this.cam.y };
  },
  objectiveTarget() { return this.profile ? Missions.targetPos(this) : null; },
  contractItems() {
    if (!this.profile) return [];
    return this.profile.contracts.filter(c => c.type === 'salvage' && !c.carried);
  },
  onSonarPing(ping) {
    this.tut.pinged = true;
    if (this.warden) this.warden.onPing(ping);
    // pings wake nearby hunters
    for (const c of this.creatures.list) {
      if (c.type === 'eel' && dist2(c.x, c.y, ping.x, ping.y) < 700 * 700 && c.state === 'lurk') c.state = 'hunt';
    }
  },
  onBigContact(c) {
    if (c.ghost || this.time - (this.lastBigMsg || -99) < 6) return;
    this.lastBigMsg = this.time;
    this.msg('Sonar: MASSIVE contact, bearing ' + bearing(this.sub.x, this.sub.y, c.x, c.y) + '°', 'danger');
  },
  onWardenStalk() {
    this.msg('Hydrophone: something large has changed course.', 'radio');
  },
  onMined(dep) {
    this.tut.mined++;
    this.profile.stats.mined++;
    if (dep.type === 'resonite') {
      this.sub.addNoise(20);
      if (this.warden) this.warden.awareness = Math.min(100, this.warden.awareness + 6);
    }
  },

  snapCamera() {
    const ox = this.docked ? this.vw * 0.26 : 0, oy = this.docked ? -40 : 0;
    this.cam.x = clamp(this.sub.x + ox - this.vw / 2, 0, this.world.pxW - this.vw);
    this.cam.y = clamp(this.sub.y + oy - this.vh / 2, 0, this.world.pxH - this.vh);
  },

  /* ---------------- loop ---------------- */
  frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000 || 0));
    this.last = ts;
    if (dt > 0) this.fps = lerp(this.fps, 1 / dt, 0.05);
    try {
      this.handleGlobalKeys();
      if (this.state === 'play') this.update(dt);
      else if (this.state === 'title') this.updateTitle(dt);
      this.render(dt);
      HUD.update(dt, this);
      if (this.mapOpen && Math.floor(ts / 300) !== Math.floor((ts - dt * 1000) / 300)) UI.drawMap();
    } catch (e) {
      console.error(e);
    }
    Input.endFrame();
    requestAnimationFrame(t => this.frame(t));
  },

  handleGlobalKeys() {
    const esc = Input.anyPressed('Escape', 'KeyP');
    if (esc && UI.closeTopModal()) return;
    if (this.state === 'play') {
      if (Input.anyPressed('Escape', 'KeyP')) {
        if (this.mapOpen) { this.mapOpen = false; UI.closeMap(); } else this.pause();
        return;
      }
      if (Input.anyPressed('Tab', 'KeyM')) {
        this.mapOpen = !this.mapOpen;
        if (this.mapOpen) UI.openMap(); else UI.closeMap();
      }
    } else if (this.state === 'pause') {
      if (esc) this.resume();
    } else if (this.state === 'log') {
      if (Input.anyPressed('KeyE', 'Escape', 'Enter', 'Space')) this.closeLog();
    }
  },

  updateTitle(dt) {
    this.time += dt;
    const P = this.world.pois.station;
    this.titleCam.x = P.x - this.vw / 2 + Math.sin(this.time * 0.05) * 200;
    this.titleCam.y = (Math.sin(this.time * 0.04 - 1.4) * 0.5 + 0.5) * 520;
    this.cam.x = clamp(this.titleCam.x, 0, this.world.pxW - this.vw);
    this.cam.y = clamp(this.titleCam.y, 0, this.world.pxH - this.vh);
    this.particles.update(dt);
    if (Math.random() < dt * 3) this.particles.bubbles(this.cam.x + Math.random() * this.vw, this.cam.y + this.vh + 5, 1, 2);
  },

  update(dt) {
    this.time += dt;
    const s = this.sub;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 18);
    this.flash = Math.max(0, this.flash - dt * 1.5);

    if (this.docked) {
      s.refillFree();
      this.sonar.update(dt);
      this.particles.update(dt);
      this.atmos.update(dt);
      this.updateCamera(dt);
      this.prompt = null;
      AudioSys.update({ engineOn: false, droneOn: true, droneFreq: 55, depth01: 0 });
      return;
    }

    s.update(dt);
    this.tut.moved = s.moved;

    // ---- actions ----
    if (Input.wasPressed('Space')) this.sonar.ping();
    if (Input.wasPressed('KeyF')) { s.lightsOn = !s.lightsOn; this.tut.toggled = true; AudioSys.sfx.click(); }
    if (Input.mouse.rightPressed) this.launchFlare();
    if (Input.wasPressed('KeyR')) this.shockPulse();

    this.sonar.update(dt);
    this.creatures.update(dt);
    this.warden.update(dt);
    this.updateFlares(dt);
    this.updateShocks(dt);
    this.particles.update(dt);
    this.atmos.update(dt);
    this.updateInteractions(dt);

    // passive map reveal around the sub
    this.revealT -= dt;
    if (this.revealT <= 0) { this.world.revealRadius(s.x, s.y, s.lightsActive ? 7 : 4); this.revealT = 0.3; }

    // discoveries
    this.discoverT -= dt;
    if (this.discoverT <= 0) {
      this.discoverT = 0.5;
      const P = this.world.pois;
      for (const k in P) {
        if (this.profile.discovered.includes(k)) continue;
        if (dist(s.x, s.y, P[k].x, P[k].y) < 300) {
          this.profile.discovered.push(k);
          if (k !== 'abyss') this.msg('Discovered: ' + POI_NAMES[k], 'story');
          if (k === 'skeleton') AudioSys.sfx.distantCall(0);
        }
      }
    }

    // ending
    if (this.profile.story.stage === 6) {
      const A = this.world.pois.abyss;
      if (dist(s.x, s.y, A.x, A.y) < 260) { this.triggerEnding(); return; }
    }

    const depth = s.depthM();
    if (depth > this.profile.stats.maxDepth) this.profile.stats.maxDepth = Math.floor(depth);
    Missions.updateTutorial(this);
    this.updateCamera(dt);

    const pal = this.world.paletteAtPx(s.y);
    AudioSys.update({
      engineOn: true, thrust: s.thrust01, silent: s.silent,
      laser: s.laser.on, laserHit: s.laser.hit,
      droneOn: true, droneFreq: pal.drone, depth01: clamp(s.y / this.world.pxH, 0, 1),
    });

    if (s.hull <= 0) { this.deathX = s.x; this.deathY = s.y; this.gameOver(); }
  },

  updateCamera(dt) {
    const s = this.sub;
    let lx = Math.cos(s.aim) * 60, ly = Math.sin(s.aim) * 40;
    if (this.docked) { lx = this.vw * 0.26; ly = -40; }
    const tx = clamp(s.x + lx - this.vw / 2, 0, this.world.pxW - this.vw);
    const ty = clamp(s.y + ly - this.vh / 2, 0, this.world.pxH - this.vh);
    this.cam.x = lerp(this.cam.x, tx, Math.min(1, dt * 4));
    this.cam.y = lerp(this.cam.y, ty, Math.min(1, dt * 4));
  },

  updateInteractions(dt) {
    const s = this.sub;
    this.prompt = null;
    // dock
    const P = this.world.pois.station;
    if (dist(s.x, s.y, P.dockX, P.dockY) < 80) {
      this.prompt = '[E] Dock at Anchor Station';
      if (Input.wasPressed('KeyE')) { this.dock(false); return; }
    }
    let best = null, bd = 70;
    for (const it of Missions.interactables(this)) {
      const d = dist(s.x, s.y, it.x, it.y);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) { this.holdE = 0; return; }
    if (best.kind === 'repair') {
      if (!Missions.canRepair(this)) {
        this.prompt = `Deep Relay 7 — <span class="bad">needs 4 Titanium and 2 Copper in the hold</span>`;
        this.holdE = 0;
        return;
      }
      if (Input.isDown('KeyE')) {
        this.holdE += dt;
        s.noise = Math.max(s.noise, 45 * s.stats.noiseMult);
        if (Math.random() < dt * 10) this.particles.sparks(best.x + rand(-8, 8), best.y - rand(40, 80), [255, 220, 150], 3);
        if (Math.random() < dt * 4) AudioSys.sfx.sparks();
        if (this.warden.active) this.warden.awareness = Math.min(100, this.warden.awareness + 3 * dt);
      } else this.holdE = Math.max(0, this.holdE - dt * 2);
      const pct = clamp(this.holdE / 6, 0, 1);
      this.prompt = `[HOLD E] Repair Deep Relay 7 — welding is loud<div class="bar"><div style="width:${(pct * 100).toFixed(0)}%"></div></div>`;
      if (this.holdE >= 6) { this.holdE = 0; Missions.completeRepair(this); }
      return;
    }
    this.holdE = 0;
    const read = best.kind === 'log' && this.profile.logs.includes(best.id) ? ' (read)' : '';
    this.prompt = `[E] ${best.label}${read}`;
    if (Input.wasPressed('KeyE')) Missions.interact(this, best);
  },

  launchFlare() {
    const s = this.sub;
    if (s.flares <= 0) { this.msg('No flares left.', 'warn'); AudioSys.sfx.error(); return; }
    s.flares--;
    const sp = 230;
    this.flares.push({ x: s.x + Math.cos(s.aim) * 20, y: s.y + Math.sin(s.aim) * 20, vx: Math.cos(s.aim) * sp + s.vx, vy: Math.sin(s.aim) * sp + s.vy, life: 22, stuck: false, seed: Math.random() * 10 });
    AudioSys.sfx.flare();
    s.addNoise(8);
  },

  updateFlares(dt) {
    const w = this.world;
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.life -= dt;
      if (f.life <= 0) { this.flares.splice(i, 1); continue; }
      if (!f.stuck) {
        f.vy += 25 * dt; f.vx *= Math.exp(-1.2 * dt); f.vy *= Math.exp(-1.2 * dt);
        const nx = f.x + f.vx * dt, ny = f.y + f.vy * dt;
        if (w.solidPx(nx, ny)) { f.stuck = true; f.vx = f.vy = 0; AudioSys.sfx.sparks(); }
        else { f.x = nx; f.y = ny; }
      }
      if (Math.random() < dt * 8) this.particles.bubbles(f.x, f.y, 1, 2);
    }
  },

  shockPulse() {
    const s = this.sub, st = s.stats;
    if (!st.shock) { this.msg('Shock pulse emitter not installed (Countermeasures Mk II).', 'warn'); AudioSys.sfx.error(); return; }
    if (s.shockCd > 0) return;
    if (s.battery < 20) { this.msg('Shock pulse needs 20 battery.', 'warn'); AudioSys.sfx.error(); return; }
    s.battery -= 20;
    s.shockCd = 8;
    s.addNoise(45);
    const radius = 110 + st.shock * 25;
    this.shocks.push({ x: s.x, y: s.y, r: 0, max: radius, life: 0.5 });
    this.creatures.stunAll(s.x, s.y, radius, st.shock);
    this.warden.onShock(s.x, s.y);
    AudioSys.sfx.shock();
    this.shake(4);
  },
  updateShocks(dt) {
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const k = this.shocks[i];
      k.life -= dt; k.r = k.max * (1 - k.life / 0.5);
      if (k.life <= 0) this.shocks.splice(i, 1);
    }
  },

  /* ---------------- rendering ---------------- */
  render(dt) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh, t = this.time;
    const w = this.world;
    if (!w) return;
    // camera with shake
    const cam = this.cam;
    const shx = this.shakeAmt > 0 ? rand(-1, 1) * this.shakeAmt : 0, shy = this.shakeAmt > 0 ? rand(-1, 1) * this.shakeAmt : 0;
    const rc = { x: Math.round(cam.x + shx), y: Math.round(cam.y + shy), w: vw, h: vh };

    this.atmos.drawBackdrop(ctx, rc, vw, vh, t);
    Structures.drawBack(ctx, this, rc, t);
    if (this.warden && this.state !== 'title') this.warden.draw(ctx, rc);
    w.draw(ctx, rc, vw, vh);
    w.drawDecor(ctx, rc, vw, vh, t);
    w.drawDeposits(ctx, rc, vw, vh, t);
    Structures.drawFront(ctx, this, rc, t);
    const pal = w.paletteAtPx(rc.y + vh / 2);
    this.atmos.drawSnow(ctx, rc, vw, vh, t, pal.snow);
    if (this.creatures && this.state !== 'title') this.creatures.draw(ctx, rc);
    for (const f of this.flares) { ctx.fillStyle = '#ffd0c0'; ctx.fillRect(Math.round(f.x - rc.x) - 1, Math.round(f.y - rc.y) - 1, 3, 3); }
    if (this.sub && this.state !== 'title') this.sub.draw(ctx, rc);
    this.particles.draw(ctx, rc);

    // ---- lighting ----
    const lights = [];
    Structures.lights(this, rc, t, lights);
    w.decorLights(rc, vw, vh, t, lights);
    if (this.state !== 'title' && this.sub) {
      this.sub.lights(lights);
      this.creatures.lights(lights, rc);
      this.warden.lights(lights);
      for (const f of this.flares) {
        const fl = 0.85 + Math.random() * 0.15;
        const fade = Math.min(1, f.life / 3);
        lights.push({ x: f.x, y: f.y, r: 170 * fade * fl, i: 0.9 * fade, color: [255, 70, 50], glow: 0.35 * fade, dot: 3 });
      }
      for (const k of this.shocks) lights.push({ x: k.x, y: k.y, r: k.r + 30, i: 0.7 * (k.life / 0.5), color: [120, 200, 255], glow: 0.4 * (k.life / 0.5) });
    }
    let dark = pal.dark;
    if (this.state === 'title') dark = Math.min(dark, 0.8);
    dark = clamp(dark - (this.settings.brightness - 1) * 0.3, 0.3, 0.995);
    this.lighting.render(ctx, rc, lights, dark);
    this.lighting.glow(ctx, rc, lights);
    Structures.stationGlow(ctx, w.pois.station, rc, t);
    this.particles.drawGlow(ctx, rc);

    if (this.state !== 'title' && this.sub) {
      this.sub.drawBeam(ctx, rc);
      this.sonar.drawWorld(ctx, rc);
      for (const k of this.shocks) {
        ctx.strokeStyle = `rgba(150,220,255,${k.life / 0.5})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(k.x - rc.x, k.y - rc.y, k.r, 0, TAU); ctx.stroke(); ctx.lineWidth = 1;
      }
      this.drawObjectiveArrow(ctx, rc);
      this.drawCursor(ctx);
    }

    // ---- post ----
    ctx.drawImage(this.vignette, 0, 0);
    if (this.settings.grain) {
      ctx.globalAlpha = 0.6;
      const ox = -Math.floor(Math.random() * 128), oy = -Math.floor(Math.random() * 128);
      for (let y = oy; y < vh; y += 128) for (let x = ox; x < vw; x += 128) ctx.drawImage(this.grain, x, y);
      ctx.globalAlpha = 1;
    }
    if (this.sub && this.state !== 'title') {
      const s = this.sub;
      const hurt = s.hurt * 0.35 + (s.hull / s.stats.maxHull < 0.25 ? 0.08 + 0.06 * Math.sin(t * 5) : 0);
      if (hurt > 0.01) { ctx.fillStyle = `rgba(160,10,10,${hurt})`; ctx.fillRect(0, 0, vw, vh); }
      if (this.flash > 0) { ctx.fillStyle = `rgba(230,240,235,${this.flash * 0.5})`; ctx.fillRect(0, 0, vw, vh); }
    }
  },

  drawObjectiveArrow(ctx, cam) {
    const o = this.objectiveTarget();
    if (!o) return;
    const sx = o.x - cam.x, sy = o.y - cam.y;
    const m = 26;
    const s = this.sub;
    const d = dist(s.x, s.y, o.x, o.y);
    if (sx > m && sy > m && sx < this.vw - m && sy < this.vh - m) {
      if (d > 50) {
        ctx.strokeStyle = `rgba(226,164,74,${0.5 + 0.3 * Math.sin(this.time * 4)})`;
        ctx.beginPath(); ctx.moveTo(sx, sy - 9); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx, sy + 9); ctx.lineTo(sx - 6, sy); ctx.closePath(); ctx.stroke();
      }
      return;
    }
    const cx = this.vw / 2, cy = this.vh / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const k = Math.min((cx - m) / Math.abs(Math.cos(a) || 1e-6), (cy - m) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
    ctx.fillStyle = 'rgba(226,164,74,0.85)';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(226,164,74,0.85)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    const depthDiff = Math.round((o.y - s.y) / TILE * METERS_PER_TILE);
    ctx.fillText(`${Math.round(d / TILE * METERS_PER_TILE)} m${Math.abs(depthDiff) > 30 ? (depthDiff > 0 ? ' ▼' : ' ▲') : ''}`, ax - Math.cos(a) * 18, ay - Math.sin(a) * 18 + 3);
  },

  drawCursor(ctx) {
    const m = this.mouseWorld();
    const x = Math.round(m.x - this.cam.x), y = Math.round(m.y - this.cam.y);
    ctx.strokeStyle = 'rgba(200,255,230,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 2, y); ctx.moveTo(x + 2, y); ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 2); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 6); ctx.stroke();
  },
};
