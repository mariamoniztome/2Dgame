// Procedural audio via Web Audio API — no audio files needed.
// Call SoundManager.init(audioContext) once, then call methods from anywhere.

let _ctx = null;

function ctx() {
  if (!_ctx && typeof AudioContext !== 'undefined') _ctx = new AudioContext();
  return _ctx;
}

function initFromPhaser(scene) {
  if (scene?.sound?.context) _ctx = scene.sound.context;
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

  // Footstep: soft noise burst, throttled by caller
  footstep(running = false) {
    noise(running ? 0.07 : 0.09, running ? 0.06 : 0.045, running ? 1800 : 900);
  },

  // Plant collected: ascending sparkle chord based on element
  collectPlant(element = 'EARTH') {
    const chords = {
      WATER: [523, 659, 784, 988],
      FIRE:  [392, 523, 659, 784],
      AIR:   [659, 784, 988, 1175],
      EARTH: [440, 554, 659, 880],
    };
    const freqs = chords[element] || chords.EARTH;
    freqs.forEach((f, i) => osc('sine', f, 0.45, 0.11, null, i * 65));
  },

  // Shake / water-drop
  shake() {
    osc('sine', 900, 0.28, 0.12, 220);
  },

  // Spell cast: sweep up
  castSpell() {
    osc('sawtooth', 180, 0.55, 0.18, 680);
    osc('sine',     360, 0.35, 0.10, 900, 80);
  },

  // Spell unlock banner
  spellUnlocked() {
    [440, 554, 659, 880].forEach((f, i) => osc('sine', f, 0.6, 0.13, null, i * 100));
  },

  // Area transition chime
  areaChange() {
    osc('sine', 330, 0.6, 0.07, 440);
  },

  // Map open / close
  mapToggle(open = true) {
    osc('sine', open ? 440 : 330, 0.25, 0.09);
  },

  // Portal enter
  portal() {
    osc('sine', 220, 0.8, 0.14, 880);
    osc('sine', 440, 0.5, 0.10, 660, 200);
  },

  // Inventory full warning
  inventoryFull() {
    osc('square', 220, 0.15, 0.12);
    osc('square', 180, 0.15, 0.15, null, 160);
  },
};
