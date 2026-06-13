import Phaser from 'phaser';

export class Portal extends Phaser.GameObjects.Container {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);
    this.portalId    = opts.portalId    || 'portal_unknown';
    this.destination = opts.destination || null;
    this.isLocked    = opts.locked !== false;

    // Portal image — no rotation, static
    this.ring = scene.add.image(0, 0, 'portal').setDisplaySize(160, 160).setAlpha(this.isLocked ? 0.45 : 0.85);

    // Inner glow
    this.glow = scene.add.circle(0, 0, 22, 0x7bc67e, 0.35);

    // Lock indicator
    this.lockText = scene.add.text(0, -72, '🔒', {
      fontSize: '20px',
    }).setOrigin(0.5).setVisible(this.isLocked);

    // Hint
    this.hintText = scene.add.text(0, 66, 'C — usar portal', {
      fontSize: '12px',
      fontFamily: 'Georgia, serif',
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
    scene.tweens.add({
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
}
