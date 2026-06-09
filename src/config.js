export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 2400;

export const PLAYER_SPEED = 180;
export const PLAYER_SPRINT_SPEED = 320;
export const PLAYER_INTERACTION_RADIUS = 75;

export const ELEMENTS = {
  WATER:   { name: 'Água',     color: 0x4fc3f7, dark: 0x0288d1 },
  AIR:     { name: 'Ar',       color: 0xd0e8f0, dark: 0x78909c },
  FIRE:    { name: 'Fogo',     color: 0xff7043, dark: 0xbf360c },
  EARTH:   { name: 'Terra',    color: 0x66bb6a, dark: 0x2e7d32 },
  SPECIAL: { name: 'Especial', color: 0xa8e07e, dark: 0x4a8c3a },
};

export const ZONES = {
  ZONE1:    'Zone1',
  ZONE2:    'Zone2',
  ZONE3:    'Zone3',
  CAULDRON: 'Cauldron',
};

// Unsplash photo IDs for backgrounds and plants
export const UNSPLASH = {
  zone1Bg:  'photo-1448375240167-9518b5b7e5b3',
  zone2Bg:  'photo-1518972559570-7cc1309f3229',
  zone3Bg:  'photo-1516912481808-3406841bd33c',
  book:     'photo-1481627834876-b7833e8f5570',
  cauldron: 'photo-1607746882042-944635dfe10e',
};

export function unsplashUrl(id, w = 1920, h = 1080) {
  return `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format`;
}

export function unsplashPlantUrl(id, size = 128) {
  return `https://images.unsplash.com/${id}?w=${size}&h=${size}&fit=crop&auto=format`;
}
