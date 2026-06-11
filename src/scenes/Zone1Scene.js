import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT, PLAYER_INTERACTION_RADIUS } from '../config.js';
import { GameState } from '../GameState.js';
import { PLANTS } from '../data/plants.js';
import { SPELLS } from '../data/spells.js';
import { Player } from '../objects/Player.js';
import { Plant } from '../objects/Plant.js';
import { Portal } from '../objects/Portal.js';
import { SoundManager } from '../SoundManager.js';

// Zone 1 — L-shaped world:
//   Campo dos Vagalumes  x:0–1280    y:0–720    (start area)
//   Limiar Secreto       x:0–1280    y:-720–0   (above campo, reached by climbing vine)
//   Jardim Invertido     x:1280–2560 y:0–720    (right of campo)
//   Dead zone            x:1280–2560 y:-720–0   (blocked by physics walls)
const ZONE_W = 1280;
const ZONE_H = 720;

const AREAS = {
  campoVagalumes:  { label: 'Campo dos Vagalumes' },
  jardimInvertido: { label: 'Jardim Invertido'    },
  limiarSecreto:   { label: 'Limiar Secreto'      },
};

// Vine/Trepadeira sits near the top of Campo, giving access to Limiar (above)
const VINE_X = 640;
const VINE_Y = 90;
const VINE_CLIMB_Y = -100;   // y-position just inside Limiar after climbing

const PLANT_SPAWNS = [
  { id: 'ventoinha',  x: 255,  y: 605  },   // campo
  { id: 'ventoinha',  x: 1245, y: 332  },   // campo
  { id: 'gotateia',   x: 2220, y: 320  },   // jardim  (boundary + 300)
  { id: 'gotateia',   x: 2790, y: 520  },   // jardim  (boundary + 870)
  { id: 'farfalha',   x: 420,  y: -380 },   // limiar
  { id: 'farfalha',   x: 960,  y: -500 },   // limiar
  { id: 'trepadeira', x: 580,  y: 120  },   // campo near vine
];

export class Zone1Scene extends Phaser.Scene {
  constructor() { super('Zone1'); }

  create() {
    GameState.currentZone = 'Zone1';
    // L-shaped world sized by _zoneW × _zoneH (tunable in DebugPanel F2)
    this.physics.world.setBounds(0, -this._zoneH, this._zoneW * 2, this._zoneH * 2);

    // Debug-adjustable defaults
    if (this._vagScale    === undefined) this._vagScale    = 1.0;
    if (this._vagQty      === undefined) this._vagQty      = 12;
    if (this._vagFreq     === undefined) this._vagFreq     = 700;
    if (this._decoMult    === undefined) this._decoMult    = 1.0;
    if (this._placaSize   === undefined) this._placaSize   = 70;
    if (this._placaCampoX === undefined) this._placaCampoX = 520;
    if (this._placaCampoY === undefined) this._placaCampoY = 400;

    // Zone physical size — adjustable via DebugPanel (F2) → "Reiniciar Zona"
    // _zoneW = width of campo = width of jardim = width of limiar
    // _zoneH = height of campo = height of jardim = height of limiar
    // Area detection boundary stays at ZONE_W=1280 for existing content positions
    this._zoneW = this.game.registry.get('debugZoneW') ?? 1920;
    this._zoneH = this.game.registry.get('debugZoneH') ?? 1080;

    this._buildBackground();
    this._buildDecorations();
    this._buildVine();

    this.player = new Player(this, 640, Math.round(ZONE_H / 2));

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

    // Dead-zone walls: block the top-right quadrant (x>_zoneW, y<0)
    const _wallH = this.add.rectangle(this._zoneW + this._zoneW / 2, -2, this._zoneW, 6).setAlpha(0);
    this.physics.add.existing(_wallH, true);
    this.physics.add.collider(this.player, _wallH);

    const _wallV = this.add.rectangle(this._zoneW + 2, -this._zoneH / 2, 6, this._zoneH).setAlpha(0);
    this.physics.add.existing(_wallV, true);
    this.physics.add.collider(this.player, _wallV);

    // Camera
    this.cameras.main.setBounds(0, -this._zoneH, this._zoneW * 2, this._zoneH * 2);
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
  //  Background — L-shaped, sized by _zoneW × _zoneH
  //    Campo   x:0–_zoneW    y:0–_zoneH    (#afd6a8)
  //    Limiar  x:0–_zoneW    y:-_zoneH–0   (#355138)
  //    Jardim  x:_zoneW–*2   y:0–_zoneH    (#6d8469)
  // ─────────────────────────────────────────────────────────────────────────
  _buildBackground() {
    const ZW = this._zoneW, ZH = this._zoneH;
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

    // ── Limiar Secreto (above campo) ─────────────────────────────────
    g.fillStyle(0x355138, 1); g.fillRect(0, -ZH, ZW, ZH);

    // ── Jardim Invertido (right of campo) ────────────────────────────
    g.fillStyle(0x6d8469, 1); g.fillRect(ZW, 0, ZW, ZH);

    // ── Dead-zone fill (top-right, aesthetic) ────────────────────────
    g.fillStyle(0x1e2e20, 1); g.fillRect(ZW, -ZH, ZW, ZH);

    // Location signs
    if (this.textures.exists('z1_placa_campo')) {
      this.placaCampo = this.add.image(this._placaCampoX, this._placaCampoY, 'z1_placa_campo')
        .setDisplaySize(this._placaSize, this._placaSize).setDepth(4);
    }
    if (this.textures.exists('z1_placa_limiar')) {
      this.placaLimiar = this.add.image(280, -ZH + 120, 'z1_placa_limiar')
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
      [112, 92, 150],
      [311, 87, 210],
      [451, 75, 175],
      [983, 255, 155],
      [808, 78, 175],
      [987, 106, 155],
      [832, 276, 185],
      [195, 213, 210],
      [278, 254, 80],
      [586, 140, 155],
      [749, 216, 95],
      [684, 305, 25],
      [1229, 150, 65],
      [55, 360, 250],
      [245, 461, 195],
      [425, 296, 180],
      [730, 409, 70],
      [1012, 388, 170],
      [1170, 258, 185],
      [201, 614, 80],
      [666, 612, 35],
      [377, 480, 165],
      [826, 541, 160],
      [1234, 442, 185],
      [1095, 566, 95],
      [53, 604, 200],
      [914, 644, 135],
      [539, 633, 170],
      [739, 629, 180],
      [1062, 679, 90],
      [1156, 52, 160],
    ];
    this._campoPos = CAMPO_POS;

    if (ck.length > 0) {
      CAMPO_POS.forEach(([x, y, s], i) => {
        const img = this.add.image(x, y, ck[i % ck.length])
          .setDisplaySize(s * m, s * m).setDepth(3);
        this.decoImages.push({ img, baseSize: s });
      });
    }

    // ── Jardim Invertido  x:_zoneW–_zoneW*2, y:0–_zoneH ─────────────────
    const transNums = ['01','02','03','04','05','06','07','08','09','10',
                       '11','12','13','14','15','16','17','18','19'];
    const tk = transNums.filter(n => this.textures.exists(`z1_trans_${n}`))
                        .map(n => `z1_trans_${n}`);

    if (tk.length > 0) {
      const ZW = this._zoneW, ZH = this._zoneH;
      const szJ = [120,45,95,140,55,110, 45,130,38,115,60,135, 145,50,95,148,42,130, 48,132,38,122,58,140, 130,48,142,38,92,60];
      let ji = 0;
      [0.08,0.27,0.47,0.67,0.87].forEach((ry, row) => {
        [0.09,0.26,0.43,0.60,0.76,0.92].forEach((rx, col) => {
          const jx = (col%2===0?-1:1)*0.015*ZW, jy = (row%2===0?-1:1)*0.018*ZH;
          const x = Math.round(ZW + rx*ZW + jx), y = Math.round(ry*ZH + jy);
          const s = szJ[ji++ % szJ.length];
          const img = this.add.image(x, y, tk[ji % tk.length])
            .setDisplaySize(s * m, s * m).setDepth(3).setAlpha(0.88);
          this.decoImages.push({ img, baseSize: s });
        });
      });
    }

    // ── Limiar Secreto  x:0–_zoneW, y:-_zoneH–0 ──────────────────────────
    const limiarNums = ['03','04','05','06','07','08','09','11','12','13','14','15',
                        '16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'];
    const lk = limiarNums.filter(n => this.textures.exists(`z1_limiar_${n}`))
                         .map(n => `z1_limiar_${n}`);

    if (lk.length > 0) {
      const ZW = this._zoneW, ZH = this._zoneH;
      const szL = [110,38,135,50,120,40, 42,140,52,118,38,142, 148,48,98,150,42,130, 48,132,38,122,58,138, 128,45,145,48,112,38];
      let li = 0;
      [0.93,0.75,0.57,0.38,0.18].forEach((ry, row) => {
        [0.05,0.22,0.39,0.56,0.73,0.90].forEach((rx, col) => {
          const jx = (col%2===0?-1:1)*0.012*ZW, jy = (row%2===0?-1:1)*0.015*ZH;
          const x = Math.round(rx*ZW + jx), y = Math.round(-ry*ZH + jy);
          const s = szL[li++ % szL.length];
          const img = this.add.image(x, y, lk[li % lk.length])
            .setDisplaySize(s * m, s * m).setDepth(3).setAlpha(0.85);
          this.decoImages.push({ img, baseSize: s });
        });
      });
    }
  }

  _buildVine() {
    // Vine hangs at the top of Campo, giving access to Limiar Secreto above
    this.vine = this.add.image(VINE_X, VINE_Y, 'vine')
      .setDisplaySize(44, 160).setDepth(6).setOrigin(0.5, 0.5);

    this.vineHint = this.add.text(VINE_X, VINE_Y - 70, 'C — Subir para o Limiar', {
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
    // Portal sits deep in Limiar Secreto (x center, high up)
    this.portal = new Portal(this, ZONE_W / 2, -ZONE_H + 100, {
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

    // Sparse in Jardim (right block)
    this.sparseEmitter = this.add.particles(0, 0, ffKey, {
      x: { min: this._zoneW + 40, max: this._zoneW * 2 - 40 },
      y: { min: 40, max: this._zoneH - 40 },
      lifespan: { min: 1800, max: 3500 },
      speed:    { min: 5, max: 18 },
      scale:    { start: baseScale * 0.55, end: 0 },
      alpha:    { start: 0.45, end: 0 },
      quantity:  Math.max(1, Math.round(this._vagQty / 3)),
      frequency: this._vagFreq * 4,
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
    const px = this.player.x, py = this.player.y;
    let area = 'campoVagalumes';
    if (px >= this._zoneW)  area = 'jardimInvertido';
    else if (py < 0)        area = 'limiarSecreto';

    if (area !== this._currentArea) {
      this._currentArea = area;
      this.game.events.emit('areaChanged', AREAS[area].label);

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
      duration: 1200,
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
      // All plants collected or none visible → guide toward vine (gateway to Limiar)
      return this._vineClimbed ? null : { x: VINE_X, y: VINE_Y };
    }
    // Prefer plants in the same area as the player
    const inArea = candidates.filter(p => {
      if (px >= ZONE_W)  return p.x >= ZONE_W;            // jardim
      if (py < 0)        return p.y < 0;                  // limiar
      return p.x < ZONE_W && p.y >= 0;                    // campo
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
    if (!this._debugVisible) {
      this._debugVisible = true;
      this._buildDebugPanel();
    } else {
      this._debugVisible = false;
      this.input.off('dragstart', this._onDebugDragStart, this);
      this.input.off('drag',      this._onDebugDrag,      this);
      this.input.off('dragend',   this._onDebugDragEnd,   this);
      this.input.off('wheel',     this._onDebugWheel,     this);
      (this._debugDragObjs || []).forEach(obj => {
        if (obj.active) { obj.disableInteractive(); this.input.setDraggable(obj, false); }
      });
      this._debugDragObjs = [];
      this._debugSelected = null;
      (this._debugObjs || []).forEach(o => o.destroy());
      this._debugObjs = null; this._debugPanelTxt = null; this._debugTip = null;
      this._debugSelGfx = null;
    }
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
