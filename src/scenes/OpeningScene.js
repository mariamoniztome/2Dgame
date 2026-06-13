import Phaser from 'phaser';
import { GameState } from '../GameState.js';

const STORY_LINES = [
  'Ouve aqui essa história, minha neta…',
  '"Era uma vez uma bruxinha pequenina de curiosidade latente.',
  'Ela vivia num jardim grande, cheio de plantas estranhas e poderosas.',
  'Um belo dia ela acordou e o seu jardim já não parecia o mesmo.',
  'A pequena bruxinha teria de encontrar o caminho de volta para o seu lar."',
];

const CONTROLS = [
  { key: 'WASD / ←↑↓→', desc: 'Mover' },
  { key: 'Shift',         desc: 'Correr' },
  { key: 'C',             desc: 'Apanhar planta / usar portal' },
  { key: 'M',             desc: 'Abrir mapa' },
  { key: 'Q / F',         desc: 'Mudar / Lançar feitiço' },
  { key: 'H',             desc: 'Ajuda' },
];

export class OpeningScene extends Phaser.Scene {
  constructor() { super('Opening'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    GameState.shownIntro = true;

    this._phase = 'story'; // 'story' | 'controls'

    // Dark background
    this.add.rectangle(0, 0, W, H, 0x080810).setOrigin(0);

    // Stars
    for (let i = 0; i < 90; i++) {
      this.add.circle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H * 0.75),
        Phaser.Math.Between(1, 2),
        0xffffff,
        Phaser.Math.FloatBetween(0.15, 0.65)
      );
    }

    // Title
    this.add.text(W / 2, H * 0.06, 'Bruxa, Bruxinha', {
      fontSize: `${Math.round(W * 0.028)}px`,
      fontFamily: 'Georgia, serif',
      color: '#ce93d8',
      stroke: '#1a1a2e',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.13, 'Um jardim de feitiços e segredos', {
      fontSize: `${Math.round(W * 0.011)}px`,
      fontFamily: 'Georgia, serif',
      color: '#9575cd',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Narrative container (story phase)
    this._storyGroup = this.add.container(0, 0);
    this.narText = this.add.text(W / 2, H * 0.55, '', {
      fontSize: `${Math.round(W * 0.014)}px`,
      fontFamily: 'Georgia, serif',
      color: '#f5e6c8',
      wordWrap: { width: W * 0.6 },
      lineSpacing: 8,
      align: 'center',
      stroke: '#080810',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);
    this._storyGroup.add(this.narText);

    // Objective panel (shown briefly before controls)
    this._objectiveBg = this.add.graphics().setAlpha(0);
    this._objectiveBg.fillStyle(0x0d1a10, 0.88);
    this._objectiveBg.fillRoundedRect(W * 0.3, H * 0.28, W * 0.4, H * 0.14, 12);
    this._objectiveBg.lineStyle(1.5, 0x7bc67e, 0.6);
    this._objectiveBg.strokeRoundedRect(W * 0.3, H * 0.28, W * 0.4, H * 0.14, 12);
    this._objText = this.add.text(W / 2, H * 0.35, 'Objetivo: recolhe 3 plantas mágicas\npara abrir o caminho para o Limiar Secreto', {
      fontSize: `${Math.round(W * 0.012)}px`,
      fontFamily: 'Georgia, serif',
      color: '#c8f0c0',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5).setAlpha(0);

    // Controls panel (controls phase)
    this._ctrlContainer = this.add.container(0, 0).setAlpha(0);
    this._buildControlsPanel(W, H);

    // Click hint
    this.clickHint = this.add.text(W / 2, H * 0.92, 'clica para avançar', {
      fontSize: `${Math.round(W * 0.011)}px`,
      fontFamily: 'Georgia, serif',
      color: '#6a5acd',
    }).setOrigin(0.5);
    this.tweens.add({ targets: this.clickHint, alpha: { from: 0.4, to: 1 }, duration: 900, yoyo: true, repeat: -1 });

    // Skip button
    const skipBtn = this.add.text(W - 16, 14, 'saltar →', {
      fontSize: `${Math.round(W * 0.010)}px`,
      fontFamily: 'Georgia, serif',
      color: '#6a5acd',
      backgroundColor: '#0d1a1088',
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    skipBtn.on('pointerover', () => skipBtn.setColor('#c8a6f8'));
    skipBtn.on('pointerout',  () => skipBtn.setColor('#6a5acd'));
    skipBtn.on('pointerdown', () => this._startGame());

    this.lineIndex = 0;
    this.advancing = false;

    this.input.on('pointerdown', (_ptr, targets) => {
      if (targets.length > 0) return; // hit skip button — let its own handler fire
      this._advance();
    });
    this.time.delayedCall(1000, () => this._showLine());
  }

  _buildControlsPanel(W, H) {
    const bg = this.add.graphics();
    bg.fillStyle(0x0d1a10, 0.92);
    bg.fillRoundedRect(W * 0.22, H * 0.22, W * 0.56, H * 0.54, 14);
    bg.lineStyle(1.5, 0x7bc67e, 0.65);
    bg.strokeRoundedRect(W * 0.22, H * 0.22, W * 0.56, H * 0.54, 14);
    this._ctrlContainer.add(bg);

    this._ctrlContainer.add(this.add.text(W / 2, H * 0.26, 'CONTROLOS', {
      fontSize: `${Math.round(W * 0.016)}px`,
      fontFamily: 'monospace', color: '#c8f2bf',
      stroke: '#061006', strokeThickness: 2,
    }).setOrigin(0.5));

    CONTROLS.forEach(({ key, desc }, i) => {
      const y = H * 0.34 + i * H * 0.065;
      this._ctrlContainer.add(this.add.text(W * 0.31, y, key, {
        fontSize: `${Math.round(W * 0.013)}px`,
        fontFamily: 'monospace', color: '#ffef7a',
      }).setOrigin(0, 0.5));
      this._ctrlContainer.add(this.add.text(W * 0.52, y, desc, {
        fontSize: `${Math.round(W * 0.013)}px`,
        fontFamily: 'Georgia, serif', color: '#d4ecc8', fontStyle: 'italic',
      }).setOrigin(0, 0.5));
    });

    this._ctrlContainer.add(this.add.text(W / 2, H * 0.72, 'Clica para entrar no jardim', {
      fontSize: `${Math.round(W * 0.012)}px`,
      fontFamily: 'Georgia, serif', color: '#9575cd', fontStyle: 'italic',
    }).setOrigin(0.5));
  }

  _showLine() {
    if (this.lineIndex >= STORY_LINES.length) {
      this._showControlsPhase();
      return;
    }
    const txt = STORY_LINES[this.lineIndex];
    this.narText.setText(txt);
    this.tweens.add({ targets: this.narText, alpha: 1, duration: 400 });
    const isLast = this.lineIndex === STORY_LINES.length - 1;
    if (!isLast) {
      this.time.delayedCall(txt.length > 40 ? 3200 : 2400, () => this._nextLine());
    }
  }

  _nextLine() {
    this.tweens.add({
      targets: this.narText, alpha: 0, duration: 300,
      onComplete: () => { this.lineIndex++; this._showLine(); },
    });
  }

  _showControlsPhase() {
    this._phase = 'controls';
    // Fade out story text
    this.tweens.add({ targets: this.narText, alpha: 0, duration: 400 });
    // Show brief objective, then controls
    this.tweens.add({ targets: [this._objectiveBg, this._objText], alpha: 1, duration: 500 });
    this.time.delayedCall(1800, () => {
      this.tweens.add({ targets: [this._objectiveBg, this._objText], alpha: 0, duration: 400,
        onComplete: () => {
          this.tweens.add({ targets: this._ctrlContainer, alpha: 1, duration: 500 });
          this.clickHint.setText('clica para começar');
        }
      });
    });
  }

  _advance() {
    if (this.advancing) return;
    if (this._phase === 'controls') { this._startGame(); return; }
    const isLast = this.lineIndex === STORY_LINES.length - 1;
    if (isLast) {
      this._showControlsPhase();
    } else {
      this.time.removeAllEvents();
      this.tweens.killTweensOf(this.narText);
      this._nextLine();
    }
  }

  _startGame() {
    if (this.advancing) return;
    this.advancing = true;
    this.input.off('pointerdown');
    this.cameras.main.fadeOut(800, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Map'));
  }
}
