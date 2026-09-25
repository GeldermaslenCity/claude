// Procedural sound effects with the Web Audio API. There are no audio files to download or license.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.noiseBuf = null;
  }

  // Must be called from a user gesture (browsers block audio until then).
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // Updates the 3D listener from the camera.
  setListener(pos, forward) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t); l.forwardY.setValueAtTime(forward.y, t); l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 2.5;
    p.rolloffFactor = 1.2;
    p.maxDistance = 60;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  noise(dur, { freq = 1000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.002, pos, rate = 1 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(pos));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return f;
  }

  tone(freq, dur, { type = 'sine', gain = 0.3, slideTo, attack = 0.005, delay = 0, pos } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(pos));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- game sounds ----------

  shot(kind) {
    if (kind === 'rifle') {
      this.noise(0.18, { freq: 1600, q: 0.7, gain: 0.55 });
      this.noise(0.09, { freq: 5000, type: 'highpass', gain: 0.25 });
      this.tone(140, 0.12, { type: 'triangle', gain: 0.5, slideTo: 50 });
    } else {
      this.noise(0.25, { freq: 1100, q: 0.6, gain: 0.7 });
      this.noise(0.08, { freq: 4000, type: 'highpass', gain: 0.3 });
      this.tone(170, 0.16, { type: 'triangle', gain: 0.6, slideTo: 45 });
    }
  }

  dryFire() { this.tone(1800, 0.03, { type: 'square', gain: 0.12 }); }

  reloadStart() {
    this.noise(0.06, { freq: 2500, q: 3, gain: 0.25 });
    this.tone(700, 0.04, { type: 'square', gain: 0.08, delay: 0.05 });
  }

  reloadEnd() {
    this.noise(0.05, { freq: 3000, q: 4, gain: 0.3 });
    this.tone(1200, 0.03, { type: 'square', gain: 0.1, delay: 0.04 });
    this.tone(900, 0.03, { type: 'square', gain: 0.1, delay: 0.12 });
  }

  hitmarker() { this.tone(2400, 0.04, { type: 'square', gain: 0.07 }); }

  headshot() { this.tone(3200, 0.06, { type: 'square', gain: 0.08 }); this.noise(0.12, { freq: 600, q: 1, gain: 0.3 }); }

  impact(pos) { this.noise(0.08, { freq: 2200, q: 2, gain: 0.25, pos }); }

  flesh(pos) { this.noise(0.12, { freq: 500, q: 1.5, gain: 0.45, pos }); }

  melee() { this.noise(0.15, { freq: 900, q: 1.2, gain: 0.35, rate: 0.6 }); }

  groan(pos, pitch = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.8 + Math.random() * 0.8;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const base = (70 + Math.random() * 40) * pitch;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.2), t + dur);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5 + Math.random() * 4;
    const lg = this.ctx.createGain(); lg.gain.value = base * 0.08;
    lfo.connect(lg).connect(o.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 450 + Math.random() * 300; f.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out(pos));
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  zombieAttack(pos) { this.groan(pos, 1.5); this.noise(0.2, { freq: 800, q: 1, gain: 0.3, pos }); }

  playerHurt() {
    this.noise(0.25, { freq: 300, q: 1, gain: 0.6 });
    this.tone(160, 0.25, { type: 'sawtooth', gain: 0.15, slideTo: 90 });
  }

  footstep(sprint) { this.noise(0.07, { freq: sprint ? 380 : 300, q: 1.5, gain: sprint ? 0.12 : 0.08 }); }

  rise(pos) { this.noise(0.9, { freq: 250, q: 0.8, gain: 0.35, attack: 0.2, pos }); }

  buy() {
    this.tone(660, 0.12, { type: 'triangle', gain: 0.25 });
    this.tone(990, 0.2, { type: 'triangle', gain: 0.25, delay: 0.09 });
  }

  denied() { this.tone(180, 0.2, { type: 'square', gain: 0.12 }); }

  roundStart() {
    [0, 0.35, 0.7].forEach((d, i) => this.tone(110 - i * 12, 1.1, { type: 'sawtooth', gain: 0.18, delay: d, attack: 0.05 }));
    this.noise(2.0, { freq: 120, q: 0.5, gain: 0.3, attack: 0.3 });
  }

  roundEnd() {
    [0, 0.25, 0.5].forEach((d, i) => this.tone([220, 277, 330][i], 0.9, { type: 'triangle', gain: 0.18, delay: d, attack: 0.02 }));
  }

  gameOver() {
    [0, 0.5, 1.0].forEach((d, i) => this.tone([196, 165, 110][i], 1.4, { type: 'sawtooth', gain: 0.16, delay: d, attack: 0.05 }));
  }
}
