// DOM heads-up display.
const $ = id => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), vignette: $('vignette'), hitmarker: $('hitmarker'), banner: $('banner'), subbanner: $('subbanner'),
      hint: $('hint'), reload: $('reload'), reloadFill: $('reload-fill'), zleft: $('zleft').querySelector('b'),
      round: $('round'), points: $('points'), popups: $('popups'), healthFill: $('health-fill'), healthText: $('health-text'),
      weaponName: $('weapon-name'), ammo: $('ammo'), mag: $('mag'), reserve: $('reserve'), crosshair: $('crosshair'),
    };
    this.hitTimer = 0;
    this.bannerTimer = 0;
    this.hurt = 0;
    this.last = {};
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  set(key, el, value, prop = 'textContent') {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el[prop] = value;
  }

  banner(text, sub = '', time = 2.5) {
    this.el.banner.textContent = text;
    this.el.subbanner.textContent = sub;
    this.el.banner.style.opacity = 1;
    this.el.subbanner.style.opacity = sub ? 1 : 0;
    this.bannerTimer = time;
  }

  hit(kill) {
    this.el.hitmarker.classList.toggle('kill', kill);
    this.hitTimer = 0.15;
  }

  popup(text, negative = false) {
    const d = document.createElement('div');
    d.className = 'popup' + (negative ? ' neg' : '');
    d.textContent = text;
    d.style.left = Math.random() * 30 + 'px';
    this.el.popups.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  flashAmmo() {
    this.el.ammo.classList.remove('flash');
    void this.el.ammo.offsetWidth;
    this.el.ammo.classList.add('flash');
  }

  damage() { this.hurt = 1; }

  update(dt, game) {
    const p = game.player;
    const e = this.el;
    this.set('round', e.round, String(Math.max(1, game.round)));
    this.set('points', e.points, String(game.points));
    this.set('z', e.zleft, String(game.zombiesRemaining()));
    const hp = Math.ceil(p.health);
    this.set('hp', e.healthText, String(hp));
    this.set('hpw', e.healthFill.style, Math.min(100, (p.health / p.maxHealth) * 100) + '%', 'width');
    this.set('wn', e.weaponName, p.def.name);
    this.set('mag', e.mag, String(p.weapon.mag));
    this.set('res', e.reserve, '/ ' + p.weapon.reserve);
    const low = p.weapon.mag <= Math.ceil(p.magSize() * 0.25);
    e.ammo.classList.toggle('low', low);

    let hint = '';
    if (game.state === 'playing' && !p.dead) {
      if (p.reloading) hint = '';
      else if (p.weapon.mag === 0 && p.weapon.reserve === 0) hint = p.weapons.rifle.owned && p.current === 'rifle' && p.weapons.pistol.reserve + p.weapons.pistol.mag > 0
        ? 'Out of ammo: press 1 for the pistol' : 'Out of ammo: melee with V';
      else if (low && p.weapon.reserve > 0) hint = 'Press R to reload';
    }
    this.set('hint', e.hint, hint);

    e.reload.style.display = p.reloading ? 'block' : 'none';
    if (p.reloading) e.reloadFill.style.width = (1 - p.reloadTime / p.reloadTotal) * 100 + '%';

    // crosshair spread
    const gap = 5 + Math.min(18, Math.hypot(p.vel.x, p.vel.z) * 1.5 + p.recoilKick * 120 + (p.onGround ? 0 : 10));
    e.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');

    this.hitTimer -= dt;
    e.hitmarker.style.opacity = this.hitTimer > 0 ? 1 : 0;

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) { e.banner.style.opacity = 0; e.subbanner.style.opacity = 0; }
    }

    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    const lowHp = 1 - p.health / p.maxHealth;
    e.vignette.style.opacity = Math.min(1, this.hurt * 0.8 + Math.max(0, lowHp - 0.4) * 1.2 + (p.dead ? 0.8 : 0)).toFixed(2);
  }
}
