import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ELEMENTS, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';

const ESSENTIAL_IDS = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

// ── Color palette (from reference image) ─────────────────────────────────
const C = {
  bg:     0x0D351E,   // dark forest green — panel backgrounds
  border: 0x639B5A,   // forest green — borders
  dim:    0x2d5a38,   // dim green — empty/inactive
  accent: 0xE4EF6F,   // yellow-green — highlights / player dot
  magic:  0xE1A0B1,   // rose — spells / potion progress
  text:   '#BFD8A4',  // light mint — body text
  label:  '#639B5A',  // forest green — secondary labels
};

// Zone color strips for minimap
const ZONE_STRIPS = {
  Zone1: [
    { color: 0x1b4a28, xFrom: 0,    xTo: 1100 },
    { color: 0x2d6644, xFrom: 1100, xTo: 2200 },
    { color: 0x1a3a52, xFrom: 2200, xTo: 3200 },
  ],
  Zone2: [
    { color: 0x0d2a18, xFrom: 0,    xTo: 900  },
    { color: 0x1a4428, xFrom: 900,  xTo: 1800 },
    { color: 0x2d6030, xFrom: 1800, xTo: 2500 },
    { color: 0x2e1503, xFrom: 2500, xTo: 3200 },
  ],
  Zone3: [
    { color: 0x0d0a18, xFrom: 0,    xTo: 1200 },
    { color: 0x1a0a2e, xFrom: 1200, xTo: 2400 },
    { color: 0x0a1018, xFrom: 2400, xTo: 3200 },
  ],
};

// Minimap: large, center-bottom, always visible
const MM_W = 320;
const MM_H = 100;
const MM_X = (GAME_WIDTH - MM_W) / 2;
const MM_Y = GAME_HEIGHT - 14 - MM_H - 22;

// Toast
const TOAST_W = 260;
const TOAST_H = 68;

export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUD', active: false }); }

  create() {
    const W = GAME_WIDTH, H = GAME_HEIGHT;

    this._slots          = [];
    this._plantDots      = [];
    this._narrativeTimer = null;
    this._lastZone       = null;
    this._toastQueue     = [];
    this._toastActive    = false;
    this._controlsVisible = false;

    this._buildSpellPanel();
    this._buildInventory(W, H);
    this._buildCauldronPanel(W, H);
    this._buildMinimap(W, H);
    this._buildNarrative(W, H);

    // Spell unlock banner
    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: '20px', fontFamily: 'Georgia, serif',
      color: '#E1A0B1', stroke: '#0D351E', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // Area label — sits just above the minimap panel
    this.areaLabel = this.add.text(W / 2, MM_Y - 20, '', {
      fontSize: '12px', fontFamily: 'Georgia, serif',
      color: C.text, stroke: '#0D351E', strokeThickness: 2, fontStyle: 'italic',
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(55);

    // [H] hint top-right
    this.add.text(W - 10, 10, '[H] ajuda', {
      fontSize: '10px', fontFamily: 'monospace', color: C.label,
    }).setOrigin(1, 0).setDepth(55);

    this._buildControlsPanel(W, H);
    this._buildAutoHint(W, H);

    this.input.keyboard.on('keydown-H', () => this._toggleControls());

    // ── Events ────────────────────────────────────────────────────────────
    this.game.events.on('plantCollected', this._onPlantCollected, this);
    this.game.events.on('plantStolen',    this._onPlantStolen,    this);
    this.game.events.on('spellCast',      this._onSpellCast,      this);
    this.game.events.on('showNarrative',  this._showNarrative,    this);
    this.game.events.on('spellUnlocked',  this._showUnlock,       this);
    this.game.events.on('areaChanged',    this._updateArea,       this);

    this._refresh();
  }

  // ── Spell panel (top-left) ───────────────────────────────────────────────
  _buildSpellPanel() {
    this.add.rectangle(8, 8, 148, 58, C.bg, 0.88)
      .setOrigin(0, 0).setStrokeStyle(1, C.border, 0.6);
    this.add.text(18, 12, 'FEITICO', {
      fontSize: '10px', fontFamily: 'monospace', color: C.label,
    });
    this.add.text(148, 12, 'Q', {
      fontSize: '9px', fontFamily: 'monospace', color: C.label,
    }).setOrigin(1, 0);
    this.spellGfx = this.add.image(36, 38, 'spell_brisa')
      .setDisplaySize(28, 28).setAlpha(0.3);
    this.spellName = this.add.text(54, 30, '—', {
      fontSize: '11px', fontFamily: 'Georgia, serif', color: C.text,
    }).setOrigin(0, 0.5);
    this.add.text(10, 62, 'ESPACO = lancar', {
      fontSize: '8px', fontFamily: 'monospace', color: C.label,
    });
  }

  // ── Inventory (bottom-left) ─────────────────────────────────────────────
  _buildInventory(W, H) {
    this.add.rectangle(8, H - 8, 220, 72, C.bg, 0.88)
      .setOrigin(0, 1).setStrokeStyle(1, C.border, 0.6);
    this.add.text(18, H - 74, 'MOCHILA', {
      fontSize: '10px', fontFamily: 'monospace', color: C.label,
    });
    this.inventoryCount = this.add.text(210, H - 74, '0/6', {
      fontSize: '10px', fontFamily: 'monospace', color: '#E4EF6F',
    }).setOrigin(1, 0);

    for (let i = 0; i < 6; i++) {
      const sx = 20 + i * 34, sy = H - 28;
      const bg   = this.add.rectangle(sx, sy, 28, 28, 0x1a3a24, 0.9)
        .setStrokeStyle(1, C.dim, 0.7);
      const icon = this.add.circle(sx, sy, 10, C.dim, 0).setAlpha(0);
      const fake = this.add.text(sx, sy, '?', {
        fontSize: '11px', fontFamily: 'monospace', color: '#886688',
      }).setOrigin(0.5).setAlpha(0);
      this._slots.push({ bg, icon, fake, sx, sy });
    }
  }

  // ── Cauldron / potion progress (bottom-right) ────────────────────────────
  _buildCauldronPanel(W, H) {
    this.add.rectangle(W - 8, H - 8, 148, 72, C.bg, 0.88)
      .setOrigin(1, 1).setStrokeStyle(1, C.border, 0.6);
    this.add.text(W - 148, H - 74, 'POCAO', {
      fontSize: '10px', fontFamily: 'monospace', color: C.label,
    });
    this.cauldronCount = this.add.text(W - 14, H - 74, '0/5', {
      fontSize: '10px', fontFamily: 'monospace', color: '#E1A0B1',
    }).setOrigin(1, 0);

    this._essentialDots = [];
    for (let i = 0; i < 5; i++) {
      const dx = W - 138 + i * 26 + 8;
      const dy = H - 28;
      const dot = this.add.circle(dx, dy, 8, 0x1a3a24, 1)
        .setStrokeStyle(1, C.dim, 0.6);
      this._essentialDots.push(dot);
    }
  }

  // ── Minimap: large, center-bottom, always visible ─────────────────────────
  _buildMinimap(W, H) {
    const panelH = MM_H + 30;

    // Panel background
    this.add.rectangle(W / 2, H - 8, MM_W + 16, panelH, C.bg, 0.92)
      .setOrigin(0.5, 1).setStrokeStyle(1, C.border, 0.7);

    this.add.text(MM_X, H - 8 - panelH + 4, 'MAPA', {
      fontSize: '9px', fontFamily: 'monospace', color: C.label,
    });
    this.add.text(MM_X + MM_W, H - 8 - panelH + 4, '[M]', {
      fontSize: '9px', fontFamily: 'monospace', color: C.dim,
    }).setOrigin(1, 0);

    // Minimap zone-area graphics
    this.mmGfx = this.add.graphics().setDepth(58);

    // Player dot
    this.mmDot = this.add.circle(W / 2, MM_Y + MM_H / 2, 4, C.accent, 1)
      .setDepth(62).setStrokeStyle(1, 0x0D351E, 0.8);

    // Border
    this.add.rectangle(MM_X, MM_Y, MM_W, MM_H, 0x000000, 0)
      .setOrigin(0, 0).setStrokeStyle(1, C.border, 0.5).setDepth(63);

    // Zone name label below minimap graphic
    this.mmZoneLabel = this.add.text(W / 2, MM_Y + MM_H + 4, '', {
      fontSize: '10px', fontFamily: 'Georgia, serif',
      color: C.text, fontStyle: 'italic',
    }).setOrigin(0.5, 0).setDepth(62);

    this._drawMinimapBg('Zone1');
  }

  // ── Narrative (above minimap) ────────────────────────────────────────────
  _buildNarrative(W, H) {
    this.narrativeText = this.add.text(W / 2, MM_Y - 8, '', {
      fontSize: '15px', fontFamily: 'Georgia, serif',
      color: '#f5e6c8', wordWrap: { width: 680 },
      align: 'center', stroke: '#0D351E', strokeThickness: 3, lineSpacing: 4,
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);
  }

  // ── Controls panel (H toggle) ────────────────────────────────────────────
  _buildControlsPanel(W, H) {
    const cx = W / 2, cy = H / 2;
    const panel = this.add.rectangle(cx, cy, 370, 270, C.bg, 0.94)
      .setStrokeStyle(1, C.border, 0.9).setDepth(300).setVisible(false);
    const txt = this.add.text(cx, cy - 110,
      'CONTROLOS\n\n' +
      'WASD / Setas    Mover\n' +
      'Shift                  Correr\n' +
      'E                        Interagir / Apanhar\n' +
      'Espaco              Lancar feitico\n' +
      'Q                        Mudar feitico\n' +
      'M                        Mapa do jardim\n' +
      'H                        Fechar esta ajuda', {
        fontSize: '14px', fontFamily: 'monospace',
        color: C.text, align: 'left', lineSpacing: 7,
      }).setOrigin(0.5, 0).setDepth(301).setVisible(false);
    const close = this.add.text(cx, cy + 114, 'Prima H para fechar', {
      fontSize: '11px', fontFamily: 'Georgia, serif',
      color: '#E1A0B1', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(301).setVisible(false);
    this._ctrlGroup = [panel, txt, close];
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._controlsVisible) {
        this._controlsVisible = false;
        this._ctrlGroup.forEach(e => e.setVisible(false));
      }
    });
  }

  // ── Auto-hint on Zone1 start ─────────────────────────────────────────────
  _buildAutoHint(W, H) {
    const cx = W / 2, cy = H / 2 - 30;
    const items = [];
    const panel = this.add.rectangle(cx, cy, 340, 210, C.bg, 0.92)
      .setStrokeStyle(1, C.border, 0.7).setDepth(300);
    const txt = this.add.text(cx, cy - 80,
      'BEM-VINDA!\n\n' +
      'WASD / Setas    Mover\n' +
      'Shift                  Correr\n' +
      'E                        Interagir\n' +
      'Espaco              Feitico\n' +
      'M / H                Mapa / Ajuda', {
        fontSize: '14px', fontFamily: 'monospace',
        color: C.text, align: 'left', lineSpacing: 6,
      }).setOrigin(0.5, 0).setDepth(301);
    const dismiss = this.add.text(cx, cy + 80, 'Clica para comecar', {
      fontSize: '12px', fontFamily: 'Georgia, serif',
      color: '#E1A0B1', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(301);
    this.tweens.add({
      targets: dismiss, alpha: { from: 0.5, to: 1 },
      duration: 900, yoyo: true, repeat: -1,
    });
    items.push(panel, txt, dismiss);
    const hide = () => {
      this.tweens.add({
        targets: items, alpha: 0, duration: 500,
        onComplete: () => items.forEach(e => e.setVisible(false)),
      });
    };
    this.time.delayedCall(10000, hide);
    this.input.once('pointerdown', hide);
    this.input.keyboard.once('keydown', hide);
  }

  _toggleControls() {
    this._controlsVisible = !this._controlsVisible;
    this._ctrlGroup.forEach(e => e.setVisible(this._controlsVisible));
  }

  // ── Minimap internals ────────────────────────────────────────────────────
  _drawMinimapBg(zone) {
    this._lastZone = zone;
    this.mmGfx.clear();
    this.mmGfx.fillStyle(0x081810, 1);
    this.mmGfx.fillRect(MM_X, MM_Y, MM_W, MM_H);
    const strips = ZONE_STRIPS[zone] || ZONE_STRIPS.Zone1;
    strips.forEach(s => {
      const x = MM_X + (s.xFrom / WORLD_WIDTH) * MM_W;
      const w = ((s.xTo - s.xFrom) / WORLD_WIDTH) * MM_W;
      this.mmGfx.fillStyle(s.color, 1);
      this.mmGfx.fillRect(x, MM_Y, w, MM_H);
    });
    this.mmGfx.setDepth(58);
    const names = { Zone1: 'Campo dos Vagalumes', Zone2: 'Floresta Densa', Zone3: 'Terrenos das Sombras', Cauldron: 'Caldeirão' };
    this.mmZoneLabel?.setText(names[zone] || zone);
    this._rebuildPlantDots();
  }

  _rebuildPlantDots() {
    this._plantDots.forEach(d => d.destroy());
    this._plantDots = [];
    (GameState.plantSpawns || []).forEach(s => {
      const dotX = MM_X + (s.x / WORLD_WIDTH) * MM_W;
      const dotY = MM_Y + (s.y / WORLD_HEIGHT) * MM_H;
      const plant = PLANTS[s.id];
      const isCollected = GameState.collected.has(s.id);
      const el  = plant ? ELEMENTS[plant.element] : null;
      const col = isCollected ? (el?.color ?? 0x7DB98A) : 0x2d5a38;
      const r   = isCollected ? 3.5 : 2;
      const dot = this.add.circle(dotX, dotY, r, col, isCollected ? 1 : 0.55).setDepth(61);
      if (isCollected) dot.setStrokeStyle(0.8, col, 0.7);
      this._plantDots.push(dot);
    });
  }

  _updateMinimap() {
    const zone = GameState.currentZone;
    if (zone !== this._lastZone && ZONE_STRIPS[zone]) this._drawMinimapBg(zone);
    const dotX = MM_X + (GameState.playerX / WORLD_WIDTH) * MM_W;
    const dotY = MM_Y + ((GameState.playerY ?? 1200) / WORLD_HEIGHT) * MM_H;
    this.mmDot.setPosition(dotX, dotY);
  }

  _updateCauldronDots() {
    const count = ESSENTIAL_IDS.filter(id => GameState.collected.has(id)).length;
    this._essentialDots.forEach((dot, i) => {
      dot.setFillStyle(i < count ? 0xE1A0B1 : 0x1a3a24, 1)
         .setStrokeStyle(1, i < count ? 0xE1A0B1 : C.dim, i < count ? 0.8 : 0.5);
    });
    this.cauldronCount?.setText(`${count}/5`);
    if (count >= 5) this.cauldronCount?.setColor('#E4EF6F');
  }

  // ── Toast system ──────────────────────────────────────────────────────────
  showPlantToast(plantData) {
    this._toastQueue.push(plantData);
    if (!this._toastActive) this._showNextToast();
  }

  _showNextToast() {
    if (!this._toastQueue.length) { this._toastActive = false; return; }
    this._toastActive = true;
    const plant = this._toastQueue.shift();
    const el    = ELEMENTS[plant.element] || ELEMENTS.EARTH;
    const hex   = '#' + el.color.toString(16).padStart(6, '0');
    const W     = GAME_WIDTH;

    const c = this.add.container(W + 10, 90).setDepth(150);
    c.add([
      this.add.rectangle(0, 0, TOAST_W, TOAST_H, 0x0a1a10, 0.93)
        .setOrigin(0, 0).setStrokeStyle(1, el.color, 0.8),
      this.add.rectangle(0, 0, 5, TOAST_H, el.color, 0.9).setOrigin(0, 0),
      this.add.text(14, 8, plant.name, {
        fontSize: '13px', fontFamily: 'Georgia, serif',
        color: hex, stroke: '#0a1a10', strokeThickness: 2,
      }),
      this.add.text(14, 26, (plant.narrativeText || '').substring(0, 50) + '…', {
        fontSize: '9px', fontFamily: 'monospace', color: C.text,
        wordWrap: { width: TOAST_W - 22 },
      }),
      this.add.text(TOAST_W - 8, 8, '+ apanhada', {
        fontSize: '9px', fontFamily: 'monospace', color: '#E4EF6F',
      }).setOrigin(1, 0),
    ]);

    this.tweens.add({ targets: c, x: W - TOAST_W - 12, duration: 320, ease: 'Back.easeOut' });
    this.time.delayedCall(3600, () => {
      this.tweens.add({
        targets: c, x: W + 10, duration: 260, ease: 'Power2.easeIn',
        onComplete: () => { c.destroy(); this._showNextToast(); },
      });
    });
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────
  update() { this._updateMinimap(); }

  // ── Refresh ──────────────────────────────────────────────────────────────
  _refresh() {
    this._refreshInventory();
    this._refreshSpell();
    this._updateCauldronDots();
  }

  _refreshInventory() {
    this.inventoryCount?.setText(`${GameState.inventory.length}/6`);
    this._slots.forEach((s, i) => {
      const plant = GameState.inventory[i];
      if (plant) {
        const el  = ELEMENTS[plant.element] || ELEMENTS.EARTH;
        const col = plant.isFake ? 0x886688 : el.color;
        s.icon.setFillStyle(col, 0.9).setAlpha(1);
        s.fake.setAlpha(plant.isFake ? 1 : 0);
        s.bg.setStrokeStyle(1, col, 0.6);
      } else {
        s.icon.setAlpha(0);
        s.fake.setAlpha(0);
        s.bg.setStrokeStyle(1, C.dim, 0.7);
      }
    });
  }

  _refreshSpell() {
    const spell = GameState.activeSpell ? SPELLS[GameState.activeSpell] : null;
    if (spell) {
      this.spellGfx.setTexture(spell.textureKey).setAlpha(0.9);
      this.spellName.setText(spell.name).setColor(C.text);
    } else {
      this.spellGfx.setAlpha(0.25);
      this.spellName.setText('nenhum').setColor(C.label);
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  _onPlantCollected(plantData) {
    this._refresh();
    if (plantData) { this.showPlantToast(plantData); this._rebuildPlantDots(); }
    if (GameState.spellJustUnlocked) {
      this._showUnlock(`Feitico desbloqueado!\n${SPELLS[GameState.spellJustUnlocked].name}`);
      GameState.spellJustUnlocked = null;
    }
  }

  _onPlantStolen()  { this._refreshInventory(); this._updateCauldronDots(); this._rebuildPlantDots(); }
  _onSpellCast()    { this._refreshSpell(); this.tweens.add({ targets: this.spellGfx, scale: { from: 1, to: 1.5 }, duration: 180, yoyo: true }); }

  _showNarrative(text, duration = 4000) {
    if (this._narrativeTimer) this._narrativeTimer.remove();
    this.tweens.killTweensOf(this.narrativeText);
    this.narrativeText.setText(text);
    this.tweens.add({
      targets: this.narrativeText, alpha: 1, duration: 280,
      onComplete: () => {
        this._narrativeTimer = this.time.delayedCall(duration, () =>
          this.tweens.add({ targets: this.narrativeText, alpha: 0, duration: 500 })
        );
      },
    });
  }

  _showUnlock(msg) {
    this.unlockBanner.setText(msg).setAlpha(0).setY(GAME_HEIGHT / 2);
    this.tweens.add({
      targets: this.unlockBanner, alpha: 1, y: GAME_HEIGHT / 2 - 14,
      duration: 380, ease: 'Back.easeOut',
      onComplete: () => this.time.delayedCall(2600, () =>
        this.tweens.add({ targets: this.unlockBanner, alpha: 0, duration: 500 })
      ),
    });
  }

  _updateArea(name) {
    this.areaLabel.setText(name);
    this.tweens.add({ targets: this.areaLabel, alpha: { from: 1, to: 0.85 }, duration: 1200 });
  }
}
