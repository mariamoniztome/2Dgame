import Phaser from 'phaser';

const VIDEO_SOURCES = [
  '/assets/cena_inicial/video.mp4',
  '/assets/cena_inicial/video.webm',
];

export class IntroVideoScene extends Phaser.Scene {
  constructor() { super('IntroVideo'); }

  create() {
    // Keep canvas black while video is in front
    this.cameras.main.setBackgroundColor('#000000');

    this._done = false;
    this._video  = null;
    this._skipEl = null;

    this._buildVideoOverlay();
  }

  _buildVideoOverlay() {
    // ── Video element ───────────────────────────────────────────────────────
    const v = document.createElement('video');
    this._video = v;

    VIDEO_SOURCES.forEach(src => {
      const s = document.createElement('source');
      s.src = src;
      v.appendChild(s);
    });

    Object.assign(v.style, {
      position:   'fixed',
      inset:      '0',
      width:      '100%',
      height:     '100%',
      zIndex:     '2000',
      background: '#000',
      objectFit:  'cover',
      opacity:    '1',
      transition: 'opacity 0.85s ease',
    });
    v.playsInline = true;
    document.body.appendChild(v);

    // ── Skip button ─────────────────────────────────────────────────────────
    const btn = document.createElement('button');
    this._skipEl = btn;
    btn.textContent = 'Saltar introdução';

    Object.assign(btn.style, {
      position:     'fixed',
      bottom:       '36px',
      right:        '36px',
      zIndex:       '2001',
      fontFamily:   "'Red Hat Text', sans-serif",
      fontSize:     '15px',
      fontWeight:   '600',
      letterSpacing:'0.02em',
      color:        '#000000',
      background:   '#f6a3b3',
      border:       'none',
      borderRadius: '999px',
      padding:      '11px 28px',
      cursor:       'pointer',
      boxShadow:    '0 2px 16px rgba(0,0,0,0.35)',
      transition:   'background 0.18s, transform 0.12s',
      opacity:      '0',
      pointerEvents:'none',
    });
    document.body.appendChild(btn);

    // Show skip button after 1 s so it doesn't obscure the very first frame
    setTimeout(() => {
      btn.style.opacity      = '1';
      btn.style.pointerEvents= 'auto';
      btn.style.transition   = 'opacity 0.4s ease, background 0.18s, transform 0.12s';
    }, 1000);

    // Hover / press effects
    btn.addEventListener('mouseenter', () => { btn.style.background = '#e38599'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#f6a3b3'; });
    btn.addEventListener('mousedown',  () => { btn.style.transform  = 'scale(0.96)'; });
    btn.addEventListener('mouseup',    () => { btn.style.transform  = 'scale(1)'; });

    // ── Transitions ─────────────────────────────────────────────────────────
    v.addEventListener('ended', () => this._finish());
    btn.addEventListener('click', () => this._finish());

    // If autoplay is blocked by browser policy → skip straight to game
    v.play().catch(() => this._finish());
  }

  _finish() {
    if (this._done) return;
    this._done = true;

    // Remove skip button immediately
    this._skipEl?.remove();
    this._skipEl = null;

    // Fade video to black
    if (this._video) {
      this._video.style.opacity = '0';
      setTimeout(() => {
        this._video?.remove();
        this._video = null;
        this._transitionToGame();
      }, 850);
    } else {
      this._transitionToGame();
    }
  }

  _transitionToGame() {
    // Camera fades in from black (canvas was already black behind video)
    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.cameras.main.once('camerafadeincomplete', () => {
      this.scene.start('Map');
    });
  }

  shutdown() {
    // Safety net: clean up DOM if scene is destroyed before video ends
    this._video?.remove();
    this._skipEl?.remove();
    this._video  = null;
    this._skipEl = null;
  }
}
