import type { ODHero } from '../types'
import { classifyHero, type HeroRole } from './heroRoles'

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
 */
export function isFarmCore(id: number): boolean {
  return heroPlaystyle(id) === 'core'
}

/**
 * Per-hero typical pub role: 'core' | 'support' | 'flex'. Returns 'flex'
 * if the heroes index hasn't loaded yet — better than guessing wrong.
 */
export function heroPlaystyle(id: number): HeroRole {
  return classifyHero(heroById?.get(id))
}
