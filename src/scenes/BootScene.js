import Phaser from 'phaser';
import { PLANTS } from '../data/plants.js';
import { ELEMENTS, UNSPLASH, unsplashUrl, unsplashPlantUrl } from '../config.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.crossOrigin = 'anonymous';

    // Loading bar
    const bar = this.add.rectangle(
      this.cameras.main.centerX - 200, this.cameras.main.centerY,
      0, 16, 0xce93d8
    ).setOrigin(0, 0.5);
    this.add.rectangle(
      this.cameras.main.centerX - 202, this.cameras.main.centerY,
      404, 20, 0x2d1b69
    ).setOrigin(0, 0.5);
    this.add.text(
      this.cameras.main.centerX, this.cameras.main.centerY - 30,
      'Bruxa, Bruxinha', {
        fontSize: '28px', fontFamily: 'Georgia, serif', color: '#ce93d8',
      }
    ).setOrigin(0.5);
    const loadTxt = this.add.text(
      this.cameras.main.centerX, this.cameras.main.centerY + 30,
      'A carregar o jardim mágico...', {
        fontSize: '14px', fontFamily: 'Georgia, serif', color: '#a0a0c0',
      }
    ).setOrigin(0.5);

    this.load.on('progress', v => {
      bar.width = 400 * v;
      loadTxt.setText(`A carregar… ${Math.round(v * 100)}%`);
    });

    // ── Backgrounds ──────────────────────────────────────────────────────
    this.load.image('bg_zone1',  unsplashUrl(UNSPLASH.zone1Bg));
    this.load.image('bg_zone2',  unsplashUrl(UNSPLASH.zone2Bg));
    this.load.image('bg_zone3',  unsplashUrl(UNSPLASH.zone3Bg));
    this.load.image('bg_book',   unsplashUrl(UNSPLASH.book, 1280, 720));

    // ── Plant images ─────────────────────────────────────────────────────
    Object.values(PLANTS).forEach(p => {
      if (p.unsplashId) {
        this.load.image(`plant_img_${p.id}`, unsplashPlantUrl(p.unsplashId, 128));
      }
    });

    // Graceful fallback: don't crash if Unsplash is unreachable
    this.load.on('loaderror', (file) => {
      console.warn(`[Boot] Could not load: ${file.key}`);
    });
  }

  create() {
    this._generateTextures();
    this.scene.start('Opening');
  }

  _generateTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // ── Player: witch silhouette ──────────────────────────────────────────
    g.clear();
    g.fillStyle(0x5b21b6, 1);
    g.fillCircle(20, 30, 14);
    g.fillStyle(0x1a1a2e, 1);
    g.fillTriangle(20, 2, 5, 24, 35, 24);
    g.fillStyle(0x2d1b69, 1);
    g.fillRect(3, 22, 34, 5);
    g.fillStyle(0x4c1d95, 0.9);
    g.fillTriangle(8, 36, 32, 36, 20, 52);
    g.generateTexture('player', 40, 54);

    // ── Plants by element ─────────────────────────────────────────────────
    const elColors = {
      AIR:     [0xd0e8f0, 0x78909c],
      WATER:   [0x4fc3f7, 0x0288d1],
      FIRE:    [0xff7043, 0xbf360c],
      EARTH:   [0x66bb6a, 0x2e7d32],
      SPECIAL: [0xce93d8, 0x7b1fa2],
    };

    Object.values(PLANTS).forEach(p => {
      const [primary, dark] = elColors[p.element] || [0xffffff, 0x888888];
      g.clear();
      g.fillStyle(primary, 0.25);
      g.fillCircle(24, 24, 22);
      g.fillStyle(primary, 0.75);
      g.fillCircle(24, 24, 14);
      g.fillStyle(dark, 1);
      g.fillCircle(24, 24, 7);
      // Stem
      g.fillStyle(0x388e3c, 1);
      g.fillRect(22, 36, 4, 10);
      g.fillStyle(0x2e7d32, 1);
      g.fillEllipse(30, 41, 12, 6);
      g.generateTexture(`plant_${p.id}`, 48, 48);
    });

    // ── Creatures ─────────────────────────────────────────────────────────
    // Farfalha creature (fire wisp)
    g.clear();
    g.fillStyle(0xff5722, 0.35); g.fillCircle(24, 24, 22);
    g.fillStyle(0xff7043, 0.65); g.fillCircle(24, 24, 16);
    g.fillStyle(0xffb74d, 1);    g.fillCircle(24, 24, 9);
    g.fillStyle(0xfff9c4, 0.85); g.fillCircle(24, 22, 4);
    g.fillStyle(0xff5722, 0.6);  g.fillTriangle(24, 2, 17, 14, 31, 14);
    g.generateTexture('creature_farfalha', 48, 48);

    // Bocarra creature (carnivorous plant)
    g.clear();
    g.fillStyle(0x1b5e20, 1); g.fillCircle(24, 30, 18);
    g.fillStyle(0x1b5e20, 1); g.fillEllipse(24, 20, 36, 22);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(0xf5f5dc, 0.9);
      g.fillTriangle(9 + i * 6, 22, 13 + i * 6, 10, 17 + i * 6, 22);
    }
    g.fillStyle(0xc62828, 0.6); g.fillEllipse(24, 22, 22, 10);
    g.generateTexture('creature_bocarra', 48, 48);

    // Eco creature (ghostly mirror)
    g.clear();
    g.fillStyle(0xb39ddb, 0.18); g.fillCircle(24, 28, 20);
    g.fillStyle(0x9575cd, 0.35); g.fillCircle(24, 26, 13);
    g.fillStyle(0x4a148c, 0.45); g.fillTriangle(24, 4, 12, 24, 36, 24);
    g.fillStyle(0x311b92, 0.35); g.fillRect(8, 22, 32, 4);
    g.generateTexture('creature_eco', 48, 48);

    // ── Portal ────────────────────────────────────────────────────────────
    g.clear();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.fillStyle(0xce93d8, 0.2 + (i % 2) * 0.25);
      g.fillCircle(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 5);
    }
    g.fillStyle(0x5b21b6, 0.35); g.fillCircle(32, 32, 20);
    g.fillStyle(0xce93d8, 0.55); g.fillCircle(32, 32, 13);
    g.fillStyle(0xffffff, 0.8);  g.fillCircle(32, 32, 5);
    g.generateTexture('portal', 64, 64);

    // ── Firefly particle ──────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0xffff99, 1);   g.fillCircle(4, 4, 3);
    g.fillStyle(0xffff00, 0.45); g.fillCircle(4, 4, 6);
    g.generateTexture('firefly', 8, 8);

    // ── Vine ──────────────────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0x2e7d32, 1); g.fillRect(11, 0, 9, 80);
    g.fillStyle(0x388e3c, 0.85);
    g.fillEllipse(26, 15, 20, 10);
    g.fillEllipse(5,  32, 20, 10);
    g.fillEllipse(27, 50, 20, 10);
    g.fillEllipse(5,  66, 20, 10);
    g.generateTexture('vine', 36, 80);

    // ── Cauldron ──────────────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0x37474f, 1); g.fillRect(8, 22, 48, 20);
    g.fillStyle(0x37474f, 1); g.fillEllipse(32, 42, 48, 20);
    g.fillStyle(0x263238, 1); g.fillEllipse(32, 22, 48, 14);
    g.fillStyle(0x1b5e20, 0.75); g.fillEllipse(32, 21, 38, 10);
    // Legs
    g.fillStyle(0x455a64, 1);
    g.fillRect(12, 44, 5, 12); g.fillRect(27, 46, 5, 10); g.fillRect(47, 44, 5, 12);
    // Handles
    g.lineStyle(3, 0x546e7a, 1);
    g.strokeEllipse(9, 18, 10, 14); g.strokeEllipse(55, 18, 10, 14);
    g.generateTexture('cauldron', 64, 64);

    // ── Book ─────────────────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0x3e2723, 1); g.fillRoundedRect(0, 0, 64, 80, 4);
    g.fillStyle(0x6d4c41, 1); g.fillRoundedRect(3, 3, 58, 74, 3);
    g.fillStyle(0xfff8e1, 1); g.fillRect(10, 8, 46, 64);
    g.lineStyle(1, 0xbcaaa4, 0.5);
    for (let i = 0; i < 6; i++) g.lineBetween(14, 20 + i * 9, 52, 20 + i * 9);
    g.fillStyle(0x2e1503, 1); g.fillRect(0, 3, 10, 74);
    g.generateTexture('book', 64, 80);

    // ── Spell effects ─────────────────────────────────────────────────────
    const spellDefs = [
      { key: 'spell_brisa', color: 0x4fc3f7 },
      { key: 'spell_raiz',  color: 0xff7043 },
      { key: 'spell_passo', color: 0xce93d8 },
      { key: 'spell_canto', color: 0x66bb6a },
    ];
    spellDefs.forEach(({ key, color }) => {
      g.clear();
      g.fillStyle(color, 0.15); g.fillCircle(32, 32, 30);
      g.fillStyle(color, 0.45); g.fillCircle(32, 32, 20);
      g.fillStyle(color, 0.85); g.fillCircle(32, 32, 10);
      g.generateTexture(key, 64, 64);
    });

    // ── Butterfy hint ─────────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0xffe082, 0.85);
    g.fillEllipse(8, 8, 12, 8); g.fillEllipse(18, 8, 12, 8);
    g.fillStyle(0x333333, 1); g.fillRect(12, 4, 2, 8);
    g.generateTexture('butterfly', 26, 16);

    g.destroy();
  }
}
