import Phaser from 'phaser';
import { GameState } from '../GameState.js';
import { MusicManager } from '../MusicManager.js';

// ── Layout — positions as fractions of (W, H) ─────────────────────────────

const ZONE1_ICONS = [
  {
    icon: 'map_icone_limiar',
    xp: 0.0581, yp: 0.1281,
    size: 0.1003,
    label: 'Limiar\nsecreto',
    lxp: 0.09, lyp: 0.36,
    startArea: 'limiarSecreto',
  },
  {
    icon: 'map_icone_campo',
    xp: 0.0535, yp: 0.7739,
    size: 0.1003,
    label: 'Campo dos\nvagalumes',
    lxp: 0.09, lyp: 0.90,
    startArea: 'campoVagalumes',
  },
  {
    icon: 'map_icone_jardim',
    xp: 0.39, yp: 0.74,
    size: 0.1003,
    label: 'Jardim\nInvertido',
    lxp: 0.39, lyp: 0.88,
    startArea: 'jardimInvertido',
  },
];

// Decorative plant/creature icons — size as fraction of W
const DECO_ICONS = [
  { icon: 'map_icone_ventoinha',  xp: 0.1779, yp: 0.7676, sp: 0.0898 },
  { icon: 'map_icone_farfalha',   xp: 0.1596, yp: 0.0698, sp: 0.0853 },
  { icon: 'map_icone_gotateia',   xp: 0.5313, yp: 0.9068, sp: 0.0801 },
  { icon: 'map_icone_trepadeira', xp: 0.0361, yp: 0.5501, sp: 0.0781 },
];

// Portal icons — entry/exit points between zones
const PORTAL_ICONS = [
  { xp: 0.1893, yp: 0.2101, sp: 0.0599 },  // Zone1 → Zone2 passage
  { xp: 0.7167, yp: 0.3306, sp: 0.0599 },  // Zone2 → Zone3 passage
];

// Padlock size — fraction of W. Change here or tune with scroll in debug mode.
const LOCK_SP = 0.065;

// Padlocks — Zone 2 (middle area) and Zone 3 (right area)
const Z2_LOCKS = [
  { xp: 0.50, yp: 0.40 },
];
const Z3_LOCKS = [
  { xp: 0.87, yp: 0.40 },
];

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this._W = W; this._H = H;
    this._blockedTimer = null;
    this._debugMode = false;
    this._debugObjs = [];   // { img, label, posText }
    this._debugOverlays = [];

    MusicManager.init(this);
    MusicManager.playIntro();

    // ── Backgrounds ───────────────────────────────────────────────────────
    // Solid base guarantees no zone scene bleeds through when map is open
    this.add.rectangle(0, 0, W, H, 0x1c3a1c, 1).setOrigin(0).setDepth(0);
    if (this.textures.exists('map_fundo01')) {
      this.add.image(0, 0, 'map_fundo01').setOrigin(0).setDisplaySize(W, H).setDepth(1);
    }
    if (this.textures.exists('map_fundo02')) {
      this.add.image(0, 0, 'map_fundo02').setOrigin(0).setDisplaySize(W, H).setDepth(2);
    }

    // ── Zone 1 circle icons ───────────────────────────────────────────────
    ZONE1_ICONS.forEach(area => {
      const x    = W * area.xp;
      const y    = H * area.yp;
      const size = Math.round(W * area.size);
      // Jardim is always accessible — no lock
      const jardimLocked = false;

      if (this.textures.exists(area.icon)) {
        const img = this.add.image(x, y, area.icon)
          .setDisplaySize(size, size)
          .setDepth(7)
          .setAlpha(jardimLocked ? 0.4 : 1)
          .setInteractive({ useHandCursor: !jardimLocked });
        if (!jardimLocked) {
          const baseScale = img.scaleX;
          img.on('pointerover', () => { if (!this._debugMode) this.tweens.add({ targets: img, scaleX: baseScale * 1.08, scaleY: baseScale * 1.08, duration: 120 }); });
          img.on('pointerout',  () => { if (!this._debugMode) this.tweens.add({ targets: img, scaleX: baseScale, scaleY: baseScale, duration: 120 }); });
          img.on('pointerdown', (_ptr, _lx, _ly, event) => { if (!this._debugMode) { event.stopPropagation(); this._enterZone('Zone1', area.startArea); } });
        } else {
          img.on('pointerdown', () => { if (!this._debugMode) this._showBlocked(); });
        }
        this._debugObjs.push({ img, label: area.icon, group: 'zone1' });

        // Lock overlay for jardim
        if (jardimLocked && this.textures.exists('map_cadeado')) {
          const ls = Math.round(size * 0.38);
          this.add.image(x + size * 0.28, y - size * 0.28, 'map_cadeado')
            .setDisplaySize(ls, ls).setDepth(6);
        }
      }

      this.add.text(W * area.lxp, H * area.lyp, area.label, {
        fontSize: `${Math.round(W * 0.017)}px`,
        fontFamily: "'Red Hat Text', sans-serif",
        color: jardimLocked ? '#708070' : '#e8f5e0',
        stroke: '#061006',
        strokeThickness: 3,
        align: 'center',
        lineSpacing: 2,
        fontStyle: 'italic',
      }).setOrigin(0.5, 0).setDepth(4);
    });

    // ── Decorative plant icons ────────────────────────────────────────────
    DECO_ICONS.forEach(({ icon, xp, yp, sp }) => {
      if (!this.textures.exists(icon)) return;
      const s = Math.round(W * sp);
      const img = this.add.image(W * xp, H * yp, icon).setDisplaySize(s, s).setDepth(4)
        .setInteractive({ useHandCursor: false });
      this._debugObjs.push({ img, label: icon, group: 'deco' });
    });

    // ── Portal icons ──────────────────────────────────────────────────────
    const portalLabels = ['Portal → Zona 2', 'Portal → Zona 3'];
    if (this.textures.exists('map_portal')) {
      PORTAL_ICONS.forEach(({ xp, yp, sp }, pi) => {
        const s = Math.round(W * sp);
        const px = W * xp, py = H * yp;
        const img = this.add.image(px, py, 'map_portal')
          .setDisplaySize(s, s).setDepth(4).setAlpha(0.85)
          .setInteractive({ useHandCursor: false });
        // this.add.text(px, py + s * 0.7, portalLabels[pi] || 'Portal', {
        //   fontSize: `${Math.round(W * 0.012)}px`,
        //   fontFamily: "'Red Hat Text', sans-serif", color: '#b8e8b8',
        //   stroke: '#061006', strokeThickness: 2, fontStyle: 'italic',
        // }).setOrigin(0.5, 0).setDepth(5).setAlpha(0.75);
        this._debugObjs.push({ img, label: 'map_portal', group: 'portal' });
      });
    }

    // ── Zone 2 ────────────────────────────────────────────────────────────
    this._buildZone('Zone2', Z2_LOCKS, W, H, W * 0.50, H * 0.40, W * 0.42, H * 0.80);

    // ── Zone 3 ────────────────────────────────────────────────────────────
    this._buildZone('Zone3', Z3_LOCKS, W, H, W * 0.87, H * 0.40, W * 0.28, H * 0.80);

    // ── Blocked notice ────────────────────────────────────────────────────
    this._blockedText = this.add.text(W / 2, H - 52, 'Esta zona ainda está bloqueada.', {
      fontSize: `${Math.round(W * 0.016)}px`,
      fontFamily: "'Red Hat Text', sans-serif",
      color: '#ff8080',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#00000099',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setAlpha(0).setDepth(100);

    // ── Close hint ────────────────────────────────────────────────────────
    // On first launch there is no active zone to return to
    this._isInitial = !GameState.currentZone;
    const hintText  = this._isInitial
      ? 'Escolhe uma zona para explorar'
      : 'ESC ou M — voltar ao jogo';
    this.add.text(W / 2, H - 12, hintText, {
      fontSize: '11px', fontFamily: "'Red Hat Text', sans-serif", color: '#6a9a6a',
    }).setOrigin(0.5, 1).setDepth(5);

    this.keyEsc   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyM     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyDebug = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  _buildZone(key, lockPositions, W, H, hitX, hitY, hitW, hitH) {
    // Zone is accessible on the map only after the zone is unlocked AND the
    // player has physically found the entry portal in the game world.
    // (zone2_forward is only discovered while unlocked, so the zone-unlock
    //  check is implicitly satisfied for Zone3.)
    const portalForKey = { Zone2: 'zone1_limiar', Zone3: 'zone2_forward' };
    const requiredPortal = portalForKey[key];
    const unlocked = requiredPortal
      ? GameState.isZoneUnlocked(key) && GameState.discoveredPortals.has(requiredPortal)
      : GameState.isZoneUnlocked(key);
    const lockSize = Math.round(W * LOCK_SP);

    if (unlocked) {
      const label = key === 'Zone2' ? 'Zona 2' : 'Zona 3';
      const btn = this.add.text(hitX, hitY - hitH * 0.15, label, {
        fontSize: `${Math.round(W * 0.016)}px`,
        fontFamily: "'Red Hat Text', sans-serif",
        color: '#e8f5e0',
        stroke: '#061006',
        strokeThickness: 3,
        backgroundColor: '#0a201088',
        padding: { x: 12, y: 7 },
        fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => this.tweens.add({ targets: btn, scale: 1.06, duration: 120 }));
      btn.on('pointerout',  () => this.tweens.add({ targets: btn, scale: 1.00, duration: 120 }));
      btn.on('pointerdown', () => this._enterZone(key));
    } else {
      // Always render padlocks — SVG if available, fallback generated texture in BootScene
      lockPositions.forEach(({ xp, yp }) => {
        const img = this.add.image(W * xp, H * yp, 'map_cadeado')
          .setDisplaySize(lockSize, lockSize).setDepth(5)
          .setInteractive({ useHandCursor: false });
        this._debugObjs.push({ img, label: `lock_${key}`, group: 'lock' });
      });
      const hitZone = this.add.rectangle(hitX, hitY, hitW, hitH, 0, 0)
        .setDepth(6).setInteractive({ useHandCursor: false });
      hitZone.on('pointerdown', () => { if (!this._debugMode) this._showBlocked(); });
    }
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) || Phaser.Input.Keyboard.JustDown(this.keyM)) {
      if (this._debugMode) { this._toggleDebug(); return; }
      if (!this._isInitial) this._returnToGame();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyDebug)) {
      this._toggleDebug();
    }
    if (this._debugMode && this.keyLog && Phaser.Input.Keyboard.JustDown(this.keyLog)) {
      this._logMapConfig();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Debug mode — drag icons, copy positions
  // ─────────────────────────────────────────────────────────────────────────
  _toggleDebug() {
    this._debugMode = !this._debugMode;

    if (this._debugMode) {
      this._enableMapDebug();
    } else {
      this._disableMapDebug();
    }
  }

  _enableMapDebug() {
    const W = this._W, H = this._H;
    this._debugHover = null;

    // Dim background to make positions clearer
    this._debugDim = this.add.rectangle(0, 0, W, H, 0x000000, 0.35)
      .setOrigin(0).setDepth(50);

    // Debug label banner
    this._debugBanner = this.add.text(W / 2, 8,
      'DEBUG MAPA  (D — fechar · L — log · scroll — tamanho)', {
      fontSize: '12px', fontFamily: 'monospace', color: '#ffee44',
      backgroundColor: '#000000cc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 0).setDepth(60);

    // Key for copying config
    this.keyLog = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);

    // Enable drag + hover tracking on all tracked objects
    this._debugObjs.forEach(entry => {
      const { img } = entry;
      if (!img.active) return;
      img.setInteractive({ useHandCursor: true });
      this.input.setDraggable(img);

      img.on('pointerover', () => { this._debugHover = entry; });
      img.on('pointerout',  () => { if (this._debugHover === entry) this._debugHover = null; });

      // Position + size label
      const posText = this.add.text(img.x, img.y - img.displayHeight / 2 - 10,
        this._fmtEntry(img),
        { fontSize: '9px', fontFamily: 'monospace', color: '#ffee44',
          stroke: '#000000', strokeThickness: 2 }
      ).setOrigin(0.5, 1).setDepth(62);

      // Highlight ring
      const ring = this.add.graphics().setDepth(61);
      ring.lineStyle(1.5, 0xffee44, 0.7);
      ring.strokeCircle(img.x, img.y, img.displayWidth / 2 + 4);

      entry.posText = posText;
      entry.ring    = ring;
      this._debugOverlays.push(posText, ring);
    });

    this.input.on('drag', (_ptr, img, dragX, dragY) => {
      img.setPosition(dragX, dragY);
      const entry = this._debugObjs.find(e => e.img === img);
      if (entry?.posText) {
        entry.posText.setPosition(dragX, dragY - img.displayHeight / 2 - 10);
        entry.posText.setText(this._fmtEntry(img));
      }
      if (entry?.ring) {
        entry.ring.clear();
        entry.ring.lineStyle(1.5, 0xffee44, 0.7);
        entry.ring.strokeCircle(dragX, dragY, img.displayWidth / 2 + 4);
      }
    });

    // Scroll wheel — resize object under pointer.
    // For locks: all locks resize together (uniform size).
    this.input.on('wheel', (_ptr, currentlyOver, _dx, deltaY) => {
      // Find which debug entry is under the pointer
      let entry = null;
      for (const obj of currentlyOver) {
        entry = this._debugObjs.find(e => e.img === obj);
        if (entry) break;
      }
      if (!entry) entry = this._debugHover;
      if (!entry?.img?.active) return;

      const step = deltaY > 0 ? -4 : 4;

      // Locks resize uniformly — resize every lock entry
      const targets = entry.group === 'lock'
        ? this._debugObjs.filter(e => e.group === 'lock')
        : [entry];

      targets.forEach(e => {
        const newSize = Math.max(10, e.img.displayWidth + step);
        e.img.setDisplaySize(newSize, newSize);
        if (e.ring) {
          e.ring.clear();
          e.ring.lineStyle(1.5, 0xffee44, 0.7);
          e.ring.strokeCircle(e.img.x, e.img.y, newSize / 2 + 4);
        }
        if (e.posText) {
          e.posText.setPosition(e.img.x, e.img.y - newSize / 2 - 10);
          e.posText.setText(this._fmtEntry(e.img));
        }
      });
    });
  }

  _disableMapDebug() {
    this._debugDim?.destroy();
    this._debugBanner?.destroy();
    this._debugOverlays.forEach(o => o.destroy());
    this._debugOverlays = [];
    this._debugObjs.forEach(e => { delete e.posText; delete e.ring; });
    this.input.off('drag');
    this.input.off('wheel');
    this._debugHover = null;
    if (this.keyLog) { this.keyLog.destroy(); this.keyLog = null; }
  }

  _fmtEntry(img) {
    const W = this._W, H = this._H;
    return `xp:${(img.x/W).toFixed(3)} yp:${(img.y/H).toFixed(3)} sp:${(img.displayWidth/W).toFixed(3)}`;
  }

  _logMapConfig() {
    const W = this._W, H = this._H;
    const out = { zone1Icons: [], decoIcons: [], portalIcons: [], locks: [] };
    let z = 0, d = 0, p = 0, l = 0;
    this._debugObjs.forEach(({ img, group }) => {
      if (!img.active) return;
      const xp = +(img.x / W).toFixed(4);
      const yp = +(img.y / H).toFixed(4);
      const sp = +(img.displayWidth / W).toFixed(4);
      if (group === 'zone1')  out.zone1Icons[z++]  = { xp, yp, size: sp };
      if (group === 'deco')   out.decoIcons[d++]   = { xp, yp, sp };
      if (group === 'portal') out.portalIcons[p++]  = { xp, yp, sp };
      if (group === 'lock')   out.locks[l++]        = { xp, yp, sp };
    });
    console.log('MAP CONFIG:\n' + JSON.stringify(out, null, 2));
    // Copy to clipboard if available
    try { navigator.clipboard.writeText(JSON.stringify(out, null, 2)); } catch (_) {}
    this._debugBanner?.setText('Config copiado! (ver consola)');
    this.time.delayedCall(2000, () =>
      this._debugBanner?.setText('DEBUG MAPA  (D — fechar · L — log config)')
    );
  }

  _showBlocked() {
    if (this._blockedTimer) this._blockedTimer.remove();
    this.tweens.killTweensOf(this._blockedText);
    this._blockedText.setAlpha(1);
    this._blockedTimer = this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: this._blockedText, alpha: 0, duration: 400 });
    });
  }

  _enterZone(key, startArea) {
    if (startArea) this.game.registry.set('startArea', startArea);
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
        const zoneScene = this.scene.get(zone);
        MusicManager.init(zoneScene);
        if (zone === 'Zone1' && GameState.currentArea) {
          MusicManager.playArea(GameState.currentArea);
        } else {
          MusicManager.stop();
        }
        this.scene.stop();
      } else {
        this.scene.start(zone);
      }
    });
  }
}
