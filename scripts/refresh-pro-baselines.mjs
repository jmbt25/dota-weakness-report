// Refresh src/data/pro-baselines.json from OpenDota.
//
// Per-player rolling baselines for the /breakdowns feature's Category 1A prose
// (cross-match observations like "hasn't won a lane in 5 games"). For each
// pro in scripts/pro-baselines-list.json, pulls a 30-day match window plus
// a sampled subset of full match details, computes rolling aggregates,
// and writes the entire corpus + a generated_at timestamp to
// src/data/pro-baselines.json.
//
// Pipeline per pro:
//   1. /players/{id}/matches?limit=100  (1 call, summary fields)
//   2. filter to last WINDOW_DAYS (30) — needs >= MIN_MATCHES_IN_WINDOW (5)
//      to produce a useful baseline, otherwise this player is skipped
//   3. /matches/{id} × SAMPLE_DETAIL_COUNT (15 calls) for parsed-only
//      fields (obs_log, sen_log, teamfight_participation,
//      lane_efficiency_pct)
// Total ≈ 16 calls/pro × 80 pros = 1280 calls.
//
// Rate limiting:
//   - With OPENDOTA_API_KEY in env (premium tier, 3000/min): pace at 100ms
//     (~10/sec). Full refresh in ~2-3 min.
//   - Without key (free tier, 60/min): pace at 1800ms (~33/min sustained,
//     same conservative pace as refresh-pro-corpus.mjs). Full refresh in
//     ~38 min. Worth it for the first bootstrap; ongoing weekly refreshes
//     should use the key.
//
// Output shape: see src/data/pro-baselines.json after the first successful
// run, or the v1 spec doc (docs/breakdowns-feature-v1-spec.md §3.3).
//
// Failure semantics (mirror refresh-pro-corpus.mjs):
//   - 429 with "daily" → exit 1, "DAILY CAP HIT" message
//   - 429 with "minute" → log + retry once with 65s backoff
//   - 521/522/524 → exit 1, "OPENDOTA UPSTREAM DOWN"
//   - any other HTTP non-2xx → exit 1 with the path + status
//   - > 5 individual per-pro failures → exit 1 with the list
//   - on success: atomic write to src/data/pro-baselines.json
//   - on failure: existing JSON untouched
//
// CLI:
//   node scripts/refresh-pro-baselines.mjs              # full refresh
//   node scripts/refresh-pro-baselines.mjs --limit 3    # first N entries (test mode)
//
// Env:
//   OPENDOTA_API_KEY   optional; switches to premium-tier rate limit

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LIST_PATH = resolve(__dirname, 'pro-baselines-list.json')
const DATA_DIR = resolve(__dirname, '..', 'src', 'data')
const OUT_PATH = resolve(DATA_DIR, 'pro-baselines.json')

const API_KEY = process.env.OPENDOTA_API_KEY || null

// Pacing — see header comment for rationale.
const RATE_LIMIT_MS = API_KEY ? 100 : 1800
const MINUTE_BACKOFF_MS = 65_000
const MAX_RETRY = 2

const WINDOW_DAYS = 30
const MIN_MATCHES_IN_WINDOW = 5
const SAMPLE_DETAIL_COUNT = 15

// HERO_ROLES — mirrored from src/lib/heroRoles.ts (and scripts/build-pro-vectors.mjs).
// Used by classifyPos to disambiguate flex-hero positions when lane data is
// ambiguous. When a new patch ships a new hero, update src/lib/heroRoles.ts
// FIRST, then mirror here AND in build-pro-vectors.mjs.
const HERO_ROLES = {
  1: 'core', 2: 'core', 3: 'support', 4: 'core', 5: 'support', 6: 'core',
  7: 'flex', 8: 'core', 9: 'flex', 10: 'core', 11: 'core', 12: 'core',
  13: 'core', 14: 'flex', 15: 'core', 16: 'flex', 17: 'core', 18: 'core',
  19: 'flex', 20: 'support', 21: 'flex', 22: 'flex', 23: 'flex', 25: 'flex',
  26: 'support', 27: 'support', 28: 'core', 29: 'core', 30: 'support',
  31: 'support', 32: 'flex', 33: 'core', 34: 'core', 35: 'core', 36: 'flex',
  37: 'support', 38: 'core', 39: 'core', 40: 'flex', 41: 'core', 42: 'core',
  43: 'core', 44: 'core', 45: 'flex', 46: 'core', 47: 'core', 48: 'core',
  49: 'core', 50: 'support', 51: 'flex', 52: 'core', 53: 'flex', 54: 'core',
  55: 'core', 56: 'core', 57: 'flex', 58: 'support', 59: 'core', 60: 'core',
  61: 'core', 62: 'support', 63: 'core', 64: 'support', 65: 'flex',
  66: 'support', 67: 'core', 68: 'support', 69: 'core', 70: 'core',
  71: 'flex', 72: 'core', 73: 'core', 74: 'core', 75: 'support', 76: 'core',
  77: 'core', 78: 'flex', 79: 'support', 80: 'core', 81: 'core', 82: 'core',
  83: 'support', 84: 'support', 85: 'flex', 86: 'support', 87: 'support',
  88: 'support', 89: 'core', 90: 'support', 91: 'support', 92: 'flex',
  93: 'core', 94: 'core', 95: 'core', 96: 'core', 97: 'flex', 98: 'core',
  99: 'core', 100: 'flex', 101: 'support', 102: 'flex', 103: 'support',
  104: 'core', 105: 'support', 106: 'core', 107: 'flex', 108: 'core',
  109: 'core', 110: 'support', 111: 'support', 112: 'support', 113: 'core',
  114: 'core', 119: 'support', 120: 'flex', 121: 'support', 123: 'support',
  126: 'core', 128: 'support', 129: 'core', 135: 'core', 136: 'flex',
  137: 'core', 138: 'flex',
}

// ---- HTTP ----

let lastCallAt = 0

async function fetchJson(path, retryCount = 0) {
  const wait = Math.max(0, lastCallAt + RATE_LIMIT_MS - Date.now())
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCallAt = Date.now()
  const url = new URL(`https://api.opendota.com/api/${path.replace(/^\//, '')}`)
  if (API_KEY) url.searchParams.set('api_key', API_KEY)
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 429 && /minute/i.test(body) && retryCount < MAX_RETRY) {
      console.log(`    [retry ${retryCount + 1}/${MAX_RETRY}] minute-rate-limit on ${path}, sleeping ${Math.round(MINUTE_BACKOFF_MS / 1000)}s...`)
      await new Promise((r) => setTimeout(r, MINUTE_BACKOFF_MS))
      return fetchJson(path, retryCount + 1)
    }
    throw new Error(`HTTP ${res.status} on ${path} :: ${body.slice(0, 120)}`)
  }
  return res.json()
}

// ---- helpers ----

function classifyPos(detail, player) {
  // Mirrors classifyPos in build-pro-vectors.mjs. lane: 1=safe, 2=mid,
  // 3=off, 4=jungle/roaming. Flex heroes resolved via lh/min when lane
  // is ambiguous. Returns 1..5 (pos 1 = safe carry, pos 5 = hard support).
  const heroId = player.hero_id
  const heroRole = HERO_ROLES[heroId] ?? 'flex'
  const lane = player.lane_role
  const roaming = player.is_roaming === true
  const lhPerMin = (player.last_hits ?? 0) / Math.max(detail.duration / 60, 1)

  if (lane === 2) return 2
  if (lane === 4 || roaming) return 4
  if (lane === 1) {
    if (heroRole === 'support') return 5
    if (heroRole === 'core') return 1
    return lhPerMin >= 4.5 ? 1 : 5
  }
  if (lane === 3) {
    if (heroRole === 'support') return 4
    if (heroRole === 'core') return 3
    return lhPerMin >= 4.0 ? 3 : 4
  }
  if (heroRole === 'support') return lhPerMin < 2 ? 5 : 4
  return lhPerMin >= 5 ? 1 : 3
}

function didWin(playerSlot, radiantWin) {
  const isRadiant = (playerSlot ?? 0) < 128
  return isRadiant === Boolean(radiantWin)
}

function obsPlacedCount(player) {
  if (Array.isArray(player.obs_log)) return player.obs_log.length
  return typeof player.obs_placed === 'number' ? player.obs_placed : 0
}

function senPlacedCount(player) {
  if (Array.isArray(player.sen_log)) return player.sen_log.length
  return typeof player.sen_placed === 'number' ? player.sen_placed : 0
}

function mean(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function round(n, places = 3) {
  if (n == null || !Number.isFinite(n)) return null
  const m = Math.pow(10, places)
  return Math.round(n * m) / m
}

function isUpstreamDown(message) { return /HTTP 5(21|22|24)/.test(message) }
function isDailyCap(message) { return /HTTP 429/.test(message) && /daily/i.test(message) }
function isMinuteCap(message) { return /HTTP 429/.test(message) && /minute/i.test(message) }

function classifyError(error) {
  const msg = error?.message ?? String(error)
  if (isDailyCap(msg)) return { kind: 'daily_cap', message: msg }
  if (isMinuteCap(msg)) return { kind: 'minute_cap', message: msg }
  if (isUpstreamDown(msg)) return { kind: 'upstream_down', message: msg }
  return { kind: 'other', message: msg }
}

// ---- per-pro pipeline ----

async function buildBaseline(entry) {
  console.log(`\n[${entry.name}] account=${entry.account_id} team=${entry.team}`)

  const matches = await fetchJson(`players/${entry.account_id}/matches?limit=100`)
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error(`empty matches list for ${entry.name}`)
  }

  const cutoffUnix = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400
  const inWindow = matches.filter((m) => typeof m.start_time === 'number' && m.start_time >= cutoffUnix)

  if (inWindow.length < MIN_MATCHES_IN_WINDOW) {
    console.log(`  ⊘ skip — only ${inWindow.length} matches in ${WINDOW_DAYS}d window (need ≥ ${MIN_MATCHES_IN_WINDOW})`)
    return { kind: 'skipped', reason: `only_${inWindow.length}_in_window` }
  }

  // Sort newest-first defensively (the API usually returns sorted but don't rely on it)
  inWindow.sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0))

  const sampledIds = inWindow.slice(0, SAMPLE_DETAIL_COUNT).map((m) => m.match_id)
  const details = []
  for (let i = 0; i < sampledIds.length; i++) {
    const id = sampledIds[i]
    try {
      const d = await fetchJson(`matches/${id}`)
      const me = (d.players ?? []).find((p) => p.account_id === entry.account_id)
      if (me) {
        details.push({ match: d, player: me })
      } else {
        console.warn(`  detail ${id}: account_id ${entry.account_id} not in players[]`)
      }
    } catch (e) {
      // Per-match detail failures don't kill the pro — we still have summary
      // data. Bubble up cap/upstream errors so the outer loop aborts properly.
      const c = classifyError(e)
      if (c.kind === 'daily_cap' || c.kind === 'upstream_down') throw e
      console.warn(`  detail ${id}: ${e.message}`)
    }
    if ((i + 1) % 5 === 0) console.log(`  details ${i + 1}/${sampledIds.length}`)
  }

  // ---- Aggregates ----

  // Rolling KDA (per-match KDA averaged across the full 30d window — k/d/a
  // are present in the summary records, so we get the larger sample here).
  const rolling_kda = mean(inWindow.map((m) => {
    const d = Math.max(m.deaths ?? 0, 1)
    return ((m.kills ?? 0) + (m.assists ?? 0)) / d
  }))

  // Farm stats — gold_per_min, xp_per_min, last_hits are NOT in the
  // /players/{id}/matches summary; they live on /matches/{id} player
  // records only. So these come from the 15-match detail subset, mirroring
  // the existing pro-corpus pattern in build-pro-vectors.mjs. Means smaller
  // sample (15 vs 23+) but the values are usable.
  const rolling_gpm = details.length > 0
    ? Math.round(mean(details.map((d) => d.player.gold_per_min ?? 0)))
    : null
  const rolling_xpm = details.length > 0
    ? Math.round(mean(details.map((d) => d.player.xp_per_min ?? 0)))
    : null
  const rolling_lh_per_min = details.length > 0
    ? round(
        details.reduce((s, d) => s + (d.player.last_hits ?? 0), 0) /
          Math.max(
            details.reduce((s, d) => s + ((d.match.duration ?? 0) / 60), 0),
            1
          ),
        1
      )
    : null

  // Vision + teamfight participation — parsed-only fields, from detail subset.
  // null when no usable detail samples landed.
  const rolling_obs_per_game = details.length > 0
    ? round(mean(details.map((d) => obsPlacedCount(d.player))), 2)
    : null
  const rolling_sen_per_game = details.length > 0
    ? round(mean(details.map((d) => senPlacedCount(d.player))), 2)
    : null
  const rolling_teamfight_part = details.length > 0
    ? round(mean(details.map((d) => d.player.teamfight_participation ?? 0)), 3)
    : null

  // Role distribution from the detail subset (need lane_role, which is parsed).
  const posCounts = [0, 0, 0, 0, 0]
  let validClassifications = 0
  for (const { match, player } of details) {
    const pos = classifyPos(match, player)
    if (pos >= 1 && pos <= 5) {
      posCounts[pos - 1]++
      validClassifications++
    }
  }
  const season_role_distribution = validClassifications > 0
    ? posCounts.map((c) => round(c / validClassifications, 3))
    : [0, 0, 0, 0, 0]

  // Hero pool from the full window (summary list — KDA per match available).
  const heroAcc = {}
  for (const m of inWindow) {
    const hid = m.hero_id
    if (!hid) continue
    const won = didWin(m.player_slot, m.radiant_win)
    const k = m.kills ?? 0, d = m.deaths ?? 0, a = m.assists ?? 0
    const kda = (k + a) / Math.max(d, 1)
    if (!heroAcc[hid]) heroAcc[hid] = { games: 0, wins: 0, kda_sum: 0 }
    heroAcc[hid].games += 1
    if (won) heroAcc[hid].wins += 1
    heroAcc[hid].kda_sum += kda
  }
  const recent_hero_pool = {}
  for (const [hid, h] of Object.entries(heroAcc)) {
    recent_hero_pool[hid] = {
      games: h.games,
      wins: h.wins,
      kda_avg: round(h.kda_sum / h.games, 2),
    }
  }

  // Lane outcomes from detail subset (lane_efficiency_pct is parsed-only).
  const recent_lane_outcomes = details.map(({ match, player }) => ({
    match_id: match.match_id,
    won: didWin(player.player_slot, match.radiant_win),
    lane_efficiency_pct: typeof player.lane_efficiency_pct === 'number'
      ? player.lane_efficiency_pct
      : null,
  }))

  // personaname: prefer entry.personaname (curated, current); fall back to
  // entry.name (the team-roster name).
  const personaname = entry.personaname || entry.name

  return {
    kind: 'ok',
    baseline: {
      personaname,
      team: entry.team,
      matches_in_window: inWindow.length,
      detail_samples: details.length,
      last_match_unix: inWindow[0].start_time,
      rolling_kda: round(rolling_kda, 2),
      rolling_gpm,
      rolling_xpm,
      rolling_lh_per_min,
      rolling_obs_per_game,
      rolling_sen_per_game,
      rolling_teamfight_part,
      season_role_distribution,
      recent_hero_pool,
      recent_lane_outcomes,
    },
  }
}

// ---- main ----

function parseCliArgs() {
  const args = process.argv.slice(2)
  const out = { limit: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') {
      out.limit = parseInt(args[i + 1], 10)
      i++
    }
  }
  return out
}

async function main() {
  const cli = parseCliArgs()
  const list = JSON.parse(readFileSync(LIST_PATH, 'utf8'))
  if (!Array.isArray(list.entries) || list.entries.length === 0) {
    console.error('FATAL: scripts/pro-baselines-list.json has no entries')
    process.exit(1)
  }

  const entries = cli.limit ? list.entries.slice(0, cli.limit) : list.entries
  const callsPerPro = 1 + SAMPLE_DETAIL_COUNT
  const totalCalls = entries.length * callsPerPro

  console.log('=== Pro baselines refresh ===')
  console.log(`Pros: ${entries.length}${cli.limit ? ` (--limit ${cli.limit} of ${list.entries.length})` : ''}`)
  console.log(`Calls/pro: ${callsPerPro} (1 summary + ${SAMPLE_DETAIL_COUNT} details)`)
  console.log(`Total calls: ${totalCalls}`)
  console.log(`API key: ${API_KEY ? 'PRESENT (premium tier)' : 'absent (free tier)'}`)
  console.log(`Pacing: ${RATE_LIMIT_MS}ms/call`)
  console.log(`ETA: ~${Math.ceil((totalCalls * RATE_LIMIT_MS) / 1000 / 60)} min`)
  console.log('')

  const baselines = {}
  const skipped = []
  const failures = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    try {
      const result = await buildBaseline(entry)
      if (result.kind === 'ok') {
        baselines[entry.account_id] = result.baseline
        console.log(`  ✓ ${entry.name} (${i + 1}/${entries.length})  matches=${result.baseline.matches_in_window} details=${result.baseline.detail_samples}`)
      } else if (result.kind === 'skipped') {
        skipped.push({ entry, reason: result.reason })
      }
    } catch (e) {
      const c = classifyError(e)
      console.error(`  ✗ ${entry.name}: ${c.kind} :: ${c.message.slice(0, 200)}`)
      failures.push({ entry, ...c })
      if (c.kind === 'daily_cap') {
        console.error('\n=== DAILY CAP HIT ===')
        console.error(`Built ${Object.keys(baselines).length}/${entries.length} baselines before stopping.`)
        console.error('Existing src/data/pro-baselines.json is untouched.')
        console.error('Wait until UTC midnight or supply OPENDOTA_API_KEY to bypass the cap.')
        process.exit(1)
      }
      if (c.kind === 'upstream_down') {
        console.error('\n=== OPENDOTA UPSTREAM DOWN ===')
        console.error(`Built ${Object.keys(baselines).length}/${entries.length} baselines before stopping.`)
        console.error('Existing src/data/pro-baselines.json is untouched. Retry in 5-15 min.')
        process.exit(1)
      }
      if (failures.length > 5) {
        console.error(`\n=== TOO MANY PER-PRO FAILURES (${failures.length}) — aborting ===`)
        for (const f of failures) console.error(`  - ${f.entry.name}: ${f.kind} :: ${f.message.slice(0, 120)}`)
        process.exit(1)
      }
    }
  }

  if (Object.keys(baselines).length === 0) {
    console.error('FATAL: 0 baselines built; refusing to write empty corpus.')
    process.exit(1)
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

  const corpus = {
    generated_at: new Date().toISOString(),
    source: 'scripts/refresh-pro-baselines.mjs',
    version: 1,
    window_days: WINDOW_DAYS,
    used_api_key: Boolean(API_KEY),
    expected_count: entries.length,
    corpus_size: Object.keys(baselines).length,
    skipped_count: skipped.length,
    skipped_pros: skipped.map((s) => ({ name: s.entry.name, account_id: s.entry.account_id, reason: s.reason })),
    failed_count: failures.length,
    failed_pros: failures.map((f) => ({ name: f.entry.name, account_id: f.entry.account_id, kind: f.kind })),
    players: baselines,
  }
  writeFileSync(OUT_PATH, JSON.stringify(corpus, null, 2) + '\n')

  console.log('\n=== DONE ===')
  console.log(`Wrote ${OUT_PATH}`)
  console.log(`Successful: ${Object.keys(baselines).length}/${entries.length}`)
  if (skipped.length > 0) {
    console.log(`Skipped (insufficient window): ${skipped.length}`)
    for (const s of skipped) console.log(`  - ${s.entry.name}: ${s.reason}`)
  }
  if (failures.length > 0) {
    console.log(`Failures (logged in corpus.failed_pros): ${failures.length}`)
    for (const f of failures) console.log(`  - ${f.entry.name}: ${f.kind}`)
  }
}

main().catch((e) => {
  const c = classifyError(e)
  console.error(`\nFATAL: ${c.kind} :: ${c.message}`)
  if (c.kind === 'other' && e?.stack) console.error(e.stack)
  process.exit(1)
})
