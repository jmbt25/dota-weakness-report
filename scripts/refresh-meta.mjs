// Refresh src/data/meta-current.json from OpenDota /heroStats.
//
// Run weekly via .github/workflows/refresh-meta.yml. The script:
//   1. fetches /heroStats from OpenDota (free tier, no key required)
//   2. transforms it into our { id, name, wr, pick } per-bracket shape
//   3. rotates: meta-current.json → meta-previous.json
//   4. writes the fresh snapshot to meta-current.json
//
// The two-snapshot setup (current + previous) lets metaData.ts compute
// week-over-week WR momentum, which is the proxy for "skill buffs/nerfs
// + item buffs/nerfs" landing in the tier score. We don't parse patch
// notes — the consequence shows up in WR delta, and that's what tier
// reflects.
//
// Failure semantics: if the fetch fails, the script exits non-zero and
// the existing JSONs are untouched. The Action records a failure but no
// downstream damage; old data keeps serving until the next successful run.

import { writeFileSync, existsSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'src', 'data')
const CURRENT = resolve(DATA_DIR, 'meta-current.json')
const PREVIOUS = resolve(DATA_DIR, 'meta-previous.json')

const HERO_STATS_URL = 'https://api.opendota.com/api/heroStats'

async function fetchHeroStats() {
  const res = await fetch(HERO_STATS_URL)
  if (!res.ok) {
    throw new Error(`heroStats fetch failed: HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Transform OpenDota's raw heroStats response into our snapshot shape.
 *
 * OpenDota returns per-bracket pick/win COUNTS (1_pick, 1_win .. 8_pick,
 * 8_win) where the digit is the bracket number (1=Herald .. 8=Immortal).
 * We compute:
 *   wr[bracket]   = wins / picks                       (0..1)
 *   pick[bracket] = picks / (totalPicksInBracket / 10) (0..1)
 *                   ← share of games this hero appears in. 10 is the
 *                     hero count per match (5v5).
 */
function transform(rawHeroes) {
  // First pass: total picks per bracket. Used to normalize pick rate.
  const totals = {}
  for (let b = 1; b <= 8; b++) {
    let s = 0
    for (const h of rawHeroes) s += h[`${b}_pick`] ?? 0
    totals[b] = s
  }

  // OpenDota's free /heroStats endpoint collapses Immortal-bracket games
  // into Divine — bracket 8 returns 0 picks/wins for every hero. Detect
  // that case and alias bracket 8 to bracket 7 so the Immortal view in
  // the UI still shows useful (combined) numbers instead of zeros.
  const bracket8Empty = totals[8] === 0

  const heroes = rawHeroes
    .filter((h) => h && h.id != null && h.localized_name)
    .map((h) => {
      const wr = {}
      const pick = {}
      for (let b = 1; b <= 8; b++) {
        const picks = Number(h[`${b}_pick`] ?? 0)
        const wins = Number(h[`${b}_win`] ?? 0)
        wr[b] = picks > 0 ? wins / picks : 0
        pick[b] = totals[b] > 0 ? picks / (totals[b] / 10) : 0
      }
      if (bracket8Empty) {
        // Mirror bracket 7 (Divine+Immortal combined) into bracket 8 so
        // the Immortal selector shows real data. The UI flags this as
        // combined data via the `bracket8_aliased` snapshot field.
        wr[8] = wr[7]
        pick[8] = pick[7]
      }
      return {
        id: h.id,
        name: h.localized_name,
        wr,
        pick,
      }
    })
    // Sort by id so JSON diffs stay readable across refreshes.
    .sort((a, b) => a.id - b.id)

  return {
    fetched_at: new Date().toISOString(),
    source: HERO_STATS_URL,
    hero_count: heroes.length,
    bracket8_aliased: bracket8Empty,
    heroes,
  }
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function isMeaningfulChange(prev, next) {
  // Skip the commit if only the timestamp changed. Refreshes can happen
  // mid-day with no new aggregate movement; we don't want to spam the
  // git history.
  if (!prev) return true
  try {
    const a = JSON.parse(readFileSync(prev, 'utf8'))
    const aHeroes = JSON.stringify(a.heroes)
    const bHeroes = JSON.stringify(next.heroes)
    return aHeroes !== bHeroes
  } catch {
    return true
  }
}

async function main() {
  ensureDir()

  console.log(`Fetching ${HERO_STATS_URL}…`)
  const raw = await fetchHeroStats()
  const snapshot = transform(raw)
  console.log(`Got ${snapshot.hero_count} heroes.`)

  const fresh = JSON.stringify(snapshot, null, 2) + '\n'

  if (!isMeaningfulChange(CURRENT, snapshot)) {
    console.log('No change in hero data since last refresh — skipping write.')
    return
  }

  if (existsSync(CURRENT)) {
    copyFileSync(CURRENT, PREVIOUS)
    console.log('Rotated: meta-current.json → meta-previous.json')
  } else {
    // First-ever run. Seed previous with the same data so momentum
    // computes to 0 instead of NaN.
    writeFileSync(PREVIOUS, fresh)
    console.log('Bootstrap: wrote meta-previous.json (seeded with current)')
  }

  writeFileSync(CURRENT, fresh)
  console.log('Wrote meta-current.json')
}

main().catch((err) => {
  console.error('refresh-meta failed:', err.message ?? err)
  process.exit(1)
})
