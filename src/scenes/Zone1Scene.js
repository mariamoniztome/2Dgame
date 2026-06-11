import Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_INTERACTION_RADIUS } from '../config.js';
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
    if (this._decoMult    === undefined) this._decoMult    = 1.9;
    if (this._placaSize   === undefined) this._placaSize   = 364;
    if (this._placaCampoX === undefined) this._placaCampoX = 510;
    if (this._placaCampoY === undefined) this._placaCampoY = 255;

    this._buildBackground();
    this._buildDecorations();
    this._buildVine();

    this.player = new Player(this, 640, 200);

    this._buildPlants();
    GameState.plantSpawns = PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y }));
    this._buildPortal();
    this._buildFireflies();

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

    this.cameras.main.fadeIn(800, 0, 0, 0);

    this.time.delayedCall(900, () => {
      this._emitNarrative('Bem-vinda ao jardim, bruxinha. Explora. As plantas esperam por ti.');
    });

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
      [ 50,  45, 380],[220,  30, 340],[440,  55, 300],[660,  38, 360],[880,  58, 330],[1090, 42, 280],[1230, 72, 260],
      [ 70, 195, 350],[290, 180, 310],[510, 205, 270],[730, 192, 340],[950, 210, 300],[1170,198, 260],
      [ 55, 360, 370],[270, 348, 320],[490, 375, 280],[710, 358, 350],[930, 378, 310],[1148,362, 270],
      [ 80, 525, 340],[298, 510, 290],[520, 538, 260],[738, 522, 330],[958, 542, 300],[1178,528, 260],
      [ 62, 662, 360],[280, 648, 310],[498, 672, 280],[718, 655, 340],[938, 668, 310],[1158,655, 270],
    ];

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
      [ 70, 760, 220],[260, 748, 200],[480, 772, 240],[700, 752, 210],[920, 778, 230],[1148,758, 200],
      [ 80, 898, 210],[298, 882, 230],[518, 908, 200],[738, 892, 240],[958, 918, 210],[1178,898, 200],
      [ 65,1048, 240],[285,1032, 210],[505,1058, 230],[725,1038, 200],[945,1062, 240],[1165,1042,210],
      [ 80,1188, 220],[298,1172, 200],[518,1198, 240],[738,1178, 210],[958,1202, 230],[1178,1182,200],
      [ 70,1338, 230],[288,1322, 210],[508,1348, 200],[728,1328, 240],[948,1352, 220],[1168,1332,200],
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
      [ 80,1478, 220],[298,1462, 200],[518,1488, 240],[738,1468, 210],[958,1492, 230],[1178,1472,200],
      [ 70,1618, 210],[288,1602, 230],[508,1628, 200],[728,1608, 240],[948,1632, 210],[1168,1612,200],
      [ 80,1758, 240],[298,1742, 200],[518,1768, 220],[738,1748, 240],[958,1772, 200],[1178,1752,220],
      [ 70,1898, 220],[288,1882, 210],[508,1908, 240],[728,1888, 200],[948,1912, 230],[1168,1892,200],
      [ 80,2038, 230],[298,2022, 200],[518,2048, 220],[738,2028, 240],[958,2052, 210],[1178,2032,200],
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

      if (!inRange) return;
      this._nearPlant = plant;
      foundNear = true;

      if (method === 'fast') {
        if (this.player.recentSpeed >= 120) this._collectPlant(plant);
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

  shutdown() {
    this.game.events.off('plantStolen', this._onPlantStolen, this);
  }
}
