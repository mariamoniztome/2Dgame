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

// Zone 2 areas (per GDD)
const AREAS = {
  planiciesFendas: { label: 'Planície das Fendas',   minX: 0,    maxX: 900  },
  jardimSelvagem:  { label: 'Jardim Selvagem',        minX: 900,  maxX: 1800 },
  planalto:        { label: 'Planalto dos Furacões',  minX: 1800, maxX: 2500 },
  pantano:         { label: 'Pântano',                minX: 2500, maxX: 3200 },
};

const PLANT_SPAWNS = [
  { id: 'tezaluz',       x: 420,  y: 900  }, // Planície das Fendas
  { id: 'craveira',      x: 680,  y: 1350 }, // Planície das Fendas
  { id: 'espinhosa_doce', x: 1100, y: 700  }, // Jardim Selvagem
  { id: 'bocarra',       x: 1450, y: 1200 }, // Jardim Selvagem
  { id: 'aurorabromelia', x: 2100, y: 800  }, // Planalto dos Furacões
  { id: 'ninfaria',      x: 2750, y: 1100 }, // Pântano
];

const TREE_COLORS = [0x1a3a2a, 0x0d3020, 0x2a1a08, 0x182a10];
const TREE_POS = [
  {x:80,y:200},{x:200,y:80},{x:400,y:300},{x:120,y:600},{x:350,y:1600},
  {x:700,y:250},{x:800,y:900},{x:600,y:1400},{x:1100,y:350},{x:1200,y:1200},
  {x:1400,y:600},{x:1600,y:1800},{x:1900,y:400},{x:2000,y:1400},{x:2200,y:800},
  {x:2400,y:1600},{x:2600,y:300},{x:2700,y:1100},{x:2900,y:700},{x:3050,y:1500},
];

export class Zone2Scene extends Phaser.Scene {
  constructor() { super('Zone2'); }

  create() {
    GameState.currentZone = 'Zone2';
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this._buildBackground();

    this.player = new Player(this, 420, 1200);
    this._buildPlants();
    GameState.plantSpawns = PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y }));
    this._buildCreature();
    this._buildPortals();

    // Firefly particles (sparse)
    this.add.particles(0, 0, 'firefly', {
      x: { min: 0, max: WORLD_WIDTH },
      y: { min: 0, max: WORLD_HEIGHT },
      lifespan: { min: 2000, max: 4000 },
      speed: { min: 5, max: 20 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.6, end: 0 },
      quantity: 1, frequency: 400,
      blendMode: 'ADD',
    }).setDepth(7);

    this.playerShadow = this.add.ellipse(this.player.x, this.player.y + 20, 32, 12, 0x000000, 0.35).setDepth(4);
    this.playerGlow   = this.add.circle(this.player.x, this.player.y, 10, 0xffffff, 0.08).setDepth(9).setBlendMode('ADD');

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(1.2);
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
      this._emitNarrative('A floresta densa esconde segredos mais profundos. Avança com coragem.');
    });
  }

  _buildBackground() {
    const g = this.add.graphics();
    if (this.textures.exists('bg_zone2')) {
      this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'bg_zone2').setOrigin(0).setDepth(0);
      g.fillStyle(0x071208, 0.5); g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    } else {
      g.fillStyle(0x061210, 1); g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }
    g.setDepth(1);

    // Swamp water in Pântanos area
    g.fillStyle(0x0d2018, 0.6);
    g.fillEllipse(400, 1100, 500, 300);
    g.fillEllipse(250, 1500, 350, 200);
    g.fillStyle(0x1a3a28, 0.4);
    g.fillEllipse(450, 1150, 460, 260);

    TREE_POS.forEach(({ x, y }) => {
      const c = TREE_COLORS[Math.floor(Math.random() * TREE_COLORS.length)];
      const r = 30 + Math.random() * 50;
      this.add.circle(x, y, r, c, 0.8).setDepth(2);
      this.add.circle(x + 10, y + r * 0.3, r * 0.6, c, 0.5).setDepth(2);
    });

  }

  _buildPlants() {
    this.plants = [];
    PLANT_SPAWNS.forEach(({ id, x, y }) => {
      if (GameState.collected.has(id)) return;
      const data = PLANTS[id];
      if (!data) return;
      this.plants.push(new Plant(this, x, y, data));
    });
  }

  _buildCreature() {
    this.creature = new Creature(this, 1200, 900, 'creature_bocarra', {
      type: 'bocarra',
      followRange: 400,
      stealThreshold: 3500,
      speed: 70,
    });
  }

  _buildPortals() {
    // Portal in Capinzal
    this.portalBack = new Portal(this, 200, 400, {
      portalId: 'zone2_back',
      destination: 'Zone1',
      locked: false,
    });

    // Portal in Jardim Selvagem
    this.portalForward = new Portal(this, 2200, 600, {
      portalId: 'zone2_forward',
      destination: 'Zone3',
      locked: !GameState.isZoneUnlocked('Zone3'),
    });

    this._portals = [this.portalBack, this.portalForward];
  }

  update(time, delta) {
    this.player.update(this.cursors, this.wasd, this.keyShift, delta);
    this.creature.update(this.player, delta, GameState);
    this.playerGlow.setPosition(this.player.x, this.player.y);
    this.playerShadow.setPosition(this.player.x, this.player.y + 20);
    GameState.playerX = this.player.x;
    GameState.playerY = this.player.y;

    this._checkAreaChange();
    this._checkPlantProximity(time, delta);
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateFootsteps(delta);
    this._checkZoneUnlocks();

    if (this._spellCooldown > 0) this._spellCooldown -= delta;
  }

  _checkAreaChange() {
    const px = this.player.x;
    let area = 'planiciesFendas';
    if (px >= 2500) area = 'pantano';
    else if (px >= 1800) area = 'planalto';
    else if (px >= 900) area = 'jardimSelvagem';

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
      if (method === 'interact' || method === 'brave' || method === 'slow') {
        const tooFast = method === 'slow' && this.player.recentSpeed > 50;
        if (tooFast) {
          this._timedPlant = null; this._proximityTimer = 0;
          return;
        }
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
    if (!this._nearPlant) return;

    const plant = this._nearPlant;
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
    }
    // 'interact' and 'brave' are auto-collected via _checkPlantProximity
  }

  _castSpell() {
    if (!GameState.activeSpell) return;
    this._spellCooldown = 1200;
    const spellDef = SPELLS[GameState.activeSpell];
    const fx = this.add.image(this.player.x, this.player.y, spellDef.textureKey)
      .setDisplaySize(50, 50).setAlpha(0.9).setDepth(50).setBlendMode('ADD');
    this.tweens.add({
      targets: fx, scale: 4, alpha: 0, duration: 700,
      ease: 'Power2.easeOut', onComplete: () => fx.destroy(),
    });
    this.game.events.emit('spellCast', GameState.activeSpell);

    const spell = GameState.activeSpell;
    if (spell === 'fogo_controlado' || spell === 'raiz_ardente') {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.creature.x, this.creature.y
      );
      if (d < 320) {
        this.creature.repel(this.player.x, this.player.y);
        this._emitNarrative(spell === 'fogo_controlado'
          ? 'O Fogo Controlado espantou o Sussurro-ladrão!'
          : 'A Raíz Ardente afastou a criatura!');
      }
    }
    if (spell === 'canto_jardim') {
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
    this._emitNarrative(plant.plantData.narrativeText, 4000);
    this.game.events.emit('plantCollected', plant.plantData, plant.plantData);

    if (!GameState.isZoneUnlocked('Zone3') && GameState.checkZone3Unlock()) {
      GameState.unlockZone('Zone3');
      this.portalForward.unlock();
      this.time.delayedCall(5000, () =>
        this._emitNarrative('Os terrenos das sombras estão acessíveis! Usa o portal avançado.')
      );
    }
  }

  _usePortal(portal) {
    const dest = portal.destination;
    if (portal.isLocked) {
      this._emitNarrative(
        dest === 'Zone3'
          ? 'Precisas de Ninfária, Aurorabromélia, Tezaluz, Espinhosa-doce e Craveira.'
          : 'Portal bloqueado.'
      );
      return;
    }
    SoundManager.portal();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.events.off('plantStolen', this._onPlantStolen, this);
      this.scene.start(dest);
    });
  }

  _checkZoneUnlocks() {
    if (!GameState.isZoneUnlocked('Zone3') && GameState.checkZone3Unlock()) {
      GameState.unlockZone('Zone3');
      this.portalForward?.unlock();
    }
    if (GameState.checkCauldronUnlock() && !GameState.isZoneUnlocked('Cauldron')) {
      GameState.unlockZone('Cauldron');
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
    this._emitNarrative(`A Bocarra engoliu a ${plant.name}!`, 4000);
  }

  shutdown() {
    this.game.events.off('plantStolen', this._onPlantStolen, this);
  }
}
