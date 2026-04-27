import type { ODHero } from '../types'

/** In-memory cache of the OpenDota /heroes response. */
let heroById: Map<number, ODHero> | null = null

export function setHeroes(heroes: ODHero[]) {
  const m = new Map<number, ODHero>()
  for (const h of heroes) m.set(h.id, h)
  heroById = m
}

export function getHeroName(id: number): string {
  return heroById?.get(id)?.localized_name ?? `Hero ${id}`
}

export function getHero(id: number): ODHero | undefined {
  return heroById?.get(id)
}

/**
 * Heuristic for whether a hero is typically played as a farm-dependent core
 * (used to guard suggestions like "try a Hand of Midas timing").
 *
 * OpenDota tags heroes with roles like "Carry", "Nuker", "Support". We treat
 * heroes flagged Carry as farm cores.
 */
export function isFarmCore(id: number): boolean {
  const hero = heroById?.get(id)
  if (!hero) return false
  return hero.roles.includes('Carry')
}

/**
 * Heuristic classification of a hero as core-vs-support.
 *
 * Returns 'support' if "Support" is in the role list AND "Carry" is not.
 * Pure flex picks (Beastmaster, Mirana etc) end up as 'core' — close enough
 * for the role-detection heuristic that drives baseline selection.
 */
export function heroPlaystyle(id: number): 'core' | 'support' | 'unknown' {
  const hero = heroById?.get(id)
  if (!hero) return 'unknown'
  const roles = hero.roles
  const isSupport = roles.includes('Support')
  const isCarry = roles.includes('Carry')
  if (isSupport && !isCarry) return 'support'
  return 'core'
}
