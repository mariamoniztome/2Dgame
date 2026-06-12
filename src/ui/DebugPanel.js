// Debug overlay — toggle with ` (backtick) or F2
// Tabs: Mapa | Transição | Limiar | Plantas | Placas

export class DebugPanel {
  constructor(game) {
    this._game      = game;
    this._panel     = null;
    this._visible   = false;
    this._statsTimer = null;
    this._activeTab  = 'mapa';
    this._build();

    window.addEventListener('keydown', e => {
      if (e.key === 'Tab') e.preventDefault();
      if (e.key === '`' || e.key === 'F2' || e.key === 'Tab') {
        const z1 = this._z1();
        if (z1?._toggleDebugPanel) z1._toggleDebugPanel();
        else this.toggle();
      }
    });
  }

  toggle() {
    this._visible = !this._visible;
    this._panel.style.display = this._visible ? 'flex' : 'none';
    if (this._visible) {
      this._syncFromScene();
      this._startStatsLoop();
      this._switchTab(this._activeTab);
    } else {
      clearInterval(this._statsTimer);
    }
  }

  // ── scene accessor ────────────────────────────────────────────────────────
  _z1() {
    const s = this._game.scene.getScene('Zone1');
    return s && s.sys.isActive() ? s : null;
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  _fmt(v) { return Number.isInteger(v) ? v : parseFloat(v.toFixed(2)); }

  _slider(id, val) {
    const el  = document.getElementById(`dp-${id}`);
    const lbl = document.getElementById(`dp-${id}-lbl`);
    if (el)  el.value = val;
    if (lbl) lbl.textContent = this._fmt(val);
  }

  _msg(text) {
    const el = document.getElementById('dp-msg');
    if (!el) return;
    el.textContent = text;
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => { el.textContent = ''; }, 3000);
  }

  // ── styles ────────────────────────────────────────────────────────────────
  _css = {
    btn:  'background:#0d2a10;color:#9ed89e;border:1px solid #3a7a3a;border-radius:5px;' +
          'padding:5px 6px;cursor:pointer;font-size:11px;font-family:monospace;',
    btnW: 'background:#0d2a10;color:#9ed89e;border:1px solid #3a7a3a;border-radius:5px;' +
          'padding:5px 6px;cursor:pointer;font-size:11px;font-family:monospace;width:100%;margin-bottom:4px;',
    btnY: 'background:#2a1a00;color:#ffcc66;border:1px solid #7a5a1a;border-radius:5px;' +
          'padding:5px 6px;cursor:pointer;font-size:11px;font-family:monospace;width:100%;margin-bottom:4px;',
    sec:  'color:#5a8c5a;font-size:10px;letter-spacing:1px;margin:10px 0 5px',
    inp:  'background:#0a1a0a;color:#9ed89e;border:1px solid #2a5a2a;border-radius:4px;' +
          'padding:4px;font-family:monospace;font-size:11px;width:70px',
    sld:  'width:100%;accent-color:#7bc67e;height:16px;cursor:pointer',
  };

  _sliderRow(id, label, min, max, step, def) {
    return `
      <div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;margin-bottom:1px">
          <span style="color:#c0e8c0;font-size:11px">${label}</span>
          <span id="dp-${id}-lbl" style="color:#fff;min-width:42px;text-align:right;font-size:11px">${def}</span>
        </div>
        <input type="range" id="dp-${id}" min="${min}" max="${max}" step="${step}" value="${def}" style="${this._css.sld}">
      </div>`;
  }

  _syncFromScene() {
    const z1 = this._z1();
    if (!z1) return;
    this._slider('zoom',           z1.cameras.main.zoom);
    this._slider('playerSize',     z1.player?.displayWidth ?? 260);
    this._slider('vagScale',       z1._vagScale    ?? 1.0);
    this._slider('vagQty',         z1._vagQty      ?? 12);
    this._slider('vagFreq',        z1._vagFreq     ?? 700);
    this._slider('zoneW',          z1._zoneW       ?? 1920);
    this._slider('zoneH',          z1._zoneH       ?? 1080);
    this._slider('globalSizeMult', z1._globalSizeMult ?? 1.0);
    // Transição tab
    this._slider('transH',         z1._transH      ?? 525);
    this._slider('paredeH',        z1._paredeH     ?? 700);
    this._slider('tw-fundoAlpha',  z1._pz?.fundoParede?.alpha ?? 0.50);
    this._slider('tw-caminhoAlpha',z1._tz?.caminho?.alpha     ?? 1.0);
    this._slider('tw-caminhoY',    z1._tz?.caminho?.y         ?? Math.round(-(z1._transH ?? 525) / 2));
    this._slider('tw-caminhoAngle',z1._tz?.caminho?.angle     ?? 0);
    this._slider('tw-paredeAlpha', z1._pz?.parede?.alpha      ?? 1.0);
    // Limiar tab
    this._slider('transDecoMult',  z1._transDecoMult  ?? 1.0);
    this._slider('limiarDecoMult', z1._limiarDecoMult ?? 1.0);
    this._slider('campoDecoMult',  z1._campoDecoMult  ?? 1.0);
    this._slider('jardimDecoMult', z1._jardimDecoMult ?? 1.0);
    // Placas tab
    this._slider('placaSize',      z1._placaSize      ?? 70);
    this._slider('placaX',         z1._placaCampoX    ?? 520);
    this._slider('placaY',         z1._placaCampoY    ?? 400);
    this._slider('placaLimiarX',   z1._placaLimiarX   ?? 280);
    this._slider('placaLimiarYOff',z1._placaLimiarYOff ?? 120);
  }

  _startStatsLoop() {
    clearInterval(this._statsTimer);
    this._statsTimer = setInterval(() => {
      this._updateStats();
      if (this._activeTab === 'plantas') this._buildPlantsList();
      if (this._activeTab === 'transicao') this._refreshDecoTable();
    }, 500);
    this._updateStats();
  }

  _updateStats() {
    const z1  = this._z1();
    const fps  = Math.round(this._game.loop.actualFps ?? 0);
    const px   = z1?.player ? Math.round(z1.player.x) : '—';
    const py   = z1?.player ? Math.round(z1.player.y) : '—';
    const area = z1?._currentArea || '—';
    const zw   = z1?._zoneW ?? '—';
    const zh   = z1?._zoneH ?? '—';
    const th   = z1?._transH  ?? '—';
    const ph   = z1?._paredeH ?? '—';
    const el   = document.getElementById('dp-stats-body');
    if (el) el.innerHTML =
      `<span style="color:#7bc67e">FPS</span> <b>${fps}</b>` +
      `&nbsp;&nbsp;<span style="color:#7bc67e">X</span> <b>${px}</b>` +
      `&nbsp;<span style="color:#7bc67e">Y</span> <b>${py}</b>` +
      `<br><span style="color:#7bc67e">Zona</span> <b>${zw}×${zh}</b>` +
      `&nbsp;<span style="color:#7bc67e">TH</span> <b>${th}</b>` +
      `&nbsp;<span style="color:#7bc67e">PH</span> <b>${ph}</b>` +
      `<br><span style="color:#7bc67e">Área</span> <b>${area}</b>`;
  }

  // ── tab switching ─────────────────────────────────────────────────────────
  _switchTab(name) {
    this._activeTab = name;
    ['mapa','transicao','limiar','plantas','placas'].forEach(t => {
      const pane = document.getElementById(`dp-tab-${t}`);
      const btn  = document.getElementById(`dp-tabbt-${t}`);
      if (pane) pane.style.display = t === name ? 'block' : 'none';
      if (btn) {
        btn.style.background = t === name ? '#1a5a1a' : '#0a1a0a';
        btn.style.color      = t === name ? '#c8ffc8' : '#5a9c5a';
      }
    });
    if (name === 'plantas')   this._buildPlantsList();
    if (name === 'transicao') this._refreshDecoTable();
    if (name === 'limiar')    this._refreshLimiarInfo();
  }

  // ── build DOM ─────────────────────────────────────────────────────────────
  _build() {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    Object.assign(panel.style, {
      position:     'fixed',
      top:          '10px',
      right:        '10px',
      background:   'rgba(0,14,3,0.96)',
      border:       '1px solid #3a7a3a',
      color:        '#9ed89e',
      borderRadius: '10px',
      fontFamily:   'monospace',
      fontSize:     '12px',
      width:        '340px',
      maxHeight:    'calc(100vh - 20px)',
      zIndex:       '99999',
      display:      'none',
      userSelect:   'none',
      lineHeight:   '1.5',
      flexDirection:'column',
    });

    // ── header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding:      '7px 14px 5px',
      borderBottom: '1px solid #2a5a2a',
      display:      'flex',
      justifyContent: 'space-between',
      alignItems:   'center',
      flexShrink:   '0',
    });
    header.innerHTML = `<b style="color:#7bc67e;font-size:13px">⚙ Debug Panel</b>
      <small style="color:#5a8c5a">[ \` ] fecha</small>`;

    // ── tab bar ──────────────────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    Object.assign(tabBar.style, {
      display:      'flex',
      borderBottom: '1px solid #1a3a1a',
      flexShrink:   '0',
    });
    ['mapa','transicao','limiar','plantas','placas'].forEach(t => {
      const labels = { mapa:'Mapa', transicao:'Transição', limiar:'Limiar', plantas:'Plantas', placas:'Placas' };
      const btn = document.createElement('button');
      btn.id = `dp-tabbt-${t}`;
      btn.textContent = labels[t];
      Object.assign(btn.style, {
        flex:       '1',
        padding:    '5px 2px',
        background: '#0a1a0a',
        color:      '#5a9c5a',
        border:     'none',
        borderRight:'1px solid #1a3a1a',
        cursor:     'pointer',
        fontSize:   '11px',
        fontFamily: 'monospace',
      });
      btn.addEventListener('click', () => this._switchTab(t));
      tabBar.appendChild(btn);
    });

    // ── inspector bar (selected object) ─────────────────────────────────────
    const inspector = document.createElement('div');
    inspector.id = 'dp-inspector';
    Object.assign(inspector.style, {
      display:      'none',
      background:   '#0a2510',
      borderBottom: '1px solid #2a6a2a',
      padding:      '5px 14px',
      flexShrink:   '0',
      fontSize:     '10px',
    });
    inspector.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span id="dp-ins-label" style="color:#7bc67e;font-weight:bold;font-size:11px">—</span>
        <div style="display:flex;gap:4px">
          <button id="dp-ins-goto" style="background:#0d2a10;border:1px solid #3a7a3a;color:#7bc67e;
            border-radius:3px;padding:1px 6px;cursor:pointer;font-size:10px">→ ir</button>
          <button id="dp-ins-desel" style="background:none;border:1px solid #3a5a3a;color:#5a9c5a;
            border-radius:3px;padding:1px 6px;cursor:pointer;font-size:10px">✕</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <div>
          <div style="color:#5a8c5a;margin-bottom:1px">X <span id="dp-ins-x" style="color:#fff">—</span></div>
          <input type="number" id="dp-ins-xi" step="1" style="width:100%;background:#050f05;color:#9ed89e;
            border:1px solid #2a5a2a;border-radius:3px;padding:2px 4px;font-size:10px;font-family:monospace">
        </div>
        <div>
          <div style="color:#5a8c5a;margin-bottom:1px">Y <span id="dp-ins-y" style="color:#fff">—</span></div>
          <input type="number" id="dp-ins-yi" step="1" style="width:100%;background:#050f05;color:#9ed89e;
            border:1px solid #2a5a2a;border-radius:3px;padding:2px 4px;font-size:10px;font-family:monospace">
        </div>
        <div>
          <div style="color:#5a8c5a;margin-bottom:1px">W <span id="dp-ins-w" style="color:#fff">—</span></div>
          <input type="range" id="dp-ins-wi" min="10" max="4000" step="2"
            style="width:100%;accent-color:#7bc67e;height:14px">
        </div>
        <div>
          <div style="color:#5a8c5a;margin-bottom:1px">H <span id="dp-ins-h" style="color:#fff">—</span></div>
          <input type="range" id="dp-ins-hi" min="10" max="4000" step="2"
            style="width:100%;accent-color:#7bc67e;height:14px">
        </div>
        <div style="grid-column:1/-1">
          <div style="color:#5a8c5a;margin-bottom:1px">° ângulo <span id="dp-ins-rot" style="color:#fff">0</span></div>
          <input type="range" id="dp-ins-roti" min="-180" max="180" step="1" value="0"
            style="width:100%;accent-color:#7bc67e;height:14px">
        </div>
      </div>`;

    // ── scrollable content ───────────────────────────────────────────────────
    const scroll = document.createElement('div');
    Object.assign(scroll.style, { overflowY: 'auto', padding: '10px 14px', flex: '1' });
    scroll.innerHTML = this._buildTabMapa()
                     + this._buildTabTransicao()
                     + this._buildTabLimiar()
                     + this._buildTabPlantas()
                     + this._buildTabPlacas();

    // ── message bar ──────────────────────────────────────────────────────────
    const msgBar = document.createElement('div');
    Object.assign(msgBar.style, {
      padding:    '3px 14px',
      fontSize:   '11px',
      color:      '#7bc67e',
      minHeight:  '20px',
      borderTop:  '1px solid #1a3a1a',
      flexShrink: '0',
    });
    msgBar.id = 'dp-msg';

    panel.appendChild(header);
    panel.appendChild(tabBar);
    panel.appendChild(inspector);
    panel.appendChild(scroll);
    panel.appendChild(msgBar);
    document.body.appendChild(panel);
    this._panel = panel;

    this._wireEvents();
    this._switchTab('mapa');
  }

  // ── Tab: Mapa ─────────────────────────────────────────────────────────────
  _buildTabMapa() { return `
    <div id="dp-tab-mapa">
      <div style="background:#0a1f0a;border:1px solid #1f4a1f;border-radius:6px;
                  padding:7px 10px;margin-bottom:8px;line-height:1.8;font-size:11px">
        <div style="color:#5a8c5a;font-size:10px;letter-spacing:1px;margin-bottom:2px">ESTADO LIVE</div>
        <div id="dp-stats-body">—</div>
      </div>

      <div style="${this._css.sec}">COR DE FUNDO</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input type="color" id="dp-bg-color" value="#AFD6A8"
          style="width:44px;height:26px;cursor:pointer;border:1px solid #3a7a3a;
                 border-radius:4px;padding:1px 2px;background:#0a1a0a">
        <span id="dp-bg-color-lbl" style="color:#c0e8c0;font-size:11px;font-family:monospace">#AFD6A8</span>
        <button id="dp-bg-reset" style="${this._css.btn}">reset</button>
      </div>

      <div style="${this._css.sec}">CÂMERA / JOGADOR</div>
      ${this._sliderRow('zoom',          'Camera Zoom',     0.5, 4,    0.05, 2.0)}
      ${this._sliderRow('playerSize',    'Player Size px',  32,  500,  4,    100)}
      ${this._sliderRow('globalSizeMult','Global Size ×',   0.1, 5,    0.05, 1.0)}

      <div style="${this._css.sec}">VAGALUMES</div>
      ${this._sliderRow('vagScale','Vagalume Scale', 0.05, 1.5,  0.01, 1.0)}
      ${this._sliderRow('vagQty',  'Vagalume Qty',   1,    40,   1,    12)}
      ${this._sliderRow('vagFreq', 'Vagalume Freq ms',20,  2000, 20,   700)}
      <button id="dp-rebuild-ff" style="${this._css.btnW}">↺ Reconstruir Vagalumes</button>

      <div style="${this._css.sec}">DIMENSÕES DA ZONA</div>
      ${this._sliderRow('zoneW','Zona Width px',  1280, 3840, 128, 1920)}
      ${this._sliderRow('zoneH','Zona Height px', 720,  2160, 72,  1080)}
      <button id="dp-restart-zone" style="${this._css.btnY}">↺ Reiniciar Zona (aplica tamanho)</button>

      <div style="${this._css.sec}">TELETRANSPORTE</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px">
        <button class="dp-tp-preset" data-tp="campo"     style="${this._css.btn}">Campo</button>
        <button class="dp-tp-preset" data-tp="transicao" style="${this._css.btn}">Transição</button>
        <button class="dp-tp-preset" data-tp="limiar"    style="${this._css.btn}">Limiar</button>
        <button class="dp-tp-preset" data-tp="jardim"    style="${this._css.btn}">Jardim</button>
      </div>
      <div style="display:flex;gap:5px;margin-bottom:8px">
        <input id="dp-tp-x" type="number" value="640" placeholder="X" style="${this._css.inp}">
        <input id="dp-tp-y" type="number" value="600" placeholder="Y" style="${this._css.inp}">
        <button id="dp-tp-go" style="${this._css.btn}">Ir →</button>
      </div>

      <div style="${this._css.sec}">AÇÕES</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button id="dp-collect-all" style="${this._css.btn};flex:1">✓ Apanhar tudo</button>
        <button id="dp-copy"        style="${this._css.btn};flex:1">📋 Copiar Config</button>
      </div>
    </div>`; }

  // ── Tab: Transição ────────────────────────────────────────────────────────
  _buildTabTransicao() { return `
    <div id="dp-tab-transicao" style="display:none">
      <div style="${this._css.sec}">ALTURAS DAS ZONAS</div>
      ${this._sliderRow('transH', 'Transição Height px', 100, 1200, 25, 525)}
      ${this._sliderRow('paredeH','Parede Height px',    200, 2000, 50, 700)}
      <button id="dp-restart-trans" style="${this._css.btnY}">↺ Reiniciar Zona (aplica alturas)</button>

      <div style="${this._css.sec}">TRANSIÇÃO — CAMADAS</div>
      ${this._sliderRow('tw-caminhoAlpha','Caminho α',        0,    1,    0.01, 1.0)}
      ${this._sliderRow('tw-caminhoY',    'Caminho Y',       -800, 0,    5,   -262)}
      ${this._sliderRow('tw-caminhoAngle','Caminho Ângulo °', -180, 180,  1,    0  )}

      <div style="${this._css.sec}">PAREDE DE PLANTAS — CAMADAS</div>
      ${this._sliderRow('tw-fundoAlpha',  'Fundo Parede α',    0, 1, 0.01, 0.55)}
      ${this._sliderRow('tw-paredeAlpha', 'Parede Principal α',0, 1, 0.01, 1.0)}
      <button id="dp-rebuild-trans" style="${this._css.btnW}">↺ Reconstruir Parede (sem reiniciar)</button>

      <div style="${this._css.sec}">PAREDE — decos z1_cl_XX (ancorados em y=-TH)</div>
      <div style="background:#0a1a0a;border:1px solid #1f3a1f;border-radius:5px;
                  padding:4px 6px;margin-bottom:6px">
        <div style="display:grid;grid-template-columns:22px 1fr 1fr 1fr;
                    gap:2px;color:#5a8c5a;font-size:9px;letter-spacing:0.5px;
                    border-bottom:1px solid #1a3a1a;padding-bottom:3px;margin-bottom:2px">
          <span>ID</span><span>X%</span><span>H</span><span>α</span>
        </div>
        <div id="dp-deco-rows"></div>
      </div>
    </div>`; }

  // ── Tab: Limiar ───────────────────────────────────────────────────────────
  _buildTabLimiar() { return `
    <div id="dp-tab-limiar" style="display:none">
      <div id="dp-limiar-info" style="background:#0a1f0a;border:1px solid #1f4a1f;
           border-radius:6px;padding:7px 10px;margin-bottom:8px;font-size:11px;
           line-height:1.8">—</div>

      <div style="${this._css.sec}">FARFALHA SPAWNS (y = -(TH + yOff))</div>
      <div style="background:#0a1a0a;border:1px solid #1f3a1f;border-radius:5px;
                  padding:8px;margin-bottom:8px">
        <div style="margin-bottom:8px">
          <div style="color:#c0e8c0;font-size:11px;margin-bottom:4px">Farfalha 1</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="color:#5a8c5a;font-size:10px;width:30px">xFrac</span>
            <input id="dp-lp0-xfrac" type="number" min="0" max="1" step="0.01" value="0.22" style="${this._css.inp}">
            <span style="color:#5a8c5a;font-size:10px;width:30px">yOff</span>
            <input id="dp-lp0-yoff"  type="number" min="0" max="2000" step="10" value="380"  style="${this._css.inp}">
          </div>
        </div>
        <div>
          <div style="color:#c0e8c0;font-size:11px;margin-bottom:4px">Farfalha 2</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="color:#5a8c5a;font-size:10px;width:30px">xFrac</span>
            <input id="dp-lp1-xfrac" type="number" min="0" max="1" step="0.01" value="0.50" style="${this._css.inp}">
            <span style="color:#5a8c5a;font-size:10px;width:30px">yOff</span>
            <input id="dp-lp1-yoff"  type="number" min="0" max="2000" step="10" value="500"  style="${this._css.inp}">
          </div>
        </div>
      </div>

      <div style="${this._css.sec}">DECORAÇÕES POR ZONA</div>
      ${this._sliderRow('campoDecoMult',  'Campo Deco ×',     0.1, 4, 0.05, 1.0)}
      ${this._sliderRow('transDecoMult',  'Transição Deco ×', 0.1, 4, 0.05, 1.0)}
      ${this._sliderRow('limiarDecoMult', 'Limiar Deco ×',    0.1, 4, 0.05, 1.0)}
      ${this._sliderRow('jardimDecoMult', 'Jardim Deco ×',    0.1, 4, 0.05, 1.0)}

      <div style="${this._css.sec}">TELEPORTE RÁPIDO</div>
      <div style="display:flex;gap:4px">
        <button class="dp-tp-preset" data-tp="transicao" style="${this._css.btn};flex:1">→ Transição</button>
        <button class="dp-tp-preset" data-tp="limiar"    style="${this._css.btn};flex:1">→ Limiar</button>
      </div>
    </div>`; }

  // ── Tab: Plantas ──────────────────────────────────────────────────────────
  _buildTabPlantas() { return `
    <div id="dp-tab-plantas" style="display:none">
      <div style="${this._css.sec}">PLANTAS — clica na lista ou no jogo para selecionar</div>
      <div id="dp-plants-list" style="background:#0a1a0a;border:1px solid #1f3a1f;
           border-radius:5px;padding:4px 6px;font-size:10px;line-height:1;
           color:#8ac88a;margin-bottom:6px;cursor:pointer">—</div>

      <div id="dp-plant-sel-panel" style="display:none;background:#0a1f0a;
           border:1px solid #2a6a2a;border-radius:5px;padding:8px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span id="dp-sel-id" style="color:#7bc67e;font-size:12px;font-weight:bold">—</span>
          <span id="dp-sel-pos" style="color:#5a8c5a;font-size:10px;font-family:monospace">x:— y:—</span>
        </div>
        <div style="margin-bottom:4px">
          <div style="display:flex;justify-content:space-between;margin-bottom:1px">
            <span style="color:#c0e8c0;font-size:11px">Tamanho px</span>
            <span id="dp-sel-size-lbl" style="color:#fff;font-size:11px">—</span>
          </div>
          <input type="range" id="dp-sel-size" min="20" max="500" step="4" value="80"
            style="${this._css.sld}">
        </div>
        <button id="dp-sel-goto" style="${this._css.btn};width:100%;margin-top:2px">
          📍 Ir para esta planta
        </button>
      </div>

      <div style="${this._css.sec}">AÇÕES</div>
      <button id="dp-log-pos" style="${this._css.btnW}">📋 Log TUDO — posições + tamanhos (envia-me)</button>
      <button id="dp-collect-all-2" style="${this._css.btnW}">✓ Apanhar todas as plantas</button>
      <button id="dp-spawn-farfalha" style="${this._css.btnW}">⊕ Respawn Farfalha (Limiar)</button>
    </div>`; }

  // ── Tab: Placas ───────────────────────────────────────────────────────────
  _buildTabPlacas() { return `
    <div id="dp-tab-placas" style="display:none">
      <div style="${this._css.sec}">PLACA TAMANHO (ambas)</div>
      ${this._sliderRow('placaSize','Tamanho px', 20, 400, 4, 70)}

      <div style="${this._css.sec}">PLACA — CAMPO DOS VAGALUMES</div>
      ${this._sliderRow('placaX','Campo X', 0, 2000, 5, 520)}
      ${this._sliderRow('placaY','Campo Y', 0, 2000, 5, 400)}

      <div style="${this._css.sec}">PLACA — LIMIAR SECRETO</div>
      ${this._sliderRow('placaLimiarX',   'Limiar X',       0,    2000, 5,  280)}
      ${this._sliderRow('placaLimiarYOff','Limiar Y (↓ top)',0,    1000, 5,  120)}
    </div>`; }

  // ── deco table (Transição tab) ────────────────────────────────────────────
  _refreshDecoTable() {
    const z1  = this._z1();
    const el  = document.getElementById('dp-deco-rows');
    if (!el) return;
    const decos = z1?._tw?.decos;
    if (!decos || decos.length === 0) { el.innerHTML = '<span style="color:#5a8c5a;font-size:10px">— nenhum deco carregado —</span>'; return; }

    // Build rows only once per rebuild
    if (el.dataset.built === String(decos.length)) return;
    el.dataset.built = String(decos.length);
    el.innerHTML = '';

    decos.forEach((d, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:22px 1fr 1fr 1fr;gap:3px;align-items:center;padding:2px 0;border-bottom:1px solid #0f2a0f';
      row.innerHTML = `
        <span style="color:#7bc67e;font-size:10px">${d.n}</span>
        <div style="display:flex;align-items:center;gap:2px">
          <input type="range" id="dp-dc${i}-x" min="0" max="1" step="0.01"
            value="${d.xFrac.toFixed(2)}" style="flex:1;accent-color:#7bc67e;height:13px">
          <span id="dp-dc${i}-x-v" style="color:#9ed89e;font-size:9px;min-width:26px;text-align:right">${d.xFrac.toFixed(2)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:2px">
          <input type="range" id="dp-dc${i}-h" min="30" max="900" step="10"
            value="${d.h}" style="flex:1;accent-color:#7bc67e;height:13px">
          <span id="dp-dc${i}-h-v" style="color:#9ed89e;font-size:9px;min-width:26px;text-align:right">${d.h}</span>
        </div>
        <div style="display:flex;align-items:center;gap:2px">
          <input type="range" id="dp-dc${i}-a" min="0" max="1" step="0.01"
            value="${d.alpha.toFixed(2)}" style="flex:1;accent-color:#7bc67e;height:13px">
          <span id="dp-dc${i}-a-v" style="color:#9ed89e;font-size:9px;min-width:22px;text-align:right">${d.alpha.toFixed(2)}</span>
        </div>`;

      // Wire sliders
      row.querySelector(`#dp-dc${i}-x`).addEventListener('input', ev => {
        const v = parseFloat(ev.target.value);
        document.getElementById(`dp-dc${i}-x-v`).textContent = v.toFixed(2);
        const deco = z1?._tw?.decos?.[i];
        if (deco?.img) { deco.xFrac = v; deco.img.setX(Math.round(v * (z1._zoneW ?? 1920))); }
      });
      row.querySelector(`#dp-dc${i}-h`).addEventListener('input', ev => {
        const v = parseFloat(ev.target.value);
        document.getElementById(`dp-dc${i}-h-v`).textContent = v;
        const deco = z1?._tw?.decos?.[i];
        if (deco?.img) {
          const src  = z1.textures.get(`z1_cl_${deco.n}`).getSourceImage();
          const natW = src.width || 512, natH = src.height || 512;
          deco.img.setDisplaySize(natW * (v / natH), v);
          deco.h = v;
        }
      });
      row.querySelector(`#dp-dc${i}-a`).addEventListener('input', ev => {
        const v = parseFloat(ev.target.value);
        document.getElementById(`dp-dc${i}-a-v`).textContent = v.toFixed(2);
        const deco = z1?._tw?.decos?.[i];
        if (deco?.img) { deco.alpha = v; deco.img.setAlpha(v); }
      });

      el.appendChild(row);
    });
  }

  // ── generic object selection (plants, bg images, decos, placas) ─────────
  _selectObject(obj) {
    this._selectedObj = obj;
    this._showInspector(obj);
    // Also handle plants specially
    if (obj?.plantData) this._selectPlant(obj);
  }

  _showInspector(obj) {
    const el = document.getElementById('dp-inspector');
    if (!el) return;
    if (!obj?.active) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    document.getElementById('dp-ins-label').textContent = obj._dbLabel ?? '?';
    this._updateInspectorValues(obj);
  }

  _updateInspectorValues(obj) {
    if (!obj?.active) return;
    const x = Math.round(obj.x), y = Math.round(obj.y);
    const w = Math.round(obj.displayWidth ?? 80), h = Math.round(obj.displayHeight ?? 80);
    const a = Math.round(obj.angle ?? 0);
    document.getElementById('dp-ins-x').textContent = x;
    document.getElementById('dp-ins-y').textContent = y;
    document.getElementById('dp-ins-w').textContent = w;
    document.getElementById('dp-ins-h').textContent = h;
    document.getElementById('dp-ins-rot').textContent = a;
    const xi = document.getElementById('dp-ins-xi');
    const yi = document.getElementById('dp-ins-yi');
    const wi = document.getElementById('dp-ins-wi');
    const hi = document.getElementById('dp-ins-hi');
    const ri = document.getElementById('dp-ins-roti');
    if (xi) xi.value = x;
    if (yi) yi.value = y;
    if (wi) { wi.max = Math.max(4000, w * 2); wi.value = w; }
    if (hi) { hi.max = Math.max(4000, h * 2); hi.value = h; }
    if (ri) ri.value = a;
  }

  _onObjectMoved(obj)   { if (obj === this._selectedObj) this._updateInspectorValues(obj); }

  // ── select a plant (called from in-world click or list click) ─────────────
  _selectPlant(plant) {
    this._selectedPlant = plant;
    const panel = document.getElementById('dp-plant-sel-panel');
    if (!panel) return;
    panel.style.display = 'block';
    document.getElementById('dp-sel-id').textContent   = plant.plantData?.id ?? '?';
    document.getElementById('dp-sel-pos').textContent  =
      `x:${Math.round(plant.x)}  y:${Math.round(plant.y)}`;
    const sz = plant.displayWidth ?? 80;
    document.getElementById('dp-sel-size').value        = sz;
    document.getElementById('dp-sel-size-lbl').textContent = `${Math.round(sz)}px`;

    // Switch to plantas tab
    this._switchTab('plantas');
    this._buildPlantsList();

    // Pan camera to plant
    const z1 = this._z1();
    z1?.cameras?.main?.pan(plant.x, plant.y, 300, 'Sine.easeInOut');
  }

  // ── limiar info panel ─────────────────────────────────────────────────────
  _refreshLimiarInfo() {
    const z1 = this._z1();
    const el = document.getElementById('dp-limiar-info');
    if (!el || !z1) return;
    const ZH = z1._zoneH ?? 1080, TH = z1._transH ?? 400, PH = z1._paredeH ?? 700;
    el.innerHTML =
      `<span style="color:#5a8c5a">Limiar Y</span> <b>-(${TH+PH}) a -(${TH+PH+ZH})</b><br>` +
      `<span style="color:#5a8c5a">ZH</span> <b>${ZH}px</b>` +
      `&nbsp;&nbsp;<span style="color:#5a8c5a">TH</span> <b>${TH}px</b>` +
      `&nbsp;&nbsp;<span style="color:#5a8c5a">PH</span> <b>${PH}px</b><br>` +
      `<span style="color:#5a8c5a">Farfalha 1</span> y=<b>-(${TH}+${PH}+380)=-${TH+PH+380}</b><br>` +
      `<span style="color:#5a8c5a">Farfalha 2</span> y=<b>-(${TH}+${PH}+500)=-${TH+PH+500}</b>`;
  }

  // ── plant list ────────────────────────────────────────────────────────────
  _buildPlantsList() {
    const z1 = this._z1();
    const el = document.getElementById('dp-plants-list');
    if (!el) return;
    if (!z1?.plants?.length) { el.textContent = '—'; return; }
    const TH = z1._transH ?? 525, PH = z1._paredeH ?? 700, ZW = z1._zoneW ?? 1920;
    el.innerHTML = z1.plants.map((p, i) => {
      const col   = p.isCollected ? '#5a8c5a' : '#8ac88a';
      const mark  = p.isCollected ? '✓' : '○';
      const area  = p.y < -(TH+PH) ? 'limiar' : p.y < -TH ? 'parede' : p.y < 0 ? 'trans' : p.x > ZW ? 'jardim' : 'campo';
      const isSel = this._selectedPlant === p;
      const bg    = isSel ? 'background:#1a4a1a;' : '';
      return `<div data-plant-idx="${i}" style="${bg}display:flex;justify-content:space-between;` +
             `align-items:center;padding:3px 4px;border-radius:3px;margin-bottom:1px;` +
             `cursor:pointer" onmouseover="this.style.background='#142a14'" onmouseout="this.style.background='${isSel?'#1a4a1a':'transparent'}'">` +
             `<span style="color:${col}">${mark} <b style="color:#b8e8a8">${p.plantData?.id ?? '?'}</b></span>` +
             `<span style="color:#5a8c5a;font-size:9px;font-family:monospace">${Math.round(p.x)},${Math.round(p.y)} [${area}]</span>` +
             `</div>`;
    }).join('');
  }

  // ── teleport ──────────────────────────────────────────────────────────────
  _teleport(x, y) {
    const z1 = this._z1();
    if (!z1?.player) { this._msg('Zona 1 não está ativa'); return; }
    z1.player.setPosition(x, y);
    if (z1.player.body) z1.player.body.reset(x, y);
    // Determine area from destination and apply camera bounds immediately
    const ZW = z1._zoneW, ZH = z1._zoneH, TH = z1._transH, PH = z1._paredeH;
    let area = 'campoVagalumes';
    if (x >= ZW && y >= 0)   area = 'jardimInvertido';
    else if (y < -(TH + PH)) area = 'limiarSecreto';
    else if (y < -TH)        area = 'paredeZone';
    else if (y < 0)          area = 'transicao';
    z1._currentArea = area;
    z1._applyCameraBounds?.(area);
    // Snap camera to player position immediately (skip lerp delay)
    const cam = z1.cameras?.main;
    if (cam) {
      const zoom = cam.zoom;
      const vw   = z1.scale.width  / zoom;
      const vh   = z1.scale.height / zoom;
      cam.setScroll(x - vw / 2, y - vh / 2);
    }
    this._msg(`→ ${Math.round(x)}, ${Math.round(y)} ✓`);
  }

  _tpPreset(name) {
    const z1 = this._z1();
    const ZW = z1?._zoneW ?? 1920, ZH = z1?._zoneH ?? 1080;
    const TH = z1?._transH ?? 525, PH = z1?._paredeH ?? 700;
    const presets = {
      campo:     [ZW * 0.33, ZH * 0.55],
      transicao: [ZW * 0.33, -(TH * 0.5)],
      limiar:    [ZW * 0.33, -(TH + PH + ZH * 0.5)],
      jardim:    [ZW + ZW * 0.4, ZH * 0.5],
    };
    const [x, y] = presets[name] || [640, 600];
    this._teleport(x, y);
  }

  // ── wire events ───────────────────────────────────────────────────────────
  _wireEvents() {
    // Slider live-apply
    const sliders = [
      'zoom','playerSize','vagScale','vagQty','vagFreq','globalSizeMult',
      'zoneW','zoneH','transH','paredeH',
      'tw-fundoAlpha','tw-caminhoAlpha','tw-caminhoY','tw-caminhoAngle','tw-paredeAlpha',
      'limiarDecoMult','campoDecoMult','transDecoMult','jardimDecoMult',
      'placaSize','placaX','placaY','placaLimiarX','placaLimiarYOff',
      'plantScale',
    ];
    sliders.forEach(id => {
      const el  = document.getElementById(`dp-${id}`);
      const lbl = document.getElementById(`dp-${id}-lbl`);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        if (lbl) lbl.textContent = this._fmt(v);
        this._apply(id, v);
      });
    });

    // Teleport presets
    document.querySelectorAll('.dp-tp-preset').forEach(btn => {
      btn.addEventListener('click', () => this._tpPreset(btn.dataset.tp));
    });

    // Custom teleport
    document.getElementById('dp-tp-go').addEventListener('click', () => {
      const x = parseFloat(document.getElementById('dp-tp-x').value);
      const y = parseFloat(document.getElementById('dp-tp-y').value);
      if (!isNaN(x) && !isNaN(y)) this._teleport(x, y);
    });

    // Restart zone
    document.getElementById('dp-restart-zone').addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      const wv = parseFloat(document.getElementById('dp-zoneW').value);
      const hv = parseFloat(document.getElementById('dp-zoneH').value);
      const th = parseFloat(document.getElementById('dp-transH').value);
      const ph = parseFloat(document.getElementById('dp-paredeH').value);
      this._game.registry.set('debugZoneW', wv);
      this._game.registry.set('debugZoneH', hv);
      this._game.registry.set('debugTransH', th);
      this._game.registry.set('debugParedeH', ph);
      z1.scene.restart();
      this._msg(`Reiniciada ${wv}×${hv} TH=${th} PH=${ph} ✓`);
    });
    document.getElementById('dp-restart-trans').addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      const th = parseFloat(document.getElementById('dp-transH').value);
      const ph = parseFloat(document.getElementById('dp-paredeH').value);
      this._game.registry.set('debugZoneW', z1._zoneW);
      this._game.registry.set('debugZoneH', z1._zoneH);
      this._game.registry.set('debugTransH', th);
      this._game.registry.set('debugParedeH', ph);
      z1.scene.restart();
      this._msg(`Reiniciada TH=${th} PH=${ph} ✓`);
    });

    // Rebuild fireflies
    document.getElementById('dp-rebuild-ff').addEventListener('click', () => {
      const z1 = this._z1();
      if (z1?._rebuildFireflies) { z1._rebuildFireflies(); this._msg('Vagalumes ✓'); }
      else this._msg('Zona 1 não está ativa');
    });

    // Rebuild transition wall
    document.getElementById('dp-rebuild-trans').addEventListener('click', () => {
      const z1 = this._z1();
      if (z1?._rebuildTransition) {
        z1._rebuildTransition();
        document.getElementById('dp-deco-rows').dataset.built = '';
        this._refreshDecoTable();
        this._msg('Parede reconstruída ✓');
      } else {
        this._msg('Zona 1 não está ativa');
      }
    });

    // Collect all (both buttons)
    const collectAll = () => {
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
    };
    document.getElementById('dp-collect-all').addEventListener('click', collectAll);
    document.getElementById('dp-collect-all-2').addEventListener('click', collectAll);

    // Background color picker
    const bgInput = document.getElementById('dp-bg-color');
    const bgLbl   = document.getElementById('dp-bg-color-lbl');
    bgInput?.addEventListener('input', () => {
      const color = bgInput.value;
      if (bgLbl) bgLbl.textContent = color.toUpperCase();
      const game = this._game;
      if (!game) return;
      // Update Phaser renderer background
      const r = parseInt(color.slice(1,3), 16);
      const g = parseInt(color.slice(3,5), 16);
      const b = parseInt(color.slice(5,7), 16);
      if (game.renderer?.backgroundColor) {
        game.renderer.backgroundColor.r = r;
        game.renderer.backgroundColor.g = g;
        game.renderer.backgroundColor.b = b;
      }
      if (game.canvas) game.canvas.style.backgroundColor = color;
    });
    document.getElementById('dp-bg-reset')?.addEventListener('click', () => {
      if (bgInput) { bgInput.value = '#AFD6A8'; bgInput.dispatchEvent(new Event('input')); }
    });

    // Plant list click (event delegation — survives list rebuilds)
    document.getElementById('dp-plants-list')?.addEventListener('click', e => {
      const row = e.target.closest('[data-plant-idx]');
      if (!row) return;
      const z1 = this._z1();
      const plant = z1?.plants?.[parseInt(row.dataset.plantIdx)];
      if (plant) this._selectPlant(plant);
    });

    // Selected plant size slider
    document.getElementById('dp-sel-size')?.addEventListener('input', e => {
      const v = parseInt(e.target.value);
      document.getElementById('dp-sel-size-lbl').textContent = `${v}px`;
      if (this._selectedPlant?.active) {
        this._selectedPlant.setDisplaySize(v, v);
        document.getElementById('dp-sel-pos').textContent =
          `x:${Math.round(this._selectedPlant.x)}  y:${Math.round(this._selectedPlant.y)}`;
      }
    });

    // Go to selected plant
    document.getElementById('dp-sel-goto')?.addEventListener('click', () => {
      if (!this._selectedPlant?.active) return;
      this._teleport(this._selectedPlant.x, this._selectedPlant.y);
    });

    // Log TUDO — all objects positions + sizes
    document.getElementById('dp-log-pos')?.addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      const TH = z1._transH ?? 525, PH = z1._paredeH ?? 700, ZW = z1._zoneW ?? 1920;
      const snap = (img, label) => img?.active ? {
        label,
        x: Math.round(img.x), y: Math.round(img.y),
        w: Math.round(img.displayWidth ?? 0), h: Math.round(img.displayHeight ?? 0),
      } : null;
      const out = {
        zone: { ZW, ZH: z1._zoneH ?? 1080, TH, PH },
        tz: {
          fundo:   snap(z1._tz?.fundo,   'tz.fundo'),
          caminho: snap(z1._tz?.caminho, 'tz.caminho'),
        },
        pz: {
          fundoParede: snap(z1._pz?.fundoParede, 'pz.fundoParede'),
          paredes: (z1._pz?.paredes || []).map((p, i) => snap(p, `pz.parede[${i}]`)).filter(Boolean),
          decos: (z1._pz?.decos || []).map(d => ({
            n: d.n, x: Math.round(d.img?.x ?? 0), y: Math.round(d.img?.y ?? 0),
            w: Math.round(d.img?.displayWidth ?? 0), h: Math.round(d.img?.displayHeight ?? 0),
            alpha: d.img?.alpha ?? 0,
          })),
        },
        plants: (z1.plants || []).map(p => ({
          id: p.plantData?.id ?? '?',
          x: Math.round(p.x), y: Math.round(p.y),
          w: Math.round(p.displayWidth ?? 80), h: Math.round(p.displayHeight ?? 80),
          area: p.y < -(TH + PH) ? 'limiar' : p.y < -TH ? 'parede' : p.y < 0 ? 'transicao'
              : p.x > ZW ? 'jardim' : 'campo',
          collected: p.isCollected,
        })),
        campoDecos:     (z1.campoDecos    || []).map(({ img }, i) => snap(img, `campo_${i}`)).filter(Boolean),
        transicaoDecos: (z1.transicaoDecos|| []).map(({ img }, i) => snap(img, `trans_${i}`)).filter(Boolean),
        jardimDecos:    (z1.jardimDecos   || []).map(({ img }, i) => snap(img, `jardim_${i}`)).filter(Boolean),
        limiarDecos:    (z1.limiarDecos   || []).map(({ img }, i) => snap(img, `limiar_${i}`)).filter(Boolean),
        placaCampo:  snap(z1.placaCampo,  'placa.campo'),
        placaLimiar: snap(z1.placaLimiar, 'placa.limiar'),
      };
      console.log('%c=== LOG TUDO ===', 'color:#7bc67e;font-weight:bold;font-size:14px');
      console.log(JSON.stringify(out, null, 2));
      navigator.clipboard?.writeText(JSON.stringify(out, null, 2))
        .then(() => this._msg('Log TUDO → console + clipboard ✓'))
        .catch(() => this._msg('Log TUDO → console ✓'));
    });

    // Spawn farfalha button
    document.getElementById('dp-spawn-farfalha').addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      const xf0 = parseFloat(document.getElementById('dp-lp0-xfrac').value);
      const yo0 = parseFloat(document.getElementById('dp-lp0-yoff').value);
      const xf1 = parseFloat(document.getElementById('dp-lp1-xfrac').value);
      const yo1 = parseFloat(document.getElementById('dp-lp1-yoff').value);
      // Update live scene values — affects next restart
      z1._limiarPlantXfrac = [xf0, xf1];
      z1._limiarPlantYOff  = [yo0, yo1];
      this._refreshLimiarInfo();
      this._msg(`Farfalha posições atualizadas (reinicia p/ efeito)`);
    });

    // ── Inspector wiring ────────────────────────────────────────────────────
    document.getElementById('dp-ins-xi')?.addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      if (isNaN(v) || !this._selectedObj?.active) return;
      this._selectedObj.setX(v);
      this._updateInspectorValues(this._selectedObj);
    });
    document.getElementById('dp-ins-yi')?.addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      if (isNaN(v) || !this._selectedObj?.active) return;
      this._selectedObj.setY(v);
      this._updateInspectorValues(this._selectedObj);
    });
    document.getElementById('dp-ins-wi')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      const obj = this._selectedObj;
      if (!obj?.active) return;
      const ratio = (obj.displayHeight || 80) / Math.max(1, obj.displayWidth || 80);
      obj.setDisplaySize(v, v * ratio);
      document.getElementById('dp-ins-w').textContent = Math.round(v);
      document.getElementById('dp-ins-h').textContent = Math.round(v * ratio);
    });
    document.getElementById('dp-ins-hi')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      const obj = this._selectedObj;
      if (!obj?.active) return;
      const ratio = Math.max(1, obj.displayWidth || 80) / (obj.displayHeight || 80);
      obj.setDisplaySize(v * ratio, v);
      document.getElementById('dp-ins-w').textContent = Math.round(v * ratio);
      document.getElementById('dp-ins-h').textContent = Math.round(v);
    });
    document.getElementById('dp-ins-desel')?.addEventListener('click', () => {
      this._selectedObj   = null;
      this._selectedPlant = null;
      const z1 = this._z1();
      if (z1) z1._dbSelected = null;
      document.getElementById('dp-inspector').style.display = 'none';
      document.getElementById('dp-plant-sel-panel').style.display = 'none';
    });

    // Inspector rotation slider
    document.getElementById('dp-ins-roti')?.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      const obj = this._selectedObj;
      if (!obj?.active) return;
      obj.setAngle(v);
      document.getElementById('dp-ins-rot').textContent = Math.round(v);
    });

    // Inspector goto button — pan camera to selected object
    document.getElementById('dp-ins-goto')?.addEventListener('click', () => {
      const obj = this._selectedObj;
      if (!obj?.active) return;
      const z1 = this._z1();
      z1?.cameras?.main?.pan(obj.x, obj.y, 350, 'Sine.easeInOut');
    });

    // Copy config
    document.getElementById('dp-copy').addEventListener('click', () => {
      const z1 = this._z1();
      if (!z1) { this._msg('Zona 1 não está ativa'); return; }
      const cfg = {
        zoom:           z1.cameras.main.zoom,
        playerSize:     z1.player?.displayWidth ?? 260,
        vagScale:       z1._vagScale    ?? 1.0,
        vagQty:         z1._vagQty      ?? 12,
        vagFreq:        z1._vagFreq     ?? 700,
        zoneW:          z1._zoneW       ?? 1920,
        zoneH:          z1._zoneH       ?? 1080,
        transH:         z1._transH      ?? 400,
        paredeH:        z1._paredeH     ?? 700,
        globalSizeMult: z1._globalSizeMult ?? 1.0,
        campoDecoMult:  z1._campoDecoMult  ?? 1.0,
        transDecoMult:  z1._transDecoMult  ?? 1.0,
        jardimDecoMult: z1._jardimDecoMult ?? 1.0,
        limiarDecoMult: z1._limiarDecoMult ?? 1.0,
        placaSize:      z1._placaSize   ?? 70,
        placaCampoX:    z1._placaCampoX ?? 520,
        placaCampoY:    z1._placaCampoY ?? 400,
        placaLimiarX:   z1._placaLimiarX   ?? 280,
        placaLimiarYOff:z1._placaLimiarYOff ?? 120,
        tw: {
          fundoAlpha:   z1._pz?.fundoParede?.alpha      ?? 0.55,
          caminhoAlpha: z1._tz?.caminho?.alpha        ?? 1.0,
          caminhoY:     z1._tz?.caminho?.y            ?? -262,
          paredeAlpha:  z1._pz?.paredes?.[0]?.alpha   ?? 1.0,
          decos: (z1._tw?.decos || []).map(d => ({
            n: d.n, xFrac: +d.xFrac.toFixed(3), h: d.h, alpha: +d.alpha.toFixed(2)
          })),
        },
      };
      navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))
        .then(() => this._msg('Copiado ✓'))
        .catch(() => this._msg(JSON.stringify(cfg).slice(0, 120) + '…'));
    });
  }

  // ── apply slider change to live scene ────────────────────────────────────
  _apply(id, v) {
    const z1 = this._z1();
    if (!z1) return;

    switch (id) {
      case 'zoom':
        z1.cameras.main.setZoom(v); break;

      case 'playerSize':
        z1.player?.setDisplaySize(v, v); break;

      case 'vagScale':
        z1._vagScale = v;
        z1._rebuildFireflies?.(); break;

      case 'vagQty':
        z1._vagQty = v;
        if (z1.campoEmitter) z1.campoEmitter.quantity = v; break;

      case 'vagFreq':
        z1._vagFreq = v;
        if (z1.campoEmitter) z1.campoEmitter.frequency = v; break;

      case 'globalSizeMult':
        z1._globalSizeMult = v;
        this._game.registry.set('debugGlobalSizeMult', v);
        z1.decoImages?.forEach(({ img, baseSize }) => img.setDisplaySize(baseSize * v, baseSize * v));
        { const ps = z1._placaSize ?? 70;
          z1.placaCampo?.setDisplaySize(ps * v, ps * v);
          z1.placaLimiar?.setDisplaySize(ps * v, ps * v); }
        break;

      case 'zoneW':
      case 'zoneH':
        this._msg(`${id}=${v} → clica ↺ Reiniciar`); break;

      case 'transH':
        this._msg(`transH=${v} → clica ↺ Reiniciar`); break;

      // ── Live zone layer adjustments ───────────────────────────────────────
      case 'tw-fundoAlpha':
        z1._pz?.fundoParede?.setAlpha(v); break;

      case 'tw-caminhoAlpha':
        z1._tz?.caminho?.setAlpha(v); break;

      case 'tw-caminhoY':
        z1._tz?.caminho?.setY(v); break;

      case 'tw-caminhoAngle':
        z1._tz?.caminho?.setAngle(v); break;

      case 'tw-paredeAlpha':
        (z1._pz?.paredes || (z1._pz?.parede ? [z1._pz.parede] : [])).forEach(p => p.setAlpha(v)); break;

      case 'paredeH':
        this._msg(`paredeH=${v} → clica ↺ Reiniciar`); break;

      // ── Per-zone deco mults ───────────────────────────────────────────────
      case 'campoDecoMult':
        z1._campoDecoMult = v;
        { const gm = z1._globalSizeMult ?? 1.0;
          z1.campoDecos?.forEach(({ img, baseSize }) => img.setDisplaySize(baseSize * v * gm, baseSize * v * gm)); }
        break;

      case 'transDecoMult':
        z1._transDecoMult = v;
        { const gm = z1._globalSizeMult ?? 1.0;
          z1.transicaoDecos?.forEach(({ img, baseSize }) => img.setDisplaySize(baseSize * v * gm, baseSize * v * gm)); }
        break;

      case 'jardimDecoMult':
        z1._jardimDecoMult = v;
        { const gm = z1._globalSizeMult ?? 1.0;
          z1.jardimDecos?.forEach(({ img, baseSize }) => img.setDisplaySize(baseSize * v * gm, baseSize * v * gm)); }
        break;

      case 'limiarDecoMult':
        z1._limiarDecoMult = v;
        { const gm = z1._globalSizeMult ?? 1.0;
          z1.limiarDecos?.forEach(({ img, baseSize }) => img.setDisplaySize(baseSize * v * gm, baseSize * v * gm)); }
        break;

      // ── Placas ────────────────────────────────────────────────────────────
      case 'placaSize':
        z1._placaSize = v;
        { const gm = z1._globalSizeMult ?? 1.0;
          z1.placaCampo?.setDisplaySize(v * gm, v * gm);
          z1.placaLimiar?.setDisplaySize(v * gm, v * gm); }
        break;

      case 'placaX':
        z1._placaCampoX = v;
        z1.placaCampo?.setX(v); break;

      case 'placaY':
        z1._placaCampoY = v;
        z1.placaCampo?.setY(v); break;

      case 'placaLimiarX':
        z1._placaLimiarX = v;
        z1.placaLimiar?.setX(v); break;

      case 'placaLimiarYOff':
        z1._placaLimiarYOff = v;
        z1.placaLimiar?.setY(-(z1._transH + z1._paredeH + z1._zoneH - v)); break;

      // ── Plant scale ───────────────────────────────────────────────────────
      case 'plantScale':
        z1.plants?.forEach(p => {
          if (!p.isCollected) p.sprite?.setDisplaySize(80 * v, 80 * v);
        }); break;
    }
  }
}
