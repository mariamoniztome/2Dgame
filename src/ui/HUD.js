import Phaser from 'phaser';
import { ELEMENTS, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';
import { SoundManager } from '../SoundManager.js';

const ESSENTIAL_IDS = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

// ── Color palette ─────────────────────────────────────────────────────────
const C = {
  bg:     0x0D351E,
  border: 0x639B5A,
  dim:    0x2d5a38,
  accent: 0xE4EF6F,
  magic:  0xe8c96a,
  text:   '#BFD8A4',
  label:  '#639B5A',
};

// Zone color strips for minimap — vertical world, bands by Y
const ZONE_STRIPS = {
  Zone1: [
    { color: 0x5a9e5a, yFrom: 0,    yTo: 720  },  // Campo
    { color: 0x3a7044, yFrom: 720,  yTo: 1440 },  // Jardim
    { color: 0x060c18, yFrom: 1440, yTo: 2160 },  // Limiar
  ],
  Zone2: [
    { color: 0x0d2a18, yFrom: 0,    yTo: 540  },
    { color: 0x1a4428, yFrom: 540,  yTo: 1080 },
    { color: 0x2d6030, yFrom: 1080, yTo: 1620 },
    { color: 0x2e1503, yFrom: 1620, yTo: 2160 },
  ],
  Zone3: [
    { color: 0x0d1a08, yFrom: 0,    yTo: 720  },
    { color: 0x0a1a10, yFrom: 720,  yTo: 1440 },
    { color: 0x0a0e14, yFrom: 1440, yTo: 2160 },
  ],
};

// Minimap geometry — bottom-right corner, portrait to match vertical world
const MM_W  = 70;
const MM_H  = 118;
const MM_PW = MM_W + 16;
const MM_PH = MM_H + 36;
// Toast
const TOAST_W = 260;
const TOAST_H = 68;

export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUD', active: false }); }

  create() {
    const W = this.scale.width, H = this.scale.height;

    this._slots          = [];
    this._plantDots      = [];
    this._narrativeTimer = null;
    this._lastZone       = null;
    this._toastQueue     = [];
    this._toastActive    = false;
    this._controlsVisible = false;

    // ── TOP-RIGHT: active spell ───────────────────────────────────────────
    this._buildSpellPanel(W);

    // ── BOTTOM-LEFT: plant inventory ──────────────────────────────────────
    this._buildInventory(W, H);

    // ── BOTTOM-RIGHT: minimap + potion progress ───────────────────────────
    this._buildMinimap(W, H);

    // ── Narrative (center, above bottom panels) ───────────────────────────
    this.narrativeText = this.add.text(W / 2, H - MM_PH - 16, '', {
      fontSize: '15px', fontFamily: 'Georgia, serif',
      color: '#f5e6c8', wordWrap: { width: 600 },
      align: 'center', stroke: '#0D351E', strokeThickness: 3, lineSpacing: 4,
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    // ── Area label (top-center) ───────────────────────────────────────────
    this.areaLabel = this.add.text(W / 2, 10, '', {
      fontSize: '13px', fontFamily: 'Georgia, serif',
      color: C.text, stroke: '#0D351E', strokeThickness: 2, fontStyle: 'italic',
    }).setOrigin(0.5, 0).setAlpha(0).setDepth(55);

    // ── Spell unlock banner (center) ──────────────────────────────────────
    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: '20px', fontFamily: 'Georgia, serif',
      color: '#e8c96a', stroke: '#0D351E', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // ── [H] help hint (top-left) ──────────────────────────────────────────
    this.add.text(10, 10, '[H] ajuda', {
      fontSize: '10px', fontFamily: 'monospace', color: C.label,
    }).setOrigin(0, 0).setDepth(55);

    this._buildControlsPanel(W, H);
    this._buildAutoHint(W, H);

    this.input.keyboard.on('keydown-H', () => this._toggleControls());

    // ── Sound init (needs active AudioContext from Phaser) ────────────────
    SoundManager.init(this);

    // ── Events ────────────────────────────────────────────────────────────
    this.game.events.on('plantCollected', this._onPlantCollected, this);
    this.game.events.on('plantStolen',    this._onPlantStolen,    this);
    this.game.events.on('spellCast',      this._onSpellCast,      this);
    this.game.events.on('showNarrative',  this._showNarrative,    this);
    this.game.events.on('spellUnlocked',  this._showUnlock,       this);
    this.game.events.on('areaChanged',    this._updateArea,       this);

    this._refresh();
  }

  // ── TOP-RIGHT: Spell panel ───────────────────────────────────────────────
  _buildSpellPanel(W) {
    const x = W - 8, y = 8, pw = 192, ph = 76;
    this.add.rectangle(x, y, pw, ph, C.bg, 0.88)
      .setOrigin(1, 0).setStrokeStyle(1, C.border, 0.6);

    this.add.text(x - pw + 10, y + 6, 'FEITICO', {
      fontSize: '10px', fontFamily: 'monospace', color: C.label,
    });
    this.add.text(x - 10, y + 6, 'Q = mudar', {
      fontSize: '9px', fontFamily: 'monospace', color: C.label,
    }).setOrigin(1, 0);

    this.spellGfx = this.add.image(x - pw + 26, y + 44, 'spell_brisa')
      .setDisplaySize(32, 32).setAlpha(0.3);

    this.spellName = this.add.text(x - pw + 50, y + 36, '—', {
      fontSize: '12px', fontFamily: 'Georgia, serif', color: C.text,
    }).setOrigin(0, 0.5);

    this.add.text(x - 10, y + 68, 'F = lancar', {
      fontSize: '8px', fontFamily: 'monospace', color: C.label,
    }).setOrigin(1, 1);
  }

  // ── BOTTOM-LEFT: Inventory ───────────────────────────────────────────────
  _buildInventory(W, H) {
    this.add.rectangle(8, H - 8, 220, 76, C.bg, 0.88)
      .setOrigin(0, 1).setStrokeStyle(1, C.border, 0.6);
    this.add.text(18, H - 78, 'PLANTAS', {
      fontSize: '10px', fontFamily: 'monospace', color: C.label,
    });
    this.inventoryCount = this.add.text(212, H - 78, '0/6', {
      fontSize: '10px', fontFamily: 'monospace', color: '#E4EF6F',
    }).setOrigin(1, 0);

    for (let i = 0; i < 6; i++) {
      const sx = 20 + i * 34, sy = H - 30;
      const bg   = this.add.rectangle(sx, sy, 28, 28, 0x1a3a24, 0.9)
        .setStrokeStyle(1, C.dim, 0.7);
      const icon = this.add.circle(sx, sy, 10, C.dim, 0).setAlpha(0);
      const fake = this.add.text(sx, sy, '?', {
        fontSize: '11px', fontFamily: 'monospace', color: '#886688',
      }).setOrigin(0.5).setAlpha(0);
      this._slots.push({ bg, icon, fake });
    }
  }

  // ── BOTTOM-RIGHT: Minimap + potion progress ──────────────────────────────
  _buildMinimap(W, H) {
    const mmX = W - 8 - MM_PW + 6;
    const mmY = H - 8 - MM_PH + 14;
    this._mmX = mmX;
    this._mmY = mmY;

    const px = W - 8, py = H - 8;

    // Panel
    this.add.rectangle(px, py, MM_PW, MM_PH, C.bg, 0.92)
      .setOrigin(1, 1).setStrokeStyle(1, C.border, 0.7);

    // "MAPA" label and [M] shortcut
    this.add.text(mmX, py - MM_PH + 3, 'MAPA', {
      fontSize: '9px', fontFamily: 'monospace', color: C.label,
    });
    this.add.text(mmX + MM_W, py - MM_PH + 3, '[M]', {
      fontSize: '9px', fontFamily: 'monospace', color: C.dim,
    }).setOrigin(1, 0);

    // Map graphics
    this.mmGfx = this.add.graphics().setDepth(58);

    // Player dot (yellow)
    this.mmDot = this.add.circle(W / 2, mmY + MM_H / 2, 4, C.accent, 1)
      .setDepth(62).setStrokeStyle(1, 0x0D351E, 0.8);

    // Map border
    this.add.rectangle(mmX, mmY, MM_W, MM_H, 0, 0)
      .setOrigin(0, 0).setStrokeStyle(1, C.border, 0.5).setDepth(63);

    // Zone name below map
    this.mmZoneLabel = this.add.text(mmX + MM_W / 2, mmY + MM_H + 3, '', {
      fontSize: '9px', fontFamily: 'Georgia, serif', color: C.text, fontStyle: 'italic',
    }).setOrigin(0.5, 0).setDepth(62);

    // Potion progress (5 dots) at the bottom of the panel
    this._essentialDots = [];
    const dotRowY = py - 10;
    const dotSpan  = MM_W;
    const dotStep  = dotSpan / 5;
    for (let i = 0; i < 5; i++) {
      const dx = mmX + dotStep * i + dotStep / 2;
      const dot = this.add.circle(dx, dotRowY, 6, 0x1a3a24, 1)
        .setStrokeStyle(1, C.dim, 0.6).setDepth(62);
      this._essentialDots.push(dot);
    }
    this.cauldronCount = this.add.text(mmX + MM_W, dotRowY, '0/5', {
      fontSize: '8px', fontFamily: 'monospace', color: '#e8c96a',
    }).setOrigin(1, 0.5).setDepth(62);

    this._drawMinimapBg('Zone1');
  }

  // ── Controls panel (H toggle) ────────────────────────────────────────────
  _buildControlsPanel(W, H) {
    const cx = W / 2, cy = H / 2;
    const p   = this.add.rectangle(cx, cy, 370, 270, C.bg, 0.95)
      .setStrokeStyle(1, C.border, 0.9).setDepth(300).setVisible(false);
    const txt = this.add.text(cx, cy - 110,
      'CONTROLOS\n\n' +
      'WASD / Setas    Mover\n' +
      'Shift                  Correr\n' +
      'C                        Apanhar / Interagir\n' +
      'F                         Lancar feitico\n' +
      'Q                        Mudar feitico\n' +
      'M                        Mapa do jardim\n' +
      'H                        Fechar ajuda', {
        fontSize: '14px', fontFamily: 'monospace',
        color: C.text, align: 'left', lineSpacing: 7,
      }).setOrigin(0.5, 0).setDepth(301).setVisible(false);
    const close = this.add.text(cx, cy + 112, 'Prima H ou ESC para fechar', {
      fontSize: '11px', fontFamily: 'Georgia, serif', color: '#e8c96a', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(301).setVisible(false);
    this._ctrlGroup = [p, txt, close];
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._controlsVisible) {
        this._controlsVisible = false;
        this._ctrlGroup.forEach(e => e.setVisible(false));
      }
    });
  }

  // ── Auto-hint on Zone1 entry ─────────────────────────────────────────────
  _buildAutoHint(W, H) {
    const cx = W / 2, cy = H / 2 - 20;
    const items = [];
    const panel = this.add.rectangle(cx, cy, 340, 210, C.bg, 0.92)
      .setStrokeStyle(1, C.border, 0.7).setDepth(300);
    const txt = this.add.text(cx, cy - 80,
      'BEM-VINDA!\n\n' +
      'WASD / Setas    Mover\n' +
      'Shift                  Correr\n' +
      'C                        Apanhar planta\n' +
      'F                         Feitico\n' +
      'M / H                Mapa / Ajuda', {
        fontSize: '14px', fontFamily: 'monospace',
        color: C.text, align: 'left', lineSpacing: 6,
      }).setOrigin(0.5, 0).setDepth(301);
    const dismiss = this.add.text(cx, cy + 80, 'Clica para comecar', {
      fontSize: '12px', fontFamily: 'Georgia, serif', color: '#e8c96a', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(301);
    this.tweens.add({ targets: dismiss, alpha: { from: 0.5, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
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
    this.mmGfx.fillRect(this._mmX, this._mmY, MM_W, MM_H);
    (ZONE_STRIPS[zone] || ZONE_STRIPS.Zone1).forEach(s => {
      const y = this._mmY + (s.yFrom / WORLD_HEIGHT) * MM_H;
      const h = ((s.yTo - s.yFrom) / WORLD_HEIGHT) * MM_H;
      this.mmGfx.fillStyle(s.color, 1);
      this.mmGfx.fillRect(this._mmX, y, MM_W, h);
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
      const dotX = this._mmX + (s.x / WORLD_WIDTH) * MM_W;
      const dotY = this._mmY + (s.y / WORLD_HEIGHT) * MM_H;
      const plant = PLANTS[s.id];
      const ok  = GameState.collected.has(s.id);
      const el  = plant ? ELEMENTS[plant.element] : null;
      const col = ok ? (el?.color ?? 0x7DB98A) : 0x2d5a38;
      const dot = this.add.circle(dotX, dotY, ok ? 3.5 : 2, col, ok ? 1 : 0.5).setDepth(61);
      if (ok) dot.setStrokeStyle(0.8, col, 0.6);
      this._plantDots.push(dot);
    });
  }

  _updateMinimap() {
    const zone = GameState.currentZone;
    if (zone !== this._lastZone && ZONE_STRIPS[zone]) this._drawMinimapBg(zone);
    const dotX = this._mmX + (GameState.playerX / WORLD_WIDTH) * MM_W;
    const dotY = this._mmY + ((GameState.playerY ?? 1200) / WORLD_HEIGHT) * MM_H;
    this.mmDot.setPosition(dotX, dotY);
  }

  _updateCauldronDots() {
    const count = ESSENTIAL_IDS.filter(id => GameState.collected.has(id)).length;
    this._essentialDots.forEach((d, i) => {
      d.setFillStyle(i < count ? 0xE1A0B1 : 0x1a3a24, 1)
       .setStrokeStyle(1, i < count ? 0xE1A0B1 : C.dim, i < count ? 0.8 : 0.5);
    });
    this.cauldronCount?.setText(`${count}/5`);
    if (count >= 5) this.cauldronCount?.setColor('#E4EF6F');
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
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
    const W     = this.scale.width;

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
  _refresh() { this._refreshInventory(); this._refreshSpell(); this._updateCauldronDots(); }

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
    if (plantData) {
      this.showPlantToast(plantData);
      this._rebuildPlantDots();
      SoundManager.collectPlant(plantData.element);
    }
    if (GameState.spellJustUnlocked) {
      this._showUnlock(`Feitico desbloqueado!\n${SPELLS[GameState.spellJustUnlocked].name}`);
      SoundManager.spellUnlocked();
      GameState.spellJustUnlocked = null;
    }
  }

  _onPlantStolen()  { this._refreshInventory(); this._updateCauldronDots(); this._rebuildPlantDots(); }
  _onSpellCast()    {
    this._refreshSpell();
    this.tweens.add({ targets: this.spellGfx, scale: { from: 1, to: 1.5 }, duration: 180, yoyo: true });
    SoundManager.castSpell();
  }

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
    this.unlockBanner.setText(msg).setAlpha(0).setY(this.scale.height / 2);
    this.tweens.add({
      targets: this.unlockBanner, alpha: 1, y: this.scale.height / 2 - 14,
      duration: 380, ease: 'Back.easeOut',
      onComplete: () => this.time.delayedCall(2600, () =>
        this.tweens.add({ targets: this.unlockBanner, alpha: 0, duration: 500 })
      ),
    });
  }

  _updateArea(name) {
    this.areaLabel.setText(name);
    this.tweens.add({ targets: this.areaLabel, alpha: { from: 1, to: 0.85 }, duration: 1200 });
    SoundManager.areaChange();
  }
}
