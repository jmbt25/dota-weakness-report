// Refresh src/data/heroes.json from OpenDota's /heroes endpoint.
//
// Why bundle heroes statically:
//   /heroes was originally fetched at runtime via fetchHeroes() in
//   App.tsx, populating the heroById Map asynchronously. The /watch
//   feature's prose (Cat 1A/1B/2 + lead-line synthesis) builds heroName
//   strings inside `useMemo([detail])` blocks that run ONCE on mount.
//   If the runtime fetch hasn't resolved when the memo runs, every
//   hero string bakes in as "Hero {id}" and stays that way forever
//   (the memo doesn't re-run on the async fetch's completion).
//
//   Phase 7 review caught this bug appearing in the highest-visibility
//   surface — the OBSERVATION pull-quote at the top of every
//   /watch/{match_id} page was rendering "(Hero 13)" instead of
//   "(Puck)". Bundling /heroes at build time eliminates the race.
//
// Pipeline:
//   1. GET https://api.opendota.com/api/heroes (free tier, no key)
//   2. Validate the response shape (array of { id, name, localized_name, ... })
//   3. Write the array verbatim to src/data/heroes.json
//
// Failure semantics:
//   - HTTP non-2xx → exit 1, leave existing src/data/heroes.json
//   - empty array → exit 1
//   - schema mismatch → exit 1
//
// Manual run:
//   node scripts/refresh-heroes.mjs
//
// Refresh cadence: heroes are stable (1-2 new heroes per year). The GH
// Actions workflow runs weekly Mondays alongside the meta + pro
// corpus refreshes; a fresher cadence is overkill but harmless.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'src', 'data')
const OUT_PATH = resolve(DATA_DIR, 'heroes.json')

async function main() {
  console.log('Fetching https://api.opendota.com/api/heroes ...')
  const res = await fetch('https://api.opendota.com/api/heroes')
  if (!res.ok) {
    console.error(`FATAL: HTTP ${res.status} from /heroes`)
    process.exit(1)
  }
  const heroes = await res.json()
  if (!Array.isArray(heroes) || heroes.length === 0) {
    console.error('FATAL: /heroes returned empty or non-array payload')
    process.exit(1)
  }
  // Schema sanity check on the first entry
  const sample = heroes[0]
  if (!sample || typeof sample.id !== 'number' || typeof sample.localized_name !== 'string') {
    console.error('FATAL: /heroes payload missing required fields (id, localized_name)')
    console.error('  Sample entry:', JSON.stringify(sample))
    process.exit(1)
  }

  // Newest hero IDs help spot-check freshness
  const sortedIds = heroes.map((h) => h.id).sort((a, b) => b - a)
  const maxId = sortedIds[0]
  const newest = heroes.find((h) => h.id === maxId)

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(heroes, null, 2) + '\n')

  console.log('')
  console.log(`✓ Wrote ${OUT_PATH}`)
  console.log(`  ${heroes.length} heroes total`)
  console.log(`  Newest: id=${maxId} → ${newest?.localized_name}`)
  console.log(`  Spot-check: hero 13 = ${heroes.find((h) => h.id === 13)?.localized_name}`)
  console.log(`  Spot-check: hero 138 = ${heroes.find((h) => h.id === 138)?.localized_name}`)
}

main().catch((e) => {
  console.error('FATAL:', e?.message ?? e)
  process.exit(1)
})
