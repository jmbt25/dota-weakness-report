import bundledHeroes from '../data/heroes.json'
import type { ODHero } from '../types'
import { classifyHeroById, type HeroRole } from './heroRoles'

/**
 * In-memory map of OpenDota heroes. Populated synchronously at module
 * load from src/data/heroes.json (refreshed weekly via
 * scripts/refresh-heroes.mjs).
 *
 * Pre-v1.7 this was populated async via App.tsx's fetchHeroes() — that
 * raced with the /breakdowns prose pipeline's `useMemo([detail])` blocks,
 * causing hero IDs to bake in as "Hero N" literals when the fetch
 * hadn't resolved by mount time. The bug surfaced in Phase 7 review on
 * the OBSERVATION pull-quote ("gpk~ (Hero 13) finished 15/1/16"). The
 * static import eliminates the race; new heroes between weekly
 * refreshes still resolve once the JSON is regenerated and committed.
 */
const heroById: Map<number, ODHero> = new Map()
for (const h of bundledHeroes as ODHero[]) {
  heroById.set(h.id, h)
}

/** Kept exported for backward compatibility. The heroes index is now
 *  bundled — calling this just merges any additional heroes into the
 *  same map. Useful for tests + the runtime fetch fallback if it's
 *  ever re-introduced. */
export function setHeroes(heroes: ODHero[]) {
  for (const h of heroes) heroById.set(h.id, h)
}

export function getHeroName(id: number): string {
  return heroById.get(id)?.localized_name ?? `Hero ${id}`
}

export function getHero(id: number): ODHero | undefined {
  return heroById.get(id)
}

/**
 * Heuristic for whether a hero is typically played as a farm-dependent core
 * (used to guard suggestions like "try a Hand of Midas timing").
 */
export function isFarmCore(id: number): boolean {
  return heroPlaystyle(id) === 'core'
}

/**
 * Per-hero typical pub role: 'core' | 'support' | 'flex'.
 *
 * Reads from the hardcoded HERO_ROLES table — works even before /heroes
 * has finished loading, since the table keys on hero ID directly.
 */
export function heroPlaystyle(id: number): HeroRole {
  return classifyHeroById(id)
}
