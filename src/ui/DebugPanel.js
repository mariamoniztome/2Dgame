// Debug overlay — toggle with ` (backtick) or F2
// Only shows when the URL contains ?debug or after pressing the key

export class DebugPanel {
  constructor(game) {
    this._game   = game;
    this._panel  = null;
    this._visible = false;
    this._build();

    window.addEventListener('keydown', e => {
      if (e.key === '`' || e.key === 'F2') this.toggle();
    });
  }

  toggle() {
    this._visible = !this._visible;
    this._panel.style.display = this._visible ? 'block' : 'none';
    if (this._visible) this._syncFromScene();
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  _z1() {
    const s = this._game.scene.getScene('Zone1');
    return s && s.sys.isActive() ? s : null;
  }

  _setSlider(id, val) {
    const el  = document.getElementById(`dp-${id}`);
    const lbl = document.getElementById(`dp-${id}-lbl`);
    if (el)  el.value = val;
    if (lbl) lbl.textContent = this._fmt(val);
  }

  _fmt(v) { return Number.isInteger(v) ? v : v.toFixed(2); }

  _syncFromScene() {
    const z1 = this._z1();
    if (!z1) return;
    this._setSlider('zoom',       z1.cameras.main.zoom);
    this._setSlider('playerSize', z1.player?.displayWidth ?? 260);
    this._setSlider('vagScale',   z1._vagScale    ?? 0.75);
    this._setSlider('vagQty',     z1._vagQty      ?? 12);
    this._setSlider('vagFreq',    z1._vagFreq     ?? 700);
    this._setSlider('decoMult',   z1._decoMult    ?? 1.9);
    this._setSlider('placaSize',  z1._placaSize   ?? 130);
    this._setSlider('placaX',     z1._placaCampoX ?? 110);
    this._setSlider('placaY',     z1._placaCampoY ?? 110);
  }

  // ── build DOM ─────────────────────────────────────────────────────────────
  _build() {
    const CONTROLS = [
      { id: 'zoom',       label: 'Camera Zoom',      min: 0.5,  max: 4,    step: 0.05, def: 2.0  },
      { id: 'playerSize', label: 'Player Size px',   min: 32,   max: 600,  step: 4,    def: 260  },
      { id: 'vagScale',   label: 'Vagalume Scale',   min: 0.05, max: 1.5,  step: 0.01, def: 0.75 },
      { id: 'vagQty',     label: 'Vagalume Qty',     min: 1,    max: 40,   step: 1,    def: 12   },
      { id: 'vagFreq',    label: 'Vagalume Freq ms', min: 20,   max: 2000, step: 20,   def: 700  },
      { id: 'decoMult',   label: 'Deco Size ×',      min: 0.1,  max: 4,    step: 0.05, def: 1.9  },
      { id: 'placaSize',  label: 'Placa Tamanho px', min: 20,   max: 400,  step: 4,    def: 130  },
      { id: 'placaX',     label: 'Placa Campo X',    min: 0,    max: 640,  step: 5,    def: 110  },
      { id: 'placaY',     label: 'Placa Campo Y',    min: 0,    max: 400,  step: 5,    def: 110  },
    ];

    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    Object.assign(panel.style, {
      position: 'fixed', top: '10px', right: '10px',
      background: 'rgba(0,18,4,0.92)',
      border: '1px solid #3a7a3a',
      color: '#9ed89e', padding: '12px 14px',
      borderRadius: '10px', fontFamily: 'monospace',
      fontSize: '12px', width: '270px',
      zIndex: '99999', display: 'none',
      userSelect: 'none', lineHeight: '1.5',
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #2a5a2a">
        <b style="color:#7bc67e">⚙ Debug Panel</b>
        <small style="color:#5a8c5a">[ \` ] fecha</small>
      </div>

      ${CONTROLS.map(c => `
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px">
            <span style="color:#c0e8c0">${c.label}</span>
            <span id="dp-${c.id}-lbl" style="color:#fff;min-width:38px;text-align:right">${c.def}</span>
          </div>
          <input type="range" id="dp-${c.id}"
            min="${c.min}" max="${c.max}" step="${c.step}" value="${c.def}"
            style="width:100%;accent-color:#7bc67e;height:18px;cursor:pointer">
        </div>
      `).join('')}

      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #2a5a2a;display:flex;gap:6px">
        <button id="dp-rebuild-ff"
          style="flex:1;background:#1a4a1a;color:#9ed89e;border:1px solid #3a7a3a;
                 border-radius:4px;padding:4px;cursor:pointer;font-size:11px">
          ↺ Rebuild Vagalumes
        </button>
        <button id="dp-copy"
          style="flex:1;background:#1a4a1a;color:#9ed89e;border:1px solid #3a7a3a;
                 border-radius:4px;padding:4px;cursor:pointer;font-size:11px">
          📋 Copiar Config
        </button>
      </div>
      <div id="dp-msg" style="color:#7bc67e;font-size:11px;margin-top:6px;min-height:14px"></div>
    `;

    document.body.appendChild(panel);
    this._panel = panel;

    // ── wire sliders ────────────────────────────────────────────────────────
    CONTROLS.forEach(({ id }) => {
      const el  = document.getElementById(`dp-${id}`);
      const lbl = document.getElementById(`dp-${id}-lbl`);
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        lbl.textContent = this._fmt(v);
        this._apply(id, v);
      });
    });

    // ── rebuild button ──────────────────────────────────────────────────────
    document.getElementById('dp-rebuild-ff').addEventListener('click', () => {
      const z1 = this._z1();
      if (z1?._rebuildFireflies) {
        z1._rebuildFireflies();
        this._msg('Vagalumes reconstruídos ✓');
      } else {
        this._msg('Zona 1 não está ativa');
      }
    });

    // ── copy config button ──────────────────────────────────────────────────
    document.getElementById('dp-copy').addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      const cfg = {
        zoom:       z1.cameras.main.zoom,
        playerSize: z1.player?.displayWidth ?? 260,
        vagScale:   z1._vagScale  ?? 0.55,
        vagQty:     z1._vagQty    ?? 2,
        vagFreq:    z1._vagFreq   ?? 150,
        decoMult:   z1._decoMult  ?? 1.0,
      };
      navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))
        .then(() => this._msg('Copiado para clipboard ✓'))
        .catch(() => this._msg(JSON.stringify(cfg)));
    });
  }

  _msg(text) {
    const el = document.getElementById('dp-msg');
    if (!el) return;
    el.textContent = text;
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => { el.textContent = ''; }, 3000);
  }

  // ── apply change to live scene ────────────────────────────────────────────
  _apply(id, v) {
    const z1 = this._z1();
    if (!z1) return;

    switch (id) {
      case 'zoom':
        z1.cameras.main.setZoom(v);
        break;

      case 'playerSize':
        if (z1.player) z1.player.setDisplaySize(v, v);
        break;

      case 'vagScale':
        z1._vagScale = v;
        // scale change needs a full rebuild to take effect
        if (z1._rebuildFireflies) z1._rebuildFireflies();
        break;

      case 'vagQty':
        z1._vagQty = v;
        if (z1.campoEmitter)  z1.campoEmitter.quantity  = v;
        if (z1.sparseEmitter) z1.sparseEmitter.quantity = Math.max(1, Math.round(v / 2));
        break;

      case 'vagFreq':
        z1._vagFreq = v;
        if (z1.campoEmitter)  z1.campoEmitter.frequency  = v;
        if (z1.sparseEmitter) z1.sparseEmitter.frequency = v * 3;
        break;

      case 'decoMult':
        z1._decoMult = v;
        if (z1.decoImages) {
          z1.decoImages.forEach(({ img, baseSize }) =>
            img.setDisplaySize(baseSize * v, baseSize * v)
          );
        }
        break;

      case 'placaSize':
        z1._placaSize = v;
        if (z1.placaCampo)  z1.placaCampo.setDisplaySize(v, v);
        if (z1.placaLimiar) z1.placaLimiar.setDisplaySize(v, v);
        break;

      case 'placaX':
        z1._placaCampoX = v;
        if (z1.placaCampo) z1.placaCampo.setX(v);
        break;

      case 'placaY':
        z1._placaCampoY = v;
        if (z1.placaCampo) z1.placaCampo.setY(v);
        break;
    }
  }
}
