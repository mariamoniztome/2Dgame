import Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_INTERACTION_RADIUS } from '../config.js';
import { GameState } from '../GameState.js';
import { PLANTS } from '../data/plants.js';
import { SPELLS } from '../data/spells.js';
import { Player } from '../objects/Player.js';
import { Plant } from '../objects/Plant.js';
import { Creature } from '../objects/Creature.js';
import { Portal } from '../objects/Portal.js';
import { SoundManager } from '../SoundManager.js';

// Zone 3 — 1280 wide × 2160 tall, three sub-areas stacked top → bottom
const ZONE_H = 720;

const PLANT_SPAWNS = [
  { id: 'sombravinha',   x: 640,  y: 350 },
  { id: 'faisca_mato',   x: 880,  y: 580 },
  { id: 'sussurreira',   x: 460,  y: 1020 },
  { id: 'lunaria_negra', x: 820,  y: 1300 },
];

const AREAS = {
  valeAsara:      { label: 'Vale do Asara',      minY: 0,          maxY: ZONE_H     },
  bosqueConfusao: { label: 'Bosque da Confusão', minY: ZONE_H,     maxY: ZONE_H * 2 },
  valeEspelhos:   { label: 'Vale dos Espelhos',  minY: ZONE_H * 2, maxY: ZONE_H * 3 },
};

export class Zone3Scene extends Phaser.Scene {
  constructor() { super('Zone3'); }

  create() {
    GameState.currentZone = 'Zone3';
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this._buildBackground();

    this.player = new Player(this, 640, 200);
    this._buildPlants();
    GameState.plantSpawns = PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y }));
    this._buildCreatures();
    this._buildPortals();

    // Dim eerie fireflies across world
    this.add.particles(0, 0, 'firefly', {
      x: { min: 0, max: WORLD_WIDTH },
      y: { min: 0, max: WORLD_HEIGHT },
      lifespan: { min: 1500, max: 3500 },
      speed: { min: 3, max: 12 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.4, end: 0 },
      tint: [0xa8e07e, 0x66bb6a, 0xffffff],
      quantity: 1, frequency: 500,
      blendMode: 'ADD',
    }).setDepth(7);

    this.playerShadow = this.add.ellipse(this.player.x, this.player.y + 85, 60, 14, 0x000000, 0.28).setDepth(4);
    this.playerGlow   = this.add.circle(this.player.x, this.player.y, 18, 0xffffff, 0.07).setDepth(9).setBlendMode('ADD');

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(2.0);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.time.delayedCall(50, () => this.cameras.main.setLerp(0.12, 0.12));

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.keyC     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyF     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyQ     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyM     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');

    this._nearPlant      = null;
    this._nearPortal     = null;
    this._currentArea    = '';
    this._spellCooldown  = 0;
    this._proximityTimer = 0;
    this._timedPlant     = null;
    this._footTimer      = 0;

    this.cameras.main.fadeIn(800, 0, 0, 0);
    this.game.events.on('plantStolen', this._onPlantStolen, this);

    this.time.delayedCall(900, () => {
      this._emitNarrative('Os terrenos das sombras. Algo observa-te daqui. Vai devagar, ou para completamente.');
    });
  }

  _buildBackground() {
    const g = this.add.graphics();
    if (this.textures.exists('bg_zone3')) {
      this.add.image(0, 0, 'bg_zone3').setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(0);
      g.fillStyle(0x030608, 0.6); g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    } else {
      g.fillStyle(0x04050c, 1); g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }
    g.setDepth(1);

    // Dark misty patches
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0x1a3a2a, 0.05);
      g.fillEllipse(
        Phaser.Math.Between(100, 1180),
        Phaser.Math.Between(100, 2060),
        Phaser.Math.Between(200, 500),
        Phaser.Math.Between(100, 300)
      );
    }

    // Dark twisted trees
    const darkColors = [0x0a0e0a, 0x0d160d, 0x1a1010, 0x0a120a];
    for (let i = 0; i < 28; i++) {
      const c = darkColors[Math.floor(Math.random() * darkColors.length)];
      const x = Phaser.Math.Between(50, 1230);
      const y = Phaser.Math.Between(50, 2110);
      const r = 25 + Math.random() * 55;
      this.add.circle(x, y, r, c, 0.85).setDepth(2);
    }
  }

  _buildPlants() {
    this.plants = [];
    this._sombraPlant = null;

    PLANT_SPAWNS.forEach(({ id, x, y }) => {
      if (GameState.collected.has(id)) return;
      const data = PLANTS[id];
      if (!data) return;
      const p = new Plant(this, x, y, data);
      if (id === 'sombravinha') {
        p.isVisible = false;
        p.setAlpha(0);
        this._sombraPlant = p;
      }
      this.plants.push(p);
    });
  }

  _buildCreatures() {
    this.ecos = [];
    for (let i = 0; i < 2; i++) {
      this.ecos.push(new Creature(this, 380 + i * 500, 850, 'creature_eco', {
        type: 'eco',
        followRange: 350,
        stealThreshold: 4000,
        speed: 65,
      }));
    }
  }

  _buildPortals() {
    this.portalBack = new Portal(this, 200, 200, {
      portalId: 'zone3_back',
      destination: 'Zone2',
      locked: false,
    });

    const cauldronUnlocked = GameState.checkCauldronUnlock();
    this.portalCauldron = new Portal(this, 1050, 1950, {
      portalId: 'zone3_cauldron',
      destination: 'Cauldron',
      locked: !cauldronUnlocked,
    });

    // Dense firefly cluster hints toward cauldron portal
    this.add.particles(0, 0, 'firefly', {
      x: { min: 920, max: 1150 },
      y: { min: 1820, max: 2080 },
      lifespan: { min: 2000, max: 4000 },
      speed: { min: 6, max: 22 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.9, end: 0 },
      quantity: 2, frequency: 120,
      blendMode: 'ADD',
    }).setDepth(7);

    this._portals = [this.portalBack, this.portalCauldron];
  }

  update(time, delta) {
    this.player.update(this.cursors, this.wasd, this.keyShift, delta);
    this.ecos.forEach(e => e.update(this.player, delta, GameState));
    this.playerGlow.setPosition(this.player.x, this.player.y);
    this.playerShadow.setPosition(this.player.x, this.player.y + 85);
    GameState.playerX = this.player.x;
    GameState.playerY = this.player.y;

    this._checkAreaChange();
    this._checkPlantProximity(time, delta);
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateSombravinha(delta);
    this._updateFootsteps(delta);
    this._checkZoneUnlocks();

    if (this._spellCooldown > 0) this._spellCooldown -= delta;
  }

  _checkAreaChange() {
    const py = this.player.y;
    let area = 'valeAsara';
    if (py >= ZONE_H * 2) area = 'valeEspelhos';
    else if (py >= ZONE_H) area = 'bosqueConfusao';
    if (area !== this._currentArea) {
      this._currentArea = area;
      this.game.events.emit('areaChanged', AREAS[area].label);
    }
  }

  _checkPlantProximity(time, delta) {
    this._nearPlant = null;
    let foundNear = false;

    this.plants.forEach(plant => {
      if (plant.isCollected || !plant.isVisible) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, plant.x, plant.y);
      const inRange = dist < PLAYER_INTERACTION_RADIUS;
      plant.showHint(inRange);
      if (!inRange) return;

      this._nearPlant = plant;
      foundNear = true;
      const method = plant.plantData.collectMethod;

      if (method === 'wait') {
        if (plant._sombraVisible) this._collectPlant(plant);
        return;
      }
      if (method === 'interact' || method === 'brave') {
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

  _updateSombravinha(delta) {
    if (!this._sombraPlant || this._sombraPlant.isCollected) return;
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      this._sombraPlant.x, this._sombraPlant.y
    );
    if (dist > 400) return;
    const toPx = this._sombraPlant.x - this.player.x;
    const toPy = this._sombraPlant.y - this.player.y;
    const facingAngle = this.player.facingAngle;
    const dotProduct = Math.cos(facingAngle) * toPx + Math.sin(facingAngle) * toPy;
    const facingAway = dotProduct < -50;
    const stillEnough = this.player.recentSpeed < 30;
    this._sombraPlant.updateSombraState(facingAway && stillEnough, delta);
  }

  _checkPortalProximity() {
    this._nearPortal = null;
    this._portals.forEach(portal => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, portal.x, portal.y);
      const near = dist < 65;
      portal.showHint(near);
      if (near) this._nearPortal = portal;
    });
  }

  _handleKeys(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) this._handleInteract(time);
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
    if (this._nearPortal) { this._usePortal(this._nearPortal); return; }
  }

  _castSpell() {
    if (!GameState.activeSpell) return;
    this._spellCooldown = 1200;
    const spellDef = SPELLS[GameState.activeSpell];
    const fx = this.add.image(this.player.x, this.player.y, spellDef.textureKey)
      .setDisplaySize(50, 50).setAlpha(0.9).setDepth(50).setBlendMode('ADD');
    this.tweens.add({ targets: fx, scale: 4, alpha: 0, duration: 700, onComplete: () => fx.destroy() });
    this.game.events.emit('spellCast', GameState.activeSpell);

    const spell = GameState.activeSpell;
    if (spell === 'ancestral') {
      this.ecos.forEach(e => e.repel(this.player.x, this.player.y));
      this._emitNarrative('O Ancestral lança um feixe de luz — os Ecos fogem!');
    } else if (spell === 'raiz_ardente') {
      this._emitNarrative('A Raíz Ardente surge da terra — caminho aberto por 30 segundos!');
    } else if (spell === 'canto_jardim') {
      this._revealAllPlants();
    }
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

  _collectPlant(plant) {
    if (plant.isCollected) return;
    if (!GameState.addPlant(plant.plantData)) {
      this._emitNarrative('A mochila está cheia!');
      return;
    }
    plant.collect();
    this.plants = this.plants.filter(p => {
      if (p !== plant && p.plantData.id === plant.plantData.id) { p.destroy(); return false; }
      return p !== plant;
    });
    this._emitNarrative(plant.plantData.narrativeText, 4500);
    this.game.events.emit('plantCollected', plant.plantData, plant.plantData);

    if (GameState.checkCauldronUnlock() && !GameState.isZoneUnlocked('Cauldron')) {
      GameState.unlockZone('Cauldron');
      this.portalCauldron?.unlock();
      this.time.delayedCall(5500, () =>
        this._emitNarrative('Tens todas as plantas! O caldeirão aguarda-te no fim do jardim. Segue os vagalumes!')
      );
    }
  }

  _usePortal(portal) {
    if (portal.isLocked) {
      this._emitNarrative('Precisas de todas as 5 plantas essenciais para chegar ao caldeirão.');
      return;
    }
    SoundManager.portal();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.events.off('plantStolen', this._onPlantStolen, this);
      this.scene.start(portal.destination);
    });
  }

  _checkZoneUnlocks() {
    if (GameState.checkCauldronUnlock() && !GameState.isZoneUnlocked('Cauldron')) {
      GameState.unlockZone('Cauldron');
      this.portalCauldron?.unlock();
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

  _emitNarrative(text, dur = 3500) { this.game.events.emit('showNarrative', text, dur); }
  _onPlantStolen(plant) { this._emitNarrative(`Os Ecos trocaram a ${plant.name} por uma cópia falsa!`, 4000); }
  shutdown() { this.game.events.off('plantStolen', this._onPlantStolen, this); }
}
