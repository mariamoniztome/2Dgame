import Phaser from 'phaser';
import { PLAYER_SPEED, PLAYER_SPRINT_SPEED } from '../config.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(10);
    this.setDisplaySize(100, 100);
    this.body.setSize(28, 42);
    this.body.setOffset(36, 32);

    // Speed tracking
    this._recentSpeed = 0;
    this._stillTime = 0;
    this._lastPos = new Phaser.Math.Vector2(x, y);

    this.isClimbing = false;
    this.isInvisible = false;
    this._invisTimer = 0;

    // Facing direction for Sombravinha mechanic and sprite animation
    this.facingAngle = 0;
    this._facing = 'front';
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

    // Track facing angle (for Sombravinha) and animation direction
    if (vx !== 0 || vy !== 0) {
      this.facingAngle = Math.atan2(vy, vx);
      let newFacing;
      if (Math.abs(vx) >= Math.abs(vy)) {
        newFacing = vx < 0 ? 'left' : 'right';
      } else {
        newFacing = vy < 0 ? 'back' : 'front';
      }
      if (newFacing !== this._facing) {
        this._facing = newFacing;
        const animKey = `idle_${this._facing}`;
        if (this.scene.anims.exists(animKey)) this.play(animKey, true);
      }
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
