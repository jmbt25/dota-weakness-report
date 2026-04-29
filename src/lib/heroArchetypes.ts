// Hero → playstyle archetype, single tag per hero, by HERO DESIGN
// (not by what position the hero is usually drafted into).
//
// MIRROR of the same table in scripts/build-pro-vectors.mjs. When you
// edit one, edit the other — and bump the pro corpus refresh because
// the existing vectors will be wrong (their archetype distribution was
// computed under the old tags).
//
// 6 buckets:
//   melee_carry   — melee right-clicker (Sven, Jugg, Spectre)
//   ranged_carry  — ranged right-clicker (Drow, Sniper, Medusa)
//   caster_nuker  — primary damage from spells (Storm, Lina, Invoker,
//                   Hoodwink, Visage, Techies)
//   initiator     — engages / locks down the fight (Pudge, Spirit Breaker,
//                   Earth Spirit, Magnus, Tide-Ravage, Tusk, BH-Track)
//   support       — heals / utility / buffs (CM, Lich, Dazzle, Omni,
//                   Abaddon, Undying — even when offlane)
//   durable_core  — designed-tanky offlane tank (Tide, Bristle, Timber,
//                   DK, Doom, Underlord)
//
// Newer heroes not yet listed default to 'caster_nuker' — most heroes
// shipped 2022+ have caster shape (Marci is the exception and is tagged
// initiator below).

export type HeroArchetype =
  | 'melee_carry'
  | 'ranged_carry'
  | 'caster_nuker'
  | 'initiator'
  | 'support'
  | 'durable_core'

export const ARCHETYPES: HeroArchetype[] = [
  'melee_carry',
  'ranged_carry',
  'caster_nuker',
  'initiator',
  'support',
  'durable_core',
]

const HERO_ARCHETYPES: Record<number, HeroArchetype> = {
  // melee_carry
  1: 'melee_carry', 4: 'melee_carry', 8: 'melee_carry', 12: 'melee_carry',
  18: 'melee_carry', 32: 'melee_carry', 41: 'melee_carry', 42: 'melee_carry',
  44: 'melee_carry', 54: 'melee_carry', 67: 'melee_carry', 70: 'melee_carry',
  73: 'melee_carry', 77: 'melee_carry', 80: 'melee_carry', 81: 'melee_carry',
  82: 'melee_carry', 89: 'melee_carry', 93: 'melee_carry', 95: 'melee_carry',
  104: 'melee_carry', 109: 'melee_carry', 114: 'melee_carry',
  // ranged_carry
  6: 'ranged_carry', 10: 'ranged_carry', 15: 'ranged_carry', 35: 'ranged_carry',
  46: 'ranged_carry', 47: 'ranged_carry', 48: 'ranged_carry', 56: 'ranged_carry',
  59: 'ranged_carry', 61: 'ranged_carry', 63: 'ranged_carry', 72: 'ranged_carry',
  94: 'ranged_carry', 113: 'ranged_carry',
  // caster_nuker
  9: 'caster_nuker', 11: 'caster_nuker', 13: 'caster_nuker', 17: 'caster_nuker',
  21: 'caster_nuker', 22: 'caster_nuker', 25: 'caster_nuker', 34: 'caster_nuker',
  36: 'caster_nuker', 39: 'caster_nuker', 40: 'caster_nuker', 43: 'caster_nuker',
  45: 'caster_nuker', 52: 'caster_nuker', 53: 'caster_nuker', 74: 'caster_nuker',
  76: 'caster_nuker', 92: 'caster_nuker', 105: 'caster_nuker', 106: 'caster_nuker',
  119: 'caster_nuker', 123: 'caster_nuker', 126: 'caster_nuker', 138: 'caster_nuker',
  // initiator
  2: 'initiator', 7: 'initiator', 14: 'initiator', 16: 'initiator',
  19: 'initiator', 20: 'initiator', 23: 'initiator', 33: 'initiator',
  38: 'initiator', 51: 'initiator', 55: 'initiator', 62: 'initiator',
  65: 'initiator', 71: 'initiator', 78: 'initiator', 88: 'initiator',
  96: 'initiator', 97: 'initiator', 100: 'initiator', 103: 'initiator',
  107: 'initiator', 120: 'initiator', 128: 'initiator', 129: 'initiator',
  136: 'initiator', 137: 'initiator',
  // support
  3: 'support', 5: 'support', 26: 'support', 27: 'support',
  30: 'support', 31: 'support', 37: 'support', 50: 'support',
  57: 'support', 58: 'support', 64: 'support', 66: 'support',
  68: 'support', 75: 'support', 79: 'support', 83: 'support',
  84: 'support', 85: 'support', 86: 'support', 87: 'support',
  90: 'support', 91: 'support', 101: 'support', 102: 'support',
  110: 'support', 111: 'support', 112: 'support', 121: 'support',
  // durable_core
  28: 'durable_core', 29: 'durable_core', 49: 'durable_core', 60: 'durable_core',
  69: 'durable_core', 98: 'durable_core', 99: 'durable_core', 108: 'durable_core',
  135: 'durable_core',
}

export function archetypeFor(heroId: number): HeroArchetype {
  return HERO_ARCHETYPES[heroId] ?? 'caster_nuker'
}
