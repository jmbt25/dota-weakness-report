// Session-level helpers — bucketing matches into back-to-back play sessions
// for the Tilt card's "WR by session position" sub-finding and for the MMR
// Math page's games-per-day estimate.

import type { ODMatchSummary } from '../types'
import { didWin } from './matchHelpers'

/** Two hours between match starts → new session. */
const SESSION_GAP_SEC = 2 * 60 * 60

export interface SessionPositionWR {
  /** 1, 2, 3, or 4 (where 4 means "4th game or later in session"). */
  position: 1 | 2 | 3 | 4
  games: number
  wins: number
  /** 0..1 */
  wr: number
}

export interface SessionStats {
  /** Position buckets, only those with games >= 1. */
  buckets: SessionPositionWR[]
  /** Total number of games we placed in a session of >= 3 games. */
  longSessionGames: number
  /** Average games per active day across the window. Uses the set of
   *  unique calendar dates the user actually queued on, NOT the time-span
   *  divided by the window — otherwise we'd double-count idle days. */
  gamesPerActiveDay: number
  /** Number of distinct calendar days the user played on. */
  activeDays: number
  /** Number of distinct sessions across the window. */
  sessionCount: number
}

/**
 * Bucket matches into sessions (gaps of >= 2h between match starts split a
 * session) and compute WR by ordinal position within each session, plus
 * games-per-day stats. Only the WR card uses the buckets; MMR Math uses
 * `gamesPerActiveDay`.
 */
export function computeSessionStats(matches: ODMatchSummary[]): SessionStats {
  if (matches.length === 0) {
    return {
      buckets: [],
      longSessionGames: 0,
      gamesPerActiveDay: 0,
      activeDays: 0,
      sessionCount: 0,
    }
  }
  const ordered = [...matches].sort((a, b) => a.start_time - b.start_time)

  const sessions: ODMatchSummary[][] = []
  let cur: ODMatchSummary[] = [ordered[0]]
  for (let i = 1; i < ordered.length; i++) {
    const m = ordered[i]
    const prev = ordered[i - 1]
    if (m.start_time - prev.start_time > SESSION_GAP_SEC) {
      sessions.push(cur)
      cur = [m]
    } else {
      cur.push(m)
    }
  }
  sessions.push(cur)

  // Position buckets: 1, 2, 3, 4+ (only count from sessions of >= 3 games).
  const tally: Record<1 | 2 | 3 | 4, { games: number; wins: number }> = {
    1: { games: 0, wins: 0 },
    2: { games: 0, wins: 0 },
    3: { games: 0, wins: 0 },
    4: { games: 0, wins: 0 },
  }
  let longSessionGames = 0
  for (const s of sessions) {
    if (s.length < 3) continue
    longSessionGames += s.length
    for (let i = 0; i < s.length; i++) {
      const pos = (i + 1 >= 4 ? 4 : (i + 1)) as 1 | 2 | 3 | 4
      tally[pos].games++
      if (didWin(s[i])) tally[pos].wins++
    }
  }
  const buckets: SessionPositionWR[] = ([1, 2, 3, 4] as const)
    .map((p) => ({
      position: p,
      games: tally[p].games,
      wins: tally[p].wins,
      wr: tally[p].games > 0 ? tally[p].wins / tally[p].games : 0,
    }))
    .filter((b) => b.games > 0)

  // Active-day stats use ALL sessions, not just long ones.
  const dates = new Set<string>()
  for (const m of ordered) {
    const d = new Date(m.start_time * 1000)
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    dates.add(key)
  }
  const activeDays = dates.size
  const gamesPerActiveDay = activeDays > 0 ? ordered.length / activeDays : 0

  return {
    buckets,
    longSessionGames,
    gamesPerActiveDay,
    activeDays,
    sessionCount: sessions.length,
  }
}
