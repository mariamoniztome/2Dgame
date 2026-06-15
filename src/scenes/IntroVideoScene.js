import Phaser from 'phaser';

const VIDEO_SOURCES = [
  '/assets/cena_inicial/video.mp4',
  '/assets/cena_inicial/video.webm',
];

export class IntroVideoScene extends Phaser.Scene {
  constructor() { super('IntroVideo'); }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this._done          = false;
    this._video         = null;
    this._skipEl        = null;
    this._startOverlay  = null;

    this._createVideoElement();
    this._buildStartOverlay();
  }

  _createVideoElement() {
    const v = document.createElement('video');
    this._video = v;

    VIDEO_SOURCES.forEach(src => {
      const s = document.createElement('source');
      s.src = src;
      v.appendChild(s);
    });

    Object.assign(v.style, {
      position:  'fixed',
      inset:     '0',
      width:     '100%',
      height:    '100%',
      zIndex:    '2000',
      background:'#000',
      objectFit: 'cover',
      opacity:   '0',           // hidden until play starts
      transition:'opacity 0.85s ease',
    });
    v.playsInline = true;
    document.body.appendChild(v);
    v.load();                   // preload while start overlay is visible

    v.addEventListener('ended', () => this._finish());
  }

  _buildStartOverlay() {
    const overlay = document.createElement('div');
    this._startOverlay = overlay;

    Object.assign(overlay.style, {
      position:       'fixed',
      inset:          '0',
      zIndex:         '2002',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      overflow:       'hidden',
      background:     '#f6a3b3',
      transition:     'opacity 0.4s ease',
    });

    const mkImg = (src, id) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      Object.assign(img.style, {
        position:      'absolute',
        top:           '0',
        height:        '100%',
        width:         'auto',
        pointerEvents: 'none',
        userSelect:    'none',
        [id === 'l' ? 'left' : 'right']: '0',
      });
      return img;
    };

    const title = document.createElement('img');
    title.src = '/assets/loading/loading_title.svg';
    title.alt = 'Bruxa, Bruxinha';
    Object.assign(title.style, {
      position:    'relative',
      zIndex:      '1',
      width:       'min(66vw, 860px)',
      height:      'auto',
      display:     'block',
      marginBottom:'2.25rem',
    });

    const btn = document.createElement('button');
    btn.textContent = '▶  Começar';
    Object.assign(btn.style, {
      position:     'relative',
      zIndex:       '1',
      fontFamily:   "'Red Hat Text', sans-serif",
      fontSize:     'clamp(14px, 1.3vw, 17px)',
      fontWeight:   '600',
      letterSpacing:'0.02em',
      color:        '#000',
      background:   '#ffffff',
      border:       'none',
      borderRadius: '999px',
      padding:      '13px 40px',
      cursor:       'pointer',
      boxShadow:    '0 2px 16px rgba(0,0,0,0.18)',
      transition:   'background 0.18s, transform 0.12s',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f0f0'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#ffffff'; });
    btn.addEventListener('mousedown',  () => { btn.style.transform  = 'scale(0.96)'; });
    btn.addEventListener('mouseup',    () => { btn.style.transform  = 'scale(1)'; });

    overlay.appendChild(mkImg('/assets/loading/loading_left.svg',  'l'));
    overlay.appendChild(mkImg('/assets/loading/loading_right.svg', 'r'));
    overlay.appendChild(title);
    overlay.appendChild(btn);
    document.body.appendChild(overlay);

    btn.addEventListener('click', () => this._startVideo());
  }

  _startVideo() {
    // Remove start overlay — user gesture is now active, audio is unlocked
    this._startOverlay?.remove();
    this._startOverlay = null;

    // Show video
    if (this._video) this._video.style.opacity = '1';

    // Build skip button
    const skip = document.createElement('button');
    this._skipEl = skip;
    skip.textContent = 'Saltar introdução';
    Object.assign(skip.style, {
      position:     'fixed',
      bottom:       '36px',
      right:        '36px',
      zIndex:       '2001',
      fontFamily:   "'Red Hat Text', sans-serif",
      fontSize:     '15px',
      fontWeight:   '600',
      letterSpacing:'0.02em',
      color:        '#000',
      background:   '#f6a3b3',
      border:       'none',
      borderRadius: '999px',
      padding:      '11px 28px',
      cursor:       'pointer',
      boxShadow:    '0 2px 16px rgba(0,0,0,0.35)',
      opacity:      '0',
      pointerEvents:'none',
      transition:   'background 0.18s, transform 0.12s',
    });
    skip.addEventListener('mouseenter', () => { skip.style.background = '#e38599'; });
    skip.addEventListener('mouseleave', () => { skip.style.background = '#f6a3b3'; });
    skip.addEventListener('mousedown',  () => { skip.style.transform  = 'scale(0.96)'; });
    skip.addEventListener('mouseup',    () => { skip.style.transform  = 'scale(1)'; });
    skip.addEventListener('click',      () => this._finish());
    document.body.appendChild(skip);

    // Show skip button after 1 s
    setTimeout(() => {
      skip.style.opacity      = '1';
      skip.style.pointerEvents= 'auto';
      skip.style.transition   = 'opacity 0.4s ease, background 0.18s, transform 0.12s';
    }, 1000);

    // Play unmuted — safe because we're inside a click handler
    this._video?.play().catch(() => this._finish());
  }

  _finish() {
    if (this._done) return;
    this._done = true;

    this._skipEl?.remove();
    this._skipEl = null;

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
    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.cameras.main.once('camerafadeincomplete', () => {
      this.scene.start('Zone1');
    });
  }

  shutdown() {
    this._video?.remove();
    this._skipEl?.remove();
    this._startOverlay?.remove();
    this._video        = null;
    this._skipEl       = null;
    this._startOverlay = null;
  }
}
