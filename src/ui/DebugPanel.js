// Debug overlay — toggle with ` (backtick) or F2

export class DebugPanel {
  constructor(game) {
    this._game    = game;
    this._panel   = null;
    this._visible = false;
    this._statsTimer = null;
    this._build();

    window.addEventListener('keydown', e => {
      if (e.key === '`' || e.key === 'F2') this.toggle();
    });
  }

  toggle() {
    this._visible = !this._visible;
    this._panel.style.display = this._visible ? 'flex' : 'none';
    if (this._visible) {
      this._syncFromScene();
      this._startStatsLoop();
    } else {
      clearInterval(this._statsTimer);
    }
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

  _fmt(v) { return Number.isInteger(v) ? v : parseFloat(v.toFixed(2)); }

  _syncFromScene() {
    const z1 = this._z1();
    if (!z1) return;
    this._setSlider('zoom',          z1.cameras.main.zoom);
    this._setSlider('playerSize',    z1.player?.displayWidth ?? 260);
    this._setSlider('vagScale',      z1._vagScale    ?? 1.0);
    this._setSlider('vagQty',        z1._vagQty      ?? 12);
    this._setSlider('vagFreq',       z1._vagFreq     ?? 700);
    this._setSlider('decoMult',      z1._decoMult    ?? 1.0);
    this._setSlider('placaSize',     z1._placaSize   ?? 70);
    this._setSlider('placaX',        z1._placaCampoX ?? 520);
    this._setSlider('placaY',        z1._placaCampoY ?? 400);
    this._setSlider('zoneW',         z1._zoneW       ?? 1920);
    this._setSlider('zoneH',         z1._zoneH       ?? 1080);
    this._setSlider('globalSizeMult',z1._globalSizeMult ?? 1.0);
  }

  _startStatsLoop() {
    clearInterval(this._statsTimer);
    this._statsTimer = setInterval(() => {
      this._updateStats();
      this._buildPlantsList();
    }, 500);
    this._updateStats();
    this._buildPlantsList();
  }

  _updateStats() {
    const z1  = this._z1();
    const fps  = Math.round(this._game.loop.actualFps ?? 0);
    const px   = z1?.player ? Math.round(z1.player.x) : '—';
    const py   = z1?.player ? Math.round(z1.player.y) : '—';
    const area = z1?._currentArea || '—';
    const zw   = z1?._zoneW ?? '—';
    const zh   = z1?._zoneH ?? '—';

    const el = document.getElementById('dp-stats-body');
    if (el) el.innerHTML =
      `<span style="color:#7bc67e">FPS</span> <b>${fps}</b>` +
      `&nbsp;&nbsp;<span style="color:#7bc67e">X</span> <b>${px}</b>` +
      `&nbsp;<span style="color:#7bc67e">Y</span> <b>${py}</b>` +
      `&nbsp;&nbsp;<span style="color:#7bc67e">Zona</span> <b>${zw}×${zh}</b>` +
      `<br><span style="color:#7bc67e">Área</span> <b>${area}</b>`;
  }

  // ── build DOM ─────────────────────────────────────────────────────────────
  _build() {
    const CONTROLS = [
      { id: 'zoom',          label: 'Camera Zoom',       min: 0.5,  max: 4,    step: 0.05, def: 2.0  },
      { id: 'playerSize',    label: 'Player Size px',    min: 32,   max: 500,  step: 4,    def: 260  },
      { id: 'vagScale',      label: 'Vagalume Scale',    min: 0.05, max: 1.5,  step: 0.01, def: 0.75 },
      { id: 'vagQty',        label: 'Vagalume Qty',      min: 1,    max: 40,   step: 1,    def: 12   },
      { id: 'vagFreq',       label: 'Vagalume Freq ms',  min: 20,   max: 2000, step: 20,   def: 700  },
      { id: 'decoMult',      label: 'Deco Size ×',       min: 0.1,  max: 4,    step: 0.05, def: 1.9  },
      { id: 'placaSize',     label: 'Placa Tamanho px',  min: 20,   max: 400,  step: 4,    def: 130  },
      { id: 'placaX',        label: 'Placa Campo X',     min: 0,    max: 2000, step: 5,    def: 520  },
      { id: 'placaY',        label: 'Placa Campo Y',     min: 0,    max: 2000, step: 5,    def: 400  },
      { id: 'zoneW',         label: '── Zona Width px',  min: 1280, max: 3840, step: 128,  def: 1920 },
      { id: 'zoneH',         label: 'Zona Height px',    min: 720,  max: 2160, step: 72,   def: 1080 },
      { id: 'globalSizeMult',label: '── Global ×',       min: 0.1,  max: 5,    step: 0.05, def: 1.0  },
    ];

    const TELEPORTS = [
      { label: 'Campo Centro',  x: 640,   y: 600  },
      { label: 'Trepadeira',    x: 640,   y: 100  },
      { label: 'Limiar Centro', x: 640,   y: -500 },
      { label: 'Jardim Centro', x: 2200,  y: 400  },
    ];

    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    Object.assign(panel.style, {
      position:    'fixed',
      top:         '10px',
      right:       '10px',
      background:  'rgba(0,14,3,0.95)',
      border:      '1px solid #3a7a3a',
      color:       '#9ed89e',
      borderRadius:'10px',
      fontFamily:  'monospace',
      fontSize:    '12px',
      width:       '290px',
      maxHeight:   'calc(100vh - 20px)',
      zIndex:      '99999',
      display:     'none',
      userSelect:  'none',
      lineHeight:  '1.5',
      flexDirection:'column',
    });

    const scrollBox = document.createElement('div');
    Object.assign(scrollBox.style, {
      overflowY: 'auto',
      padding:   '12px 14px',
      flex:      '1',
    });

    scrollBox.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #2a5a2a">
        <b style="color:#7bc67e;font-size:13px">⚙ Debug Panel</b>
        <small style="color:#5a8c5a">[ \` ] fecha</small>
      </div>

      <!-- Live stats -->
      <div style="background:#0a1f0a;border:1px solid #1f4a1f;border-radius:6px;
                  padding:7px 10px;margin-bottom:10px;line-height:1.8;font-size:11px">
        <div style="color:#5a8c5a;font-size:10px;letter-spacing:1px;margin-bottom:3px">ESTADO LIVE</div>
        <div id="dp-stats-body">—</div>
      </div>

      <!-- Sliders -->
      <div style="color:#5a8c5a;font-size:10px;letter-spacing:1px;margin-bottom:6px">CONTROLOS</div>
      ${CONTROLS.map(c => `
        <div style="margin-bottom:7px">
          <div style="display:flex;justify-content:space-between;margin-bottom:1px">
            <span style="color:#c0e8c0;font-size:11px">${c.label}</span>
            <span id="dp-${c.id}-lbl" style="color:#fff;min-width:40px;text-align:right;font-size:11px">${c.def}</span>
          </div>
          <input type="range" id="dp-${c.id}"
            min="${c.min}" max="${c.max}" step="${c.step}" value="${c.def}"
            style="width:100%;accent-color:#7bc67e;height:16px;cursor:pointer">
        </div>
      `).join('')}

      <!-- Teleport -->
      <div style="color:#5a8c5a;font-size:10px;letter-spacing:1px;margin:10px 0 6px">TELETRANSPORTE</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px">
        ${TELEPORTS.map(t => `
          <button data-tp-x="${t.x}" data-tp-y="${t.y}"
            style="background:#0d2a10;color:#9ed89e;border:1px solid #3a7a3a;
                   border-radius:5px;padding:5px 4px;cursor:pointer;font-size:11px;
                   font-family:monospace">
            ${t.label}
          </button>
        `).join('')}
        <button id="dp-tp-custom-btn"
          style="background:#0d2010;color:#c8f2bf;border:1px solid #2a6a2a;
                 border-radius:5px;padding:5px 4px;cursor:pointer;font-size:11px;
                 font-family:monospace;grid-column:span 2">
          ✏ Ir para X/Y custom
        </button>
      </div>
      <div id="dp-tp-custom" style="display:none;gap:5px;margin-bottom:8px">
        <input id="dp-tp-x" placeholder="X" type="number" value="640"
          style="flex:1;background:#0a1a0a;color:#9ed89e;border:1px solid #2a5a2a;
                 border-radius:4px;padding:4px;font-family:monospace;font-size:11px;width:80px">
        <input id="dp-tp-y" placeholder="Y" type="number" value="400"
          style="flex:1;background:#0a1a0a;color:#9ed89e;border:1px solid #2a5a2a;
                 border-radius:4px;padding:4px;font-family:monospace;font-size:11px;width:80px">
        <button id="dp-tp-go"
          style="background:#1a4a1a;color:#9ed89e;border:1px solid #3a7a3a;
                 border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px">
          Ir
        </button>
      </div>

      <!-- Plant spawns -->
      <div style="color:#5a8c5a;font-size:10px;letter-spacing:1px;margin-bottom:6px">PLANTAS NO MAPA</div>
      <div id="dp-plants-list" style="background:#0a1a0a;border:1px solid #1f3a1f;
           border-radius:5px;padding:6px 8px;font-size:10px;line-height:1.8;
           color:#8ac88a;margin-bottom:10px">—</div>

      <!-- Action buttons -->
      <div style="color:#5a8c5a;font-size:10px;letter-spacing:1px;margin-bottom:6px">AÇÕES</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button id="dp-rebuild-ff"
          style="flex:1;background:#1a4a1a;color:#9ed89e;border:1px solid #3a7a3a;
                 border-radius:4px;padding:5px;cursor:pointer;font-size:11px">
          ↺ Vagalumes
        </button>
        <button id="dp-copy"
          style="flex:1;background:#1a4a1a;color:#9ed89e;border:1px solid #3a7a3a;
                 border-radius:4px;padding:5px;cursor:pointer;font-size:11px">
          📋 Copiar Config
        </button>
        <button id="dp-collect-all"
          style="flex:1;background:#1a2a10;color:#c8e8a0;border:1px solid #4a7a1a;
                 border-radius:4px;padding:5px;cursor:pointer;font-size:11px">
          ✓ Apanhar tudo
        </button>
        <button id="dp-restart-zone"
          style="flex:1 1 100%;background:#2a1a00;color:#ffcc66;border:1px solid #7a5a1a;
                 border-radius:4px;padding:5px;cursor:pointer;font-size:11px">
          ↺ Reiniciar Zona (aplica tamanho)
        </button>
      </div>
      <div id="dp-msg" style="color:#7bc67e;font-size:11px;margin-top:7px;min-height:14px"></div>
    `;

    panel.appendChild(scrollBox);
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

    // ── teleport preset buttons ─────────────────────────────────────────────
    scrollBox.querySelectorAll('[data-tp-x]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tx = parseFloat(btn.dataset.tpX);
        const ty = parseFloat(btn.dataset.tpY);
        this._teleport(tx, ty);
      });
    });

    // ── custom teleport toggle ──────────────────────────────────────────────
    document.getElementById('dp-tp-custom-btn').addEventListener('click', () => {
      const box = document.getElementById('dp-tp-custom');
      const showing = box.style.display === 'flex';
      box.style.display = showing ? 'none' : 'flex';
    });
    document.getElementById('dp-tp-go').addEventListener('click', () => {
      const tx = parseFloat(document.getElementById('dp-tp-x').value);
      const ty = parseFloat(document.getElementById('dp-tp-y').value);
      if (!isNaN(tx) && !isNaN(ty)) this._teleport(tx, ty);
    });

    // ── restart zone ────────────────────────────────────────────────────────
    document.getElementById('dp-restart-zone').addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      const wv = parseFloat(document.getElementById('dp-zoneW').value);
      const hv = parseFloat(document.getElementById('dp-zoneH').value);
      this._game.registry.set('debugZoneW', wv);
      this._game.registry.set('debugZoneH', hv);
      z1.scene.restart();
      this._msg(`Reiniciada ${wv}×${hv} ✓`);
    });

    // ── rebuild fireflies ───────────────────────────────────────────────────
    document.getElementById('dp-rebuild-ff').addEventListener('click', () => {
      const z1 = this._z1();
      if (z1?._rebuildFireflies) {
        z1._rebuildFireflies();
        this._msg('Vagalumes reconstruídos ✓');
      } else {
        this._msg('Zona 1 não está ativa');
      }
    });

    // ── copy config ─────────────────────────────────────────────────────────
    document.getElementById('dp-copy').addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      const cfg = {
        zoom:          z1.cameras.main.zoom,
        playerSize:    z1.player?.displayWidth ?? 260,
        vagScale:      z1._vagScale     ?? 1.0,
        vagQty:        z1._vagQty       ?? 12,
        vagFreq:       z1._vagFreq      ?? 700,
        decoMult:      z1._decoMult     ?? 1.0,
        globalSizeMult:z1._globalSizeMult ?? 1.0,
        zoneW:         z1._zoneW        ?? 1920,
        zoneH:         z1._zoneH        ?? 1080,
        placaSize:     z1._placaSize    ?? 70,
        placaCampoX:   z1._placaCampoX  ?? 520,
        placaCampoY:   z1._placaCampoY  ?? 400,
      };
      navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))
        .then(() => this._msg('Copiado ✓'))
        .catch(() => this._msg(JSON.stringify(cfg)));
    });

    // ── collect all plants ──────────────────────────────────────────────────
    document.getElementById('dp-collect-all').addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      if (z1.plants) {
        z1.plants.forEach(p => {
          if (!p.isCollected) {
            p.collect();
            this._game.events.emit('plantCollected', p.plantData);
          }
        });
      }
      this._msg('Todas as plantas apanhadas ✓');
    });
  }

  _teleport(x, y) {
    const z1 = this._z1();
    if (!z1?.player) { this._msg('Zona 1 não está ativa'); return; }
    z1.player.setPosition(x, y);
    if (z1.player.body) z1.player.body.reset(x, y);
    this._msg(`Teletransportado → ${x}, ${y} ✓`);
  }

  _msg(text) {
    const el = document.getElementById('dp-msg');
    if (!el) return;
    el.textContent = text;
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => { el.textContent = ''; }, 3000);
  }

  _buildPlantsList() {
    const z1 = this._z1();
    const el = document.getElementById('dp-plants-list');
    if (!el) return;

    const { PLANT_SPAWNS } = this._getPlantSpawns(z1);
    if (!PLANT_SPAWNS || PLANT_SPAWNS.length === 0) {
      el.textContent = '—'; return;
    }
    el.innerHTML = PLANT_SPAWNS.map(s => {
      const collected = z1 ? (z1.plants?.find(p => p.plantData?.id === s.id && p.isCollected) ? '✓' : '○') : '?';
      const col = collected === '✓' ? '#7bc67e' : '#8ac88a';
      return `<span style="color:${col}">${collected}</span> <b>${s.id}</b> <span style="color:#5a8c5a">${s.x},${s.y}</span>`;
    }).join('<br>');
  }

  _getPlantSpawns(z1) {
    if (!z1) return { PLANT_SPAWNS: [] };
    // Read from Zone1Scene's plant list
    const spawns = (z1.plants || []).map(p => ({
      id: p.plantData?.id ?? '?',
      x:  Math.round(p.x),
      y:  Math.round(p.y),
    }));
    return { PLANT_SPAWNS: spawns };
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
          const gm = z1._globalSizeMult ?? 1.0;
          z1.decoImages.forEach(({ img, baseSize }) =>
            img.setDisplaySize(baseSize * v * gm, baseSize * v * gm)
          );
        }
        break;

      case 'placaSize':
        z1._placaSize = v;
        { const gm = z1._globalSizeMult ?? 1.0;
          if (z1.placaCampo)  z1.placaCampo.setDisplaySize(v * gm, v * gm);
          if (z1.placaLimiar) z1.placaLimiar.setDisplaySize(v * gm, v * gm); }
        break;

      case 'placaX':
        z1._placaCampoX = v;
        if (z1.placaCampo) z1.placaCampo.setX(v);
        break;

      case 'placaY':
        z1._placaCampoY = v;
        if (z1.placaCampo) z1.placaCampo.setY(v);
        break;

      case 'zoneW':
      case 'zoneH':
        this._msg(`${id}=${v} → clica "↺ Reiniciar Zona"`);
        break;

      case 'globalSizeMult':
        z1._globalSizeMult = v;
        this._game.registry.set('debugGlobalSizeMult', v);
        if (z1.decoImages) {
          const dm = z1._decoMult ?? 1.0;
          z1.decoImages.forEach(({ img, baseSize }) =>
            img.setDisplaySize(baseSize * dm * v, baseSize * dm * v)
          );
        }
        { const ps = z1._placaSize ?? 70;
          if (z1.placaCampo)  z1.placaCampo.setDisplaySize(ps * v, ps * v);
          if (z1.placaLimiar) z1.placaLimiar.setDisplaySize(ps * v, ps * v); }
        break;
    }
  }
}
