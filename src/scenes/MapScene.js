import Phaser from 'phaser';
import { GameState } from '../GameState.js';

// ── Layout — all positions as fractions of (W, H) ─────────────────────────
// Derived from the reference design image (1440 × 800 reference frame)

const ZONE1_ICONS = [
  {
    icon: 'map_icone_limiar',
    xp: 0.09, yp: 0.19,            // circle centre
    size: 0.14,                     // diameter as fraction of W
    label: 'limiar\nsecreto',
    lxp: 0.09, lyp: 0.37,
  },
  {
    icon: 'map_icone_campo',
    xp: 0.09, yp: 0.78,
    size: 0.14,
    label: 'campo dos\nvagalumes',
    lxp: 0.09, lyp: 0.91,
  },
  {
    icon: 'map_icone_jardim',
    xp: 0.39, yp: 0.76,
    size: 0.13,
    label: 'jardim\ninvertido',
    lxp: 0.39, lyp: 0.90,
  },
];

// Small plant/creature decorations on the map
const DECO_ICONS = [
  { icon: 'map_icone_ventoinha',  xp: 0.18, yp: 0.88, sizePx: 52 },
  { icon: 'map_icone_farfalha',   xp: 0.16, yp: 0.10, sizePx: 44 },
  { icon: 'map_icone_gotateia',   xp: 0.52, yp: 0.87, sizePx: 38 },
  { icon: 'map_icone_trepadeira', xp: 0.04, yp: 0.30, sizePx: 38 },
];

// Padlock positions for Zone 2 (middle area)
const Z2_LOCKS = [
  { xp: 0.38, yp: 0.14 },
  { xp: 0.61, yp: 0.19 },
  { xp: 0.30, yp: 0.49 },
  { xp: 0.61, yp: 0.58 },
];

// Padlock positions for Zone 3 (right area)
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

    // ── Zone 1 — always accessible ────────────────────────────────────────
    ZONE1_ICONS.forEach(area => {
      const x    = W * area.xp;
      const y    = H * area.yp;
      const size = W * area.size;

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
        fontSize: `${Math.round(W * 0.012)}px`,
        fontFamily: 'Georgia, serif',
        color: '#e8f5e0',
        stroke: '#061006',
        strokeThickness: 3,
        align: 'center',
        lineSpacing: 2,
        fontStyle: 'italic',
      }).setOrigin(0.5, 0).setDepth(4);
    });

    // ── Decorative plant icons ─────────────────────────────────────────────
    DECO_ICONS.forEach(({ icon, xp, yp, sizePx }) => {
      if (!this.textures.exists(icon)) return;
      this.add.image(W * xp, H * yp, icon).setDisplaySize(sizePx, sizePx).setDepth(4);
    });

    // ── Zone 2 ────────────────────────────────────────────────────────────
    this._buildZone('Zone2', Z2_LOCKS, W, H, W * 0.50, H * 0.40, W * 0.42, H * 0.80);

    // ── Zone 3 ────────────────────────────────────────────────────────────
    this._buildZone('Zone3', Z3_LOCKS, W, H, W * 0.87, H * 0.40, W * 0.28, H * 0.80);

    // ── Blocked notice ────────────────────────────────────────────────────
    this._blockedText = this.add.text(W / 2, H - 52, 'Esta zona ainda está bloqueada.', {
      fontSize: `${Math.round(W * 0.013)}px`,
      fontFamily: 'Georgia, serif',
      color: '#ff8080',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#00000099',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setAlpha(0).setDepth(100);

    // ── Close hint ────────────────────────────────────────────────────────
    this.add.text(W / 2, H - 14, 'ESC ou M — voltar ao jogo', {
      fontSize: '11px', fontFamily: 'Georgia, serif', color: '#6a9a6a',
    }).setOrigin(0.5, 1).setDepth(5);

    // ── Keys ──────────────────────────────────────────────────────────────
    this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyM   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  _buildZone(key, lockPositions, W, H, hitX, hitY, hitW, hitH) {
    const unlocked = GameState.isZoneUnlocked(key);

    if (unlocked) {
      const label = key === 'Zone2' ? 'Zona 2' : 'Zona 3';
      const btn = this.add.text(hitX, hitY - hitH * 0.15, label, {
        fontSize: `${Math.round(W * 0.013)}px`,
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
      const lockSize = Math.round(W * 0.043);
      lockPositions.forEach(({ xp, yp }) => {
        if (this.textures.exists('map_cadeado')) {
          this.add.image(W * xp, H * yp, 'map_cadeado')
            .setDisplaySize(lockSize, lockSize).setDepth(5);
        }
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
