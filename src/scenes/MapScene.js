import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ELEMENTS } from '../config.js';
import { PLANTS } from '../data/plants.js';
import { GameState } from '../GameState.js';

const ESSENTIAL_IDS = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];

const ZONE_DEFS = [
  {
    key: 'Zone1',
    name: 'Zona 1',
    subtitle: 'Campo dos Vagalumes',
    bgColor: 0x0d2a14,
    borderColor: 0x2e7d32,
    plants: ['ventoinha', 'gotateia', 'farfalha', 'trepadeira'],
    alwaysUnlocked: true,
  },
  {
    key: 'Zone2',
    name: 'Zona 2',
    subtitle: 'Planície das Fendas',
    bgColor: 0x061510,
    borderColor: 0x1b5e20,
    plants: ['tezaluz', 'craveira', 'espinhosa_doce', 'bocarra', 'aurorabromelia', 'ninfaria'],
    alwaysUnlocked: false,
  },
  {
    key: 'Zone3',
    name: 'Zona 3',
    subtitle: 'Vale do Asara',
    bgColor: 0x070e08,
    borderColor: 0x1b5e20,
    plants: ['sombravinha', 'faisca_mato', 'sussurreira', 'lunaria_negra'],
    alwaysUnlocked: false,
  },
];

const CARD_W = 220;
const CARD_H = 200;
const CAULDRON_W = 90;
const CAULDRON_H = 90;
const ARROW_GAP = 48;

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }

  create() {
    const W = GAME_WIDTH, H = GAME_HEIGHT;

    // Compute layout
    const TOTAL_CARDS = ZONE_DEFS.length;
    const TOTAL_W = TOTAL_CARDS * CARD_W + CAULDRON_W + TOTAL_CARDS * ARROW_GAP;
    const START_X = (W - TOTAL_W) / 2;
    const CARDS_Y = (H - CARD_H) / 2 - 20;

    this._cardRects = []; // { x, y, w, h, unlocked } for click detection
    this._blockedTimer = null;

    // Dark starry background
    this.add.rectangle(0, 0, W, H, 0x060e08).setOrigin(0);
    this._buildStars(W, H);

    // Title
    this.add.text(W / 2, 44, 'O Jardim da Bruxinha', {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      color: '#7bc67e',
      stroke: '#000000',
      strokeThickness: 4,
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(W / 2, 82, 'Escolhe uma zona para visitar', {
      fontSize: '13px',
      fontFamily: 'Georgia, serif',
      color: '#5ab86e',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Zone cards + arrows
    let curX = START_X;
    ZONE_DEFS.forEach((def, i) => {
      const unlocked = def.alwaysUnlocked || GameState.isZoneUnlocked(def.key);
      this._buildZoneCard(curX, CARDS_Y, def, unlocked);
      this._cardRects.push({ x: curX, y: CARDS_Y, w: CARD_W, h: CARD_H, unlocked, key: def.key });
      curX += CARD_W;

      // Arrow connector
      const arrowX = curX + ARROW_GAP / 2;
      const arrowY = CARDS_Y + CARD_H / 2;
      const arrowColor = unlocked ? 0x5ab86e : 0x1a3a22;
      this._buildArrow(arrowX, arrowY, arrowColor);
      curX += ARROW_GAP;
    });

    // Cauldron card
    const cauldronUnlocked = GameState.isZoneUnlocked('Cauldron');
    this._buildCauldronCard(curX, CARDS_Y + (CARD_H - CAULDRON_H) / 2, cauldronUnlocked);

    // Instructions strip — below zone cards
    this._buildInstructions(W, CARDS_Y + CARD_H);

    // Bottom: essential potion progress bar
    this._buildPotionBar(W, H);

    // Help text at very bottom
    this.add.text(W / 2, H - 24, 'ESC ou M para voltar  ·  Clica numa zona para entrar', {
      fontSize: '12px',
      fontFamily: 'Georgia, serif',
      color: '#4a7a4a',
    }).setOrigin(0.5);

    // Blocked message overlay
    this._blockedText = this.add.text(W / 2, CARDS_Y + CARD_H + 48, 'Zona bloqueada', {
      fontSize: '16px',
      fontFamily: 'Georgia, serif',
      color: '#ff5252',
      stroke: '#000',
      strokeThickness: 3,
      backgroundColor: '#00000099',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    // Keys
    this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyM   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    // Click handler for locked zones
    this.input.on('pointerdown', (ptr) => {
      const clickedLocked = this._cardRects.some(r => {
        if (r.unlocked) return false;
        return ptr.x >= r.x && ptr.x <= r.x + r.w && ptr.y >= r.y && ptr.y <= r.y + r.h;
      });
      if (clickedLocked) {
        this._showBlockedMsg();
      }
    });

    // Fade in
    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) || Phaser.Input.Keyboard.JustDown(this.keyM)) {
      this._returnToGame();
    }
  }

  _buildStars(W, H) {
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H);
      const r = Phaser.Math.FloatBetween(0.5, 2);
      const alpha = Phaser.Math.FloatBetween(0.15, 0.7);
      this.add.circle(x, y, r, 0xffffff, alpha);
    }
  }

  _buildZoneCard(x, y, def, unlocked) {
    const alpha = unlocked ? 1 : 0.42;

    // Background
    const bg = this.add.rectangle(x, y, CARD_W, CARD_H, def.bgColor, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, unlocked ? def.borderColor : 0x2a4a2a, unlocked ? 1 : 0.5)
      .setAlpha(alpha);

    if (!unlocked) {
      // Lock icon and label
      this.add.text(x + CARD_W / 2, y + CARD_H / 2 - 14, '🔒', {
        fontSize: '32px',
      }).setOrigin(0.5).setAlpha(0.65);

      this.add.text(x + CARD_W / 2, y + CARD_H / 2 + 26, 'Bloqueada', {
        fontSize: '13px',
        fontFamily: 'Georgia, serif',
        color: '#4a7a4a',
        fontStyle: 'italic',
      }).setOrigin(0.5).setAlpha(0.7);

      return;
    }

    // Zone name
    this.add.text(x + CARD_W / 2, y + 16, def.name, {
      fontSize: '16px',
      fontFamily: 'Georgia, serif',
      color: '#e8f8e0',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Subtitle
    this.add.text(x + CARD_W / 2, y + 36, def.subtitle, {
      fontSize: '11px',
      fontFamily: 'Georgia, serif',
      color: '#5ab86e',
      fontStyle: 'italic',
    }).setOrigin(0.5, 0);

    // Colored area strip
    this.add.rectangle(x + 10, y + 58, CARD_W - 20, 24, def.borderColor, 0.28)
      .setOrigin(0, 0)
      .setStrokeStyle(1, def.borderColor, 0.45);

    // Plant dots
    const plantIds = def.plants;
    const collected = plantIds.filter(id => GameState.collected.has(id)).length;
    const dotAreaW = CARD_W - 20;
    const dotSpacing = dotAreaW / Math.max(plantIds.length, 1);

    plantIds.forEach((id, idx) => {
      const px = x + 10 + dotSpacing * idx + dotSpacing / 2;
      const py = y + 108;
      const isCollected = GameState.collected.has(id);
      const plant = PLANTS[id];
      const elColor = (plant && ELEMENTS[plant.element]) ? ELEMENTS[plant.element].color : 0x5ab86e;
      const dotColor = isCollected ? elColor : 0x2a2a2a;
      const dotAlpha = isCollected ? 1 : 0.55;

      const dot = this.add.circle(px, py, 8, dotColor, dotAlpha);
      dot.setStrokeStyle(isCollected ? 1.5 : 1, isCollected ? elColor : 0x4a6a4a, isCollected ? 0.8 : 0.4);

      if (plant) {
        const shortName = plant.name.split('-')[0].substring(0, 9);
        this.add.text(px, py + 13, shortName, {
          fontSize: '7px',
          fontFamily: 'monospace',
          color: isCollected ? '#c8e8c0' : '#4a4a6a',
        }).setOrigin(0.5, 0);
      }
    });

    // Plant count
    const allCollected = collected === plantIds.length;
    this.add.text(x + CARD_W / 2, y + CARD_H - 30, `${collected}/${plantIds.length} plantas`, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: allCollected ? '#81c784' : '#5ab86e',
    }).setOrigin(0.5, 0);

    // Interactive hit area
    const hitZone = this.add.rectangle(x, y, CARD_W, CARD_H, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      this.tweens.add({ targets: bg, scaleX: 1.04, scaleY: 1.04, duration: 120, ease: 'Power1' });
      bg.setStrokeStyle(2, def.borderColor, 1);
    });
    hitZone.on('pointerout', () => {
      this.tweens.add({ targets: bg, scaleX: 1, scaleY: 1, duration: 120, ease: 'Power1' });
      bg.setStrokeStyle(2, def.borderColor, 0.7);
    });
    hitZone.on('pointerdown', () => {
      this._enterZone(def.key);
    });
  }

  _buildCauldronCard(x, y, unlocked) {
    const bg = this.add.rectangle(x, y, CAULDRON_W, CAULDRON_H, 0x080e08, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, unlocked ? 0x2e7d32 : 0x2a4a2a, unlocked ? 1 : 0.4)
      .setAlpha(unlocked ? 1 : 0.4);

    if (!unlocked) {
      this.add.text(x + CAULDRON_W / 2, y + CAULDRON_H / 2 - 8, '🔒', {
        fontSize: '22px',
      }).setOrigin(0.5).setAlpha(0.55);
      return;
    }

    this.add.text(x + CAULDRON_W / 2, y + 12, 'Caldeirão', {
      fontSize: '10px',
      fontFamily: 'Georgia, serif',
      color: '#7bc67e',
    }).setOrigin(0.5, 0);

    if (this.textures.exists('cauldron')) {
      this.add.image(x + CAULDRON_W / 2, y + CAULDRON_H / 2 + 6, 'cauldron')
        .setDisplaySize(36, 36);
    } else {
      this.add.text(x + CAULDRON_W / 2, y + CAULDRON_H / 2 + 6, '🔮', {
        fontSize: '26px',
      }).setOrigin(0.5);
    }

    const hitZone = this.add.rectangle(x, y, CAULDRON_W, CAULDRON_H, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      this.tweens.add({ targets: bg, scaleX: 1.06, scaleY: 1.06, duration: 120 });
    });
    hitZone.on('pointerout', () => {
      this.tweens.add({ targets: bg, scaleX: 1, scaleY: 1, duration: 120 });
    });
    hitZone.on('pointerdown', () => {
      this._enterZone('Cauldron');
    });
  }

  _buildArrow(cx, cy, color) {
    const g = this.add.graphics();
    g.lineStyle(2, color, 0.8);
    g.beginPath();
    g.moveTo(cx - 16, cy);
    g.lineTo(cx + 12, cy);
    g.strokePath();
    g.fillStyle(color, 0.85);
    g.fillTriangle(cx + 6, cy - 7, cx + 6, cy + 7, cx + 18, cy);

    this.tweens.add({
      targets: g,
      alpha: { from: 0.45, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  _buildInstructions(W, cardsBottom) {
    const iy = cardsBottom + 18;
    const iw = W - 80;

    this.add.rectangle(W / 2, iy, iw, 64, 0x060e08, 0.84)
      .setOrigin(0.5, 0).setStrokeStyle(1, 0x2d5a38, 0.6);

    this.add.text(W / 2 - iw / 2 + 12, iy + 6, 'COMO JOGAR', {
      fontSize: '10px', fontFamily: 'monospace', color: '#639B5A',
    });

    this.add.text(W / 2, iy + 20,
      'WASD / Setas = Mover     Shift = Correr     C = Apanhar / Interagir', {
        fontSize: '12px', fontFamily: 'monospace', color: '#BFD8A4',
        align: 'center',
      }).setOrigin(0.5, 0);

    this.add.text(W / 2, iy + 38,
      'F = Lancar feitico     Q = Mudar feitico     M = Mapa     H = Ajuda', {
        fontSize: '12px', fontFamily: 'monospace', color: '#BFD8A4',
        align: 'center',
      }).setOrigin(0.5, 0);
  }

  _buildPotionBar(W, H) {
    const panelY = H - 70;
    const barW = 330;

    const collected = ESSENTIAL_IDS.filter(id => GameState.collected.has(id)).length;

    // Panel background
    this.add.rectangle(W / 2, panelY, barW + 48, 56, 0x080e08, 0.85)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x2e7d32, 0.5);

    // Label
    this.add.text(W / 2, panelY - 16, `Poção: ${collected}/5 plantas essenciais`, {
      fontSize: '13px',
      fontFamily: 'Georgia, serif',
      color: '#7bc67e',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Dots
    const dotSpacing = barW / 5;
    const startX = W / 2 - barW / 2;

    ESSENTIAL_IDS.forEach((id, i) => {
      const isCollected = GameState.collected.has(id);
      const plant = PLANTS[id];
      const elColor = (plant && ELEMENTS[plant.element]) ? ELEMENTS[plant.element].color : 0x7bc67e;
      const dotX = startX + dotSpacing * i + dotSpacing / 2;
      const dotY = panelY + 8;

      const dot = this.add.circle(dotX, dotY, 10, isCollected ? elColor : 0x1a3a1a, isCollected ? 1 : 0.55);
      dot.setStrokeStyle(1.5, isCollected ? elColor : 0x1a3a1a, isCollected ? 1 : 0.45);

      if (plant) {
        this.add.text(dotX, dotY + 14, plant.name.split('-')[0].substring(0, 9), {
          fontSize: '8px',
          fontFamily: 'monospace',
          color: isCollected ? '#c8e8c0' : '#3a5a3a',
        }).setOrigin(0.5, 0);
      }
    });
  }

  _showBlockedMsg() {
    if (this._blockedTimer) this._blockedTimer.remove();
    this.tweens.killTweensOf(this._blockedText);
    this._blockedText.setAlpha(1);
    this._blockedTimer = this.time.delayedCall(2000, () => {
      this.tweens.add({ targets: this._blockedText, alpha: 0, duration: 400 });
    });
  }

  _enterZone(key) {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(key);
    });
  }

  _returnToGame() {
    const zone = GameState.currentZone || 'Zone1';
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.scene.isPaused(zone)) {
        this.scene.resume(zone);
        this.scene.stop();
      } else {
        this.scene.start(zone);
      }
    });
  }
}
