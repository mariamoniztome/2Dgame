import Phaser from 'phaser';
import { ELEMENTS, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';
import { SoundManager } from '../SoundManager.js';

const ESSENTIAL_IDS = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

const C_DEFAULTS = {
  bg:      0x100818,
  panel:   0x1a1028,
  border:  0x7b5ea7,
  dim:     0x4a3d6e,
  accent:  0xffef7a,
  magic:   0xd4a8f0,
  text:    '#f0e8ff',
  label:   '#c9a8e8',
  muted:   '#7a6a94',
  plant:   0x7bc67e,
};

// Mutable live palette — debug panel edits this, HUD rebuilds to apply changes
const C = { ...C_DEFAULTS };

const MAP_ZONE_REGIONS = {
  Zone1: {
    campo:  [0.00, 0.55, 0.25, 1.00],
    jardim: [0.25, 0.55, 0.52, 1.00],
    limiar: [0.00, 0.00, 0.27, 0.52],
  },
  Zone2: [0.28, 0.00, 0.72, 1.00],
  Zone3: [0.72, 0.00, 1.00, 1.00],
};

// Collect all plant IDs used in any spell for sorting inventory
function _comboPlantIds() {
  const ids = new Set();
  Object.values(SPELLS).forEach(s => (s.plants || []).forEach(id => ids.add(id)));
  return ids;
}

export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUD', active: false }); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  create() {
    if (!this._initialized) {
      this._initialized     = true;
      this._toastQueue      = [];
      this._toastActive     = false;
      this._controlsVisible = false;
    }

    this._slots              = [];
    this._plantDots          = [];
    this._paSlots            = [];
    this._plantsActivasGroup = null;
    this._narrativeTimer     = null;
    this._lastZone           = null;

    const W = this.scale.width, H = this.scale.height;
    this._buildAll(W, H);

    this.scale.on('resize', (gameSize) => {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        if (!this.sys.isActive()) return;
        const queue   = [...(this._toastQueue  || [])];
        const ctrlVis = this._controlsVisible;
        this.children.removeAll(true);
        this._slots              = [];
        this._plantDots          = [];
        this._ctrlGroup          = [];
        this._paSlots            = [];
        this._plantsActivasGroup = null;
        this._toastQueue         = queue;
        this._toastActive        = false;
        this._controlsVisible    = ctrlVis;
        this._narrativeTimer     = null;
        this._lastZone           = null;
        this._buildAll(gameSize.width, gameSize.height);
        if (ctrlVis) this._ctrlGroup?.forEach(e => e.setVisible(true));
        this._refresh();
        this._drawMinimapBg(GameState.currentZone || 'Zone1');
      }, 150);
    });

    SoundManager.init(this);

    this.game.events.off('plantCollected', this._onPlantCollected, this);
    this.game.events.off('plantStolen',    this._onPlantStolen,    this);
    this.game.events.off('spellCast',      this._onSpellCast,      this);
    this.game.events.off('showNarrative',  this._showNarrative,    this);
    this.game.events.off('spellUnlocked',  this._showUnlock,       this);
    this.game.events.off('areaChanged',    this._updateArea,       this);
    this.game.events.on('plantCollected',  this._onPlantCollected, this);
    this.game.events.on('plantStolen',     this._onPlantStolen,    this);
    this.game.events.on('spellCast',       this._onSpellCast,      this);
    this.game.events.on('showNarrative',   this._showNarrative,    this);
    this.game.events.on('spellUnlocked',   this._showUnlock,       this);
    this.game.events.on('areaChanged',     this._updateArea,       this);

    this._refresh();
  }

  // ── Build all UI ──────────────────────────────────────────────────────────
  _buildAll(W, H) {
    const fs = this._fs(W);
    this._buildSpellPanel(W, H, fs);
    this._buildPlantsActivas(W, H, fs);
    this._buildInventory(W, H, fs);
    this._buildMinimap(W, H, fs);

    this.narrativeText = this.add.text(W / 2, H - this._mmPH - Math.round(W * 0.009), '', {
      fontSize: fs.md, fontFamily: 'Georgia, serif',
      color: '#f5e6c8', wordWrap: { width: W * 0.30 },
      align: 'center', stroke: '#071410', strokeThickness: 4, lineSpacing: 5,
      backgroundColor: 'rgba(5,14,10,0.82)',
      padding: { x: 20, y: 11 },
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    this.areaLabel = this.add.text(W / 2, 10, '', {
      fontSize: fs.md, fontFamily: 'Georgia, serif',
      color: '#e8ffd8', stroke: '#071410', strokeThickness: 2, fontStyle: 'italic',
      backgroundColor: 'rgba(5,14,10,0.78)',
      padding: { x: 14, y: 6 },
    }).setOrigin(0.5, 0).setAlpha(0).setDepth(55);

    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: fs.lg, fontFamily: 'Georgia, serif',
      color: '#e8c96a', stroke: '#0D351E', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    this.add.text(12, 10, '[H] ajuda', {
      fontSize: fs.md, fontFamily: 'monospace', color: '#eefedd',
      stroke: '#0a2010', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(55);

    this._buildControlsPanel(W, H, fs);
    this._buildHUDDebugPanel(W, H, fs);

    this.input.keyboard.on('keydown-H', () => this._toggleControls());
    this.input.keyboard.on('keydown-D', (e) => { if (e.shiftKey) this._toggleHUDDebug(); });
  }

  _fs(W) {
    return {
      sm:  `${Math.max(12, Math.round(W * 0.0100))}px`,
      md:  `${Math.max(14, Math.round(W * 0.0120))}px`,
      lg:  `${Math.max(17, Math.round(W * 0.0135))}px`,
      xl:  `${Math.max(21, Math.round(W * 0.0165))}px`,
    };
  }

  // ── Spell panel — pill shape (top-right) ──────────────────────────────────
  _buildSpellPanel(W, H, fs) {
    const pw    = Math.round(W * 0.178);
    const ph    = Math.round(W * 0.056);
    const rx    = W - 10;
    const ry    = 10;
    const pill  = Math.round(ph / 2);
    const iconS = Math.round(W * 0.030);

    // Pill background
    const gfx = this.add.graphics().setDepth(50);
    gfx.fillStyle(C.bg, 0.90);
    gfx.fillRoundedRect(rx - pw, ry, pw, ph, pill);
    gfx.lineStyle(1.5, C.border, 0.85);
    gfx.strokeRoundedRect(rx - pw, ry, pw, ph, pill);

    // Yellow accent dot on left arc of pill
    const dotR = Math.max(4, Math.round(W * 0.004));
    const dotX = rx - pw + pill;
    const dotY = ry + Math.round(ph / 2);
    this.add.circle(dotX, dotY, dotR, C.accent, 0.92).setDepth(56);

    // Spell icon
    const icoX = dotX + dotR + Math.round(iconS * 0.60);
    const icoY = dotY;
    this.spellGfx = this.add.image(icoX, icoY, 'spell_brisa')
      .setDisplaySize(iconS, iconS).setAlpha(0.6).setDepth(55);

    // Spell name
    this.spellName = this.add.text(icoX + Math.round(iconS * 0.60), icoY, 'nenhum', {
      fontSize: fs.lg, fontFamily: 'Georgia, serif',
      color: C.muted, fontStyle: 'italic',
    }).setOrigin(0, 0.5).setDepth(55);

    // Key hints inside pill
    this.add.text(rx - 10, ry + 5, '[Q] · [F]', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.muted,
    }).setOrigin(1, 0).setDepth(55);

    this._spellPanelBottom = ry + ph;
    this._spellPanelRight  = rx;
    this._spellPanelWidth  = pw;
    this._hudBounds = this._hudBounds || {};
    this._hudBounds.spell = { x: rx - pw, y: ry, w: pw, h: ph, label: 'Feitiço' };
  }

  // ── Plantas Activas — 2 circles below spell pill ───────────────────────────
  _buildPlantsActivas(W, H, fs) {
    const MAX_PA  = 2;
    const slotR   = Math.max(16, Math.round(W * 0.022));
    const iconS   = Math.round(slotR * 1.35);
    const gap     = Math.max(6, Math.round(W * 0.008));
    const labelH  = Math.round(W * 0.016);
    const padH    = Math.max(8, Math.round(W * 0.010));
    const padW    = Math.max(8, Math.round(W * 0.010));
    const pw      = MAX_PA * slotR * 2 + (MAX_PA - 1) * gap + padW * 2;
    const ph      = slotR * 2 + labelH + padH * 2;
    const rx      = this._spellPanelRight  ?? W - 10;
    const ry      = (this._spellPanelBottom ?? 68) + 6;

    const grp = [];

    const bg = this.add.graphics().setDepth(50);
    bg.fillStyle(C.bg, 0.88);
    bg.fillRoundedRect(rx - pw, ry, pw, ph, 8);
    bg.lineStyle(1.5, C.border, 0.80);
    bg.strokeRoundedRect(rx - pw, ry, pw, ph, 8);
    grp.push(bg);

    const lbl = this.add.text(rx - pw + padW, ry + 5, 'PLANTAS ACTIVAS', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.label,
    }).setDepth(55);
    grp.push(lbl);

    this._paSlots = [];
    for (let i = 0; i < MAX_PA; i++) {
      const sx = rx - pw + padW + slotR + i * (slotR * 2 + gap);
      const sy = ry + labelH + padH + slotR;

      const slotGfx = this.add.graphics().setDepth(51);
      slotGfx.fillStyle(C.panel, 0.85);
      slotGfx.fillCircle(sx, sy, slotR);
      slotGfx.lineStyle(1.4, C.dim, 0.7);
      slotGfx.strokeCircle(sx, sy, slotR);

      const icon = this.add.image(sx, sy, 'plant_missing')
        .setDisplaySize(iconS, iconS).setAlpha(0).setDepth(56);

      grp.push(slotGfx, icon);
      this._paSlots.push({ slotGfx, icon, sx, sy, slotR, iconS });
    }

    this._plantsActivasGroup = grp;
    grp.forEach(o => o.setVisible(false));
    this._hudBounds = this._hudBounds || {};
    this._hudBounds.plantsActivas = { x: rx - pw, y: ry, w: pw, h: ph, label: 'Plantas Activas' };
  }

  // ── Inventory — circular slots, 3 cols × 4 rows, up to 12 (bottom-left) ──
  _buildInventory(W, H, fs) {
    const COLS      = 3;
    const MAX_SLOTS = 12;
    const ROWS      = Math.ceil(MAX_SLOTS / COLS);
    const slotR     = Math.max(14, Math.round(W * 0.016));
    const iconS     = Math.round(slotR * 1.3);
    const gap       = Math.max(4, Math.round(W * 0.005));
    const step      = slotR * 2 + gap;
    const padX      = Math.max(8, Math.round(W * 0.010));
    const padTop    = Math.max(18, Math.round(W * 0.022));
    const padBot    = Math.max(6, Math.round(W * 0.008));
    const iw        = COLS * step - gap + padX * 2;
    const ih        = ROWS * step - gap + padTop + padBot;

    const px0 = 10;
    const py0 = H - 10 - ih;

    const panelGfx = this.add.graphics().setDepth(50);
    panelGfx.fillStyle(C.bg, 0.85);
    panelGfx.fillRoundedRect(px0, py0, iw, ih, 10);
    panelGfx.lineStyle(1.5, C.border, 0.80);
    panelGfx.strokeRoundedRect(px0, py0, iw, ih, 10);

    this.add.text(px0 + padX, py0 + 5, 'PLANTAS', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.label,
    }).setDepth(55);
    this.inventoryCount = this.add.text(px0 + iw - padX, py0 + 5, '0/12', {
      fontSize: fs.sm, fontFamily: 'monospace', color: '#fff8b4',
    }).setOrigin(1, 0).setDepth(55);

    const firstX = px0 + padX + slotR;
    const firstY = py0 + padTop + slotR;

    for (let i = 0; i < MAX_SLOTS; i++) {
      const col     = i % COLS;
      const row     = Math.floor(i / COLS);
      const sx      = firstX + col * step;
      const sy      = firstY + row * step;

      const slotGfx = this.add.graphics().setDepth(51);
      this._drawCircleSlot(slotGfx, sx, sy, slotR, C.dim, 0.7);

      const icon = this.add.image(sx, sy, 'plant_missing')
        .setDisplaySize(iconS, iconS).setAlpha(0).setDepth(56);
      const fake = this.add.text(sx, sy, '?', {
        fontSize: fs.sm, fontFamily: 'monospace', color: '#b28cbf',
      }).setOrigin(0.5).setAlpha(0).setDepth(57);

      this._slots.push({ slotGfx, icon, fake, sx, sy, slotR, iconS });
    }

    this._hudBounds = this._hudBounds || {};
    this._hudBounds.inventory = { x: px0, y: py0, w: iw, h: ih, label: 'Inventário' };

    // Objective bar above the panel
    const objY = py0 - 18;
    this._objDots  = [];
    this._objLabel = this.add.text(px0 + padX + 3, objY, '', {
      fontSize: `${Math.max(10, Math.round(W * 0.009))}px`,
      fontFamily: 'Georgia, serif', color: C.muted, fontStyle: 'italic',
    }).setOrigin(0, 0.5).setDepth(55);
    const ZONE2_PLANTS = ['farfalha', 'ventoinha', 'trepadeira'];
    ZONE2_PLANTS.forEach((id, i) => {
      const dot = this.add.circle(px0 + iw - padX - i * 14, objY, 4, C.dim, 1)
        .setStrokeStyle(1, C.border, 0.6).setDepth(55);
      this._objDots.unshift(dot);
    });
  }

  _drawCircleSlot(gfx, sx, sy, r, strokeCol, strokeAlpha) {
    gfx.clear();
    gfx.fillStyle(C.panel, 0.85);
    gfx.fillCircle(sx, sy, r);
    gfx.lineStyle(1.4, strokeCol, strokeAlpha);
    gfx.strokeCircle(sx, sy, r);
  }

  // ── Minimap (bottom-right) ────────────────────────────────────────────────
  _buildMinimap(W, H, fs) {
    const MMW  = Math.round(W * 0.120);
    const MMH  = Math.round(MMW * 9 / 16);
    const MMPW = MMW + Math.round(W * 0.016);
    const MMPH = MMH + Math.round(W * 0.020);
    this._mmPH = MMPH;

    const px  = W - 10, py = H - 10;
    const mmX = px - MMPW + Math.round(W * 0.007);
    const mmY = py - MMPH + Math.round(W * 0.007);
    this._mmX = mmX;
    this._mmY = mmY;
    this._mmW = MMW;
    this._mmH = MMH;

    this.add.rectangle(px, py, MMPW, MMPH, C.bg, 0.82)
      .setOrigin(1, 1).setStrokeStyle(1.5, C.border, 0.80).setDepth(50);

    this.add.text(mmX, py - MMPH + 6, 'MAPA', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.label,
    }).setDepth(55);
    this.add.text(mmX + MMW, py - MMPH + 6, '[M]', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.muted,
    }).setOrigin(1, 0).setDepth(55);

    if (this.textures.exists('map_fundo01')) {
      this.add.image(mmX, mmY, 'map_fundo01')
        .setOrigin(0, 0).setDisplaySize(MMW, MMH).setDepth(58);
    }
    if (this.textures.exists('map_fundo02')) {
      this.add.image(mmX, mmY, 'map_fundo02')
        .setOrigin(0, 0).setDisplaySize(MMW, MMH).setDepth(59);
    }
    if (!this.textures.exists('map_fundo01')) {
      this.add.rectangle(mmX, mmY, MMW, MMH, C.panel, 1).setOrigin(0, 0).setDepth(58);
    }

    this.mmGfx = this.add.graphics().setDepth(60);

    this.mmDot = this.add.circle(
      mmX + MMW / 2, mmY + MMH / 2,
      Math.max(4, Math.round(W * 0.0045)), C.accent, 1
    ).setDepth(62).setStrokeStyle(1.2, 0x0D351E, 0.9);

    this.add.rectangle(mmX, mmY, MMW, MMH, 0, 0)
      .setOrigin(0, 0).setStrokeStyle(1.6, C.border, 0.8).setDepth(63);

    this.mmZoneLabel = this.add.text(mmX + MMW / 2, mmY + MMH + 4, '', {
      fontSize: fs.sm, fontFamily: 'Georgia, serif', color: C.text, fontStyle: 'italic',
    }).setOrigin(0.5, 0).setDepth(62);

    this._drawMinimapBg('Zone1');
    this._hudBounds = this._hudBounds || {};
    this._hudBounds.minimap = { x: px - MMPW, y: py - MMPH, w: MMPW, h: MMPH, label: 'Minimap' };
  }

  // ── Controls panel (H toggle) — 2-column layout with border-radius ────────
  _buildControlsPanel(W, H, fs) {
    const cx   = W / 2, cy = H / 2;
    const pw   = Math.round(W * 0.38), ph = Math.round(H * 0.48);
    const r    = 16;
    const padX = Math.round(pw * 0.08);
    const padY = Math.round(ph * 0.07);

    const gfx = this.add.graphics().setDepth(300).setVisible(false);
    gfx.fillStyle(C.bg, 0.96);
    gfx.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, r);
    gfx.lineStyle(1.5, C.border, 0.85);
    gfx.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, r);

    const grp = [gfx];

    // Title
    const titleY = cy - ph / 2 + padY;
    const title = this.add.text(cx, titleY, 'CONTROLOS', {
      fontSize: fs.lg, fontFamily: 'Georgia, serif', color: C.magic, fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(301).setVisible(false);
    grp.push(title);

    // Divider below title
    const sepY  = titleY + Math.round(ph * 0.12);
    const sepGfx = this.add.graphics().setDepth(301).setVisible(false);
    sepGfx.lineStyle(1, C.border, 0.35);
    sepGfx.lineBetween(cx - pw / 2 + padX, sepY, cx + pw / 2 - padX, sepY);
    grp.push(sepGfx);

    // Two-column rows
    const rows = [
      ['WASD / Setas', 'Mover'],
      ['Shift',         'Correr'],
      ['C',             'Apanhar / Interagir'],
      ['F',             'Lançar feitiço'],
      ['Q',             'Mudar feitiço'],
      ['M',             'Mapa do jardim'],
      ['H',             'Fechar ajuda'],
    ];
    const contentH  = ph - padY * 2 - Math.round(ph * 0.12) - 30;
    const lineH     = Math.round(contentH / rows.length);
    const colLeft   = cx - pw / 2 + padX;
    const colRight  = cx - pw / 2 + Math.round(pw * 0.42);

    rows.forEach(([key, action], i) => {
      const iy = sepY + 10 + i * lineH;
      grp.push(
        this.add.text(colLeft,  iy, key, {
          fontSize: fs.md, fontFamily: 'monospace', color: C.accent,
        }).setOrigin(0, 0).setDepth(301).setVisible(false),
        this.add.text(colRight, iy, action, {
          fontSize: fs.md, fontFamily: 'monospace', color: C.text,
        }).setOrigin(0, 0).setDepth(301).setVisible(false),
      );
    });

    // Close hint at bottom
    const close = this.add.text(cx, cy + ph / 2 - padY, 'Prima H ou ESC para fechar', {
      fontSize: fs.sm, fontFamily: 'Georgia, serif', color: '#e8c96a', fontStyle: 'italic',
    }).setOrigin(0.5, 1).setDepth(301).setVisible(false);
    grp.push(close);

    this._ctrlGroup = grp;
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._controlsVisible) {
        this._controlsVisible = false;
        this._ctrlGroup.forEach(e => e.setVisible(false));
      }
    });
  }

  _toggleControls() {
    this._controlsVisible = !this._controlsVisible;
    this._ctrlGroup?.forEach(e => e.setVisible(this._controlsVisible));
  }

  // ── Minimap internals ─────────────────────────────────────────────────────
  _worldToMinimap(zone, x, y) {
    const mmX  = this._mmX, mmY = this._mmY;
    const MMW  = this._mmW, MMH = this._mmH;
    const ZW   = this.game.registry.get('debugZoneW')  ?? 1920;
    const ZH   = this.game.registry.get('debugZoneH')  ?? 1080;
    const TH   = this.game.registry.get('debugTransH')  ?? 400;
    const PH   = this.game.registry.get('debugParedeH') ?? 700;

    let rx0, ry0, rx1, ry1;

    if (zone === 'Zone1' || !zone) {
      let subArea, lx, ly;
      if (x >= ZW) {
        subArea = MAP_ZONE_REGIONS.Zone1.jardim;
        lx = x - ZW; ly = y;
      } else if (y < -(TH + PH)) {
        subArea = MAP_ZONE_REGIONS.Zone1.limiar;
        lx = x; ly = -(y + TH + PH);
      } else if (y < 0) {
        subArea = MAP_ZONE_REGIONS.Zone1.limiar;
        lx = x; ly = Math.max(0, ZH - 20);
      } else {
        subArea = MAP_ZONE_REGIONS.Zone1.campo;
        lx = x; ly = y;
      }
      [rx0, ry0, rx1, ry1] = subArea;
      return {
        dotX: mmX + (rx0 + (lx / ZW) * (rx1 - rx0)) * MMW,
        dotY: mmY + (ry0 + (ly / ZH) * (ry1 - ry0)) * MMH,
      };
    }

    [rx0, ry0, rx1, ry1] = MAP_ZONE_REGIONS[zone] ?? MAP_ZONE_REGIONS.Zone2;
    return {
      dotX: mmX + (rx0 + (x / WORLD_WIDTH)  * (rx1 - rx0)) * MMW,
      dotY: mmY + (ry0 + (y / WORLD_HEIGHT) * (ry1 - ry0)) * MMH,
    };
  }

  _drawMinimapBg(zone) {
    this._lastZone = zone;
    this.mmGfx?.clear();
    const names = {
      Zone1: 'Campo dos Vagalumes', Zone2: 'Floresta Densa',
      Zone3: 'Terrenos das Sombras', Cauldron: 'Caldeirão',
    };
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
    const { dotX, dotY } = this._worldToMinimap(
      zone, GameState.playerX ?? 640, GameState.playerY ?? 360
    );
    this.mmDot?.setPosition(dotX, dotY);
  }

  _updateCauldronDots() {
    if (!this._essentialDots?.length && !this.cauldronCount) return;
    const count = ESSENTIAL_IDS.filter(id => GameState.collected.has(id)).length;
    this._essentialDots?.forEach((d, i) => {
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
    const TW    = Math.round(W * 0.136);
    const TH    = 68;

    const c = this.add.container(W + 10, 90).setDepth(150);
    c.add([
      this.add.rectangle(0, 0, TW, TH, 0x0a1a10, 0.93)
        .setOrigin(0, 0).setStrokeStyle(1, el.color, 0.8),
      this.add.rectangle(0, 0, 5, TH, el.color, 0.9).setOrigin(0, 0),
      this.add.text(14, 8, plant.name, {
        fontSize: `${Math.max(11, Math.round(W * 0.0068))}px`,
        fontFamily: 'Georgia, serif', color: hex,
        stroke: '#0a1a10', strokeThickness: 2,
      }),
      this.add.text(14, 26, (plant.narrativeText || '').substring(0, 50) + '…', {
        fontSize: `${Math.max(9, Math.round(W * 0.0047))}px`,
        fontFamily: 'monospace', color: C.text,
        wordWrap: { width: TW - 22 },
      }),
      this.add.text(TW - 8, 8, '+ apanhada', {
        fontSize: `${Math.max(8, Math.round(W * 0.0047))}px`,
        fontFamily: 'monospace', color: '#E4EF6F',
      }).setOrigin(1, 0),
    ]);
    this.tweens.add({ targets: c, x: W - TW - 12, duration: 320, ease: 'Back.easeOut' });
    this.time.delayedCall(3600, () => {
      this.tweens.add({
        targets: c, x: W + 10, duration: 260, ease: 'Power2.easeIn',
        onComplete: () => { c.destroy(); this._showNextToast(); },
      });
    });
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────
  update() { this._updateMinimap(); }

  // ── Refresh ───────────────────────────────────────────────────────────────
  _refresh() { this._refreshInventory(); this._refreshSpell(); this._updateCauldronDots(); this._refreshObjective(); }

  _refreshObjective() {
    if (!this._objDots) return;
    const ZONE2_PLANTS = ['farfalha', 'ventoinha', 'trepadeira'];
    const count = ZONE2_PLANTS.filter(id => GameState.collected.has(id)).length;
    this._objDots.forEach((dot, i) => {
      const filled = i < count;
      dot.setFillStyle(filled ? C.plant : C.dim, 1);
      dot.setStrokeStyle(1.2, filled ? C.plant : C.border, filled ? 0.9 : 0.5);
      if (filled) {
        this.tweens.add({ targets: dot, scale: { from: 1.5, to: 1 }, duration: 300 });
      }
    });
    if (count === 0) {
      this._objLabel?.setText('objetivo: 3 plantas para o portal');
    } else if (count < 3) {
      this._objLabel?.setText(`${count}/3 para abrir o portal`);
    } else {
      this._objLabel?.setText('portal desbloqueado!').setColor(C.label);
    }
  }

  _refreshInventory() {
    // Sort: combo plants (used in any spell) first
    const comboIds = _comboPlantIds();
    const sorted = [...GameState.inventory].sort((a, b) => {
      const ac = comboIds.has(a.id) ? 0 : 1;
      const bc = comboIds.has(b.id) ? 0 : 1;
      return ac - bc;
    });

    this.inventoryCount?.setText(`${sorted.length}/12`);

    this._slots.forEach((s, i) => {
      const plant = sorted[i];
      if (plant) {
        const el  = ELEMENTS[plant.element] || ELEMENTS.EARTH;
        const col = plant.isFake ? 0x886688 : el.color;
        const key = this.textures.exists(`plant_img_${plant.id}`) ? `plant_img_${plant.id}` :
                    this.textures.exists(`plant_${plant.id}`)     ? `plant_${plant.id}` : 'plant_missing';
        s.icon.setTexture(key).setDisplaySize(s.iconS, s.iconS).setAlpha(0.98).setTint(0xffffff);
        if (plant.isFake) s.icon.setTint(0xc8a6d4);
        s.fake.setAlpha(plant.isFake ? 1 : 0);
        this._drawCircleSlot(s.slotGfx, s.sx, s.sy, s.slotR, col, 0.9);
      } else {
        s.icon.setAlpha(0);
        s.fake.setAlpha(0);
        this._drawCircleSlot(s.slotGfx, s.sx, s.sy, s.slotR, C.dim, 0.7);
      }
    });
  }

  _refreshSpell() {
    const spell = GameState.activeSpell ? SPELLS[GameState.activeSpell] : null;
    if (spell) {
      this.spellGfx?.setTexture(spell.textureKey).setAlpha(0.9);
      this.spellName?.setText(spell.name).setColor(C.magic);
    } else {
      this.spellGfx?.setAlpha(0.3);
      this.spellName?.setText('nenhum').setColor(C.muted);
    }
    this._refreshPlantsActivas(spell);
  }

  _refreshPlantsActivas(spell) {
    if (!this._plantsActivasGroup || !this._paSlots) return;
    const show = !!(spell?.plants?.length);
    this._plantsActivasGroup.forEach(o => o.setVisible(show));
    if (!show) return;

    this._paSlots.forEach((s, i) => {
      const plantId = spell.plants[i];
      if (plantId) {
        const plant     = PLANTS[plantId];
        const collected = GameState.collected.has(plantId);
        const key = this.textures.exists(`plant_img_${plantId}`) ? `plant_img_${plantId}` :
                    this.textures.exists(`plant_${plantId}`)     ? `plant_${plantId}` : 'plant_missing';
        s.icon.setTexture(key).setDisplaySize(s.iconS, s.iconS)
          .setAlpha(collected ? 0.95 : 0.35).setTint(0xffffff);
        const el  = plant ? (ELEMENTS[plant.element] || ELEMENTS.EARTH) : ELEMENTS.EARTH;
        const col = collected ? el.color : C.dim;
        s.slotGfx.clear();
        s.slotGfx.fillStyle(C.panel, 0.85);
        s.slotGfx.fillCircle(s.sx, s.sy, s.slotR);
        s.slotGfx.lineStyle(collected ? 2 : 1.4, col, collected ? 0.9 : 0.5);
        s.slotGfx.strokeCircle(s.sx, s.sy, s.slotR);
      } else {
        s.icon.setAlpha(0);
        s.slotGfx.clear();
        s.slotGfx.fillStyle(C.panel, 0.60);
        s.slotGfx.fillCircle(s.sx, s.sy, s.slotR);
        s.slotGfx.lineStyle(1, C.dim, 0.3);
        s.slotGfx.strokeCircle(s.sx, s.sy, s.slotR);
      }
    });
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  _onPlantCollected(plantData) {
    this._refresh();
    this._refreshObjective();
    if (plantData) {
      this.showPlantToast(plantData);
      this._rebuildPlantDots();
      SoundManager.collectPlant(plantData.element);
    }
    if (GameState.spellJustUnlocked) {
      this._showUnlock(`Feitiço desbloqueado!\n${SPELLS[GameState.spellJustUnlocked].name}`);
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
    this.narrativeText?.setText(text);
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
    this.unlockBanner?.setText(msg).setAlpha(0).setY(this.scale.height / 2);
    this.tweens.add({
      targets: this.unlockBanner, alpha: 1, y: this.scale.height / 2 - 14,
      duration: 380, ease: 'Back.easeOut',
      onComplete: () => this.time.delayedCall(2600, () =>
        this.tweens.add({ targets: this.unlockBanner, alpha: 0, duration: 500 })
      ),
    });
  }

  _updateArea(name) {
    this.areaLabel?.setText(name);
    this.tweens.killTweensOf(this.areaLabel);
    this.tweens.add({
      targets: this.areaLabel, alpha: 1, duration: 380, ease: 'Power2.easeOut',
      onComplete: () => this.time.delayedCall(3000, () =>
        this.tweens.add({ targets: this.areaLabel, alpha: 0, duration: 900 })
      ),
    });
    SoundManager.areaChange();
  }

  // ── HUD debug panel (Shift+D) — comprehensive inspector ──────────────────
  _buildHUDDebugPanel(W, H, fs) {
    if (this._hudFontMult === undefined) this._hudFontMult = 1.0;
    if (this._wireframeOn === undefined) this._wireframeOn = false;

    const PW = 310, PH = 520;
    const px  = 10;
    const py  = Math.round(H * 0.06);
    const INN = 10;  // inner padding

    const grp = [];
    const dep = 500;

    const _txt = (x, y, str, style, depth = dep + 1) =>
      grp.push(this.add.text(x, y, str, style).setDepth(depth).setScrollFactor(0)) && grp[grp.length - 1];

    const _btn = (x, y, label, onClick, w = 0) => {
      const b = this.add.text(x, y, label, {
        fontSize: '10px', fontFamily: 'monospace', color: '#ffef7a',
        backgroundColor: '#1a2e1a', padding: { x: 6, y: 3 },
      }).setDepth(dep + 2).setScrollFactor(0).setInteractive({ useHandCursor: true });
      if (w) b.setFixedSize(w, 0);
      b.on('pointerdown', onClick)
       .on('pointerover', function() { this.setColor('#ffffff'); })
       .on('pointerout',  function() { this.setColor('#ffef7a'); });
      grp.push(b);
      return b;
    };

    // ── Panel background ──────────────────────────────────────────────────
    const bg = this.add.graphics().setDepth(dep).setScrollFactor(0);
    bg.fillStyle(0x06080e, 0.96);
    bg.fillRoundedRect(px, py, PW, PH, 10);
    bg.lineStyle(1.5, 0x4a3d6e, 0.80);
    bg.strokeRoundedRect(px, py, PW, PH, 10);
    grp.push(bg);

    let cy2 = py + INN;

    // ── Header ────────────────────────────────────────────────────────────
    _txt(px + PW / 2, cy2, 'HUD DEBUG  [Shift+D]', {
      fontSize: '12px', fontFamily: 'monospace', color: '#d4a8f0',
      stroke: '#06080e', strokeThickness: 2,
    }).setOrigin(0.5, 0);
    cy2 += 20;

    // Resolution + zoom info (live, regenerated on each toggle)
    const zoom = this.cameras.main?.zoom ?? 1;
    _txt(px + INN, cy2, `Resolução: ${W}×${H}   Zoom: ${zoom}`, {
      fontSize: '9px', fontFamily: 'monospace', color: '#7a9a7e',
    });
    cy2 += 16;

    // ── Section: ELEMENTOS ────────────────────────────────────────────────
    this._dbSep(grp, px, cy2, PW, dep, 'ELEMENTOS');
    cy2 += 16;

    const HIGHLIGHT_COLORS = [0xff6666, 0x66aaff, 0xffee66, 0x66ff99, 0xff88ee];
    const bounds = this._hudBounds || {};
    const elemList = [
      bounds.spell,
      bounds.plantsActivas,
      bounds.inventory,
      bounds.minimap,
    ].filter(Boolean);

    this._dbHighlightGfx = this._dbHighlightGfx || this.add.graphics().setDepth(dep + 10).setScrollFactor(0);
    this._dbHighlightGfx.setVisible(false);
    grp.push(this._dbHighlightGfx);

    elemList.forEach((b, i) => {
      const col = HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length];
      const hexStr = '#' + col.toString(16).padStart(6, '0');
      _txt(px + INN, cy2,
        `${b.label.padEnd(14)} x:${b.x} y:${b.y} ${b.w}×${b.h}px`, {
          fontSize: '9px', fontFamily: 'monospace', color: hexStr,
        });
      _btn(px + PW - 54, cy2 - 1, '[◉]', () => this._dbHighlightElement(b, col));
      cy2 += 14;
    });

    // Wireframe toggle
    this._dbWireBtn = _btn(px + INN, cy2, this._wireframeOn ? '[ WIREFRAME ON ]' : '[ WIREFRAME OFF ]',
      () => this._toggleWireframe());
    cy2 += 22;

    // ── Section: TIPOGRAFIA ───────────────────────────────────────────────
    this._dbSep(grp, px, cy2, PW, dep, 'TIPOGRAFIA');
    cy2 += 16;

    const fsMult = this.add.text(px + PW / 2, cy2,
      `FONT SCALE  ×${this._hudFontMult.toFixed(2)}`, {
        fontSize: '10px', fontFamily: 'monospace', color: '#ffef7a',
      }).setOrigin(0.5, 0).setDepth(dep + 1).setScrollFactor(0);
    grp.push(fsMult);
    this._dbFsMult = fsMult;

    _btn(px + PW - 52, cy2, '−', () => this._adjustHUDFont(-0.05));
    _btn(px + PW - 28, cy2, '+', () => this._adjustHUDFont(+0.05));
    cy2 += 16;

    this._dbFsSizes = this.add.text(px + INN, cy2, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#b8d8b0', lineSpacing: 3,
    }).setDepth(dep + 1).setScrollFactor(0);
    grp.push(this._dbFsSizes);
    this._updateHUDDebugFsSizes(W);
    cy2 += 52;

    // ── Section: CORES ────────────────────────────────────────────────────
    this._dbSep(grp, px, cy2, PW, dep, 'CORES  (clica swatch → editar · [📋] copiar)');
    cy2 += 16;

    Object.entries(C).forEach(([name, val]) => {
      const isHex  = typeof val === 'string';
      const numVal = isHex ? parseInt(val.replace('#', ''), 16) : val;
      const hexStr = isHex ? val : '#' + numVal.toString(16).padStart(6, '0');

      // Wide clickable swatch — opens native colour picker
      const swatch = this.add.rectangle(px + INN, cy2 + 6, 28, 13, numVal, 1)
        .setOrigin(0, 0.5).setDepth(dep + 2).setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this._openColorPicker(name))
        .on('pointerover', function() { this.setStrokeStyle(1.5, 0xffffff, 0.8); })
        .on('pointerout',  function() { this.setStrokeStyle(0); });
      grp.push(swatch);

      _txt(px + INN + 34, cy2, name, {
        fontSize: '9px', fontFamily: 'monospace', color: '#9a90b0',
      });

      const safeHex = hexStr === '#f0e8ff' ? '#c0b8d0' : hexStr;
      const hexLabel = _txt(px + INN + 86, cy2, hexStr, {
        fontSize: '9px', fontFamily: 'monospace', color: safeHex,
      });
      grp.push(hexLabel);

      // Copy icon button
      _btn(px + PW - 32, cy2 - 2, '[📋]', () => this._copyToClipboard(hexStr), 26);

      cy2 += 17;
    });
    cy2 += 4;

    // ── Footer buttons ────────────────────────────────────────────────────
    this._dbSep(grp, px, cy2, PW, dep);
    cy2 += 8;
    _btn(px + INN, cy2, '[ COPIAR CONFIG ]', () => this._copyHUDConfig(), 130);
    _btn(px + INN + 140, cy2, '[ RESET TUDO ]', () => {
      Object.assign(C, C_DEFAULTS);
      this._hudFontMult = 1.0;
      this._rebuildHUD();
    }, 120);

    // ── Wireframe overlay (separate, persistent) ──────────────────────────
    if (!this._wireframeGfx) {
      this._wireframeGfx = this.add.graphics().setDepth(dep - 1).setScrollFactor(0);
    }
    this._wireframeGfx.setVisible(false);
    grp.push(this._wireframeGfx);

    this._hudDebugGroup = grp;
    grp.forEach(o => o.setVisible(false));
    this._hudDebugVisible = false;
  }

  _dbSep(grp, px, y, PW, dep, label = '') {
    const sepGfx = this.add.graphics().setDepth(dep + 1).setScrollFactor(0);
    sepGfx.lineStyle(1, 0x4a3d6e, 0.50);
    sepGfx.lineBetween(px + 10, y + 7, px + PW - 10, y + 7);
    grp.push(sepGfx);
    if (label) {
      grp.push(this.add.text(px + 14, y, label, {
        fontSize: '9px', fontFamily: 'monospace', color: '#7b5ea7',
        backgroundColor: '#06080e', padding: { x: 3, y: 0 },
      }).setDepth(dep + 2).setScrollFactor(0));
    }
  }

  _toggleHUDDebug() {
    this._hudDebugVisible = !this._hudDebugVisible;
    this._hudDebugGroup?.forEach(o => o.setVisible(this._hudDebugVisible));
    if (!this._hudDebugVisible) {
      this._dbHighlightGfx?.clear().setVisible(false);
      if (!this._wireframeOn) this._wireframeGfx?.setVisible(false);
    }
    if (this._hudDebugVisible && this._wireframeOn) this._drawWireframe();
  }

  _dbHighlightElement(b, col) {
    const gfx = this._dbHighlightGfx;
    if (!gfx) return;
    gfx.clear().setVisible(true);
    gfx.lineStyle(2, col, 0.95);
    gfx.strokeRect(b.x, b.y, b.w, b.h);
    gfx.lineStyle(1, col, 0.3);
    gfx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    // Pulsing tween
    this.tweens.killTweensOf(gfx);
    this.tweens.add({ targets: gfx, alpha: { from: 1, to: 0.2 }, duration: 600, yoyo: true, repeat: 3,
      onComplete: () => gfx.setVisible(false).setAlpha(1) });
  }

  _toggleWireframe() {
    this._wireframeOn = !this._wireframeOn;
    this._dbWireBtn?.setText(this._wireframeOn ? '[ WIREFRAME ON ]' : '[ WIREFRAME OFF ]');
    if (this._wireframeOn) { this._drawWireframe(); }
    else { this._wireframeGfx?.clear().setVisible(false); }
  }

  _drawWireframe() {
    const gfx = this._wireframeGfx;
    if (!gfx) return;
    gfx.clear().setVisible(true);
    const HIGHLIGHT_COLORS = [0xff6666, 0x66aaff, 0xffee66, 0x66ff99, 0xff88ee];
    const bounds = this._hudBounds || {};
    Object.values(bounds).forEach((b, i) => {
      const col = HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length];
      gfx.lineStyle(1.5, col, 0.75);
      gfx.strokeRect(b.x, b.y, b.w, b.h);
      gfx.fillStyle(col, 0.06);
      gfx.fillRect(b.x, b.y, b.w, b.h);
      // Corner label
      gfx.fillStyle(col, 0.9);
      gfx.fillRect(b.x, b.y, b.label.length * 5 + 4, 11);
    });
    // Label text drawn separately (graphics can't do text)
    this._wireLabels?.forEach(t => t.destroy());
    this._wireLabels = Object.values(bounds).map((b, i) => {
      const col = HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length];
      return this.add.text(b.x + 2, b.y, b.label, {
        fontSize: '8px', fontFamily: 'monospace',
        color: '#' + col.toString(16).padStart(6, '0'),
      }).setDepth(499).setScrollFactor(0);
    });
    if (!this._wireframeOn) {
      this._wireLabels?.forEach(t => t.destroy());
      this._wireLabels = [];
    }
  }

  _adjustHUDFont(delta) {
    this._hudFontMult = Math.max(0.5, Math.min(2.0, (this._hudFontMult || 1) + delta));
    this._dbFsMult?.setText(`FONT SCALE  ×${this._hudFontMult.toFixed(2)}`);
    this._updateHUDDebugFsSizes(this.scale.width);
  }

  _updateHUDDebugFsSizes(W) {
    if (!this._dbFsSizes) return;
    const m = this._hudFontMult || 1;
    const lines = [
      `sm = max(12, W×0.010) × ${m.toFixed(2)} → ${Math.max(12, Math.round(W * 0.010 * m))}px`,
      `md = max(14, W×0.012) × ${m.toFixed(2)} → ${Math.max(14, Math.round(W * 0.012 * m))}px`,
      `lg = max(17, W×0.0135)× ${m.toFixed(2)} → ${Math.max(17, Math.round(W * 0.0135 * m))}px`,
      `xl = max(21, W×0.0165)× ${m.toFixed(2)} → ${Math.max(21, Math.round(W * 0.0165 * m))}px`,
    ];
    this._dbFsSizes.setText(lines.join('\n'));
  }

  // Opens the browser's native colour picker and applies the chosen value live
  _openColorPicker(key) {
    const val    = C[key];
    const isStr  = typeof val === 'string';
    const curHex = isStr ? val : '#' + val.toString(16).padStart(6, '0');

    const inp = document.createElement('input');
    inp.type  = 'color';
    inp.value = curHex;
    // Hidden but attached to DOM so the browser can open the native picker
    Object.assign(inp.style, {
      position: 'fixed', top: '0', left: '0',
      width: '0', height: '0', opacity: '0', pointerEvents: 'none',
    });
    document.body.appendChild(inp);

    const cleanup = () => { if (inp.parentNode) document.body.removeChild(inp); };

    // Live preview while dragging the picker
    inp.addEventListener('input', (e) => {
      const hex = e.target.value;
      C[key] = isStr ? hex : parseInt(hex.slice(1), 16);
    });

    // Rebuild HUD when picker is closed/confirmed
    inp.addEventListener('change', () => {
      cleanup();
      this._rebuildHUD();
    });

    inp.addEventListener('cancel', cleanup);

    inp.click();
  }

  // Full HUD rebuild — preserves persistent state, applies any C palette changes
  _rebuildHUD() {
    if (!this.sys.isActive()) return;
    const W       = this.scale.width, H = this.scale.height;
    const queue   = [...(this._toastQueue  || [])];
    const ctrlVis = this._controlsVisible;
    const dbgVis  = this._hudDebugVisible;
    const wireOn  = this._wireframeOn;

    this.children.removeAll(true);
    this._slots              = [];
    this._plantDots          = [];
    this._ctrlGroup          = [];
    this._paSlots            = [];
    this._plantsActivasGroup = null;
    this._dbHighlightGfx     = null;
    this._wireframeGfx       = null;
    this._wireLabels         = [];
    this._toastQueue         = queue;
    this._toastActive        = false;
    this._controlsVisible    = ctrlVis;
    this._narrativeTimer     = null;
    this._lastZone           = null;
    this._wireframeOn        = wireOn;

    this._buildAll(W, H);
    if (ctrlVis) this._ctrlGroup?.forEach(e => e.setVisible(true));
    if (dbgVis)  { this._hudDebugVisible = false; this._toggleHUDDebug(); }
    this._refresh();
    this._drawMinimapBg(GameState.currentZone || 'Zone1');
  }

  _copyToClipboard(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    Object.assign(ta.style, { position: 'fixed', top: '-9999px', opacity: '0' });
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }

  _copyHUDConfig() {
    const m = this._hudFontMult || 1;
    const W = this.scale.width;
    const H = this.scale.height;
    const lines = [
      `// HUD Config  —  ${W}×${H}  scale×${m.toFixed(2)}`,
      `// Font sizes:`,
      `sm: Math.max(12, Math.round(W * ${(0.010 * m).toFixed(4)}))`,
      `md: Math.max(14, Math.round(W * ${(0.012 * m).toFixed(4)}))`,
      `lg: Math.max(17, Math.round(W * ${(0.0135 * m).toFixed(4)}))`,
      `xl: Math.max(21, Math.round(W * ${(0.0165 * m).toFixed(4)}))`,
      '',
      '// Colors:',
      ...Object.entries(C).map(([k, v]) =>
        `  ${k}: ${typeof v === 'string' ? `'${v}'` : `0x${v.toString(16).padStart(6,'0')}`},`
      ),
      '',
      '// Panel bounds:',
      ...Object.values(this._hudBounds || {}).map(b =>
        `  ${b.label}: x=${b.x} y=${b.y} w=${b.w} h=${b.h}`
      ),
    ];
    this._copyToClipboard(lines.join('\n'));
  }
}
