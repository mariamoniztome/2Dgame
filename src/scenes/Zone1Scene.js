import Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_INTERACTION_RADIUS } from '../config.js';
import { GameState } from '../GameState.js';
import { PLANTS } from '../data/plants.js';
import { SPELLS } from '../data/spells.js';
import { Player } from '../objects/Player.js';
import { Plant } from '../objects/Plant.js';
import { Creature } from '../objects/Creature.js';
import { Portal } from '../objects/Portal.js';

// Zone 1 is 3200×2400, split into three areas
const AREAS = {
  campoVagalumes: { label: 'Campo dos Vagalumes', minX: 0,    maxX: 1100 },
  jardimInvertido: { label: 'Jardim Invertido',   minX: 1100, maxX: 2200 },
  limiarSecreto:   { label: 'Limiar Secreto',     minX: 2200, maxX: 3200 },
};

// Vine position (gate to Limiar Secreto)
const VINE_X = 2210, VINE_Y = 1000, VINE_CLIMB_Y = 380;

// Plant spawn configurations
const PLANT_SPAWNS = [
  { id: 'ventoinha', x: 310,  y: 760  },
  { id: 'ventoinha', x: 620,  y: 1440 },
  { id: 'gotateia',  x: 190,  y: 1100 },
  { id: 'gotateia',  x: 1260, y: 870  },
  { id: 'farfalha',  x: 1540, y: 1230 },
  { id: 'farfalha',  x: 1840, y: 680  },
  { id: 'trepadeira', x: VINE_X - 60, y: VINE_Y + 30 },
];

// Decorative tree positions
const TREE_POSITIONS = [
  {x:90,y:160},{x:260,y:90},{x:130,y:460},{x:380,y:320},{x:480,y:900},
  {x:80,y:1300},{x:350,y:1700},{x:700,y:220},{x:840,y:700},{x:920,y:1800},
  {x:1150,y:400},{x:1300,y:1100},{x:1480,y:350},{x:1620,y:1500},{x:1900,y:900},
  {x:2050,y:1400},{x:2260,y:750},{x:2450,y:1200},{x:2680,y:400},{x:2850,y:900},
  {x:3050,y:200},{x:2900,y:1700},{x:3100,y:1300},{x:2400,y:1800},
];

export class Zone1Scene extends Phaser.Scene {
  constructor() { super('Zone1'); }

  create() {
    GameState.currentZone = 'Zone1';

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this._buildBackground();
    this._buildDecorations();
    this._buildVine();

    // Player starts in Campo dos Vagalumes
    this.player = new Player(this, 420, 1200);

    this._buildPlants();
    GameState.plantSpawns = PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y }));
    this._buildCreature();
    this._buildPortal();
    this._buildFireflies();

    // Player glow + shadow (improves visibility)
    this.playerShadow = this.add.ellipse(this.player.x, this.player.y + 20, 32, 12, 0x000000, 0.35).setDepth(4);
    this.playerGlow   = this.add.circle(this.player.x, this.player.y, 24, 0x9575cd, 0.18).setDepth(9).setBlendMode('ADD');

    // Camera — snap immediately then lerp smoothly
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(1.8);
    this.cameras.main.startFollow(this.player, true, 1, 1); // instant on first frame
    this.time.delayedCall(50, () => this.cameras.main.setLerp(0.12, 0.12)); // then smooth

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.keyE     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyQ     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyM     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    // Launch HUD overlay
    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');

    // State
    this._nearPlant   = null;
    this._nearPortal  = false;
    this._vineClimbed = GameState.collected.has('trepadeira');
    this._currentArea = '';
    this._briefTimer  = 0;
    this._spellCooldown = 0;

    // Hint timers (idle guidance)
    this._hintLevel  = 0;
    this._butterflyTween = null;

    // Fade in
    this.cameras.main.fadeIn(800, 0, 0, 0);

    // Announce area on start
    this.time.delayedCall(900, () => {
      this._emitNarrative('Bem-vinda ao jardim, bruxinha. Explora. As plantas esperam por ti.');
    });

    // Listen for zone-level events
    this.game.events.on('plantStolen', this._onPlantStolen, this);

    // Zone 2 already unlocked?
    if (GameState.checkZone2Unlock() && !GameState.isZoneUnlocked('Zone2')) {
      GameState.unlockZone('Zone2');
    }
    // Vine already climbed → portal open
    if (this._vineClimbed && this.portal) {
      this.portal.unlock();
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Background
  // ──────────────────────────────────────────────────────────────────────
  _buildBackground() {
    const g = this.add.graphics();

    if (this.textures.exists('bg_zone1')) {
      // Tile Unsplash image across the world
      this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'bg_zone1')
        .setOrigin(0).setDepth(0);
      // Area tints
      g.fillStyle(0x0a2010, 0.45); g.fillRect(0, 0, 1100, WORLD_HEIGHT);
      g.fillStyle(0x121a0a, 0.45); g.fillRect(1100, 0, 1100, WORLD_HEIGHT);
      g.fillStyle(0x0a0f18, 0.55); g.fillRect(2200, 0, 1000, WORLD_HEIGHT);
    } else {
      g.fillStyle(0x0b2010, 1); g.fillRect(0,    0, 1100, WORLD_HEIGHT);
      g.fillStyle(0x141a0b, 1); g.fillRect(1100, 0, 1100, WORLD_HEIGHT);
      g.fillStyle(0x0a0e18, 1); g.fillRect(2200, 0, 1000, WORLD_HEIGHT);
    }
    g.setDepth(1);

    // Ground paths (dirt tracks)
    g.fillStyle(0x5d3f1e, 0.22);
    g.fillRect(380, 0, 90, WORLD_HEIGHT);           // main vertical path
    g.fillRect(0, 1180, WORLD_WIDTH, 80);           // horizontal connecting path
    g.fillRect(1060, 580, 200, 100);                // bridge to Jardim
    g.fillRect(2150, 740, 200, 100);                // bridge to Limiar

    // Dot grid pattern to give sense of scale/movement
    g.fillStyle(0xffffff, 0.04);
    for (let gx = 0; gx < WORLD_WIDTH; gx += 120) {
      for (let gy = 0; gy < WORLD_HEIGHT; gy += 120) {
        g.fillRect(gx, gy, 2, 2);
      }
    }
  }

  _buildDecorations() {
    const colors = [0x1b5e20, 0x2e7d32, 0x33691e, 0x1a237e, 0x1b3a20];
    TREE_POSITIONS.forEach(({ x, y }) => {
      const r = 28 + Math.random() * 44;
      const c = colors[Math.floor(Math.random() * colors.length)];
      this.add.circle(x, y, r, c, 0.75).setDepth(2);
      this.add.circle(x, y + r * 0.3, r * 0.65, c, 0.5).setDepth(2);
    });

    // Area boundary markers (subtle vertical line + glow)
    [1100, 2200].forEach(bx => {
      this.add.rectangle(bx, WORLD_HEIGHT / 2, 6, WORLD_HEIGHT, 0x4a3568, 0.25)
        .setDepth(3);
    });

    // Area labels in world (large, faded)
    [
      { x: 550,  y: 200, text: 'Campo dos Vagalumes' },
      { x: 1650, y: 200, text: 'Jardim Invertido'    },
      { x: 2700, y: 200, text: 'Limiar Secreto'      },
    ].forEach(({ x, y, text }) => {
      this.add.text(x, y, text, {
        fontSize: '22px', fontFamily: 'Georgia, serif',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0.25).setDepth(3);
    });
  }

  _buildVine() {
    this.vine = this.add.image(VINE_X, VINE_Y, 'vine')
      .setDisplaySize(44, 160).setDepth(6).setOrigin(0.5, 1);

    this.vineHint = this.add.text(VINE_X, VINE_Y - 170, '↑ Subir', {
      fontSize: '13px', fontFamily: 'Georgia, serif',
      color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      backgroundColor: '#00000066', padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setAlpha(0).setDepth(10);

    // Vine sway
    this.tweens.add({
      targets: this.vine,
      angle: { from: -4, to: 4 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  _buildPlants() {
    this.plants = [];
    PLANT_SPAWNS.forEach(({ id, x, y }) => {
      if (GameState.collected.has(id)) return; // already collected in a previous session
      const plantData = PLANTS[id];
      if (!plantData) return;

      // Find unique instance: if two farfalhas and one is collected, skip
      const alreadyHave = this.plants.filter(p => p.plantData.id === id).length;
      const totalSpawns = PLANT_SPAWNS.filter(s => s.id === id).length;
      if (alreadyHave > 0 && totalSpawns > 1 && GameState.collected.has(id)) return;

      const plant = new Plant(this, x, y, plantData);
      // Sombravinha starts invisible (Zone 3), but in Zone 1 all plants visible
      this.plants.push(plant);
    });
  }

  _buildCreature() {
    this.creature = new Creature(this, 1820, 1640, 'creature_farfalha', {
      type: 'farfalha',
      followRange: 550,
      stealThreshold: 2800,
      speed: 85,
    });
  }

  _buildPortal() {
    const locked = !this._vineClimbed;
    this.portal = new Portal(this, 2780, 460, {
      portalId: 'zone1_limiar',
      destination: 'Zone2',
      locked,
    });
  }

  _buildFireflies() {
    // Only in Campo dos Vagalumes (x 0-1100)
    this.add.particles(0, 0, 'firefly', {
      x: { min: 40, max: 1060 },
      y: { min: 50, max: WORLD_HEIGHT - 50 },
      lifespan: { min: 2500, max: 5000 },
      speed: { min: 8, max: 30 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.9, end: 0 },
      quantity: 1,
      frequency: 180,
      blendMode: 'ADD',
    }).setDepth(7);

    // Sparse fireflies in other zones
    this.add.particles(0, 0, 'firefly', {
      x: { min: 1100, max: 3150 },
      y: { min: 50, max: WORLD_HEIGHT - 50 },
      lifespan: { min: 1800, max: 3500 },
      speed: { min: 5, max: 18 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.6, end: 0 },
      quantity: 1,
      frequency: 600,
      blendMode: 'ADD',
    }).setDepth(7);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Update loop
  // ──────────────────────────────────────────────────────────────────────
  update(time, delta) {
    this.player.update(this.cursors, this.wasd, this.keyShift, delta);
    this.creature.update(this.player, delta, GameState);

    // Keep glow/shadow on player
    this.playerGlow.setPosition(this.player.x, this.player.y);
    this.playerShadow.setPosition(this.player.x, this.player.y + 20);

    // Expose position to HUD minimap
    GameState.playerX = this.player.x;
    GameState.playerY = this.player.y;

    this._checkAreaChange();
    this._checkPlantProximity(time);
    this._checkVineProximity();
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateHints(delta);
    this._checkZoneUnlocks();

    if (this._spellCooldown > 0) this._spellCooldown -= delta;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Area detection
  // ──────────────────────────────────────────────────────────────────────
  _checkAreaChange() {
    const px = this.player.x;
    let area = 'campoVagalumes';
    if (px >= 2200) area = 'limiarSecreto';
    else if (px >= 1100) area = 'jardimInvertido';

    if (area !== this._currentArea) {
      this._currentArea = area;
      this.game.events.emit('areaChanged', AREAS[area].label);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Proximity checks
  // ──────────────────────────────────────────────────────────────────────
  _checkPlantProximity(time) {
    this._nearPlant = null;
    this.plants.forEach(plant => {
      if (plant.isCollected || !plant.isVisible) return;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, plant.x, plant.y
      );
      const inRange = dist < PLAYER_INTERACTION_RADIUS;
      plant.showHint(inRange);

      if (inRange) {
        this._nearPlant = plant;

        // Ventoinha: spin if player approaches slowly
        if (plant.plantData.id === 'ventoinha' && this.player.recentSpeed < 70) {
          plant.spinAndHide();
        }
      }
    });
  }

  _checkVineProximity() {
    if (this._vineClimbed) { this.vineHint?.setAlpha(0); return; }
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, VINE_X, VINE_Y
    );
    const near = dist < 90;
    this.tweens.add({ targets: this.vineHint, alpha: near ? 1 : 0, duration: 180 });
  }

  _checkPortalProximity() {
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.portal.x, this.portal.y
    );
    this._nearPortal = dist < 65;
    this.portal.showHint(this._nearPortal);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Key handling
  // ──────────────────────────────────────────────────────────────────────
  _handleKeys(time, delta) {
    // E — interact / collect
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this._handleInteract(time);
    }

    // Space — cast spell
    if (Phaser.Input.Keyboard.JustDown(this.keySpace) && this._spellCooldown <= 0) {
      this._castSpell();
    }

    // Q — cycle spell
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      GameState.cycleSpell();
      this.game.events.emit('spellCast', GameState.activeSpell);
    }

    // M — open map overlay (pause zone, don't restart it)
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) {
      this.scene.pause();
      this.scene.launch('Map');
    }

    // Up arrow near vine → climb
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.up)) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, VINE_X, VINE_Y
      );
      if (!this._vineClimbed && dist < 90) {
        this._climbVine();
      }
    }
  }

  _handleInteract(time) {
    // Portal first
    if (this._nearPortal) { this._usePortal(); return; }

    if (!this._nearPlant) return;
    const plant = this._nearPlant;
    const method = plant.plantData.collectMethod;

    switch (method) {
      case 'fast':
        if (this.player.recentSpeed >= 140) {
          this._collectPlant(plant);
        } else {
          this._emitNarrative('Move-te mais rápido para apanhar a ventoinha! (mantém Shift)');
          plant.spinAndHide();
        }
        break;

      case 'shake': {
        const ready = plant.shake(time);
        if (ready) {
          this._collectPlant(plant);
        } else {
          const left = 5 - plant.shakeCount;
          this._emitNarrative(`Sacude mais ${left} vez${left !== 1 ? 'es' : ''}…`);
        }
        break;
      }

      case 'spell':
        if (GameState.activeSpell === 'brisa_molhada') {
          this._castSpellOnPlant(plant);
        } else if (GameState.availableSpells.includes('brisa_molhada')) {
          this._emitNarrative('Activa a Brisa Molhada (Q para mudar, Espaço para lançar) sobre a Farfalha.');
        } else {
          this._emitNarrative('Esta planta está protegida. Precisas de um feitiço especial…');
        }
        break;

      case 'climb':
        this._climbVine();
        break;

      default:
        this._collectPlant(plant);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Vine climbing
  // ──────────────────────────────────────────────────────────────────────
  _climbVine() {
    if (this._vineClimbed || this.player.isClimbing) return;
    this._vineClimbed = true;
    this.player.isClimbing = true;
    this.player.setVelocity(0, 0);

    this._emitNarrative('A trepadeira te leva a um lugar escondido…');

    this.tweens.add({
      targets: this.player,
      x: VINE_X + 40,
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

        // Collect trepadeira
        const vine = this.plants.find(p => p.plantData.id === 'trepadeira' && !p.isCollected);
        if (vine) this._collectPlant(vine);
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Spell casting
  // ──────────────────────────────────────────────────────────────────────
  _castSpell() {
    if (!GameState.activeSpell) return;
    this._spellCooldown = 1200;

    const spellDef = SPELLS[GameState.activeSpell];
    this._showSpellFX(spellDef.textureKey);
    this.game.events.emit('spellCast', GameState.activeSpell);

    if (GameState.activeSpell === 'brisa_molhada') {
      const distToCreature = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.creature.x, this.creature.y
      );
      if (distToCreature < 260) {
        this.creature.repel(this.player.x, this.player.y);
        this._emitNarrative('A Brisa Molhada afastou a criatura!');
      }
    }

    if (GameState.activeSpell === 'canto_jardim') {
      this._revealAllPlants();
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
      targets: fx,
      scale: 4,
      alpha: 0,
      duration: 700,
      ease: 'Power2.easeOut',
      onComplete: () => fx.destroy(),
    });
  }

  _revealAllPlants() {
    this.plants.forEach(p => {
      if (p.isCollected) return;
      // Brief camera pan toward uncollected plant
      const origX = this.cameras.main.scrollX;
      const origY = this.cameras.main.scrollY;
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

  // ──────────────────────────────────────────────────────────────────────
  //  Plant collection
  // ──────────────────────────────────────────────────────────────────────
  _collectPlant(plant) {
    if (plant.isCollected) return;
    const data = plant.plantData;
    const added = GameState.addPlant(data);
    if (!added) {
      this._emitNarrative('A mochila está cheia! Tens 6 plantas.');
      return;
    }

    plant.collect();
    // Remove all instances of the same plant (duplicate spawns)
    this.plants = this.plants.filter(p => {
      if (p !== plant && p.plantData.id === data.id) { p.destroy(); return false; }
      return p !== plant;
    });

    this._emitNarrative(data.narrativeText, 4200);
    this.game.events.emit('plantCollected', data, data);

    // Zone 2 check
    if (!GameState.isZoneUnlocked('Zone2') && GameState.checkZone2Unlock()) {
      GameState.unlockZone('Zone2');
      this.time.delayedCall(5000, () => {
        this._emitNarrative('Um novo caminho abriu-se. A Zona 2 está acessível pelo portal!');
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Portal
  // ──────────────────────────────────────────────────────────────────────
  _usePortal() {
    if (this.portal.isLocked) {
      this._emitNarrative('Este portal está fechado. Sobe a trepadeira primeiro!');
      return;
    }
    if (!GameState.isZoneUnlocked('Zone2')) {
      this._emitNarrative('Precisas de Farfalha, Ventoinha-branca e Trepadeira-viva para abrir o próximo caminho.');
      return;
    }
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.events.off('plantStolen', this._onPlantStolen, this);
      this.scene.start('Zone2');
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Hints system
  // ──────────────────────────────────────────────────────────────────────
  _updateHints(delta) {
    const still = this.player.stillTime;

    if (still > 30000 && this._hintLevel < 1) {
      this._hintLevel = 1;
      this._showButterfly();
    }
    if (still > 65000 && this._hintLevel < 2) {
      this._hintLevel = 2;
      this._emitNarrative('(a avó murmura ao longe…) — procura o brilho das plantas.');
    }
    if (still > 95000 && this._hintLevel < 3) {
      this._hintLevel = 3;
      this.game.events.emit('bagGlow');
    }

    // Reset hint level when player moves
    if (still < 500) this._hintLevel = 0;
  }

  _showButterfly() {
    const b = this.add.image(this.player.x, this.player.y, 'butterfly')
      .setDepth(20).setAlpha(0.9);

    // Nearest plant direction
    let nearestDist = Infinity, nearestPlant = null;
    this.plants.forEach(p => {
      if (p.isCollected) return;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
      if (d < nearestDist) { nearestDist = d; nearestPlant = p; }
    });

    const tx = nearestPlant ? nearestPlant.x : this.player.x + 200;
    const ty = nearestPlant ? nearestPlant.y : this.player.y - 100;

    this.tweens.add({
      targets: b,
      x: tx, y: ty,
      alpha: 0,
      duration: 2000,
      ease: 'Sine.easeInOut',
      onComplete: () => b.destroy(),
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Zone unlock checks
  // ──────────────────────────────────────────────────────────────────────
  _checkZoneUnlocks() {
    if (!GameState.isZoneUnlocked('Zone2') && GameState.checkZone2Unlock()) {
      GameState.unlockZone('Zone2');
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Narrative helper
  // ──────────────────────────────────────────────────────────────────────
  _emitNarrative(text, dur = 3500) {
    this.game.events.emit('showNarrative', text, dur);
  }

  _onPlantStolen(plant) {
    this._emitNarrative(`A criatura de fogo roubou a ${plant.name}! Usa o feitiço Brisa Molhada.`, 4000);
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Cleanup
  // ──────────────────────────────────────────────────────────────────────
  shutdown() {
    this.game.events.off('plantStolen', this._onPlantStolen, this);
  }
}
