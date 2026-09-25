'use strict';
/* In-game heads-up display (DOM overlay) and message feed. */

const HUD = {
  el: {},
  msgs: [],
  acc: 0,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      root: $('hud'), depth: $('hud-depth'), zone: $('hud-zone'), rating: $('hud-rating'),
      objective: $('hud-objective-text'), noise: $('hud-noise'), signal: $('hud-signal'), status: $('hud-status'),
      messages: $('hud-messages'), prompt: $('hud-prompt'), tutorial: $('hud-tutorial'), tutorialText: $('hud-tutorial-text'),
      flares: $('hud-flares'), shock: $('hud-shock'), credits: $('hud-credits'), fps: $('hud-fps'),
      sonar: $('sonar-canvas'),
    };
    this.sctx = this.el.sonar.getContext('2d');
    this.gauges = {};
    document.querySelectorAll('.gauge').forEach(g => {
      this.gauges[g.dataset.g] = { root: g, fill: g.querySelector('.g-fill'), val: g.querySelector('.g-val') };
    });
  },

  show(v) { this.el.root.classList.toggle('hidden', !v); },

  message(text, type = '') {
    const d = document.createElement('div');
    d.className = 'msg ' + type;
    d.textContent = text;
    this.el.messages.appendChild(d);
    const m = { el: d, t: type === 'story' || type === 'danger' ? 7 : 5 };
    this.msgs.push(m);
    while (this.msgs.length > 5) { const o = this.msgs.shift(); o.el.remove(); }
  },
  clearMessages() { for (const m of this.msgs) m.el.remove(); this.msgs = []; },

  setGauge(key, v, max, text, lowAt = 0.3, critAt = 0.15) {
    const g = this.gauges[key];
    const f = max > 0 ? clamp(v / max, 0, 1) : 0;
    g.fill.style.width = (f * 100).toFixed(1) + '%';
    g.val.textContent = text;
    if (key === 'cargo') { g.root.classList.toggle('full', f >= 1); return; }
    g.root.classList.toggle('crit', f <= critAt);
    g.root.classList.toggle('low', f > critAt && f <= lowAt);
  },

  update(dt, game) {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      m.t -= dt;
      if (m.t < 0.8) m.el.classList.add('fade');
      if (m.t <= 0) { m.el.remove(); this.msgs.splice(i, 1); }
    }
    if (game.state !== 'play' && game.state !== 'pause' && game.state !== 'log') return;
    const sub = game.sub, st = sub.stats;
    // sonar scope every frame (it animates)
    game.sonar.drawScope(this.sctx, this.el.sonar.width);
    this.acc += dt;
    if (this.acc < 0.066) return;
    this.acc = 0;
    const depth = sub.depthM();
    this.el.depth.textContent = fmt(depth);
    this.el.zone.textContent = zoneAt(Math.floor(sub.y / TILE)).name;
    const over = depth > st.depth - 100;
    this.el.rating.textContent = `CRUSH DEPTH ${fmt(st.depth)} m`;
    this.el.rating.classList.toggle('warn', over);
    this.el.objective.innerHTML = Missions.objectiveHtml(game);

    const n = sub.noise;
    this.el.noise.style.width = n.toFixed(0) + '%';
    this.el.noise.className = 'fill' + (n > 55 ? ' very' : n > 25 ? ' loud' : '');
    this.el.signal.style.width = (game.atmos.signalStrength() * 60 + (game.signalPulse || 0) * 40).toFixed(0) + '%';
    const parts = [];
    parts.push(sub.lightsActive ? '<b>LIGHT ON</b>' : 'LIGHT OFF');
    if (sub.silent) parts.push('<b>SILENT</b>');
    if (sub.propMode === 'battery') parts.push('<i>BATT DRIVE</i>');
    if (sub.propMode === 'none') parts.push('<i>DRIFTING</i>');
    if (game.docked) parts.push('<b>DOCKED</b>');
    this.el.status.innerHTML = parts.join(' · ');

    this.setGauge('hull', sub.hull, st.maxHull, `${Math.ceil(sub.hull)}/${st.maxHull}`);
    this.setGauge('oxygen', sub.oxygen, st.maxOxygen, `${Math.ceil(sub.oxygen / 0.33 / 60)} min`, 0.3, 0.15);
    this.setGauge('battery', sub.battery, st.maxBattery, `${Math.ceil(sub.battery)}/${st.maxBattery}`);
    this.setGauge('fuel', sub.fuel, st.maxFuel, `${Math.ceil(sub.fuel)}/${st.maxFuel}`);
    this.setGauge('cargo', sub.cargoUsed(), st.cargoMax, `${sub.cargoUsed()}/${st.cargoMax}`);
    this.el.flares.textContent = `FLARES ${sub.flares}/${st.flares}`;
    this.el.shock.textContent = st.shock ? (sub.shockCd > 0 ? `SHOCK ${sub.shockCd.toFixed(0)}s` : 'SHOCK READY') : 'SHOCK —';
    this.el.credits.textContent = '₵ ' + fmt(game.profile.credits);

    const tut = !game.docked ? Missions.tutorialText(game) : null;
    this.el.tutorial.classList.toggle('hidden', !tut);
    if (tut) this.el.tutorialText.innerHTML = tut;

    const p = game.prompt;
    this.el.prompt.classList.toggle('hidden', !p);
    if (p) this.el.prompt.innerHTML = p;

    this.el.fps.classList.toggle('hidden', !game.settings.showFps);
    if (game.settings.showFps) this.el.fps.textContent = game.fps.toFixed(0) + ' fps · ' + game.creatures.list.length + ' creatures';
  },
};
