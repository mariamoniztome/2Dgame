import Phaser from 'phaser';
import { ELEMENTS } from '../config.js';

export class Plant extends Phaser.GameObjects.Container {
  constructor(scene, x, y, data) {
    super(scene, x, y);
    this.plantData = data;
    this.isCollected = false;
    this.isVisible = true;

    // Shake mechanic state
    this.shakeCount = 0;
    this.lastShakeAt = 0;

    // Ventoinha spin state
    this._spinning = false;
    this._spinCooldown = 0;

    // Sombravinha appearance state
    this._sombraVisible = false;
    this._sombraTimer = 0;

    const el = ELEMENTS[data.element] || ELEMENTS.EARTH;

    // Glow background
    this.glow = scene.add.circle(0, 0, 26, el.color, 0.18);

    // Main sprite (SVG image if loaded, else red-X placeholder)
    const imgKey = `plant_img_${data.id}`;
    this.sprite = scene.textures.exists(imgKey)
      ? scene.add.image(0, 0, imgKey).setDisplaySize(80, 80)
      : scene.add.image(0, 0, 'plant_missing').setDisplaySize(80, 80);

    // Label
    this.label = scene.add.text(0, 30, data.name, {
      fontSize: '11px',
      fontFamily: 'Georgia, serif',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);

    // Interaction hint
    this.hint = scene.add.text(0, -36, 'C', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setAlpha(0);

    this.add([this.glow, this.sprite, this.label, this.hint]);
    scene.add.existing(this);
    this.setDepth(5);

    // Floating animation
    scene.tweens.add({
      targets: this.sprite,
      y: { from: -3, to: 3 },
      duration: 1800 + Math.random() * 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Glow pulse
    scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.1, to: 0.35 },
      scale: { from: 0.9, to: 1.15 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  showHint(show) {
    if (!this.scene) return;
    this.scene.tweens.add({
      targets: [this.hint, this.label],
      alpha: show ? 1 : 0,
      duration: 180,
    });
  }

  // Ventoinha: spin & disappear when player is too slow nearby
  spinAndHide() {
    if (this._spinning) return;
    this._spinning = true;
    this.showHint(false);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 360,
      duration: 700,
      repeat: 1,
      onComplete: () => {
        this.isVisible = false;
        this.scene.tweens.add({
          targets: this,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            // Reappear after 7s
            this.scene.time.delayedCall(7000, () => {
              this._spinning = false;
              this.isVisible = true;
              this.setAlpha(0);
              this.sprite.setAngle(0);
              this.scene.tweens.add({ targets: this, alpha: 1, duration: 800 });
            });
          },
        });
      },
    });
  }

  // Gotateia: shake; returns true when ready to collect
  shake(now) {
    const elapsed = now - this.lastShakeAt;
    if (elapsed > 2000) this.shakeCount = 0;
    this.shakeCount++;
    this.lastShakeAt = now;

    this.scene.tweens.add({
      targets: this.sprite,
      x: { from: -5, to: 5 },
      duration: 80,
      yoyo: true,
      repeat: 3,
    });

    // Emit water drops
    for (let i = 0; i < 3; i++) {
      const d = this.scene.add.circle(
        this.x + Phaser.Math.Between(-18, 18),
        this.y - 10,
        3, 0x4fc3f7, 0.85
      ).setDepth(6);
      this.scene.tweens.add({
        targets: d,
        y: d.y + 35,
        alpha: 0,
        duration: 500,
        delay: i * 80,
        onComplete: () => d.destroy(),
      });
    }

    return this.shakeCount >= 3;
  }

  // Sombravinha: appears only when player faces away & is still
  updateSombraState(playerFacingAway, delta) {
    if (playerFacingAway) {
      this._sombraTimer += delta;
      if (this._sombraTimer > 2500 && !this._sombraVisible) {
        this._sombraVisible = true;
        this.isVisible = true;
        this.setAlpha(0);
        this.scene.tweens.add({ targets: this, alpha: 1, duration: 1200 });
      }
    } else {
      this._sombraTimer = 0;
      if (this._sombraVisible) {
        this._sombraVisible = false;
        this.isVisible = false;
        this.scene.tweens.add({ targets: this, alpha: 0, duration: 600 });
      }
    }
  }

  collect() {
    this.isCollected = true;
    this.showHint(false);
    const el = ELEMENTS[this.plantData.element] || ELEMENTS.EARTH;

    // Flash
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      y: this.y - 40,
      duration: 450,
      ease: 'Power2.easeOut',
      onComplete: () => this.destroy(),
    });

    // Sparkle particles
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dot = this.scene.add.circle(
        this.x + Math.cos(angle) * 20,
        this.y + Math.sin(angle) * 20,
        4, el.color, 0.9
      ).setDepth(20);
      this.scene.tweens.add({
        targets: dot,
        x: dot.x + Math.cos(angle) * 40,
        y: dot.y + Math.sin(angle) * 40,
        alpha: 0,
        duration: 500,
        delay: i * 30,
        onComplete: () => dot.destroy(),
      });
    }
  }
}
