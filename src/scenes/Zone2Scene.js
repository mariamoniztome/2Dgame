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
import { MusicManager } from '../MusicManager.js';

// Zone 2 — 1280 wide × 2160 tall, four sub-areas stacked top → bottom
const ZONE_H = 540; // four zones: 540×4 = 2160

const AREAS = {
  planiciesFendas: { label: 'Planície das Fendas',   minY: 0,          maxY: ZONE_H     },
  jardimSelvagem:  { label: 'Jardim Selvagem',        minY: ZONE_H,     maxY: ZONE_H * 2 },
  planalto:        { label: 'Planalto dos Furacões',  minY: ZONE_H * 2, maxY: ZONE_H * 3 },
  pantano:         { label: 'Pântano',                minY: ZONE_H * 3, maxY: ZONE_H * 4 },
};

// Lily pad positions in Pântano (world y = ZONE_H*3 + localY)
const LILY_PADS = [
  { x: 200, ly: 60  }, { x: 420, ly: 120 }, { x: 640, ly: 80  },
  { x: 860, ly: 160 }, { x: 1080,ly: 100 }, { x: 300, ly: 200 },
  { x: 580, ly: 240 }, { x: 780, ly: 300 }, { x: 500, ly: 380 },
  { x: 900, ly: 420 }, { x: 200, ly: 340 }, { x: 1100,ly: 340 },
  { x: 350, ly: 460 }, { x: 700, ly: 460 }, { x: 950, ly: 480 },
];

const PLANT_SPAWNS = [
  { id: 'tezaluz',        x: 640,  y: 200  },
  { id: 'craveira',       x: 320,  y: 380  },
  { id: 'espinhosa_doce', x: 900,  y: 750  },
  { id: 'bocarra',        x: 420,  y: 920  },
  { id: 'aurorabromelia', x: 750,  y: 1340 },  // Planalto — needs Flutueminem
  { id: 'ninfaria',       x: 500,  y: ZONE_H * 3 + 380 },  // inside Pântano lake
];

const TREE_COLORS = [0x1a3a2a, 0x0d3020, 0x2a1a08, 0x182a10];
const TREE_POS = [
  {x: 80, y:180},{x:300, y: 80},{x:550, y:290},{x:180, y:480},{x:800, y:400},
  {x:1050,y:200},{x:200, y:760},{x:680, y:820},{x:950, y:680},{x:400, y:950},
  {x:1150,y:900},{x:640, y:1150},{x:180,y:1280},{x:900,y:1300},{x:400,y:1500},
  {x:720, y:1650},{x:200,y:1800},{x:1000,y:1750},{x:600,y:1950},{x:1100,y:2050},
];

export class Zone2Scene extends Phaser.Scene {
  constructor() { super('Zone2'); }

  create() {
    GameState.currentZone = 'Zone2';
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this._buildBackground();

    this.player = new Player(this, 640, 200);
    this._buildPlants();
    GameState.plantSpawns = PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y }));
    this._buildCreatures();
    this._buildPortals();
    this._buildLilyPads();

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

    const ph1 = this.player.displayHeight;
    this.playerShadow = this.add.ellipse(
      this.player.x, this.player.y + Math.round(ph1 * 0.24),
      Math.round(ph1 * 0.16), Math.max(4, Math.round(ph1 * 0.038)),
      0x000000, 0.28
    ).setDepth(4);

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

    // ── Area-specific state ──────────────────────────────────────────────────
    // Planície das Fendas
    this._fendas          = [];   // active crack objects
    this._fendaTimer      = 0;   // countdown to next crack
    this._fendaInterval   = Phaser.Math.Between(5000, 12000);

    // Planalto dos Furacões
    this._gustTimer       = 30000; // first gust after 30s
    this._gustActive      = false;
    this._gustDuration    = 0;
    this._gustVX          = 0;
    this._gustVY          = 0;
    this._furacaoCreature = null;
    this._holes           = [];    // safe holes on ground

    // Jardim Selvagem — moving roots (visual)
    this._roots           = [];

    // Pântano
    this._waterDamageTimer = 0;    // sinking timer when on water (not lily pad)
    this._onLilyPad        = false;
    this._memoriaSoloActive = false;
    this._footprints        = [];

    // Bocarra plant state
    this._bocarraBlowing   = false;
    this._bocarraTimer     = 0;
    this._bocarraBlowDur   = 0;

    // Sussurro-ladrão (in Jardim Selvagem per GDD)
    this._ladraoSpawnTimer = 20000;
    this._ladrao           = null;
    this._ladraoStole      = false;

    this.cameras.main.fadeIn(800, 0, 0, 0);
    this.game.events.on('plantStolen', this._onPlantStolen, this);

    MusicManager.init(this);
    this.time.delayedCall(200, () => MusicManager.playArea('planiciesFendas'));

    this.time.delayedCall(900, () => {
      this._emitNarrative('A floresta densa esconde segredos mais profundos. Avança com coragem.');
    });

    this._buildJardimRoots();
    this._buildPlanaltoHoles();
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Background
  // ──────────────────────────────────────────────────────────────────────────
  _buildBackground() {
    const g = this.add.graphics();
    if (this.textures.exists('bg_zone2')) {
      this.add.image(0, 0, 'bg_zone2').setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(0);
      g.fillStyle(0x071208, 0.5); g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    } else {
      // Sub-area colour bands
      g.fillStyle(0x1a2e1a, 1); g.fillRect(0, 0,            WORLD_WIDTH, ZONE_H);     // Planície
      g.fillStyle(0x0e2010, 1); g.fillRect(0, ZONE_H,       WORLD_WIDTH, ZONE_H);     // Jardim
      g.fillStyle(0x1a1a2e, 1); g.fillRect(0, ZONE_H * 2,   WORLD_WIDTH, ZONE_H);     // Planalto
      g.fillStyle(0x0a1e18, 1); g.fillRect(0, ZONE_H * 3,   WORLD_WIDTH, ZONE_H);     // Pântano
    }
    g.setDepth(1);

    // Pântano water pools
    g.fillStyle(0x0d2018, 0.6);
    g.fillEllipse(640, ZONE_H * 3 + 270, 900, 400);
    g.fillEllipse(280, ZONE_H * 3 + 440, 500, 260);
    g.fillEllipse(950, ZONE_H * 3 + 400, 550, 280);
    g.fillStyle(0x1a3a28, 0.35);
    g.fillEllipse(640, ZONE_H * 3 + 300, 800, 360);

    // Pântano water surface shimmer markers (static)
    g.fillStyle(0x2a5040, 0.2);
    for (let i = 0; i < 8; i++) {
      g.fillEllipse(
        100 + i * 140, ZONE_H * 3 + 200 + (i % 3) * 80,
        60 + (i % 4) * 20, 20
      );
    }

    TREE_POS.forEach(({ x, y }) => {
      const c = TREE_COLORS[Math.floor(Math.random() * TREE_COLORS.length)];
      const r = 30 + Math.random() * 50;
      this.add.circle(x, y, r, c, 0.8).setDepth(2);
      this.add.circle(x + 10, y + r * 0.3, r * 0.6, c, 0.5).setDepth(2);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Jardim Selvagem — moving root visuals (GDD: raízes mudam caminhos)
  // ──────────────────────────────────────────────────────────────────────────
  _buildJardimRoots() {
    const baseY = ZONE_H;
    for (let i = 0; i < 12; i++) {
      const x = Phaser.Math.Between(80, 1200);
      const y = baseY + Phaser.Math.Between(20, ZONE_H - 40);
      const w = Phaser.Math.Between(60, 180);
      const h = Phaser.Math.Between(8, 18);
      const root = this.add.rectangle(x, y, w, h, 0x2a1a08, 0.75).setDepth(3);
      this._roots.push({ obj: root, baseX: x, baseY: y, speed: 0.3 + Math.random() * 0.5 });

      // Animate each root drifting sideways
      this.tweens.add({
        targets: root,
        x: x + Phaser.Math.Between(-120, 120),
        duration: 3000 + Math.random() * 3000,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Planalto dos Furacões — safe holes to hide in
  // ──────────────────────────────────────────────────────────────────────────
  _buildPlanaltoHoles() {
    const baseY = ZONE_H * 2;
    const holePositions = [
      { x: 160, y: baseY + 80  },
      { x: 500, y: baseY + 200 },
      { x: 850, y: baseY + 120 },
      { x: 220, y: baseY + 350 },
      { x: 700, y: baseY + 380 },
      { x: 1080,y: baseY + 300 },
    ];
    holePositions.forEach(pos => {
      const h = this.add.ellipse(pos.x, pos.y, 52, 28, 0x0a0a12, 0.9).setDepth(3);
      this.add.ellipse(pos.x, pos.y, 40, 20, 0x050508, 1).setDepth(3);
      this._holes.push({ x: pos.x, y: pos.y, radius: 32 });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Lily pads — safe platforms in Pântano
  // ──────────────────────────────────────────────────────────────────────────
  _buildLilyPads() {
    this._lilyPadObjs = [];
    const baseY = ZONE_H * 3;
    LILY_PADS.forEach(({ x, ly }) => {
      const pad = this.add.ellipse(x, baseY + ly, 70, 38, 0x1a5a28, 0.85).setDepth(3);
      // Subtle wobble
      this.tweens.add({
        targets: pad,
        x: x + Phaser.Math.Between(-25, 25),
        duration: 2000 + Math.random() * 2000,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 1500,
      });
      this._lilyPadObjs.push({ obj: pad, baseX: x, baseY: baseY + ly });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Plants
  // ──────────────────────────────────────────────────────────────────────────
  _buildPlants() {
    this.plants = [];
    PLANT_SPAWNS.forEach(({ id, x, y }) => {
      if (GameState.collected.has(id)) return;
      const data = PLANTS[id];
      if (!data) return;
      this.plants.push(new Plant(this, x, y, data));
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Creatures — Bocarra (Zone2 per GDD), Sussurro-ladrão (Jardim Selvagem)
  // ──────────────────────────────────────────────────────────────────────────
  _buildCreatures() {
    // Bocarra creature removed — Bocarra is only a plant here.
    // Sussurro-ladrão spawns later via _scheduleLadrao()
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Portals
  // ──────────────────────────────────────────────────────────────────────────
  _buildPortals() {
    this.portalBack = new Portal(this, 200, 200, {
      portalId: 'zone2_back',
      destination: 'Zone1',
      locked: false,
    });
    this.portalForward = new Portal(this, 1050, WORLD_HEIGHT - 200, {
      portalId: 'zone2_forward',
      destination: 'Zone3',
      locked: !GameState.isZoneUnlocked('Zone3'),
    });
    this._portals = [this.portalBack, this.portalForward];
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Update
  // ──────────────────────────────────────────────────────────────────────────
  update(time, delta) {
    this.player.update(this.cursors, this.wasd, this.keyShift, delta);
    const ph = this.player.displayHeight;
    this.playerShadow.setPosition(this.player.x, this.player.y + Math.round(ph * 0.24));
    this.playerShadow.setSize(Math.round(ph * 0.16), Math.max(4, Math.round(ph * 0.038)));
    GameState.playerX = this.player.x;
    GameState.playerY = this.player.y;

    this._checkAreaChange();
    this._checkPlantProximity(time, delta);
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateFootsteps(delta);
    this._checkZoneUnlocks();
    this._updateAreaMechanics(time, delta);
    this._updateLadrao(delta);
    this._updateBocarra(delta);

    if (this._spellCooldown > 0) this._spellCooldown -= delta;
    if (this._ladraoSpawnTimer > 0) {
      this._ladraoSpawnTimer -= delta;
      if (this._ladraoSpawnTimer <= 0 && GameState.inventory.length > 0) {
        this._spawnLadrao();
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Area detection
  // ──────────────────────────────────────────────────────────────────────────
  _checkAreaChange() {
    const py = this.player.y;
    let area = 'planiciesFendas';
    if (py >= ZONE_H * 3) area = 'pantano';
    else if (py >= ZONE_H * 2) area = 'planalto';
    else if (py >= ZONE_H) area = 'jardimSelvagem';

    if (area !== this._currentArea) {
      const prev = this._currentArea;
      this._currentArea = area;
      GameState.currentArea = area;
      this.game.events.emit('areaChanged', AREAS[area].label);

      // Cancel Terramemoria footprints when leaving Planície
      if (prev === 'planiciesFendas' && area !== 'planiciesFendas') {
        this._clearFootprints();
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Area-specific mechanics dispatcher
  // ──────────────────────────────────────────────────────────────────────────
  _updateAreaMechanics(time, delta) {
    switch (this._currentArea) {
      case 'planiciesFendas': this._updateFendas(delta); break;
      case 'planalto':        this._updatePlanalto(delta); break;
      case 'pantano':         this._updatePantano(delta); break;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Planície das Fendas — random cracks (GDD: 10s open, fall → Jardim Invertido)
  // ──────────────────────────────────────────────────────────────────────────
  _updateFendas(delta) {
    this._fendaTimer -= delta;
    if (this._fendaTimer <= 0) {
      this._spawnFenda();
      this._fendaInterval = Phaser.Math.Between(5000, 14000);
      this._fendaTimer = this._fendaInterval;
    }

    // Check if player is on an open fenda
    if (this.player.isFlying) return;
    for (const f of this._fendas) {
      if (!f.active) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, f.x, f.y
      );
      if (dist < f.radius) {
        this._fallIntoFenda(f);
        break;
      }
    }
  }

  _spawnFenda(forcedX, forcedY) {
    const x = forcedX ?? Phaser.Math.Between(80, 1200);
    const y = forcedY ?? Phaser.Math.Between(20, ZONE_H - 40);
    const radius = Phaser.Math.Between(28, 48);

    const fendaGfx = this.add.ellipse(x, y, radius * 2, radius * 0.6, 0x050508, 0.95).setDepth(5);
    const fendaObj = { x, y, radius, gfx: fendaGfx, active: true, timer: 10000 };
    this._fendas.push(fendaObj);

    // Warning pulse (cracks appear with a crack sound-like shake)
    this.cameras.main.shake(80, 0.002);
    this._emitNarrative('O chão está a rachar!', 1800);

    // Animate open
    this.tweens.add({
      targets: fendaGfx,
      scaleX: 1.3, scaleY: 1.8,
      duration: 400, ease: 'Back.easeOut',
    });

    // Auto-close after 10s
    this.time.delayedCall(10000, () => {
      if (!fendaGfx.active) return;
      this.tweens.add({
        targets: fendaGfx,
        scaleX: 0, scaleY: 0,
        alpha: 0, duration: 500,
        onComplete: () => {
          fendaGfx.destroy();
          fendaObj.active = false;
        },
      });
    });

    // Clean up inactive from array periodically
    this._fendas = this._fendas.filter(f => f.active || f.gfx?.active);
  }

  _fallIntoFenda(f) {
    if (this._falling) return;
    this._falling = true;
    f.active = false;

    this._emitNarrative('Caíste numa fenda! O Jardim Invertido…', 3000);
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.fadeOut(800, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.events.off('plantStolen', this._onPlantStolen, this);
      this.game.registry.set('startArea', 'jardimInvertido');
      this.scene.start('Zone1');
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Planalto dos Furacões — wind gusts every 30s + Furacão creature
  // ──────────────────────────────────────────────────────────────────────────
  _updatePlanalto(delta) {
    if (this._gustActive) {
      // Apply gust velocity override on top of player input
      if (this.player.body) {
        this.player.body.velocity.x += this._gustVX * delta * 0.001;
        this.player.body.velocity.y += this._gustVY * delta * 0.001;
      }
      this._gustDuration -= delta;
      if (this._gustDuration <= 0) {
        this._gustActive = false;
        this._emitNarrative('A rajada passou.', 1500);
      }
      return;
    }

    this._gustTimer -= delta;
    if (this._gustTimer <= 0) {
      this._triggerGust();
      this._gustTimer = 30000;
    }

    // Furacão creature — only while player is flying
    if (this.player.isFlying && !this._furacaoCreature?.active) {
      this._spawnFuracaoCreature();
    }
    if (this._furacaoCreature?.active) {
      this._updateFuracaoCreature(delta);
    }
  }

  _triggerGust() {
    // Warning 2s before gust
    this._emitNarrative('Sentes uma brisa forte a aproximar-se…', 2000);
    this.time.delayedCall(2000, () => {
      if (this._currentArea !== 'planalto') return;
      const angle = Math.random() * Math.PI * 2;
      const strength = 400;
      this._gustVX = Math.cos(angle) * strength;
      this._gustVY = Math.sin(angle) * strength;
      this._gustDuration = 1800;
      this._gustActive = true;
      this.cameras.main.shake(300, 0.006);
      this._emitNarrative('Rajada de vento!', 2000);

      // Visual: wind particles in gust direction
      const px = this.player.x, py = this.player.y;
      for (let i = 0; i < 8; i++) {
        const trail = this.add.rectangle(
          px + Math.cos(angle) * i * 30,
          py + Math.sin(angle) * i * 30,
          40, 4, 0xd0e8f0, 0.5
        ).setDepth(15).setAngle(Phaser.Math.RadToDeg(angle));
        this.tweens.add({
          targets: trail, alpha: 0,
          x: trail.x + Math.cos(angle) * 200,
          y: trail.y + Math.sin(angle) * 200,
          duration: 800,
          onComplete: () => trail.destroy(),
        });
      }
    });
  }

  _spawnFuracaoCreature() {
    // Furacão: fast-moving vortex that steals plants and sends player to Jardim Invertido
    const sx = Phaser.Math.Between(80, 1200);
    const sy = ZONE_H * 2 + Phaser.Math.Between(20, ZONE_H - 20);
    this._furacaoCreature = this.add.circle(sx, sy, 28, 0xd0e0ff, 0.7)
      .setDepth(12);
    this._furacaoCreature._vx = 0;
    this._furacaoCreature._vy = 0;
    this._furacaoCreature._caught = false;
    this._emitNarrative('Um furacão aproxima-se! Aterra e esconde-te num buraco!', 3500);
  }

  _updateFuracaoCreature(delta) {
    const f = this._furacaoCreature;
    if (!f.active || f._caught) return;

    // Chase player
    const dx = this.player.x - f.x;
    const dy = this.player.y - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 110;
    if (dist > 10) {
      f._vx = (dx / dist) * speed;
      f._vy = (dy / dist) * speed;
    }
    f.x += f._vx * delta / 1000;
    f.y += f._vy * delta / 1000;
    f.setAngle(f.angle + 8); // spinning visual

    // Check if player is safe in a hole (not flying, near hole)
    if (!this.player.isFlying) {
      for (const hole of this._holes) {
        const hd = Phaser.Math.Distance.Between(this.player.x, this.player.y, hole.x, hole.y);
        if (hd < hole.radius) {
          // Safe — furacão backs off
          this._furacaoFlee();
          return;
        }
      }
    }

    // Catch player
    if (dist < 36) {
      f._caught = true;
      const stolen = GameState.stealLastPlant();
      if (stolen) {
        this.game.events.emit('plantStolen', stolen);
        this._emitNarrative(`O furacão levou a ${stolen.name} e lança-te para o Jardim Invertido!`, 3500);
      } else {
        this._emitNarrative('O furacão lança-te para o Jardim Invertido!', 2500);
      }
      this.cameras.main.shake(300, 0.012);
      this.cameras.main.fadeOut(900, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.game.events.off('plantStolen', this._onPlantStolen, this);
        this.game.registry.set('startArea', 'jardimInvertido');
        this.scene.start('Zone1');
      });
    }
  }

  _furacaoFlee() {
    const f = this._furacaoCreature;
    if (!f?.active) return;
    this.tweens.add({
      targets: f, alpha: 0, scaleX: 3, scaleY: 3, duration: 800,
      onComplete: () => f.destroy(),
    });
    this._emitNarrative('Estás a salvo no buraco!', 2000);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Pântano — water sinking, lily pad safety, Ninfária swim unlock
  // ──────────────────────────────────────────────────────────────────────────
  _updatePantano(delta) {
    if (this.player.isFlying) { this._waterDamageTimer = 0; return; }

    // Check if player is on a lily pad
    const onPad = this._lilyPadObjs.some(pad => {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, pad.obj.x, pad.obj.y
      );
      return dist < 38;
    });

    const inWater = this.player.y > ZONE_H * 3 + 40;

    if (inWater && !onPad) {
      this._waterDamageTimer += delta;
      // Slow the player in water
      if (this.player.body) {
        this.player.body.velocity.x *= 0.7;
        this.player.body.velocity.y *= 0.7;
      }
      if (this._waterDamageTimer > 3500 && !this._waterWarned) {
        this._waterWarned = true;
        this._emitNarrative('A água está a puxar-te para baixo! Salta para uma folha!', 3000);
      }
      if (this._waterDamageTimer > 7000) {
        this._waterDamageTimer = 0;
        this._waterWarned = false;
        this._emitNarrative('Foste arrastada pelas águas do Pântano…', 2500);
        this.cameras.main.fadeOut(700, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.game.events.off('plantStolen', this._onPlantStolen, this);
          this.game.registry.set('startArea', 'jardimInvertido');
          this.scene.start('Zone1');
        });
      }
    } else {
      if (this._waterDamageTimer > 0) this._waterWarned = false;
      this._waterDamageTimer = Math.max(0, this._waterDamageTimer - delta * 2);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Bocarra plant — wind-timing mechanic (wait for it to stop blowing)
  // ──────────────────────────────────────────────────────────────────────────
  _updateBocarra(delta) {
    const bocarraPlant = this.plants.find(p => p.plantData.id === 'bocarra' && !p.isCollected);
    if (!bocarraPlant) return;

    this._bocarraTimer += delta;
    if (this._bocarraBlowing) {
      // Blowing phase: 2-4 seconds
      if (this._bocarraTimer > this._bocarraBlowDur) {
        this._bocarraBlowing = false;
        this._bocarraTimer = 0;
        this._bocarraBlowDur = 0;
        bocarraPlant.setAlpha(1); // fully visible when quiet
      } else {
        // Visual: plant pulses while blowing
        bocarraPlant.setAlpha(0.5 + Math.sin(this._bocarraTimer * 0.01) * 0.4);
      }
    } else {
      // Quiet phase: 2-5 seconds
      const quietDur = Phaser.Math.Between(2000, 5000);
      if (this._bocarraTimer > quietDur) {
        this._bocarraBlowing = true;
        this._bocarraTimer = 0;
        this._bocarraBlowDur = Phaser.Math.Between(2000, 4000);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Sussurro-ladrão — Jardim Selvagem (per GDD)
  // ──────────────────────────────────────────────────────────────────────────
  _spawnLadrao() {
    if (this._ladrao?.active) return;
    // Spawn in Jardim Selvagem area
    const sx = Phaser.Math.Between(80, 1200);
    const sy = ZONE_H + Phaser.Math.Between(20, ZONE_H - 20);
    this._ladrao = this.add.image(sx, sy, 'sussurro_ladrao')
      .setDisplaySize(44, 38).setAlpha(0).setDepth(9);
    this._ladraoStole = false;
    this.tweens.add({ targets: this._ladrao, alpha: 0.85, duration: 900 });
    this._emitNarrative('Uma sombra rasteja entre as raízes…', 2500);
  }

  _updateLadrao(delta) {
    if (!this._ladrao?.active || this._ladraoStole) return;
    // Only active in Jardim Selvagem
    if (this._currentArea !== 'jardimSelvagem') return;
    if (GameState.inventory.length === 0) { this._despawnLadrao(false); return; }

    const dist = Phaser.Math.Distance.Between(
      this._ladrao.x, this._ladrao.y, this.player.x, this.player.y
    );
    const spd = dist < 180 ? 70 : 40;
    const ang = Math.atan2(this.player.y - this._ladrao.y, this.player.x - this._ladrao.x);
    this._ladrao.x += Math.cos(ang) * spd * (delta / 1000);
    this._ladrao.y += Math.sin(ang) * spd * (delta / 1000);
    this._ladrao.setFlipX(Math.cos(ang) < 0);

    if (dist < 180) {
      this._ladrao.setAlpha(0.6 + Math.sin(Date.now() * 0.01) * 0.3);
    }
    if (dist < 50) {
      this._ladraoStole = true;
      const stolen = GameState.stealLastPlant();
      if (stolen) this.game.events.emit('plantStolen', stolen);
      const fleeAng = ang + Math.PI;
      this.tweens.add({
        targets: this._ladrao,
        x: this._ladrao.x + Math.cos(fleeAng) * 400,
        y: this._ladrao.y + Math.sin(fleeAng) * 150,
        alpha: 0, duration: 1600, ease: 'Power2.easeIn',
        onComplete: () => this._despawnLadrao(true),
      });
    }
  }

  _despawnLadrao(stole) {
    this._ladrao?.destroy();
    this._ladrao = null;
    const delay = stole ? Phaser.Math.Between(35000, 55000) : Phaser.Math.Between(20000, 35000);
    this._ladraoSpawnTimer = delay;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Plant proximity
  // ──────────────────────────────────────────────────────────────────────────
  _checkPlantProximity(time, delta) {
    this._nearPlant = null;
    let foundNear = false;

    this.plants.forEach(plant => {
      if (plant.isCollected || !plant.isVisible) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, plant.x, plant.y);
      const inRange = dist < PLAYER_INTERACTION_RADIUS;
      const method = plant.plantData.collectMethod;

      if (!inRange) { plant.showHint(false); return; }
      this._nearPlant = plant;
      foundNear = true;

      // Bocarra timing — can only collect when not blowing
      if (method === 'timing') {
        const canCollect = !this._bocarraBlowing;
        plant.showHint(inRange, canCollect ? 'C' : 'Espera…');
        if (!canCollect && !plant._bocarraWarnShown) {
          plant._bocarraWarnShown = true;
          this._emitNarrative('A Bocarra está a soprar — espera que pare!', 2500);
        }
        return;
      }

      // Aurorabromélia — requires Flutueminem (fly)
      if (method === 'fly_collect') {
        plant.showHint(inRange, this.player.isFlying ? 'C' : '✈ Flutueminem');
        if (!this.player.isFlying && !plant._flyHintShown) {
          plant._flyHintShown = true;
          this._emitNarrative('Esta planta está muito alta! Usa o Flutueminem para a alcançar.', 3500);
        }
        return;
      }

      // Ninfária — swim (must enter the water area near plant)
      if (method === 'swim') {
        const inWater = this.player.y > ZONE_H * 3 + 40;
        plant.showHint(inRange, inWater ? 'C' : 'Entra na água');
        if (!inWater && !plant._swimHintShown) {
          plant._swimHintShown = true;
          this._emitNarrative('A Ninfária surge das profundezas… entra na água do Pântano!', 3500);
        }
        return;
      }

      // Tezaluz — cool with Gotateia (need Gotateia in inventory)
      if (method === 'cool') {
        const hasGotateia = GameState.collected.has('gotateia');
        plant.showHint(inRange, hasGotateia ? 'C' : 'Precisa Gotateia');
        if (!hasGotateia && !plant._coolHintShown) {
          plant._coolHintShown = true;
          this._emitNarrative('A Tezaluz está demasiado quente! Precisas da Gotateia para a arrefecer.', 3500);
        }
        return;
      }

      // Craveira — dig (press C multiple times)
      if (method === 'dig') {
        plant.showHint(inRange, 'C (escavar)');
        return;
      }

      // Slow
      if (method === 'slow') {
        const tooFast = this.player.recentSpeed > 50;
        if (tooFast) {
          this._timedPlant = null;
          this._proximityTimer = 0;
          plant.showHint(inRange, 'Mais devagar!');
          return;
        }
      }

      plant.showHint(inRange);

      if (method === 'interact' || method === 'slow' || method === 'brave') {
        if (method === 'slow' && this.player.recentSpeed > 50) return;
        if (this._timedPlant !== plant) { this._timedPlant = plant; this._proximityTimer = 0; }
        this._proximityTimer += delta;
        const holdMs = method === 'brave' ? 900 : 600;
        if (this._proximityTimer >= holdMs) {
          this._timedPlant = null; this._proximityTimer = 0;
          this.time.delayedCall(0, () => this._collectPlant(plant));
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
      if (near) {
        this._nearPortal = portal;
        if (!portal.isLocked && !GameState.discoveredPortals.has(portal.portalId)) {
          GameState.discoverPortal(portal.portalId);
        }
      }
      const prox = Phaser.Math.Clamp(1 - dist / 200, 0, 1);
      portal.setProximity(prox);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Keys
  // ──────────────────────────────────────────────────────────────────────────
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

    if (method === 'timing') {
      // Bocarra — only when not blowing
      if (!this._bocarraBlowing) {
        this._collectPlant(plant);
      } else {
        this._emitNarrative('A Bocarra ainda está a soprar! Espera um momento…', 2000);
      }
      return;
    }

    if (method === 'fly_collect') {
      // Aurorabromélia & others — need to be flying
      if (this.player.isFlying) {
        this._collectPlant(plant);
      } else {
        this._emitNarrative('Precisas do Flutueminem para alcançar esta planta! (Q+F)', 3000);
      }
      return;
    }

    if (method === 'swim') {
      // Ninfária — need to be in water
      const inWater = this.player.y > ZONE_H * 3 + 40;
      if (inWater) {
        this._collectPlant(plant);
      } else {
        this._emitNarrative('Entra na água do Pântano para a Ninfária surgir!', 2500);
      }
      return;
    }

    if (method === 'cool') {
      // Tezaluz — need Gotateia
      if (GameState.collected.has('gotateia')) {
        this._collectPlant(plant);
        this._emitNarrative('A Gotateia arrefeceu a Tezaluz!', 2500);
      } else {
        this._emitNarrative('A Tezaluz está demasiado quente! Precisas da Gotateia primeiro.', 3000);
      }
      return;
    }

    if (method === 'dig') {
      // Craveira — digging mechanic (3 presses, Texugo appears on 3rd)
      plant._digCount = (plant._digCount || 0) + 1;
      this.cameras.main.shake(60, 0.003);
      if (plant._digCount >= 3) {
        this._summonTexugo(plant);
      } else {
        const left = 3 - plant._digCount;
        this._emitNarrative(`Continua a escavar… mais ${left} vez${left !== 1 ? 'es' : ''}! (C)`, 2000);
      }
      return;
    }

    if (method === 'interact') { this._collectPlant(plant); return; }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Texugo — appears after digging for Craveira and hands it over
  // ──────────────────────────────────────────────────────────────────────────
  _summonTexugo(plant) {
    const tx = plant.x + 60, ty = plant.y;
    const texugo = this.add.circle(tx, ty, 22, 0x553322, 0.9).setDepth(12).setAlpha(0);
    // Simple badger: two circles
    const texugoFace = this.add.ellipse(tx, ty - 8, 28, 20, 0xddccaa, 0.9).setDepth(13).setAlpha(0);

    this.tweens.add({
      targets: [texugo, texugoFace], alpha: 1, duration: 600,
      onComplete: () => {
        this._emitNarrative('Um Texugo emergiu do buraco e entregou-te a Craveira!', 3500);
        this.time.delayedCall(1200, () => {
          this._collectPlant(plant);
          this.tweens.add({
            targets: [texugo, texugoFace], alpha: 0, duration: 600,
            onComplete: () => { texugo.destroy(); texugoFace.destroy(); },
          });
        });
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Spells
  // ──────────────────────────────────────────────────────────────────────────
  _castSpell() {
    if (!GameState.activeSpell) return;
    this._spellCooldown = 1200;
    const spellDef = SPELLS[GameState.activeSpell];
    this._showSpellFX(spellDef.textureKey);
    this.game.events.emit('spellCast', GameState.activeSpell);
    this._checkSpellUnlock();

    const spell = GameState.activeSpell;

    if (spell === 'flutueminem') {
      this.player.startFlying(9000);
      this._emitNarrative('O Flutueminem dá-te asas por 9 segundos!', 3000);
      return;
    }

    if (spell === 'fogo_controlado') {
      // Repel Sussurro-ladrão
      if (this._ladrao?.active) {
        const dist = Phaser.Math.Distance.Between(
          this.player.x, this.player.y, this._ladrao.x, this._ladrao.y
        );
        if (dist < 350) {
          this._emitNarrative('O Ignicura espantou o Sussurro-ladrão!', 2500);
          const ang = Math.atan2(this._ladrao.y - this.player.y, this._ladrao.x - this.player.x);
          this.tweens.add({
            targets: this._ladrao,
            x: this._ladrao.x + Math.cos(ang) * 500,
            y: this._ladrao.y + Math.sin(ang) * 200,
            alpha: 0, duration: 1200,
            onComplete: () => this._despawnLadrao(false),
          });
          return;
        }
      }
      this._emitNarrative('O Ignicura está pronto — espera pelo Sussurro-ladrão!', 2500);
      return;
    }

    if (spell === 'memoria_solo') {
      this._activateMemoriaSolo();
      return;
    }

    if (spell === 'canto_jardim') { this._revealAllPlants(); return; }
  }

  _showSpellFX(textureKey) {
    const fx = this.add.image(this.player.x, this.player.y, textureKey)
      .setDisplaySize(50, 50).setAlpha(0.9).setDepth(50).setBlendMode('ADD');
    this.tweens.add({
      targets: fx, scale: 4, alpha: 0, duration: 700,
      ease: 'Power2.easeOut', onComplete: () => fx.destroy(),
    });
  }

  // Terramemoria: footprints leading to Pântano
  _activateMemoriaSolo() {
    if (this._memoriaSoloActive) {
      this._emitNarrative('As pegadas já estão a guiar-te!', 1500);
      return;
    }
    this._memoriaSoloActive = true;
    this._emitNarrative('As pegadas do solo guiam-te até ao Pântano…', 3500);

    // Draw footprints from current position to Pântano entrance (y = ZONE_H*3)
    const startY = this.player.y;
    const endY   = ZONE_H * 3 + 60;
    const steps  = 14;
    const stepY  = (endY - startY) / steps;

    for (let i = 0; i < steps; i++) {
      const fx = this.player.x + Phaser.Math.Between(-40, 40);
      const fy = startY + stepY * i;
      this.time.delayedCall(i * 300, () => {
        if (!this.scene.isActive('Zone2')) return;
        const fp = this.add.ellipse(fx, fy, 14, 8, 0x7bc67e, 0.7).setDepth(6);
        this._footprints.push(fp);
        this.tweens.add({ targets: fp, alpha: 0, duration: 8000,
          onComplete: () => { fp.destroy(); this._footprints = this._footprints.filter(f => f !== fp); }
        });
      });
    }
    this.time.delayedCall(steps * 300 + 500, () => { this._memoriaSoloActive = false; });
  }

  _clearFootprints() {
    this._footprints.forEach(f => f?.destroy());
    this._footprints = [];
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
    this._emitNarrative('O Horticantus revelou onde estão as plantas!');
  }

  _checkSpellUnlock() {
    const id = GameState.spellJustUnlocked;
    if (!id || id === this._spellUnlockShown) return;
    this._spellUnlockShown = id;
    GameState.spellJustUnlocked = null;
    const spell = SPELLS[id];
    this.time.delayedCall(600, () => {
      this._emitNarrative(`Feitiço desbloqueado: ${spell.name}! (Q seleccionar · F lançar)`, 5000);
      this.game.events.emit('spellUnlocked', id);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Plant collection
  // ──────────────────────────────────────────────────────────────────────────
  _collectPlant(plant) {
    if (plant.isCollected) return;
    if (!GameState.addPlant(plant.plantData)) {
      this._emitNarrative('A mochila está cheia!');
      return;
    }
    plant.collect();
    this.cameras.main.shake(120, 0.003);
    this.plants = this.plants.filter(p => {
      if (p !== plant && p.plantData.id === plant.plantData.id) { p.destroy(); return false; }
      return p !== plant;
    });
    this._emitNarrative(plant.plantData.narrativeText, 4000);
    this.game.events.emit('plantCollected', plant.plantData, plant.plantData);
    this._checkSpellUnlock();

    if (!GameState.isZoneUnlocked('Zone3') && GameState.checkZone3Unlock()) {
      GameState.unlockZone('Zone3');
      this.portalForward.unlock();
      this.time.delayedCall(800, () =>
        this._showZoneUnlock('Zona 3 — Vale do Asara')
      );
      this.time.delayedCall(5000, () =>
        this._emitNarrative('Os terrenos das sombras estão acessíveis! Usa o portal avançado.')
      );
    }
  }

  _showZoneUnlock(name) {
    const cam = this.cameras.main;
    const SW = cam.width, SH = cam.height;
    const overlay = this.add.graphics().setScrollFactor(0).setDepth(500).setAlpha(0);
    overlay.fillStyle(0x000000, 0.72);
    overlay.fillRect(0, 0, SW, SH);
    const label = this.add.text(SW / 2, SH / 2, `Nova área desbloqueada\n${name}`, {
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

  // ──────────────────────────────────────────────────────────────────────────
  //  Portal
  // ──────────────────────────────────────────────────────────────────────────
  _usePortal(portal) {
    const dest = portal.destination;
    if (portal.isLocked) {
      this._emitNarrative(dest === 'Zone3'
        ? 'Precisas de Ninfária, Aurorabromélia, Tezaluz, Espinhosa-doce e Craveira.'
        : 'Portal bloqueado.');
      return;
    }
    SoundManager.portal();
    MusicManager.stop();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.events.off('plantStolen', this._onPlantStolen, this);
      this.scene.start(dest);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Zone unlock checks
  // ──────────────────────────────────────────────────────────────────────────
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

  _emitNarrative(text, dur = 3500) { this.game.events.emit('showNarrative', text, dur); }

  _onPlantStolen(plant) {
    this._emitNarrative(`O Sussurro-Ladrão levou a ${plant.name}!`, 4000);
    // Respawn the stolen plant
    const spawn = PLANT_SPAWNS.find(s => s.id === plant.id);
    if (!spawn) return;
    this.time.delayedCall(20000, () => {
      if (GameState.collected.has(plant.id)) return;
      if (!this.scene.isActive('Zone2')) return;
      const plantData = PLANTS[plant.id];
      if (plantData) this.plants.push(new Plant(this, spawn.x, spawn.y, plantData));
    });
  }

  shutdown() {
    this.game.events.off('plantStolen', this._onPlantStolen, this);
    this._ladrao?.destroy();
    this._furacaoCreature?.destroy();
    this._clearFootprints();
    this._fendas.forEach(f => f.gfx?.destroy());
  }
}
