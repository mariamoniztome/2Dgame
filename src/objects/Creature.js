import Phaser from 'phaser';

const STATES = { WANDER: 'wander', FOLLOW: 'follow', STEAL: 'steal', FLEE: 'flee', DEFEATED: 'defeated' };

export class Creature extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, textureKey, opts = {}) {
    super(scene, x, y, textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.creatureType = opts.type || 'farfalha';
    this.followRange   = opts.followRange   ?? 500;
    this.stealThreshold = opts.stealThreshold ?? 3000; // ms player must be still
    this.speed         = opts.speed         ?? 90;

    this.setDepth(8);
    this.body.setSize(32, 32);
    this.body.setOffset(8, 8);

    this.state = STATES.WANDER;
    this._wanderTarget = new Phaser.Math.Vector2(x, y);
    this._wanderTimer = 0;
    this._alpha = this.alpha;

    // Subtle pulse
    scene.tweens.add({
      targets: this,
      alpha: { from: 0.7, to: 1 },
      scale: { from: 0.95, to: 1.05 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });
  }

  update(player, delta, gameState) {
    if (this.state === STATES.DEFEATED) return;
    if (player.isInvisible) {
      this.setVelocity(0, 0);
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    switch (this.state) {
      case STATES.WANDER:
        this._doWander(delta);
        if (dist < this.followRange && gameState.inventory.length > 0) {
          this.state = STATES.FOLLOW;
        }
        break;

      case STATES.FOLLOW:
        if (dist > this.followRange * 1.6 || gameState.inventory.length === 0) {
          this.state = STATES.WANDER;
          break;
        }
        this._moveToward(player.x, player.y, this.speed * 0.65);
        if (player.stillTime > this.stealThreshold) {
          this.state = STATES.STEAL;
        }
        break;

      case STATES.STEAL:
        if (player.isInvisible) { this.state = STATES.FLEE; break; }
        this._moveToward(player.x, player.y, this.speed * 1.4);
        if (dist < 40) {
          this._performSteal(gameState, player);
          this.state = STATES.FLEE;
        }
        break;

      case STATES.FLEE:
        this._fleeFrom(player.x, player.y);
        if (dist > 600) {
          this.state = STATES.WANDER;
          this.setVelocity(0, 0);
        }
        break;
    }
  }

  repel(fromX, fromY) {
    if (this.state === STATES.DEFEATED) return;
    this.state = STATES.FLEE;
    const angle = Math.atan2(this.y - fromY, this.x - fromX);
    this.setVelocity(Math.cos(angle) * 300, Math.sin(angle) * 300);

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 1000,
      delay: 500,
      onComplete: () => {
        this.state = STATES.DEFEATED;
        this.setActive(false);
        this.setVisible(false);
        this.scene.game.events.emit('creatureDefeated', this.creatureType);
      },
    });
  }

  _doWander(delta) {
    this._wanderTimer -= delta;
    if (this._wanderTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * 160;
      this._wanderTarget.set(
        Phaser.Math.Clamp(this.x + Math.cos(angle) * r, 50, 3150),
        Phaser.Math.Clamp(this.y + Math.sin(angle) * r, 50, 2350)
      );
      this._wanderTimer = 2000 + Math.random() * 2000;
    }
    this._moveToward(this._wanderTarget.x, this._wanderTarget.y, this.speed * 0.4);
  }

  _moveToward(tx, ty, spd) {
    const angle = Math.atan2(ty - this.y, tx - this.x);
    this.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
  }

  _fleeFrom(fx, fy) {
    const angle = Math.atan2(this.y - fy, this.x - fx);
    this.setVelocity(Math.cos(angle) * this.speed * 1.6, Math.sin(angle) * this.speed * 1.6);
  }

  _performSteal(gameState, player) {
    const stolen = gameState.stealLastPlant();
    if (!stolen) return;

    this.scene.game.events.emit('plantStolen', stolen);

    // Visual: show stolen plant icon flying toward creature
    const icon = this.scene.add.circle(player.x, player.y, 14,
      0xff5722, 0.9).setDepth(30);
    this.scene.tweens.add({
      targets: icon,
      x: this.x,
      y: this.y,
      scale: 0,
      duration: 600,
      onComplete: () => icon.destroy(),
    });
  }
}
