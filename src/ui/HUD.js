import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ELEMENTS, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';

// Area colour strips per zone for the minimap
const ZONE_AREAS = {
  Zone1: [
    { color: 0x1b5e20, from: 0,    to: 1100 },
    { color: 0x33691e, from: 1100, to: 2200 },
    { color: 0x1a237e, from: 2200, to: 3200 },
  ],
  Zone2: [
    { color: 0x0d2a18, from: 0,    to: 900  },
    { color: 0x1b3a20, from: 900,  to: 1800 },
    { color: 0x33691e, from: 1800, to: 2500 },
    { color: 0x2e1503, from: 2500, to: 3200 },
  ],
  Zone3: [
    { color: 0x0d0014, from: 0,    to: 1200 },
    { color: 0x1a0a2e, from: 1200, to: 2400 },
    { color: 0x0a1018, from: 2400, to: 3200 },
  ],
};

// Minimap panel (bottom-right)
const MM_PANEL_W = 190;
const MM_PANEL_H = 120;
const MM_INNER_W = 170;
const MM_INNER_H = 50;

const ESSENTIAL_IDS = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUD', active: false }); }

  create() {
    const W = GAME_WIDTH, H = GAME_HEIGHT;

    this._slots = [];
    this._narrativeTimer = null;
    this._lastZone = null;
    this._toastQueue = [];
    this._toastActive = false;
    this._helpVisible = false;
    this._helpShownOnce = false;

    // ── BOTTOM-LEFT: Mochila ──────────────────────────────────────────────
    this.add.rectangle(8, H - 8, 240, 100, 0x080810, 0.78)
      .setOrigin(0, 1).setStrokeStyle(1, 0x5b21b6, 0.5);

    this._bagTitleText = this.add.text(18, H - 96, 'MOCHILA  0/6', {
      fontSize: '11px', fontFamily: 'monospace', color: '#7c5cbf',
    });

    for (let i = 0; i < 6; i++) {
      const sx = 20 + i * 36, sy = H - 62;
      const bg = this.add.rectangle(sx, sy, 28, 28, 0x120c24, 0.9)
        .setStrokeStyle(1, 0x3d2b7a, 0.7);
      const icon = this.add.circle(sx, sy, 10, 0x3d2b7a, 0).setAlpha(0);
      const fake = this.add.text(sx, sy, '?', {
        fontSize: '11px', fontFamily: 'monospace', color: '#886688',
      }).setOrigin(0.5).setAlpha(0);
      this._slots.push({ bg, icon, fake, sx, sy });
    }

    // Mini potion progress under bag slots
    this._buildBagPotionDots(W, H);

    // ── TOP-LEFT: Active spell panel ──────────────────────────────────────
    this.add.rectangle(8, 8, 140, 64, 0x080810, 0.78)
      .setOrigin(0, 0).setStrokeStyle(1, 0x5b21b6, 0.5);
    this.add.text(18, 12, 'FEITICO', {
      fontSize: '10px', fontFamily: 'monospace', color: '#7c5cbf',
    });
    this.spellPlant1 = this.add.circle(38, 40, 13, 0x1a1a2e, 0.9)
      .setStrokeStyle(1, 0x3d2b7a, 0.7);
    this.spellPlant2 = this.add.circle(78, 40, 13, 0x1a1a2e, 0.9)
      .setStrokeStyle(1, 0x3d2b7a, 0.7);
    this.spellLabel = this.add.text(72, 56, '—', {
      fontSize: '10px', fontFamily: 'monospace', color: '#666688',
    }).setOrigin(0.5, 0);

    // ── TOP-RIGHT: Cast spell (ESPACO) panel ──────────────────────────────
    this.add.rectangle(W - 8, 8, 130, 64, 0x080810, 0.78)
      .setOrigin(1, 0).setStrokeStyle(1, 0x5b21b6, 0.5);
    this.add.text(W - 130, 12, 'ESPACO', {
      fontSize: '10px', fontFamily: 'monospace', color: '#7c5cbf',
    });
    this.spellGfx = this.add.image(W - 80, 36, 'spell_brisa')
      .setDisplaySize(36, 36).setAlpha(0.3);
    this.spellName = this.add.text(W - 80, 57, '—', {
      fontSize: '10px', fontFamily: 'monospace', color: '#666688',
    }).setOrigin(0.5, 0);

    // ── TOP-CENTER: Area label ─────────────────────────────────────────────
    this.areaLabel = this.add.text(W / 2, 14, '', {
      fontSize: '13px', fontFamily: 'Georgia, serif',
      color: '#c8dde8', stroke: '#080810', strokeThickness: 2, fontStyle: 'italic',
    }).setOrigin(0.5, 0).setAlpha(0.85).setDepth(50);

    // ── BOTTOM-RIGHT: Minimap panel ───────────────────────────────────────
    const mmPanelX = W - 8;
    const mmPanelY = H - 8;
    this.add.rectangle(mmPanelX, mmPanelY, MM_PANEL_W, MM_PANEL_H, 0x080810, 0.82)
      .setOrigin(1, 1).setStrokeStyle(1, 0x5b21b6, 0.5);
    this.add.text(mmPanelX - MM_PANEL_W + 8, mmPanelY - MM_PANEL_H + 8, 'MAPA', {
      fontSize: '10px', fontFamily: 'monospace', color: '#7c5cbf',
    });

    // Minimap inner area
    const MM_X = W - 8 - MM_PANEL_W + 10;
    const MM_Y = H - 8 - MM_PANEL_H + 26;
    this._mmX = MM_X;
    this._mmY = MM_Y;
    this._mmW = MM_INNER_W;
    this._mmH = MM_INNER_H;

    this.mmGfx = this.add.graphics().setDepth(58);
    this.mmDot = this.add.circle(MM_X, MM_Y + MM_INNER_H / 2, 3, 0xffffff, 1).setDepth(60);

    // Minimap border (pulses when cauldron progress > 0)
    this.mmBorder = this.add.rectangle(MM_X, MM_Y, MM_INNER_W, MM_INNER_H, 0x000000, 0)
      .setOrigin(0, 0).setStrokeStyle(1, 0x9575cd, 0.4).setDepth(61);
    this.mmPulseTween = this.tweens.add({
      targets: this.mmBorder,
      alpha: { from: 0.4, to: 1 },
      duration: 2000, repeat: -1, yoyo: true, ease: 'Sine.easeInOut',
      paused: true,
    });

    this._drawMinimapBg('Zone1');

    // ── BOTTOM-CENTER: Narrative strip ────────────────────────────────────
    this.narrativePanel = this.add.rectangle(W / 2, H - 130, 740, 64, 0x080810, 0)
      .setOrigin(0.5, 1);
    this.narrativeText = this.add.text(W / 2, H - 128, '', {
      fontSize: '16px', fontFamily: 'Georgia, serif',
      color: '#f5e6c8', wordWrap: { width: 720 },
      align: 'center', stroke: '#080810', strokeThickness: 3,
      lineSpacing: 4,
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    // ── Spell unlock banner ────────────────────────────────────────────────
    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: '20px', fontFamily: 'Georgia, serif',
      color: '#ce93d8', stroke: '#080810', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // ── Help button ────────────────────────────────────────────────────────
    this._buildHelpButton(W);

    // ── Help overlay ───────────────────────────────────────────────────────
    this._buildHelpOverlay(W, H);

    // ── Toast panel (right side, slides in) ──────────────────────────────
    this._toastPanel = null;

    // ── Global event listeners ─────────────────────────────────────────────
    this.game.events.on('plantCollected', this._onPlantCollected, this);
    this.game.events.on('plantStolen',    this._onPlantStolen,    this);
    this.game.events.on('spellCast',      this._onSpellCast,      this);
    this.game.events.on('showNarrative',  this._showNarrative,    this);
    this.game.events.on('spellUnlocked',  this._showUnlock,       this);
    this.game.events.on('areaChanged',    this._updateArea,       this);

    this._refresh();

    // Auto-show help on first Zone1 start
    this.time.delayedCall(1200, () => {
      if (GameState.currentZone === 'Zone1' && !this._helpShownOnce) {
        this._helpShownOnce = true;
        this._showHelp();
        this.time.delayedCall(8000, () => {
          if (this._helpVisible) this._hideHelp();
        });
      }
    });
  }

  // ── Help button ─────────────────────────────────────────────────────────
  _buildHelpButton(W) {
    const bx = W - 20, by = 20;
    this._helpBtnBg = this.add.circle(bx, by, 14, 0x1a1a3a, 0.9)
      .setStrokeStyle(1.5, 0x7c5cbf, 0.8)
      .setInteractive({ useHandCursor: true })
      .setDepth(150);
    this._helpBtnText = this.add.text(bx, by, '?', {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#ce93d8',
    }).setOrigin(0.5).setDepth(151);

    this._helpBtnBg.on('pointerover', () => this._helpBtnBg.setFillStyle(0x2a2a5a, 0.95));
    this._helpBtnBg.on('pointerout',  () => this._helpBtnBg.setFillStyle(0x1a1a3a, 0.9));
    this._helpBtnBg.on('pointerdown', () => this._toggleHelp());

    this.input.keyboard.on('keydown-H', () => this._toggleHelp());
  }

  // ── Help overlay ─────────────────────────────────────────────────────────
  _buildHelpOverlay(W, H) {
    const cx = W / 2, cy = H / 2;
    this._helpOverlay = this.add.container(cx, cy).setDepth(400).setVisible(false);

    const panel = this.add.rectangle(0, 0, 500, 380, 0x080810, 0.94)
      .setStrokeStyle(2, 0x7b1fa2, 0.8);
    this._helpOverlay.add(panel);

    const title = this.add.text(0, -170, 'Como Jogar', {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: '#ce93d8',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this._helpOverlay.add(title);

    const controls = [
      'WASD / Setas  →  Mover',
      'Shift              →  Correr',
      'E                    →  Interagir / Apanhar',
      'Espaço         →  Lançar Feitiço',
      'Q                    →  Mudar Feitiço',
      'M                    →  Mapa',
      'H                    →  Ajuda',
      '↑ junto a trepadeira  →  Subir',
    ];
    const ctrlText = this.add.text(-220, -135,
      controls.join('\n'), {
        fontSize: '13px', fontFamily: 'monospace',
        color: '#d0c8f0', lineSpacing: 7,
      }
    ).setOrigin(0, 0);
    this._helpOverlay.add(ctrlText);

    const divider = this.add.rectangle(0, 18, 440, 1, 0x5b21b6, 0.5);
    this._helpOverlay.add(divider);

    const objTitle = this.add.text(0, 28, 'Objectivo', {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#9575cd', fontStyle: 'italic',
    }).setOrigin(0.5, 0);
    this._helpOverlay.add(objTitle);

    const objText = this.add.text(0, 54,
      'Apanha 5 plantas essenciais para a poção.\nEvita as criaturas com os feitiços certos.', {
        fontSize: '13px', fontFamily: 'Georgia, serif',
        color: '#c8b8e8', align: 'center', lineSpacing: 5,
      }
    ).setOrigin(0.5, 0);
    this._helpOverlay.add(objText);

    const closeHint = this.add.text(0, 148, 'Clica ou prime H para fechar', {
      fontSize: '12px', fontFamily: 'Georgia, serif',
      color: '#6a5acd', fontStyle: 'italic',
    }).setOrigin(0.5);
    this._helpOverlay.add(closeHint);

    this.tweens.add({
      targets: closeHint, alpha: { from: 0.5, to: 1 },
      duration: 900, yoyo: true, repeat: -1,
    });

    // Click outside or on panel to close
    panel.setInteractive().on('pointerdown', () => this._hideHelp());
  }

  _toggleHelp() {
    if (this._helpVisible) this._hideHelp();
    else this._showHelp();
  }

  _showHelp() {
    this._helpVisible = true;
    this._helpOverlay.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this._helpOverlay, alpha: 1, duration: 220 });
  }

  _hideHelp() {
    this._helpVisible = false;
    this.tweens.add({
      targets: this._helpOverlay, alpha: 0, duration: 220,
      onComplete: () => this._helpOverlay.setVisible(false),
    });
  }

  // ── Bag potion dots ──────────────────────────────────────────────────────
  _buildBagPotionDots(W, H) {
    this._potionDots = [];
    const startX = 18;
    const dotY = H - 20;
    const spacing = 36;

    this.add.text(startX, dotY, 'Poção:', {
      fontSize: '9px', fontFamily: 'monospace', color: '#5a4a7a',
    }).setOrigin(0, 0.5);

    for (let i = 0; i < 5; i++) {
      const dx = startX + 46 + i * 30;
      const dot = this.add.circle(dx, dotY, 6, 0x1a1a3a, 0.6)
        .setStrokeStyle(1, 0x3d2b6a, 0.5);
      this._potionDots.push(dot);
    }
  }

  _refreshPotionDots() {
    ESSENTIAL_IDS.forEach((id, i) => {
      if (!this._potionDots[i]) return;
      const isCollected = GameState.collected.has(id);
      const plant = PLANTS[id];
      const elColor = (plant && ELEMENTS[plant.element]) ? ELEMENTS[plant.element].color : 0xce93d8;
      this._potionDots[i].setFillStyle(isCollected ? elColor : 0x1a1a3a, isCollected ? 1 : 0.6);
      this._potionDots[i].setStrokeStyle(1, isCollected ? elColor : 0x3d2b6a, isCollected ? 0.8 : 0.4);
    });
  }

  // ── Minimap ──────────────────────────────────────────────────────────────
  _drawMinimapBg(zone) {
    this._lastZone = zone;
    const areas = ZONE_AREAS[zone] || ZONE_AREAS.Zone1;
    this.mmGfx.clear();
    areas.forEach(a => {
      const x = this._mmX + (a.from / WORLD_WIDTH) * this._mmW;
      const w = ((a.to - a.from) / WORLD_WIDTH) * this._mmW;
      this.mmGfx.fillStyle(a.color, 1);
      this.mmGfx.fillRect(x, this._mmY, w, this._mmH);
    });
  }

  _updateMinimap() {
    const zone = GameState.currentZone;
    if (zone !== this._lastZone && ZONE_AREAS[zone]) {
      this._drawMinimapBg(zone);
    }
    const px = GameState.playerX;
    const dotX = this._mmX + (px / WORLD_WIDTH) * this._mmW;
    const dotY = this._mmY + this._mmH / 2;
    this.mmDot.setPosition(dotX, dotY);

    // Pulse border based on cauldron progress
    const prog = GameState.cauldronProgress();
    if (prog > 0) {
      const speed = 1 + prog * 2.5;
      if (!this._mmPulseActive) {
        this._mmPulseActive = true;
        this.mmPulseTween.resume();
      }
      this.mmPulseTween.timeScale = speed;
      const hue = 0.35 + prog * 0.5;
      const rgb = Phaser.Display.Color.HSVToRGB(hue, 0.8, 0.9);
      this.mmBorder.setStrokeStyle(2, Phaser.Display.Color.GetColor(rgb.r, rgb.g, rgb.b), 0.8);
    }
  }

  // ── Per-frame update ─────────────────────────────────────────────────────
  update() {
    this._updateMinimap();
  }

  // ── Refresh helpers ──────────────────────────────────────────────────────
  _refresh() {
    this._refreshInventory();
    this._refreshSpell();
    this._refreshPotionDots();
  }

  _refreshInventory() {
    const count = GameState.inventory.length;
    this._bagTitleText.setText(`MOCHILA  ${count}/6`);

    this._slots.forEach((s, i) => {
      const plant = GameState.inventory[i];
      if (plant) {
        const el = ELEMENTS[plant.element] || ELEMENTS.EARTH;
        const col = plant.isFake ? 0x886688 : el.color;
        s.icon.setFillStyle(col, 0.9).setAlpha(1);
        s.fake.setAlpha(plant.isFake ? 1 : 0);
        s.bg.setStrokeStyle(1, col, 0.6);
      } else {
        s.icon.setAlpha(0);
        s.fake.setAlpha(0);
        s.bg.setStrokeStyle(1, 0x3d2b7a, 0.7);
      }
    });
  }

  _refreshSpell() {
    const spell = GameState.activeSpell ? SPELLS[GameState.activeSpell] : null;
    if (spell) {
      this.spellGfx.setTexture(spell.textureKey).setAlpha(0.9);
      this.spellName.setText(spell.name).setColor('#f5e6c8');
      const p = spell.plants || [];
      const c1 = p[0] ? (ELEMENTS[PLANTS[p[0]]?.element]?.color ?? 0xffffff) : 0x1a1a2e;
      const c2 = p[1] ? (ELEMENTS[PLANTS[p[1]]?.element]?.color ?? 0xffffff) : 0x1a1a2e;
      this.spellPlant1.setFillStyle(c1, p[0] ? 0.85 : 0.2);
      this.spellPlant2.setFillStyle(c2, p[1] ? 0.85 : 0.2);
      this.spellLabel.setText(spell.name).setColor('#d0e8f0');
    } else {
      this.spellGfx.setAlpha(0.2);
      this.spellName.setText('—').setColor('#666688');
      this.spellLabel.setText('—').setColor('#666688');
      this.spellPlant1.setFillStyle(0x1a1a2e, 0.9);
      this.spellPlant2.setFillStyle(0x1a1a2e, 0.9);
    }
  }

  // ── Toast system ─────────────────────────────────────────────────────────
  showPlantToast(plantData) {
    if (!plantData) return;
    this._toastQueue.push(plantData);
    if (!this._toastActive) {
      this._showNextToast();
    }
  }

  _showNextToast() {
    if (!this._toastQueue.length) {
      this._toastActive = false;
      return;
    }
    this._toastActive = true;
    const plantData = this._toastQueue.shift();
    this._displayToast(plantData);
  }

  _displayToast(plantData) {
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const TOAST_W = 300, TOAST_H = 100;
    const targetX = W - 320;
    const toastY = H / 2 - 50;
    const startX = W + 310;

    const el = (plantData.element && ELEMENTS[plantData.element]) ? ELEMENTS[plantData.element] : ELEMENTS.EARTH;
    const elColor = el.color;
    const elColorHex = '#' + elColor.toString(16).padStart(6, '0');

    // Destroy previous toast if any
    if (this._toastPanel) {
      this._toastPanel.destroy();
      this._toastPanel = null;
    }

    const container = this.add.container(startX, toastY).setDepth(300);
    this._toastPanel = container;

    // Panel background
    const bg = this.add.rectangle(0, 0, TOAST_W, TOAST_H, 0x080814, 0.94)
      .setOrigin(0, 0)
      .setStrokeStyle(2, elColor, 0.85);
    container.add(bg);

    // Element badge top-right
    const elBadge = this.add.text(TOAST_W - 8, 6, el.name.toUpperCase(), {
      fontSize: '9px', fontFamily: 'monospace', color: elColorHex,
    }).setOrigin(1, 0);
    container.add(elBadge);

    // Plant name
    const nameText = this.add.text(10, 10, plantData.name || plantData.id, {
      fontSize: '15px', fontFamily: 'Georgia, serif',
      color: elColorHex, fontStyle: 'bold',
    }).setOrigin(0, 0);
    container.add(nameText);

    // Narrative text
    const narText = this.add.text(10, 32, plantData.narrativeText || '', {
      fontSize: '11px', fontFamily: 'Georgia, serif',
      color: '#c8b8e8', fontStyle: 'italic',
      wordWrap: { width: TOAST_W - 20 },
      lineSpacing: 3,
    }).setOrigin(0, 0);
    container.add(narText);

    // Slide in + fade in
    this.tweens.add({
      targets: container,
      x: targetX,
      alpha: { from: 0, to: 1 },
      duration: 380,
      ease: 'Power2.easeOut',
      onComplete: () => {
        // Hold for 5 seconds then slide out
        this.time.delayedCall(5000, () => {
          this.tweens.add({
            targets: container,
            x: W + 310,
            alpha: 0,
            duration: 380,
            ease: 'Power2.easeIn',
            onComplete: () => {
              container.destroy();
              if (this._toastPanel === container) this._toastPanel = null;
              this._showNextToast();
            },
          });
        });
      },
    });
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  _onPlantCollected(plantData) {
    this._refresh();
    if (plantData) {
      this.showPlantToast(plantData);
    }
    if (GameState.spellJustUnlocked) {
      const spell = SPELLS[GameState.spellJustUnlocked];
      this._showUnlock(`Feitiço desbloqueado!\n${spell.name}`);
      GameState.spellJustUnlocked = null;
    }
    // Brief minimap flash
    this._flashMinimap();
  }

  _flashMinimap() {
    this.tweens.add({
      targets: this.mmBorder,
      alpha: { from: 1, to: 0.4 },
      duration: 600,
      yoyo: true,
    });
  }

  _onPlantStolen()  { this._refreshInventory(); this._refreshPotionDots(); }
  _onSpellCast()    {
    this._refreshSpell();
    this.tweens.add({ targets: this.spellGfx, scale: { from: 1, to: 1.4 }, duration: 180, yoyo: true });
  }

  _showNarrative(text, duration = 4000) {
    if (this._narrativeTimer) this._narrativeTimer.remove();
    this.tweens.killTweensOf(this.narrativeText);
    this.narrativePanel.setFillStyle(0x080810, 0.7);
    this.narrativeText.setText(text);
    this.tweens.add({
      targets: this.narrativeText, alpha: 1, duration: 280,
      onComplete: () => {
        this._narrativeTimer = this.time.delayedCall(duration, () => {
          this.tweens.add({ targets: [this.narrativeText, this.narrativePanel], alpha: 0, duration: 500 });
        });
      },
    });
  }

  _showUnlock(msg) {
    this.unlockBanner.setText(msg).setAlpha(0).setY(GAME_HEIGHT / 2);
    this.tweens.add({
      targets: this.unlockBanner, alpha: 1, y: GAME_HEIGHT / 2 - 12,
      duration: 380, ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(2600, () =>
          this.tweens.add({ targets: this.unlockBanner, alpha: 0, duration: 500 })
        );
      },
    });
  }

  _updateArea(name) {
    this.areaLabel.setText(name);
    this.tweens.add({ targets: this.areaLabel, alpha: { from: 1, to: 0.8 }, duration: 1200 });
  }
}
