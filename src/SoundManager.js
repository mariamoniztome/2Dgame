// Procedural audio via Web Audio API — no audio files needed.
// File-based SFX (sfx_spell, sfx_planta, sfx_portal) are played via Phaser
// when loaded; otherwise procedural synthesis is used as fallback.

let _ctx   = null;
let _scene = null;
let _muted = false;

function ctx() {
  if (!_ctx && typeof AudioContext !== 'undefined') _ctx = new AudioContext();
  return _ctx;
}

function initFromPhaser(scene) {
  _scene = scene;
  if (scene?.sound?.context) _ctx = scene.sound.context;
}

function playSfx(key, volume = 0.7) {
  if (_scene?.cache?.audio?.exists(key)) {
    _scene.sound.play(key, { volume });
    return true;
  }
  return false;
}

// ── low-level helpers ────────────────────────────────────────────────────────

function osc(type, freq, duration, gain = 0.15, freqEnd = null, delayMs = 0) {
  const c = ctx(); if (!c) return;
  const now = c.currentTime + delayMs / 1000;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  g.connect(c.destination);
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
  o.connect(g);
  o.start(now);
  o.stop(now + duration + 0.01);
}

function noise(duration, gain = 0.08, lpFreq = 2000) {
  const c = ctx(); if (!c) return;
  const now = c.currentTime;
  const size = Math.ceil(c.sampleRate * duration);
  const buf  = c.createBuffer(1, size, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lpFreq;

  const g = c.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);

  src.connect(lp);
  lp.connect(g);
  g.connect(c.destination);
  src.start(now);
  src.stop(now + duration);
}

// ── public sounds ────────────────────────────────────────────────────────────

export const SoundManager = {
  init: initFromPhaser,

  toggleMute() {
    _muted = !_muted;
    if (_scene?.sound) _scene.sound.setMute(_muted);
    return _muted;
  },
  isMuted() { return _muted; },

  // Footstep: soft noise burst, throttled by caller
  footstep(running = false) {
    if (_muted) return;
    noise(running ? 0.07 : 0.09, running ? 0.06 : 0.045, running ? 1800 : 900);
  },

  // Plant collected: file SFX + procedural chord
  collectPlant(element = 'EARTH') {
    if (_muted) return;
    playSfx('sfx_planta', 0.75);
    const chords = {
      WATER: [523, 659, 784, 988],
      FIRE:  [392, 523, 659, 784],
      AIR:   [659, 784, 988, 1175],
      EARTH: [440, 554, 659, 880],
    };
    const freqs = chords[element] || chords.EARTH;
    freqs.forEach((f, i) => osc('sine', f, 0.45, 0.08, null, i * 65));
  },

  // Shake / water-drop
  shake() {
    if (_muted) return;
    osc('sine', 900, 0.28, 0.12, 220);
  },

  // Spell cast: file SFX, fallback to sweep
  castSpell() {
    if (_muted) return;
    if (!playSfx('sfx_spell', 0.70)) {
      osc('sawtooth', 180, 0.55, 0.18, 680);
      osc('sine',     360, 0.35, 0.10, 900, 80);
    }
  },

  // Spell unlock banner
  spellUnlocked() {
    if (_muted) return;
    [440, 554, 659, 880].forEach((f, i) => osc('sine', f, 0.6, 0.13, null, i * 100));
  },

  // Area transition chime
  areaChange() {
    if (_muted) return;
    osc('sine', 330, 0.6, 0.07, 440);
  },

  // Map open / close
  mapToggle(open = true) {
    if (_muted) return;
    osc('sine', open ? 440 : 330, 0.25, 0.09);
  },

  // Portal enter: file SFX, fallback to procedural
  portal() {
    if (_muted) return;
    if (!playSfx('sfx_portal', 0.80)) {
      osc('sine', 220, 0.8, 0.14, 880);
      osc('sine', 440, 0.5, 0.10, 660, 200);
    }
  },

  // Inventory full warning
  inventoryFull() {
    if (_muted) return;
    osc('square', 220, 0.15, 0.12);
    osc('square', 180, 0.15, 0.15, null, 160);
  },
};
