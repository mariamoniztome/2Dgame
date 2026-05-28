import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';

const LINES = [
  'Ouve aqui essa história, minha neta…',
  '"Era uma vez uma bruxinha pequenina de curiosidade latente.',
  'Vivia se perdendo pela floresta e conversando com os vagalumes do caminho.',
  'Ela vivia num jardim grande, cheio de plantas estranhas e poderosas,',
  'com cheiros e sons que não existem em mais nenhum sítio do mundo.',
  'Um belo dia ela acordou e o seu jardim já não parecia o mesmo.',
  'A pequena bruxinha teria de encontrar o caminho de volta para o seu lar.',
  'Mas, atenção, algo muito importante…"',
  '',
  '— Clica para começar a tua jornada —',
];

export class OpeningScene extends Phaser.Scene {
  constructor() { super('Opening'); }

  create() {
    // Dark background
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x080810).setOrigin(0);

    // Stars
    for (let i = 0; i < 80; i++) {
      this.add.circle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT * 0.7),
        Phaser.Math.Between(1, 2),
        0xffffff,
        Phaser.Math.FloatBetween(0.2, 0.7)
      );
    }

    // Book image
    const hasBook = this.textures.exists('bg_book');
    const bookImg = hasBook
      ? this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, 'bg_book')
          .setDisplaySize(780, 500).setAlpha(0)
      : this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, 'book')
          .setScale(5).setAlpha(0);

    this.tweens.add({ targets: bookImg, alpha: hasBook ? 0.55 : 0.4, duration: 2000 });

    // Dark overlay on book so text is legible
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, 780, 500, 0x0a0810, 0.45)
      .setOrigin(0.5);

    // Title
    this.add.text(GAME_WIDTH / 2, 38, 'Bruxa, Bruxinha', {
      fontSize: '34px',
      fontFamily: 'Georgia, serif',
      color: '#ce93d8',
      stroke: '#1a1a2e',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0.9);

    // Subtitle
    this.add.text(GAME_WIDTH / 2, 76, 'Um jardim de feitiços e segredos', {
      fontSize: '14px',
      fontFamily: 'Georgia, serif',
      color: '#9575cd',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Narrative text area
    this.narText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 160, '', {
      fontSize: '17px',
      fontFamily: 'Georgia, serif',
      color: '#f5e6c8',
      wordWrap: { width: 740 },
      lineSpacing: 6,
      align: 'center',
      stroke: '#080810',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setAlpha(0);

    // Click hint
    this.clickHint = this.add.text(GAME_WIDTH - 18, GAME_HEIGHT - 18,
      'clica para avançar', {
        fontSize: '13px',
        fontFamily: 'Georgia, serif',
        color: '#6a5acd',
      }
    ).setOrigin(1, 1);
    this.tweens.add({
      targets: this.clickHint,
      alpha: { from: 0.4, to: 1 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });

    this.lineIndex = 0;
    this.advancing = false;

    this.input.on('pointerdown', this._advance, this);
    this.time.delayedCall(1200, () => this._showLine());
  }

  _showLine() {
    if (this.lineIndex >= LINES.length) { this._startGame(); return; }
    const txt = LINES[this.lineIndex];
    this.narText.setText(txt || ' ');
    this.tweens.add({
      targets: this.narText,
      alpha: 1,
      duration: 400,
    });

    const isLast = this.lineIndex === LINES.length - 1;
    if (!isLast) {
      this.time.delayedCall(txt.length > 40 ? 3200 : 2400, () => this._nextLine());
    }
  }

  _nextLine() {
    this.tweens.add({
      targets: this.narText,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        this.lineIndex++;
        this._showLine();
      },
    });
  }

  _advance() {
    if (this.advancing) return;
    const isLast = this.lineIndex === LINES.length - 1;
    if (isLast) {
      this._startGame();
    } else {
      this.time.removeAllEvents();
      this.tweens.killAll();
      this._nextLine();
    }
  }

  _startGame() {
    if (this.advancing) return;
    this.advancing = true;
    this.input.off('pointerdown', this._advance, this);
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Map'));
  }
}
