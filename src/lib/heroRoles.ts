// Hero → typical pub-position role.
//
// 'core'    — pos 1/2/3 in modern pubs essentially always
// 'support' — pos 4/5 in modern pubs essentially always
// 'flex'    — meaningfully played both ways depending on draft/team
//
// We hardcode every hero rather than derive from OpenDota's role tags
// (which over-tag "Carry" — Spirit Breaker, Earth Spirit, Nyx all get
// Carry tags but are pos 4 in pubs). The table changes slowly; new
// heroes ship maybe 1-2 per year.

import type { ODHero } from '../types'

export type HeroRole = 'core' | 'support' | 'flex'

const HERO_ROLES: Record<number, HeroRole> = {
  1: 'core',     // Anti-Mage
  2: 'core',     // Axe — offlane
  3: 'support',  // Bane
  4: 'core',     // Bloodseeker
  5: 'support',  // Crystal Maiden
  6: 'core',     // Drow Ranger
  7: 'flex',     // Earthshaker
  8: 'core',     // Juggernaut
  9: 'flex',     // Mirana
  10: 'core',    // Morphling
  11: 'core',    // Shadow Fiend — mid
  12: 'core',    // Phantom Lancer
  13: 'core',    // Puck — mid
  14: 'flex',    // Pudge
  15: 'core',    // Razor
  16: 'flex',    // Sand King
  17: 'core',    // Storm Spirit — mid
  18: 'core',    // Sven
  19: 'flex',    // Tiny
  20: 'support', // Vengeful Spirit
  21: 'flex',    // Windranger
  22: 'flex',    // Zeus — mid mostly, sometimes 5
  23: 'flex',    // Kunkka — mid/off
  25: 'flex',    // Lina — mid/sup
  26: 'support', // Lion
  27: 'support', // Shadow Shaman
  28: 'core',    // Slardar — offlane
  29: 'core',    // Tidehunter — offlane
  30: 'support', // Witch Doctor
  31: 'support', // Lich
  32: 'flex',    // Riki
  33: 'core',    // Enigma — off mostly
  34: 'core',    // Tinker — mid
  35: 'core',    // Sniper
  36: 'flex',    // Necrophos — mid/sup
  37: 'support', // Warlock
  38: 'core',    // Beastmaster — off
  39: 'core',    // Queen of Pain — mid
  40: 'flex',    // Venomancer — off/sup
  41: 'core',    // Faceless Void
  42: 'core',    // Wraith King
  43: 'core',    // Death Prophet — off/mid
  44: 'core',    // Phantom Assassin
  45: 'flex',    // Pugna — mid/sup
  46: 'core',    // Templar Assassin — mid
  47: 'core',    // Viper
  48: 'core',    // Luna
  49: 'core',    // Dragon Knight — mid/off
  50: 'support', // Dazzle
  51: 'flex',    // Clockwerk — pos 4/off
  52: 'core',    // Leshrac — mid
  53: 'flex',    // Nature's Prophet — off/4
  54: 'core',    // Lifestealer
  55: 'core',    // Dark Seer — off
  56: 'core',    // Clinkz
  57: 'flex',    // Omniknight — off/sup
  58: 'support', // Enchantress
  59: 'core',    // Huskar — mid
  60: 'core',    // Night Stalker — off
  61: 'core',    // Broodmother
  62: 'support', // Bounty Hunter — pos 4
  63: 'core',    // Weaver
  64: 'support', // Jakiro
  65: 'flex',    // Batrider — off/4
  66: 'support', // Chen
  67: 'core',    // Spectre
  68: 'support', // Ancient Apparition
  69: 'core',    // Doom — off
  70: 'core',    // Ursa
  71: 'flex',    // Spirit Breaker — pos 4 mostly, sometimes carry
  72: 'core',    // Gyrocopter
  73: 'core',    // Alchemist — mid
  74: 'core',    // Invoker — mid
  75: 'support', // Silencer
  76: 'core',    // Outworld Destroyer — mid
  77: 'core',    // Lycan
  78: 'flex',    // Brewmaster — off/4
  79: 'support', // Shadow Demon
  80: 'core',    // Lone Druid
  81: 'core',    // Chaos Knight
  82: 'core',    // Meepo — mid
  83: 'support', // Treant Protector
  84: 'support', // Ogre Magi
  85: 'flex',    // Undying — off/sup
  86: 'support', // Rubick — pos 4-5 mostly
  87: 'support', // Disruptor
  88: 'support', // Nyx Assassin — pos 4 since talents reshuffled
  89: 'core',    // Naga Siren
  90: 'support', // Keeper of the Light
  91: 'support', // Io
  92: 'flex',    // Visage — mid/off/sometimes sup
  93: 'core',    // Slark
  94: 'core',    // Medusa
  95: 'core',    // Troll Warlord
  96: 'core',    // Centaur — off
  97: 'flex',    // Magnus — off/4
  98: 'core',    // Timbersaw — off
  99: 'core',    // Bristleback — off
  100: 'flex',   // Tusk
  101: 'support',// Skywrath Mage
  102: 'flex',   // Abaddon — off/sup
  103: 'support',// Elder Titan — pos 4-5 mostly
  104: 'core',   // Legion Commander — off
  105: 'support',// Techies — post-rework support
  106: 'core',   // Ember Spirit — mid
  107: 'flex',   // Earth Spirit
  108: 'core',   // Underlord — off
  109: 'core',   // Terrorblade
  110: 'support',// Phoenix
  111: 'support',// Oracle
  112: 'support',// Winter Wyvern
  113: 'core',   // Arc Warden — mid
  114: 'core',   // Monkey King
  119: 'support',// Dark Willow
  120: 'flex',   // Pangolier — off/4
  121: 'support',// Grimstroke
  123: 'support',// Hoodwink — pos 4
  126: 'core',   // Void Spirit — mid
  128: 'support',// Snapfire — pos 4 mostly
  129: 'core',   // Mars — off
  135: 'core',   // Dawnbreaker — off mostly
  136: 'flex',   // Marci — off/4
  137: 'core',   // Primal Beast — off
  138: 'flex',   // Muerta — mid/sup
}

/**
 * Look up a hero's typical pub role. Returns 'flex' for unknown IDs (newer
 * heroes that haven't been added to the table yet).
 */
export function classifyHero(hero: ODHero | undefined): HeroRole {
  if (!hero) return 'flex'
  return HERO_ROLES[hero.id] ?? fallbackFromTags(hero)
}

export function classifyHeroById(id: number): HeroRole {
  return HERO_ROLES[id] ?? 'flex'
}

/** Fallback for unknown hero IDs — uses OpenDota tags as a best guess. */
function fallbackFromTags(hero: ODHero): HeroRole {
  const roles = hero.roles ?? []
  const hasSupport = roles.includes('Support')
  const hasCarry = roles.includes('Carry')
  if (hasSupport && !hasCarry) return 'support'
  if (hasCarry && !hasSupport) return 'core'
  return 'flex'
}
