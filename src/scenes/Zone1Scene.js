import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, PLAYER_INTERACTION_RADIUS } from '../config.js';
import { GameState } from '../GameState.js';
import { PLANTS } from '../data/plants.js';
import { SPELLS } from '../data/spells.js';
import { Player } from '../objects/Player.js';
import { Plant } from '../objects/Plant.js';
import { Portal } from '../objects/Portal.js';
import { SoundManager } from '../SoundManager.js';

// Zone 1 — 1280 wide × 2160 tall, three sub-areas stacked top → bottom
const ZONE_H = 720;

const AREAS = {
  campoVagalumes:  { label: 'Campo dos Vagalumes', minY: 0,          maxY: ZONE_H     },
  jardimInvertido: { label: 'Jardim Invertido',    minY: ZONE_H,     maxY: ZONE_H * 2 },
  limiarSecreto:   { label: 'Limiar Secreto',      minY: ZONE_H * 2, maxY: ZONE_H * 3 },
};

// Vine sits at the bottom of Jardim; climbing takes player DOWN into Limiar
const VINE_X = 850;
const VINE_Y = ZONE_H * 2 - 80;      // y ≈ 1360  (last stretch of Jardim)
const VINE_CLIMB_Y = ZONE_H * 2 + 110; // y ≈ 1550  (just inside Limiar)

const PLANT_SPAWNS = [
  { id: 'ventoinha',  x: 320,  y: 200  },   // Campo (y: 0–720)
  { id: 'ventoinha',  x: 960,  y: 520  },   // Campo
  { id: 'gotateia',   x: 190,  y: 880  },   // Jardim (y: 720–1440)
  { id: 'gotateia',   x: 1060, y: 1150 },   // Jardim
  { id: 'farfalha',   x: 400,  y: 1600 },   // Limiar (y: 1440–2160)
  { id: 'farfalha',   x: 880,  y: 1850 },   // Limiar
  { id: 'trepadeira', x: VINE_X - 60, y: VINE_Y + 30 },
];

export class Zone1Scene extends Phaser.Scene {
  constructor() { super('Zone1'); }

  create() {
    GameState.currentZone = 'Zone1';
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Debug-adjustable defaults
    if (this._vagScale    === undefined) this._vagScale    = 0.75;
    if (this._vagQty      === undefined) this._vagQty      = 12;
    if (this._vagFreq     === undefined) this._vagFreq     = 700;
    if (this._decoMult    === undefined) this._decoMult    = 1.0;
    if (this._placaSize   === undefined) this._placaSize   = 70;
    if (this._placaCampoX === undefined) this._placaCampoX = 520;
    if (this._placaCampoY === undefined) this._placaCampoY = 400;

    this._buildBackground();
    this._buildDecorations();
    this._buildVine();

    this.player = new Player(this, 640, 200);

    this._buildPlants();
    GameState.plantSpawns = PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y }));
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

    // Camera — vertical scroller
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(2.0);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.time.delayedCall(50, () => this.cameras.main.setLerp(0.12, 0.12));

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
    this.keyTab   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);

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
  //  Background — three zones stacked vertically
  // ─────────────────────────────────────────────────────────────────────────
  _buildBackground() {
    const g = this.add.graphics().setDepth(0);

    // ── Campo dos Vagalumes  y:0–720 ────────────────────────────────────
    g.fillStyle(0x9ed89e, 1); g.fillRect(0, 0, WORLD_WIDTH, ZONE_H);
    if (this.textures.exists('z1_bg_campo')) {
      this.add.image(0, 0, 'z1_bg_campo')
        .setOrigin(0, 0).setDisplaySize(WORLD_WIDTH, ZONE_H).setDepth(1);
    }

    // Campo path overlay
    if (this.textures.exists('z1_campo_caminho')) {
      this.add.image(WORLD_WIDTH / 2, ZONE_H / 2, 'z1_campo_caminho')
        .setOrigin(0.5).setDisplaySize(WORLD_WIDTH, ZONE_H).setDepth(2).setAlpha(0.85);
    }

    // ── Jardim Invertido  y:720–1440 ────────────────────────────────────
    g.fillStyle(0x4a7a50, 1); g.fillRect(0, ZONE_H, WORLD_WIDTH, ZONE_H);
    if (this.textures.exists('z1_bg_trans')) {
      this.add.image(0, ZONE_H, 'z1_bg_trans')
        .setOrigin(0, 0).setDisplaySize(WORLD_WIDTH, ZONE_H).setDepth(1);
    }

    // ── Limiar Secreto  y:1440–2160 ─────────────────────────────────────
    g.fillStyle(0x060c18, 1); g.fillRect(0, ZONE_H * 2, WORLD_WIDTH, ZONE_H);

    // Parede at Jardim→Limiar boundary
    if (this.textures.exists('z1_fundo_parede')) {
      this.add.image(WORLD_WIDTH / 2, ZONE_H * 2, 'z1_fundo_parede')
        .setOrigin(0.5, 1).setDepth(2).setAlpha(0.9)
        .setDisplaySize(WORLD_WIDTH, ZONE_H * 0.4);
    }
    if (this.textures.exists('z1_parede')) {
      this.add.image(WORLD_WIDTH / 2, ZONE_H * 2, 'z1_parede')
        .setOrigin(0.5).setDepth(3).setAlpha(0.55)
        .setDisplaySize(WORLD_WIDTH, 180);
    }

    // Location signs
    if (this.textures.exists('z1_placa_campo')) {
      this.placaCampo = this.add.image(this._placaCampoX, this._placaCampoY, 'z1_placa_campo')
        .setDisplaySize(this._placaSize, this._placaSize).setDepth(4);
    }
    if (this.textures.exists('z1_placa_limiar')) {
      this.placaLimiar = this.add.image(WORLD_WIDTH - 110, ZONE_H * 2 + 110, 'z1_placa_limiar')
        .setDisplaySize(this._placaSize, this._placaSize).setDepth(4);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Decorations — dense grid across all three vertical sub-areas
  // ─────────────────────────────────────────────────────────────────────────
  _buildDecorations() {
    this.decoImages = [];
    const m = this._decoMult ?? 1;

    // ── Campo (x:0–1280, y:0–720) ────────────────────────────────────────
    const campoNums = ['02','03','04','05','06','07','08','09','10','11',
                       '13','14','17','18','19','20','21','22','23','24','25'];
    const ck = campoNums.filter(n => this.textures.exists(`z1_campo_${n}`))
                        .map(n => `z1_campo_${n}`);

    const CAMPO_POS = [
      // [x, y, size_px]  sizes in game-world px; at zoom 2 → double on screen
      // small=30-55  medium=65-95  large=105-150  (variety = natural feel)
      [ 50,  45, 140],[ 220,  30,  45],[440,  55, 110],[660,  38,  70],[880,  58, 145],[1090, 42,  50],[1230, 72, 100],
      [ 70, 195,  55],[290, 180, 120],[510, 205,  40],[730, 192, 135],[950, 210,  65],[1170,198, 115],
      [ 55, 360, 150],[270, 348,  45],[490, 375,  90],[710, 358, 145],[930, 378,  40],[1148,362, 105],
      [ 80, 525,  40],[298, 510, 120],[520, 538,  55],[738, 522, 140],[958, 542,  45],[1178,528,  95],
      [ 62, 662, 130],[ 280, 648,  45],[498, 672, 145],[718, 655,  40],[938, 668, 115],[1158,655,  60],
    ];
    this._campoPos = CAMPO_POS;

    if (ck.length > 0) {
      CAMPO_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, ck[i % ck.length])
          .setDisplaySize(s * m, s * m).setDepth(3);
        this.decoImages.push({ img, baseSize: s });
      });
    }

    // ── Jardim / Transição (x:0–1280, y:720–1440) ────────────────────────
    const transNums = ['01','02','03','04','05','06','07','08','09','10',
                       '11','12','13','14','15','16','17','18','19'];
    const tk = transNums.filter(n => this.textures.exists(`z1_trans_${n}`))
                        .map(n => `z1_trans_${n}`);

    const TRANS_POS = [
      [ 70, 760, 120],[260, 748,  40],[480, 772,  90],[700, 752, 140],[920, 778,  50],[1148,758, 105],
      [ 80, 898,  45],[298, 882, 130],[518, 908,  35],[738, 892, 110],[958, 918,  60],[1178,898, 135],
      [ 65,1048, 140],[285,1032,  45],[505,1058, 115],[725,1038,  35],[945,1062, 130],[1165,1042, 50],
      [ 80,1188,  45],[298,1172, 120],[518,1198,  35],[738,1178, 140],[958,1202,  55],[1178,1182,110],
      [ 70,1338, 130],[288,1322,  45],[508,1348, 145],[728,1328,  35],[948,1352,  95],[1168,1332, 55],
    ];

    if (tk.length > 0) {
      TRANS_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, tk[i % tk.length])
          .setDisplaySize(s * m, s * m).setDepth(3).setAlpha(0.88);
        this.decoImages.push({ img, baseSize: s });
      });
    }

    // ── Limiar (x:0–1280, y:1440–2160) ──────────────────────────────────
    const limiarNums = ['03','04','05','06','07','08','09','11','12','13','14','15',
                        '16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'];
    const lk = limiarNums.filter(n => this.textures.exists(`z1_limiar_${n}`))
                         .map(n => `z1_limiar_${n}`);

    const LIMIAR_POS = [
      [ 80,1478, 110],[298,1462,  35],[518,1488, 135],[738,1468,  50],[958,1492, 120],[1178,1472, 40],
      [ 70,1618,  40],[288,1602, 140],[508,1628,  50],[728,1608, 120],[948,1632,  35],[1168,1612,145],
      [ 80,1758, 150],[298,1742,  45],[518,1768,  95],[738,1748, 150],[958,1772,  40],[1178,1752,130],
      [ 70,1898,  45],[288,1882, 135],[508,1908,  35],[728,1888, 120],[948,1912,  55],[1168,1892,140],
      [ 80,2038, 130],[298,2022,  40],[518,2048, 150],[738,2028,  45],[958,2052, 110],[1178,2032, 35],
    ];

    if (lk.length > 0) {
      LIMIAR_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, lk[i % lk.length])
          .setDisplaySize(s * m, s * m).setDepth(3).setAlpha(0.85);
        this.decoImages.push({ img, baseSize: s });
      });
    }
  }

  _buildVine() {
    this.vine = this.add.image(VINE_X, VINE_Y, 'vine')
      .setDisplaySize(44, 160).setDepth(6).setOrigin(0.5, 1);

    this.vineHint = this.add.text(VINE_X, VINE_Y - 100, 'C — Atravessar', {
      fontSize: '13px', fontFamily: 'Georgia, serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      backgroundColor: '#00000066', padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setAlpha(0).setDepth(10);

    this.tweens.add({
      targets: this.vine,
      angle: { from: -4, to: 4 },
      duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  _buildPlants() {
    this.plants = [];
    PLANT_SPAWNS.forEach(({ id, x, y }) => {
      if (GameState.collected.has(id)) return;
      const plantData = PLANTS[id];
      if (!plantData) return;
      const alreadyHave = this.plants.filter(p => p.plantData.id === id).length;
      const totalSpawns = PLANT_SPAWNS.filter(s => s.id === id).length;
      if (alreadyHave > 0 && totalSpawns > 1 && GameState.collected.has(id)) return;
      this.plants.push(new Plant(this, x, y, plantData));
    });
  }

  _buildPortal() {
    const locked = !this._vineClimbed;
    this.portal = new Portal(this, 640, 1940, {
      portalId: 'zone1_limiar',
      destination: 'Zone2',
      locked,
    });
  }

  _buildFireflies() {
    if (this._vagScale === undefined) this._vagScale = 0.75;
    if (this._vagQty   === undefined) this._vagQty   = 12;
    if (this._vagFreq  === undefined) this._vagFreq  = 700;

    const ffKey = this.textures.exists('z1_vagalume') ? 'z1_vagalume' : 'firefly';

    // Dense cluster in Campo
    this.campoEmitter = this.add.particles(0, 0, ffKey, {
      x: { min: 40, max: WORLD_WIDTH - 40 },
      y: { min: 40, max: ZONE_H - 40 },
      lifespan: { min: 2200, max: 4500 },
      speed:    { min: 8, max: 28 },
      scale:    { start: this._vagScale, end: 0 },
      alpha:    { start: 0.95, end: 0 },
      quantity:  this._vagQty,
      frequency: this._vagFreq,
      blendMode: 'ADD',
    }).setDepth(7);

    // Sparse in the rest of the world
    this.sparseEmitter = this.add.particles(0, 0, ffKey, {
      x: { min: 40, max: WORLD_WIDTH - 40 },
      y: { min: ZONE_H, max: WORLD_HEIGHT - 40 },
      lifespan: { min: 1800, max: 3500 },
      speed:    { min: 5, max: 18 },
      scale:    { start: this._vagScale * 0.65, end: 0 },
      alpha:    { start: 0.6, end: 0 },
      quantity:  Math.max(1, Math.round(this._vagQty / 2)),
      frequency: this._vagFreq * 3,
      blendMode: 'ADD',
    }).setDepth(7);
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
    this.player.update(this.cursors, this.wasd, this.keyShift, delta);

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
    this._checkVineProximity();
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateHints(delta);
    this._updateFootsteps(delta);
    this._checkZoneUnlocks();

    if (this._spellCooldown > 0) this._spellCooldown -= delta;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Area detection — y-based now that zones are vertical
  // ─────────────────────────────────────────────────────────────────────────
  _checkAreaChange() {
    const py = this.player.y;
    let area = 'campoVagalumes';
    if (py >= ZONE_H * 2) area = 'limiarSecreto';
    else if (py >= ZONE_H) area = 'jardimInvertido';

    if (area !== this._currentArea) {
      this._currentArea = area;
      this.game.events.emit('areaChanged', AREAS[area].label);
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
    if (this._vineClimbed) { this.vineHint?.setAlpha(0); return; }
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, VINE_X, VINE_Y);
    const near = dist < 90;
    this.tweens.add({ targets: this.vineHint, alpha: near ? 1 : 0, duration: 180 });
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
    if (Phaser.Input.Keyboard.JustDown(this.keyTab)) this._toggleDebugPanel();
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

    if (method === 'climb') { this._climbVine(); return; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Vine — now takes player DOWN into Limiar
  // ─────────────────────────────────────────────────────────────────────────
  _climbVine() {
    if (this._vineClimbed || this.player.isClimbing) return;
    this._vineClimbed = true;
    this.player.isClimbing = true;
    this.player.setVelocity(0, 0);

    this._emitNarrative('A trepadeira abre caminho para o Limiar Secreto…');

    this.tweens.add({
      targets: this.player,
      x: VINE_X,
      y: VINE_CLIMB_Y,
      duration: 1600,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.player.isClimbing = false;
        this.portal.unlock();

        if (!GameState.discoveredPortals.has('zone1_limiar')) {
          GameState.discoverPortal('zone1_limiar');
          this.time.delayedCall(600, () => {
            this._emitNarrative('Encontraste um portal! Leva-te de volta quando precisares.');
          });
        }

        const vine = this.plants.find(p => p.plantData.id === 'trepadeira' && !p.isCollected);
        if (vine) this._collectPlant(vine);
      },
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
      this.time.delayedCall(5000, () => {
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
    this._emitNarrative(`A ${plant.name} foi trocada por uma cópia falsa!`, 4000);
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
    const target = this.plants.find(p => p.plantData.id === 'ventoinha' && !p.isCollected);
    if (!target) return;
    const key = this.textures.exists('z1_vagalume') ? 'z1_vagalume' : 'firefly';
    this._guideFireflies = [];
    for (let i = 0; i < 3; i++) {
      const ff = this.add.image(this.player.x, this.player.y, key)
        .setDisplaySize(18, 18).setAlpha(0).setDepth(8).setBlendMode('ADD');
      this._guideFireflies.push(ff);
      this.time.delayedCall(2500 + i * 900, () => this._animateGuideFF(ff, target));
    }
  }

  _animateGuideFF(ff, target) {
    if (!ff.active || target.isCollected) { if (ff.active) ff.destroy(); return; }
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
                if (!target.isCollected) {
                  this.time.delayedCall(4000, () => ff.active && this._animateGuideFF(ff, target));
                } else {
                  ff.destroy();
                }
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
    const x = Phaser.Math.Between(60, WORLD_WIDTH - 60);
    const y = Phaser.Math.Between(40, ZONE_H - 40);
    const r = Phaser.Math.Between(35, 65);
    const circle = this.add.circle(x, y, r, 0xffffff, 0).setDepth(14);
    this.tweens.add({ targets: circle, alpha: 0.6, duration: 500 });
    const wander = () => {
      if (!circle.active) return;
      this.tweens.add({
        targets: circle,
        x: Phaser.Math.Between(60, WORLD_WIDTH - 60),
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
  //  Debug panel — Tab to toggle, shows all campo element positions
  // ─────────────────────────────────────────────────────────────────────────
  _buildDebugPanel() {
    const objs = [];

    const mark = (x, y, label, col = 0xffff00) => {
      objs.push(
        this.add.circle(x, y, 8, col, 0.75).setDepth(99),
        this.add.text(x, y - 14, label, {
          fontSize: '9px', fontFamily: 'monospace',
          color: '#ffff00', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(100)
      );
    };

    mark(640, 200, '①bruxinha', 0x00ffff);

    PLANT_SPAWNS.filter(s => s.y < ZONE_H).forEach((s, i) => {
      mark(s.x, s.y, `②v${i}`, 0x00ff88);
    });

    if (this.placaCampo) mark(this.placaCampo.x, this.placaCampo.y, '③placa', 0xff8800);

    (this._campoPos || []).forEach(([x, y], i) => {
      mark(x, y, `d${String(i).padStart(2, '0')}`, 0xffffff);
    });

    // Screen panel listing all values
    const lines = ['[TAB] Debug — Campo dos Vagalumes', ''];
    lines.push(`① Bruxinha    x=640   y=200`);
    PLANT_SPAWNS.filter(s => s.y < ZONE_H).forEach((s, i) => {
      lines.push(`② ventoinha[${i}]  x=${s.x}  y=${s.y}`);
    });
    if (this.placaCampo) {
      lines.push(`③ Placa  x=${Math.round(this.placaCampo.x)}  y=${Math.round(this.placaCampo.y)}  s=${this._placaSize}`);
    }
    lines.push('', '── Decorações ──');
    (this._campoPos || []).forEach(([x, y, s], i) => {
      lines.push(`d${String(i).padStart(2,'0')}  x=${x}  y=${y}  s=${s}`);
    });

    const PW = 300, lineH = 14, PH = Math.min(lines.length * lineH + 16, GAME_HEIGHT - 16);
    const px = GAME_WIDTH - PW - 6, py = 6;

    const pbg = this.add.graphics().setScrollFactor(0).setDepth(98);
    pbg.fillStyle(0x000000, 0.84);
    pbg.fillRoundedRect(px, py, PW, PH, 6);
    objs.unshift(pbg);

    const pt = this.add.text(px + 7, py + 7, lines.join('\n'), {
      fontSize: '10px', fontFamily: 'monospace',
      color: '#d8f8d8', lineSpacing: 1,
    }).setScrollFactor(0).setDepth(99);
    objs.unshift(pt);

    this._debugPanel = objs;
  }

  _toggleDebugPanel() {
    if (!this._debugVisible) {
      this._debugVisible = true;
      this._buildDebugPanel();
    } else {
      this._debugVisible = false;
      (this._debugPanel || []).forEach(o => o.destroy());
      this._debugPanel = null;
    }
  }

  shutdown() {
    this.game.events.off('plantStolen', this._onPlantStolen, this);
  }
}
