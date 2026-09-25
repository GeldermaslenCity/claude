'use strict';
/* Menus and overlays: title, how-to, settings, pause, station, game over, ending, map, logs. */

const POI_NAMES = {
  station: 'Anchor Station', rig: 'Drill Rig 4', kestrel: 'Wreck: DSV Kestrel', vesna: 'Vesna Research Station',
  skeleton: 'The Great Skeleton', marrow: 'Wreck: DSV Marrow', relay: 'Deep Relay 7', gate: 'The Trench Gate', abyss: '???',
};

const UI = {
  game: null,
  tab: 'market',
  returnTo: null,

  $(id) { return document.getElementById(id); },
  show(id) { this.$(id).classList.remove('hidden'); },
  hide(id) { this.$(id).classList.add('hidden'); },
  isOpen(id) { return !this.$(id).classList.contains('hidden'); },

  init(game) {
    this.game = game;
    const on = (id, fn) => this.$(id).addEventListener('click', e => { AudioSys.ensure(); AudioSys.sfx.click(); fn(e); });
    on('btn-continue', () => game.continueGame());
    on('btn-new', () => {
      if (Save.has()) this.confirm('NEW EXPEDITION', 'This will overwrite your existing save. Continue?', () => game.newGame());
      else game.newGame();
    });
    on('btn-howto', () => this.openModal('screen-howto'));
    on('btn-settings', () => this.openSettings());
    on('btn-resume', () => game.resume());
    on('btn-save', () => { game.saveGame(); game.msg('Game saved.', ''); this.$('btn-save').textContent = 'SAVED ✓'; setTimeout(() => { this.$('btn-save').textContent = 'SAVE GAME'; }, 1200); });
    on('btn-pause-howto', () => this.openModal('screen-howto'));
    on('btn-pause-settings', () => this.openSettings());
    on('btn-quit', () => game.quitToTitle());
    on('btn-relaunch', () => game.relaunch());
    on('btn-go-title', () => game.quitToTitle());
    on('btn-end-continue', () => game.closeEnding());
    on('btn-end-title', () => { game.closeEnding(); game.quitToTitle(); });
    on('st-launch', () => game.launch());
    on('log-close', () => game.closeLog());
    on('confirm-no', () => this.hide('screen-confirm'));
    on('confirm-yes', () => { this.hide('screen-confirm'); if (this.onConfirm) this.onConfirm(); });
    on('btn-wipe', () => this.confirm('DELETE SAVE', 'Permanently delete your saved expedition?', () => { Save.clear(); this.refreshTitle(); }));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
      AudioSys.sfx.click();
      b.closest('.screen').classList.add('hidden');
    }));
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
      AudioSys.sfx.click();
      this.tab = b.dataset.tab; this.renderStation();
    }));
    this.$('st-content').addEventListener('click', e => this.stationClick(e));
    document.querySelectorAll('[data-set]').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.set;
        const s = game.settings;
        if (inp.type === 'checkbox') s[k] = inp.checked;
        else if (inp.type === 'range') s[k] = parseFloat(inp.value);
        else s[k] = inp.value;
        game.applySettings();
      });
    });
    window.addEventListener('resize', () => { if (this.isOpen('screen-map')) this.drawMap(); });
  },

  anyModalOpen() {
    return ['screen-howto', 'screen-settings', 'screen-confirm'].some(id => this.isOpen(id));
  },
  closeTopModal() {
    for (const id of ['screen-confirm', 'screen-settings', 'screen-howto']) if (this.isOpen(id)) { this.hide(id); return true; }
    return false;
  },
  openModal(id) { this.show(id); },

  confirm(title, text, onYes) {
    this.$('confirm-title').textContent = title;
    this.$('confirm-text').textContent = text;
    this.onConfirm = onYes;
    this.show('screen-confirm');
  },

  refreshTitle() {
    this.$('btn-continue').disabled = !Save.has();
    this.$('btn-continue').classList.toggle('hidden', !Save.has());
  },

  openSettings() {
    const s = this.game.settings;
    document.querySelectorAll('[data-set]').forEach(inp => {
      const k = inp.dataset.set;
      if (inp.type === 'checkbox') inp.checked = !!s[k];
      else inp.value = s[k];
    });
    this.show('screen-settings');
  },

  /* ---------------- station ---------------- */
  openStation() { this.show('screen-station'); this.renderStation(); },
  closeStation() { this.hide('screen-station'); },

  renderStation() {
    const g = this.game, p = g.profile, sub = g.sub;
    this.$('st-credits').textContent = fmt(p.credits);
    document.querySelectorAll('.tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === this.tab);
      if (b.dataset.tab === 'missions') {
        const canDeliver = p.contracts.some(c => c.type === 'deliver' && (sub.cargo[c.res] || 0) >= c.qty);
        b.innerHTML = 'MISSIONS' + (canDeliver ? ' <span class="dot">●</span>' : '');
      }
      if (b.dataset.tab === 'market') b.innerHTML = 'MARKET' + (sub.cargoUsed() ? ' <span class="dot">●</span>' : '');
    });
    const c = this.$('st-content');
    c.innerHTML = this['tab_' + this.tab]();
    const tut = p.tutorial.active && g.settings.tutorial && (p.tutorial.step === 0 || p.tutorial.step === 7) ? TUTORIAL[p.tutorial.step].text : '';
    this.$('st-status').innerHTML = tut ||
      `Hull ${Math.ceil(sub.hull)}/${sub.stats.maxHull} · Fuel ${Math.ceil(sub.fuel)}/${sub.stats.maxFuel} · Flares ${sub.flares}/${sub.stats.flares} · Cargo ${sub.cargoUsed()}/${sub.stats.cargoMax}`;
  },

  tab_market() {
    const sub = this.game.sub;
    let rows = '';
    let total = 0;
    for (const k of RES_ORDER) {
      const R = RESOURCES[k], n = sub.cargo[k] || 0;
      total += n * R.price;
      rows += `<tr><td><span class="swatch" style="background:${rgb(R.color)}"></span>${R.name}</td><td>${n}</td><td>₵${R.price}</td><td>₵${fmt(n * R.price)}</td>
        <td style="text-align:right"><button class="btn small" data-act="sell1" data-res="${k}" ${n ? '' : 'disabled'}>SELL 1</button>
        <button class="btn small" data-act="sellall" data-res="${k}" ${n ? '' : 'disabled'}>SELL ALL</button></td></tr>`;
    }
    const reserved = this.game.profile.contracts.filter(c => c.type === 'deliver').map(c => `${c.qty}× ${RESOURCES[c.res].name} (₵${c.reward})`);
    return `<table class="market"><tr><th>MATERIAL</th><th>HOLD</th><th>PRICE</th><th>VALUE</th><th></th></tr>${rows}</table>
      <div class="row-actions"><button class="btn primary" data-act="sellevery" ${total ? '' : 'disabled'}>SELL ENTIRE HOLD — ₵${fmt(total)}</button></div>
      <p class="muted" style="margin-top:1.4em;font-size:0.85em">Open supply orders pay more than market rate: ${reserved.join(' · ') || 'none'}. Deliver them from the MISSIONS tab before selling.</p>
      <p class="muted" style="font-size:0.85em">Titanium and Fuel Crystals need Mining Laser Mk II. Resonite needs Mk III — and it hums.</p>`;
  },

  serviceCosts() {
    const sub = this.game.sub, st = sub.stats;
    return {
      repair: Math.ceil((st.maxHull - sub.hull) * PRICES.repairPerHp),
      fuel: Math.ceil((st.maxFuel - sub.fuel) * PRICES.fuelPerUnit),
      flares: (st.flares - sub.flares) * PRICES.flare,
    };
  },

  tab_services() {
    const sub = this.game.sub, st = sub.stats, cost = this.serviceCosts(), cr = this.game.profile.credits;
    const row = (title, desc, act, c, need) => `<div class="service"><div><div>${title}</div><div class="desc">${desc}</div></div>
      <button class="btn small" data-act="${act}" ${need && cr > 0 ? '' : 'disabled'}>${need ? (cr >= c ? '₵' + fmt(c) : 'PARTIAL ₵' + fmt(cr)) : 'FULL'}</button></div>`;
    const all = cost.repair + cost.fuel + cost.flares;
    return row('Hull repair', `${Math.ceil(sub.hull)} / ${st.maxHull} · ₵${PRICES.repairPerHp} per point`, 'repair', cost.repair, sub.hull < st.maxHull - 0.5) +
      row('Refuel', `${Math.ceil(sub.fuel)} / ${st.maxFuel} · ₵${PRICES.fuelPerUnit} per unit`, 'refuel', cost.fuel, sub.fuel < st.maxFuel - 0.5) +
      row('Restock decoy flares', `${sub.flares} / ${st.flares} · ₵${PRICES.flare} each`, 'flares', cost.flares, sub.flares < st.flares) +
      `<div class="service"><div><div>Oxygen &amp; battery</div><div class="desc">Replenished free of charge while docked.</div></div><span class="muted">FULL</span></div>
       <div class="row-actions"><button class="btn primary" data-act="fullservice" ${all > 0 && cr > 0 ? '' : 'disabled'}>FULL SERVICE — ₵${fmt(all)}</button></div>`;
  },

  statLines(key, cur, next) {
    const a = UPGRADES[key].levels[cur], b = UPGRADES[key].levels[next];
    const out = [];
    for (const k in b) {
      if (a[k] === b[k]) continue;
      const [label, unit] = STAT_LABELS[k] || [k, ''];
      out.push(`${label} ${a[k]}${unit} → <b>${b[k]}${unit}</b>`);
    }
    if (key === 'sonar') {
      const names = ['no classification', 'size classification', 'species ID, fewer ghosts', 'passive Warden tracking'];
      out.push(names[next]);
    }
    if (key === 'defense' && cur === 0) out.push('Unlocks shock pulse (R)');
    return out.join('<br>');
  },

  tab_upgrades() {
    const p = this.game.profile;
    let html = '<div class="upgrades">';
    for (const key of UPGRADE_ORDER) {
      const U = UPGRADES[key];
      const lvl = p.upgrades[key];
      const maxL = U.levels.length - 1;
      const roman = ['I', 'II', 'III', 'IV', 'V'];
      const title = U.names ? U.names[lvl] : U.name;
      if (lvl >= maxL) {
        html += `<div class="upg max"><h4>${U.name}<span class="lvl">MK ${roman[lvl]}</span></h4><div class="d">${title}. Fully upgraded.</div></div>`;
        continue;
      }
      const next = lvl + 1;
      const locked = U.lockLast === 'trench' && next === maxL && !p.story.trenchUnlocked;
      const cost = U.costs[next];
      html += `<div class="upg"><h4>${U.name}<span class="lvl">MK ${roman[lvl]}</span></h4>
        <div class="d">${U.desc}</div>
        <div class="next">${locked ? '<span class="muted">' + U.names[next] + ' — requires the Relay 7 triangulation data.</span>' : (U.names ? U.names[next] + ': ' : '') + this.statLines(key, lvl, next)}</div>
        <button class="btn small ${locked ? '' : 'primary'}" data-act="buy" data-key="${key}" ${!locked && p.credits >= cost ? '' : 'disabled'}>${locked ? 'LOCKED' : 'UPGRADE — ₵' + fmt(cost)}</button></div>`;
    }
    return html + '</div>';
  },

  tab_missions() {
    const g = this.game, p = g.profile, st = p.story, sub = g.sub;
    const stages = STORY_STAGES.slice(0, 7).map((s, i) => `<li class="${i < st.stage ? 'done' : i === st.stage ? 'cur' : ''}">${i <= st.stage ? s.title : '???'}</li>`).join('');
    const cur = STORY_STAGES[st.stage];
    let html = `<div class="mission story"><h4>THE KESTREL SIGNAL<span class="reward">STORY</span></h4>
      <p>${cur.text}</p><ol class="stagelist">${stages}</ol></div>`;
    html += '<h3 style="color:var(--amber);letter-spacing:.2em;font-weight:normal;font-size:.9em">CONTRACTS</h3>';
    for (const c of p.contracts) {
      let action = '';
      if (c.type === 'deliver') {
        const have = sub.cargo[c.res] || 0;
        action = `<button class="btn small primary" data-act="deliver" data-id="${c.id}" ${have >= c.qty ? '' : 'disabled'}>DELIVER (${have}/${c.qty})</button>`;
      } else {
        action = `<div class="muted" style="font-size:.85em;margin-top:.4em">${c.carried ? 'In your hold — dock to complete.' : 'Position marked on sonar and map.'}</div>`;
      }
      html += `<div class="mission"><h4>${c.title}<span class="reward">₵${fmt(c.reward)}</span></h4><p>${c.text}</p>${action}</div>`;
    }
    return html;
  },

  tab_logs() {
    const p = this.game.profile;
    if (!p.logs.length) return '<p class="muted">No records recovered yet. Wrecks and abandoned sites sometimes still hold them.</p>';
    return '<div class="loglist">' + p.logs.map(id => `<div class="logitem" data-act="log" data-id="${id}"><span>${LOGS[id].title}</span><span class="muted">READ ›</span></div>`).join('') + '</div>';
  },

  stationClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const g = this.game, p = g.profile, sub = g.sub;
    const act = b.dataset.act;
    AudioSys.ensure();
    const cost = this.serviceCosts();
    const pay = (c) => { const paid = Math.min(c, p.credits); p.credits -= paid; return c > 0 ? paid / c : 1; };
    switch (act) {
      case 'sell1': case 'sellall': {
        const k = b.dataset.res, n = act === 'sell1' ? 1 : sub.cargo[k];
        g.sell(k, n); AudioSys.sfx.buy(); break;
      }
      case 'sellevery': for (const k of RES_ORDER) if (sub.cargo[k]) g.sell(k, sub.cargo[k]); AudioSys.sfx.buy(); break;
      case 'repair': { const f = pay(cost.repair); sub.hull += (sub.stats.maxHull - sub.hull) * f; AudioSys.sfx.buy(); break; }
      case 'refuel': { const f = pay(cost.fuel); sub.fuel += (sub.stats.maxFuel - sub.fuel) * f; AudioSys.sfx.buy(); break; }
      case 'flares': { const n = Math.min(sub.stats.flares - sub.flares, Math.floor(p.credits / PRICES.flare)); p.credits -= n * PRICES.flare; sub.flares += n; AudioSys.sfx.buy(); break; }
      case 'fullservice': {
        let f = pay(cost.repair); sub.hull += (sub.stats.maxHull - sub.hull) * f;
        f = pay(cost.fuel); sub.fuel += (sub.stats.maxFuel - sub.fuel) * f;
        const n = Math.min(sub.stats.flares - sub.flares, Math.floor(p.credits / PRICES.flare)); p.credits -= n * PRICES.flare; sub.flares += n;
        AudioSys.sfx.buy(); break;
      }
      case 'buy': if (g.buyUpgrade(b.dataset.key)) AudioSys.sfx.buy(); else AudioSys.sfx.error(); break;
      case 'deliver': {
        const c = p.contracts.find(x => x.id === +b.dataset.id);
        if (c && Missions.deliver(g, c)) { AudioSys.sfx.buy(); g.msg(`Delivered: ${c.title} — ₵${c.reward}`, 'story'); }
        break;
      }
      case 'log': this.showLog(b.dataset.id); return;
    }
    p.credits = Math.floor(p.credits);
    this.renderStation();
  },

  /* ---------------- logs ---------------- */
  showLog(id) {
    const L = LOGS[id];
    if (!L) return;
    this.$('log-title').textContent = L.title;
    this.$('log-body').textContent = L.body;
    this.show('screen-log');
  },

  /* ---------------- game over / ending ---------------- */
  showGameOver(info) {
    this.$('go-cause').textContent = info.cause;
    this.$('go-details').innerHTML =
      `Last contact at ${fmt(info.depth)} m.<br>` +
      (info.lostValue > 0 ? `<span class="lost">Cargo lost: ₵${fmt(info.lostValue)} worth of material.</span><br>Rescue drone salvaged ₵${fmt(info.salvage)}.<br>` : 'Your hold was empty.<br>') +
      `Recovery & rebuild fee: ₵${fmt(info.fee)}.` +
      (info.lostItems ? `<br><span class="lost">${info.lostItems} returned to the sea floor.</span>` : '');
    this.show('screen-gameover');
  },

  showEnding() {
    const body = this.$('ending-body');
    body.innerHTML = ENDING_TEXT.map((t, i) => `<p style="animation-delay:${i * 2.4}s">${t}</p>`).join('') +
      `<p class="final" style="animation-delay:${ENDING_TEXT.length * 2.4 + 1}s">END OF THE VERTICAL SLICE<br><span style="font-size:.8em;letter-spacing:.1em">Thank you for diving.</span></p>`;
    const menu = document.querySelector('#screen-ending .menu');
    menu.style.animation = 'none'; void menu.offsetWidth;
    menu.style.opacity = '0';
    menu.style.animation = `fadein 1.5s ${ENDING_TEXT.length * 2.4 + 2}s forwards`;
    HUD.show(false);
    this.show('screen-ending');
  },

  /* ---------------- map ---------------- */
  openMap() { this.show('screen-map'); this.drawMap(); },
  closeMap() { this.hide('screen-map'); },

  drawMap() {
    const g = this.game, w = g.world;
    const cv = this.$('map-canvas');
    const availH = window.innerHeight * 0.86, availW = window.innerWidth * 0.8;
    const scale = Math.max(0.5, Math.min(availH / w.H, availW / (w.W + 180)));
    const pad = 170;
    cv.width = Math.floor(w.W * scale + pad); cv.height = Math.floor(w.H * scale);
    cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
    const c = cv.getContext('2d');
    c.fillStyle = '#010608'; c.fillRect(0, 0, cv.width, cv.height);
    w.flushMap();
    c.imageSmoothingEnabled = false;
    c.drawImage(w.mapCanvas, pad, 0, w.W * scale, w.H * scale);
    // zone bands
    c.font = '11px monospace'; c.textAlign = 'right';
    for (const z of ZONES) {
      const y = z.y0 * scale;
      c.strokeStyle = 'rgba(120,220,185,0.2)'; c.beginPath(); c.moveTo(pad - 6, y); c.lineTo(cv.width, y); c.stroke();
      c.fillStyle = 'rgba(120,220,185,0.7)'; c.fillText(z.name.toUpperCase(), pad - 10, y + 14);
      c.fillStyle = 'rgba(120,220,185,0.4)'; c.fillText(fmt(z.y0 * METERS_PER_TILE) + ' m', pad - 10, y + 27);
    }
    // crush depth line
    const cd = g.sub.stats.depth / METERS_PER_TILE * scale;
    c.strokeStyle = 'rgba(224,82,74,0.6)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(pad, cd); c.lineTo(cv.width, cd); c.stroke(); c.setLineDash([]);
    c.fillStyle = 'rgba(224,82,74,0.8)'; c.textAlign = 'left'; c.fillText('CRUSH DEPTH', pad + 4, cd - 4);
    const toMap = (x, y) => [pad + x / TILE * scale, y / TILE * scale];
    const P = w.pois;
    for (const k of g.profile.discovered) {
      const p = P[k]; if (!p) continue;
      const [mx, my] = toMap(p.x, p.y);
      c.fillStyle = '#7fe0bd'; c.fillRect(mx - 3, my - 3, 6, 6);
      c.fillStyle = 'rgba(200,240,225,0.85)'; c.textAlign = 'left'; if (k !== 'station') c.fillText(POI_NAMES[k], mx + 7, my + 4);
    }
    const diamond = (x, y, col, label) => {
      const [mx, my] = toMap(x, y);
      c.fillStyle = col;
      c.beginPath(); c.moveTo(mx, my - 6); c.lineTo(mx + 6, my); c.lineTo(mx, my + 6); c.lineTo(mx - 6, my); c.fill();
      if (label) { c.textAlign = 'left'; c.fillText(label, mx + 9, my + 4); }
    };
    const obj = g.objectiveTarget();
    if (obj) diamond(obj.x, obj.y, '#e2a44a', 'OBJECTIVE');
    for (const it of g.contractItems()) diamond(it.x, it.y, '#c8b060', it.name);
    const [sx, sy] = toMap(g.sub.x, g.sub.y);
    c.fillStyle = (Math.floor(performance.now() / 300) % 2) ? '#ffffff' : '#7fe0bd';
    c.beginPath(); c.arc(sx, sy, 4, 0, TAU); c.fill();
    c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(sx, sy, 9, 0, TAU); c.stroke();
    c.textAlign = 'left'; c.fillStyle = '#fff'; c.fillText('YOU', sx + 12, sy + 4);
  },
};
