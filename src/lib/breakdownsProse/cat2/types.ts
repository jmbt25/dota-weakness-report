// Shared types for Cat 2 match-level templates.
//
// Cat 2 fires on every match regardless of corpus coverage — this is the
// floor that makes /breakdowns/{match_id} feel complete even when no players
// are in the corpus. Each sub-section (draft / lane / midgame /
// teamfights) is its own module; the runner combines them.

import type { MatchContext, ProseFire } from '../cat1b'

export interface Cat2Template {
  id: string
  /** Used by Phase 7 lead-line synthesis. Match-level templates carry
   *  pre-tagged emphasis weight per spec §2.5 (decisive teamfight >
   *  5-slot timing > T1 timing). */
  priority: number
  produce: (
    ctx: MatchContext
  ) => { text: string; facts: Record<string, string | number> } | null
}

export interface Cat2Output {
  draft: ProseFire[]
  lane: ProseFire[]
  midgame: ProseFire[]
  teamfights: ProseFire[]
}

/**
 * Typed-return helper for templates with multiple branches. Without
 * this, TypeScript narrows the inferred return type into a union of
 * literal types where unused branches' fact keys appear as
 * `?: undefined` — incompatible with `Record<string, string | number>`.
 *
 * Each template branch wraps its return in `fire(text, facts)` and TS
 * widens via the parameter type.
 */
export function fire(
  text: string,
  facts: Record<string, string | number>
): { text: string; facts: Record<string, string | number> } {
  return { text, facts }
}
