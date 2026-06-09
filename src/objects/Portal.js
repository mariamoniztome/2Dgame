import Phaser from 'phaser';

export class Portal extends Phaser.GameObjects.Container {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);
    this.portalId    = opts.portalId    || 'portal_unknown';
    this.destination = opts.destination || null;
    this.isLocked    = opts.locked !== false;

    // Outer ring
    this.ring = scene.add.image(0, 0, 'portal').setDisplaySize(80, 80).setAlpha(0.5);

    // Inner glow
    this.glow = scene.add.circle(0, 0, 20, 0x7bc67e, 0.4);

    // Lock indicator
    this.lockText = scene.add.text(0, -48, '🔒', {
      fontSize: '18px',
    }).setOrigin(0.5).setVisible(this.isLocked);

    // Hint
    this.hintText = scene.add.text(0, 50, 'E — Portal', {
      fontSize: '11px',
      fontFamily: 'Georgia, serif',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);

    this.add([this.ring, this.glow, this.lockText, this.hintText]);
    scene.add.existing(this);
    this.setDepth(4);

    // Rotation
    scene.tweens.add({
      targets: this.ring,
      angle: 360,
      duration: 6000,
      repeat: -1,
      ease: 'Linear',
    });

    // Pulse
    scene.tweens.add({
      targets: this.glow,
      scale: { from: 1, to: 1.6 },
      alpha: { from: 0.4, to: 0 },
      duration: 1800,
      repeat: -1,
      ease: 'Power2.easeOut',
    });
  }

  unlock() {
    this.isLocked = false;
    this.lockText.setVisible(false);
    this.ring.setAlpha(1);
    this.glow.setFillStyle(0x7bc67e, 0.7);

    this.scene.tweens.add({
      targets: this,
      scale: { from: 0.8, to: 1.2 },
      duration: 300,
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
