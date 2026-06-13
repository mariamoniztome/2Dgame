import Phaser from 'phaser';

export class Portal extends Phaser.GameObjects.Container {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);
    this.portalId    = opts.portalId    || 'portal_unknown';
    this.destination = opts.destination || null;
    this.isLocked    = opts.locked !== false;

    // Portal image — no rotation, static
    this.ring = scene.add.image(0, 0, 'portal').setDisplaySize(160, 160).setAlpha(this.isLocked ? 0.45 : 0.85);

    // Inner glow — radius matches portal image (160px → half = 80px)
    this.glow = scene.add.circle(0, 0, 62, 0x7bc67e, 0.35);

    // Lock indicator
    this.lockText = scene.add.text(0, -72, '🔒', {
      fontSize: '20px',
    }).setOrigin(0.5).setVisible(this.isLocked);

    // Hint
    this.hintText = scene.add.text(0, 66, 'C — Abrir portal', {
      fontSize: '12px',
      fontFamily: "'Red Hat Text', sans-serif",
      color: '#d8f5d0',
      stroke: '#061006',
      strokeThickness: 3,
      backgroundColor: 'rgba(5,14,10,0.75)',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setAlpha(0);

    this.add([this.ring, this.glow, this.lockText, this.hintText]);
    scene.add.existing(this);
    this.setDepth(4);

    // Soft pulse on the glow only (no rotation)
    this._glowTween = scene.tweens.add({
      targets: this.glow,
      scale: { from: 1, to: 1.5 },
      alpha: { from: 0.35, to: 0 },
      duration: 2000,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  unlock() {
    this.isLocked = false;
    this.lockText.setVisible(false);
    this.ring.setAlpha(0.85);
    this.glow.setFillStyle(0x7bc67e, 0.6);

    this.scene.tweens.add({
      targets: this,
      scale: { from: 0.85, to: 1.1 },
      duration: 320,
      yoyo: true,
    });
  }

  showHint(show) {
    this.scene.tweens.add({
      targets: this.hintText,
      alpha: show ? 1 : 0,
      duration: 180,
    });
  }

  // t = 0 (far) to 1 (contact) — speeds up glow pulse proportionally
  setProximity(t) {
    if (this._glowTween) {
      this._glowTween.timeScale = 1 + t * 2.5;
    }
    // Brighten ring slightly as player approaches
    const alpha = this.isLocked ? 0.45 + t * 0.2 : 0.85 + t * 0.12;
    this.ring.setAlpha(Math.min(1, alpha));
  }

  showDebug(show) {
    if (show) {
      if (this._dbGfx?.active) return;

      this._dbGfx = this.scene.add.graphics().setDepth(999);
      // Interaction radius circle (65px — matches Zone1Scene _checkPortalProximity)
      this._dbGfx.lineStyle(1.5, 0x00ffff, 0.75);
      this._dbGfx.strokeCircle(this.x, this.y, 65);
      // Outer approach circle (200px — proximity glow starts here)
      this._dbGfx.lineStyle(1, 0x00ffff, 0.25);
      this._dbGfx.strokeCircle(this.x, this.y, 200);
      // Origin cross
      this._dbGfx.lineStyle(1, 0xffffff, 0.5);
      this._dbGfx.lineBetween(this.x - 14, this.y, this.x + 14, this.y);
      this._dbGfx.lineBetween(this.x, this.y - 14, this.x, this.y + 14);

      const stateStr = this.isLocked ? '🔒 BLOQUEADO' : '✓ ATIVO';
      const col      = this.isLocked ? '#ff5555' : '#55ff88';
      this._dbLabel = this.scene.add.text(this.x, this.y - 108,
        `${this.portalId}\n→ ${this.destination || 'indefinido'}\n${stateStr}`, {
          fontSize: '11px', fontFamily: 'monospace',
          color: col, stroke: '#000000', strokeThickness: 2,
          align: 'center',
          backgroundColor: '#00000099', padding: { x: 6, y: 3 },
        }).setOrigin(0.5, 1).setDepth(1000);

      console.log(`[Portal debug] id=${this.portalId}  dest=${this.destination}  locked=${this.isLocked}  pos=(${Math.round(this.x)}, ${Math.round(this.y)})`);
    } else {
      this._dbGfx?.destroy();  this._dbGfx   = null;
      this._dbLabel?.destroy(); this._dbLabel = null;
    }
  }
}
