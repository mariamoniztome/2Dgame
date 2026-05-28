import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config.js';
import { BootScene }     from './scenes/BootScene.js';
import { OpeningScene }  from './scenes/OpeningScene.js';
import { MapScene }      from './scenes/MapScene.js';
import { Zone1Scene }    from './scenes/Zone1Scene.js';
import { Zone2Scene }    from './scenes/Zone2Scene.js';
import { Zone3Scene }    from './scenes/Zone3Scene.js';
import { CauldronScene } from './scenes/CauldronScene.js';
import { HUDScene }      from './ui/HUD.js';

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0a0a1a',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
  scene: [
    BootScene,
    OpeningScene,
    Zone1Scene,
    Zone2Scene,
    Zone3Scene,
    CauldronScene,
    HUDScene,   // must come AFTER all zone scenes so it renders on top
    MapScene,   // must be last so it renders over everything when open
  ],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
