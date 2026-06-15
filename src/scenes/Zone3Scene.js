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

// Zone 3 — 1280 wide × 2160 tall, three sub-areas stacked top → bottom
const ZONE_H = 720;

const AREAS = {
  valeAsara:      { label: 'Vale do Asara',      minY: 0,          maxY: ZONE_H     },
  bosqueConfusao: { label: 'Bosque da Confusão', minY: ZONE_H,     maxY: ZONE_H * 2 },
  valeEspelhos:   { label: 'Vale dos Espelhos',  minY: ZONE_H * 2, maxY: ZONE_H * 3 },
};

const PLANT_SPAWNS = [
  // ── Vale do Asara (primary) ──
  { id: 'sombravinha',   x: 560, y: 380  }, // hidden; Raíz Ardente reveals
  { id: 'faisca_mato',   x: 820, y: 460  }, // quicksand area; requires flying
  // ── Bosque da Confusão (primary) ──
  { id: 'sussurreira',   x: 460, y: 1020 }, // chase mechanic
  { id: 'lunaria_negra', x: 950, y: 1300 }, // maze end (past gap 3 at x≥890)
  // ── Bosque da Confusão (backup spawns if missed earlier) ──
  { id: 'espinhosa_doce', x: 250, y: 800  },
  { id: 'gotateia',       x: 600, y: 820  },
  { id: 'trepadeira',     x: 1100, y: 900 },
  // ── Vale dos Espelhos (backup spawns) ──
  { id: 'tezaluz',   x: 450, y: ZONE_H * 2 + 150 },
  { id: 'ventoinha', x: 850, y: ZONE_H * 2 + 200 },
];

// Quicksand ellipses in Vale do Asara
const QUICKSAND = [
  { x: 400, y: 285, rx: 130, ry: 75 },
  { x: 720, y: 440, rx: 120, ry: 68 },
  { x: 555, y: 560, rx: 150, ry: 85 },
  { x: 195, y: 475, rx: 95,  ry: 55 },
  { x: 950, y: 330, rx: 105, ry: 60 },
];

// Maze walls in Bosque da Confusão (world coords; x=left edge, y=top edge)
// Only horizontal walls have physics — vertical connectors are visual only so the
// player can cross left↔right freely while navigating the gap zigzag.
const MAZE_WALL_DEFS = [
  { x: 0,   y: 798,  w: 780, h: 16 },  // first horizontal;  gap right x=780-1280
  { x: 300, y: 958,  w: 980, h: 16 },  // second horizontal; gap left  x=0-300
  { x: 0,   y: 1118, w: 890, h: 16 },  // third horizontal;  gap right x=890-1280
];
// Visual-only connectors (drawn but no physics body)
const MAZE_VISUAL_CONNECTORS = [
  { x: 764, y: 800,  w: 16,  h: 160 }, // right side of wall 1 → wall 2
  { x: 300, y: 960,  w: 16,  h: 160 }, // left  side of wall 2 → wall 3
];

const MIRROR_CX   = 640;
const MIRROR_CY   = ZONE_H * 2 + 390; // y = 1830
const MIRROR_R    = 270;
const NUM_MIRRORS = 12;
const NUM_ECOS    = 11;
const CAULDRON_MIRROR_INDEX = 3; // bottom mirror (angle π/2) — acts as cauldron exit

export class Zone3Scene extends Phaser.Scene {
  constructor() { super('Zone3'); }

  create() {
    GameState.currentZone = 'Zone3';
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this._buildBackground();

    this.player = new Player(this, 640, 200);
    GameState.plantSpawns = PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y }));
    this._buildPlants();
    this._buildMazeWalls();
    this._buildMirrors();
    this._buildValeEspelhosGate();
    this._buildEcos();
    this._buildPortals();

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

    this._nearPlant          = null;
    this._nearPortal         = null;
    this._nearCauldronMirror = false;
    this._currentArea        = '';
    this._spellCooldown      = 0;
    this._proximityTimer     = 0;
    this._timedPlant         = null;
    this._footTimer          = 0;
    this._spellUnlockShown   = null;
    this._revealActive       = false;

    // Quicksand state
    this._sinkTimer       = 0;
    this._sinkWarned      = false;
    this._quicksandActive = true;

    // Sussurreira chase state
    this._sussurreiraFleeCount = 0;
    this._sussurreiraFleeing   = false;

    // Ladrão in Bosque
    this._ladrao           = null;
    this._ladraoStole      = false;
    this._ladraoSpawnTimer = 25000;

    // Cauldron mirror
    this._cauldronMirrorActive = false;

    this.cameras.main.fadeIn(800, 0, 0, 0);
    this.game.events.on('plantStolen', this._onPlantStolen, this);

    MusicManager.init(this);
    this.time.delayedCall(200, () => MusicManager.playArea('valeAsara'));

    this.time.delayedCall(900, () => {
      this._emitNarrative('Os terrenos das sombras. Algo observa-te daqui. Vai devagar, ou para completamente.');
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Background
  // ──────────────────────────────────────────────────────────────────────────
  _buildBackground() {
    const g = this.add.graphics();
    if (this.textures.exists('bg_zone3')) {
      this.add.image(0, 0, 'bg_zone3').setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(0);
      g.fillStyle(0x030608, 0.6); g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    } else {
      g.fillStyle(0x04050c, 1); g.fillRect(0, 0,            WORLD_WIDTH, ZONE_H);
      g.fillStyle(0x070c06, 1); g.fillRect(0, ZONE_H,       WORLD_WIDTH, ZONE_H);
      g.fillStyle(0x060508, 1); g.fillRect(0, ZONE_H * 2,   WORLD_WIDTH, ZONE_H);
    }
    g.setDepth(1);

    // Quicksand patches (will also be redrawn by _drawQuicksand)
    this._quicksandGfx = this.add.graphics().setDepth(2);
    this._drawQuicksand(this._quicksandGfx, 0.85);

    // Misty atmosphere
    const fog = this.add.graphics().setDepth(1);
    for (let i = 0; i < 14; i++) {
      fog.fillStyle(0x1a3a2a, 0.04);
      fog.fillEllipse(
        Phaser.Math.Between(100, 1180),
        Phaser.Math.Between(100, 2060),
        Phaser.Math.Between(200, 500),
        Phaser.Math.Between(100, 300)
      );
    }

    // Dark trees
    const darkColors = [0x0a0e0a, 0x0d160d, 0x1a1010, 0x0a120a];
    for (let i = 0; i < 30; i++) {
      const c = darkColors[i % darkColors.length];
      this.add.circle(
        Phaser.Math.Between(50, 1230),
        Phaser.Math.Between(50, 2110),
        25 + Math.random() * 55,
        c, 0.85
      ).setDepth(2);
    }

    // Mirror-hall tint in Vale dos Espelhos
    this.add.graphics().setDepth(1)
      .fillStyle(0x20163a, 0.35)
      .fillRect(0, ZONE_H * 2, WORLD_WIDTH, ZONE_H);
  }

  _drawQuicksand(gfx, alpha) {
    gfx.clear();
    QUICKSAND.forEach(qs => {
      gfx.fillStyle(0x6b5a2a, alpha * 0.8);
      gfx.fillEllipse(qs.x, qs.y, qs.rx * 2, qs.ry * 2);
      gfx.fillStyle(0x9c8040, alpha * 0.4);
      gfx.fillEllipse(qs.x - qs.rx * 0.2, qs.y - qs.ry * 0.2, qs.rx * 1.2, qs.ry * 1.2);
      gfx.lineStyle(2, 0x5a4a1a, alpha * 0.3);
      gfx.strokeEllipse(qs.x, qs.y, qs.rx * 2.3, qs.ry * 2.3);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Plants
  // ──────────────────────────────────────────────────────────────────────────
  _buildPlants() {
    this.plants = [];
    this._sombraPlant      = null;
    this._sussurreiraPlant = null;

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
      if (id === 'sussurreira') {
        this._sussurreiraPlant = p;
      }
      this.plants.push(p);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Maze walls in Bosque da Confusão
  // ──────────────────────────────────────────────────────────────────────────
  _buildMazeWalls() {
    const gfx = this.add.graphics().setDepth(5);
    gfx.fillStyle(0x1a2a0e, 0.95);
    gfx.lineStyle(2, 0x2a4018, 0.9);

    // All maze walls are visual only — no physics blocking
    MAZE_WALL_DEFS.forEach(def => {
      gfx.fillRect(def.x, def.y, def.w, def.h);
      gfx.strokeRect(def.x, def.y, def.w, def.h);
    });

    MAZE_VISUAL_CONNECTORS.forEach(def => {
      gfx.fillRect(def.x, def.y, def.w, def.h);
      gfx.strokeRect(def.x, def.y, def.w, def.h);
    });

    // Subtle guide dots through the maze
    const path = [
      { x: 900, y: 840  }, { x: 950, y: 920 }, { x: 900, y: 975 },
      { x: 200, y: 1040 }, { x: 140, y: 1080 }, { x: 200, y: 1130 },
      { x: 980, y: 1185 }, { x: 1050, y: 1240 }, { x: 950, y: 1300 },
    ];
    path.forEach((pt, i) => {
      const dot = this.add.circle(pt.x, pt.y, 5, 0x3aff6a, 0.4).setDepth(4);
      this.tweens.add({
        targets: dot,
        alpha: { from: 0.12, to: 0.55 },
        duration: 1200 + i * 110, yoyo: true, repeat: -1,
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Mirror circle in Vale dos Espelhos
  // ──────────────────────────────────────────────────────────────────────────
  _buildMirrors() {
    this._mirrorObjs           = [];
    this._cauldronMirrorShimmer = null;
    this._cauldronMirrorPos     = null;
    const gfx = this.add.graphics().setDepth(6);

    for (let i = 0; i < NUM_MIRRORS; i++) {
      const angle = (i / NUM_MIRRORS) * Math.PI * 2;
      const mx    = MIRROR_CX + Math.cos(angle) * MIRROR_R;
      const my    = MIRROR_CY + Math.sin(angle) * MIRROR_R;
      const mW = 18, mH = 80;
      const isCauldron = (i === CAULDRON_MIRROR_INDEX);

      // Stand
      gfx.fillStyle(isCauldron ? 0x3a2a00 : 0x3a2a0e, 0.9);
      gfx.fillRect(mx - 4, my + mH / 2, 8, 20);
      // Frame — cauldron mirror has golden frame
      gfx.lineStyle(3, isCauldron ? 0xb08840 : 0x8060a0, 0.8);
      gfx.strokeRect(mx - mW / 2, my - mH / 2, mW, mH);
      // Glass
      gfx.fillStyle(isCauldron ? 0xffe0a0 : 0xa0b0ff, 0.15);
      gfx.fillRect(mx - mW / 2 + 2, my - mH / 2 + 2, mW - 4, mH - 4);
      // Highlight
      gfx.fillStyle(0xffffff, 0.1);
      gfx.fillRect(mx - mW / 2 + 3, my - mH / 2 + 6, 4, mH - 16);

      const shimmer = this.add.rectangle(mx, my, mW - 4, mH - 4,
        isCauldron ? 0xffe0a0 : 0xa0b0ff, 0.12).setDepth(7);
      this._mirrorObjs.push(shimmer);
      this.tweens.add({
        targets: shimmer,
        alpha: { from: 0.06, to: 0.22 },
        duration: 1600 + i * 120, yoyo: true, repeat: -1,
      });

      if (isCauldron) {
        this._cauldronMirrorShimmer = shimmer;
        this._cauldronMirrorPos     = { x: mx, y: my };
      }
    }

    // Ground rune circle
    gfx.lineStyle(2, 0x5040a0, 0.3);
    gfx.strokeCircle(MIRROR_CX, MIRROR_CY, MIRROR_R);
    gfx.lineStyle(1, 0x5040a0, 0.18);
    gfx.strokeCircle(MIRROR_CX, MIRROR_CY, MIRROR_R * 0.5);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Gate at Vale dos Espelhos entrance
  // ──────────────────────────────────────────────────────────────────────────
  _buildValeEspelhosGate() {
    const gateY = ZONE_H * 2 + 8;

    if (GameState.valeEspelhosOpen) {
      this._gateOpen = true;
      return;
    }
    this._gateOpen = false;

    this._gateGfx = this.add.graphics().setDepth(20);
    this._gateGfx.fillStyle(0x8060c0, 0.5);
    this._gateGfx.fillRect(0, gateY, WORLD_WIDTH, 18);
    this._gateGfx.lineStyle(3, 0xc0a0ff, 0.9);
    this._gateGfx.strokeRect(0, gateY, WORLD_WIDTH, 18);

    this.tweens.add({
      targets: this._gateGfx,
      alpha: { from: 0.6, to: 1.0 },
      duration: 800, yoyo: true, repeat: -1,
    });

    const wallBody = this.add.rectangle(WORLD_WIDTH / 2, gateY + 9, WORLD_WIDTH, 18, 0, 0);
    this.physics.add.existing(wallBody, true);
    this._gateWallBody = wallBody;
    this._gateWallCollider = this.physics.add.collider(this.player, wallBody);
    this._gateNarrativeShown = false;
  }

  _openValeEspelhosGate() {
    if (this._gateOpen) return;
    this._gateOpen = true;
    GameState.valeEspelhosOpen = true;

    // Ancestor faces flash on all mirrors
    this.cameras.main.flash(600, 180, 140, 255, false, null, 0.5);
    this._mirrorObjs?.forEach((m, i) => {
      this.time.delayedCall(i * 70, () => {
        this.tweens.add({
          targets: m, alpha: 0.7, tint: 0xffd0ff,
          duration: 160, yoyo: true, repeat: 2,
        });
      });
    });

    if (this._gateGfx) {
      this.tweens.killTweensOf(this._gateGfx);
      this.tweens.add({
        targets: this._gateGfx, alpha: 0, scaleY: 0, duration: 1400,
        onComplete: () => { this._gateGfx?.destroy(); this._gateGfx = null; },
      });
    }
    if (this._gateWallCollider) {
      this.physics.world.removeCollider(this._gateWallCollider);
      this._gateWallCollider = null;
    }
    this._gateWallBody?.destroy();
    this._gateWallBody = null;

    this._emitNarrative(
      'Os Espelhos de Memória abrem-se. Os rostos das tuas ancestrais aparecem… os Ecos aguardam!',
      6000
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  11 Ecos in Vale dos Espelhos
  // ──────────────────────────────────────────────────────────────────────────
  _buildEcos() {
    this.ecos             = [];
    this._ecosDefeated    = 0;
    this._ecosAllDefeated = false;
    this._ecosSpawned     = false;

    // Store positions only; Creatures are created lazily when player enters the circle
    this._ecoPositions = [];
    for (let i = 0; i < NUM_ECOS; i++) {
      const angle = (i / NUM_ECOS) * Math.PI * 2;
      const r     = 140 + (i % 3) * 45;
      this._ecoPositions.push({
        x: MIRROR_CX + Math.cos(angle) * r,
        y: MIRROR_CY + Math.sin(angle) * r,
      });
    }
  }

  _spawnEcos() {
    if (this._ecosSpawned) return;
    this._ecosSpawned = true;
    this._emitNarrative('Os Ecos surgem das sombras… usa o Ancestria para os derrotar! (Q+F)', 5000);

    this._ecoPositions.forEach(pos => {
      const eco = new Creature(this, pos.x, pos.y, 'creature_eco', {
        type:           'eco',
        followRange:    340,
        stealThreshold: 3200,
        speed:          70,
        onDefeat:       () => this._checkAllEcosDefeated(),
      });
      this.ecos.push(eco);
    });
  }

  _checkAllEcosDefeated() {
    this._ecosDefeated++;
    if (this._ecosDefeated >= NUM_ECOS && !this._ecosAllDefeated) {
      this._ecosAllDefeated = true;
      this._emitNarrative('Os Ecos foram derrotados! O espelho do caldeirão brilha… aproxima-te!', 5500);

      this._cauldronMirrorActive = true;
      if (this._cauldronMirrorShimmer) {
        this.tweens.killTweensOf(this._cauldronMirrorShimmer);
        this.tweens.add({
          targets: this._cauldronMirrorShimmer,
          alpha: 0.9, duration: 600,
          onComplete: () => {
            this._cauldronMirrorShimmer.setTint(0xffd700);
            this.tweens.add({
              targets: this._cauldronMirrorShimmer,
              alpha: { from: 0.6, to: 1.0 },
              duration: 800, yoyo: true, repeat: -1,
            });
          },
        });
      }

      if (GameState.checkCauldronUnlock()) GameState.unlockZone('Cauldron');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Portals
  // ──────────────────────────────────────────────────────────────────────────
  _buildPortals() {
    this.portalBack = new Portal(this, 200, 200, {
      portalId: 'zone3_back', destination: 'Zone2', locked: false,
    });
    this._portals = [this.portalBack];
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Update
  // ──────────────────────────────────────────────────────────────────────────
  update(time, delta) {
    this.player.update(this.cursors, this.wasd, this.keyShift, delta);

    // Vale dos Espelhos — lazy-spawn Ecos when player enters circle centre
    if (this.player.y > ZONE_H * 2 - 200) {
      if (!this._ecosSpawned) {
        const distToCenter = Phaser.Math.Distance.Between(
          this.player.x, this.player.y, MIRROR_CX, MIRROR_CY
        );
        if (distToCenter < 150) this._spawnEcos();
      }
      this.ecos.forEach(e => { if (e?.active) e.update(this.player, delta, GameState); });
    }

    const ph = this.player.displayHeight;
    this.playerShadow.setPosition(this.player.x, this.player.y + Math.round(ph * 0.24));
    this.playerShadow.setSize(Math.round(ph * 0.16), Math.max(4, Math.round(ph * 0.038)));
    GameState.playerX = this.player.x;
    GameState.playerY = this.player.y;

    this._checkAreaChange();
    this._checkPlantProximity(time, delta);
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateQuicksand(delta);
    this._updateSussurreira(delta);
    this._updateLadrao(delta);
    this._updateFootsteps(delta);
    this._checkZoneUnlocks();
    this._checkGateHint();

    if (this._spellCooldown    > 0) this._spellCooldown    -= delta;
    if (this._ladraoSpawnTimer > 0) {
      this._ladraoSpawnTimer -= delta;
      if (this._ladraoSpawnTimer <= 0 && this._currentArea === 'bosqueConfusao') {
        this._spawnLadrao();
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Area detection
  // ──────────────────────────────────────────────────────────────────────────
  _checkAreaChange() {
    const py = this.player.y;
    let area = 'valeAsara';
    if (py >= ZONE_H * 2) area = 'valeEspelhos';
    else if (py >= ZONE_H) area = 'bosqueConfusao';

    if (area !== this._currentArea) {
      this._currentArea = area;
      GameState.currentArea = area;
      this.game.events.emit('areaChanged', AREAS[area].label);
    }
  }

  _checkGateHint() {
    if (this._gateOpen || this._gateNarrativeShown) return;
    if (this.player.y > ZONE_H * 2 - 80) {
      this._gateNarrativeShown = true;
      this._emitNarrative('Uma barreira cintilante bloqueia a passagem… usa o Espelho de Memória! (Q+F)', 5000);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Quicksand — Vale do Asara
  // ──────────────────────────────────────────────────────────────────────────
  _updateQuicksand(delta) {
    if (!this._quicksandActive || this._currentArea !== 'valeAsara') {
      if (this._sinkTimer > 0) this._sinkTimer = 0;
      return;
    }
    if (this.player.isFlying) { this._sinkTimer = 0; return; }

    const onSand = QUICKSAND.some(qs => {
      const dx = (this.player.x - qs.x) / qs.rx;
      const dy = (this.player.y - qs.y) / qs.ry;
      return dx * dx + dy * dy < 1;
    });

    if (!onSand) {
      this._sinkTimer = Math.max(0, this._sinkTimer - delta * 2);
      this._sinkWarned = false;
      return;
    }

    const speedMult = this.player.recentSpeed > 120 ? 2.2 : 1;
    this._sinkTimer += delta * speedMult;

    if (this.player.body) {
      this.player.body.velocity.x *= 0.65;
      this.player.body.velocity.y *= 0.65;
    }

    if (this._sinkTimer > 3000 && !this._sinkWarned) {
      this._sinkWarned = true;
      this._emitNarrative('Estás a afundar-te na areia! Para quieta ou usa o Flutueminem!', 3500);
    }

    if (this._sinkTimer > 7000) {
      this._sinkTimer  = 0;
      this._sinkWarned = false;
      this._emitNarrative('Foste engolida pela Areia Movediça…', 2500);
      this.cameras.main.shake(250, 0.01);
      this.cameras.main.fadeOut(800, 30, 20, 5);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.game.events.off('plantStolen', this._onPlantStolen, this);
        this.game.registry.set('startArea', 'jardimInvertido');
        this.scene.start('Zone1');
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Sussurreira — auto-flee 2x, catchable on 3rd (Bosque da Confusão)
  // ──────────────────────────────────────────────────────────────────────────
  _updateSussurreira(delta) {
    if (!this._sussurreiraPlant || this._sussurreiraPlant.isCollected) return;
    if (this._sussurreiraFleeing || this._sussurreiraFleeCount >= 2) return;

    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      this._sussurreiraPlant.x, this._sussurreiraPlant.y
    );
    if (dist < 110) this._fleeSussurreira();
  }

  _fleeSussurreira() {
    if (this._sussurreiraFleeing) return;
    this._sussurreiraFleeing = true;
    this._sussurreiraFleeCount++;

    const p  = this._sussurreiraPlant;
    const nx = Phaser.Math.Between(120, 1160);
    const ny = ZONE_H + Phaser.Math.Between(80, ZONE_H - 80);

    this.tweens.add({
      targets: p, alpha: 0, duration: 400,
      onComplete: () => {
        p.setPosition(nx, ny);
        this.tweens.add({
          targets: p, alpha: 1, duration: 500,
          onComplete: () => { this._sussurreiraFleeing = false; },
        });
      },
    });

    if (this._sussurreiraFleeCount < 2) {
      this._emitNarrative(`A Sussurreira fugiu! Persegue-a… (${this._sussurreiraFleeCount} de 2 fugas)`, 2800);
    } else {
      this._emitNarrative('A Sussurreira está cansada de fugir… apanha-a com C!', 3500);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Sussurro-ladrão in Bosque da Confusão
  // ──────────────────────────────────────────────────────────────────────────
  _spawnLadrao() {
    if (this._ladrao?.active) return;
    const sx = Phaser.Math.Between(80, 1200);
    const sy = ZONE_H + Phaser.Math.Between(20, ZONE_H - 20);
    this._ladrao = this.add.image(sx, sy, 'sussurro_ladrao')
      .setDisplaySize(44, 38).setAlpha(0).setDepth(9);
    this._ladraoStole = false;
    this.tweens.add({ targets: this._ladrao, alpha: 0.85, duration: 900 });
    this._emitNarrative('Uma sombra desliza no labirinto…', 2500);
  }

  _updateLadrao(delta) {
    if (!this._ladrao?.active || this._ladraoStole) return;
    if (this._currentArea !== 'bosqueConfusao') return;
    if (GameState.inventory.length === 0) { this._despawnLadrao(false); return; }

    const dist = Phaser.Math.Distance.Between(
      this._ladrao.x, this._ladrao.y, this.player.x, this.player.y
    );
    const ang = Math.atan2(this.player.y - this._ladrao.y, this.player.x - this._ladrao.x);
    this._ladrao.x += Math.cos(ang) * (dist < 180 ? 75 : 42) * (delta / 1000);
    this._ladrao.y += Math.sin(ang) * (dist < 180 ? 75 : 42) * (delta / 1000);
    this._ladrao.setFlipX(Math.cos(ang) < 0);

    if (dist < 50) {
      this._ladraoStole = true;
      const stolen = GameState.stealLastPlant();
      if (stolen) this.game.events.emit('plantStolen', stolen);
      const fleeAng = ang + Math.PI;
      this.tweens.add({
        targets: this._ladrao,
        x: this._ladrao.x + Math.cos(fleeAng) * 500,
        y: this._ladrao.y + Math.sin(fleeAng) * 150,
        alpha: 0, duration: 1400, ease: 'Power2.easeIn',
        onComplete: () => this._despawnLadrao(true),
      });
    }
  }

  _despawnLadrao(stole) {
    this._ladrao?.destroy();
    this._ladrao = null;
    this._ladraoSpawnTimer = stole
      ? Phaser.Math.Between(40000, 60000)
      : Phaser.Math.Between(25000, 40000);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Plant proximity
  // ──────────────────────────────────────────────────────────────────────────
  _checkPlantProximity(time, delta) {
    this._nearPlant = null;
    let foundNear   = false;

    this.plants.forEach(plant => {
      if (plant.isCollected || !plant.isVisible) return;
      const dist    = Phaser.Math.Distance.Between(this.player.x, this.player.y, plant.x, plant.y);
      const inRange = dist < PLAYER_INTERACTION_RADIUS;
      const method  = plant.plantData.collectMethod;

      if (!inRange) { plant.showHint(false); return; }
      this._nearPlant = plant;
      foundNear = true;

      // spell_reveal — only collectible after Raíz Ardente
      if (method === 'spell_reveal') {
        if (plant._sombraRevealed) {
          plant.showHint(true, 'C');
        } else {
          plant.showHint(false);
          if (!plant._sombraHintShown) {
            plant._sombraHintShown = true;
            this._emitNarrative('Sentes uma presença oculta na areia… usa a Raíz Ardente!', 3500);
          }
        }
        return;
      }

      // fly_collect — needs Flutueminem
      if (method === 'fly_collect') {
        plant.showHint(inRange, this.player.isFlying ? 'C' : '✈ Flutueminem');
        if (!this.player.isFlying && !plant._flyHintShown) {
          plant._flyHintShown = true;
          this._emitNarrative('Esta planta está inacessível a pé! Usa o Flutueminem para voar até ela.', 4000);
        }
        return;
      }

      // chase — Sussurreira
      if (method === 'chase') {
        plant.showHint(true, this._sussurreiraFleeCount >= 2 ? 'C' : '…foge');
        return;
      }

      // maze_end — Lunária Negra
      if (method === 'maze_end') {
        plant.showHint(true, 'C');
        if (!plant._mazeHintShown) {
          plant._mazeHintShown = true;
          this._emitNarrative('Chegaste ao fim do labirinto! A Lunária Negra está aqui.', 3500);
        }
        return;
      }

      plant.showHint(inRange);

      if (method === 'interact' || method === 'brave') {
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
    this._nearPortal         = null;
    this._nearCauldronMirror = false;
    this._portals.forEach(portal => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, portal.x, portal.y);
      const near = dist < 65;
      portal.showHint(near);
      if (near) this._nearPortal = portal;
    });

    if (this._cauldronMirrorActive && this._cauldronMirrorPos) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this._cauldronMirrorPos.x, this._cauldronMirrorPos.y
      );
      if (dist < 65) {
        this._nearCauldronMirror = true;
        this.game.events.emit('showHint', 'C — Caldeirão');
      }
    }
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
    if (this._nearCauldronMirror) { this._useCauldronMirror(); return; }
    if (this._nearPortal) { this._usePortal(this._nearPortal); return; }
    if (!this._nearPlant) return;

    const plant  = this._nearPlant;
    const method = plant.plantData.collectMethod;

    if (method === 'spell_reveal') {
      if (plant._sombraRevealed) {
        this._collectPlant(plant);
      } else {
        this._emitNarrative('A Sombravinha está oculta! Usa a Raíz Ardente na Areia Movediça.', 3000);
      }
      return;
    }

    if (method === 'fly_collect') {
      if (this.player.isFlying) {
        this._collectPlant(plant);
      } else {
        this._emitNarrative('Precisas do Flutueminem para alcançar esta planta! (Q+F)', 3000);
      }
      return;
    }

    if (method === 'chase') {
      if (this._sussurreiraFleeCount >= 2) {
        this._collectPlant(plant);
      } else {
        this._fleeSussurreira();
      }
      return;
    }

    if (method === 'maze_end' || method === 'interact') {
      this._collectPlant(plant);
      return;
    }

    // Fallback for backup spawns with unhandled methods ('shake', 'slow', 'fast', 'climb', 'cool', etc.)
    this._collectPlant(plant);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Spells
  // ──────────────────────────────────────────────────────────────────────────
  _castSpell() {
    if (!GameState.activeSpell) return;
    this._spellCooldown = 1200;
    const spellDef = SPELLS[GameState.activeSpell];
    if (spellDef?.textureKey && this.textures.exists(spellDef.textureKey)) {
      const fx = this.add.image(this.player.x, this.player.y, spellDef.textureKey)
        .setDisplaySize(50, 50).setAlpha(0.9).setDepth(50).setBlendMode('ADD');
      this.tweens.add({
        targets: fx, scale: 4, alpha: 0, duration: 700,
        ease: 'Power2.easeOut', onComplete: () => fx.destroy(),
      });
    }
    this.game.events.emit('spellCast', GameState.activeSpell);
    this._checkSpellUnlock();

    const spell = GameState.activeSpell;

    if (spell === 'flutueminem') {
      this.player.startFlying(9000);
      this._emitNarrative('O Flutueminem eleva-te acima da areia por 9 segundos!', 3500);
      return;
    }

    if (spell === 'raiz_ardente') { this._castRaizArdente(); return; }
    if (spell === 'espelho_memoria') { this._castEspelhoMemoria(); return; }
    if (spell === 'Ancestria') { this._castAncestralWave(); return; }

    if (spell === 'fogo_controlado') {
      if (this._ladrao?.active) {
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
          this._emitNarrative('O Fogo Controlado afugentou o Sussurro-ladrão!', 2500);
          return;
        }
      }
      this._emitNarrative('Não há Sussurro-ladrão suficientemente perto!', 2000);
      return;
    }

    if (spell === 'canto_jardim') { this._revealAllPlants(); return; }
  }

  // Raíz Ardente: clear quicksand 30s + reveal Sombravinha
  _castRaizArdente() {
    if (this._currentArea !== 'valeAsara') {
      this._emitNarrative('A Raíz Ardente actua sobre a Areia Movediça no Vale do Asara!', 2500);
      return;
    }

    const nearSand = QUICKSAND.some(qs => {
      const dx = (this.player.x - qs.x) / (qs.rx + 100);
      const dy = (this.player.y - qs.y) / (qs.ry + 100);
      return dx * dx + dy * dy < 1;
    });

    if (!nearSand) {
      this._emitNarrative('Usa a Raíz Ardente em cima ou perto da Areia Movediça!', 2500);
      return;
    }

    this._quicksandActive = false;
    this._quicksandGfx.clear();

    // Expanding fire ring visual
    const fgfx = this.add.graphics().setDepth(15);
    let r = 0;
    const fireTimer = this.time.addEvent({
      delay: 16,
      callback: () => {
        r += 13;
        fgfx.clear();
        fgfx.lineStyle(4, 0xff6600, 0.7 * (1 - r / 320));
        fgfx.strokeCircle(this.player.x, this.player.y, r);
        fgfx.lineStyle(2, 0xffaa00, 0.4 * (1 - r / 320));
        fgfx.strokeCircle(this.player.x, this.player.y, r * 1.15);
        if (r >= 320) {
          fireTimer.remove();
          this.time.delayedCall(400, () => fgfx.destroy());
        }
      },
      repeat: 25,
    });

    // Reveal Sombravinha
    if (this._sombraPlant && !this._sombraPlant.isCollected) {
      this._sombraPlant._sombraRevealed = true;
      this._sombraPlant.isVisible = true;
      this.tweens.add({ targets: this._sombraPlant, alpha: 1, duration: 1200 });
      this._emitNarrative(
        'A Raíz Ardente queimou a areia movediça — a Sombravinha emerge das profundezas!',
        5000
      );
    } else {
      this._emitNarrative('O caminho está livre da areia por 30 segundos!', 3500);
    }

    this.time.delayedCall(30000, () => {
      if (!this.scene.isActive('Zone3')) return;
      this._quicksandActive = true;
      this._drawQuicksand(this._quicksandGfx, 0.85);
      this._emitNarrative('A Areia Movediça voltou…', 2000);
    });
  }

  // Espelho de Memória: open Vale dos Espelhos gate
  _castEspelhoMemoria() {
    if (this._gateOpen) {
      this._emitNarrative('O Vale dos Espelhos já está aberto.', 2000);
      return;
    }
    if (this.player.y < ZONE_H * 2 - 200) {
      this._emitNarrative('O Espelho de Memória só actua perto da barreira do Vale dos Espelhos.', 3000);
      return;
    }
    this._openValeEspelhosGate();
  }

  // Ancestral: circular wave defeats all Ecos
  _castAncestralWave() {
    if (this._currentArea !== 'valeEspelhos') {
      this._emitNarrative('O Ancestral só actua no Vale dos Espelhos!', 2500);
      return;
    }

    const cx = this.player.x, cy = this.player.y;
    const wgfx = this.add.graphics().setDepth(55).setBlendMode('ADD');
    const maxR  = 700;
    let   r     = 0;
    const hit   = new Set();

    const wt = this.time.addEvent({
      delay: 16,
      callback: () => {
        r = Math.min(r + maxR / 48, maxR);
        wgfx.clear();
        const a = 0.35 * (1 - r / maxR);
        wgfx.fillStyle(0xffd700, a * 0.25);
        wgfx.fillCircle(cx, cy, r);
        wgfx.lineStyle(5, 0xffffff, a * 2.5);
        wgfx.strokeCircle(cx, cy, r);
        wgfx.lineStyle(2, 0xffd700, a);
        wgfx.strokeCircle(cx, cy, r * 0.85);

        this.ecos.forEach(eco => {
          if (!eco?.active || hit.has(eco)) return;
          if (Phaser.Math.Distance.Between(cx, cy, eco.x, eco.y) < r) {
            hit.add(eco);
            eco.repel(cx, cy);
          }
        });

        if (r >= maxR) {
          wt.remove();
          this.time.delayedCall(300, () => wgfx.destroy());
        }
      },
      repeat: 48,
    });

    this.cameras.main.flash(500, 255, 240, 180, false, null, 0.45);
    this.cameras.main.shake(400, 0.006);
    this._emitNarrative('O Ancestral liberta uma onda de luz ancestral — os Ecos desaparecem!', 5000);
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
      if (!this.scene.isActive('Zone3')) return;
      markers.forEach(m => m.destroy());
      this.tweens.add({
        targets: cam, zoom: 2.0,
        duration: 1200, ease: 'Sine.easeInOut',
        onComplete: () => { cam.startFollow(this.player, true, 1, 1); cam.setLerp(0.12, 0.12); },
      });
    });

    this._emitNarrative('O Horticantus revelou onde estão as plantas! (30 segundos)', 5000);
  }

  _checkSpellUnlock() {
    const id = GameState.spellJustUnlocked;
    if (!id || id === this._spellUnlockShown) return;
    this._spellUnlockShown = id;
    GameState.spellJustUnlocked = null;
    const spell = SPELLS[id];
    if (!spell) return;
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
    this._emitNarrative(plant.plantData.narrativeText, 4500);
    this.game.events.emit('plantCollected', plant.plantData, plant.plantData);
    this._checkSpellUnlock();

    if (GameState.checkCauldronUnlock() && !GameState.isZoneUnlocked('Cauldron')) {
      GameState.unlockZone('Cauldron');
      this.time.delayedCall(800, () =>
        this._emitNarrative('Tens todas as plantas! Derrota os Ecos no Vale dos Espelhos para abrir o caminho.', 5000)
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Portal
  // ──────────────────────────────────────────────────────────────────────────
  _usePortal(portal) {
    if (portal.isLocked) {
      this._emitNarrative('Precisas de todas as 5 plantas essenciais para chegar ao caldeirão.');
      return;
    }
    SoundManager.portal();
    MusicManager.stop();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.events.off('plantStolen', this._onPlantStolen, this);
      this.scene.start(portal.destination);
    });
  }

  _useCauldronMirror() {
    if (!GameState.checkCauldronUnlock()) {
      this._emitNarrative('Precisas de todas as 5 plantas essenciais para atravessar o espelho do caldeirão.', 3500);
      return;
    }
    SoundManager.portal();
    MusicManager.stop();
    this.cameras.main.flash(800, 200, 160, 255, false, null, 0.6);
    this.cameras.main.fadeOut(1000, 200, 160, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.game.events.off('plantStolen', this._onPlantStolen, this);
      this.scene.start('Cauldron');
    });
  }

  _checkZoneUnlocks() {
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
    this._emitNarrative(`Os Ecos trocaram a ${plant.name} por uma cópia falsa!`, 4000);
    const spawn = PLANT_SPAWNS.find(s => s.id === plant.id);
    if (!spawn) return;
    this.time.delayedCall(20000, () => {
      if (GameState.collected.has(plant.id) || !this.scene.isActive('Zone3')) return;
      const data = PLANTS[plant.id];
      if (data) this.plants.push(new Plant(this, spawn.x, spawn.y, data));
    });
  }

  shutdown() {
    this.game.events.off('plantStolen', this._onPlantStolen, this);
    this._ladrao?.destroy();
  }
}
