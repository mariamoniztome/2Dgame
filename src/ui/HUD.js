import Phaser from 'phaser';
import { ELEMENTS, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';
import { SoundManager } from '../SoundManager.js';

const ESSENTIAL_IDS = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

// ── Color palette ─────────────────────────────────────────────────────────
const C = {
  bg:     0x0d2918,   // Lighter than before — readable on bright green campo
  panel:  0x142e1e,
  border: 0x88c890,
  dim:    0x4a7d5c,
  accent: 0xffef7a,
  magic:  0xffcb79,
  text:   '#ecffe3',
  label:  '#c8f2bf',
  muted:  '#97ba9f',
};

// Minimap geometry — bottom-right corner, landscape 16:9 to match the map SVG
const MM_W  = 184;
const MM_H  = 104;   // 16:9
const MM_PW = MM_W + 24;
const MM_PH = MM_H + 30;   // room for MAPA label + zone name

// Map-image regions (fractions 0-1) for each zone/sub-area.
// Based on the icon positions used in MapScene.
const MAP_ZONE_REGIONS = {
  Zone1: {
    campo:  [0.00, 0.55, 0.25, 1.00],   // Campo dos Vagalumes — bottom-left
    jardim: [0.25, 0.55, 0.52, 1.00],   // Jardim Invertido    — bottom-center
    limiar: [0.00, 0.00, 0.27, 0.52],   // Limiar Secreto      — top-left
  },
  Zone2:  [0.28, 0.00, 0.72, 1.00],
  Zone3:  [0.72, 0.00, 1.00, 1.00],
};
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

    // ── BOTTOM-RIGHT: minimap ─────────────────────────────────────────────
    this._buildMinimap(W, H);

    // ── Narrative (center, above bottom panels) ───────────────────────────
    this.narrativeText = this.add.text(W / 2, H - MM_PH - 18, '', {
      fontSize: '15px', fontFamily: 'Georgia, serif',
      color: '#f5e6c8', wordWrap: { width: 580 },
      align: 'center', stroke: '#071410', strokeThickness: 4, lineSpacing: 5,
      backgroundColor: 'rgba(5,14,10,0.82)',
      padding: { x: 20, y: 11 },
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    // ── Area label (top-center) ───────────────────────────────────────────
    this.areaLabel = this.add.text(W / 2, 10, '', {
      fontSize: '14px', fontFamily: 'Georgia, serif',
      color: '#e8ffd8', stroke: '#071410', strokeThickness: 2, fontStyle: 'italic',
      backgroundColor: 'rgba(5,14,10,0.78)',
      padding: { x: 14, y: 6 },
    }).setOrigin(0.5, 0).setAlpha(0).setDepth(55);

    // ── Spell unlock banner (center) ──────────────────────────────────────
    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: '20px', fontFamily: 'Georgia, serif',
      color: '#e8c96a', stroke: '#0D351E', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // ── [H] help hint (top-left) ──────────────────────────────────────────
    this.add.text(12, 10, '[H] ajuda', {
      fontSize: '16px', fontFamily: 'monospace', color: '#eefedd',
      stroke: '#0a2010', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(55);

    this._buildControlsPanel(W, H);

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
    const x = W - 10, y = 10, pw = 280, ph = 98;
    this.add.rectangle(x, y, pw, ph, C.bg, 0.82)
      .setOrigin(1, 0).setStrokeStyle(1.5, C.border, 0.80);

    this.add.text(x - pw + 14, y + 10, 'FEITIÇO', {
      fontSize: '11px', fontFamily: 'monospace', color: C.label,
    });
    this.add.text(x - 14, y + 10, '[Q] mudar · [F] lançar', {
      fontSize: '10px', fontFamily: 'monospace', color: C.muted,
    }).setOrigin(1, 0);

    this.spellGfx = this.add.image(x - pw + 40, y + 62, 'spell_brisa')
      .setDisplaySize(46, 46).setAlpha(0.6);

    this.spellName = this.add.text(x - pw + 78, y + 60, 'nenhum', {
      fontSize: '20px', fontFamily: 'Georgia, serif',
      color: '#ffffff', fontStyle: 'italic',
    }).setOrigin(0, 0.5);

    // Thin separator
    this.add.rectangle(x - pw + 10, y + 36, pw - 20, 1, C.border, 0.35).setOrigin(0, 0.5);
  }

  // ── BOTTOM-LEFT: Inventory ───────────────────────────────────────────────
  _buildInventory(W, H) {
    this.add.rectangle(10, H - 10, 298, 104, C.bg, 0.82)
      .setOrigin(0, 1).setStrokeStyle(1.5, C.border, 0.80);
    this.add.text(24, H - 107, 'PLANTAS', {
      fontSize: '11px', fontFamily: 'monospace', color: C.label,
    });
    this.inventoryCount = this.add.text(300, H - 107, '0/6', {
      fontSize: '11px', fontFamily: 'monospace', color: '#fff8b4',
    }).setOrigin(1, 0);

    for (let i = 0; i < 6; i++) {
      const sx = 30 + i * 44, sy = H - 44;
      const bg   = this.add.rectangle(sx, sy, 36, 36, C.panel, 0.85)
        .setStrokeStyle(1.2, C.border, 0.55);
      const icon = this.add.image(sx, sy, 'plant_missing')
        .setDisplaySize(24, 24).setAlpha(0);
      const fake = this.add.text(sx, sy, '?', {
        fontSize: '14px', fontFamily: 'monospace', color: '#b28cbf',
      }).setOrigin(0.5).setAlpha(0).setDepth(56);
      this._slots.push({ bg, icon, fake });
    }
  }

  // ── BOTTOM-RIGHT: Minimap + potion progress ──────────────────────────────
  _buildMinimap(W, H) {
    const mmX = W - 10 - MM_PW + 12;
    const mmY = H - 10 - MM_PH + 12;
    this._mmX = mmX;
    this._mmY = mmY;

    const px = W - 10, py = H - 10;

    // Panel background
    this.add.rectangle(px, py, MM_PW, MM_PH, C.bg, 0.82)
      .setOrigin(1, 1).setStrokeStyle(1.5, C.border, 0.80);

    // "MAPA" label and [M] shortcut
    this.add.text(mmX, py - MM_PH + 6, 'MAPA', {
      fontSize: '11px', fontFamily: 'monospace', color: C.label,
    }).setDepth(55);
    this.add.text(mmX + MM_W, py - MM_PH + 6, '[M]', {
      fontSize: '10px', fontFamily: 'monospace', color: C.muted,
    }).setOrigin(1, 0).setDepth(55);

    // Map image (landscape, matches the map SVG aspect ratio)
    if (this.textures.exists('map_fundo01')) {
      this.add.image(mmX, mmY, 'map_fundo01')
        .setOrigin(0, 0).setDisplaySize(MM_W, MM_H).setDepth(58);
    }
    if (this.textures.exists('map_fundo02')) {
      this.add.image(mmX, mmY, 'map_fundo02')
        .setOrigin(0, 0).setDisplaySize(MM_W, MM_H).setDepth(59);
    }
    if (!this.textures.exists('map_fundo01')) {
      this.add.rectangle(mmX, mmY, MM_W, MM_H, C.panel, 1).setOrigin(0, 0).setDepth(58);
    }

    // Graphics layer for plant dots (drawn on top of map image)
    this.mmGfx = this.add.graphics().setDepth(60);

    // Player dot (yellow)
    this.mmDot = this.add.circle(mmX + MM_W / 2, mmY + MM_H / 2, 4.8, C.accent, 1)
      .setDepth(62).setStrokeStyle(1.2, 0x0D351E, 0.9);

    // Map border
    this.add.rectangle(mmX, mmY, MM_W, MM_H, 0, 0)
      .setOrigin(0, 0).setStrokeStyle(1.6, C.border, 0.8).setDepth(63);

    // Zone name below map
    this.mmZoneLabel = this.add.text(mmX + MM_W / 2, mmY + MM_H + 4, '', {
      fontSize: '10px', fontFamily: 'Georgia, serif', color: C.text, fontStyle: 'italic',
    }).setOrigin(0.5, 0).setDepth(62);

    this._drawMinimapBg('Zone1');
  }

  // ── Controls panel (H toggle) ────────────────────────────────────────────
  _buildControlsPanel(W, H) {
    const cx = W / 2, cy = H / 2;
    const p   = this.add.rectangle(cx, cy, 370, 270, C.bg, 0.92)
      .setStrokeStyle(1.5, C.border, 0.85).setDepth(300).setVisible(false);
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

  _toggleControls() {
    this._controlsVisible = !this._controlsVisible;
    this._ctrlGroup.forEach(e => e.setVisible(this._controlsVisible));
  }

  // ── Minimap internals ────────────────────────────────────────────────────
  // Map world (zone, x, y) → minimap pixel position
  // Zone1 L-shaped: campo(x:0-1280,y:0-720) · limiar(x:0-1280,y:-720-0) · jardim(x:1280-2560,y:0-720)
  _worldToMinimap(zone, x, y) {
    const mmX = this._mmX, mmY = this._mmY;
    const ZONE_W = 1280;
    const ZONE_H = 720;

    let rx0, ry0, rx1, ry1;

    if (zone === 'Zone1' || !zone) {
      let subArea, localX, localY;
      if (x >= ZONE_W) {
        subArea = MAP_ZONE_REGIONS.Zone1.jardim;
        localX  = x - ZONE_W;
        localY  = y;
      } else if (y < 0) {
        subArea = MAP_ZONE_REGIONS.Zone1.limiar;
        localX  = x;
        localY  = y + ZONE_H;  // remap -720..0 → 0..720
      } else {
        subArea = MAP_ZONE_REGIONS.Zone1.campo;
        localX  = x;
        localY  = y;
      }
      [rx0, ry0, rx1, ry1] = subArea;
      return {
        dotX: mmX + (rx0 + (localX / ZONE_W) * (rx1 - rx0)) * MM_W,
        dotY: mmY + (ry0 + (localY / ZONE_H) * (ry1 - ry0)) * MM_H,
      };
    }

    [rx0, ry0, rx1, ry1] = MAP_ZONE_REGIONS[zone] ?? MAP_ZONE_REGIONS.Zone2;
    return {
      dotX: mmX + (rx0 + (x / WORLD_WIDTH) * (rx1 - rx0)) * MM_W,
      dotY: mmY + (ry0 + (y / WORLD_HEIGHT) * (ry1 - ry0)) * MM_H,
    };
  }

  _drawMinimapBg(zone) {
    this._lastZone = zone;
    this.mmGfx.clear();
    const names = { Zone1: 'Campo dos Vagalumes', Zone2: 'Floresta Densa', Zone3: 'Terrenos das Sombras', Cauldron: 'Caldeirão' };
    this.mmZoneLabel?.setText(names[zone] || zone);
    this._rebuildPlantDots();
  }

  _rebuildPlantDots() {
    this._plantDots.forEach(d => d.destroy());
    this._plantDots = [];
    const zone = GameState.currentZone || 'Zone1';
    (GameState.plantSpawns || []).forEach(s => {
      const { dotX, dotY } = this._worldToMinimap(zone, s.x, s.y);
      const plant = PLANTS[s.id];
      const ok  = GameState.collected.has(s.id);
      const el  = plant ? ELEMENTS[plant.element] : null;
      const col = ok ? (el?.color ?? 0x7DB98A) : 0x4a8060;
      const r   = ok ? 3 : 2;
      const dot = this.add.circle(dotX, dotY, r, col, ok ? 0.9 : 0.6).setDepth(61);
      if (ok) dot.setStrokeStyle(0.8, 0xffffff, 0.3);
      this._plantDots.push(dot);
    });
  }

  _updateMinimap() {
    const zone = GameState.currentZone;
    if (zone !== this._lastZone) this._drawMinimapBg(zone || 'Zone1');
    const { dotX, dotY } = this._worldToMinimap(zone, GameState.playerX ?? 640, GameState.playerY ?? 360);
    this.mmDot.setPosition(dotX, dotY);
  }

  _updateCauldronDots() {
    if (!this._essentialDots?.length && !this.cauldronCount) return;
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
        const plantKey = `plant_${plant.id}`;
        const texture = this.textures.exists(plantKey) ? plantKey : 'plant_missing';
        s.icon.setTexture(texture).setAlpha(0.98).setTint(0xffffff).setScale(1);
        if (plant.isFake) s.icon.setTint(0xc8a6d4);
        s.fake.setAlpha(plant.isFake ? 1 : 0);
        s.bg.setStrokeStyle(1.4, col, 0.9);
      } else {
        s.icon.setAlpha(0);
        s.fake.setAlpha(0);
        s.bg.setStrokeStyle(1.2, C.dim, 0.7);
      }
    });
  }

  _refreshSpell() {
    const spell = GameState.activeSpell ? SPELLS[GameState.activeSpell] : null;
    if (spell) {
      this.spellGfx.setTexture(spell.textureKey).setAlpha(0.9);
      this.spellName.setText(spell.name).setColor('#ffffff');
    } else {
      this.spellGfx.setAlpha(0.3);
      this.spellName.setText('nenhum').setColor('#a0b890');
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
    this.tweens.killTweensOf(this.areaLabel);
    this.tweens.add({
      targets: this.areaLabel, alpha: 1, duration: 380, ease: 'Power2.easeOut',
      onComplete: () => {
        this.time.delayedCall(3000, () =>
          this.tweens.add({ targets: this.areaLabel, alpha: 0, duration: 900 })
        );
      },
    });
    SoundManager.areaChange();
  }
}
