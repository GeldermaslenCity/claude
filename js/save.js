'use strict';
/* localStorage persistence for the profile (game progress) and settings. */

const Save = {
  KEY: 'abyssal_signal_save_v1',
  SKEY: 'abyssal_signal_settings_v1',

  defaults: {
    master: 0.8, sfx: 0.8, ambient: 0.7, brightness: 1,
    shake: true, grain: true, tutorial: true, showFps: false, quality: 'low',
  },

  has() {
    try { return !!localStorage.getItem(this.KEY); } catch (e) { return false; }
  },
  write(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); return true; } catch (e) { console.warn('Save failed', e); return false; }
  },
  read() {
    try {
      const s = localStorage.getItem(this.KEY);
      if (!s) return null;
      const d = JSON.parse(s);
      return d && d.version === 1 ? d : null;
    } catch (e) { console.warn('Save corrupt', e); return null; }
  },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* ignore */ } },

  loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(this.SKEY) || '{}') || {}; } catch (e) { s = {}; }
    return Object.assign({}, this.defaults, s);
  },
  saveSettings(s) {
    try { localStorage.setItem(this.SKEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  },

  /** Pack a 0/1 Uint8Array into a base64 bitset. */
  encodeBits(arr) {
    const bytes = new Uint8Array(Math.ceil(arr.length / 8));
    for (let i = 0; i < arr.length; i++) if (arr[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  decodeBits(str, len) {
    const out = new Uint8Array(len);
    if (!str) return out;
    try {
      const s = atob(str);
      for (let i = 0; i < len; i++) {
        const b = s.charCodeAt(i >> 3);
        if (b & (1 << (i & 7))) out[i] = 1;
      }
    } catch (e) { /* ignore corrupt map */ }
    return out;
  },
};
