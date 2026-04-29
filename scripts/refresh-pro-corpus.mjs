// Refresh src/data/pro-vectors.json from OpenDota.
//
// Pulls last-50-match summaries + 15-sample match details for each pro in
// scripts/pro-corpus-list.json, computes their playstyle vector via
// build-pro-vectors.mjs's exported computeVector, and writes the entire
// corpus + a last_updated timestamp to src/data/pro-vectors.json.
//
// Pipeline:
//   1. read scripts/pro-corpus-list.json (curated 60-pro shortlist)
//   2. for each pro: 1 list call + 15 detail calls = 16 calls/pro
//   3. on success: write the new corpus JSON in one atomic step
//   4. on failure: exit non-zero with a clear cause; the existing JSON is
//      untouched (no partial writes)
//
// Failure semantics (per project direction — fail loudly, no silent partial
// data):
//   - 429 with "daily" in the body → exit 1, "DAILY CAP HIT" message
//   - 429 with "minute" in the body → log + retry once with backoff (the
//     1.2s pace shouldn't trigger this, but transient bursts are possible)
//   - 521/522/524 (Cloudflare upstream) → exit 1, "OPENDOTA UPSTREAM DOWN"
//   - any other HTTP non-2xx → exit 1 with the path + status
//   - any uncaught exception → exit 1 with the stack
//
// The GitHub Actions workflow (.github/workflows/refresh-pro-corpus.yml)
// catches non-zero exits and surfaces them via the default failure-
// notification channel. No PR opens on failure — old data keeps serving.
//
// Manual run:
//   node scripts/refresh-pro-corpus.mjs
//
// No API key, no env vars. Free-tier only.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// RATE_LIMIT_MS pacing iteration history (so future maintenance doesn't
// "optimize" it back into 429-cascade territory):
//   1200ms (50/min sustained): theoretically safe at OpenDota's 60/min
//     ceiling, but in practice 429-cascaded after ~10 minutes of sustained
//     traffic. The rolling 60s window seems to drift on their end.
//   1800ms (33/min sustained, current): completes a 1024-call corpus build
//     without hitting minute-cap. Combined with the 65s backoff retry in
//     build-pro-vectors.mjs's fetchJson, transient bursts auto-recover.
//   Don't drop below 1500ms without a fresh round of empirical testing.
import {
  computeVector,
  fetchJson,
  RATE_LIMIT_MS,
  SAMPLE_DETAIL_COUNT,
} from './build-pro-vectors.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CORPUS_LIST = resolve(__dirname, 'pro-corpus-list.json')
const DATA_DIR = resolve(__dirname, '..', 'src', 'data')
const OUT_PATH = resolve(DATA_DIR, 'pro-vectors.json')

function isUpstreamDown(message) {
  return /HTTP 5(21|22|24)/.test(message)
}

function isDailyCap(message) {
  return /HTTP 429/.test(message) && /daily/i.test(message)
}

function isMinuteCap(message) {
  return /HTTP 429/.test(message) && /minute/i.test(message)
}

function classifyError(error) {
  const msg = error?.message ?? String(error)
  if (isDailyCap(msg)) return { kind: 'daily_cap', message: msg }
  if (isMinuteCap(msg)) return { kind: 'minute_cap', message: msg }
  if (isUpstreamDown(msg)) return { kind: 'upstream_down', message: msg }
  return { kind: 'other', message: msg }
}

async function buildOnePro(entry) {
  // entry: { account_id, name, personaname, team, country, fantasy_role, last_match }
  console.log(`\n[${entry.name}] account=${entry.account_id} team=${entry.team}`)
  const matches = await fetchJson(`players/${entry.account_id}/matches?limit=50`)
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error(`empty matches list for ${entry.name} (${entry.account_id})`)
  }
  const sampledIds = matches.slice(0, SAMPLE_DETAIL_COUNT).map((m) => m.match_id)
  const details = {}
  for (let i = 0; i < sampledIds.length; i++) {
    const id = sampledIds[i]
    const d = await fetchJson(`matches/${id}`)
    details[id] = d
    if ((i + 1) % 5 === 0) console.log(`  details ${i + 1}/${sampledIds.length}`)
  }
  const profile = null // personaname comes from the curated list
  const vector = computeVector(profile, matches, details, entry.account_id)
  if (vector.error || !vector.raw) {
    throw new Error(`computeVector returned no usable result for ${entry.name}: ${vector.error ?? 'no raw'}`)
  }
  return {
    account_id: entry.account_id,
    name: entry.name,
    team: entry.team,
    country: entry.country,
    fantasy_role: entry.fantasy_role,
    match_count: vector.match_count,
    detail_count: vector.detail_count,
    raw: vector.raw,
  }
}

async function main() {
  const list = JSON.parse(readFileSync(CORPUS_LIST, 'utf8'))
  if (!Array.isArray(list.entries) || list.entries.length === 0) {
    console.error('FATAL: scripts/pro-corpus-list.json has no entries')
    process.exit(1)
  }
  const totalCalls = list.entries.length * (1 + SAMPLE_DETAIL_COUNT)
  console.log(`Pro corpus refresh — ${list.entries.length} pros × ${1 + SAMPLE_DETAIL_COUNT} calls = ${totalCalls} total`)
  console.log(`Pacing: ${RATE_LIMIT_MS}ms/call → ETA ~${Math.ceil((totalCalls * RATE_LIMIT_MS) / 1000 / 60)} min`)
  console.log(`Free-tier daily cap is 2000/day; this run is ${totalCalls} calls.\n`)

  const vectors = []
  const failures = []
  for (let i = 0; i < list.entries.length; i++) {
    const entry = list.entries[i]
    try {
      const v = await buildOnePro(entry)
      vectors.push(v)
      console.log(`  ✓ ${entry.name} (${i + 1}/${list.entries.length})  match_count=${v.match_count} detail_count=${v.detail_count}`)
    } catch (e) {
      const c = classifyError(e)
      console.error(`  ✗ ${entry.name}: ${c.kind} :: ${c.message.slice(0, 200)}`)
      failures.push({ entry, ...c })
      if (c.kind === 'daily_cap') {
        console.error('\n=== DAILY CAP HIT ===')
        console.error('OpenDota has rejected our calls citing daily quota exhaustion.')
        console.error(`Built ${vectors.length}/${list.entries.length} vectors before stopping.`)
        console.error('This run failed. The existing src/data/pro-vectors.json is untouched.')
        console.error('Wait until UTC midnight tomorrow and re-run, or split the corpus.')
        process.exit(1)
      }
      if (c.kind === 'upstream_down') {
        console.error('\n=== OPENDOTA UPSTREAM DOWN ===')
        console.error('OpenDota origin is unreachable (Cloudflare 521/522/524).')
        console.error(`Built ${vectors.length}/${list.entries.length} vectors before stopping.`)
        console.error('This run failed. The existing src/data/pro-vectors.json is untouched.')
        console.error('Retry in 5-15 min once OpenDota recovers.')
        process.exit(1)
      }
      // Per-pro errors that don't fall into the abort-categories above:
      // log and continue. We tolerate up to 5 individual-pro failures; more
      // than that and the corpus is degraded and we abort.
      if (failures.length > 5) {
        console.error(`\n=== TOO MANY PER-PRO FAILURES (${failures.length}) — aborting ===`)
        for (const f of failures) console.error(`  - ${f.entry.name}: ${f.kind} :: ${f.message.slice(0, 120)}`)
        process.exit(1)
      }
    }
  }

  if (vectors.length === 0) {
    console.error('FATAL: 0 vectors built; refusing to write empty corpus.')
    process.exit(1)
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

  const corpus = {
    last_updated: new Date().toISOString(),
    source: 'scripts/refresh-pro-corpus.mjs',
    pro_count: vectors.length,
    expected_count: list.entries.length,
    failed_count: failures.length,
    failed_pros: failures.map((f) => ({ name: f.entry.name, account_id: f.entry.account_id, kind: f.kind })),
    vectors,
  }
  writeFileSync(OUT_PATH, JSON.stringify(corpus, null, 2) + '\n')
  console.log(`\n=== DONE ===`)
  console.log(`Wrote ${OUT_PATH}`)
  console.log(`Successful: ${vectors.length}/${list.entries.length}`)
  if (failures.length > 0) {
    console.log(`Failures (logged in corpus.failed_pros):`)
    for (const f of failures) console.log(`  - ${f.entry.name}: ${f.kind}`)
  }
}

main().catch((e) => {
  const c = classifyError(e)
  console.error(`\nFATAL: ${c.kind} :: ${c.message}`)
  if (c.kind === 'other' && e?.stack) console.error(e.stack)
  process.exit(1)
})
