import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ELEMENTS } from '../config.js';
import { SPELLS } from '../data/spells.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';

export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUD', active: false }); }

  create() {
    const W = GAME_WIDTH, H = GAME_HEIGHT;

    this._slots = [];
    this._spellIcons = [];
    this._narrativeTimer = null;

    // ── Bottom-left: Mochila ─────────────────────────────────────────────
    this.add.rectangle(8, H - 8, 220, 78, 0x080810, 0.72)
      .setOrigin(0, 1).setStrokeStyle(1, 0x5b21b6, 0.6);
    this.add.text(18, H - 78, '🎒 Mochila', {
      fontSize: '12px', fontFamily: 'Georgia, serif', color: '#9575cd',
    });

    for (let i = 0; i < 6; i++) {
      const sx = 20 + i * 34;
      const sy = H - 44;
      const bg = this.add.rectangle(sx, sy, 28, 28, 0x120c24, 0.85)
        .setStrokeStyle(1, 0x3d2b7a, 0.7);
      const icon = this.add.circle(sx, sy, 10, 0x3d2b7a, 0).setAlpha(0);
      const fake = this.add.text(sx, sy, '?', {
        fontSize: '11px', fontFamily: 'monospace', color: '#888888',
      }).setOrigin(0.5).setAlpha(0);
      this._slots.push({ bg, icon, fake, sx, sy });
    }

    // ── Top-left: Active spell plants ─────────────────────────────────────
    this.add.rectangle(8, 8, 120, 64, 0x080810, 0.72)
      .setOrigin(0, 0).setStrokeStyle(1, 0x5b21b6, 0.6);
    this.add.text(18, 12, 'Feitiço ativo', {
      fontSize: '11px', fontFamily: 'Georgia, serif', color: '#9575cd',
    });
    this.spellPlant1 = this.add.circle(34, 44, 12, 0x1a1a2e, 0.85)
      .setStrokeStyle(1, 0x3d2b7a, 0.7);
    this.spellPlant2 = this.add.circle(74, 44, 12, 0x1a1a2e, 0.85)
      .setStrokeStyle(1, 0x3d2b7a, 0.7);
    this.spellLabel = this.add.text(54, 58, '—', {
      fontSize: '10px', fontFamily: 'Georgia, serif', color: '#888888',
    }).setOrigin(0.5, 0);

    // ── Top-right: Spell icon ─────────────────────────────────────────────
    this.add.rectangle(W - 8, 8, 110, 64, 0x080810, 0.72)
      .setOrigin(1, 0).setStrokeStyle(1, 0x5b21b6, 0.6);
    this.add.text(W - 114, 12, 'Espaço', {
      fontSize: '11px', fontFamily: 'Georgia, serif', color: '#9575cd',
    });
    this.spellGfx = this.add.image(W - 63, 40, 'spell_brisa')
      .setDisplaySize(36, 36).setAlpha(0.3);
    this.spellName = this.add.text(W - 63, 62, '—', {
      fontSize: '10px', fontFamily: 'Georgia, serif', color: '#888888',
    }).setOrigin(0.5, 0);

    // ── Bottom-right: Caldeirão pulse ─────────────────────────────────────
    this.add.rectangle(W - 8, H - 8, 72, 72, 0x080810, 0.72)
      .setOrigin(1, 1).setStrokeStyle(1, 0x5b21b6, 0.6);
    this.cauldronImg = this.add.image(W - 44, H - 44, 'cauldron').setDisplaySize(42, 42);
    this.pulseRing = this.add.circle(W - 44, H - 44, 22, 0x4caf50, 0.25);
    this.pulseTween = this.tweens.add({
      targets: this.pulseRing,
      scale: { from: 1, to: 1.5 },
      alpha: { from: 0.25, to: 0 },
      duration: 2000,
      repeat: -1,
      ease: 'Power2.easeOut',
    });

    // ── Narrative strip (bottom center) ──────────────────────────────────
    this.narrativePanel = this.add.rectangle(W / 2, H - 18, 720, 60, 0x080810, 0)
      .setOrigin(0.5, 1);
    this.narrativeText = this.add.text(W / 2, H - 14, '', {
      fontSize: '16px',
      fontFamily: 'Georgia, serif',
      color: '#f5e6c8',
      wordWrap: { width: 700 },
      align: 'center',
      stroke: '#080810',
      strokeThickness: 3,
      lineSpacing: 4,
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    // ── Spell unlock banner ───────────────────────────────────────────────
    this.unlockBanner = this.add.text(W / 2, H / 2, '', {
      fontSize: '20px',
      fontFamily: 'Georgia, serif',
      color: '#ce93d8',
      stroke: '#1a1a2e',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // ── Area label ────────────────────────────────────────────────────────
    this.areaLabel = this.add.text(W / 2, 18, '', {
      fontSize: '14px',
      fontFamily: 'Georgia, serif',
      color: '#d0e8f0',
      stroke: '#080810',
      strokeThickness: 2,
      fontStyle: 'italic',
    }).setOrigin(0.5).setAlpha(0.8).setDepth(50);

    // ── Global event listeners ────────────────────────────────────────────
    this.game.events.on('plantCollected', this._onPlantCollected, this);
    this.game.events.on('plantStolen',    this._onPlantStolen,    this);
    this.game.events.on('spellCast',      this._onSpellCast,      this);
    this.game.events.on('showNarrative',  this._showNarrative,    this);
    this.game.events.on('spellUnlocked',  this._showUnlock,       this);
    this.game.events.on('areaChanged',    this._updateArea,       this);

    this._refresh();
  }

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
        const col = plant.isFake ? 0x888888 : el.color;
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
      this.spellGfx.setTexture(spell.textureKey).setAlpha(1);
      this.spellName.setText(spell.name).setColor('#f5e6c8');

      const p = spell.plants || [];
      const c1 = p[0] ? (ELEMENTS[PLANTS[p[0]]?.element]?.color ?? 0xffffff) : 0x1a1a2e;
      const c2 = p[1] ? (ELEMENTS[PLANTS[p[1]]?.element]?.color ?? 0xffffff) : 0x1a1a2e;
      this.spellPlant1.setFillStyle(c1, p[0] ? 0.85 : 0.2);
      this.spellPlant2.setFillStyle(c2, p[1] ? 0.85 : 0.2);
      this.spellLabel.setText(spell.name).setColor('#d0e8f0');
    } else {
      this.spellGfx.setAlpha(0.25);
      this.spellName.setText('—').setColor('#888888');
      this.spellLabel.setText('—').setColor('#888888');
      this.spellPlant1.setFillStyle(0x1a1a2e, 0.85);
      this.spellPlant2.setFillStyle(0x1a1a2e, 0.85);
    }
  }

  _refreshCauldron() {
    const p = GameState.cauldronProgress();
    const speed = Math.max(400, 2000 - p * 1600);
    this.pulseTween.timeScale = 2000 / speed;
    const hue = 0.35 + p * 0.5;
    const rgb = Phaser.Display.Color.HSVToRGB(hue, 0.8, 0.9);
    this.pulseRing.setFillStyle(
      Phaser.Display.Color.GetColor(rgb.r, rgb.g, rgb.b), 0.3
    );
  }

  _onPlantCollected() {
    this._refresh();
    if (GameState.spellJustUnlocked) {
      const spell = SPELLS[GameState.spellJustUnlocked];
      this._showUnlock(`✨ Feitiço desbloqueado!\n${spell.name}`);
      GameState.spellJustUnlocked = null;
    }
  }

  _onPlantStolen(plant) {
    this._refresh();
    this._showNarrative(`A criatura roubou a ${plant.name}! Usa um portal para recuperar.`);
  }

  _onSpellCast(spellId) {
    this._refreshSpell();
    const s = this.spellGfx;
    this.tweens.add({
      targets: s,
      scale: { from: 1, to: 1.4 },
      duration: 200,
      yoyo: true,
    });
  }

  _showNarrative(text, duration = 4000) {
    if (this._narrativeTimer) this._narrativeTimer.remove();
    this.tweens.killTweensOf(this.narrativeText);
    this.narrativePanel.setFillStyle(0x080810, 0.65);
    this.narrativeText.setText(text);
    this.tweens.add({
      targets: this.narrativeText,
      alpha: 1,
      duration: 300,
      onComplete: () => {
        this._narrativeTimer = this.time.delayedCall(duration, () => {
          this.tweens.add({
            targets: [this.narrativeText, this.narrativePanel],
            alpha: 0,
            duration: 500,
          });
        });
      },
    });
  }

  _showUnlock(msg) {
    this.unlockBanner.setText(msg).setAlpha(0).setY(GAME_HEIGHT / 2);
    this.tweens.add({
      targets: this.unlockBanner,
      alpha: 1,
      y: GAME_HEIGHT / 2 - 10,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(2500, () => {
          this.tweens.add({ targets: this.unlockBanner, alpha: 0, duration: 500 });
        });
      },
    });
  }

  _updateArea(name) {
    this.areaLabel.setText(name);
    this.tweens.add({
      targets: this.areaLabel,
      alpha: { from: 1, to: 0.75 },
      duration: 1500,
    });
  }
}
