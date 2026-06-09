import Phaser from 'phaser';
import { PLAYER_SPEED, PLAYER_SPRINT_SPEED } from '../config.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(10);
    // SVG texture is 64×64; use a slim body centred on the lower torso
    this.body.setSize(24, 36);
    this.body.setOffset(20, 22);

    // Speed tracking
    this._recentSpeed = 0;
    this._stillTime = 0;
    this._lastPos = new Phaser.Math.Vector2(x, y);

    this.isClimbing = false;
    this.isInvisible = false;
    this._invisTimer = 0;

    // Facing direction for Sombravinha mechanic
    this.facingAngle = 0;

    // Gentle scale pulse (safe with physics — doesn't touch x/y)
    scene.tweens.add({
      targets: this,
      scaleX: { from: 0.96, to: 1.04 },
      scaleY: { from: 0.96, to: 1.04 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  update(cursors, wasd, shiftKey, delta) {
    if (this.isClimbing) return;

    const left  = cursors.left.isDown  || wasd.left.isDown;
    const right = cursors.right.isDown || wasd.right.isDown;
    const up    = cursors.up.isDown    || wasd.up.isDown;
    const down  = cursors.down.isDown  || wasd.down.isDown;
    const sprint = shiftKey.isDown;

    const spd = sprint ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
    let vx = 0, vy = 0;

    if (left)  vx -= spd;
    if (right) vx += spd;
    if (up)    vy -= spd;
    if (down)  vy += spd;

    // Normalise diagonal
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    this.setVelocity(vx, vy);

    // Track facing angle (for Sombravinha)
    if (vx !== 0 || vy !== 0) {
      this.facingAngle = Math.atan2(vy, vx);
    }

    // Recent speed
    this._recentSpeed = Math.sqrt(vx * vx + vy * vy);

    // Still-time tracking
    const moved = Phaser.Math.Distance.Between(
      this.x, this.y, this._lastPos.x, this._lastPos.y
    );
    if (moved < 4) {
      this._stillTime += delta;
    } else {
      this._stillTime = 0;
      this._lastPos.set(this.x, this.y);
    }

    // Invisibility countdown
    if (this._invisTimer > 0) {
      this._invisTimer -= delta;
      if (this._invisTimer <= 0) {
        this.isInvisible = false;
        this._invisTimer = 0;
        this.setAlpha(1);
        this.scene.game.events.emit('invisibilityEnd');
      }
    }
  }

  get recentSpeed() { return this._recentSpeed; }
  get stillTime()   { return this._stillTime; }

  makeInvisible(durationMs = 4000) {
    this.isInvisible = true;
    this._invisTimer = durationMs;
    this.setAlpha(0.3);
    this.scene.game.events.emit('invisibilityStart', durationMs);
  }
}
