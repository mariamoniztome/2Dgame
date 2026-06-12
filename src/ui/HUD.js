import Phaser from 'phaser';
import { ELEMENTS, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';
import { SoundManager } from '../SoundManager.js';

const ESSENTIAL_IDS = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

const C = {
  bg:     0x0d2918,
  panel:  0x142e1e,
  border: 0x88c890,
  dim:    0x4a7d5c,
  accent: 0xffef7a,
  magic:  0xffcb79,
  text:   '#ecffe3',
  label:  '#c8f2bf',
  muted:  '#97ba9f',
};

// Map-image regions (fractions 0–1) for each zone/sub-area
const MAP_ZONE_REGIONS = {
  Zone1: {
    campo:  [0.00, 0.55, 0.25, 1.00],
    jardim: [0.25, 0.55, 0.52, 1.00],
    limiar: [0.00, 0.00, 0.27, 0.52],
  },
  Zone2: [0.28, 0.00, 0.72, 1.00],
  Zone3: [0.72, 0.00, 1.00, 1.00],
};

export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUD', active: false }); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  create() {
    // Persistent state (survives rebuilds)
    if (!this._initialized) {
      this._initialized     = true;
      this._toastQueue      = [];
      this._toastActive     = false;
      this._controlsVisible = false;
    }

    this._slots          = [];
    this._plantDots      = [];
    this._narrativeTimer = null;
    this._lastZone       = null;

    const W = this.scale.width, H = this.scale.height;
    this._buildAll(W, H);

    // Debounced resize — destroy & rebuild all children
    this.scale.on('resize', (gameSize) => {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        if (!this.sys.isActive()) return;
        const queue    = [...(this._toastQueue  || [])];
        const ctrlVis  = this._controlsVisible;
        this.children.removeAll(true);
        this._slots      = [];
        this._plantDots  = [];
        this._ctrlGroup  = [];
        this._toastQueue = queue;
        this._toastActive      = false;
        this._controlsVisible  = ctrlVis;
        this._narrativeTimer   = null;
        this._lastZone         = null;
        this._buildAll(gameSize.width, gameSize.height);
        if (ctrlVis) this._ctrlGroup?.forEach(e => e.setVisible(true));
        this._refresh();
        this._drawMinimapBg(GameState.currentZone || 'Zone1');
      }, 150);
    });

    SoundManager.init(this);

    // Re-register global events (off first to prevent duplicates on rebuild)
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
    this._buildInventory(W, H, fs);
    this._buildMinimap(W, H, fs);

    // Narrative — above minimap panel
    this.narrativeText = this.add.text(W / 2, H - this._mmPH - Math.round(W * 0.009), '', {
      fontSize: fs.md, fontFamily: 'Georgia, serif',
      color: '#f5e6c8', wordWrap: { width: W * 0.30 },
      align: 'center', stroke: '#071410', strokeThickness: 4, lineSpacing: 5,
      backgroundColor: 'rgba(5,14,10,0.82)',
      padding: { x: 20, y: 11 },
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    // Area label — top-center
    this.areaLabel = this.add.text(W / 2, 10, '', {
      fontSize: fs.md, fontFamily: 'Georgia, serif',
      color: '#e8ffd8', stroke: '#071410', strokeThickness: 2, fontStyle: 'italic',
      backgroundColor: 'rgba(5,14,10,0.78)',
      padding: { x: 14, y: 6 },
    }).setOrigin(0.5, 0).setAlpha(0).setDepth(55);

    // Unlock banner — center
    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: fs.lg, fontFamily: 'Georgia, serif',
      color: '#e8c96a', stroke: '#0D351E', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // Help hint — top-left
    this.add.text(12, 10, '[H] ajuda', {
      fontSize: fs.md, fontFamily: 'monospace', color: '#eefedd',
      stroke: '#0a2010', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(55);

    this._buildControlsPanel(W, H, fs);

    this.input.keyboard.on('keydown-H', () => this._toggleControls());
  }

  // Font sizes relative to W
  _fs(W) {
    return {
      sm:  `${Math.max(9,  Math.round(W * 0.0057))}px`,
      md:  `${Math.max(11, Math.round(W * 0.0073))}px`,
      lg:  `${Math.max(15, Math.round(W * 0.0104))}px`,
      xl:  `${Math.max(18, Math.round(W * 0.0130))}px`,
    };
  }

  // ── Spell panel (top-right) ───────────────────────────────────────────────
  _buildSpellPanel(W, H, fs) {
    const pw   = Math.round(W * 0.148);
    const ph   = Math.round(W * 0.052);
    const x    = W - 10, y = 10;
    const iconS = Math.round(W * 0.024);
    const icoX  = x - pw + Math.round(W * 0.022);
    const icoY  = y + Math.round(ph * 0.64);

    this.add.rectangle(x, y, pw, ph, C.bg, 0.82)
      .setOrigin(1, 0).setStrokeStyle(1.5, C.border, 0.80).setDepth(50);
    this.add.text(x - pw + 14, y + Math.round(ph * 0.10), 'FEITIÇO', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.label,
    }).setDepth(55);
    this.add.text(x - 14, y + Math.round(ph * 0.10), '[Q] mudar · [F] lançar', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.muted,
    }).setOrigin(1, 0).setDepth(55);
    this.add.rectangle(x - pw + 10, y + Math.round(ph * 0.37), pw - 20, 1, C.border, 0.35)
      .setOrigin(0, 0.5).setDepth(55);

    this.spellGfx = this.add.image(icoX, icoY, 'spell_brisa')
      .setDisplaySize(iconS, iconS).setAlpha(0.6).setDepth(55);
    this.spellName = this.add.text(icoX + iconS * 0.7, icoY, 'nenhum', {
      fontSize: fs.lg, fontFamily: 'Georgia, serif',
      color: '#ffffff', fontStyle: 'italic',
    }).setOrigin(0, 0.5).setDepth(55);
  }

  // ── Inventory (bottom-left) ───────────────────────────────────────────────
  _buildInventory(W, H, fs) {
    const iw       = Math.round(W * 0.158);
    const ih       = Math.round(W * 0.056);
    const slotS    = Math.round(W * 0.019);
    const iconS    = Math.round(W * 0.013);
    const spacing  = Math.round(W * 0.0237);
    const firstX   = 10 + Math.round(spacing * 0.4);
    const slotY    = H - Math.round(ih * 0.40);

    this.add.rectangle(10, H - 10, iw, ih, C.bg, 0.82)
      .setOrigin(0, 1).setStrokeStyle(1.5, C.border, 0.80).setDepth(50);
    this.add.text(firstX, H - ih - 2, 'PLANTAS', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.label,
    }).setDepth(55);
    this.inventoryCount = this.add.text(iw - 6, H - ih - 2, '0/6', {
      fontSize: fs.sm, fontFamily: 'monospace', color: '#fff8b4',
    }).setOrigin(1, 0).setDepth(55);

    for (let i = 0; i < 6; i++) {
      const sx = firstX + i * spacing;
      const bg   = this.add.rectangle(sx, slotY, slotS, slotS, C.panel, 0.85)
        .setStrokeStyle(1.2, C.border, 0.55).setDepth(50);
      const icon = this.add.image(sx, slotY, 'plant_missing')
        .setDisplaySize(iconS, iconS).setAlpha(0).setDepth(56);
      const fake = this.add.text(sx, slotY, '?', {
        fontSize: fs.sm, fontFamily: 'monospace', color: '#b28cbf',
      }).setOrigin(0.5).setAlpha(0).setDepth(57);
      this._slots.push({ bg, icon, fake });
    }
  }

  // ── Minimap (bottom-right) ────────────────────────────────────────────────
  _buildMinimap(W, H, fs) {
    const MMW  = Math.round(W * 0.096);
    const MMH  = Math.round(MMW * 9 / 16);
    const MMPW = MMW + Math.round(W * 0.013);
    const MMPH = MMH + Math.round(W * 0.016);
    this._mmPH = MMPH;

    const px  = W - 10, py = H - 10;
    const mmX = px - MMPW + Math.round(W * 0.007);
    const mmY = py - MMPH + Math.round(W * 0.007);
    this._mmX = mmX;
    this._mmY = mmY;
    this._mmW = MMW;
    this._mmH = MMH;

    // Panel background
    this.add.rectangle(px, py, MMPW, MMPH, C.bg, 0.82)
      .setOrigin(1, 1).setStrokeStyle(1.5, C.border, 0.80).setDepth(50);

    // Labels
    this.add.text(mmX, py - MMPH + 6, 'MAPA', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.label,
    }).setDepth(55);
    this.add.text(mmX + MMW, py - MMPH + 6, '[M]', {
      fontSize: fs.sm, fontFamily: 'monospace', color: C.muted,
    }).setOrigin(1, 0).setDepth(55);

    // Map imagery
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

    // Graphics layer (plant dots)
    this.mmGfx = this.add.graphics().setDepth(60);

    // Player dot
    this.mmDot = this.add.circle(
      mmX + MMW / 2, mmY + MMH / 2,
      Math.max(3, Math.round(W * 0.0025)), C.accent, 1
    ).setDepth(62).setStrokeStyle(1.2, 0x0D351E, 0.9);

    // Border
    this.add.rectangle(mmX, mmY, MMW, MMH, 0, 0)
      .setOrigin(0, 0).setStrokeStyle(1.6, C.border, 0.8).setDepth(63);

    // Zone name below map
    this.mmZoneLabel = this.add.text(mmX + MMW / 2, mmY + MMH + 4, '', {
      fontSize: fs.sm, fontFamily: 'Georgia, serif', color: C.text, fontStyle: 'italic',
    }).setOrigin(0.5, 0).setDepth(62);

    this._drawMinimapBg('Zone1');
  }

  // ── Controls panel (H toggle) ─────────────────────────────────────────────
  _buildControlsPanel(W, H, fs) {
    const cx = W / 2, cy = H / 2;
    const pw = Math.round(W * 0.194), ph = Math.round(H * 0.28);
    const p = this.add.rectangle(cx, cy, pw, ph, C.bg, 0.92)
      .setStrokeStyle(1.5, C.border, 0.85).setDepth(300).setVisible(false);
    const txt = this.add.text(cx, cy - ph * 0.42,
      'CONTROLOS\n\n' +
      'WASD / Setas    Mover\n' +
      'Shift                  Correr\n' +
      'C                        Apanhar / Interagir\n' +
      'F                         Lançar feitiço\n' +
      'Q                        Mudar feitiço\n' +
      'M                        Mapa do jardim\n' +
      'H                        Fechar ajuda', {
        fontSize: fs.md, fontFamily: 'monospace',
        color: C.text, align: 'left', lineSpacing: 7,
      }).setOrigin(0.5, 0).setDepth(301).setVisible(false);
    const close = this.add.text(cx, cy + ph * 0.42, 'Prima H ou ESC para fechar', {
      fontSize: fs.sm, fontFamily: 'Georgia, serif', color: '#e8c96a', fontStyle: 'italic',
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
    this._ctrlGroup?.forEach(e => e.setVisible(this._controlsVisible));
  }

  // ── Minimap internals ─────────────────────────────────────────────────────
  _worldToMinimap(zone, x, y) {
    const mmX  = this._mmX, mmY = this._mmY;
    const MMW  = this._mmW, MMH = this._mmH;
    const ZW   = this.game.registry.get('debugZoneW')  ?? 1920;
    const ZH   = this.game.registry.get('debugZoneH')  ?? 1080;
    const TH   = this.game.registry.get('debugTransH') ?? 400;

    let rx0, ry0, rx1, ry1;

    if (zone === 'Zone1' || !zone) {
      let subArea, lx, ly;
      if (x >= ZW) {
        subArea = MAP_ZONE_REGIONS.Zone1.jardim;
        lx = x - ZW; ly = y;
      } else if (y < -TH) {
        // Limiar Secreto — remap y from -(ZH+TH)..−TH → 0..ZH
        subArea = MAP_ZONE_REGIONS.Zone1.limiar;
        lx = x; ly = -(y + TH);
      } else if (y < 0) {
        // Transição Parede — show in limiar region of minimap (lower part)
        subArea = MAP_ZONE_REGIONS.Zone1.limiar;
        lx = x; ly = TH - (-y);  // 0 at bottom of trans, TH at top
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
  _refresh() { this._refreshInventory(); this._refreshSpell(); this._updateCauldronDots(); }

  _refreshInventory() {
    this.inventoryCount?.setText(`${GameState.inventory.length}/6`);
    this._slots.forEach((s, i) => {
      const plant = GameState.inventory[i];
      if (plant) {
        const el  = ELEMENTS[plant.element] || ELEMENTS.EARTH;
        const col = plant.isFake ? 0x886688 : el.color;
        const key = this.textures.exists(`plant_${plant.id}`) ? `plant_${plant.id}` : 'plant_missing';
        s.icon.setTexture(key).setAlpha(0.98).setTint(0xffffff).setScale(1);
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
      this.spellGfx?.setTexture(spell.textureKey).setAlpha(0.9);
      this.spellName?.setText(spell.name).setColor('#ffffff');
    } else {
      this.spellGfx?.setAlpha(0.3);
      this.spellName?.setText('nenhum').setColor('#a0b890');
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
}
