import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ELEMENTS, WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';

// Area colour strips per zone for the minimap
const ZONE_AREAS = {
  Zone1: [
    { color: 0x1b5e20, from: 0,       to: 1100  },
    { color: 0x33691e, from: 1100,    to: 2200  },
    { color: 0x1a237e, from: 2200,    to: 3200  },
  ],
  Zone2: [
    { color: 0x0d2a18, from: 0,       to: 900   },
    { color: 0x1b3a20, from: 900,     to: 1800  },
    { color: 0x33691e, from: 1800,    to: 2500  },
    { color: 0x2e1503, from: 2500,    to: 3200  },
  ],
  Zone3: [
    { color: 0x0d0014, from: 0,       to: 1200  },
    { color: 0x1a0a2e, from: 1200,    to: 2400  },
    { color: 0x0a1018, from: 2400,    to: 3200  },
  ],
};

const MM_W = 220; // minimap width (px)
const MM_H = 28;  // minimap height (px)
const MM_X = (GAME_WIDTH - MM_W) / 2;
const MM_Y = 8;

export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUD', active: false }); }

  create() {
    const W = GAME_WIDTH, H = GAME_HEIGHT;

    this._slots = [];
    this._narrativeTimer = null;
    this._lastZone = null;

    // ── Bottom-left: Mochila ─────────────────────────────────────────────
    this.add.rectangle(8, H - 8, 224, 82, 0x080810, 0.75)
      .setOrigin(0, 1).setStrokeStyle(1, 0x5b21b6, 0.5);
    this.add.text(18, H - 82, 'MOCHILA', {
      fontSize: '11px', fontFamily: 'monospace', color: '#7c5cbf',
    });
    for (let i = 0; i < 6; i++) {
      const sx = 20 + i * 34, sy = H - 44;
      const bg = this.add.rectangle(sx, sy, 28, 28, 0x120c24, 0.9)
        .setStrokeStyle(1, 0x3d2b7a, 0.7);
      const icon = this.add.circle(sx, sy, 10, 0x3d2b7a, 0).setAlpha(0);
      const fake = this.add.text(sx, sy, '?', {
        fontSize: '11px', fontFamily: 'monospace', color: '#886688',
      }).setOrigin(0.5).setAlpha(0);
      this._slots.push({ bg, icon, fake, sx, sy });
    }

    // ── Top-left: Active spell plants ─────────────────────────────────────
    this.add.rectangle(8, 8, 128, 62, 0x080810, 0.75)
      .setOrigin(0, 0).setStrokeStyle(1, 0x5b21b6, 0.5);
    this.add.text(18, 12, 'FEITICO ATIVO', {
      fontSize: '10px', fontFamily: 'monospace', color: '#7c5cbf',
    });
    this.spellPlant1 = this.add.circle(36, 42, 13, 0x1a1a2e, 0.9)
      .setStrokeStyle(1, 0x3d2b7a, 0.7);
    this.spellPlant2 = this.add.circle(76, 42, 13, 0x1a1a2e, 0.9)
      .setStrokeStyle(1, 0x3d2b7a, 0.7);
    this.spellLabel = this.add.text(56, 58, '—', {
      fontSize: '10px', fontFamily: 'monospace', color: '#666688',
    }).setOrigin(0.5, 0);

    // ── Top-right: Spell cast ─────────────────────────────────────────────
    this.add.rectangle(W - 8, 8, 114, 62, 0x080810, 0.75)
      .setOrigin(1, 0).setStrokeStyle(1, 0x5b21b6, 0.5);
    this.add.text(W - 118, 12, 'ESPACO', {
      fontSize: '10px', fontFamily: 'monospace', color: '#7c5cbf',
    });
    this.spellGfx = this.add.image(W - 65, 38, 'spell_brisa')
      .setDisplaySize(34, 34).setAlpha(0.3);
    this.spellName = this.add.text(W - 65, 60, '—', {
      fontSize: '10px', fontFamily: 'monospace', color: '#666688',
    }).setOrigin(0.5, 0);

    // ── Bottom-right: Caldeirão pulse ─────────────────────────────────────
    this.add.rectangle(W - 8, H - 8, 72, 72, 0x080810, 0.75)
      .setOrigin(1, 1).setStrokeStyle(1, 0x5b21b6, 0.5);
    this.cauldronImg = this.add.image(W - 44, H - 44, 'cauldron').setDisplaySize(40, 40);
    this.pulseRing = this.add.circle(W - 44, H - 44, 22, 0x4caf50, 0.2);
    this.pulseTween = this.tweens.add({
      targets: this.pulseRing,
      scale: { from: 1, to: 1.6 },
      alpha: { from: 0.2, to: 0 },
      duration: 2000, repeat: -1, ease: 'Power2.easeOut',
    });

    // ── Minimap (top-centre) ──────────────────────────────────────────────
    this.add.rectangle(MM_X - 2, MM_Y - 2, MM_W + 4, MM_H + 4, 0x080810, 0.8)
      .setOrigin(0, 0).setStrokeStyle(1, 0x5b21b6, 0.5);

    // Graphics object for the minimap fill (redrawn when zone changes)
    this.mmGfx = this.add.graphics();
    // Player dot (updated every frame)
    this.mmDot = this.add.circle(MM_X, MM_Y + MM_H / 2, 3, 0xffffff, 1).setDepth(60);
    // Border
    this.add.rectangle(MM_X, MM_Y, MM_W, MM_H, 0x000000, 0)
      .setOrigin(0, 0).setStrokeStyle(1, 0x9575cd, 0.4).setDepth(61);

    this._drawMinimapBg('Zone1');

    // ── Narrative strip (bottom-centre) ──────────────────────────────────
    this.narrativePanel = this.add.rectangle(W / 2, H - 16, 740, 64, 0x080810, 0)
      .setOrigin(0.5, 1);
    this.narrativeText = this.add.text(W / 2, H - 12, '', {
      fontSize: '16px', fontFamily: 'Georgia, serif',
      color: '#f5e6c8', wordWrap: { width: 720 },
      align: 'center', stroke: '#080810', strokeThickness: 3,
      lineSpacing: 4,
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    // ── Spell unlock banner ───────────────────────────────────────────────
    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: '20px', fontFamily: 'Georgia, serif',
      color: '#ce93d8', stroke: '#080810', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // ── Area label (top-centre, below minimap) ────────────────────────────
    this.areaLabel = this.add.text(W / 2, MM_Y + MM_H + 10, '', {
      fontSize: '13px', fontFamily: 'Georgia, serif',
      color: '#c8dde8', stroke: '#080810', strokeThickness: 2, fontStyle: 'italic',
    }).setOrigin(0.5, 0).setAlpha(0.85).setDepth(50);

    // ── Controls hint (shown on Zone1 start, fades after 10s) ────────────
    this._buildControlsHint(W, H);

    // ── Global event listeners ────────────────────────────────────────────
    this.game.events.on('plantCollected', this._onPlantCollected, this);
    this.game.events.on('plantStolen',    this._onPlantStolen,    this);
    this.game.events.on('spellCast',      this._onSpellCast,      this);
    this.game.events.on('showNarrative',  this._showNarrative,    this);
    this.game.events.on('spellUnlocked',  this._showUnlock,       this);
    this.game.events.on('areaChanged',    this._updateArea,       this);

    this._refresh();
  }

  _buildControlsHint(W, H) {
    const cx = W / 2, cy = H / 2;
    this.controlsPanel = this.add.rectangle(cx, cy, 340, 220, 0x080810, 0.88)
      .setStrokeStyle(1, 0x5b21b6, 0.7).setDepth(300);
    this.controlsText = this.add.text(cx, cy - 80,
      'CONTROLOS\n\n' +
      'WASD / Setas   Mover\n' +
      'Shift               Correr\n' +
      'E                     Interagir / Apanhar\n' +
      'Espaco           Lancar feitico\n' +
      'Q                     Mudar feitico\n' +
      '↑ junto trepadeira   Subir', {
        fontSize: '14px', fontFamily: 'monospace',
        color: '#d0c8f0', align: 'left', lineSpacing: 6,
      }
    ).setOrigin(0.5, 0).setDepth(301);

    const dismiss = this.add.text(cx, cy + 90, 'Clica ou prime qualquer tecla para fechar', {
      fontSize: '12px', fontFamily: 'Georgia, serif', color: '#9575cd', fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(301);

    this.tweens.add({
      targets: dismiss, alpha: { from: 0.5, to: 1 },
      duration: 900, yoyo: true, repeat: -1,
    });

    const hideControls = () => {
      this.tweens.add({
        targets: [this.controlsPanel, this.controlsText, dismiss],
        alpha: 0, duration: 500,
        onComplete: () => {
          this.controlsPanel.setVisible(false);
          this.controlsText.setVisible(false);
          dismiss.setVisible(false);
        },
      });
    };

    this.time.delayedCall(12000, hideControls);
    this.input.once('pointerdown', hideControls);
    this.input.keyboard.once('keydown', hideControls);
  }

  // ── Minimap ─────────────────────────────────────────────────────────────
  _drawMinimapBg(zone) {
    this._lastZone = zone;
    const areas = ZONE_AREAS[zone] || ZONE_AREAS.Zone1;
    this.mmGfx.clear();
    areas.forEach(a => {
      const x = MM_X + (a.from / WORLD_WIDTH) * MM_W;
      const w = ((a.to - a.from) / WORLD_WIDTH) * MM_W;
      this.mmGfx.fillStyle(a.color, 1);
      this.mmGfx.fillRect(x, MM_Y, w, MM_H);
    });
    this.mmGfx.setDepth(58);
  }

  _updateMinimap() {
    const zone = GameState.currentZone;
    if (zone !== this._lastZone && ZONE_AREAS[zone]) {
      this._drawMinimapBg(zone);
    }
    const px = GameState.playerX;
    const dotX = MM_X + (px / WORLD_WIDTH) * MM_W;
    const dotY = MM_Y + MM_H / 2;
    this.mmDot.setPosition(dotX, dotY);
  }

  // ── Per-frame update ────────────────────────────────────────────────────
  update() {
    this._updateMinimap();
  }

  // ── Refresh helpers ─────────────────────────────────────────────────────
  _refresh() {
    this._refreshInventory();
    this._refreshSpell();
    this._refreshCauldron();
  }

  _refreshInventory() {
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

  _refreshCauldron() {
    const p = GameState.cauldronProgress();
    this.pulseTween.timeScale = Math.max(0.5, 1 + p * 2.5);
    const hue = 0.35 + p * 0.5;
    const rgb = Phaser.Display.Color.HSVToRGB(hue, 0.8, 0.9);
    this.pulseRing.setFillStyle(
      Phaser.Display.Color.GetColor(rgb.r, rgb.g, rgb.b), 0.3
    );
  }

  // ── Event handlers ───────────────────────────────────────────────────────
  _onPlantCollected() {
    this._refresh();
    if (GameState.spellJustUnlocked) {
      const spell = SPELLS[GameState.spellJustUnlocked];
      this._showUnlock(`Feitico desbloqueado!\n${spell.name}`);
      GameState.spellJustUnlocked = null;
    }
  }

  _onPlantStolen()  { this._refreshInventory(); }
  _onSpellCast()    { this._refreshSpell(); this.tweens.add({ targets: this.spellGfx, scale: { from: 1, to: 1.4 }, duration: 180, yoyo: true }); }

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
