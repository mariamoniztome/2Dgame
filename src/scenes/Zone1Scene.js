import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, PLAYER_INTERACTION_RADIUS } from '../config.js';
import { GameState } from '../GameState.js';
import { PLANTS } from '../data/plants.js';
import { SPELLS } from '../data/spells.js';
import { Player } from '../objects/Player.js';
import { Plant } from '../objects/Plant.js';
import { Portal } from '../objects/Portal.js';
import { SoundManager } from '../SoundManager.js';

// Zone 1 — L-shaped world (ZW = debugZoneW, ZH = debugZoneH, TH = debugTransH, PH = debugParedeH):
//   Campo dos Vagalumes     x:0–ZW      y:0–ZH             (#afd6a8)
//   Transição               x:0–ZW      y:-TH–0            (#7aaa78, fundo.svg+caminho.svg)
//   Parede de Plantas       x:0–ZW      y:-(TH+PH)– -TH   (#2a4030, parede.svg)
//   Limiar Secreto          x:0–ZW      y:-(ZH+TH+PH)–-(TH+PH) (#355138)
//   Jardim Invertido        x:ZW–ZW*2   y:0–ZH             (#6d8469)
//   Dead zone               x:ZW–ZW*2   y:-(ZH+TH+PH)–0   (blocked)
const ZONE_W = 1280;
const ZONE_H = 720;

const AREAS = {
  campoVagalumes:  { label: 'Campo dos Vagalumes'   },
  transicao:       { label: 'Transição'              },
  paredeZone:      { label: 'Parede de Plantas'      },
  limiarSecreto:   { label: 'Limiar Secreto'         },
  jardimInvertido: { label: 'Jardim Invertido'       },
};

// Trepadeira is a collectible plant inside the Transição zone.
// Collecting it opens the Parede zone (boundary at y=-TH lifts).
const VINE_X = 640;  // kept for AI guidance target

const PLANT_SPAWNS = [
  { id: 'ventoinha',  x: 92,   y: 1007 },   // campo
  { id: 'ventoinha',  x: 1267, y: 920  },   // campo
  { id: 'gotateia',   x: 2220, y: 320  },   // jardim
  { id: 'gotateia',   x: 2790, y: 520  },   // jardim
];
// Transição plants (yOff = depth from y=0, so y = -yOff).
// Trepadeira is placed near the top of the transição zone, just below the parede.
const TRANSICAO_PLANT_SPAWNS = [
  { id: 'trepadeira', x: 499, y: -497 },
];
// Limiar plants (y = -(TH + PH + yOff))
const LIMIAR_PLANT_SPAWNS = [
  { id: 'farfalha', xFrac: 0.22, yOff: 380 },
  { id: 'farfalha', xFrac: 0.50, yOff: 500 },
];

export class Zone1Scene extends Phaser.Scene {
  constructor() { super('Zone1'); }

  create() {
    GameState.currentZone = 'Zone1';

    // Zone physical size — MUST be read first (used in setBounds below)
    this._zoneW = this.game.registry.get('debugZoneW') ?? 1920;
    this._zoneH = this.game.registry.get('debugZoneH') ?? 1080;

    // Debug-adjustable defaults (keep existing values on scene.restart)
    if (this._transH          === undefined) this._transH          = this.game.registry.get('debugTransH')  ?? 525;
    if (this._paredeH         === undefined) this._paredeH         = this.game.registry.get('debugParedeH') ?? 700;
    if (this._vagScale        === undefined) this._vagScale        = 1.0;
    if (this._vagQty          === undefined) this._vagQty          = 12;
    if (this._vagFreq         === undefined) this._vagFreq         = 700;
    if (this._decoMult        === undefined) this._decoMult        = 1.0;
    if (this._campoDecoMult   === undefined) this._campoDecoMult   = 1.0;
    if (this._transDecoMult   === undefined) this._transDecoMult   = 1.0;
    if (this._jardimDecoMult  === undefined) this._jardimDecoMult  = 1.0;
    if (this._limiarDecoMult  === undefined) this._limiarDecoMult  = 1.0;
    if (this._placaSize       === undefined) this._placaSize       = 70;
    if (this._placaCampoX     === undefined) this._placaCampoX     = 734;
    if (this._placaCampoY     === undefined) this._placaCampoY     = 450;
    if (this._placaLimiarX    === undefined) this._placaLimiarX    = 280;
    if (this._placaLimiarYOff === undefined) this._placaLimiarYOff = 120;
    if (this._globalSizeMult  === undefined) this._globalSizeMult  = this.game.registry.get('debugGlobalSizeMult') ?? 1.0;

    // L-shaped world physics bounds (campo + transição + parede + limiar)
    const _TH = this._transH, _PH = this._paredeH;
    this.physics.world.setBounds(0, -(this._zoneH + _PH + _TH), this._zoneW * 2, this._zoneH * 2 + _PH + _TH);

    this._buildBackground();
    this._buildDecorations();

    // Start player at the area selected in the map (or default: lower campo)
    const startArea = this.game.registry.get('startArea') || 'campoVagalumes';
    this.game.registry.remove('startArea'); // consume once
    let startX = 640, startY = Math.round(this._zoneH * 0.62);
    if (startArea === 'limiarSecreto') {
      startX = Math.round(this._zoneW * 0.35);
      startY = Math.round(-(this._transH + this._paredeH + this._zoneH * 0.5));
    } else if (startArea === 'jardimInvertido') {
      startX = Math.round(this._zoneW + this._zoneW * 0.4);
      startY = Math.round(this._zoneH * 0.5);
    }
    this.player = new Player(this, startX, startY);

    this._buildPlants();
    GameState.plantSpawns = [
      ...PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y })),
      ...TRANSICAO_PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y })),
    ];
    this._buildPortal();
    this._buildFireflies();
    this._buildGuideFireflies();
    this._buildVisionBlockers();

    const ph1 = this.player.displayHeight;
    this.playerShadow = this.add.ellipse(
      this.player.x, this.player.y + Math.round(ph1 * 0.24),
      Math.round(ph1 * 0.16), Math.max(4, Math.round(ph1 * 0.038)),
      0x000000, 0.28
    ).setDepth(4);

    // Dead-zone walls: block the top-right quadrant (x>_zoneW, y<0)
    const _wallH = this.add.rectangle(this._zoneW + this._zoneW / 2, -2, this._zoneW, 6).setAlpha(0);
    this.physics.add.existing(_wallH, true);
    this.physics.add.collider(this.player, _wallH);

    const _wallV = this.add.rectangle(this._zoneW + 2, -this._zoneH / 2, 6, this._zoneH).setAlpha(0);
    this.physics.add.existing(_wallV, true);
    this.physics.add.collider(this.player, _wallV);

    // Camera — start bounded to the left column (campo + limiar only)
    this.cameras.main.setZoom(2.0);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.time.delayedCall(50, () => {
      this.cameras.main.setLerp(0.12, 0.12);
      this._applyCameraBounds('campoVagalumes');
    });

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:   Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right:Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.keyC     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyF     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyQ     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyM     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');

    this._nearPlant      = null;
    this._nearPortal     = false;
    this._vineClimbed    = GameState.collected.has('trepadeira');
    this._currentArea    = '';
    this._spellCooldown  = 0;
    this._proximityTimer = 0;
    this._timedPlant     = null;
    this._hintLevel      = 0;
    this._footTimer      = 0;
    this._ventoinhaSlowTimers = new Map();
    this._debugVisible        = false;
    this._spellUnlockShown    = null;
    this._tutorialDismiss     = null;
    this._jardimHintShown     = false;
    this._ladrao              = null;
    this._ladraoStole         = false;
    // First appearance: 35s in (player needs time to collect at least one plant)
    this.time.delayedCall(35000, () => this._scheduleLadrao());

    this.cameras.main.fadeIn(800, 0, 0, 0);

    this.time.delayedCall(900, () => {
      this._emitNarrative('Bem-vinda ao jardim, bruxinha. Explora. As plantas esperam por ti.');
    });
    this.time.delayedCall(1400, () => { this._showTutorial(); });

    this.game.events.on('plantStolen', this._onPlantStolen, this);

    if (GameState.checkZone2Unlock() && !GameState.isZoneUnlocked('Zone2')) {
      GameState.unlockZone('Zone2');
    }
    if (this._vineClimbed && this.portal) this.portal.unlock();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Background — four vertical sub-areas in left column + jardim right
  //    Campo       y:0–ZH               (#afd6a8)
  //    Transição   y:-TH–0              (#7aaa78, fundo.svg gradient + caminho)
  //    Parede      y:-(TH+PH)– -TH     (#2a4030, parede.svg plant wall)
  //    Limiar      y:-(ZH+TH+PH)–-(TH+PH) (#355138)
  //    Jardim      x:ZW–ZW*2, y:0–ZH   (#6d8469)
  // ─────────────────────────────────────────────────────────────────────────
  _buildBackground() {
    const ZW = this._zoneW, ZH = this._zoneH;
    const TH = this._transH, PH = this._paredeH;
    const g = this.add.graphics().setDepth(0);

    // ── Campo dos Vagalumes ───────────────────────────────────────────
    g.fillStyle(0xafd6a8, 1); g.fillRect(0, 0, ZW, ZH);
    if (this.textures.exists('z1_bg_campo')) {
      this.add.image(0, 0, 'z1_bg_campo')
        .setOrigin(0, 0).setDisplaySize(ZW, ZH).setDepth(1);
    }
    if (this.textures.exists('z1_campo_caminho')) {
      this.add.image(ZW / 2, ZH / 2, 'z1_campo_caminho')
        .setOrigin(0.5).setDisplaySize(ZW, ZH).setDepth(2).setAlpha(0.7);
    }

    // ── Transição (y:-TH–0): use campo color as fallback so seam is invisible
    g.fillStyle(0xafd6a8, 1); g.fillRect(0, -TH, ZW, TH);

    // ── Parede de Plantas (y:-(TH+PH)–-TH, parede.svg) ───────────────
    g.fillStyle(0x2a4030, 1); g.fillRect(0, -(TH + PH), ZW, PH);

    // ── Limiar Secreto (y:-(ZH+TH+PH)–-(TH+PH)) ─────────────────────
    g.fillStyle(0x355138, 1); g.fillRect(0, -(ZH + TH + PH), ZW, ZH);

    // ── Jardim Invertido (right of campo) ────────────────────────────
    g.fillStyle(0x6d8469, 1); g.fillRect(ZW, 0, ZW, ZH);

    // ── Dead-zone (top-right, full height) ───────────────────────────
    g.fillStyle(0x1e2e20, 1); g.fillRect(ZW, -(ZH + TH + PH), ZW, ZH + TH + PH);

    // ── Zone art ─────────────────────────────────────────────────────
    this._buildTransicaoZone(ZW, ZH);
    this._buildParedeZone(ZW, ZH);
    this._buildJardimTransition(ZW, ZH);

    // Location signs
    const gm = this._globalSizeMult ?? 1.0;
    const ps = this._placaSize * gm;
    if (this.textures.exists('z1_placa_campo')) {
      this.placaCampo = this.add.image(this._placaCampoX, this._placaCampoY, 'z1_placa_campo')
        .setDisplaySize(ps, ps).setDepth(4);
    }
    if (this.textures.exists('z1_placa_limiar')) {
      const lx = this._placaLimiarX;
      const ly = -(TH + PH + ZH - this._placaLimiarYOff);
      this.placaLimiar = this.add.image(lx, ly, 'z1_placa_limiar')
        .setDisplaySize(ps, ps).setDepth(4);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Transição zone (y:-TH–0)
  //  fundo.svg (gradient campo→transição) + caminho.svg (path)
  //  Objects in this._tz for live debug adjustment.
  // ─────────────────────────────────────────────────────────────────────────
  _buildTransicaoZone(ZW, ZH) {
    const TH = this._transH;
    const cx = ZW / 2;
    this._tz = {};

    // fundo.svg (1920×525) — stretched to ZW × (TH+30) and shifted 15px DOWN so
    // the image bleeds 30px into campo below y=0, hiding any colour seam.
    if (this.textures.exists('z1_bg_trans')) {
      const bleed = 30;
      this._tz.fundo = this.add.image(cx, -(TH / 2) + bleed / 2, 'z1_bg_trans')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(ZW, TH + bleed)
        .setDepth(2)
        .setAlpha(1.0);
    }

    // caminho.svg — position/size tuned in debug panel.
    if (this.textures.exists('z1_caminho')) {
      this._tz.caminho = this.add.image(1005, -260, 'z1_caminho')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(2256, 617)
        .setAngle(-179)
        .setDepth(3)
        .setAlpha(1.0);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Parede de Plantas zone (y:-(TH+PH)–-TH)
  //  fundo_parede.svg (background glow) + parede.svg (wall) + z1_cl_ decos
  //  Objects in this._pz (alias this._tw) for live debug adjustment.
  // ─────────────────────────────────────────────────────────────────────────
  _buildParedeZone(ZW, ZH) {
    const TH = this._transH, PH = this._paredeH;
    const cx = ZW / 2;
    const baseY = -TH;  // bottom of parede zone (top of transição)
    this._pz = { decos: [] };
    this._tw  = this._pz;  // alias for DebugPanel backward compat

    // ── 1. Background glow (Fundo_ParedãodePlantas) — viewBox 2077×1550 ──
    if (this.textures.exists('z1_fundo_parede')) {
      this._pz.fundoParede = this.add.image(881, baseY, 'z1_fundo_parede')
        .setOrigin(0.5, 1).setDisplaySize(2077, 1433)
        .setDepth(1).setAlpha(0.55);
    }

    // ── 2. Main plant wall (ParedãodePlantas) — tiled 3× horizontally ───────
    // Each tile: w=ZW/3, h=(ZW/3)*(1735/1920). Three tiles fill the full width
    // and keep height ≈ PH instead of one oversized image.
    this._pz.paredes = [];
    if (this.textures.exists('z1_parede')) {
      [[325, -501, 864, 781], [968, -499, 864, 780], [1605, -496, 856, 773]].forEach(([tx, ty, tw, th]) => {
        const p = this.add.image(tx, ty, 'z1_parede')
          .setOrigin(0.5, 1).setDisplaySize(tw, th)
          .setDepth(3).setAlpha(1.0);
        this._pz.paredes.push(p);
      });
      this._pz.parede = this._pz.paredes[0];
    }

    // ── 3. Individual decorative elements (grounded at baseY) ─────────────
    const placements = [
      // [key-suffix, x, y, w, h, depth, alpha]
      ['16',  394,  -234, 270, 270, 4, 0.88],
      ['17', 1860,    19, 254, 254, 4, 0.86],
      ['02', 1634,   910, 144, 144, 4, 0.90],
      ['03', 1460,   -55,  86,  86, 4, 0.88],
      ['01', 1642,  -116,  82,  82, 5, 0.92],
      ['10', 1639,   -32,  96,  96, 4, 0.85],
      ['06',  544,  -227,  80,  80, 5, 0.90],
      ['13',  536,  -109,  72,  72, 4, 0.87],
      ['18', 1580,  -315,  56,  56, 4, 0.88],
      ['08', 1710,   -46, 104, 104, 5, 0.91],
      ['09', 1330,  -154,  38,  38, 4, 0.86],
      ['12', 1247,   -14,  96,  96, 5, 0.90],
      ['03',  683,  -211,  56,  56, 4, 0.88],
      ['01',  159,   -41,  92,  92, 4, 0.90],
      ['07',  109,  -178, 316, 316, 3, 0.65],
      ['19', 1204,  -161, 254, 254, 3, 0.63],
      ['04', 1896,  -460,  58,  58, 6, 0.95],
      ['15', 1288,  -286,  58,  58, 6, 0.93],
      ['05', 1542,  -440,  36,  36, 6, 0.88],
      ['11', 1789,  -421,  88,  88, 6, 0.85],
      ['14', 1220,  -459,  54,  54, 6, 0.90],
    ];

    placements.forEach(([n, x, y, w, h, depth, alpha]) => {
      const key = `z1_cl_${n}`;
      if (!this.textures.exists(key)) return;
      const img = this.add.image(x, y, key)
        .setOrigin(0.5, 1).setDisplaySize(w, h)
        .setDepth(depth).setAlpha(alpha);
      this._pz.decos.push({ img, n, x, y, w, h, baseH: h, alpha, depth });
    });
  }

  // Destroy and rebuild the Parede zone objects (called from debug panel)
  _rebuildParedeZone() {
    if (this._pz) {
      this._pz.fundoParede?.destroy();
      (this._pz.paredes || (this._pz.parede ? [this._pz.parede] : [])).forEach(p => p?.destroy());
      (this._pz.decos || []).forEach(d => d.img?.destroy());
      this._pz = null; this._tw = null;
    }
    this._buildParedeZone(this._zoneW, this._zoneH);
  }

  // Destroy and rebuild the Transição zone art
  _rebuildTransicaoZone() {
    this._tz?.fundo?.destroy();
    this._tz?.caminho?.destroy();
    this._tz = null;
    this._buildTransicaoZone(this._zoneW, this._zoneH);
  }

  // Legacy alias used by debug panel
  _rebuildTransition() { this._rebuildParedeZone(); }

  // ─────────────────────────────────────────────────────────────────────────
  //  Jardim vertical transition — Fundo_Transição rotated 90° at x=ZW
  // ─────────────────────────────────────────────────────────────────────────
  _buildJardimTransition(ZW, ZH) {
    if (!this.textures.exists('z1_bg_trans')) return;
    // The SVG is 1920×525 landscape. Rotated 90°, visible footprint becomes
    // (525 * ZH/1920) wide × ZH tall — a vertical gradient at the zone border.
    const depth  = ZH * (525 / 1920);   // rendered width after rotation
    const height = ZH;                   // rendered height after rotation
    // setDisplaySize(localW, localH) then rotate 90° CW:
    //   visible width  = localH = depth
    //   visible height = localW = height
    this.add.image(ZW, ZH / 2, 'z1_bg_trans')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(height, depth)
      .setAngle(90)
      .setDepth(2)
      .setAlpha(0.85);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Decorations — dense grid across all sub-areas; per-zone deco arrays
  //  stored for live debug adjustment.
  // ─────────────────────────────────────────────────────────────────────────
  _buildDecorations() {
    this.decoImages    = [];   // combined (backward compat)
    this.campoDecos    = [];
    this.transicaoDecos= [];
    this.jardimDecos   = [];
    this.limiarDecos   = [];
    const gm = this._globalSizeMult ?? 1.0;

    // ── Campo (x:0–ZW, y:0–ZH) ───────────────────────────────────────────
    const cm = this._campoDecoMult ?? 1.0;
    const campoNums = ['02','03','04','05','06','07','08','09','10','11',
                       '13','14','17','18','19','20','21','22','23','24','25'];
    const ck = campoNums.filter(n => this.textures.exists(`z1_campo_${n}`))
                        .map(n => `z1_campo_${n}`);

    const CAMPO_POS = [
      [76,   111,  190],
      [1730, 652,  235],
      [484,  98,   175],
      [1811, 979,  324],
      [829,  100,  175],
      [1741, 151,  190],
      [632,  293,  180],
      [266,  125,  240],
      [567,  509,  80],
      [743,  237,  155],
      [718,  1027, 145],
      [911,  244,  25],
      [1093, 101,  65],
      [96,   426,  280],
      [385,  897,  170],
      [350,  340,  245],
      [864,  323,  120],
      [1304, 426,  205],
      [1458, 122,  255],
      [288,  611,  80],
      [975,  755,  50],
      [1516, 358,  205],
      [1494, 644,  230],
      [1237, 187,  240],
      [985,  520,  170],
      [168,  838,  215],
      [981,  980,  215],
      [439,  657,  235],
      [681,  639,  260],
      [1190, 774,  140],
      [1766, 370,  195],
    ];
    this._campoPos = CAMPO_POS;

    if (ck.length > 0) {
      CAMPO_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, ck[i % ck.length])
          .setDisplaySize(s * cm * gm, s * cm * gm).setDepth(3);
        this.campoDecos.push({ img, baseSize: s });
        this.decoImages.push({ img, baseSize: s });
      });
    }

    // ── Transição  x:0–ZW, y:-TH–0 ─────────────────────────────────────
    const tm = this._transDecoMult ?? 1.0;
    const transNums = ['01','02','03','04','05','06','07','08','09','10',
                       '11','12','13','14','15','16','17','18','19'];
    const tk = transNums.filter(n => this.textures.exists(`z1_trans_${n}`))
                        .map(n => `z1_trans_${n}`);

    if (tk.length > 0) {
      const TRANS_POS = [
        [ 556, -415, 168], [ 350, -102, 151], [ 707, -105, 100],
        [ 235, -491,  45], [1876, -353,  54], [1430, -377, 286],
        [1424,  988,  83], [ 279, -262,  50], [ 999, -216,  47],
        [ 672,  -48, 112], [1853, -406,  85], [ 865, -505,  57],
        [ 973, -404,  58], [1571, -224,  83], [1133, -409, 526],
        [ 804, -361, 551], [1043,  -57, 128], [1673, -387, 318],
      ];
      TRANS_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, tk[(i + 1) % tk.length])
          .setDisplaySize(s * tm * gm, s * tm * gm).setDepth(4).setAlpha(0.82);
        this.transicaoDecos.push({ img, baseSize: s });
        this.decoImages.push({ img, baseSize: s });
      });
    }

    // ── Jardim Invertido  x:ZW–ZW*2, y:0–ZH ─────────────────────────────
    const jm = this._jardimDecoMult ?? 1.0;

    if (ck.length > 0) {
      const JARDIM_POS = [
        [2064,  67, 120], [2448,  67,  45], [2717,  67,  95], [3101,  67, 140], [3350,  67,  55], [3715,  67, 110],
        [2064, 311,  45], [2448, 311, 130], [2717, 311,  38], [3101, 311, 115], [3350, 311,  60], [3715, 311, 135],
        [2064, 488, 145], [2448, 488,  50], [2717, 488,  95], [3101, 488, 148], [3350, 488,  42], [3715, 488, 130],
        [2064, 743,  48], [2448, 743, 132], [2717, 743,  38], [3101, 743, 122], [3350, 743,  58], [3715, 743, 140],
        [2064, 920, 130], [2448, 920,  48], [2717, 920, 142], [3101, 920,  38], [3350, 920,  92], [3715, 920,  60],
      ];
      JARDIM_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, ck[(i + 1) % ck.length])
          .setDisplaySize(s * jm * gm, s * jm * gm).setDepth(3).setAlpha(0.78);
        this.jardimDecos.push({ img, baseSize: s });
        this.decoImages.push({ img, baseSize: s });
      });
    }

    // ── Limiar Secreto  x:0–ZW, y:-(ZH+TH+PH)–-(TH+PH) ─────────────────
    const lm  = this._limiarDecoMult ?? 1.0;
    const TH  = this._transH;
    const PH  = this._paredeH;
    const limiarNums = ['02','03','04','05','06','07','08','09','10','11','12','13','14','15',
                        '16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'];
    const lk = limiarNums.filter(n => this.textures.exists(`z1_limiar_${n}`))
                         .map(n => `z1_limiar_${n}`);

    if (lk.length > 0) {
      const LIMIAR_POS = [
        [  73, -2246, 110], [ 445, -2246,  38], [ 726, -2246, 135], [1098, -2246,  50], [1379, -2246, 120], [1751, -2246,  40],
        [  73, -2019,  42], [ 445, -2019, 140], [ 726, -2019,  52], [1098, -2019, 118], [1379, -2019,  38], [1751, -2019, 142],
        [ 141, -1569, 428], [ 445, -1857,  48], [ 726, -1857,  98], [1098, -1857, 150], [1379, -1857,  42], [1751, -1857, 130],
        [  73, -1619,  48], [ 445, -1619, 132], [ 726, -1619,  38], [1098, -1619, 322], [1379, -1619,  58], [1751, -1619, 138],
        [ 276, -1324, 440], [ 578, -1405, 333], [ 726, -1436, 145], [1098, -1436,  48], [1379, -1436, 112], [1751, -1436,  38],
      ];
      LIMIAR_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, lk[(i + 1) % lk.length])
          .setDisplaySize(s * lm * gm, s * lm * gm).setDepth(3).setAlpha(0.85);
        this.limiarDecos.push({ img, baseSize: s });
        this.decoImages.push({ img, baseSize: s });
      });
    }
  }

  _buildVine() {
    // No-op: vine sprites removed. Trepadeira is now a collectible plant in Transição.
  }

  _buildPlants() {
    const TH = this._transH, PH = this._paredeH, ZW = this._zoneW;
    this.plants = [];
    PLANT_SPAWNS.forEach(({ id, x, y }) => {
      if (GameState.collected.has(id)) return;
      const plantData = PLANTS[id];
      if (!plantData) return;
      this.plants.push(new Plant(this, x, y, plantData));
    });
    TRANSICAO_PLANT_SPAWNS.forEach(({ id, x, y }) => {
      if (GameState.collected.has(id)) return;
      const plantData = PLANTS[id];
      if (!plantData) return;
      this.plants.push(new Plant(this, x, y, plantData));
    });
    LIMIAR_PLANT_SPAWNS.forEach(({ id, xFrac, yOff }) => {
      if (GameState.collected.has(id)) return;
      const plantData = PLANTS[id];
      if (!plantData) return;
      this.plants.push(new Plant(this, Math.round(xFrac * ZW), -(TH + PH + yOff), plantData));
    });
  }

  _buildPortal() {
    const locked = !this._vineClimbed;
    // Portal sits deep in Limiar Secreto (x center, near top of zone)
    this.portal = new Portal(this, this._zoneW / 2, -(this._transH + this._paredeH + this._zoneH - 100), {
      portalId: 'zone1_limiar',
      destination: 'Zone2',
      locked,
    });
  }

  _buildFireflies() {
    if (this._vagScale === undefined) this._vagScale = 1.0;
    if (this._vagQty   === undefined) this._vagQty   = 12;
    if (this._vagFreq  === undefined) this._vagFreq  = 700;

    // vagalume_degradee is a 512px white radial-gradient glow — the real firefly asset.
    // Scale ~0.06 gives ~31px game / 62px screen at zoom 2. Fallback to generated dot.
    const ffKey = this.textures.exists('z1_vagalume_degradee') ? 'z1_vagalume_degradee' : 'firefly';
    const baseScale = (ffKey === 'z1_vagalume_degradee' ? 0.06 : 2.0) * this._vagScale;

    // Dense cluster in Campo
    this.campoEmitter = this.add.particles(0, 0, ffKey, {
      x: { min: 40, max: this._zoneW - 40 },
      y: { min: 40, max: this._zoneH - 40 },
      lifespan: { min: 2200, max: 4500 },
      speed:    { min: 8, max: 28 },
      scale:    { start: baseScale, end: 0 },
      alpha:    { start: 0.95, end: 0 },
      quantity:  this._vagQty,
      frequency: this._vagFreq,
      blendMode: 'ADD',
    }).setDepth(7);

    // Vagalumes only exist in Campo dos Vagalumes — sparseEmitter removed
    this.sparseEmitter = null;
  }

  _rebuildFireflies() {
    this.campoEmitter?.destroy();
    this.sparseEmitter?.destroy();
    this.campoEmitter = null;
    this.sparseEmitter = null;
    this._buildFireflies();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Update
  // ─────────────────────────────────────────────────────────────────────────
  update(time, delta) {
    if (this._dbFrozen) return;   // freeze everything while debug panel is open
    this.player.update(this.cursors, this.wasd, this.keyShift, delta);

    // ── Hard boundary: cannot enter Parede/Limiar until vine is collected ─
    if (!this._vineClimbed && this.player.y < -this._transH + 2) {
      this.player.setY(-this._transH + 2);
      if (this.player.body) this.player.body.velocity.y = 0;
    }

    // ── Hard boundary: limiar → dead zone (right wall at x=_zoneW) ───────
    // In Limiar (y<0) the player must NOT cross into the top-right quadrant.
    if (this.player.y < 0 && this.player.x >= this._zoneW - 2) {
      this.player.setX(this._zoneW - 2);
      if (this.player.body) this.player.body.velocity.x = 0;
    }

    const ph = this.player.displayHeight;
    this.playerShadow.setPosition(this.player.x, this.player.y + Math.round(ph * 0.24));
    this.playerShadow.setSize(Math.round(ph * 0.16), Math.max(4, Math.round(ph * 0.038)));

    GameState.playerX = this.player.x;
    GameState.playerY = this.player.y;

    if (this._tutorialDismiss && this.player.recentSpeed > 20) {
      this._tutorialDismiss();
      this._tutorialDismiss = null;
    }
    this._checkAreaChange();
    this._checkPlantProximity(time, delta);
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateHints(delta);
    this._updateFootsteps(delta);
    this._checkZoneUnlocks();
    this._updateLadrao(delta);

    if (this._spellCooldown > 0) this._spellCooldown -= delta;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Area detection — L-shaped world
  //    x >= ZONE_W → Jardim Invertido (right block)
  //    y < 0       → Limiar Secreto   (top block)
  //    else        → Campo dos Vagalumes
  // ─────────────────────────────────────────────────────────────────────────
  _checkAreaChange() {
    if (this._zoneTransition) return;
    const px = this.player.x, py = this.player.y;
    let area = 'campoVagalumes';
    if (px >= this._zoneW && py >= 0)                         area = 'jardimInvertido';
    else if (py < -(this._transH + this._paredeH))            area = 'limiarSecreto';
    else if (py < -this._transH)                              area = 'paredeZone';
    else if (py < 0)                                          area = 'transicao';

    if (area !== this._currentArea) {
      const prev = this._currentArea;
      this._currentArea = area;
      this.game.events.emit('areaChanged', AREAS[area].label);

      // campo ↔ jardim: camera must snap across a full viewport — hide with a
      // brief black blink (80 ms out, 180 ms in) so the snap is invisible
      const crossingHorizontal = area === 'jardimInvertido' || prev === 'jardimInvertido';
      if (crossingHorizontal && prev !== '') {
        this._zoneTransition = true;
        this.cameras.main.fade(80, 0, 0, 0);
        this.time.delayedCall(80, () => {
          this._applyCameraBounds(area);
          this.cameras.main.fadeIn(180, 0, 0, 0);
          this.time.delayedCall(180, () => { this._zoneTransition = false; });
        });
      } else {
        this._applyCameraBounds(area);
      }

      // First-time hint when entering Jardim without any plants
      if (area === 'jardimInvertido' && !this._jardimHintShown) {
        this._jardimHintShown = true;
        if (GameState.inventory.length === 0) {
          this.time.delayedCall(700, () => {
            this._emitNarrative('Dica: explora o Campo (← esquerda) antes de avançar para o Jardim!', 5000);
          });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Camera bounds — one zone visible at a time, seamless crossing
  // ─────────────────────────────────────────────────────────────────────────
  _applyCameraBounds(area) {
    const ZW = this._zoneW, ZH = this._zoneH;
    if (area === 'jardimInvertido') {
      // Right column only — no dead zone above, no campo to the left
      this.cameras.main.setBounds(ZW, 0, ZW, ZH);
    } else {
      // Left column: campo + transição + parede + limiar
      const TH = this._transH, PH = this._paredeH;
      this.cameras.main.setBounds(0, -(ZH + TH + PH), ZW, ZH * 2 + TH + PH);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Proximity
  // ─────────────────────────────────────────────────────────────────────────
  _checkPlantProximity(time, delta) {
    this._nearPlant = null;
    let foundNear = false;

    this.plants.forEach(plant => {
      if (plant.isCollected || !plant.isVisible) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, plant.x, plant.y);
      const inRange = dist < PLAYER_INTERACTION_RADIUS;
      const method  = plant.plantData.collectMethod;

      if (inRange && method === 'fast') {
        plant.showHint(this.player.recentSpeed >= 120 ? false : true, 'Corre para apanhar!');
      } else {
        plant.showHint(inRange);
      }

      if (!inRange) { this._ventoinhaSlowTimers.delete(plant); return; }
      this._nearPlant = plant;
      foundNear = true;

      if (method === 'fast') {
        if (this.player.recentSpeed >= 120) {
          this._ventoinhaSlowTimers.delete(plant);
          this._collectPlant(plant);
        } else {
          const t = (this._ventoinhaSlowTimers.get(plant) || 0) + delta;
          this._ventoinhaSlowTimers.set(plant, t);
          if (t > 1400 && plant.isVisible && !plant._spinning) {
            this._ventoinhaSlowTimers.delete(plant);
            plant.spinAndHide();
            this._emitNarrative('Demasiado devagar — a Ventoinha fugiu!', 2500);
          }
        }
        return;
      }

      if (method === 'interact' || method === 'brave' || method === 'slow') {
        const tooFast = method === 'slow' && this.player.recentSpeed > 50;
        if (tooFast) { this._timedPlant = null; this._proximityTimer = 0; return; }
        if (this._timedPlant !== plant) { this._timedPlant = plant; this._proximityTimer = 0; }
        this._proximityTimer += delta;
        const holdMs = method === 'brave' ? 900 : 600;
        if (this._proximityTimer >= holdMs) {
          this._timedPlant = null; this._proximityTimer = 0;
          if (method === 'brave') this._emitNarrative('Coragem!');
          this.time.delayedCall(method === 'brave' ? 200 : 0, () => this._collectPlant(plant));
        }
      }
    });

    if (!foundNear) { this._timedPlant = null; this._proximityTimer = 0; }
  }

  _checkVineProximity() {
    // No-op: vine sprites removed; trepadeira hint is handled by plant proximity.
  }

  _checkPortalProximity() {
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.portal.x, this.portal.y);
    this._nearPortal = dist < 65;
    this.portal.showHint(this._nearPortal);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Keys
  // ─────────────────────────────────────────────────────────────────────────
  _handleKeys(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.keyC))  this._handleInteract(time);
    if (Phaser.Input.Keyboard.JustDown(this.keyF) && this._spellCooldown <= 0) this._castSpell();
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      GameState.cycleSpell();
      this.game.events.emit('spellCast', GameState.activeSpell);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) {
      SoundManager.mapToggle(true);
      this.scene.pause();
      this.scene.launch('Map');
    }
  }

  _handleInteract(time) {
    if (this._nearPortal)  { this._usePortal(); return; }
    if (!this._nearPlant)  return;

    const plant  = this._nearPlant;
    const method = plant.plantData.collectMethod;

    if (method === 'shake') {
      SoundManager.shake();
      const ready = plant.shake(time);
      if (ready) {
        this._collectPlant(plant);
      } else {
        const left = 3 - plant.shakeCount;
        this._emitNarrative(`Sacude mais ${left} vez${left !== 1 ? 'es' : ''}… (C)`);
      }
      return;
    }

    if (method === 'spell') {
      if (GameState.activeSpell === 'brisa_molhada') {
        this._castSpellOnPlant(plant);
      } else if (GameState.availableSpells.includes('brisa_molhada')) {
        this._emitNarrative('Activa a Brisa Molhada (Q + F) e depois usa C na Farfalha.');
      } else {
        this._emitNarrative('Esta planta está protegida. Precisas de um feitiço especial…');
      }
      return;
    }

    if (method === 'climb') { this._climbVine(); this._collectPlant(plant); return; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Trepadeira — collecting it opens the Parede zone (boundary lifts)
  // ─────────────────────────────────────────────────────────────────────────
  _climbVine() {
    if (this._vineClimbed) return;
    this._vineClimbed = true;

    this._emitNarrative('A trepadeira abre caminho para o Limiar Secreto…');
    this.portal.unlock();

    if (!GameState.discoveredPortals.has('zone1_limiar')) {
      GameState.discoverPortal('zone1_limiar');
      this.time.delayedCall(800, () => {
        this._emitNarrative('Encontraste um portal! Leva-te de volta quando precisares.');
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Spells
  // ─────────────────────────────────────────────────────────────────────────
  _castSpell() {
    if (!GameState.activeSpell) return;
    this._spellCooldown = 1200;

    const spellDef = SPELLS[GameState.activeSpell];
    this._showSpellFX(spellDef.textureKey);
    this.game.events.emit('spellCast', GameState.activeSpell);

    if (GameState.activeSpell === 'brisa_molhada') {
      this._emitNarrative('A Brisa Molhada envolve o ar…');
    }
    if (GameState.activeSpell === 'canto_jardim') this._revealAllPlants();
  }

  _castSpellOnPlant(plant) {
    this._spellCooldown = 800;
    this._showSpellFX('spell_brisa');
    this.time.delayedCall(400, () => this._collectPlant(plant));
    this.game.events.emit('spellCast', GameState.activeSpell);
  }

  _showSpellFX(textureKey) {
    const fx = this.add.image(this.player.x, this.player.y, textureKey)
      .setDisplaySize(50, 50).setAlpha(0.9).setDepth(50).setBlendMode('ADD');
    this.tweens.add({
      targets: fx, scale: 4, alpha: 0, duration: 700,
      ease: 'Power2.easeOut', onComplete: () => fx.destroy(),
    });
  }

  _revealAllPlants() {
    this.plants.forEach(p => {
      if (p.isCollected) return;
      this.cameras.main.pan(p.x, p.y, 600, 'Sine.easeInOut', false, (cam, progress) => {
        if (progress === 1) {
          this.time.delayedCall(400, () =>
            this.cameras.main.pan(this.player.x, this.player.y, 600, 'Sine.easeInOut')
          );
        }
      });
    });
    this._emitNarrative('O Canto do Jardim revelou onde estão as plantas!');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Plant collection
  // ─────────────────────────────────────────────────────────────────────────
  _collectPlant(plant) {
    if (plant.isCollected) return;
    const data = plant.plantData;
    if (!GameState.addPlant(data)) {
      this._emitNarrative('A mochila está cheia! Tens 6 plantas.');
      return;
    }
    plant.collect();
    this._showPlantPaper(data);
    this._checkSpellUnlock();
    this.plants = this.plants.filter(p => {
      if (p !== plant && p.plantData.id === data.id) { p.destroy(); return false; }
      return p !== plant;
    });
    this._emitNarrative(data.narrativeText, 4200);
    this.game.events.emit('plantCollected', data, data);

    if (!GameState.isZoneUnlocked('Zone2') && GameState.checkZone2Unlock()) {
      GameState.unlockZone('Zone2');
      this.time.delayedCall(600, () => {
        this._showZoneUnlockTransition('Zona 2 — Planície das Fendas');
      });
      this.time.delayedCall(3500, () => {
        this._emitNarrative('Um novo caminho abriu-se. A Zona 2 está acessível pelo portal!');
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Portal
  // ─────────────────────────────────────────────────────────────────────────
  _usePortal() {
    if (this.portal.isLocked) {
      this._emitNarrative('Este portal está fechado. Usa a trepadeira (C) primeiro!');
      return;
    }
    if (!GameState.isZoneUnlocked('Zone2')) {
      this._emitNarrative('Precisas de Farfalha, Ventoinha-branca e Trepadeira-viva para abrir o próximo caminho.');
      return;
    }
    SoundManager.portal();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.events.off('plantStolen', this._onPlantStolen, this);
      this.scene.start('Zone2');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Hints
  // ─────────────────────────────────────────────────────────────────────────
  _updateHints(delta) {
    const still = this.player.stillTime;
    if (still > 30000 && this._hintLevel < 1) { this._hintLevel = 1; this._showButterfly(); }
    if (still > 65000 && this._hintLevel < 2) { this._hintLevel = 2; this._emitNarrative('(a avó murmura ao longe…) — procura o brilho das plantas.'); }
    if (still > 95000 && this._hintLevel < 3) { this._hintLevel = 3; this.game.events.emit('bagGlow'); }
    if (still < 500) this._hintLevel = 0;
  }

  _showButterfly() {
    const b = this.add.image(this.player.x, this.player.y, 'butterfly').setDepth(20).setAlpha(0.9);
    let nearestDist = Infinity, nearestPlant = null;
    this.plants.forEach(p => {
      if (p.isCollected) return;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
      if (d < nearestDist) { nearestDist = d; nearestPlant = p; }
    });
    const tx = nearestPlant ? nearestPlant.x : this.player.x + 200;
    const ty = nearestPlant ? nearestPlant.y : this.player.y + 100;
    this.tweens.add({
      targets: b, x: tx, y: ty, alpha: 0, duration: 2000,
      ease: 'Sine.easeInOut', onComplete: () => b.destroy(),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Zone unlock checks
  // ─────────────────────────────────────────────────────────────────────────
  _checkZoneUnlocks() {
    if (!GameState.isZoneUnlocked('Zone2') && GameState.checkZone2Unlock()) {
      GameState.unlockZone('Zone2');
    }
  }

  _updateFootsteps(delta) {
    if (this.player.recentSpeed < 20) { this._footTimer = 0; return; }
    this._footTimer += delta;
    const interval = this.player.recentSpeed > 120 ? 260 : 380;
    if (this._footTimer >= interval) {
      this._footTimer = 0;
      SoundManager.footstep(this.player.recentSpeed > 120);
    }
  }

  _emitNarrative(text, dur = 3500) {
    this.game.events.emit('showNarrative', text, dur);
  }

  _onPlantStolen(plant) {
    this._emitNarrative(`O Sussurro-Ladrão levou a tua ${plant.name}! Volta ao Campo para procurar mais.`, 5000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Tutorial overlay
  // ─────────────────────────────────────────────────────────────────────────
  _showTutorial() {
    const W = 400, H = 96, sx = 30, sy = 30;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(60);
    bg.fillStyle(0x0a1a0a, 0.86);
    bg.fillRoundedRect(sx, sy, W, H, 10);
    bg.lineStyle(1, 0x7bc67e, 0.55);
    bg.strokeRoundedRect(sx, sy, W, H, 10);
    const rows = [
      'WASD / setas — mover       Shift — correr',
      'C — interagir com plantas e portais',
      'M — mapa     Q — mudar feitiço     F — lançar',
    ];
    const texts = rows.map((r, i) =>
      this.add.text(sx + 14, sy + 10 + i * 26, r, {
        fontSize: '12px', fontFamily: 'monospace', color: '#b8e8a8',
      }).setScrollFactor(0).setDepth(61)
    );
    const objs = [bg, ...texts];
    const dismiss = () => {
      if (!bg.active) return;
      this.tweens.add({
        targets: objs, alpha: 0, duration: 600,
        onComplete: () => objs.forEach(o => o.destroy()),
      });
      this._tutorialDismiss = null;
    };
    this._tutorialDismiss = dismiss;
    this.time.delayedCall(6000, () => dismiss());
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Guide fireflies — drift toward nearest Ventoinha-branca
  // ─────────────────────────────────────────────────────────────────────────
  _buildGuideFireflies() {
    const key = this.textures.exists('z1_vagalume_degradee') ? 'z1_vagalume_degradee' : 'firefly';
    this._guideFireflies = [];
    // Delay first appearance — only guide after player has been idle a while
    for (let i = 0; i < 3; i++) {
      const ff = this.add.image(this.player.x, this.player.y, key)
        .setDisplaySize(18, 18).setAlpha(0).setDepth(8);
      this._guideFireflies.push(ff);
      // 25s staggered delay: player needs time to orient before being guided
      this.time.delayedCall(25000 + i * 1200, () => this._animateGuideFF(ff));
    }
  }

  _findGuideTarget() {
    // Find the nearest uncollected, visible plant in the current area
    const px = this.player.x, py = this.player.y;
    const candidates = this.plants.filter(p => !p.isCollected && p.isVisible && p.active);
    if (candidates.length === 0) {
      // All plants collected or trepadeira already taken — no target
      return null;
    }
    // Prefer plants in the same area as the player
    const inArea = candidates.filter(p => {
      if (px >= ZONE_W)                      return p.x >= ZONE_W;                                    // jardim
      if (py < -(this._transH + this._paredeH)) return p.y < -(this._transH + this._paredeH);         // limiar
      if (py < -this._transH)               return p.y < -this._transH && p.y >= -(this._transH + this._paredeH); // parede
      if (py < 0)                           return p.y < 0 && p.y >= -this._transH;                   // transição
      return p.x < ZONE_W && p.y >= 0;                                                                // campo
    });
    const pool = inArea.length > 0 ? inArea : candidates;
    return pool.reduce((best, p) => {
      const d  = Phaser.Math.Distance.Between(px, py, p.x,    p.y);
      const bd = Phaser.Math.Distance.Between(px, py, best.x, best.y);
      return d < bd ? p : best;
    });
  }

  _animateGuideFF(ff) {
    if (!ff.active) return;
    const target = this._findGuideTarget();
    // No target and vine already climbed → firefly has nothing to do
    if (!target) { ff.destroy(); return; }

    ff.setPosition(
      this.player.x + Phaser.Math.Between(-25, 25),
      this.player.y + Phaser.Math.Between(-25, 25)
    );
    this.tweens.add({
      targets: ff, alpha: 0.9, duration: 400,
      onComplete: () => {
        this.tweens.add({
          targets: ff,
          x: target.x + Phaser.Math.Between(-15, 15),
          y: target.y + Phaser.Math.Between(-15, 15),
          duration: 2800, ease: 'Sine.easeInOut',
          onComplete: () => {
            this.tweens.add({
              targets: ff, alpha: 0, duration: 400,
              onComplete: () => {
                this.time.delayedCall(4000, () => ff.active && this._animateGuideFF(ff));
              },
            });
          },
        });
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Vision blockers — wandering bright spots (firefly glow)
  // ─────────────────────────────────────────────────────────────────────────
  _buildVisionBlockers() {
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 1300, () => this._spawnWanderingLight());
    }
  }

  _spawnWanderingLight() {
    if (!this.scene.isActive('Zone1')) return;
    const x = Phaser.Math.Between(60, (this._zoneW ?? 1920) - 60);
    const y = Phaser.Math.Between(40, (this._zoneH ?? 1080) - 40);
    const r = Phaser.Math.Between(35, 65);
    const circle = this.add.circle(x, y, r, 0xffffff, 0).setDepth(14);
    this.tweens.add({ targets: circle, alpha: 0.6, duration: 500 });
    const wander = () => {
      if (!circle.active) return;
      this.tweens.add({
        targets: circle,
        x: Phaser.Math.Between(60, ZONE_W - 60),
        y: Phaser.Math.Between(40, ZONE_H - 40),
        duration: Phaser.Math.Between(1800, 3600),
        ease: 'Sine.easeInOut',
        onComplete: wander,
      });
    };
    wander();
    this.time.delayedCall(Phaser.Math.Between(5000, 11000), () => {
      if (!circle.active) return;
      this.tweens.add({
        targets: circle, alpha: 0, duration: 600,
        onComplete: () => {
          circle.destroy();
          this.time.delayedCall(Phaser.Math.Between(1500, 4000), () => this._spawnWanderingLight());
        },
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Sussurro-Ladrão — shadowy lion that stalks the player and steals plants
  // ─────────────────────────────────────────────────────────────────────────
  _scheduleLadrao() {
    if (!this.scene.isActive('Zone1')) return;
    if (GameState.inventory.length === 0) {
      this.time.delayedCall(12000, () => this._scheduleLadrao());
      return;
    }
    this._spawnLadrao();
  }

  _spawnLadrao() {
    if (this._ladrao?.active) return;

    // Spawn off-screen: camera shows 640×360 game units at zoom 2, so >380px away is safe
    let sx, sy, attempts = 0;
    do {
      sx = Phaser.Math.Between(40, ZONE_W * 3 - 40);
      sy = Phaser.Math.Between(40, ZONE_H - 40);
      attempts++;
    } while (
      Phaser.Math.Distance.Between(sx, sy, this.player.x, this.player.y) < 380
      && attempts < 20
    );

    this._ladrao = this.add.image(sx, sy, 'sussurro_ladrao')
      .setDisplaySize(44, 38).setAlpha(0).setDepth(9);
    this._ladraoStole = false;

    this.tweens.add({ targets: this._ladrao, alpha: 0.88, duration: 900 });
    this.time.delayedCall(700, () => {
      this._emitNarrative('Sombras sussurram entre as ervas…', 2500);
    });
  }

  _updateLadrao(delta) {
    if (!this._ladrao?.active || this._ladraoStole) return;

    // Dismiss if player has nothing left to steal
    if (GameState.inventory.length === 0) {
      this._despawnLadrao(false); return;
    }

    const dist = Phaser.Math.Distance.Between(
      this._ladrao.x, this._ladrao.y, this.player.x, this.player.y
    );

    // Speed ramps up as it closes in
    const spd = dist < 180 ? 68 : 38;
    const ang = Math.atan2(
      this.player.y - this._ladrao.y,
      this.player.x - this._ladrao.x
    );
    this._ladrao.x += Math.cos(ang) * spd * (delta / 1000);
    this._ladrao.y += Math.sin(ang) * spd * (delta / 1000);
    this._ladrao.setFlipX(Math.cos(ang) < 0);

    // Pulse alpha when close — visual warning
    if (dist < 180) {
      this._ladrao.setAlpha(0.65 + Math.sin(Date.now() * 0.01) * 0.3);
    }

    // Steal range
    if (dist < 50) {
      this._ladraoStole = true;
      const stolen = GameState.stealLastPlant();
      if (stolen) this.game.events.emit('plantStolen', stolen);

      const fleeAng = ang + Math.PI;
      this.tweens.add({
        targets: this._ladrao,
        x: this._ladrao.x + Math.cos(fleeAng) * 480,
        y: this._ladrao.y + Math.sin(fleeAng) * 200,
        alpha: 0,
        duration: 1800,
        ease: 'Power2.easeIn',
        onComplete: () => this._despawnLadrao(true),
      });
    }
  }

  _despawnLadrao(stole) {
    this._ladrao?.destroy();
    this._ladrao = null;
    const delay = stole
      ? Phaser.Math.Between(55000, 85000)
      : Phaser.Math.Between(25000, 45000);
    this.time.delayedCall(delay, () => this._scheduleLadrao());
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Plant paper — shown on collection
  // ─────────────────────────────────────────────────────────────────────────
  _showPlantPaper(plantData) {
    const W = 440, H = 90, pad = 12;
    const sx = Math.round((GAME_WIDTH - W) / 2);
    const sy = GAME_HEIGHT - H - 18;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(70);
    bg.fillStyle(0xf5e6c0, 0.96);
    bg.fillRoundedRect(sx, sy, W, H, 8);
    bg.lineStyle(2, 0x9b7a1a, 0.85);
    bg.strokeRoundedRect(sx, sy, W, H, 8);
    bg.lineStyle(1, 0xc4a44a, 0.35);
    bg.lineBetween(sx + pad, sy + 28, sx + W - pad, sy + 28);
    const nameT = this.add.text(sx + W / 2, sy + 7, plantData.name, {
      fontSize: '13px', fontFamily: 'Georgia, serif',
      color: '#3a2000', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(71);
    const pistaT = this.add.text(sx + pad, sy + 33, plantData.narrativeText || '', {
      fontSize: '10px', fontFamily: 'Georgia, serif',
      color: '#5a3200', wordWrap: { width: W - pad * 2 },
    }).setScrollFactor(0).setDepth(71);
    const objs = [bg, nameT, pistaT];
    this.tweens.add({ targets: objs, alpha: { from: 0, to: 1 }, duration: 300 });
    this.time.delayedCall(5000, () => {
      this.tweens.add({
        targets: objs, alpha: 0, duration: 600,
        onComplete: () => objs.forEach(o => o.destroy()),
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Spell unlock notification
  // ─────────────────────────────────────────────────────────────────────────
  _checkSpellUnlock() {
    const id = GameState.spellJustUnlocked;
    if (!id || id === this._spellUnlockShown) return;
    this._spellUnlockShown = id;
    GameState.spellJustUnlocked = null;
    const spell = SPELLS[id];
    this.time.delayedCall(800, () => {
      this._emitNarrative(`Feitiço desbloqueado: ${spell.name}! (Q seleccionar · F lançar)`, 5000);
      this.game.events.emit('spellUnlocked', id);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Debug panel — Tab to toggle
  //  • All deco images + placa become draggable
  //  • Click/drag selects element (yellow outline)
  //  • Scroll wheel resizes selected element (±5px per tick)
  //  • Live coord shown at bottom while dragging/resizing
  //  • Right panel updates after each drop/resize
  //  • "COPIAR" button writes updated CAMPO_POS to clipboard
  // ─────────────────────────────────────────────────────────────────────────
  _buildDebugPanel() {
    this._debugObjs     = [];
    this._debugDragObjs = [];
    this._debugSelected = null;

    const push = (o) => { this._debugObjs.push(o); return o; };

    // Tiny yellow/cyan dot markers (visual reference only)
    const mark = (x, y, label, col = 0xffff00) => {
      push(this.add.circle(x, y, 6, col, 0.7).setDepth(99));
      push(this.add.text(x, y - 11, label, {
        fontSize: '9px', fontFamily: 'monospace',
        color: '#ffff00', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(100));
    };

    mark(640, Math.round(ZONE_H / 2), '①bruxinha', 0x00ffff);
    PLANT_SPAWNS.filter(s => s.x < ZONE_W).forEach((s, i) => mark(s.x, s.y, `②v${i}`, 0x00ff88));
    if (this.placaCampo) mark(this.placaCampo.x, this.placaCampo.y, '③placa', 0xff8800);
    (this._campoPos || []).forEach(([x, y], i) =>
      mark(x, y, `d${String(i).padStart(2, '0')}`, 0xdddddd)
    );

    // ── Make every deco image, placa, and plant draggable ─────────────────
    this.decoImages.forEach(({ img }) => {
      img.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(img);
      this._debugDragObjs.push(img);
    });
    if (this.placaCampo) {
      this.placaCampo.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(this.placaCampo);
      this._debugDragObjs.push(this.placaCampo);
    }
    (this.plants || []).forEach(plant => {
      plant.setInteractive(
        new Phaser.Geom.Circle(0, 0, 44), Phaser.Geom.Circle.Contains,
        { draggable: true, useHandCursor: true }
      );
      this.input.setDraggable(plant);
      this._debugDragObjs.push(plant);
      // cyan marker on plant
      push(this.add.circle(plant.x, plant.y, 7, 0x00ffff, 0.7).setDepth(99));
      push(this.add.text(plant.x, plant.y - 13, `⬆${plant.plantData.id}`, {
        fontSize: '9px', fontFamily: 'monospace', color: '#00ffff',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(100));
    });

    // ── Selection highlight graphics ──────────────────────────────────────
    this._debugSelGfx = push(this.add.graphics().setDepth(101));

    // ── Bottom coord tip ──────────────────────────────────────────────────
    this._debugTip = push(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 6,
        'arrasta para mover · roda para tamanho', {
          fontSize: '11px', fontFamily: 'monospace', color: '#ffff99',
          stroke: '#000000', strokeThickness: 2,
          backgroundColor: '#00000099', padding: { x: 10, y: 4 },
        }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(102)
    );

    // ── Right panel ───────────────────────────────────────────────────────
    const PW = 290, px = GAME_WIDTH - PW - 6, py = 6;
    const pbg = this.add.graphics().setScrollFactor(0).setDepth(98);
    pbg.fillStyle(0x000000, 0.88); pbg.fillRoundedRect(px, py, PW, GAME_HEIGHT - 12, 6);
    push(pbg);

    // Copy button at top of panel
    push(
      this.add.text(px + PW / 2, py + 7, '[ COPIAR CAMPO_POS ]', {
        fontSize: '10px', fontFamily: 'monospace', color: '#ffcc00',
        backgroundColor: '#003300', padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this._debugCopy())
        .on('pointerover', function() { this.setColor('#ffffff'); })
        .on('pointerout',  function() { this.setColor('#ffcc00'); })
    );

    this._debugPanelTxt = push(
      this.add.text(px + 7, py + 30, '', {
        fontSize: '10px', fontFamily: 'monospace',
        color: '#d8f8d8', lineSpacing: 1,
      }).setScrollFactor(0).setDepth(99)
    );

    this._debugRefresh();

    this.input.on('dragstart', this._onDebugDragStart, this);
    this.input.on('drag',      this._onDebugDrag,      this);
    this.input.on('dragend',   this._onDebugDragEnd,   this);
    this.input.on('wheel',     this._onDebugWheel,     this);
  }

  _onDebugDragStart(pointer, go) {
    const di = this.decoImages?.findIndex(d => d.img === go) ?? -1;
    this._debugSelected = { obj: go, idx: di, isPlaca: go === this.placaCampo };
    this._debugHighlight(go);
  }

  _onDebugDrag(pointer, go, x, y) {
    go.setPosition(x, y);

    let label = '';
    const di = this.decoImages?.findIndex(d => d.img === go) ?? -1;
    if (di >= 0 && this._campoPos?.[di]) {
      this._campoPos[di][0] = Math.round(x);
      this._campoPos[di][1] = Math.round(y);
      label = `d${String(di).padStart(2,'0')}  x=${Math.round(x)}  y=${Math.round(y)}  s=${this._campoPos[di][2]}`;
    }
    if (go === this.placaCampo) {
      this._placaCampoX = Math.round(x);
      this._placaCampoY = Math.round(y);
      label = `③ placa  x=${Math.round(x)}  y=${Math.round(y)}  s=${this._placaSize}`;
    }
    const pi = (this.plants || []).findIndex(p => p === go);
    if (pi >= 0) {
      PLANT_SPAWNS[pi].x = Math.round(x);
      PLANT_SPAWNS[pi].y = Math.round(y);
      label = `planta[${pi}] ${PLANT_SPAWNS[pi].id}  x=${Math.round(x)}  y=${Math.round(y)}`;
    }
    if (this._debugTip && label) this._debugTip.setText(label);
    this._debugHighlight(go);
  }

  _onDebugDragEnd() { this._debugRefresh(); this._debugLog(); }

  _onDebugWheel(pointer, objs, dx, dy) {
    const sel = this._debugSelected;
    if (!sel?.obj?.active) return;
    const step = dy < 0 ? 5 : -5;

    if (sel.idx >= 0 && this._campoPos?.[sel.idx]) {
      const newS = Math.max(10, this._campoPos[sel.idx][2] + step);
      this._campoPos[sel.idx][2] = newS;
      const m = this._decoMult ?? 1;
      sel.obj.setDisplaySize(newS * m, newS * m);
      const [x, y] = this._campoPos[sel.idx];
      this._debugTip?.setText(`d${String(sel.idx).padStart(2,'0')}  x=${x}  y=${y}  s=${newS}`);
      this._debugHighlight(sel.obj);
      this._debugRefresh();
      this._debugLog();
    }

    if (sel.isPlaca && this.placaCampo) {
      const newS = Math.max(10, (this._placaSize ?? 70) + step);
      this._placaSize = newS;
      this.placaCampo.setDisplaySize(newS, newS * 0.5);
      this._debugTip?.setText(`③ placa  x=${Math.round(this.placaCampo.x)}  y=${Math.round(this.placaCampo.y)}  s=${newS}`);
      this._debugHighlight(this.placaCampo);
      this._debugRefresh();
      this._debugLog();
    }
  }

  _debugLog() {
    console.log('%cZONE SIZE', 'color:#ffcc00;font-weight:bold;font-size:13px');
    console.log(`_zoneW: ${this._zoneW}  _zoneH: ${this._zoneH}`);
    const rows = (this._campoPos || []).map(([x, y, s]) => `  [${x}, ${y}, ${s}]`).join(',\n');
    console.log('%cCAMPO_POS', 'color:#7bc67e;font-weight:bold;font-size:13px');
    console.log(`const CAMPO_POS = [\n${rows}\n];`);
    const pRows = PLANT_SPAWNS.map(s => `  { id: '${s.id}', x: ${s.x}, y: ${s.y} }`).join(',\n');
    console.log('%cPLANT_SPAWNS', 'color:#7bc6ef;font-weight:bold;font-size:13px');
    console.log(`const PLANT_SPAWNS = [\n${pRows}\n];`);
  }

  _debugHighlight(go) {
    if (!this._debugSelGfx || !go?.active) return;
    const hw = go.displayWidth  / 2 + 4;
    const hh = go.displayHeight / 2 + 4;
    this._debugSelGfx.clear();
    this._debugSelGfx.lineStyle(2, 0xffff00, 0.9);
    this._debugSelGfx.strokeRect(go.x - hw, go.y - hh, hw * 2, hh * 2);
  }

  _debugRefresh() {
    if (!this._debugPanelTxt) return;
    const lines = [`[TAB] Debug  zoneW=${this._zoneW}  zoneH=${this._zoneH}`, '── arrasta · roda=tamanho · COPIAR ──', ''];
    lines.push(`① bruxinha  x=640  y=${Math.round(ZONE_H / 2)}`);
    if (this.placaCampo) {
      lines.push(`③ placa  x=${Math.round(this._placaCampoX)}  y=${Math.round(this._placaCampoY)}  s=${this._placaSize}`);
    }
    lines.push('', '── Plantas ──');
    PLANT_SPAWNS.forEach((s, i) =>
      lines.push(`p${i} ${s.id}  x=${s.x}  y=${s.y}`)
    );
    lines.push('', '── Decorações Campo ──');
    (this._campoPos || []).forEach(([x, y, s], i) =>
      lines.push(`d${String(i).padStart(2,'0')}  x=${x}  y=${y}  s=${s}`)
    );
    this._debugPanelTxt.setText(lines.join('\n'));
  }

  _debugCopy() {
    const rows = (this._campoPos || []).map(([x, y, s]) => `  [${x}, ${y}, ${s}]`).join(',\n');
    const out = `const CAMPO_POS = [\n${rows}\n];`;

    // execCommand works synchronously in a user-gesture handler (no HTTPS needed)
    const ta = document.createElement('textarea');
    ta.value = out;
    Object.assign(ta.style, { position: 'fixed', top: '-9999px', opacity: '0' });
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
    document.body.removeChild(ta);

    if (ok) {
      this._debugTip?.setText('✓ copiado! Cola no Zone1Scene.js');
    } else {
      // Last resort: open new tab with the text so user can select-all + copy
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`<pre style="font:13px monospace;background:#0a1f0e;color:#b8ffb0;padding:16px">${out}</pre>`);
        win.document.title = 'CAMPO_POS';
        this._debugTip?.setText('→ Abre um tab: seleciona tudo (Ctrl+A) e copia');
      }
    }
  }

  _toggleDebugPanel() {
    if (!window.debugPanel) return;
    window.debugPanel.toggle();
    if (window.debugPanel._visible) {
      this._enableDebugMode();
    } else {
      this._disableDebugMode();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Debug mode — make every visual object draggable + selectable
  // ─────────────────────────────────────────────────────────────────────────
  _enableDebugMode() {
    const ZW = this._zoneW, ZH = this._zoneH;
    const TH = this._transH, PH = this._paredeH;
    this._dbObjs     = [];
    this._dbSelected = null;
    this._dbFrozen   = true;

    // Freeze player in place; camera stays on stationary player
    if (this.player?.body) this.player.body.setVelocity(0, 0);

    // Zone boundary lines (world-space, high depth)
    this._dbBoundaryGfx = this.add.graphics().setDepth(998);
    const bg = this._dbBoundaryGfx;
    bg.lineStyle(2, 0xffff00, 0.65); bg.lineBetween(0, 0, ZW, 0);
    bg.lineStyle(2, 0xff8800, 0.65); bg.lineBetween(0, -TH, ZW, -TH);
    bg.lineStyle(2, 0xff00cc, 0.65); bg.lineBetween(0, -(TH + PH), ZW, -(TH + PH));

    // Zone labels
    const ls = { fontSize: '17px', fontFamily: 'monospace', stroke: '#000000', strokeThickness: 3 };
    this._dbZoneLabels = [
      this.add.text(ZW / 2, ZH * 0.5,       '— CAMPO —',    { ...ls, color: '#7bc67e' }).setOrigin(0.5).setDepth(999).setAlpha(0.75),
      this.add.text(ZW / 2, -TH * 0.5,      '— TRANSIÇÃO —',{ ...ls, color: '#ffff00' }).setOrigin(0.5).setDepth(999).setAlpha(0.75),
      this.add.text(ZW / 2, -(TH + PH * 0.5),'— PAREDE —',  { ...ls, color: '#ff8800' }).setOrigin(0.5).setDepth(999).setAlpha(0.75),
      this.add.text(ZW / 2, -(TH + PH + ZH * 0.5),'— LIMIAR —',{ ...ls, color: '#ff00cc' }).setOrigin(0.5).setDepth(999).setAlpha(0.75),
    ];

    // Selection graphics (world-space — follows camera automatically)
    this._dbSelGfx = this.add.graphics().setDepth(1000);

    // Register a game object as draggable
    const reg = (img, label) => {
      if (!img?.active) return;
      img._dbLabel = label;
      img.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(img);
      this._dbObjs.push(img);
    };

    // Plants get a generous circular hit area so they're easy to click
    (this.plants || []).forEach(p => {
      if (!p?.active) return;
      p._dbLabel = `plant:${p.plantData?.id}`;
      p.setInteractive(new Phaser.Geom.Circle(0, 0, 80), Phaser.Geom.Circle.Contains, { draggable: true, useHandCursor: true });
      this.input.setDraggable(p);
      this._dbObjs.push(p);
    });

    reg(this._tz?.fundo,   'tz.fundo');
    reg(this._tz?.caminho, 'tz.caminho');
    (this._pz?.paredes || []).forEach((p, i) => reg(p, `pz.parede[${i}]`));
    reg(this._pz?.fundoParede, 'pz.fundoParede');
    (this._pz?.decos     || []).forEach(({ img, n }) => reg(img, `cl_${n}`));
    (this.campoDecos     || []).forEach(({ img }, i) => reg(img, `campo_${i}`));
    (this.transicaoDecos || []).forEach(({ img }, i) => reg(img, `trans_${i}`));
    (this.limiarDecos    || []).forEach(({ img }, i) => reg(img, `limiar_${i}`));
    (this.jardimDecos    || []).forEach(({ img }, i) => reg(img, `jardim_${i}`));
    reg(this.placaCampo,  'placa.campo');
    reg(this.placaLimiar, 'placa.limiar');

    // Global drag handlers (more reliable than per-object events)
    this._dbDragStartFn = (ptr, obj) => {
      this._dbSelected = obj;
      window.debugPanel?._selectObject(obj);
    };
    this._dbDragFn = (ptr, obj, dragX, dragY) => {
      obj.setPosition(dragX, dragY);
      window.debugPanel?._onObjectMoved(obj);
    };
    this.input.on('dragstart', this._dbDragStartFn);
    this.input.on('drag',      this._dbDragFn);

    // Scroll wheel → resize selected object proportionally
    // Phaser wheel event: (pointer, gameObjects[], deltaX, deltaY, deltaZ)
    this._dbWheelFn = (ptr, _gameObjs, _deltaX, deltaY) => {
      const img = this._dbSelected;
      if (!img?.active) return;
      const delta = deltaY > 0 ? -8 : 8;
      const newW  = Math.max(10, (img.displayWidth  || 80) + delta);
      const ratio = (img.displayHeight || 80) / Math.max(1, img.displayWidth || 80);
      img.setDisplaySize(newW, newW * ratio);
      window.debugPanel?._onObjectMoved(img);
    };
    this.input.on('wheel', this._dbWheelFn);

    // Selection outline updated every frame
    this._dbUpdateEvt = () => this._drawDebugSelection();
    this.events.on('postupdate', this._dbUpdateEvt);
  }

  _drawDebugSelection() {
    const g = this._dbSelGfx;
    if (!g?.active) return;
    g.clear();
    const img = this._dbSelected;
    if (!img?.active) return;
    try {
      const b = img.getBounds();
      g.lineStyle(2, 0x00ff88, 1);
      g.strokeRect(b.x, b.y, b.width, b.height);
      g.lineStyle(1, 0x00ff88, 0.5);
      g.strokeCircle(img.x, img.y, 8);
    } catch (_) {}
  }

  _disableDebugMode() {
    this._dbFrozen = false;
    // Resume camera follow (lerp matches create() setup)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.events.off('postupdate', this._dbUpdateEvt);
    this._dbSelGfx?.destroy();       this._dbSelGfx = null;
    this._dbBoundaryGfx?.destroy();  this._dbBoundaryGfx = null;
    (this._dbZoneLabels || []).forEach(l => l?.destroy());
    this._dbZoneLabels = [];
    this._dbSelected = null;

    if (this._dbDragStartFn) { this.input.off('dragstart', this._dbDragStartFn); this._dbDragStartFn = null; }
    if (this._dbDragFn)      { this.input.off('drag',      this._dbDragFn);      this._dbDragFn      = null; }
    if (this._dbWheelFn)     { this.input.off('wheel',     this._dbWheelFn);     this._dbWheelFn     = null; }

    (this._dbObjs || []).forEach(obj => {
      if (!obj?.active) return;
      obj.disableInteractive();
    });
    this._dbObjs = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Zone-unlock full-screen transition
  // ─────────────────────────────────────────────────────────────────────────
  _showZoneUnlockTransition(zoneName) {
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const overlay = this.add.graphics().setScrollFactor(0).setDepth(200);
    overlay.fillStyle(0x000000, 0);
    overlay.fillRect(0, 0, W, H);

    const bg = this.textures.exists('z1_bg_trans')
      ? this.add.image(W / 2, H / 2, 'z1_bg_trans')
          .setDisplaySize(W, H).setScrollFactor(0).setDepth(199).setAlpha(0)
      : null;

    const label = this.add.text(W / 2, H / 2, `Nova área desbloqueada\n${zoneName}`, {
      fontSize: '22px', fontFamily: 'Georgia, serif',
      color: '#f0f8e0', stroke: '#000000', strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setAlpha(0);

    const objs = [overlay, label, ...(bg ? [bg] : [])];

    this.tweens.add({
      targets: [overlay, ...(bg ? [bg] : [])],
      alpha: 1,
      duration: 600,
      onComplete: () => {
        this.tweens.add({ targets: label, alpha: 1, duration: 400 });
        this.time.delayedCall(2400, () => {
          this.tweens.add({
            targets: objs, alpha: 0, duration: 700,
            onComplete: () => objs.forEach(o => o.destroy()),
          });
        });
      },
    });
  }

  shutdown() {
    this.game.events.off('plantStolen', this._onPlantStolen, this);
    this._ladrao?.destroy();
    this._ladrao = null;
  }
}
