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
      0, 16, 0x7bc67e
    ).setOrigin(0, 0.5);
    this.add.rectangle(
      this.cameras.main.centerX - 202, this.cameras.main.centerY,
      404, 20, 0x1a3a1e
    ).setOrigin(0, 0.5);
    this.add.text(
      this.cameras.main.centerX, this.cameras.main.centerY - 30,
      'Bruxa, Bruxinha', {
        fontSize: '28px', fontFamily: 'Georgia, serif', color: '#7bc67e',
      }
    ).setOrigin(0.5);
    const loadTxt = this.add.text(
      this.cameras.main.centerX, this.cameras.main.centerY + 30,
      'A carregar o jardim mágico...', {
        fontSize: '14px', fontFamily: 'Georgia, serif', color: '#9ed89e',
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

    // ── Zone 1 SVG assets ────────────────────────────────────────────────
    // Player character — 512px raster; display 260px at zoom 2 = 520px screen
    this.load.svg('player', '/assets/zone1/bruxinha.svg', { width: 512, height: 512 });
    // Plant sprites
    this.load.svg('plant_img_ventoinha',  '/assets/zone1/campo/ventoinha.svg',   { width: 256, height: 256 });
    this.load.svg('plant_img_farfalha',   '/assets/zone1/limiar/farfalha.svg',   { width: 256, height: 256 });
    this.load.svg('plant_img_trepadeira', '/assets/zone1/limiar/trepadeira.svg', { width: 256, height: 256 });
    // Firefly sprite — load at 512 so scale ~0.59 downscales cleanly (no upscale blur)
    this.load.svg('z1_vagalume', '/assets/zone1/campo/vagalume.svg', { width: 512, height: 512 });
    // Area backgrounds (already large — keep as-is)
    this.load.svg('z1_bg_campo', '/assets/zone1/campo/bg_campo.svg',   { width: 1920, height: 1080 });
    this.load.svg('z1_bg_trans', '/assets/zone1/transicao/fundo.svg',  { width: 1920, height: 1080 });
    this.load.svg('z1_parede',   '/assets/zone1/transicao/parede.svg', { width: 1920, height: 1432 });
    // Location signs
    this.load.svg('z1_placa_campo',  '/assets/zone1/campo/placa.svg',  { width: 256, height: 256 });
    this.load.svg('z1_placa_limiar', '/assets/zone1/limiar/placa.svg', { width: 256, height: 256 });
    // Decorative elements — load at 512×512 so they stay sharp at 300–450px display size
    ['03','04','05','06','07','08','09','10','11','12','13','14','15','17','18','19','20','21','22','23','24'].forEach(n =>
      this.load.svg(`z1_campo_${n}`, `/assets/zone1/campo/elem_${n}.svg`, { width: 512, height: 512 })
    );
    ['03','04','05','06','07','08','09','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'].forEach(n =>
      this.load.svg(`z1_limiar_${n}`, `/assets/zone1/limiar/elem_${n}.svg`, { width: 512, height: 512 })
    );
    ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19'].forEach(n =>
      this.load.svg(`z1_trans_${n}`, `/assets/zone1/transicao/elem_${n}.svg`, { width: 512, height: 512 })
    );

    // ── Map assets ───────────────────────────────────────────────────────────
    // Backgrounds 1280×720 raster (1920×1080 viewBox scaled down — saves ~8 MB vs full-res)
    this.load.svg('map_fundo01',       '/assets/map/map_fundo01.svg',       { width: 1280, height: 720 });
    this.load.svg('map_fundo02',       '/assets/map/map_fundo02.svg',       { width: 1280, height: 720 });
    // Icons & decorations — 256px raster for circle icons, 128px for small ones
    this.load.svg('map_icone_campo',   '/assets/map/map_icone_campo.svg',   { width: 256, height: 256 });
    this.load.svg('map_icone_jardim',  '/assets/map/map_icone_jardim.svg',  { width: 256, height: 256 });
    this.load.svg('map_icone_limiar',  '/assets/map/map_icone_limiar.svg',  { width: 256, height: 256 });
    this.load.svg('map_cadeado',       '/assets/map/map_cadeado.svg',       { width: 128, height: 128 });
    this.load.svg('map_portal',        '/assets/map/map_portal.svg',        { width: 128, height: 128 });
    this.load.svg('map_icone_ventoinha',  '/assets/map/map_icone_ventoinha.svg',  { width: 128, height: 128 });
    this.load.svg('map_icone_farfalha',   '/assets/map/map_icone_farfalha.svg',   { width: 128, height: 128 });
    this.load.svg('map_icone_gotateia',   '/assets/map/map_icone_gotateia.svg',   { width: 128, height: 128 });
    this.load.svg('map_icone_trepadeira', '/assets/map/map_icone_trepadeira.svg', { width: 128, height: 128 });

    // Graceful fallback: don't crash if Unsplash is unreachable
    this.load.on('loaderror', (file) => {
      console.warn(`[Boot] Could not load: ${file.key}`);
    });
  }

  create() {
    this._generateTextures();
    this.scene.start('Map');
  }

  _generateTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // ── Player: use SVG if loaded, else fallback (red coat + black hat) ─────
    if (!this.textures.exists('player')) {
      g.clear();
      g.fillStyle(0x1a0a00, 1); g.fillTriangle(20, 1, 4, 22, 36, 22);  // hat
      g.fillStyle(0x333333, 1); g.fillRect(2, 20, 36, 4);               // hat brim
      g.fillStyle(0xf6a3b3, 1); g.fillCircle(20, 30, 12);               // face
      g.fillStyle(0xb42d27, 1); g.fillTriangle(6, 38, 34, 38, 20, 54);  // coat
      g.fillStyle(0xb42d27, 1); g.fillRect(4, 30, 8, 14);               // left arm
      g.fillStyle(0xb42d27, 1); g.fillRect(28, 30, 8, 14);              // right arm
      g.generateTexture('player', 40, 56);
    }

    // ── Plants by element ─────────────────────────────────────────────────
    const elColors = {
      AIR:     [0xd0e8f0, 0x78909c],
      WATER:   [0x4fc3f7, 0x0288d1],
      FIRE:    [0xff7043, 0xbf360c],
      EARTH:   [0x66bb6a, 0x2e7d32],
      SPECIAL: [0xa8e07e, 0x4a8c3a],
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

    // Eco creature (dark forest spirit)
    g.clear();
    g.fillStyle(0x4a8c5a, 0.22); g.fillCircle(24, 28, 20);
    g.fillStyle(0x2e7d32, 0.40); g.fillCircle(24, 26, 13);
    g.fillStyle(0x1b5e20, 0.55); g.fillTriangle(24, 4, 12, 24, 36, 24);
    g.fillStyle(0x0d3318, 0.40); g.fillRect(8, 22, 32, 4);
    g.generateTexture('creature_eco', 48, 48);

    // ── Portal ────────────────────────────────────────────────────────────
    g.clear();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.fillStyle(0x7bc67e, 0.2 + (i % 2) * 0.25);
      g.fillCircle(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 5);
    }
    g.fillStyle(0x1b5e20, 0.40); g.fillCircle(32, 32, 20);
    g.fillStyle(0x7bc67e, 0.60); g.fillCircle(32, 32, 13);
    g.fillStyle(0xffffff, 0.85); g.fillCircle(32, 32, 5);
    g.generateTexture('portal', 64, 64);

    // ── Firefly particle ──────────────────────────────────────────────────
    g.clear();
    g.fillStyle(0xffff99, 1);   g.fillCircle(4, 4, 3);
    g.fillStyle(0xffff00, 0.45); g.fillCircle(4, 4, 6);
    g.generateTexture('firefly', 8, 8);

    // ── Missing-plant placeholder — red X ─────────────────────────────────
    g.clear();
    g.lineStyle(5, 0xff2222, 1);
    g.beginPath(); g.moveTo(10, 10); g.lineTo(38, 38); g.strokePath();
    g.beginPath(); g.moveTo(38, 10); g.lineTo(10, 38); g.strokePath();
    g.lineStyle(2, 0xff2222, 0.4);
    g.strokeCircle(24, 24, 20);
    g.generateTexture('plant_missing', 48, 48);

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
      { key: 'spell_passo', color: 0xa8e07e },
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
