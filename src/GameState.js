import { PLANTS } from './data/plants.js';
import { SPELLS, SPELL_ORDER } from './data/spells.js';

class GameStateManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.inventory = [];
    this.collected = new Set();
    this.unlockedZones = new Set(['Zone1']);
    this.discoveredPortals = new Set();
    this.currentZone = 'Zone1';
    this.activeSpell = null;
    this.availableSpells = [];
    this.spellJustUnlocked = null;
    // Player world position (updated each frame by active zone scene)
    this.playerX = 420;
    this.playerY = 1200;
    this.plantSpawns = [];
    // Current map icon positions for stolen/respawned plants (fractional coords matching MapScene)
    this.plantMapPositions = {
      ventoinha:  { xp: 0.1779, yp: 0.7676 },
      farfalha:   { xp: 0.1596, yp: 0.0698 },
      gotateia:   { xp: 0.5313, yp: 0.9068 },
      trepadeira: { xp: 0.0361, yp: 0.5501 },
    };
    this.visitedJardim  = false;
    this.shownIntro     = false;
    this.currentArea    = '';
    this.spellJustLost  = null;
  }

  addPlant(plantData) {
    if (this.inventory.length >= 14) return false;
    if (this.collected.has(plantData.id)) return false;
    this.inventory.push({ ...plantData, isFake: false });
    this.collected.add(plantData.id);
    this._updateSpells();
    return true;
  }

  removePlant(plantId) {
    const idx = this.inventory.findIndex(p => p.id === plantId);
    if (idx >= 0) {
      this.inventory.splice(idx, 1);
      this.collected.delete(plantId);
      this._updateSpells();
    }
  }

  stealLastPlant() {
    const nonEssential = this.inventory.filter(p => !p.isFake && !p.essential);
    if (!nonEssential.length) return null;
    const stolen = nonEssential[nonEssential.length - 1];
    this.removePlant(stolen.id);
    return stolen;
  }

  replacePlantWithFake(plantId) {
    const p = this.inventory.find(p => p.id === plantId);
    if (p) p.isFake = true;
  }

  hasPlants(ids) {
    return ids.every(id => this.collected.has(id));
  }

  _updateSpells() {
    const prev = [...this.availableSpells];
    this.availableSpells = [];

    for (const id of SPELL_ORDER) {
      const spell = SPELLS[id];
      const ok = Array.isArray(spell.plants) && this.hasPlants(spell.plants);
      if (ok) this.availableSpells.push(id);
    }

    // Detect newly unlocked spell
    for (const id of this.availableSpells) {
      if (!prev.includes(id)) {
        this.spellJustUnlocked = id;
        break;
      }
    }

    // Detect lost spell
    const lost = prev.find(id => !this.availableSpells.includes(id));
    if (lost) this.spellJustLost = lost;

    // Keep activeSpell only if still available
    if (this.activeSpell && !this.availableSpells.includes(this.activeSpell)) {
      this.activeSpell = null;
    }
    // Auto-select if none active
    if (!this.activeSpell && this.availableSpells.length) {
      this.activeSpell = this.availableSpells[0];
    }
  }

  cycleSpell() {
    if (!this.availableSpells.length) return;
    const idx = this.availableSpells.indexOf(this.activeSpell);
    this.activeSpell = this.availableSpells[(idx + 1) % this.availableSpells.length];
  }

  cauldronProgress() {
    const essential = ['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra'];
    return essential.filter(id => this.collected.has(id)).length / essential.length;
  }

  checkZone2Unlock() {
    return this.hasPlants(['farfalha', 'ventoinha', 'trepadeira']);
  }

  checkZone3Unlock() {
    return this.hasPlants(['ninfaria', 'aurorabromelia', 'tezaluz', 'espinhosa_doce', 'craveira']);
  }

  checkCauldronUnlock() {
    return this.hasPlants(['ninfaria', 'aurorabromelia', 'farfalha', 'sombravinha', 'lunaria_negra']);
  }

  unlockZone(name) { this.unlockedZones.add(name); }
  discoverPortal(id) { this.discoveredPortals.add(id); }
  isZoneUnlocked(name) { return this.unlockedZones.has(name); }
}

export const GameState = new GameStateManager();
