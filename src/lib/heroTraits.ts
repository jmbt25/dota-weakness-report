// Hero → enemy-threat traits.
//
// Used by the Situational items analysis to detect "the enemy lineup had
// 2+ stunlock / magic burst / etc." patterns and check whether the user
// built the canonical counter item.
//
// TODO: this is the v1 80% pass. Worth expanding by going through each
// hero's current spell kit per patch — initiation/burst patterns shift
// (e.g. Slark talent reshuffles, Marci role drift). Heroes with no listed
// traits are silently ignored, which is fine — we only ever count threats
// that *are* present.
//
// Trait definitions:
//   stunlock          — reliable hard disables that BKB negates
//   magic_burst       — primary damage is magical, high single-spike potential
//   physical_carry    — strong physical right-clickers (need armor / HP / MKB)
//   evasion_or_blur   — has evasion or attack-miss (MKB matters)
//   silence           — reliable silences (BKB / Lotus / Eul's matters)
//   dispellable_buffs — buffs that strong dispel removes (Diffusal / Nullifier)
//   blink_initiation  — blink-into-ult combo that Force Staff can disrupt

export type HeroTrait =
  | 'stunlock'
  | 'magic_burst'
  | 'physical_carry'
  | 'evasion_or_blur'
  | 'silence'
  | 'dispellable_buffs'
  | 'blink_initiation'

const HERO_TRAITS: Record<number, HeroTrait[]> = {
  1: ['physical_carry'],                                           // Anti-Mage
  2: ['stunlock'],                                                 // Axe (Berserker's Call)
  3: ['stunlock', 'magic_burst'],                                  // Bane
  4: ['silence', 'physical_carry'],                                // Bloodseeker
  5: ['stunlock'],                                                 // Crystal Maiden
  6: ['silence', 'physical_carry'],                                // Drow Ranger
  7: ['stunlock', 'blink_initiation'],                             // Earthshaker
  8: ['physical_carry'],                                           // Juggernaut
  9: ['stunlock', 'evasion_or_blur'],                              // Mirana
  10: ['physical_carry'],                                          // Morphling
  11: ['magic_burst', 'physical_carry'],                           // Shadow Fiend
  12: ['physical_carry'],                                          // Phantom Lancer
  13: ['stunlock'],                                                // Puck (Cogs/silence are minor)
  14: ['stunlock'],                                                // Pudge (Hook + Dismember)
  15: [],                                                          // Razor
  16: ['stunlock', 'blink_initiation'],                            // Sand King
  17: ['stunlock', 'magic_burst'],                                 // Storm Spirit
  18: ['stunlock', 'physical_carry'],                              // Sven
  19: ['stunlock', 'blink_initiation'],                            // Tiny
  20: ['stunlock'],                                                // Vengeful Spirit
  21: ['evasion_or_blur'],                                         // Windranger (Windrun)
  22: ['magic_burst'],                                             // Zeus
  23: ['stunlock', 'blink_initiation'],                            // Kunkka
  25: ['stunlock', 'magic_burst'],                                 // Lina
  26: ['stunlock', 'magic_burst'],                                 // Lion
  27: ['stunlock'],                                                // Shadow Shaman
  28: ['stunlock', 'physical_carry'],                              // Slardar
  29: ['stunlock', 'blink_initiation'],                            // Tidehunter
  30: ['stunlock', 'magic_burst'],                                 // Witch Doctor
  31: ['magic_burst'],                                             // Lich
  32: ['evasion_or_blur', 'physical_carry'],                       // Riki (Smoke Screen miss)
  33: ['stunlock', 'blink_initiation'],                            // Enigma
  34: ['magic_burst'],                                             // Tinker
  35: ['physical_carry'],                                          // Sniper
  36: ['magic_burst'],                                             // Necrophos
  37: ['stunlock'],                                                // Warlock (Upheaval, Chaotic Offering)
  38: ['stunlock'],                                                // Beastmaster (Primal Roar)
  39: ['magic_burst'],                                             // Queen of Pain
  40: [],                                                          // Venomancer
  41: ['stunlock', 'evasion_or_blur', 'physical_carry', 'blink_initiation'], // Faceless Void
  42: ['stunlock', 'physical_carry'],                              // Wraith King
  43: ['silence'],                                                 // Death Prophet
  44: ['evasion_or_blur', 'physical_carry'],                       // Phantom Assassin
  45: ['magic_burst'],                                             // Pugna
  46: ['physical_carry'],                                          // Templar Assassin
  47: ['physical_carry'],                                          // Viper
  48: ['physical_carry'],                                          // Luna
  49: ['stunlock'],                                                // Dragon Knight (Dragon Tail)
  50: ['dispellable_buffs'],                                       // Dazzle (Shallow Grave is undispellable, but Bad Juju armor is)
  51: ['stunlock', 'blink_initiation'],                            // Clockwerk
  52: ['magic_burst'],                                             // Leshrac
  53: [],                                                          // Nature's Prophet
  54: ['physical_carry'],                                          // Lifestealer
  55: ['stunlock'],                                                // Dark Seer (Vacuum)
  56: ['physical_carry'],                                          // Clinkz
  57: ['dispellable_buffs'],                                       // Omniknight
  58: ['stunlock'],                                                // Enchantress (Untouchable miss is similar to evasion but small)
  59: ['silence', 'physical_carry'],                               // Huskar (Inner Vitality silence ish? skip — but he is a phys carry)
  60: ['silence'],                                                 // Night Stalker (Crippling Fear)
  61: ['physical_carry'],                                          // Broodmother
  62: ['stunlock'],                                                // Bounty Hunter (Shuriken Toss stun w/ talent)
  63: ['physical_carry'],                                          // Weaver
  64: ['stunlock', 'magic_burst'],                                 // Jakiro (Ice Path)
  65: ['stunlock'],                                                // Batrider (Flaming Lasso)
  66: ['stunlock'],                                                // Chen (Penitence is no, holy persuasion no — but talents/items)
  67: ['physical_carry'],                                          // Spectre
  68: ['stunlock'],                                                // Ancient Apparition (Cold Feet)
  69: ['silence'],                                                 // Doom (Doom = silence + mute + disarm)
  70: ['physical_carry'],                                          // Ursa
  71: ['stunlock'],                                                // Spirit Breaker
  72: ['physical_carry'],                                          // Gyrocopter
  73: ['stunlock', 'physical_carry'],                              // Alchemist (Acid Spray + Concoction)
  74: ['stunlock', 'magic_burst'],                                 // Invoker (Cold Snap, Sun Strike, EMP)
  75: ['silence'],                                                 // Silencer
  76: ['stunlock', 'magic_burst'],                                 // Outworld Destroyer (Astral Imprisonment)
  77: ['physical_carry'],                                          // Lycan
  78: ['evasion_or_blur'],                                         // Brewmaster (Drunken Haze miss)
  79: ['stunlock'],                                                // Shadow Demon (Disruption + Soul Catcher amplify)
  80: ['physical_carry'],                                          // Lone Druid
  81: ['stunlock', 'physical_carry'],                              // Chaos Knight
  82: ['stunlock'],                                                // Meepo (Earthbind)
  83: ['evasion_or_blur', 'dispellable_buffs'],                    // Treant Protector
  84: ['stunlock'],                                                // Ogre Magi
  85: [],                                                          // Undying
  86: ['stunlock'],                                                // Rubick (Telekinesis)
  87: ['silence', 'magic_burst'],                                  // Disruptor
  88: ['stunlock'],                                                // Nyx Assassin (Impale)
  89: ['stunlock', 'physical_carry'],                              // Naga Siren
  90: ['stunlock'],                                                // Keeper of the Light (Blinding Light)
  91: [],                                                          // Io
  92: [],                                                          // Visage
  93: ['physical_carry'],                                          // Slark
  94: ['stunlock', 'physical_carry'],                              // Medusa (Stone Gaze)
  95: ['physical_carry'],                                          // Troll Warlord
  96: ['stunlock', 'blink_initiation'],                            // Centaur
  97: ['stunlock', 'blink_initiation'],                            // Magnus
  98: [],                                                          // Timbersaw
  99: [],                                                          // Bristleback
  100: ['stunlock'],                                               // Tusk
  101: ['stunlock', 'magic_burst', 'silence'],                     // Skywrath Mage
  102: ['dispellable_buffs'],                                      // Abaddon (Aphotic Shield)
  103: ['stunlock'],                                               // Elder Titan
  104: ['stunlock', 'physical_carry'],                             // Legion Commander
  105: ['stunlock'],                                               // Techies (Stasis Trap, Sticky Bomb)
  106: ['stunlock', 'magic_burst'],                                // Ember Spirit (Searing Chains)
  107: ['stunlock'],                                               // Earth Spirit (Boulder Smash, Geomagnetic Grip)
  108: [],                                                         // Underlord
  109: ['physical_carry'],                                         // Terrorblade
  110: ['stunlock', 'magic_burst'],                                // Phoenix (Supernova stun)
  111: ['dispellable_buffs'],                                      // Oracle (False Promise, Fortune's End)
  112: ['stunlock'],                                               // Winter Wyvern (Winter's Curse)
  113: ['magic_burst', 'physical_carry'],                          // Arc Warden
  114: ['stunlock', 'physical_carry'],                             // Monkey King (Boundless Strike)
  119: ['stunlock', 'magic_burst'],                                // Dark Willow (Bramble Maze, Cursed Crown)
  120: ['stunlock'],                                               // Pangolier (Lucky Shot, Shield Crash)
  121: ['stunlock', 'magic_burst'],                                // Grimstroke (Soulbind, Phantom's Embrace)
  123: ['stunlock'],                                               // Hoodwink (Bushwhack, Sharpshooter)
  126: ['stunlock', 'magic_burst'],                                // Void Spirit (Aether Remnant)
  128: ['stunlock'],                                               // Snapfire (Mortimer Kisses, Lil' Shredder)
  129: ['stunlock'],                                               // Mars (Spear of Mars, Arena of Blood)
  135: ['stunlock'],                                               // Dawnbreaker (Solar Guardian, Celestial Hammer)
  136: ['stunlock'],                                               // Marci (Dispose)
  137: ['stunlock'],                                               // Primal Beast (Pulverize, Trample)
  138: ['magic_burst'],                                            // Muerta
}

export function heroTraits(id: number): HeroTrait[] {
  return HERO_TRAITS[id] ?? []
}
