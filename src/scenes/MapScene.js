import Phaser from 'phaser';
import { GameState } from '../GameState.js';

// ── Layout — positions as fractions of (W, H) ─────────────────────────────

const ZONE1_ICONS = [
  {
    icon: 'map_icone_limiar',
    xp: 0.09, yp: 0.19,
    size: 0.20,                   // diameter = 20% of W
    label: 'limiar\nsecreto',
    lxp: 0.09, lyp: 0.36,
  },
  {
    icon: 'map_icone_campo',
    xp: 0.09, yp: 0.76,
    size: 0.20,
    label: 'campo dos\nvagalumes',
    lxp: 0.09, lyp: 0.90,
  },
  {
    icon: 'map_icone_jardim',
    xp: 0.39, yp: 0.74,
    size: 0.18,
    label: 'jardim\ninvertido',
    lxp: 0.39, lyp: 0.88,
  },
];

// Decorative plant/creature icons — size as fraction of W
const DECO_ICONS = [
  { icon: 'map_icone_ventoinha',  xp: 0.20, yp: 0.87, sp: 0.060 },
  { icon: 'map_icone_farfalha',   xp: 0.17, yp: 0.09, sp: 0.055 },
  { icon: 'map_icone_gotateia',   xp: 0.53, yp: 0.86, sp: 0.050 },
  { icon: 'map_icone_trepadeira', xp: 0.04, yp: 0.32, sp: 0.048 },
];

// Portal icons — entry/exit points between zones
const PORTAL_ICONS = [
  { xp: 0.27, yp: 0.42, sp: 0.06 },  // Zone1 → Zone2 passage
  { xp: 0.72, yp: 0.28, sp: 0.06 },  // Zone2 → Zone3 passage
];

// Padlocks — Zone 2 (middle area) and Zone 3 (right area)
const Z2_LOCKS = [
  { xp: 0.38, yp: 0.14 },
  { xp: 0.61, yp: 0.19 },
  { xp: 0.30, yp: 0.49 },
  { xp: 0.61, yp: 0.58 },
];
const Z3_LOCKS = [
  { xp: 0.86, yp: 0.10 },
  { xp: 0.89, yp: 0.44 },
  { xp: 0.83, yp: 0.84 },
];

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this._blockedTimer = null;

    // ── Backgrounds ───────────────────────────────────────────────────────
    if (this.textures.exists('map_fundo01')) {
      this.add.image(0, 0, 'map_fundo01').setOrigin(0).setDisplaySize(W, H).setDepth(0);
    } else {
      this.add.rectangle(0, 0, W, H, 0x2a4a2a).setOrigin(0).setDepth(0);
    }
    if (this.textures.exists('map_fundo02')) {
      this.add.image(0, 0, 'map_fundo02').setOrigin(0).setDisplaySize(W, H).setDepth(1);
    }

    // ── Zone 1 circle icons (always accessible) ───────────────────────────
    ZONE1_ICONS.forEach(area => {
      const x    = W * area.xp;
      const y    = H * area.yp;
      const size = Math.round(W * area.size);

      if (this.textures.exists(area.icon)) {
        const img = this.add.image(x, y, area.icon)
          .setDisplaySize(size, size)
          .setDepth(3)
          .setInteractive({ useHandCursor: true });
        img.on('pointerover', () => this.tweens.add({ targets: img, scale: 1.08, duration: 120 }));
        img.on('pointerout',  () => this.tweens.add({ targets: img, scale: 1.00, duration: 120 }));
        img.on('pointerdown', () => this._enterZone('Zone1'));
      }

      this.add.text(W * area.lxp, H * area.lyp, area.label, {
        fontSize: `${Math.round(W * 0.017)}px`,
        fontFamily: 'Georgia, serif',
        color: '#e8f5e0',
        stroke: '#061006',
        strokeThickness: 3,
        align: 'center',
        lineSpacing: 2,
        fontStyle: 'italic',
      }).setOrigin(0.5, 0).setDepth(4);
    });

    // ── Decorative plant icons ────────────────────────────────────────────
    DECO_ICONS.forEach(({ icon, xp, yp, sp }) => {
      if (!this.textures.exists(icon)) return;
      const s = Math.round(W * sp);
      this.add.image(W * xp, H * yp, icon).setDisplaySize(s, s).setDepth(4);
    });

    // ── Portal icons ──────────────────────────────────────────────────────
    if (this.textures.exists('map_portal')) {
      PORTAL_ICONS.forEach(({ xp, yp, sp }) => {
        const s = Math.round(W * sp);
        this.add.image(W * xp, H * yp, 'map_portal')
          .setDisplaySize(s, s).setDepth(4).setAlpha(0.85);
      });
    }

    // ── Zone 2 ────────────────────────────────────────────────────────────
    this._buildZone('Zone2', Z2_LOCKS, W, H, W * 0.50, H * 0.40, W * 0.42, H * 0.80);

    // ── Zone 3 ────────────────────────────────────────────────────────────
    this._buildZone('Zone3', Z3_LOCKS, W, H, W * 0.87, H * 0.40, W * 0.28, H * 0.80);

    // ── Blocked notice ────────────────────────────────────────────────────
    this._blockedText = this.add.text(W / 2, H - 52, 'Esta zona ainda está bloqueada.', {
      fontSize: `${Math.round(W * 0.016)}px`,
      fontFamily: 'Georgia, serif',
      color: '#ff8080',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#00000099',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setAlpha(0).setDepth(100);

    // ── Close hint ────────────────────────────────────────────────────────
    this.add.text(W / 2, H - 12, 'ESC ou M — voltar ao jogo', {
      fontSize: '11px', fontFamily: 'Georgia, serif', color: '#6a9a6a',
    }).setOrigin(0.5, 1).setDepth(5);

    this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyM   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  _buildZone(key, lockPositions, W, H, hitX, hitY, hitW, hitH) {
    const unlocked = GameState.isZoneUnlocked(key);
    const lockSize = Math.round(W * 0.065);

    if (unlocked) {
      const label = key === 'Zone2' ? 'Zona 2' : 'Zona 3';
      const btn = this.add.text(hitX, hitY - hitH * 0.15, label, {
        fontSize: `${Math.round(W * 0.016)}px`,
        fontFamily: 'Georgia, serif',
        color: '#e8f5e0',
        stroke: '#061006',
        strokeThickness: 3,
        backgroundColor: '#0a201088',
        padding: { x: 12, y: 7 },
        fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => this.tweens.add({ targets: btn, scale: 1.06, duration: 120 }));
      btn.on('pointerout',  () => this.tweens.add({ targets: btn, scale: 1.00, duration: 120 }));
      btn.on('pointerdown', () => this._enterZone(key));
    } else {
      // Always render padlocks — SVG if available, fallback generated texture in BootScene
      lockPositions.forEach(({ xp, yp }) => {
        this.add.image(W * xp, H * yp, 'map_cadeado')
          .setDisplaySize(lockSize, lockSize).setDepth(5);
      });
      const hitZone = this.add.rectangle(hitX, hitY, hitW, hitH, 0, 0)
        .setDepth(6).setInteractive({ useHandCursor: false });
      hitZone.on('pointerdown', () => this._showBlocked());
    }
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) || Phaser.Input.Keyboard.JustDown(this.keyM)) {
      this._returnToGame();
    }
  }

  _showBlocked() {
    if (this._blockedTimer) this._blockedTimer.remove();
    this.tweens.killTweensOf(this._blockedText);
    this._blockedText.setAlpha(1);
    this._blockedTimer = this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: this._blockedText, alpha: 0, duration: 400 });
    });
  }

  _enterZone(key) {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(key);
    });
  }

  _returnToGame() {
    const zone = GameState.currentZone || 'Zone1';
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.scene.isPaused(zone)) {
        this.scene.resume(zone);
        this.scene.stop();
      } else {
        this.scene.start(zone);
      }
    });
  }
}
