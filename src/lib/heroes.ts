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
