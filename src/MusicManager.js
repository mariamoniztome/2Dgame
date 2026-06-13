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

let _scene      = null;
let _current    = null;   // currently playing Phaser Sound object
let _fadeInTw   = null;   // active fade-in tween (for _current)
let _fadeTw     = null;   // active fade-out tween
let _fadingOut  = null;   // sound currently being faded out (may differ from prev _current)

function _killFading() {
  if (_fadeInTw) { _fadeInTw.stop(); _fadeInTw = null; }
  if (_fadeTw)   { _fadeTw.stop();   _fadeTw   = null; }
  if (_fadingOut) { try { _fadingOut.stop(); _fadingOut.destroy?.(); } catch (_) {} _fadingOut = null; }
}

export const MusicManager = {

  init(scene) {
    _scene = scene;
  },

  playArea(area) {
    const key = ZONE_TRACKS[area];
    if (!key) return;
    MusicManager._crossfadeTo(key);
  },

  playIntro() {
    MusicManager._crossfadeTo('music_intro');
  },

  stop() {
    _killFading();
    if (!_scene || !_current) return;
    const dying = _current;
    _current = null;
    _fadeTw = _scene.tweens.add({
      targets: dying, volume: 0, duration: FADE_MS,
      onComplete: () => { try { dying.stop(); dying.destroy?.(); } catch (_) {} _fadeTw = null; },
    });
    _fadingOut = dying;
  },

  _crossfadeTo(key) {
    if (!_scene) return;
    if (_current?.key === key && _current.isPlaying) return;
    if (!_scene.cache.audio.exists(key)) return;

    const prev = _current;

    // Force-stop any sound still mid-fade before starting new crossfade
    _killFading();

    const next = _scene.sound.add(key, { loop: true, volume: 0 });
    next.play();
    _fadeInTw = _scene.tweens.add({
      targets: next, volume: MASTER_VOLUME, duration: FADE_MS,
      onComplete: () => { _fadeInTw = null; },
    });
    _current = next;

    if (prev) {
      _fadingOut = prev;
      _fadeTw = _scene.tweens.add({
        targets: prev, volume: 0, duration: FADE_MS,
        onComplete: () => {
          try { prev.stop(); prev.destroy?.(); } catch (_) {}
          _fadeTw = null;
          _fadingOut = null;
        },
      });
    }
  },
};
