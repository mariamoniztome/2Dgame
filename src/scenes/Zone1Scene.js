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

// Zone 1 — 3200 wide × 1080 tall (landscape, one screen high)
const AREAS = {
  campoVagalumes: { label: 'Campo dos Vagalumes', minX: 0,    maxX: 1100 },
  jardimInvertido: { label: 'Jardim Invertido',   minX: 1100, maxX: 2200 },
  limiarSecreto:   { label: 'Limiar Secreto',     minX: 2200, maxX: 3200 },
};

const VINE_X = 2210, VINE_Y = 620, VINE_CLIMB_Y = 160;

const PLANT_SPAWNS = [
  { id: 'ventoinha',  x: 310,  y: 340 },
  { id: 'ventoinha',  x: 620,  y: 650 },
  { id: 'gotateia',   x: 190,  y: 500 },
  { id: 'gotateia',   x: 1260, y: 390 },
  { id: 'farfalha',   x: 1540, y: 555 },
  { id: 'farfalha',   x: 1840, y: 300 },
  { id: 'trepadeira', x: VINE_X - 60, y: VINE_Y + 30 },
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
    this.player = new Player(this, 420, 540);

    this._buildPlants();
    GameState.plantSpawns = PLANT_SPAWNS.map(s => ({ id: s.id, x: s.x, y: s.y }));
    this._buildCreature();
    this._buildPortal();
    this._buildFireflies();

    // Subtle shadow under the player
    this.playerShadow = this.add.ellipse(this.player.x, this.player.y + 24, 28, 10, 0x000000, 0.25).setDepth(4);
    this.playerGlow   = this.add.circle(this.player.x, this.player.y, 10, 0xffffff, 0.08).setDepth(9).setBlendMode('ADD');

    // Camera — snap immediately then lerp smoothly
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(1.2);
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
    this.keyC     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyF     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyQ     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyM     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    // Launch HUD overlay
    if (!this.scene.isActive('HUD')) this.scene.launch('HUD');

    // State
    this._nearPlant      = null;
    this._nearPortal     = false;
    this._vineClimbed    = GameState.collected.has('trepadeira');
    this._currentArea    = '';
    this._briefTimer     = 0;
    this._spellCooldown  = 0;
    this._proximityTimer = 0;
    this._timedPlant     = null;

    // Hint timers (idle guidance)
    this._hintLevel  = 0;
    this._butterflyTween = null;

    // Footstep sound timer
    this._footTimer = 0;

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
    const g = this.add.graphics().setDepth(0);

    // ── Campo dos Vagalumes: solid green + background image once (no repeat) ─
    g.fillStyle(0x9ed89e, 1); g.fillRect(0, 0, 1100, WORLD_HEIGHT);
    if (this.textures.exists('z1_bg_campo')) {
      // Single image stretched to fill campo width × world height — no tiling
      this.add.image(0, 0, 'z1_bg_campo')
        .setOrigin(0, 0).setDisplaySize(1100, WORLD_HEIGHT).setDepth(1);
    }

    // ── Jardim Invertido: darker green + transition bg ───────────────────────
    g.fillStyle(0x5a8c60, 1); g.fillRect(1100, 0, 1100, WORLD_HEIGHT);
    if (this.textures.exists('z1_bg_trans')) {
      this.add.image(1100, 0, 'z1_bg_trans')
        .setOrigin(0, 0).setDisplaySize(1100, WORLD_HEIGHT).setDepth(1);
    }
    const jTint = this.add.graphics().setDepth(2);
    jTint.fillStyle(0x050e08, 0.25); jTint.fillRect(1100, 0, 1100, WORLD_HEIGHT);

    // ── Limiar Secreto: dark ─────────────────────────────────────────────────
    g.fillStyle(0x060c18, 1); g.fillRect(2200, 0, 1000, WORLD_HEIGHT);

    // ── Plant wall at Jardim → Limiar boundary ───────────────────────────────
    if (this.textures.exists('z1_parede')) {
      this.add.image(2190, WORLD_HEIGHT / 2, 'z1_parede')
        .setOrigin(0.5).setDepth(3).setAlpha(0.55).setDisplaySize(720, WORLD_HEIGHT);
    }

    // ── Location signs ───────────────────────────────────────────────────────
    if (this.textures.exists('z1_placa_campo')) {
      this.add.image(120, WORLD_HEIGHT - 100, 'z1_placa_campo').setDisplaySize(130, 130).setDepth(4);
    }
    if (this.textures.exists('z1_placa_limiar')) {
      this.add.image(2300, 120, 'z1_placa_limiar').setDisplaySize(130, 130).setDepth(4);
    }
  }

  _buildDecorations() {
    // All campo element keys available
    const campoNums = ['03','04','05','06','07','08','09','10','11','12',
                       '13','14','15','17','18','19','20','21','22','23','24'];
    const ck = campoNums.filter(n => this.textures.exists(`z1_campo_${n}`))
                        .map(n => `z1_campo_${n}`);

    // Campo dos Vagalumes — 6 rows across 1100×1080
    const CAMPO_POS = [
      [50,  65,  420], [250, 50,  360], [500, 45,  300], [730, 70,  400], [930, 60,  340], [1060,85,  260],
      [70,  250, 380], [310, 215, 340], [580, 240, 280], [840, 260, 360], [1040,280, 260],
      [55,  420, 400], [290, 385, 280], [560, 440, 220], [790, 400, 380], [1000,450, 300],
      [100, 600, 360], [390, 560, 240], [690, 620, 400], [1020,580, 280],
      [65,  780, 380], [310, 745, 340], [570, 800, 260], [830, 760, 400], [1050,810, 280],
      [80,  950, 360], [340, 920, 300], [620, 970, 340], [890, 940, 380], [1040,975, 240],
    ];

    if (ck.length > 0) {
      CAMPO_POS.forEach(([x, y, s], i) => {
        const key = ck[i % ck.length];
        this.add.image(x, y, key).setDisplaySize(s, s).setDepth(3);
      });
    }

    // Transição / Jardim Invertido elements
    const transNums = ['01','02','03','04','05','06','07','08','09','10',
                       '11','12','13','14','15','16','17','18','19'];
    const tk = transNums.filter(n => this.textures.exists(`z1_trans_${n}`))
                        .map(n => `z1_trans_${n}`);

    const TRANS_POS = [
      [1140, 65,  220], [1380, 50,  200], [1640, 70,  240], [1900, 55,  200], [2100, 85,  180],
      [1160, 250, 200], [1420, 215, 240], [1700, 240, 200], [1980, 260, 220], [2130, 280, 180],
      [1150, 440, 240], [1450, 405, 200], [1720, 445, 220], [2000, 420, 200], [2110, 460, 240],
      [1180, 620, 200], [1460, 585, 220], [1740, 630, 200], [2020, 600, 240], [2140, 645, 180],
      [1160, 800, 240], [1440, 770, 200], [1720, 820, 220], [2000, 785, 200], [2130, 840, 240],
      [1180, 970, 200], [1460, 940, 240], [1740, 980, 200], [2020, 955, 220],
    ];

    if (tk.length > 0) {
      TRANS_POS.forEach(([x, y, s], i) => {
        const key = tk[i % tk.length];
        this.add.image(x, y, key).setDisplaySize(s, s).setDepth(3).setAlpha(0.88);
      });
    }

    // Limiar Secreto elements
    const limiarNums = ['03','04','05','06','07','08','09','11','12','13','14','15',
                        '16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'];
    const lk = limiarNums.filter(n => this.textures.exists(`z1_limiar_${n}`))
                         .map(n => `z1_limiar_${n}`);

    const LIMIAR_POS = [
      [2250, 65,  220], [2480, 50,  200], [2720, 70,  240], [2960, 55,  200], [3150, 85,  180],
      [2260, 250, 200], [2500, 215, 240], [2740, 250, 200], [2980, 260, 220], [3140, 280, 180],
      [2250, 440, 240], [2490, 405, 200], [2730, 445, 220], [2970, 420, 200], [3130, 460, 240],
      [2260, 620, 200], [2500, 585, 220], [2740, 630, 200], [2980, 600, 240], [3150, 645, 180],
      [2250, 800, 240], [2490, 770, 200], [2730, 820, 220], [2970, 785, 200], [3130, 840, 240],
      [2260, 970, 200], [2500, 940, 240], [2740, 980, 200], [2980, 955, 220],
    ];

    if (lk.length > 0) {
      LIMIAR_POS.forEach(([x, y, s], i) => {
        const key = lk[i % lk.length];
        this.add.image(x, y, key).setDisplaySize(s, s).setDepth(3).setAlpha(0.85);
      });
    }

    // Area boundary markers (subtle, only for non-campo areas)
    [2200].forEach(bx => {
      this.add.rectangle(bx, WORLD_HEIGHT / 2, 4, WORLD_HEIGHT, 0x1a3a22, 0.25).setDepth(3);
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
    this.creature = new Creature(this, 1820, 540, 'creature_farfalha', {
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
    const ffKey = this.textures.exists('z1_vagalume') ? 'z1_vagalume' : 'firefly';
    const ffScale = ffKey === 'z1_vagalume' ? { start: 0.22, end: 0 } : { start: 1, end: 0 };

    const vagScale = ffKey === 'z1_vagalume' ? 0.55 : 1;

    // Dense fireflies in Campo dos Vagalumes (x 0–1100)
    this.add.particles(0, 0, ffKey, {
      x: { min: 40, max: 1060 },
      y: { min: 40, max: WORLD_HEIGHT - 40 },
      lifespan: { min: 2200, max: 4500 },
      speed: { min: 8, max: 28 },
      scale: { start: vagScale, end: 0 },
      alpha: { start: 0.95, end: 0 },
      quantity: 2,
      frequency: 150,
      blendMode: 'ADD',
    }).setDepth(7);

    // Sparse fireflies elsewhere
    this.add.particles(0, 0, ffKey, {
      x: { min: 1100, max: 3150 },
      y: { min: 40, max: WORLD_HEIGHT - 40 },
      lifespan: { min: 1800, max: 3500 },
      speed: { min: 5, max: 18 },
      scale: { start: vagScale * 0.7, end: 0 },
      alpha: { start: 0.65, end: 0 },
      quantity: 1,
      frequency: 500,
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
    this._checkPlantProximity(time, delta);
    this._checkVineProximity();
    this._checkPortalProximity();
    this._handleKeys(time, delta);
    this._updateHints(delta);
    this._updateFootsteps(delta);
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
  _checkPlantProximity(time, delta) {
    this._nearPlant = null;
    let foundNear = false;

    this.plants.forEach(plant => {
      if (plant.isCollected || !plant.isVisible) return;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, plant.x, plant.y
      );
      const inRange = dist < PLAYER_INTERACTION_RADIUS;
      const method  = plant.plantData.collectMethod;

      // 'fast' hint changes based on speed
      if (inRange && method === 'fast') {
        plant.showHint(this.player.recentSpeed >= 120 ? false : true, 'Corre para apanhar!');
      } else {
        plant.showHint(inRange);
      }

      if (!inRange) return;
      this._nearPlant = plant;
      foundNear = true;

      // ── Auto-collect: 'fast' ──────────────────────────────────────────
      if (method === 'fast') {
        if (this.player.recentSpeed >= 120) this._collectPlant(plant);
        return;
      }

      // ── Auto-collect: 'interact', 'brave', or 'slow' ─────────────────
      if (method === 'interact' || method === 'brave' || method === 'slow') {
        const tooFast = method === 'slow' && this.player.recentSpeed > 50;
        if (tooFast) {
          this._timedPlant = null; this._proximityTimer = 0;
          return; // player moving too fast — spines hurt
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
    // C — interact (portals, shake gotateia, farfalha spell)
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
      this._handleInteract(time);
    }

    // F — cast spell
    if (Phaser.Input.Keyboard.JustDown(this.keyF) && this._spellCooldown <= 0) {
      this._castSpell();
    }

    // Q — cycle spell
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      GameState.cycleSpell();
      this.game.events.emit('spellCast', GameState.activeSpell);
    }

    // M — open map overlay (pause zone, don't restart it)
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) {
      SoundManager.mapToggle(true);
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
    // Portal takes priority
    if (this._nearPortal) { this._usePortal(); return; }
    if (!this._nearPlant) return;

    const plant  = this._nearPlant;
    const method = plant.plantData.collectMethod;

    // 'fast', 'interact', 'brave' are now auto-collected in _checkPlantProximity
    // E key only needed for: shake, spell, climb

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
        this._emitNarrative('Activa a Brisa Molhada (Q + Espaço) e depois usa E na Farfalha.');
      } else {
        this._emitNarrative('Esta planta está protegida. Precisas de um feitiço especial…');
      }
      return;
    }

    if (method === 'climb') { this._climbVine(); return; }
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
    SoundManager.portal();
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

  _updateFootsteps(delta) {
    if (this.player.recentSpeed < 20) { this._footTimer = 0; return; }
    this._footTimer += delta;
    const interval = this.player.recentSpeed > 120 ? 260 : 380;
    if (this._footTimer >= interval) {
      this._footTimer = 0;
      SoundManager.footstep(this.player.recentSpeed > 120);
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
