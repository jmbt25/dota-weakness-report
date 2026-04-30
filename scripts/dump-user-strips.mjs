// One-off harness for Phase B gate review of v1.9.0 user-comparison
// strips. Imports the compiled module-equivalents inline (the source
// uses TS-only imports, so we transpile via tsx). Prints:
//   1. Self-test pass/fail
//   2. Sample renders for every (template × mode) pair against the
//      shared fixture data
//
// Run via: npx tsx scripts/dump-user-strips.mjs
//
// Not committed to the build pipeline — Phase B is a gate-review
// artifact, not an automated test.

import { buildUserStrip, __test__ } from '../src/lib/breakdownsProse/userStrips.ts'

const { fixtureUserData, SELF_TEST_CASES } = __test__

const heroes = {
  5: 'Crystal Maiden',
  18: 'Sven',
  31: 'Lich',
  123: 'Hoodwink',
  14: 'Pudge',
  19: 'Tiny',
  29: 'Tidehunter',
  44: 'Phantom Assassin',
}
const resolveHeroName = (id) => heroes[id] ?? `Hero ${id}`

const data = fixtureUserData()

console.log('=== userStrips Phase B self-test ===\n')
console.log('Fixture user (Crusader 3, support-leaning):')
console.log(`  pos1: ${data.user_per_position[1].game_count} games`)
console.log(`  pos2: ${data.user_per_position[2].game_count} games (sub-5 → suppress)`)
console.log(`  pos3: ${data.user_per_position[3].game_count} games (small-sample bucket)`)
console.log(`  pos4: ${data.user_per_position[4].game_count} games`)
console.log(`  pos5: ${data.user_per_position[5].game_count} games (CM 5g → hero match)`)
console.log()

console.log(`=== Self-test cases (${SELF_TEST_CASES.length}) ===\n`)

let passed = 0
let failed = 0
for (const tc of SELF_TEST_CASES) {
  // Apply per-test fixture overrides (mirrors runSelfTest in
  // userStrips.ts). Without this, harness re-runs always use the base
  // fixture and miss cases like at-bracket KDA where the override is
  // load-bearing.
  const tcFixture = (tc.userOverrides || tc.bracketOverrides)
    ? {
        ...data,
        user_per_position: {
          ...data.user_per_position,
          [tc.position]: {
            ...data.user_per_position[tc.position],
            ...(tc.userOverrides ?? {}),
          },
        },
        bracket_per_position: {
          ...data.bracket_per_position,
          [tc.position]: {
            ...data.bracket_per_position[tc.position],
            ...(tc.bracketOverrides ?? {}),
          },
        },
      }
    : data
  const result = buildUserStrip({
    templateId: tc.templateId,
    facts: tc.facts,
    userCompareData: tcFixture,
    honestMode: tc.honestMode,
    resolveHeroName,
  })

  let ok = true
  let reason = ''
  if (tc.expect.kind === 'null') {
    if (result !== null) {
      ok = false
      reason = `expected null, got "${result}"`
    }
  } else {
    if (result == null) {
      ok = false
      reason = 'expected render, got null'
    } else {
      if (/\{[A-Za-z_][\w]*\}/.test(result)) {
        ok = false
        reason = `leftover placeholder: "${result}"`
      }
      const need = tc.expect.kind === 'render' ? (tc.expect.mustContain ?? []) : []
      for (const tok of need) {
        if (!result.includes(tok)) {
          ok = false
          reason = `missing "${tok}"`
          break
        }
      }
      const banned = tc.expect.kind === 'render'
        ? (tc.expect.mustNotContain ?? [])
        : tc.expect.kind === 'fallback'
          ? tc.expect.mustNotContain
          : []
      if (ok) {
        for (const tok of banned) {
          if (result.includes(tok)) {
            ok = false
            reason = `forbidden "${tok}" in: "${result}"`
            break
          }
        }
      }
    }
  }

  if (ok) {
    passed += 1
    const display = result === null ? '(suppressed)' : `"${result}"`
    console.log(`  PASS  ${tc.name}\n        ${display}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${tc.name}`)
    console.log(`        reason: ${reason}`)
    console.log(`        got: ${result === null ? '(null)' : `"${result}"`}`)
  }
}

console.log(`\nTotal: ${passed}/${SELF_TEST_CASES.length} passed, ${failed} failed`)

console.log('\n\n=== Sample renders: every template × mode ===\n')

const sampleSpecs = [
  // vision
  { templateId: 'vision_output_low', facts: { position: 5, hero: 'CM', obs_placed: 1 }, label: 'pos 5, user 6.8 vs bracket 5.2 → "already ahead"' },
  { templateId: 'vision_output_low', facts: { position: 4, hero: 'Hoodwink', obs_placed: 2 }, label: 'pos 4, user 5.0 vs bracket 5.5 → "tracking with" (within 0.5 tol)' },
  // five_slot
  { templateId: 'five_slot_timing_outlier', facts: { position: 1, hero: 'Sven', hero_id: 18, five_slot_time: '18:30', match_core_median_time: '24:30', delta_min: -6 }, label: 'pos 1, hero match (Sven, 4 user games)' },
  { templateId: 'five_slot_timing_outlier', facts: { position: 3, hero: 'Tide', hero_id: 29, five_slot_time: '18:30', match_core_median_time: '24:30', delta_min: -6 }, label: 'pos 3, no hero match (Tide, 0 user games)' },
  { templateId: 'five_slot_timing_outlier', facts: { position: 5, hero: 'CM', hero_id: 5, five_slot_time: '18:30', match_core_median_time: '24:30', delta_min: -6 }, label: 'pos 5, suppressed (bracket has no support five-slot data)' },
  // kda
  { templateId: 'kda_extreme', facts: { position: 5, kills: 18, deaths: 3, assists: 7, kda: '8.3', rank: 'highest' }, label: 'pos 5 highest, pro KDA 8.3 (KDA-only fallback path)' },
  { templateId: 'kda_extreme', facts: { position: 1, kills: 4, deaths: 12, assists: 5, kda: '0.8', rank: 'lowest' }, label: 'pos 1 lowest, pro KDA 0.8 (small sample on user)' },
  // The marquee paired branch — needs synthetic-fixture user with low
  // KDA + high TF at the same position. Magsasaka's real pos 4 (kda
  // 2.0, tf 62%) vs synthetic bracket (kda 3.0, tf 50%) would trigger
  // it. Below: a hand-crafted ProseFire that exercises this branch.
  { templateId: 'kda_extreme', facts: { position: 4, kills: 2, deaths: 8, assists: 14, kda: '2.0', rank: 'lowest', teamfight_pct: 88 }, label: 'pos 4 paired branch (low KDA + high TF) — but won\'t trigger on this fixture (user 62/bracket 60 within 5pp tol). Documents the would-fire input shape.' },
  // tf
  { templateId: 'teamfight_participation_rank', facts: { position: 4, hero: 'Hoodwink', teamfight_pct: 78, rank: 'highest' }, label: 'pos 4, user 62 vs bracket 60 → "already ahead" (just above tol)' },
  { templateId: 'teamfight_participation_rank', facts: { position: 5, teamfight_pct: 32, rank: 'lowest' }, label: 'pos 5, user 58 vs bracket 56 → "already ahead"' },
  // lane_eff
  { templateId: 'lane_efficiency_extreme', facts: { position: 1, hero: 'PA', hero_id: 44, lane_eff_pct: 92, core_count: 4, rank: 'highest' }, label: 'pos 1, pro 92 vs user 65 vs bracket 75 (small sample)' },
  { templateId: 'lane_efficiency_extreme', facts: { position: 3, hero: 'Tide', hero_id: 29, lane_eff_pct: 35, core_count: 4, rank: 'lowest' }, label: 'pos 3, pro 35 vs user 55 vs bracket 60 (small sample)' },
]

for (const spec of sampleSpecs) {
  console.log(`--- ${spec.templateId} :: ${spec.label} ---`)
  for (const honestMode of [false, true]) {
    const out = buildUserStrip({
      templateId: spec.templateId,
      facts: spec.facts,
      userCompareData: data,
      honestMode,
      resolveHeroName,
    })
    const tag = honestMode ? 'honest' : 'default'
    console.log(`  [${tag}]  ${out === null ? '(suppressed)' : out}`)
  }
  console.log()
}

console.log('\n=== KDA paired-branch demo (low KDA + high TF — marquee editorial path) ===\n')

// Hand-craft a UserCompareData where pos 4 user has low KDA + high TF,
// against a bracket with higher KDA and lower TF. Triggers the
// "shows up but trades poorly" template that the spec called out as
// the most editorial of the new register.
const pairedFixture = {
  ...data,
  user_per_position: {
    ...data.user_per_position,
    4: {
      ...data.user_per_position[4],
      kda: 1.4,    // user low KDA
      tf_pct: 82,  // user high TF
    },
  },
  bracket_per_position: {
    ...data.bracket_per_position,
    4: {
      ...data.bracket_per_position[4],
      kda: 2.6,    // bracket higher KDA
      tf_pct: 65,  // bracket lower TF
    },
  },
}
const pairedDefault = buildUserStrip({
  templateId: 'kda_extreme',
  facts: { position: 4, kills: 14, deaths: 4, assists: 8, kda: '5.5', rank: 'highest', teamfight_pct: 75 },
  userCompareData: pairedFixture,
  honestMode: false,
  resolveHeroName,
})
const pairedHonest = buildUserStrip({
  templateId: 'kda_extreme',
  facts: { position: 4, kills: 14, deaths: 4, assists: 8, kda: '5.5', rank: 'highest', teamfight_pct: 75 },
  userCompareData: pairedFixture,
  honestMode: true,
  resolveHeroName,
})
console.log('Inputs: user pos 4 KDA 1.4 + TF 82%; bracket KDA 2.6 + TF 65%; pro KDA 5.5')
console.log(`  [default]  ${pairedDefault}`)
console.log(`  [honest]   ${pairedHonest}`)

// At-bracket demo — Phase E calibration: honest mode suppresses, falls
// to default-mode neutral strip.
const atBracketFixture = {
  ...data,
  user_per_position: {
    ...data.user_per_position,
    2: { ...data.user_per_position[2], game_count: 12, kda: 4.0, tf_pct: 64 },
  },
  bracket_per_position: {
    ...data.bracket_per_position,
    2: { ...data.bracket_per_position[2], kda: 4.0 },
  },
}
const atBracketDefault = buildUserStrip({
  templateId: 'kda_extreme',
  facts: { position: 2, kills: 18, deaths: 2, assists: 12, kda: '15.0', rank: 'highest', teamfight_pct: 80 },
  userCompareData: atBracketFixture,
  honestMode: false,
  resolveHeroName,
})
const atBracketHonest = buildUserStrip({
  templateId: 'kda_extreme',
  facts: { position: 2, kills: 18, deaths: 2, assists: 12, kda: '15.0', rank: 'highest', teamfight_pct: 80 },
  userCompareData: atBracketFixture,
  honestMode: true,
  resolveHeroName,
})
console.log()
console.log('At-bracket demo: user pos 2 KDA 4.0 == bracket KDA 4.0 (within 0.3 tol)')
console.log(`  [default]  ${atBracketDefault}`)
console.log(`  [honest]   ${atBracketHonest}  ← Phase E fix: honest mode suppresses, falls to default`)

// And the inverse (high KDA + low TF — "survives by avoiding")
const inverseFixture = {
  ...data,
  user_per_position: {
    ...data.user_per_position,
    4: {
      ...data.user_per_position[4],
      kda: 4.2,    // user high KDA
      tf_pct: 38,  // user low TF
    },
  },
  bracket_per_position: {
    ...data.bracket_per_position,
    4: {
      ...data.bracket_per_position[4],
      kda: 2.6,
      tf_pct: 65,
    },
  },
}
const inverseHonest = buildUserStrip({
  templateId: 'kda_extreme',
  facts: { position: 4, kills: 8, deaths: 5, assists: 10, kda: '3.6', rank: 'highest', teamfight_pct: 72 },
  userCompareData: inverseFixture,
  honestMode: true,
  resolveHeroName,
})
console.log()
console.log('Inputs: user pos 4 KDA 4.2 + TF 38%; bracket KDA 2.6 + TF 65%; pro KDA 3.6')
console.log(`  [honest]   ${inverseHonest}`)

console.log('\n=== Anti-bleed regex check on all rendered output ===\n')
// Confirm no pro hero name leaks into output. The fixture facts include
// hero names like "Crystal Maiden" / "Sven" / "Hoodwink"; assert these
// only appear in output when explicitly part of the hero-match path
// (which legitimately renders the user's own hero name when it matches
// the pro's).
const proNames = ['Sven', 'Hoodwink', 'Lich', 'PA', 'Tide']
for (const spec of sampleSpecs) {
  for (const honestMode of [false, true]) {
    const out = buildUserStrip({
      templateId: spec.templateId,
      facts: spec.facts,
      userCompareData: data,
      honestMode,
      resolveHeroName,
    })
    if (!out) continue
    for (const name of proNames) {
      if (out.includes(name)) {
        // The five_slot hero-match path is the only sanctioned source
        // of hero names in strip output. It resolves via
        // resolveHeroName(facts.hero_id), NOT via facts.hero. Exempt
        // any heroId that the fixture has user data on (i.e. the hero
        // match path is legitimately rendering the user's own hero
        // name, which happens to also be the pro's same hero).
        if (spec.templateId === 'five_slot_timing_outlier'
            && (spec.facts.hero_id === 5 || spec.facts.hero_id === 18)) continue
        console.log(`  WARN  ${spec.templateId} (${honestMode ? 'honest' : 'default'}) leaked "${name}": "${out}"`)
      }
    }
  }
}
console.log('  (no other leaks above this line = anti-bleed clean)')

if (failed > 0) {
  process.exit(1)
}
