import Phaser from 'phaser';
import { ELEMENTS, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';
import { SoundManager } from '../SoundManager.js';

const ESSENTIAL_IDS = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

const C_DEFAULTS = {
  bg:      0xffffff,
  panel:   0xf6a3b3,
  panelDk: 0xe38599,
  border:  0x000000,
  accent:  0xb42d27,
  text:    '#000000',
  label:   '#555555',
  muted:   '#888888',
  textLt:  '#ffffff',
  plant:   0x7bc67e,
};

const C = { ...C_DEFAULTS };

const FU = "'Red Hat Text', sans-serif";
const FD = "'p22-ringwell', Georgia, serif";

const MAP_ZONE_REGIONS = {
  Zone1: {
    campo:  [0.00, 0.55, 0.25, 1.00],
    jardim: [0.25, 0.55, 0.52, 1.00],
    limiar: [0.00, 0.00, 0.27, 0.52],
  },
  Zone2: [0.28, 0.00, 0.72, 1.00],
  Zone3: [0.72, 0.00, 1.00, 1.00],
};

function _comboPlantIds() {
  const ids = new Set();
  Object.values(SPELLS).forEach(s => (s.plants || []).forEach(id => ids.add(id)));
  return ids;
}

export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUD', active: false }); }

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
    this._mmMask             = null;

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
        this._mmMask             = null;
        this._buildAll(gameSize.width, gameSize.height);
        if (ctrlVis) this._showControls();
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

  _buildAll(W, H) {
    this._hudBounds = {};
    const fs = this._fs(W);
    this._buildSpellPanel(W, H, fs);
    this._buildPlantsActivas(W, H, fs);
    this._buildInventory(W, H, fs);
    this._buildMinimap(W, H, fs);
    this._buildAreaBadge(W, H, fs);

    this.narrativeText = this.add.text(W / 2, H - this._mmPH - Math.round(W * 0.009), '', {
      fontSize: fs.md, fontFamily: FU,
      color: '#000000', wordWrap: { width: W * 0.30 },
      align: 'center',
      backgroundColor: 'rgba(246,163,179,0.94)',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: fs.xl, fontFamily: FD,
      color: '#b42d27', stroke: '#ffffff', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // Ajuda button — swap /assets/ui/ajuda_btn.svg to update the design
    const ajudaH = Math.round(W * 0.034);
    const ajudaW = Math.round(ajudaH * (220 / 56));
    this.add.image(10 + ajudaW / 2, 10 + ajudaH / 2, 'hud_ajuda')
      .setDisplaySize(ajudaW, ajudaH).setOrigin(0.5).setDepth(55)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._toggleControls());

    this._buildControlsPanel(W, H, fs);
    this._buildHUDDebugPanel(W, H, fs);

    this.input.keyboard.on('keydown-H', () => this._toggleControls());
    this.input.keyboard.on('keydown-D', (e) => { if (e.shiftKey) this._toggleHUDDebug(); });
  }

  _fs(W) {
    const m = this._hudFontMult ?? 1;
    return {
      sm: `${Math.max(11, Math.round(W * 0.0090 * m))}px`,
      md: `${Math.max(13, Math.round(W * 0.0110 * m))}px`,
      lg: `${Math.max(15, Math.round(W * 0.0130 * m))}px`,
      xl: `${Math.max(19, Math.round(W * 0.0160 * m))}px`,
    };
  }

  // ── Spell panel — pink pill, top-right ────────────────────────────────────
  _buildSpellPanel(W, H, fs) {
    const ph   = Math.round(W * 0.062);
    const pw   = Math.round(W * 0.200);
    const rx   = W - 10;
    const ry   = 10;
    const pill = Math.round(ph / 2);
    const iconS = Math.round(ph * 0.55);

    const gfx = this.add.graphics().setDepth(50);
    gfx.fillStyle(C.panel, 1);
    gfx.fillRoundedRect(rx - pw, ry, pw, ph, pill);
    gfx.lineStyle(1.5, C.border, 1);
    gfx.strokeRoundedRect(rx - pw, ry, pw, ph, pill);

    // Small "Feitiço" label top-left inside pill
    this.add.text(rx - pw + pill + 4, ry + Math.round(ph * 0.15), 'Feitiço', {
      fontSize: fs.sm, fontFamily: FU, color: C.label, fontStyle: 'italic',
    }).setOrigin(0, 0).setDepth(55);

    // Spell icon (left of pill content area)
    const iconX = rx - pw + pill;
    const iconY = ry + Math.round(ph * 0.62);
    this.spellGfx = this.add.image(iconX, iconY, 'spell_brisa')
      .setDisplaySize(iconS, iconS).setAlpha(0.75).setDepth(55);

    // Spell name — bold black
    this.spellName = this.add.text(iconX + Math.round(iconS * 0.62), iconY, 'nenhum', {
      fontSize: fs.lg, fontFamily: FU, color: C.text, fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(55);

    // Key hint bottom-right
    this.add.text(rx - 10, ry + ph - 6, '[Q] Mudar · [F] Lançar', {
      fontSize: fs.sm, fontFamily: FU, color: C.label,
    }).setOrigin(1, 1).setDepth(55);

    this._spellPanelBottom = ry + ph;
    this._spellPanelRight  = rx;
    this._hudBounds.spell  = { x: rx - pw, y: ry, w: pw, h: ph, label: 'Feitiço' };
  }

  // ── Plantas Activas — below spell pill ────────────────────────────────────
  _buildPlantsActivas(W, H, fs) {
    const MAX_PA = 2;
    const slotR  = Math.max(13, Math.round(W * 0.019));
    const iconS  = Math.round(slotR * 1.3);
    const gap    = Math.max(6, Math.round(W * 0.009));
    const labelH = Math.round(W * 0.018);
    const padH   = Math.max(6, Math.round(W * 0.008));
    const padW   = Math.max(8, Math.round(W * 0.010));
    const pw     = MAX_PA * slotR * 2 + (MAX_PA - 1) * gap + padW * 2;
    const ph     = slotR * 2 + labelH + padH * 2;
    const rx     = this._spellPanelRight ?? W - 10;
    const ry     = (this._spellPanelBottom ?? 72) + 6;

    const grp = [];

    const bg = this.add.graphics().setDepth(50);
    bg.fillStyle(C.panel, 1);
    bg.fillRoundedRect(rx - pw, ry, pw, ph, 8);
    bg.lineStyle(1.5, C.border, 1);
    bg.strokeRoundedRect(rx - pw, ry, pw, ph, 8);
    grp.push(bg);

    grp.push(
      this.add.text(rx - pw / 2, ry + 5, 'Plantas activas', {
        fontSize: fs.sm, fontFamily: FU, color: C.label, fontStyle: 'italic',
      }).setOrigin(0.5, 0).setDepth(55)
    );

    this._paSlots = [];
    for (let i = 0; i < MAX_PA; i++) {
      const sx = rx - pw + padW + slotR + i * (slotR * 2 + gap);
      const sy = ry + labelH + padH + slotR;

      const slotGfx = this.add.graphics().setDepth(51);
      slotGfx.fillStyle(0xffffff, 0.55);
      slotGfx.fillCircle(sx, sy, slotR);
      slotGfx.lineStyle(1.4, C.border, 0.4);
      slotGfx.strokeCircle(sx, sy, slotR);

      const icon = this.add.image(sx, sy, 'plant_missing')
        .setDisplaySize(iconS, iconS).setAlpha(0).setDepth(56);

      grp.push(slotGfx, icon);
      this._paSlots.push({ slotGfx, icon, sx, sy, slotR, iconS });
    }

    this._plantsActivasGroup = grp;
    grp.forEach(o => o.setVisible(false));
    this._hudBounds.plantsActivas = { x: rx - pw, y: ry, w: pw, h: ph, label: 'Plantas Activas' };
  }

  // ── Inventory — 3×4 circular slots with name labels below, bottom-left ────
  _buildInventory(W, H, fs) {
    const COLS      = 6;
    const MAX_SLOTS = 12;
    const slotR     = Math.max(12, Math.round(W * 0.016));
    const iconS     = Math.round(slotR * 1.25);
    const gapX      = Math.max(4, Math.round(W * 0.006));
    const nameLH    = Math.max(10, Math.round(W * 0.011));
    const stepX     = slotR * 2 + gapX;
    const padX      = Math.max(8, Math.round(W * 0.010));
    const padTop    = Math.max(32, Math.round(W * 0.034));
    const padBot    = Math.max(6, Math.round(W * 0.007));
    const rowH      = slotR * 2 + nameLH + Math.max(3, Math.round(W * 0.004));
    const iw        = COLS * stepX - gapX + padX * 2;

    // Collapsed height = title area + 1 row; expanded = + 1 more row
    const ihCollapsed = padTop + rowH + padBot;
    const ihExpanded  = padTop + rowH * 2 + padBot;

    const px0 = 10;
    const r   = 10;

    this._invCOLS      = COLS;
    this._invSlotR     = slotR;
    this._invIconS     = iconS;
    this._invStepX     = stepX;
    this._invRowH      = rowH;
    this._invPadX      = padX;
    this._invPadTop    = padTop;
    this._invPadBot    = padBot;
    this._invIW        = iw;
    this._invIHc       = ihCollapsed;
    this._invIHe       = ihExpanded;
    this._invPX0       = px0;
    this._invR         = r;
    this._invH         = H;
    this._inventoryExpanded = false;

    // Panel background (redrawn on expand/collapse)
    this._invGfx = this.add.graphics().setDepth(50);
    this._drawInventoryPanel(H - 10 - ihCollapsed, ihCollapsed);

    // Title row
    const titleY = H - 10 - ihCollapsed + 12;
    this._invTitleText = this.add.text(px0 + padX, titleY, 'Inventário', {
      fontSize: fs.md, fontFamily: FU, color: C.text, fontStyle: 'bold',
    }).setOrigin(0, 0).setDepth(55);

    this.inventoryCount = this.add.text(px0 + iw - padX - 18, titleY, '0/12', {
      fontSize: fs.sm, fontFamily: FU, color: '#b42d27', fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(55);

 
    // Expand toggle ▼/▲
    this._invToggle = this.add.text(px0 + iw - padX, titleY + 8, '▼', {
      fontSize: fs.sm, fontFamily: FU, color: C.label,
    }).setOrigin(1, 0).setDepth(56).setInteractive({ useHandCursor: true });
    this._invToggle.on('pointerdown', () => this._toggleInventory());
    this._invToggle.on('pointerover', () => this._invToggle.setColor(C.text));
    this._invToggle.on('pointerout',  () => this._invToggle.setColor(C.label));

    // All 12 slots (2 rows × 6); row 2 starts hidden
    const firstX = px0 + padX + slotR;
    const row0Y  = H - 10 - ihCollapsed + padTop + slotR;
    const row1Y  = row0Y + rowH;

    this._slots = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const sx  = firstX + col * stepX;
      const sy  = row === 0 ? row0Y : row1Y;

      const slotGfx = this.add.graphics().setDepth(51);
      this._drawCircleSlot(slotGfx, sx, sy, slotR, C.border, 0.20);

      const icon = this.add.image(sx, sy, 'plant_missing')
        .setDisplaySize(iconS, iconS).setAlpha(0).setDepth(56);

      const fake = this.add.text(sx, sy, '?', {
        fontSize: fs.sm, fontFamily: FU, color: '#b42d27',
      }).setOrigin(0.5).setAlpha(0).setDepth(57);

      const nameLabel = this.add.text(sx, sy + slotR + 2, '', {
        fontSize: `${Math.max(7, Math.round(W * 0.0060))}px`,
        fontFamily: FU, color: C.label, align: 'center',
        wordWrap: { width: stepX },
      }).setOrigin(0.5, 0).setAlpha(0).setDepth(57);

      // Row 2 hidden by default
      if (row === 1) {
        slotGfx.setVisible(false);
        icon.setVisible(false);
        fake.setVisible(false);
        nameLabel.setVisible(false);
      }

      this._slots.push({ slotGfx, icon, fake, nameLabel, sx, sy, slotR, iconS, row });
    }

    this._hudBounds.inventory = { x: px0, y: H - 10 - ihCollapsed, w: iw, h: ihCollapsed, label: 'Inventário' };
  }

  _drawInventoryPanel(py0, ih) {
    const gfx = this._invGfx;
    gfx.clear();
    gfx.fillStyle(C.panel, 1);
    gfx.fillRoundedRect(this._invPX0, py0, this._invIW, ih, this._invR);
  }

  _toggleInventory() {
    this._inventoryExpanded = !this._inventoryExpanded;
    const expanded = this._inventoryExpanded;
    const H        = this._invH;
    const ih       = expanded ? this._invIHe : this._invIHc;
    const py0      = H - 10 - ih;
    const deltaY   = this._invIHe - this._invIHc;

    this._drawInventoryPanel(py0, ih);
    this._invToggle.setText(expanded ? '▲' : '▼');

    // Shift ALL content first (while row 1 is still hidden — no visual glitch)
    const shift = expanded ? -deltaY : deltaY;
    [
      this._invTitleText, this.inventoryCount, this.inventorySubtitle, this._invToggle,
      ...this._slots.flatMap(s => [s.slotGfx, s.icon, s.fake, s.nameLabel]),
    ].forEach(obj => { if (obj?.active) obj.y += shift; });

    // Show/hide row 1 AFTER shifting so it appears in the correct position
    this._slots.forEach(s => {
      if (s.row === 1) {
        s.slotGfx.setVisible(expanded);
        s.icon.setVisible(expanded);
        s.fake.setVisible(expanded);
        s.nameLabel.setVisible(expanded);
      }
    });
  }

  _drawCircleSlot(gfx, sx, sy, r, strokeCol, strokeAlpha) {
    gfx.clear();
    gfx.fillStyle(0xffffff, 0.38);
    gfx.fillCircle(sx, sy, r);
    gfx.lineStyle(1.5, strokeCol, strokeAlpha);
    gfx.strokeCircle(sx, sy, r);
  }

  // ── Minimap — circular viewport with geometry mask, bottom-right ──────────
  _buildMinimap(W, H, fs) {
    const R       = Math.round(W * 0.065);
    const mmLabel = 26;
    const cx      = W - 10 - R;
    const cy      = H - 8 - mmLabel - R;

    this._mmCX = cx;
    this._mmCY = cy;
    this._mmR  = R;
    this._mmX  = cx - R;
    this._mmY  = cy - R;
    this._mmW  = R * 2;
    this._mmH  = R * 2;
    this._mmPH = R * 2 + mmLabel + 16;

    // Geometry mask — filled circle at screen position
    const maskGfx = this.make.graphics({ add: false });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillCircle(cx, cy, R);
    const mask = maskGfx.createGeometryMask();
    this._mmMask = mask;

    // Map backgrounds (inside mask)
    if (this.textures.exists('map_fundo01')) {
      this.add.image(cx, cy, 'map_fundo01')
        .setDisplaySize(R * 2, R * 2).setDepth(58).setMask(mask);
    } else {
      this.add.circle(cx, cy, R, 0xe8f0ec, 1).setDepth(58).setMask(mask);
    }
    if (this.textures.exists('map_fundo02')) {
      this.add.image(cx, cy, 'map_fundo02')
        .setDisplaySize(R * 2, R * 2).setDepth(59).setMask(mask);
    }

    // Drawing layer for zones (inside mask)
    this.mmGfx = this.add.graphics().setDepth(60).setMask(mask);

    // Player dot (inside mask)
    this.mmDot = this.add.circle(cx, cy, Math.max(4, Math.round(W * 0.0044)), C.accent, 1)
      .setDepth(62).setStrokeStyle(1.2, 0xffffff, 0.9).setMask(mask);

    // Border ring drawn on top — no mask, so it acts as frame
    this.add.graphics().setDepth(64)
      .lineStyle(3, C.border, 1)
      .strokeCircle(cx, cy, R);

    // Zone label below
    this.mmZoneLabel = this.add.text(cx, cy + R + 7, '', {
      fontSize: fs.sm, fontFamily: FU, color: C.text,
    }).setOrigin(0.5, 0).setDepth(62);

    this._drawMinimapBg('Zone1');
    this._hudBounds.minimap = { x: cx - R, y: cy - R, w: R * 2, h: R * 2 + mmLabel + 8, label: 'Minimap' };
  }

  // ── Area badge — SVG image when available, pill fallback otherwise ────────
  _buildAreaBadge(W, H, fs) {
    // Badge texture key per area name
    this._BADGE_KEYS = {
      'Campo dos Vagalumes': 'badge_campo',
      'Jardim Invertido':    'badge_jardim',
      'Limiar Secreto':      'badge_limiar',
    };

    const bh = Math.round(W * 0.036);
    const bw = Math.round(bh * (700 / 127));  // preserve SVG aspect ratio

    // SVG image (hidden until area known)
    this._areaBadgeImg = this.add.image(W / 2, bh / 2 + 8, 'badge_campo')
      .setDisplaySize(bw, bh).setAlpha(0).setDepth(55);

    // Text pill fallback (for zones without an SVG badge)
    this._areaBadgeBg     = this.add.graphics();
    this._areaBadgeSparkL = this.add.text(-80, 15, '✦', {
      fontSize: fs.md, fontFamily: FD, color: '#b42d27',
    }).setOrigin(0.5, 0.5);
    this._areaBadgeSparkR = this.add.text(80, 15, '✦', {
      fontSize: fs.md, fontFamily: FD, color: '#b42d27',
    }).setOrigin(0.5, 0.5);
    this._areaBadgeName = this.add.text(0, 15, '', {
      fontSize: fs.md, fontFamily: FD, color: C.text, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);
    this._areaBadge = this.add.container(W / 2, 12, [
      this._areaBadgeBg,
      this._areaBadgeSparkL,
      this._areaBadgeSparkR,
      this._areaBadgeName,
    ]).setDepth(55).setAlpha(0);

    this._areaBadgeW = bw;
    this._areaBadgeH = bh;
  }

  _drawAreaBadge(name) {
    const key = this._BADGE_KEYS?.[name];
    if (key && this.textures.exists(key)) {
      // Show SVG image, hide text pill
      this._areaBadge.setAlpha(0);
      this._areaBadgeImg.setTexture(key)
        .setDisplaySize(this._areaBadgeW, this._areaBadgeH)
        .setAlpha(1);
      this._areaUseSvg = true;
    } else {
      // Show text pill, hide SVG image
      this._areaBadgeImg.setAlpha(0);
      this._areaUseSvg  = false;
      this._areaBadgeName.setText(name);
      const tw  = this._areaBadgeName.width;
      const bh  = 30;
      const pad = 38;
      const bw  = Math.max(180, tw + pad * 2);
      this._areaBadgeBg.clear();
      this._areaBadgeBg.fillStyle(C.panel, 1);
      this._areaBadgeBg.fillRoundedRect(-bw / 2, 0, bw, bh, bh / 2);
      this._areaBadgeBg.lineStyle(1.5, C.border, 1);
      this._areaBadgeBg.strokeRoundedRect(-bw / 2, 0, bw, bh, bh / 2);
      this._areaBadgeSparkL.setPosition(-bw / 2 + 16, bh / 2);
      this._areaBadgeSparkR.setPosition(bw / 2 - 16, bh / 2);
      this._areaBadgeName.setPosition(0, bh / 2);
    }
  }

  // ── Controls panel — DOM overlay in index.html, toggled here ─────────────
  _buildControlsPanel(W, H, fs) {
    this._ctrlGroup = [];
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._controlsVisible) this._hideControls();
    });
  }

  _toggleControls() {
    this._controlsVisible ? this._hideControls() : this._showControls();
  }

  _showControls() {
    this._controlsVisible = true;
    document.getElementById('controls-panel')?.classList.add('visible');
  }

  _hideControls() {
    this._controlsVisible = false;
    document.getElementById('controls-panel')?.classList.remove('visible');
  }

  // ── Minimap internals ─────────────────────────────────────────────────────
  _worldToMinimap(zone, x, y) {
    const mmX = this._mmX, mmY = this._mmY;
    const MMW = this._mmW, MMH = this._mmH;
    const ZW  = this.game.registry.get('debugZoneW')   ?? 1920;
    const ZH  = this.game.registry.get('debugZoneH')   ?? 1080;
    const TH  = this.game.registry.get('debugTransH')  ?? 400;
    const PH  = this.game.registry.get('debugParedeH') ?? 700;

    let rx0, ry0, rx1, ry1;

    if (zone === 'Zone1' || !zone) {
      let subArea, lx, ly;
      if (x >= ZW) {
        subArea = MAP_ZONE_REGIONS.Zone1.jardim; lx = x - ZW; ly = y;
      } else if (y < -(TH + PH)) {
        subArea = MAP_ZONE_REGIONS.Zone1.limiar; lx = x; ly = -(y + TH + PH);
      } else if (y < 0) {
        subArea = MAP_ZONE_REGIONS.Zone1.limiar; lx = x; ly = Math.max(0, ZH - 20);
      } else {
        subArea = MAP_ZONE_REGIONS.Zone1.campo; lx = x; ly = y;
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
      const ok    = GameState.collected.has(s.id);
      const el    = plant ? ELEMENTS[plant.element] : null;
      const col   = ok ? (el?.color ?? 0x7DB98A) : 0x4a8060;
      const r     = ok ? 3 : 2;
      const dot   = this.add.circle(dotX, dotY, r, col, ok ? 0.9 : 0.6).setDepth(61);
      if (ok) dot.setStrokeStyle(0.8, 0xffffff, 0.3);
      if (this._mmMask) dot.setMask(this._mmMask);
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
      d.setFillStyle(i < count ? C.panelDk : 0xdddddd, 1)
       .setStrokeStyle(1, i < count ? C.accent : C.border, i < count ? 0.8 : 0.3);
    });
    this.cauldronCount?.setText(`${count}/5`);
    if (count >= 5) this.cauldronCount?.setColor('#b42d27');
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
    const TW    = Math.round(W * 0.142);
    const TH    = 68;

    const c = this.add.container(W + 10, 90).setDepth(150);
    c.add([
      this.add.rectangle(0, 0, TW, TH, 0xffffff, 0.97)
        .setOrigin(0, 0).setStrokeStyle(1.5, C.border, 0.8),
      this.add.rectangle(0, 0, 5, TH, el.color, 0.9).setOrigin(0, 0),
      this.add.text(14, 8, plant.name, {
        fontSize: `${Math.max(11, Math.round(W * 0.0068))}px`,
        fontFamily: FU, color: '#b42d27', fontStyle: 'bold',
      }),
      this.add.text(14, 26, (plant.narrativeText || '').substring(0, 50) + '…', {
        fontSize: `${Math.max(9, Math.round(W * 0.0047))}px`,
        fontFamily: FU, color: '#333333',
        wordWrap: { width: TW - 22 },
      }),
      this.add.text(TW - 8, 8, '+ apanhada', {
        fontSize: `${Math.max(8, Math.round(W * 0.0047))}px`,
        fontFamily: FU, color: '#b42d27',
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
    if (!this._objDots?.length) return;
    const ZONE2_PLANTS = ['farfalha', 'ventoinha', 'trepadeira'];
    const count = ZONE2_PLANTS.filter(id => GameState.collected.has(id)).length;
    this._objDots.forEach((dot, i) => {
      const filled = i < count;
      dot.setFillStyle(filled ? C.accent : 0xdddddd, 1);
      dot.setStrokeStyle(1.2, filled ? C.accent : C.border, filled ? 0.9 : 0.3);
      if (filled) {
        this.tweens.add({ targets: dot, scale: { from: 1.5, to: 1 }, duration: 300 });
      }
    });
  }

  _refreshInventory() {
    const comboIds = _comboPlantIds();
    const sorted   = [...GameState.inventory].sort((a, b) => {
      return (comboIds.has(a.id) ? 0 : 1) - (comboIds.has(b.id) ? 0 : 1);
    });

    this.inventoryCount?.setText(`${sorted.length}/12`);

    this._slots.forEach((s, i) => {
      const plant = sorted[i];
      if (plant) {
        const el  = ELEMENTS[plant.element] || ELEMENTS.EARTH;
        const col = plant.isFake ? 0x886688 : el.color;
        const key = this.textures.exists(`plant_img_${plant.id}`) ? `plant_img_${plant.id}` :
                    this.textures.exists(`plant_${plant.id}`)     ? `plant_${plant.id}` : 'plant_missing';
        s.icon.setTexture(key).setDisplaySize(s.iconS, s.iconS).setAlpha(0.97).setTint(0xffffff);
        if (plant.isFake) s.icon.setTint(0xc8a6d4);
        s.fake.setAlpha(plant.isFake ? 1 : 0);
        this._drawCircleSlot(s.slotGfx, s.sx, s.sy, s.slotR, col, 0.85);
        s.nameLabel?.setText(plant.name || '').setAlpha(1);
      } else {
        s.icon.setAlpha(0);
        s.fake.setAlpha(0);
        this._drawCircleSlot(s.slotGfx, s.sx, s.sy, s.slotR, C.border, 0.18);
        s.nameLabel?.setText('').setAlpha(0);
      }
    });
  }

  _refreshSpell() {
    const spell = GameState.activeSpell ? SPELLS[GameState.activeSpell] : null;
    if (spell) {
      this.spellGfx?.setTexture(spell.textureKey).setAlpha(0.92);
      this.spellName?.setText(spell.name).setColor(C.text);
    } else {
      this.spellGfx?.setAlpha(0.35);
      this.spellName?.setText('nenhum').setColor(C.label);
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
        const col = collected ? el.color : 0xaaaaaa;
        s.slotGfx.clear();
        s.slotGfx.fillStyle(0xffffff, collected ? 0.65 : 0.28);
        s.slotGfx.fillCircle(s.sx, s.sy, s.slotR);
        s.slotGfx.lineStyle(collected ? 2 : 1.4, col, collected ? 0.9 : 0.4);
        s.slotGfx.strokeCircle(s.sx, s.sy, s.slotR);
      } else {
        s.icon.setAlpha(0);
        s.slotGfx.clear();
        s.slotGfx.fillStyle(0xffffff, 0.18);
        s.slotGfx.fillCircle(s.sx, s.sy, s.slotR);
        s.slotGfx.lineStyle(1, C.border, 0.18);
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

  _onPlantStolen() { this._refreshInventory(); this._updateCauldronDots(); this._rebuildPlantDots(); }

  _onSpellCast() {
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
    this._drawAreaBadge(name);
    const target = this._areaUseSvg ? this._areaBadgeImg : this._areaBadge;
    const other  = this._areaUseSvg ? this._areaBadge : this._areaBadgeImg;
    this.tweens.killTweensOf(target);
    this.tweens.killTweensOf(other);
    other.setAlpha(0);
    target.setAlpha(0);
    this.tweens.add({
      targets: target, alpha: 1, duration: 380, ease: 'Power2.easeOut',
      onComplete: () => this.time.delayedCall(3000, () =>
        this.tweens.add({ targets: target, alpha: 0, duration: 900 })
      ),
    });
    SoundManager.areaChange();
  }

  // ── HUD debug panel (Shift+D) ─────────────────────────────────────────────
  _buildHUDDebugPanel(W, H, fs) {
    if (this._hudFontMult === undefined) this._hudFontMult = 1.0;
    if (this._wireframeOn === undefined) this._wireframeOn = false;

    const PW  = 310, PH = 540;
    const px  = 10;
    const py  = Math.round(H * 0.06);
    const INN = 10;
    const dep = 500;
    const grp = [];

    const _txt = (x, y, str, style, depth = dep + 1) => {
      const t = this.add.text(x, y, str, style).setDepth(depth).setScrollFactor(0);
      grp.push(t);
      return t;
    };

    const _btn = (x, y, label, onClick, w = 0) => {
      const b = this.add.text(x, y, label, {
        fontSize: '10px', fontFamily: 'monospace', color: '#b42d27',
        backgroundColor: '#fff0f2', padding: { x: 6, y: 3 },
      }).setDepth(dep + 2).setScrollFactor(0).setInteractive({ useHandCursor: true });
      if (w) b.setFixedSize(w, 0);
      b.on('pointerdown', onClick)
       .on('pointerover', function() { this.setColor('#ffffff').setBackgroundColor('#b42d27'); })
       .on('pointerout',  function() { this.setColor('#b42d27').setBackgroundColor('#fff0f2'); });
      grp.push(b);
      return b;
    };

    const bg = this.add.graphics().setDepth(dep).setScrollFactor(0);
    bg.fillStyle(0xffffff, 0.97);
    bg.fillRoundedRect(px, py, PW, PH, 10);
    bg.lineStyle(1.5, 0x000000, 0.80);
    bg.strokeRoundedRect(px, py, PW, PH, 10);
    grp.push(bg);

    let cy2 = py + INN;

    _txt(px + PW / 2, cy2, 'HUD DEBUG  [Shift+D]', {
      fontSize: '12px', fontFamily: 'monospace', color: '#b42d27',
    }).setOrigin(0.5, 0);
    cy2 += 20;

    const zoom = this.cameras.main?.zoom ?? 1;
    _txt(px + INN, cy2, `Resolução: ${W}×${H}   Zoom: ${zoom}`, {
      fontSize: '9px', fontFamily: 'monospace', color: '#555555',
    });
    cy2 += 16;

    // ELEMENTOS section
    this._dbSep(grp, px, cy2, PW, dep, 'ELEMENTOS');
    cy2 += 16;

    const HCOLS = [0xff6666, 0x66aaff, 0xffee66, 0x66ff99, 0xff88ee];
    const elemList = [
      this._hudBounds.spell,
      this._hudBounds.plantsActivas,
      this._hudBounds.inventory,
      this._hudBounds.minimap,
    ].filter(Boolean);

    this._dbHighlightGfx = this._dbHighlightGfx ||
      this.add.graphics().setDepth(dep + 10).setScrollFactor(0);
    this._dbHighlightGfx.setVisible(false);
    grp.push(this._dbHighlightGfx);

    elemList.forEach((b, i) => {
      const col    = HCOLS[i % HCOLS.length];
      const hexStr = '#' + col.toString(16).padStart(6, '0');
      _txt(px + INN, cy2, `${b.label.padEnd(14)} x:${b.x} y:${b.y} ${b.w}×${b.h}px`, {
        fontSize: '9px', fontFamily: 'monospace', color: hexStr,
      });
      _btn(px + PW - 54, cy2 - 1, '[◉]', () => this._dbHighlightElement(b, col));
      cy2 += 14;
    });

    this._dbWireBtn = _btn(px + INN, cy2, this._wireframeOn ? '[ WIREFRAME ON ]' : '[ WIREFRAME OFF ]',
      () => this._toggleWireframe());
    cy2 += 22;

    // TIPOGRAFIA section
    this._dbSep(grp, px, cy2, PW, dep, 'TIPOGRAFIA');
    cy2 += 16;

    const fsMult = this.add.text(px + PW / 2, cy2,
      `FONT SCALE  ×${this._hudFontMult.toFixed(2)}`, {
        fontSize: '10px', fontFamily: 'monospace', color: '#b42d27',
      }).setOrigin(0.5, 0).setDepth(dep + 1).setScrollFactor(0);
    grp.push(fsMult);
    this._dbFsMult = fsMult;

    _btn(px + PW - 52, cy2, '−', () => this._adjustHUDFont(-0.05));
    _btn(px + PW - 28, cy2, '+', () => this._adjustHUDFont(+0.05));
    cy2 += 16;

    this._dbFsSizes = this.add.text(px + INN, cy2, '', {
      fontSize: '9px', fontFamily: 'monospace', color: '#555555', lineSpacing: 3,
    }).setDepth(dep + 1).setScrollFactor(0);
    grp.push(this._dbFsSizes);
    this._updateHUDDebugFsSizes(W);
    cy2 += 52;

    // CORES section
    this._dbSep(grp, px, cy2, PW, dep, 'CORES  (clica swatch → editar · [📋] copiar)');
    cy2 += 16;

    Object.entries(C).forEach(([name, val]) => {
      const isHex  = typeof val === 'string';
      const numVal = isHex ? parseInt(val.replace('#', ''), 16) : val;
      const hexStr = isHex ? val : '#' + numVal.toString(16).padStart(6, '0');

      const swatch = this.add.rectangle(px + INN, cy2 + 6, 28, 13, numVal, 1)
        .setOrigin(0, 0.5).setDepth(dep + 2).setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this._openColorPicker(name))
        .on('pointerover', function() { this.setStrokeStyle(2, 0x000000, 0.9); })
        .on('pointerout',  function() { this.setStrokeStyle(0); });
      grp.push(swatch);

      _txt(px + INN + 34, cy2, name, { fontSize: '9px', fontFamily: 'monospace', color: '#555555' });

      // Avoid rendering near-white text on white bg
      const safeHex = numVal > 0xd0d0d0 ? '#888888' : hexStr;
      _txt(px + INN + 86, cy2, hexStr, { fontSize: '9px', fontFamily: 'monospace', color: safeHex });

      _btn(px + PW - 32, cy2 - 2, '[📋]', () => this._copyToClipboard(hexStr), 26);
      cy2 += 17;
    });
    cy2 += 4;

    this._dbSep(grp, px, cy2, PW, dep);
    cy2 += 8;
    _btn(px + INN,       cy2, '[ COPIAR CONFIG ]', () => this._copyHUDConfig(), 130);
    _btn(px + INN + 140, cy2, '[ RESET TUDO ]', () => {
      Object.assign(C, C_DEFAULTS);
      this._hudFontMult = 1.0;
      this._rebuildHUD();
    }, 120);

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
    sepGfx.lineStyle(1, 0x000000, 0.18);
    sepGfx.lineBetween(px + 10, y + 7, px + PW - 10, y + 7);
    grp.push(sepGfx);
    if (label) {
      grp.push(this.add.text(px + 14, y, label, {
        fontSize: '9px', fontFamily: 'monospace', color: '#b42d27',
        backgroundColor: '#ffffff', padding: { x: 3, y: 0 },
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
    gfx.lineStyle(1, col, 0.30);
    gfx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    this.tweens.killTweensOf(gfx);
    this.tweens.add({
      targets: gfx, alpha: { from: 1, to: 0.2 }, duration: 600, yoyo: true, repeat: 3,
      onComplete: () => gfx.setVisible(false).setAlpha(1),
    });
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
    const HCOLS = [0xff6666, 0x66aaff, 0xffee66, 0x66ff99, 0xff88ee];
    Object.values(this._hudBounds || {}).forEach((b, i) => {
      const col = HCOLS[i % HCOLS.length];
      gfx.lineStyle(1.5, col, 0.75);
      gfx.strokeRect(b.x, b.y, b.w, b.h);
      gfx.fillStyle(col, 0.06);
      gfx.fillRect(b.x, b.y, b.w, b.h);
      gfx.fillStyle(col, 0.9);
      gfx.fillRect(b.x, b.y, b.label.length * 5 + 4, 11);
    });
    this._wireLabels?.forEach(t => t.destroy());
    this._wireLabels = Object.values(this._hudBounds || {}).map((b, i) => {
      const col = HCOLS[i % HCOLS.length];
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
    this._dbFsSizes.setText([
      `sm = max(11, W×0.009) × ${m.toFixed(2)} → ${Math.max(11, Math.round(W * 0.009 * m))}px`,
      `md = max(13, W×0.011) × ${m.toFixed(2)} → ${Math.max(13, Math.round(W * 0.011 * m))}px`,
      `lg = max(15, W×0.013) × ${m.toFixed(2)} → ${Math.max(15, Math.round(W * 0.013 * m))}px`,
      `xl = max(19, W×0.016) × ${m.toFixed(2)} → ${Math.max(19, Math.round(W * 0.016 * m))}px`,
    ].join('\n'));
  }

  _openColorPicker(key) {
    const val    = C[key];
    const isStr  = typeof val === 'string';
    const curHex = isStr ? val : '#' + val.toString(16).padStart(6, '0');

    const inp = document.createElement('input');
    inp.type  = 'color';
    inp.value = curHex;
    Object.assign(inp.style, {
      position: 'fixed', top: '0', left: '0',
      width: '0', height: '0', opacity: '0', pointerEvents: 'none',
    });
    document.body.appendChild(inp);

    const cleanup = () => { if (inp.parentNode) document.body.removeChild(inp); };
    inp.addEventListener('input',  (e) => {
      const hex = e.target.value;
      C[key] = isStr ? hex : parseInt(hex.slice(1), 16);
    });
    inp.addEventListener('change', () => { cleanup(); this._rebuildHUD(); });
    inp.addEventListener('cancel', cleanup);
    inp.click();
  }

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
    this._mmMask             = null;

    this._buildAll(W, H);
    if (ctrlVis) this._showControls(); else this._hideControls();
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
    const W = this.scale.width, H = this.scale.height;
    const lines = [
      `// HUD Config  —  ${W}×${H}  scale×${m.toFixed(2)}`,
      '// Font sizes:',
      `sm: Math.max(11, Math.round(W * ${(0.009 * m).toFixed(4)}))`,
      `md: Math.max(13, Math.round(W * ${(0.011 * m).toFixed(4)}))`,
      `lg: Math.max(15, Math.round(W * ${(0.013 * m).toFixed(4)}))`,
      `xl: Math.max(19, Math.round(W * ${(0.016 * m).toFixed(4)}))`,
      '',
      '// Colors:',
      ...Object.entries(C).map(([k, v]) =>
        `  ${k}: ${typeof v === 'string' ? `'${v}'` : `0x${v.toString(16).padStart(6, '0')}`},`
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
