import Phaser from 'phaser';
import { ELEMENTS } from '../config.js';
import { GameState } from '../GameState.js';

const ESSENTIAL_ORDER = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

const PLANT_NAMES = {
  ninfaria:      'Ninfária',
  aurorabromelia:'Aurorabromélia',
  farfalha:      'Farfalha',
  sombravinha:   'Sombravinha',
  lunaria_negra: 'Lunária Negra',
};

export class CauldronScene extends Phaser.Scene {
  constructor() { super('Cauldron'); }

  create() {
    this._phase = 0;
    this._plantsAdded = 0;

    // Reset camera to neutral state (Zone3 leaves behind scroll/zoom)
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setZoom(1);

    const W = this.scale.width;
    const H = this.scale.height;
    this._W = W;
    this._H = H;

    // Dark background
    this.add.rectangle(0, 0, W, H, 0x030508).setOrigin(0);

    // Stars
    for (let i = 0; i < 120; i++) {
      this.add.circle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H * 0.6),
        Phaser.Math.Between(1, 2),
        0xffffff,
        Phaser.Math.FloatBetween(0.15, 0.7)
      );
    }

    // Cauldron (large)
    this.cauldron = this.add.image(W / 2, H / 2 + 50, 'cauldron')
      .setDisplaySize(200, 200).setAlpha(0);

    // Liquid (circle inside cauldron)
    this.liquid = this.add.circle(W / 2, H / 2 + 30, 55, 0x1b5e20, 0.85).setAlpha(0);
    this.liquidRipple = this.add.circle(W / 2, H / 2 + 30, 55, 0x4caf50, 0).setAlpha(0);

    // Reflection (grandmother)
    this.reflection = this.add.text(W / 2, H / 2 + 30, '👵', {
      fontSize: '40px',
    }).setOrigin(0.5).setAlpha(0);

    // Title
    this.add.text(W / 2, 40, 'Clareira do Caldeirão', {
      fontSize: '26px', fontFamily: "'Red Hat Text', sans-serif",
      color: '#ce93d8', stroke: '#030508', strokeThickness: 3,
    }).setOrigin(0.5);

    // Instruction text
    this.instructText = this.add.text(W / 2, H - 120, '', {
      fontSize: '18px', fontFamily: "'Red Hat Text', sans-serif",
      color: '#f5e6c8', stroke: '#030508', strokeThickness: 3,
      align: 'center', wordWrap: { width: W * 0.55 },
    }).setOrigin(0.5);

    // Plant slots display
    this.plantSlots = [];
    ESSENTIAL_ORDER.forEach((id, i) => {
      const x = W / 2 - 200 + i * 100;
      const y = H - 60;
      const bg = this.add.circle(x, y, 22, 0x0a0a1a, 0.8)
        .setStrokeStyle(1, 0x3d2b7a, 0.6);
      const icon = this.add.circle(x, y, 14, 0x333333, 0.6);
      const check = this.add.text(x, y, '', {
        fontSize: '12px', color: '#ffffff',
      }).setOrigin(0.5);
      this.plantSlots.push({ bg, icon, check, id });
    });

    // Fireflies cluster (magical atmosphere)
    this.add.particles(0, 0, 'firefly', {
      x: { min: W * 0.2, max: W * 0.8 },
      y: { min: H * 0.2, max: H * 0.8 },
      lifespan: { min: 2000, max: 4500 },
      speed: { min: 10, max: 35 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.9, end: 0 },
      quantity: 2, frequency: 100,
      blendMode: 'ADD',
    }).setDepth(20);

    this.cameras.main.fadeIn(1000, 0, 0, 0);

    this.time.delayedCall(1200, () => this._startSequence());
    this.input.on('pointerdown', this._onTap, this);
  }

  _startSequence() {
    // Cauldron appears
    this.tweens.add({
      targets: [this.cauldron, this.liquid],
      alpha: 1,
      duration: 1500,
      onComplete: () => {
        // Liquid ripple
        this.tweens.add({
          targets: this.liquidRipple,
          alpha: { from: 0, to: 0.4 },
          scale: { from: 1, to: 1.3 },
          duration: 1200,
          yoyo: true,
          repeat: -1,
        });
        this._promptNext();
      },
    });
  }

  _promptNext() {
    if (this._plantsAdded >= ESSENTIAL_ORDER.length) {
      this._finale();
      return;
    }

    const id = ESSENTIAL_ORDER[this._plantsAdded];
    const name = PLANT_NAMES[id];
    const isLast = this._plantsAdded === ESSENTIAL_ORDER.length - 1;

    const msg = isLast
      ? `A última planta: ${name}. Coloca-a por último, sempre.`
      : `Coloca a ${name} no caldeirão. (Clica para continuar)`;

    this._showText(msg);
    this._phase = 'waiting';
  }

  _onTap() {
    if (this._phase !== 'waiting') return;
    this._phase = 'adding';
    this._addPlant();
  }

  _addPlant() {
    const id = ESSENTIAL_ORDER[this._plantsAdded];
    const elements = { ninfaria:'WATER', aurorabromelia:'AIR', farfalha:'FIRE', sombravinha:'EARTH', lunaria_negra:'SPECIAL' };
    const el = ELEMENTS[elements[id]] || ELEMENTS.EARTH;

    // Animate plant falling into cauldron
    const W = this._W, H = this._H;
    const plant = this.add.circle(
      W / 2 + Phaser.Math.Between(-80, 80),
      100,
      18, el.color, 0.9
    ).setDepth(15);

    this.tweens.add({
      targets: plant,
      x: W / 2,
      y: H / 2 + 30,
      scale: 0.1,
      alpha: 0,
      duration: 900,
      ease: 'Power2.easeIn',
      onComplete: () => {
        plant.destroy();
        this._splash(el.color);

        // Update liquid color
        this.liquid.setFillStyle(el.color, 0.85);

        // Update slot
        const slot = this.plantSlots[this._plantsAdded];
        slot.icon.setFillStyle(el.color, 0.9);
        slot.bg.setStrokeStyle(1, el.color, 0.8);
        slot.check.setText('✓').setColor('#ffffff');
        this.tweens.add({ targets: slot.icon, scale: { from: 1.4, to: 1 }, duration: 300 });

        this._plantsAdded++;
        this.time.delayedCall(800, () => this._promptNext());
        this._phase = 'waiting';
      },
    });
  }

  _splash(color) {
    const W = this._W, H = this._H;
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const r = 15 + Math.random() * 25;
      const drop = this.add.circle(
        W / 2 + Math.cos(angle) * 10,
        H / 2 + 30 + Math.sin(angle) * 10,
        4, color, 0.9
      ).setDepth(16);
      this.tweens.add({
        targets: drop,
        x: drop.x + Math.cos(angle) * r,
        y: drop.y + Math.sin(angle) * r,
        alpha: 0,
        duration: 500,
        delay: i * 30,
        onComplete: () => drop.destroy(),
      });
    }
  }

  _finale() {
    this._phase = 'finale';

    this._showText('O caldeirão brilha. O reflexo da avó aparece…');

    this.tweens.add({
      targets: this.liquid,
      scale: { from: 1, to: 1.15 },
      duration: 600,
      yoyo: true,
    });

    // Liquid turns white/gold → grandmother reflection
    this.time.delayedCall(1500, () => {
      this.tweens.add({
        targets: this.liquid,
        fillColor: 0xfff9c4,
        duration: 1200,
      });

      this.time.delayedCall(1200, () => {
        this.reflection.setAlpha(0).setY(this._H / 2 + 30);
        this.tweens.add({
          targets: this.reflection,
          alpha: 1,
          duration: 1000,
        });

        this._showText('"O que achaste do meu jardim?"\n\n— Clica para beber a poção —');

        this.input.once('pointerdown', () => this._drink());
      });
    });
  }

  _drink() {
    this._phase = 'drinking';
    this.reflection.setVisible(false);

    // Flash white
    const flash = this.add.rectangle(0, 0, this._W, this._H, 0xffffff, 0)
      .setOrigin(0).setDepth(200);
    this.tweens.add({
      targets: flash,
      alpha: 1,
      duration: 600,
      yoyo: true,
      onYoyo: () => this._showText(''),
      onComplete: () => {
        // Show book cover again
        this._showBook();
      },
    });
  }

  _showBook() {
    const W = this._W, H = this._H;
    this.add.rectangle(0, 0, W, H, 0x1a0a08).setOrigin(0).setDepth(100);
    const book = this.add.image(W / 2, H / 2 - 60, 'book')
      .setDisplaySize(256, 320).setAlpha(0).setDepth(101);
    this.tweens.add({
      targets: book,
      alpha: 1,
      duration: 1200,
      onComplete: () => {
        // Page turn animation
        this.tweens.add({
          targets: book,
          scaleX: { from: 1, to: 0 },
          duration: 400,
          ease: 'Power2.easeIn',
          onComplete: () => {
            this.tweens.add({
              targets: book,
              scaleX: { from: 0, to: 1 },
              duration: 400,
              ease: 'Power2.easeOut',
            });
          },
        });

        const fim = this.add.text(W / 2, H / 2 - 40, 'Fim', {
          fontSize: '38px', fontFamily: "'Red Hat Text', sans-serif",
          color: '#3e2723', fontStyle: 'italic',
        }).setOrigin(0.5).setAlpha(0).setDepth(102);
        this.time.delayedCall(1000, () => {
          this.tweens.add({ targets: fim, alpha: 1, duration: 1200 });
        });

        // Credits
        this.time.delayedCall(2000, () => {
          const credits = [
            'Bruxa, Bruxinha',
            'Ana Pinto · Maria João Tomé · Letícia Pitta',
            '',
            'Clica para voltar ao início',
          ].join('\n');
          const creditText = this.add.text(W / 2, H - 100, credits, {
            fontSize: '14px', fontFamily: "'Red Hat Text', sans-serif",
            color: '#8d6e63', align: 'center',
          }).setOrigin(0.5).setAlpha(0).setDepth(102);
          this.tweens.add({ targets: creditText, alpha: 1, duration: 1500 });
          this.input.once('pointerdown', () => {
            GameState.reset();
            this.scene.start('Opening');
          });
        });
      },
    });
  }

  _showText(msg) {
    this.instructText.setText(msg);
    this.tweens.add({
      targets: this.instructText,
      alpha: { from: 0, to: 1 },
      duration: 400,
    });
  }
}
