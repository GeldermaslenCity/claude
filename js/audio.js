'use strict';
/* Procedural Web Audio: continuous engine / laser / ambient drone plus one-shot effects.
   Everything is synthesised; no audio files are loaded. */

const AudioSys = (() => {
  let ctx = null;
  let master, sfxBus, ambBus, reverbIn, noiseBuf, brownBuf;
  let engine = null, laser = null, drone = null;
  const vol = { master: 0.8, sfx: 0.8, ambient: 0.7 };

  function makeNoise(sec, brown) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  function makeImpulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    ambBus = ctx.createGain(); ambBus.connect(master);
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(3.8, 2.6);
    reverbIn = ctx.createGain();
    const rvOut = ctx.createGain(); rvOut.gain.value = 0.55;
    reverbIn.connect(conv); conv.connect(rvOut); rvOut.connect(master);
    noiseBuf = makeNoise(2, false);
    brownBuf = makeNoise(4, true);
    applyVolumes();
    buildEngine(); buildLaser(); buildDrone();
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = vol.master;
    sfxBus.gain.value = vol.sfx;
    ambBus.gain.value = vol.ambient;
  }

  function setVolumes(s) {
    vol.master = s.master; vol.sfx = s.sfx; vol.ambient = s.ambient;
    applyVolumes();
  }

  function out(node, { dest, rev = 0, pan = 0 } = {}) {
    let n = node;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      n.connect(p); n = p;
    }
    n.connect(dest || sfxBus);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; n.connect(s); s.connect(reverbIn); }
  }

  function envGain(t0, a, peak, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dur);
    return g;
  }

  function osc(type, f, dur, peak, o = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const os = ctx.createOscillator();
    os.type = type;
    os.frequency.setValueAtTime(f, t0);
    if (o.fEnd) os.frequency.exponentialRampToValueAtTime(o.fEnd, t0 + (o.a || 0.005) + dur);
    const g = envGain(t0, o.a || 0.005, peak, dur);
    let n = os;
    if (o.filter) {
      const fl = ctx.createBiquadFilter(); fl.type = o.filter; fl.frequency.value = o.ff || 800; fl.Q.value = o.q || 1;
      os.connect(fl); n = fl;
    }
    n.connect(g);
    out(g, o);
    os.start(t0); os.stop(t0 + (o.a || 0.005) + dur + 0.05);
  }

  function noise(dur, peak, o = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? brownBuf : noiseBuf; src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = o.filter || 'lowpass'; fl.Q.value = o.q || 0.8;
    fl.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.fEnd) fl.frequency.exponentialRampToValueAtTime(o.fEnd, t0 + dur);
    const g = envGain(t0, o.a || 0.005, peak, dur);
    src.connect(fl); fl.connect(g); out(g, o);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.1);
    return fl;
  }

  /* ---------- continuous voices ---------- */
  function buildEngine() {
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 42;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 84;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    const wash = ctx.createBufferSource(); wash.buffer = noiseBuf; wash.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.7;
    const wg = ctx.createGain(); wg.gain.value = 0;
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus);
    wash.connect(bp); bp.connect(wg); wg.connect(sfxBus);
    o1.start(); o2.start(); wash.start();
    engine = { o1, o2, g, wg, lp };
  }

  function buildLaser() {
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 220;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 331;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 23;
    const lfoG = ctx.createGain(); lfoG.gain.value = 30;
    lfo.connect(lfoG); lfoG.connect(o1.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.8;
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(bp); o2.connect(bp); bp.connect(g); g.connect(sfxBus);
    o1.start(); o2.start(); lfo.start();
    laser = { g, bp };
  }

  function buildDrone() {
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 55 * 1.498;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 55 * 0.5 + 0.3;
    const og = ctx.createGain(); og.gain.value = 0.05;
    const br = ctx.createBufferSource(); br.buffer = brownBuf; br.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 90;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    const bg = ctx.createGain(); bg.gain.value = 0.35;
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(og); o2.connect(og); o3.connect(og); og.connect(g);
    br.connect(lp); lp.connect(bg); bg.connect(g);
    g.connect(ambBus);
    const rs = ctx.createGain(); rs.gain.value = 0.4; g.connect(rs); rs.connect(reverbIn);
    [o1, o2, o3, br, lfo].forEach(n => n.start());
    drone = { o1, o2, o3, og, g, bg, lp };
  }

  function update(p) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const tc = 0.08;
    // engine
    const thr = p.thrust || 0;
    engine.g.gain.setTargetAtTime(p.engineOn ? (0.015 + thr * 0.11) * (p.silent ? 0.35 : 1) : 0, t, tc);
    engine.wg.gain.setTargetAtTime(p.engineOn ? thr * 0.035 * (p.silent ? 0.3 : 1) : 0, t, tc);
    engine.o1.frequency.setTargetAtTime(38 + thr * 26, t, 0.2);
    engine.o2.frequency.setTargetAtTime(76 + thr * 52, t, 0.2);
    // laser
    laser.g.gain.setTargetAtTime(p.laser ? 0.05 : 0, t, 0.03);
    laser.bp.frequency.setTargetAtTime(p.laserHit ? 1500 : 900, t, 0.05);
    // drone follows depth
    const base = p.droneFreq || 55;
    drone.o1.frequency.setTargetAtTime(base, t, 2);
    drone.o2.frequency.setTargetAtTime(base * 1.498, t, 2);
    drone.o3.frequency.setTargetAtTime(base * 0.5 + 0.3, t, 2);
    drone.g.gain.setTargetAtTime(p.droneOn ? 0.5 + (p.depth01 || 0) * 0.5 : 0, t, 1.5);
    drone.bg.gain.setTargetAtTime(0.25 + (p.depth01 || 0) * 0.5, t, 2);
  }

  function silenceContinuous() {
    if (!ctx) return;
    const t = ctx.currentTime;
    engine.g.gain.setTargetAtTime(0, t, 0.05);
    engine.wg.gain.setTargetAtTime(0, t, 0.05);
    laser.g.gain.setTargetAtTime(0, t, 0.03);
  }

  /* ---------- one-shots ---------- */
  const sfx = {
    ping() {
      osc('sine', 1480, 1.3, 0.22, { fEnd: 1390, rev: 0.9 });
      osc('sine', 740, 0.7, 0.06, { rev: 0.5 });
    },
    echo(v = 1) { osc('sine', 1390, 0.22, 0.035 * v, { rev: 0.6 }); },
    blip() { osc('triangle', 920, 0.1, 0.05); osc('triangle', 690, 0.1, 0.04, { delay: 0.08 }); },
    collide(i) {
      i = clamp(i, 0.2, 1);
      noise(0.35, 0.35 * i, { f: 420, fEnd: 90 });
      osc('triangle', 170, 0.45, 0.14 * i, { fEnd: 80, rev: 0.4 });
      osc('sine', 523, 0.9, 0.04 * i, { rev: 0.6 });
      osc('sine', 797, 0.7, 0.03 * i, { rev: 0.6 });
    },
    collect() { osc('square', 660, 0.07, 0.035, { fEnd: 990, filter: 'lowpass', ff: 2400 }); osc('sine', 1320, 0.12, 0.03, { delay: 0.06 }); },
    crackle() { noise(0.05, 0.05, { filter: 'bandpass', f: 2400, q: 3 }); },
    creak() {
      noise(1.6, 0.13, { filter: 'bandpass', f: 320, fEnd: 110, q: 14, rev: 0.7, a: 0.3 });
      osc('sawtooth', 62, 1.2, 0.02, { fEnd: 44, filter: 'lowpass', ff: 200, a: 0.2 });
    },
    alarm() { osc('square', 880, 0.1, 0.035, { filter: 'lowpass', ff: 2000 }); osc('square', 660, 0.1, 0.035, { delay: 0.16, filter: 'lowpass', ff: 2000 }); },
    bite(pan = 0) {
      noise(0.09, 0.22, { filter: 'highpass', f: 1400, pan });
      osc('sawtooth', 210, 0.15, 0.1, { fEnd: 60, pan, filter: 'lowpass', ff: 900 });
      noise(0.3, 0.25, { f: 300, fEnd: 80, delay: 0.02 });
    },
    growl(pan = 0, v = 1) { osc('sawtooth', 74, 1.1, 0.06 * v, { fEnd: 52, filter: 'lowpass', ff: 260, pan, rev: 0.6, a: 0.15 }); },
    hiss(pan = 0) { noise(0.7, 0.07, { filter: 'bandpass', f: 3200, q: 1.2, pan, a: 0.05, rev: 0.3 }); },
    wardenGroan(v = 1, pan = 0) {
      v = clamp(v, 0.05, 1);
      osc('sawtooth', 39, 5.5, 0.22 * v, { fEnd: 29, filter: 'lowpass', ff: 190, pan, rev: 1, a: 1.2 });
      osc('sine', 58, 5, 0.16 * v, { fEnd: 44, pan, rev: 1, a: 1.4 });
      osc('sine', 117, 3.5, 0.03 * v, { fEnd: 84, pan, rev: 1, a: 1.0, delay: 0.8 });
      noise(4.5, 0.12 * v, { f: 90, pan, rev: 0.8, a: 1.5, brown: true });
    },
    wardenRoar() {
      osc('sawtooth', 70, 2.4, 0.3, { fEnd: 33, filter: 'lowpass', ff: 420, rev: 1, a: 0.08 });
      osc('square', 47, 2.2, 0.12, { fEnd: 28, filter: 'lowpass', ff: 200, rev: 1, a: 0.1 });
      noise(2.2, 0.3, { f: 600, fEnd: 70, rev: 1, a: 0.05 });
    },
    grind() { noise(1.8, 0.1, { f: 160, fEnd: 70, brown: true, a: 0.4, rev: 0.5 }); },
    knock() { for (let i = 0; i < 3; i++) noise(0.12, 0.32, { f: 260, delay: i * 0.55, rev: 0.8 }); },
    signal(v = 0.5) {
      for (let i = 0; i < 3; i++) {
        osc('sine', 311, 0.38, 0.05 * v, { delay: i * 0.5, rev: 0.9, a: 0.04 });
        osc('sine', 313.5, 0.38, 0.04 * v, { delay: i * 0.5, rev: 0.9, a: 0.04 });
      }
    },
    whisper() {
      const fl = noise(2.8, 0.07, { filter: 'bandpass', f: 900, q: 9, rev: 0.9, a: 0.3 });
      if (fl) {
        const t0 = ctx.currentTime;
        for (let i = 0; i < 14; i++) fl.frequency.setValueAtTime(rand(380, 2400), t0 + i * 0.19);
      }
    },
    dock() { [523, 659, 784].forEach((f, i) => osc('sine', f, 0.35, 0.07, { delay: i * 0.12, rev: 0.4 })); },
    launch() { [784, 659, 523].forEach((f, i) => osc('sine', f, 0.3, 0.06, { delay: i * 0.1, rev: 0.4 })); noise(1.4, 0.12, { f: 600, fEnd: 200, a: 0.3 }); },
    buy() { osc('square', 784, 0.08, 0.04, { filter: 'lowpass', ff: 2500 }); osc('square', 1046, 0.12, 0.04, { delay: 0.08, filter: 'lowpass', ff: 2500 }); },
    error() { osc('square', 180, 0.18, 0.05, { filter: 'lowpass', ff: 900 }); },
    click() { osc('sine', 1250, 0.03, 0.03); },
    flare() { noise(0.5, 0.12, { filter: 'highpass', f: 1800 }); osc('sine', 300, 0.3, 0.05, { fEnd: 900 }); },
    shock() { osc('sawtooth', 1400, 0.55, 0.14, { fEnd: 55, rev: 0.6 }); noise(0.45, 0.2, { f: 5000, fEnd: 300 }); },
    heartbeat(v = 0.5) { osc('sine', 52, 0.13, 0.35 * v, { a: 0.01 }); osc('sine', 48, 0.16, 0.28 * v, { delay: 0.27, a: 0.01 }); },
    rumble(v = 1) { noise(2.6, 0.3 * v, { f: 85, brown: true, a: 0.5, rev: 0.6 }); },
    splash() { noise(0.6, 0.08, { f: 1400, fEnd: 400 }); },
    distress() { osc('square', 1046, 0.12, 0.018, { filter: 'lowpass', ff: 1600, rev: 0.8 }); osc('square', 1046, 0.12, 0.018, { delay: 0.25, filter: 'lowpass', ff: 1600, rev: 0.8 }); },
    relayOnline() { [392, 523, 659, 784, 1046].forEach((f, i) => osc('triangle', f, 0.5, 0.05, { delay: i * 0.15, rev: 0.7 })); },
    creatureDie() { osc('sawtooth', 300, 0.4, 0.08, { fEnd: 60, filter: 'lowpass', ff: 700 }); },
    sparks() { noise(0.12, 0.06, { filter: 'highpass', f: 3000 }); },
    distantCall(pan) {
      osc('sine', 180, 3, 0.03, { fEnd: 120, rev: 1, a: 1, pan });
      osc('sine', 270, 2.4, 0.02, { fEnd: 200, rev: 1, a: 0.8, delay: 0.4, pan });
    },
  };

  return {
    ensure, setVolumes, update, silenceContinuous, sfx,
    get ready() { return !!ctx; },
  };
})();
