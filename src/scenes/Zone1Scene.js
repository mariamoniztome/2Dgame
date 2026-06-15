import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, PLAYER_INTERACTION_RADIUS } from '../config.js';
import { GameState } from '../GameState.js';
import { PLANTS } from '../data/plants.js';
import { SPELLS } from '../data/spells.js';
import { Player } from '../objects/Player.js';
import { Plant } from '../objects/Plant.js';
import { Portal } from '../objects/Portal.js';
import { SoundManager } from '../SoundManager.js';
import { MusicManager } from '../MusicManager.js';

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
  transicao:       { label: ''                       },  // no banner for passage zones
  paredeZone:      { label: ''                       },
  limiarSecreto:   { label: 'Limiar Secreto'         },
  jardimInvertido: { label: 'Jardim Invertido'       },
};

// Trepadeira is a collectible plant inside the Transição zone.
// Collecting it opens the Parede zone (boundary at y=-TH lifts).
const VINE_X = 640;  // kept for AI guidance target

const PLANT_SPAWNS = [
  // { id: 'ventoinha',  x: 92,   y: 1007 },   // campo
  { id: 'ventoinha',  x: 1267, y: 920  },   // campo
  // { id: 'gotateia',   x: 2220, y: 320  },   // jardim
  { id: 'gotateia',   x: 3521, y: 706  },   // jardim
];
// Transição plants (yOff = depth from y=0, so y = -yOff).
// Trepadeira is placed near the top of the transição zone, just below the parede.
const TRANSICAO_PLANT_SPAWNS = [
  { id: 'trepadeira', x: 499, y: -497 },
];
// Limiar plants (absolute world coordinates)
const LIMIAR_PLANT_SPAWNS = [
  { id: 'farfalha', x: 1838, y: -2157 },
  // { id: 'farfalha', x:  358, y: -2207 },
];

// Alternative positions used when respawning a stolen plant (different from original spawn).
// mapXp/mapYp are fractional coords on the MapScene image (matching DECO_ICONS format).
const PLANT_RESPAWN_SPAWNS = {
  ventoinha:  [
    { x:   92, y: 1007, mapXp: 0.05, mapYp: 0.88 },
    { x:  450, y:  620, mapXp: 0.08, mapYp: 0.80 },
    { x: 1650, y:  310, mapXp: 0.16, mapYp: 0.72 },
  ],
  gotateia:   [
    { x: 2220, y:  320, mapXp: 0.36, mapYp: 0.77 },
    { x: 2700, y:  820, mapXp: 0.43, mapYp: 0.90 },
    { x: 3150, y:  420, mapXp: 0.49, mapYp: 0.81 },
  ],
  trepadeira: [
    { x:  900, y: -200, mapXp: 0.10, mapYp: 0.56 },
    { x: 1380, y: -360, mapXp: 0.14, mapYp: 0.53 },
  ],
  farfalha:   [
    { x:  400, y: -1820, mapXp: 0.07, mapYp: 0.16 },
    { x: 1150, y: -1620, mapXp: 0.11, mapYp: 0.19 },
  ],
};

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
    if (this._placaLimiarX    === undefined) this._placaLimiarX    = 936;
    if (this._placaLimiarYOff === undefined) this._placaLimiarYOff = 981;
    if (this._placaLimiarSize === undefined) this._placaLimiarSize = 174;
    if (this._placaJardimX    === undefined) this._placaJardimX    = 2880;
    if (this._placaJardimY    === undefined) this._placaJardimY    = 450;
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

    // Register bruxinha directional animations (only if frames are loaded)
    ['front','back','right','left'].forEach(dir => {
      if (!this.anims.exists(`idle_${dir}`) &&
          this.textures.exists(`player_${dir}_1`) &&
          this.textures.exists(`player_${dir}_2`)) {
        this.anims.create({
          key: `idle_${dir}`,
          frames: [{ key: `player_${dir}_1` }, { key: `player_${dir}_2` }],
          frameRate: 4,
          repeat: -1,
        });
      }
    });
    if (this.anims.exists('idle_front')) this.player.play('idle_front');

    this._buildPlants();
    GameState.plantSpawns = [
      ...PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y })),
      ...TRANSICAO_PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y })),
      ...LIMIAR_PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y })),
    ];
    this._buildPortal();
    this._buildFireflies();
    this._buildGuideFireflies();
    this._buildVisionBlockers();
    // this._buildLimiarFog();

    const ph1 = this.player.displayHeight;
    this.playerShadow = this.add.ellipse(
      this.player.x, this.player.y + Math.round(ph1 * 0.24),
      Math.round(ph1 * 0.16), Math.max(4, Math.round(ph1 * 0.038)),
      0x000000, 0.28
    ).setDepth(4);

    // Dead-zone walls: block horizontal entry into top-right dead zone (x>_zoneW, y<0)
    // _wallH blocks upward movement past y=0 while in the right column (x>_zoneW)
    const _wallH = this.add.rectangle(this._zoneW + this._zoneW / 2, -2, this._zoneW, 6).setAlpha(0);
    this.physics.add.existing(_wallH, true);
    this.physics.add.collider(this.player, _wallH);
    // Note: rightward blocking when y<0 is handled by the soft guard in update()
    // so we do NOT place a _wallV here — it conflicts with the guard and traps the player.

    // Camera — start bounded to the area selected from the map
    this.cameras.main.setZoom(2.0);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.time.delayedCall(50, () => {
      this.cameras.main.setLerp(0.12, 0.12);
      this._applyCameraBounds(startArea);
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

    // First time entering a zone: block input immediately, show controls as soon as HUD is ready
    if (this.game.registry.get('firstZoneEntry')) {
      this.game.registry.remove('firstZoneEntry');
      this._waitingForFirstControls = true;
      const doShow = () => {
        this._waitingForFirstControls = false;
        this.scene.get('HUD')?._showControls();
      };
      const hud = this.scene.get('HUD');
      if (hud?.sys.isActive()) doShow();
      else hud.events.once('create', doShow);
    }

    this._nearPlant      = null;
    this._nearPortal     = false;
    this._hoveredPlant   = null;
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
    this._revealActive        = false;
    this._tutorialDismiss     = null;
    this._jardimHintShown     = false;
    this._ladrao              = null;
    this._ladraoStole         = false;
    this._ladraoChaseTimer    = 0;
    this._tutorialShown       = false;
    this._sprintTrailTimer    = 0;
    this._limiarFogActive     = false;
    // First appearance: 20s in (player needs time to collect at least one plant)
    this.time.delayedCall(20000, () => this._scheduleLadrao());

    MusicManager.init(this);
    this.time.delayedCall(200, () => MusicManager.playArea('campoVagalumes'));

    this.time.delayedCall(900, () => {
      this._emitNarrative('As plantas brilham de noite. Segue o brilho.');
    });

    this.game.events.on('plantStolen', this._onPlantStolen, this);
    this.input.on('pointerup', this._onPointerUp, this);

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
    g.fillStyle(0x37533a, 1); g.fillRect(0, -(ZH + TH + PH), ZW, ZH);

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
      const ls = this._placaLimiarSize * gm;
      this.placaLimiar = this.add.image(lx, ly, 'z1_placa_limiar')
        .setDisplaySize(ls, ls).setDepth(4);
    }
    if (this.textures.exists('z1_placa_jardim')) {
      this.placaJardim = this.add.image(this._placaJardimX, this._placaJardimY, 'z1_placa_jardim')
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
      this._tz.caminho = this.add.image(994, -273, 'z1_caminho')
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
    // if (this.textures.exists('z1_fundo_parede')) {
    //   this._pz.fundoParede = this.add.image(887, -141, 'z1_fundo_parede')
    //     .setOrigin(0.5, 1).setDisplaySize(2077, 1433)
    //     .setDepth(1).setAlpha(0.55);
    // }

    // ── 2. Main plant wall (ParedãodePlantas) — tiled 3× horizontally ───────
    // Each tile: w=ZW/3, h=(ZW/3)*(1735/1920). Three tiles fill the full width
    // and keep height ≈ PH instead of one oversized image.
    this._pz.paredes = [];
    if (this.textures.exists('z1_parede')) {
      [[256, -463, 984, 817], [994, -460, 984, 816], [1882, -454, 912, 824]].forEach(([tx, ty, tw, th]) => {
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
      ['14', 1220,  -459,  26,  26, 6, 0.90],
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
      [1800, 975,  324],
      [839,  131,  175],
      [1741, 151,  190],
      [632,  293,  180],
      [266,  125,  240],
      [1213, 767,  80],
      [647,   84,  155],
      [718,  1027, 145],
      [911,  244,  25],
      [1093, 101,  65],
      [96,   426,  280],
      [385,  897,  170],
      [350,  340,  245],
      [864,  323,  120],
      [1304, 426,  205],
      [1458, 122,  255],
      [537,  516,  80],
      [975,  755,  50],
      [1516, 358,  205],
      [1494, 644,  230],
      [1215, 107,  240],
      [985,  520,  170],
      [168,  838,  215],
      [981,  980,  215],
      [351,  653,  235],
      [681,  639,  260],
      [218,  1062, 140],
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
        [ 235, -491,  45], [1876, -353,  54], [1436, -363, 286],
        [1424,  988,  83], [ 279, -262,  50], [ 999, -216,  47],
        [ 672,  -48, 112], [1853, -406,  85], [ 819, -443,  57],
        [ 938, -443,  34], [1571, -224,  83], [1107, -344, 526],
        [ 750, -396, 551], [1043,  -57, 128], [1688, -368, 270],
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
    const jardimNums = ['02','03','04','05','06','07','08','09','10','12','13','14','15','16','18','19','20'];
    const jk = jardimNums.filter(n => this.textures.exists(`z1_jardim_${n}`))
                         .map(n => `z1_jardim_${n}`);
    const jardimKeys = jk.length > 0 ? jk : ck;  // fall back to campo keys if jardim not loaded

    if (jardimKeys.length > 0) {
      const JARDIM_POS = [
        [2312, 921, 264], [2047, 136, 237], [2300, 490,  71], [2945, 144, 268], [3561, 180, 319], [3410, 501, 366],
        [1931, 295,  45], [2815, 633, 306], [3007, 550, 134], [3381, 950, 283], [3729, 527, 316], [3735,  88, 135],
        [2055, 515, 313], [2599, 305, 282], [2344, 156, 367], [2705,  90,  84], [3021, 384, 154], [3220, 621, 290],
        [3781, 268, 168], [2510, 868,  92], [2522, 674, 230], [3133, 805, 266], [3241, 176, 322], [3715, 743, 140],
        [2045, 886, 298], [2314, 680, 160], [2717, 920, 334], [2975, 997, 190], [2815, 293,  92], [3701, 950, 268],
      ];
      JARDIM_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, jardimKeys[i % jardimKeys.length])
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
        [ 183, -2118, 278], [ 532, -2148, 310], [ 726, -2246, 135], [1133, -2156, 266], [1379, -2246, 120], [1751, -2246,  40],
        [1328, -1500, 354], [ 612, -1705, 100], [1552, -2197, 452], [1320, -1764, 118], [1586, -1950, 126], [1748, -2078, 190],
        [  88, -1560, 100], [ 255, -1784, 256], [ 844, -1938, 306], [1085, -1836, 214], [1338, -2012, 258], [1751, -1857, 130],
        [ 101, -1320,  48], [ 445, -1619, 132], [ 858, -1588, 278], [1330, -1322, 122], [1825, -1667, 202], [1533, -1590, 290],
        [ 403, -1386, 240], [ 533, -1900, 109], [ 603, -1340,  57], [1039, -1486,  96], [1229, -1575, 216], [1702, -1370, 246],
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
    LIMIAR_PLANT_SPAWNS.forEach(({ id, x, y }) => {
      if (GameState.collected.has(id)) return;
      const plantData = PLANTS[id];
      if (!plantData) return;
      this.plants.push(new Plant(this, x, y, plantData));
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
    if (this._dbFrozen) return;
    if (this._cutscene) return;
    if (this._waitingForFirstControls) return;
    this.player.update(this.cursors, this.wasd, this.keyShift, delta);

    // ── Hard boundary: cannot enter Parede/Limiar until vine is collected ─
    if (!this._vineClimbed && this.player.y < -this._transH + 2) {
      this.player.setY(-this._transH + 2);
      if (this.player.body) this.player.body.velocity.y = 0;
    }

    // ── Hard boundary: limiar → dead zone (right wall at x=_zoneW) ───────
    // In Limiar (y<0) the player must NOT cross into the top-right quadrant.
    // Only kill rightward velocity so the player can still escape left.
    if (this.player.y < 0 && this.player.x >= this._zoneW - 2) {
      this.player.setX(this._zoneW - 2);
      if (this.player.body && this.player.body.velocity.x > 0) {
        this.player.body.velocity.x = 0;
      }
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

    // Show tutorial on first movement (not on a blind timer)
    if (!this._tutorialShown && this.player.recentSpeed > 20) {
      this._tutorialShown = true;
      this.time.delayedCall(400, () => this._showTutorial());
    }

    // Sprint particle trail
    if (this.keyShift.isDown && this.player.recentSpeed > 80) {
      this._sprintTrailTimer += delta;
      if (this._sprintTrailTimer > 75) {
        this._sprintTrailTimer = 0;
        const t = this.add.circle(this.player.x, this.player.y, 5, 0xd4a8f0, 0.40).setDepth(9);
        this.tweens.add({ targets: t, alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 350,
          onComplete: () => t.destroy() });
      }
    } else {
      this._sprintTrailTimer = 0;
    }

    this._checkAreaChange();
    this._checkPlantProximity(time, delta);
    this._checkPlantHover();
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateHints(delta);
    this._updateFootsteps(delta);
    this._checkZoneUnlocks();
    this._updateLadrao(delta);
    // this._updateLimiarFog();

    if (this._spellCooldown > 0) this._spellCooldown -= delta;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Mouse hover — show border ring on plant under pointer (world-coordinate based)
  // ─────────────────────────────────────────────────────────────────────────
  _checkPlantHover() {
    if (this._dbFrozen || this._cutscene) return;
    const ptr = this.input.activePointer;
    const wx = ptr.worldX, wy = ptr.worldY;

    let found = null;
    for (const plant of this.plants) {
      if (plant.isCollected || !plant.isVisible || !plant.active) continue;
      if (Phaser.Math.Distance.Between(wx, wy, plant.x, plant.y) < 44) { found = plant; break; }
    }

    if (found !== this._hoveredPlant) {
      if (this._hoveredPlant) this._hoveredPlant.setHovered(false);
      if (found) found.setHovered(true);
      this._hoveredPlant = found;
      this.game.canvas.style.cursor = found ? 'pointer' : '';
    }
  }

  _onPointerUp(pointer) {
    if (this._dbFrozen || this._cutscene) return;
    if (Math.abs(pointer.upX - pointer.downX) > 8 || Math.abs(pointer.upY - pointer.downY) > 8) return;
    const hud = this.scene.get('HUD');
    if (hud?._plantModal) return;
    const plant = this.plants?.find(p =>
      !p.isCollected && p.isVisible && p.active &&
      Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, p.x, p.y) < 44
    );
    if (plant) this.game.events.emit('plantInspect', plant.plantData);
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
      GameState.currentArea = area;
      const areaLabel = AREAS[area].label;
      if (areaLabel) this.game.events.emit('areaChanged', areaLabel);
      MusicManager.playArea(area);

      // Canvas background matches the current area (jardim has its own colour)
      const BG = area === 'jardimInvertido' ? '#6d8469' : area === 'limiarSecreto' ? '#37533a' : '#afd6a8';
      this.cameras.main.setBackgroundColor(BG);
      document.body.style.background = BG;

      // Vagalume emitter only active in campo
      if (area === 'campoVagalumes') {
        this.campoEmitter?.resume();
      } else if (prev === 'campoVagalumes') {
        this.campoEmitter?.pause();
      }

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
        // Subtle lavender flash on vertical zone crossings (not on first entry)
        if (prev !== '') this._flashAreaTransition();
      }

      // Mark jardim as visited (unlocks it on the map)
      if (area === 'jardimInvertido' && !GameState.visitedJardim) {
        GameState.visitedJardim = true;
      }

      // ── Jardim Invertido: invert Y axis only (up ↔ down) ────────────────
      if (area === 'jardimInvertido') {
        this.player.invertX = false;
        this.player.invertY = true;
        this.time.delayedCall(600, () => {
          this._emitNarrative('O Jardim Invertido confunde os sentidos… Cima é baixo aqui!', 4000);
        });
      }
      // Reset inversion when leaving Jardim Invertido
      if (prev === 'jardimInvertido') {
        this.player.invertX = false;
        this.player.invertY = false;
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
    const PAD = 50;
    if (area === 'jardimInvertido') {
      this.cameras.main.setBounds(ZW, 0, ZW, ZH);
    } else {
      const TH = this._transH, PH = this._paredeH;
      this.cameras.main.setBounds(0, -(ZH + TH + PH) - PAD, ZW, ZH * 2 + TH + PH + PAD * 2);
    }
  }

  _flashAreaTransition() {
    const cam = this.cameras.main;
    const flash = this.add.rectangle(
      cam.scrollX + cam.width  / 2,
      cam.scrollY + cam.height / 2,
      cam.width, cam.height,
      0xd4a8f0, 0.10
    ).setDepth(500).setScrollFactor(0);
    this.tweens.add({ targets: flash, alpha: 0, duration: 500,
      onComplete: () => flash.destroy() });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Proximity
  // ─────────────────────────────────────────────────────────────────────────
  // Per-method narrative hints shown once on first approach
  static _METHOD_HINTS = {
    fast:  'Esta planta foge dos lentos — corre para a apanhar!',
    shake: 'Parece que está a tremer… carrega C várias vezes.',
    slow:  'Esta planta prefere calma — anda mais devagar.',
    brave: 'Uma presença intensa. Fica perto sem recuar.',
    climb: 'A trepadeira leva-te mais alto. [C]',
    spell: 'Esta planta está protegida por magia.',
  };

  _checkPlantProximity(time, delta) {
    this._nearPlant = null;
    let foundNear = false;

    this.plants.forEach(plant => {
      if (plant.isCollected || !plant.isVisible) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, plant.x, plant.y);
      const inRange = dist < PLAYER_INTERACTION_RADIUS;
      const method  = plant.plantData.collectMethod;

      // First-approach method hint (fires once per plant)
      if (inRange && !plant._methodHintShown && method !== 'interact') {
        plant._methodHintShown = true;
        const txt = Zone1Scene._METHOD_HINTS[method];
        if (txt) this.time.delayedCall(350, () => this._emitNarrative(txt, 4000));
      }

      if (inRange && method === 'fast') {
        if (this.player.recentSpeed >= 120) {
          plant.showHint(true, 'C');
        } else {
          plant.showHint(true, 'Corre!');
        }
      } else {
        plant.showHint(inRange);
      }

      if (!inRange) { this._ventoinhaSlowTimers.delete(plant); return; }
      this._nearPlant = plant;
      foundNear = true;

      if (method === 'fast') {
        if (this.player.recentSpeed >= 120) {
          this._ventoinhaSlowTimers.delete(plant);
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

      if (method === 'brave' || method === 'slow') {
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
    // Glow pulse accelerates as player approaches (0=200px away, 1=contact)
    const prox = Phaser.Math.Clamp(1 - (dist / 200), 0, 1);
    this.portal.setProximity(prox);
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

    if (method === 'fast') {
      if (this.player.recentSpeed >= 120) {
        this._collectPlant(plant);
      } else {
        this._emitNarrative('Corre para apanhar a Ventoinha!');
      }
      return;
    }

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
      if (plant._spellHit) {
        this._collectPlant(plant);
      } else if (GameState.activeSpell === 'brisa_molhada') {
        this._emitNarrative('Lança a Humidaris primeiro! (F)');
      } else if (GameState.availableSpells.includes('brisa_molhada')) {
        this._emitNarrative('Activa a Humidaris (Q) e lança com F, depois apanha com C.');
      } else {
        this._emitNarrative('Esta planta está protegida. Precisas de um feitiço especial…');
      }
      return;
    }

    if (method === 'climb') { this._climbVine(); this._collectPlant(plant); return; }

    if (method === 'interact') { this._collectPlant(plant); return; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Trepadeira — collecting it opens the Parede zone (boundary lifts)
  // ─────────────────────────────────────────────────────────────────────────
  _climbVine() {
    if (this._vineClimbed) return;
    this._vineClimbed = true;

    this._emitNarrative('A trepadeira abre o caminho para o Limiar Secreto!');
    this.portal.unlock();

    if (!GameState.discoveredPortals.has('zone1_limiar')) {
      GameState.discoverPortal('zone1_limiar');
    }

    this._playVineClimbCinematic();
  }

  _playVineClimbCinematic() {
    const TH = this._transH, PH = this._paredeH;
    const cam = this.cameras.main;
    this._cutscene = true;
    cam.stopFollow();

    // Reveal the parede: pan up to its top, pause, then return to player
    const px = this.player.x;
    const peakY = -(TH + PH * 0.85);

    cam.pan(px, peakY, 2200, 'Sine.easeInOut', false, (_c, progress) => {
      if (progress < 1) return;
      this.time.delayedCall(700, () => {
        cam.pan(px, this.player.y, 1200, 'Sine.easeInOut', false, (_c2, p2) => {
          if (p2 < 1) return;
          cam.startFollow(this.player, true, 1, 1);
          cam.setLerp(0.12, 0.12);
          this._cutscene = false;
        });
      });
    });
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
      if (this._nearPlant?.plantData?.collectMethod === 'spell') {
        this._nearPlant._spellHit = true;
        this._emitNarrative('A Humidaris atingiu a Farfalha! Apanha-a com C.', 2500);
      } else {
        this._emitNarrative('A Humidaris envolve o ar…');
      }
    }
    if (GameState.activeSpell === 'canto_jardim') { this._revealAllPlants(); return; }

    if (GameState.activeSpell === 'fogo_controlado' && this._ladrao?.active) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this._ladrao.x, this._ladrao.y
      );
      if (dist < 380) {
        const ang = Math.atan2(this._ladrao.y - this.player.y, this._ladrao.x - this.player.x);
        this.tweens.add({
          targets: this._ladrao,
          x: this._ladrao.x + Math.cos(ang) * 500,
          y: this._ladrao.y + Math.sin(ang) * 200,
          alpha: 0, duration: 1200,
          onComplete: () => this._despawnLadrao(false),
        });
        this._emitNarrative('O Ignicura afugentou o Sussurro!', 2500);
        return;
      }
      this._emitNarrative('O Sussurro está longe demais para o Ignicura alcançar!', 2000);
    }
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
    if (this._revealActive) { this._emitNarrative('A visão já está activa!', 1500); return; }
    this._revealActive = true;

    const cam = this.cameras.main;
    cam.stopFollow();
    this.tweens.add({
      targets: cam, zoom: 0.33,
      duration: 1200, ease: 'Sine.easeInOut',
      onComplete: () => cam.pan(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 800, 'Sine.easeInOut'),
    });

    const markers = [];
    this.plants.forEach(p => {
      if (p.isCollected) return;
      const m = this.add.circle(p.x, p.y, 18, 0x66ff88, 0.8).setDepth(50);
      this.tweens.add({ targets: m, alpha: { from: 0.4, to: 1.0 }, duration: 700, yoyo: true, repeat: -1 });
      markers.push(m);
    });

    this.time.delayedCall(30000, () => {
      this._revealActive = false;
      if (!this.scene.isActive('Zone1')) return;
      markers.forEach(m => m.destroy());
      this.tweens.add({
        targets: cam, zoom: 2.0,
        duration: 1200, ease: 'Sine.easeInOut',
        onComplete: () => { cam.startFollow(this.player, true, 1, 1); cam.setLerp(0.12, 0.12); },
      });
    });

    this._emitNarrative('O Horticantus revelou onde estão as plantas! (30 segundos)', 5000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Plant collection
  // ─────────────────────────────────────────────────────────────────────────
  _collectPlant(plant) {
    if (plant.isCollected) return;
    if (this._hoveredPlant === plant) {
      this._hoveredPlant = null;
      this.game.canvas.style.cursor = '';
    }
    const data = plant.plantData;
    if (!GameState.addPlant(data)) {
      this._emitNarrative('A mochila está cheia! Tens 14 plantas.');
      return;
    }
    plant.collect();
    this.cameras.main.shake(120, 0.003);
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
      // this.time.delayedCall(3500, () => {
      //   this._emitNarrative('Um novo caminho abriu-se. A Zona 2 está acessível pelo portal!');
      // });
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
    MusicManager.stop();
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

    if (GameState.spellJustLost) {
      const lostSpellName = SPELLS[GameState.spellJustLost]?.name;
      GameState.spellJustLost = null;
      if (lostSpellName) {
        this.time.delayedCall(5500, () =>
          this._emitNarrative(`O feitiço ${lostSpellName} já não está disponível.`, 3500)
        );
      }
    }

    const plantData = PLANTS[plant.id];
    if (!plantData) return;

    // Pick a random alternative spawn position so the plant reappears somewhere new.
    // Filter out positions that overlap with decorative elements (min 80px clearance).
    const respawnOptions = PLANT_RESPAWN_SPAWNS[plant.id];
    if (!respawnOptions?.length) return;

    const decoPositions = [
      ...this.campoDecos,
      ...this.transicaoDecos,
      ...this.jardimDecos,
      ...this.limiarDecos,
    ].map(d => ({ x: d.img.x, y: d.img.y }));

    const MIN_DECO_DIST = 80;
    const clearOptions = respawnOptions.filter(opt =>
      !decoPositions.some(d =>
        Phaser.Math.Distance.Between(opt.x, opt.y, d.x, d.y) < MIN_DECO_DIST
      )
    );
    const pool = clearOptions.length > 0 ? clearOptions : respawnOptions;
    const spawn = pool[Math.floor(Math.random() * pool.length)];

    // Update map icon position so the MapScene shows the new location
    if (spawn.mapXp !== undefined) {
      GameState.plantMapPositions[plant.id] = { xp: spawn.mapXp, yp: spawn.mapYp };
    }

    this.time.delayedCall(15000, () => {
      if (GameState.collected.has(plant.id)) return;
      const newPlant = new Plant(this, spawn.x, spawn.y, plantData);
      this.plants.push(newPlant);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Tutorial overlay
  // ─────────────────────────────────────────────────────────────────────────
  _showTutorial() {
    const W = 420, H = 148, sx = 24, sy = 24;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(60);
    bg.fillStyle(0x061006, 0.90);
    bg.fillRoundedRect(sx, sy, W, H, 12);
    bg.lineStyle(1.5, 0x7bc67e, 0.7);
    bg.strokeRoundedRect(sx, sy, W, H, 12);

    const goal = this.add.text(sx + 16, sy + 12,
      'Recolhe plantas mágicas para desbloquear novos caminhos.',
      { fontSize: '12px', fontFamily: "'Red Hat Text', sans-serif", color: '#d4f0c0',
        wordWrap: { width: W - 32 } }
    ).setScrollFactor(0).setDepth(61);

    const hint = this.add.text(sx + 16, sy + 38,
      'Aproxima-te de uma planta brilhante e carrega  C  para a apanhar.',
      { fontSize: '11px', fontFamily: "'Red Hat Text', sans-serif", color: '#a8d890',
        wordWrap: { width: W - 32 } }
    ).setScrollFactor(0).setDepth(61);

    // divider
    const div = this.add.graphics().setScrollFactor(0).setDepth(61);
    div.lineStyle(1, 0x3a6a3a, 0.6);
    div.lineBetween(sx + 16, sy + 75, sx + W - 16, sy + 75);

    const keys = this.add.text(sx + 16, sy + 84,
      'Mover: WASD / ←↑↓→   Correr: Shift\nInteragir: C   Mapa: M   Feitiço: Q+F',
      { fontSize: '11px', fontFamily: 'monospace', color: '#7ab870', lineSpacing: 4 }
    ).setScrollFactor(0).setDepth(61);

    const dismiss_hint = this.add.text(sx + W - 16, sy + H - 12,
      'move para fechar',
      { fontSize: '9px', fontFamily: "'Red Hat Text', sans-serif", color: '#456a45' }
    ).setOrigin(1, 1).setScrollFactor(0).setDepth(61);

    const objs = [bg, goal, hint, div, keys, dismiss_hint];
    const dismiss = () => {
      if (!bg.active) return;
      this.tweens.add({
        targets: objs, alpha: 0, duration: 600,
        onComplete: () => objs.forEach(o => o.destroy()),
      });
      this._tutorialDismiss = null;
    };
    this._tutorialDismiss = dismiss;
    this.time.delayedCall(9000, () => dismiss());
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
      // First play: guide after 8s so player knows where plants are
      const baseDelay = GameState.inventory.length === 0 ? 8000 : 25000;
      this.time.delayedCall(baseDelay + i * 1200, () => this._animateGuideFF(ff));
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
    // Guide fireflies only appear in campo dos vagalumes
    if (this.player.x >= this._zoneW || this.player.y < 0) {
      this.time.delayedCall(3000, () => ff.active && this._animateGuideFF(ff));
      return;
    }
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
    const stealable = GameState.inventory.filter(p => !p.isFake && !p.essential);
    if (stealable.length === 0) {
      this.time.delayedCall(8000, () => this._scheduleLadrao());
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

    if (GameState.inventory.length === 0) { this._despawnLadrao(false); return; }

    const dist = Phaser.Math.Distance.Between(
      this._ladrao.x, this._ladrao.y, this.player.x, this.player.y
    );

    // Give-up: if the player stays >280px away for 10s, the Sussurro retreats and returns soon
    if (dist > 280) {
      this._ladraoChaseTimer += delta;
      if (this._ladraoChaseTimer >= 10000) {
        this._emitNarrative('O Sussurro recuou… mas voltará.', 2000);
        this.tweens.add({
          targets: this._ladrao, alpha: 0, duration: 800,
          onComplete: () => this._despawnLadrao(false),
        });
        this._ladraoChaseTimer = 0;
        return;
      }
    } else {
      this._ladraoChaseTimer = 0;
    }

    // Speed: faster base so running doesn't trivially outpace it
    const spd = dist < 180 ? 90 : 62;
    const ang = Math.atan2(
      this.player.y - this._ladrao.y,
      this.player.x - this._ladrao.x
    );
    this._ladrao.x += Math.cos(ang) * spd * (delta / 1000);
    this._ladrao.y += Math.sin(ang) * spd * (delta / 1000);
    this._ladrao.setFlipX(Math.cos(ang) < 0);

    if (dist < 180) {
      this._ladrao.setAlpha(0.65 + Math.sin(Date.now() * 0.01) * 0.3);
    }

    if (dist < 50) {
      this._ladraoStole = true;
      const stolen = GameState.stealLastPlant();
      if (stolen) this.game.events.emit('plantStolen', stolen);

      const fleeAng = ang + Math.PI;
      this.tweens.add({
        targets: this._ladrao,
        x: this._ladrao.x + Math.cos(fleeAng) * 480,
        y: this._ladrao.y + Math.sin(fleeAng) * 200,
        alpha: 0, duration: 1800, ease: 'Power2.easeIn',
        onComplete: () => this._despawnLadrao(true),
      });
    }
  }

  _despawnLadrao(stole) {
    this._ladrao?.destroy();
    this._ladrao = null;
    this._ladraoChaseTimer = 0;
    // Gave up → returns sooner (8-14s); stole → longer cooldown (35-55s)
    const delay = stole
      ? Phaser.Math.Between(35000, 55000)
      : Phaser.Math.Between(8000, 14000);
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
      fontSize: '13px', fontFamily: "'Red Hat Text', sans-serif",
      color: '#3a2000', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(71);
    const pistaT = this.add.text(sx + pad, sy + 33, plantData.narrativeText || '', {
      fontSize: '10px', fontFamily: "'Red Hat Text', sans-serif",
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

    // DELETE or X key → remove the currently selected object
    this._dbDeleteFn = () => this._dbDeleteSelected();
    const kDel = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DELETE);
    const kX   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    kDel.on('down', this._dbDeleteFn);
    kX.on('down',   this._dbDeleteFn);
    this._dbDeleteKeys = [kDel, kX];

    // ── Overlay layers: grid, spawns, zone fills, portal ─────────────────
    this._dbGrid      = this._drawDebugGrid();
    this._dbSpawnObjs = this._drawDebugSpawns();
    this._dbZoneFills = this._drawDebugZoneFills();
    this.portal?.showDebug(true);

    // G / S / Z toggle individual layers
    const kG = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    const kS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    const kZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    kG.on('down', () => { this._dbGrid?.setVisible(!this._dbGrid.visible); });
    kS.on('down', () => {
      const v = !(this._dbSpawnObjs?.[0]?.visible ?? true);
      this._dbSpawnObjs?.forEach(o => o?.setVisible(v));
    });
    kZ.on('down', () => { this._dbZoneFills?.setVisible(!this._dbZoneFills.visible); });
    this._dbDeleteKeys.push(kG, kS, kZ);
  }

  _drawDebugGrid() {
    const ZW = this._zoneW, ZH = this._zoneH;
    const TH = this._transH, PH = this._paredeH;
    const TOTAL_H = ZH + TH + PH + ZH;
    const step = 256;
    const g = this.add.graphics().setDepth(996);
    g.lineStyle(1, 0x334455, 0.35);
    for (let x = 0; x <= ZW * 2; x += step) g.lineBetween(x, -TOTAL_H, x, ZH);
    for (let y = -TOTAL_H; y <= ZH; y += step) g.lineBetween(0, y, ZW * 2, y);
    // Ruler labels every 512px
    const ts = { fontSize: '8px', fontFamily: 'monospace', color: '#445566',
                 stroke: '#000000', strokeThickness: 1 };
    for (let x = 0; x <= ZW; x += 512) {
      this.add.text(x, ZH - 2, `${x}`, ts).setOrigin(0.5, 1).setDepth(997);
    }
    for (let y = 0; y >= -TOTAL_H; y -= 512) {
      this.add.text(4, y, `${y}`, ts).setOrigin(0, 0.5).setDepth(997);
    }
    return g;
  }

  _drawDebugSpawns() {
    const objs = [];
    const allSpawns = [
      ...PLANT_SPAWNS.map(s => ({ ...s, zone: 'campo' })),
      ...TRANSICAO_PLANT_SPAWNS.map(s => ({ ...s, zone: 'trans' })),
      ...LIMIAR_PLANT_SPAWNS.map(s => ({ ...s, zone: 'limiar' })),
    ];
    allSpawns.forEach(s => {
      const tri = this.add.triangle(s.x, s.y - 14, 0, 0, -7, -14, 7, -14, 0x00ff88, 0.9).setDepth(999);
      const lbl = this.add.text(s.x, s.y - 28, s.id, {
        fontSize: '8px', fontFamily: 'monospace',
        color: '#00ff88', stroke: '#000000', strokeThickness: 1,
      }).setOrigin(0.5, 1).setDepth(999);
      objs.push(tri, lbl);
    });
    // Player start marker
    const dot = this.add.circle(this.player.x, this.player.y, 10, 0x00ffff, 0.4).setDepth(999);
    const dotL = this.add.text(this.player.x, this.player.y - 14, 'START', {
      fontSize: '8px', fontFamily: 'monospace', color: '#00ffff', stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5, 1).setDepth(999);
    objs.push(dot, dotL);
    return objs;
  }

  _drawDebugZoneFills() {
    const ZW = this._zoneW, ZH = this._zoneH;
    const TH = this._transH, PH = this._paredeH;
    const g = this.add.graphics().setDepth(995);
    const zones = [
      { rect: [0,         0, ZW, ZH],         col: 0x7bc67e },  // campo
      { rect: [0,       -TH, ZW, TH],         col: 0xffff00 },  // transição
      { rect: [0,  -(TH+PH), ZW, PH],         col: 0xff8800 },  // parede
      { rect: [0, -(ZH+TH+PH), ZW, ZH],       col: 0xff00cc },  // limiar
      { rect: [ZW,        0, ZW, ZH],          col: 0x88ccff },  // jardim
    ];
    zones.forEach(({ rect: [x, y, w, h], col }) => {
      g.fillStyle(col, 0.06);
      g.fillRect(x, y, w, h);
    });
    return g;
  }

  _dbDeleteSelected() {
    const obj = this._dbSelected;
    if (!obj?.active) return;

    // Plant
    const pi = (this.plants || []).findIndex(p => p === obj);
    if (pi >= 0) {
      obj.destroy();
      this.plants.splice(pi, 1);
      this._dbSelected = null;
      return;
    }

    // Campo deco
    const ci = (this.campoDecos || []).findIndex(d => d.img === obj);
    if (ci >= 0) {
      obj.destroy();
      this._campoPos?.splice(ci, 1);
      this.campoDecos.splice(ci, 1);
      this._dbSelected = null;
      return;
    }

    // Transição deco
    const ti = (this.transicaoDecos || []).findIndex(d => d.img === obj);
    if (ti >= 0) {
      obj.destroy();
      this.transicaoDecos.splice(ti, 1);
      this._dbSelected = null;
      return;
    }

    // Limiar deco
    const li = (this.limiarDecos || []).findIndex(d => d.img === obj);
    if (li >= 0) {
      obj.destroy();
      this.limiarDecos.splice(li, 1);
      this._dbSelected = null;
      return;
    }

    // Jardim deco
    const ji = (this.jardimDecos || []).findIndex(d => d.img === obj);
    if (ji >= 0) {
      obj.destroy();
      this.jardimDecos.splice(ji, 1);
      this._dbSelected = null;
      return;
    }

    // Any other registered object — just hide it
    obj.setVisible(false).setActive(false);
    this._dbSelected = null;
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
    (this._dbDeleteKeys || []).forEach(k => k?.destroy());
    this._dbDeleteKeys = [];
    this._dbDeleteFn = null;

    // Overlay layers
    this._dbGrid?.destroy();      this._dbGrid = null;
    this._dbZoneFills?.destroy(); this._dbZoneFills = null;
    (this._dbSpawnObjs || []).forEach(o => o?.destroy());
    this._dbSpawnObjs = [];
    this.portal?.showDebug(false);

    (this._dbObjs || []).forEach(obj => {
      if (!obj?.active) return;
      obj.disableInteractive();
    });
    this._dbObjs = [];
    this._hoveredPlant = null;
    this.game.canvas.style.cursor = '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Zone-unlock full-screen transition
  // ─────────────────────────────────────────────────────────────────────────
  _showZoneUnlockTransition(zoneName) {
    const cam = this.cameras.main;
    const SW = cam.width, SH = cam.height;

    const overlay = this.add.graphics().setScrollFactor(0).setDepth(500).setAlpha(0);
    overlay.fillStyle(0x000000, 0.72);
    overlay.fillRect(0, 0, SW, SH);

    const label = this.add.text(SW / 2, SH / 2, `Nova área desbloqueada\n${zoneName}`, {
      fontSize: '26px', fontFamily: "'Red Hat Text', sans-serif",
      color: '#f0f8e0', stroke: '#000000', strokeThickness: 4,
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501).setAlpha(0);

    this.tweens.add({
      targets: overlay, alpha: 1, duration: 500,
      onComplete: () => {
        this.tweens.add({ targets: label, alpha: 1, duration: 350 });
        this.time.delayedCall(2600, () => {
          this.tweens.add({
            targets: [overlay, label], alpha: 0, duration: 600,
            onComplete: () => { overlay.destroy(); label.destroy(); },
          });
        });
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Limiar Secreto — fog of war (GDD: leaves cover floor, small vision radius)
  //  Uses a RenderTexture filled with dark color, with a circle erased around
  //  the player so only a small radius is visible.
  // ─────────────────────────────────────────────────────────────────────────
  // _buildLimiarFog() {
  //   const TH = this._transH, PH = this._paredeH, ZW = this._zoneW, ZH = this._zoneH;

  //   // Pre-generate circle texture for erasing (white circle = hole in fog)
  //   if (!this.textures.exists('fog_hole')) {
  //     const cg = this.add.graphics();
  //     cg.fillStyle(0xffffff, 1);
  //     cg.fillCircle(90, 90, 90);
  //     cg.generateTexture('fog_hole', 180, 180);
  //     cg.destroy();
  //   }

  //   // RenderTexture covers the full Limiar Secreto area in world space
  //   this._limiarFog = this.add.renderTexture(0, -(ZH + TH + PH), ZW, ZH)
  //     .setDepth(18)
  //     .setVisible(false);
  // }

  // _updateLimiarFog() {
  //   const inLimiar = this._currentArea === 'limiarSecreto';

  //   if (inLimiar !== this._limiarFogActive) {
  //     this._limiarFogActive = inLimiar;
  //     this._limiarFog?.setVisible(inLimiar);
  //     if (inLimiar) {
  //       this.time.delayedCall(200, () => {
  //         this._emitNarrative('As folhas cobrem tudo… só consegues ver o que está mesmo ao teu redor.', 4000);
  //       });
  //     }
  //   }

  //   if (!inLimiar || !this._limiarFog) return;

  //   const TH = this._transH, PH = this._paredeH, ZH = this._zoneH;
  //   const fogOriginY = -(ZH + TH + PH);

  //   // Redraw: fill dark, then erase circle around player
  //   this._limiarFog.clear();
  //   this._limiarFog.fill(0x1a120a, 0.88);
  //   const holeR = 90; // radius of the fog hole texture
  //   const rx = this.player.x - holeR;
  //   const ry = this.player.y - fogOriginY - holeR;
  //   this._limiarFog.erase('fog_hole', rx, ry);
  // }

  shutdown() {
    this.game.events.off('plantStolen', this._onPlantStolen, this);
    this._ladrao?.destroy();
    this._ladrao = null;
    this.game.canvas.style.cursor = '';
  }
}
