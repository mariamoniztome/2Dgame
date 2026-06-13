// Background music with per-zone crossfade.
// Zone1 has 4 sub-areas, each with its own track:
//   campoVagalumes  → music_campo
//   transicao       → music_transicao
//   paredeZone      → music_transicao  (same atmosphere as transição)
//   limiarSecreto   → music_limiar
//   jardimInvertido → music_jardim
// The Opening/Map scene uses music_intro.

const ZONE_TRACKS = {
  campoVagalumes:  'music_campo',
  transicao:       'music_transicao',
  paredeZone:      'music_transicao',
  limiarSecreto:   'music_limiar',
  jardimInvertido: 'music_jardim',
};

const MASTER_VOLUME = 0.38;   // overall music volume (0–1)
const FADE_MS       = 1600;   // crossfade duration in ms

let _scene   = null;
let _current = null;   // currently playing Phaser Sound object
let _fadeTw  = null;   // active fade-out tween

export const MusicManager = {

  init(scene) {
    _scene = scene;
  },

  // Call when entering a named area in Zone1 (or 'intro'/'map').
  playArea(area) {
    const key = ZONE_TRACKS[area];
    if (!key) return;
    MusicManager._crossfadeTo(key);
  },

  playIntro() {
    MusicManager._crossfadeTo('music_intro');
  },

  stop() {
    if (!_scene || !_current) return;
    _scene.tweens.add({
      targets: _current, volume: 0, duration: FADE_MS,
      onComplete: () => { _current?.stop(); _current = null; },
    });
  },

  _crossfadeTo(key) {
    if (!_scene) return;
    // Don't restart if the same track is already playing
    if (_current?.key === key && _current.isPlaying) return;
    // Guard: track must be loaded
    if (!_scene.cache.audio.exists(key)) return;

    const prev = _current;

    // Start new track at volume 0 and fade in
    const next = _scene.sound.add(key, { loop: true, volume: 0 });
    next.play();
    _scene.tweens.add({ targets: next, volume: MASTER_VOLUME, duration: FADE_MS });
    _current = next;

    // Fade out previous track
    if (prev) {
      if (_fadeTw) _fadeTw.stop();
      _fadeTw = _scene.tweens.add({
        targets: prev, volume: 0, duration: FADE_MS,
        onComplete: () => { prev.stop(); prev.destroy?.(); _fadeTw = null; },
      });
    }
  },
};
