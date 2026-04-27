// Roast templates per card — English. (Taglish lives in
// `honest-mode/taglish-templates.ts` as a paid-tier feature, not yet
// wired to the UI.)
//
// Voice rules:
//   1. Roast the DECISION, never the person.
//   2. Every line cites a stat from the user's data — `validateRoastTemplate`
//      enforces this at module load (a template without any `{stat}`
//      placeholder is filtered out and warned in the console).
//   3. Allowed targets: hero pool spread, item choices, build patterns,
//      death timing, lane play, queue habits, stack composition,
//      post-loss requeue speed.
//   4. Forbidden: telling them to quit, attacks on intelligence/worth/
//      appearance/identity, attacks on friends as people, prescribing
//      fixes for behaviors we don't measure (TP scrolls, draft reading,
//      damage-vs-utility item splits, etc.).

import type { AnalysisId, AnalysisResult } from '../types'

export interface RoastTemplate {
  /** Returns true when this template is eligible for this card's data. */
  condition: (
    result: AnalysisResult,
    facts: Record<string, string | number>
  ) => boolean
  english: string
}

// Helper predicates so condition functions stay readable.
const isConcerning = (r: AnalysisResult) => r.severity === 'concerning'
const isWatch = (r: AnalysisResult) => r.severity === 'ok'
const isHealthy = (r: AnalysisResult) => r.severity === 'good'
const isStrong = (r: AnalysisResult) => r.severityLabel === 'Strong'

export const ROAST_TEMPLATES: Partial<Record<AnalysisId, RoastTemplate[]>> = {
  // ─── Death timing ─────────────────────────────────────────────────────
  'death-timing': [
    {
      condition: (r) => isConcerning(r),
      english:
        "You die {deaths_per_game}x per game. At this point your hero is just farming the enemy team's gold for them.",
    },
    {
      condition: (r, f) => isConcerning(r) && Number(f.late_dpg ?? 0) >= 1.4,
      english:
        "Your 40-50min death rate is {late_dpg}x baseline. The hero pool of dead heroes is bigger than your actual hero pool.",
    },
    {
      condition: (r) => isConcerning(r),
      english:
        "{deaths_per_game} deaths/game vs {baseline_dpg} baseline, worst window {worst_window} min. Your hero is a fountain regular.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{deaths_per_game} deaths/game, baseline {baseline_dpg}. Slightly leaky — your hero spends more time at fountain than at Roshan.",
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      english:
        "{deaths_per_game} deaths/game, baseline {baseline_dpg}. Surviving is half the gameplay loop and you've got it down.",
    },
    {
      condition: (r) => isStrong(r),
      english:
        "{deaths_per_game} deaths/game vs {baseline_dpg} baseline. You almost respect your own buyback timer.",
    },
  ],

  // ─── Farm efficiency ──────────────────────────────────────────────────
  'farm-efficiency': [
    {
      condition: (r) => isConcerning(r),
      english:
        "GPM @20 is {gpm}, baseline is {baseline_gpm}. You're not farming, you're foraging.",
    },
    {
      condition: (r, f) => isConcerning(r) && Number(f.lh_at_10 ?? 99) < 35,
      english:
        "{lh_at_10} last hits at 10 min. The creeps die of old age before you can right-click them.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "GPM @20 is {gpm}, baseline {baseline_gpm}. {lh_at_10} LH @10 — the lane stage is where the deficit compounds.",
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      english:
        "{gpm} GPM @20 vs {baseline_gpm} baseline. Farm hits the bar — that {lh_at_10} LH @10 is the foundation.",
    },
    {
      condition: (r) => isStrong(r),
      english:
        "{gpm} GPM @20 vs {baseline_gpm} baseline. You farm like the enemy team is a paid sparring partner.",
    },
  ],

  // ─── Item timing ──────────────────────────────────────────────────────
  'item-timing': [
    {
      condition: (r) => isConcerning(r),
      english:
        "{item} at {actual_min} min vs {target_min} target. By the time you finish it, the meta has changed.",
    },
    {
      condition: (r) => isConcerning(r),
      english:
        "On {hero}, your {item} lands at minute {actual_min} ({target_min} is the target). The window for that spike already closed two patches ago.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{hero} → {item} median {actual_min} min, target {target_min}. That's the build hitting late, not on schedule.",
    },
    {
      condition: (r) => isHealthy(r),
      english:
        "{hero}: {item} on time at {actual_min} min (target {target_min}). The spike landed — the next thing to grade is whether you used it.",
    },
  ],

  // ─── Situational items ────────────────────────────────────────────────
  'situational-items': [
    {
      condition: (r, f) => isConcerning(r) && String(f.pattern ?? '') === 'stunlock',
      english:
        "BKB miss rate {miss_rate}% across {n} stunlock games. You skipped BKB so many times Valve thinks you're testing a new build.",
    },
    {
      condition: (r, f) => isConcerning(r) && String(f.pattern ?? '').startsWith('magic'),
      english:
        "{miss_rate}% miss rate on Pipe/BKB across {n} magic-burst games. The enemy nukers know your build before you do.",
    },
    {
      condition: (r) => isConcerning(r),
      english:
        "Your {pattern} counter miss rate is {miss_rate}% across {n} games. That's not a build, that's a coin flip.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{miss_rate}% miss rate on the {pattern} counter ({n} games). You see the threat, you just don't itemize for it.",
    },
    {
      condition: (r) => isHealthy(r),
      english:
        "Build adapts to enemy lineups across {parsed_count} parsed matches. No recurring missed counters — the rare W in the situational-build column.",
    },
  ],

  // ─── Lane outcome ─────────────────────────────────────────────────────
  'lane-outcome': [
    {
      condition: (r) => isConcerning(r),
      english:
        "Won lane in {wins}/{total_lanes} games ({wr_pct}%). The 6-min mark hits and you've already filed for unemployment.",
    },
    {
      condition: (r) => isConcerning(r),
      english:
        "{wr_pct}% lane WR ({wins}/{total_lanes}). Most of those losses are pre-decided in the first wave equilibrium.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "Lane WR {wr_pct}% ({wins}/{total_lanes}). One pull cycle every 53 seconds and this card flips next week.",
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      english:
        "{wins}/{total_lanes} fixed lanes won ({wr_pct}%). The first 10 minutes already pay for themselves.",
    },
    {
      condition: (r) => isStrong(r),
      english:
        "{wr_pct}% lane WR ({wins}/{total_lanes}). The offlaner reports you for matchmaking abuse before the 5-min mark.",
    },
  ],

  // ─── Hero pool ────────────────────────────────────────────────────────
  'hero-pool': [
    {
      condition: (r) => isConcerning(r),
      english:
        "{hero_count} different heroes in {games} games. You're not picking heroes, you're speed-dating them.",
    },
    {
      condition: (r, f) => isConcerning(r) && Number(f.top_wr ?? 100) < 45,
      english:
        "Top hero is {top_hero} at {top_wr}% WR. The hero is asking for a divorce.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{hero_count} heroes / {games} games, top hero {top_hero} ({top_wr}%). Pick 5, ignore the rest, climb.",
    },
    {
      condition: (r) => isHealthy(r),
      english:
        "{hero_count} heroes / {games} games — focused. Top hero {top_hero} carrying its weight at {top_wr}% WR.",
    },
  ],

  // ─── Tilt / loss streak ───────────────────────────────────────────────
  // v7 variants: high-streak-with-bad-bounce (queue addiction), big
  // post-loss WR drop (free-fall), borderline (current mild). Each cites
  // a stat from the analysis.
  tilt: [
    {
      // Queue-addiction: long streak AND meaningfully worse post-loss WR.
      condition: (r, f) =>
        isConcerning(r) &&
        Number(f.streak ?? 0) >= 4 &&
        Number(f.post_loss ?? 100) <= Number(f.overall ?? 0) - 10,
      english:
        "Longest streak {streak}, post-loss WR {post_loss}% vs {overall}% overall. The queue button is your worst enemy.",
    },
    {
      // Free-fall: post-loss WR is far below overall, regardless of streak.
      condition: (_r, f) =>
        Number(f.post_loss ?? 100) <= Number(f.overall ?? 0) - 15,
      english:
        "Post-loss WR {post_loss}% vs overall {overall}%. You don't tilt — you free-fall.",
    },
    {
      // Generic concerning fallback.
      condition: (r) => isConcerning(r),
      english:
        "Post-loss WR is {post_loss}%, overall {overall}%, longest streak {streak}. The pattern is doing more damage than the matchmaker.",
    },
    {
      // Borderline / Watch — keep mild.
      condition: (r) => isWatch(r),
      english:
        "Bounce-back is fine ({post_loss}% vs {overall}%) but you hit a {streak}-game streak. Two losses, ten-min break.",
    },
    {
      // Healthy.
      condition: (r) => isHealthy(r),
      english:
        "Longest streak {streak}, post-loss WR {post_loss}% vs {overall}% overall. You queue like an adult.",
    },
  ],

  // ─── Stack synergy ────────────────────────────────────────────────────
  // Templates use {best_partner} / {worst_partner} which are filled with
  // the (possibly anonymized) display name in StackSynergyCard, so honest
  // mode honors the same "Show partner names" toggle that default mode
  // does.
  'stack-synergy': [
    {
      // Concerning + has a significant negative partner — name them.
      condition: (r, f) => isConcerning(r) && f.worst_partner != null,
      english:
        "{worst_partner}: {worst_wr}% WR ({worst_delta}pp vs solo). The friendship is real, the synergy is fictional.",
    },
    {
      // Concerning + best partner exists but underperforms.
      condition: (r, f) => isConcerning(r) && f.best_partner != null,
      english:
        "Best stack partner is {best_partner} at +{best_delta}pp. Solid in isolation; not enough to carry a window of mixed pickings.",
    },
    {
      // Watch — both best and worst named.
      condition: (r, f) => isWatch(r) && f.best_partner != null && f.worst_partner != null,
      english:
        "{best_partner} carries the synergy ({best_delta}pp), {worst_partner} drags it ({worst_delta}pp). Reshuffle the role pairs.",
    },
    {
      // Watch — only best is sig.
      condition: (r, f) => isWatch(r) && f.best_partner != null,
      english:
        "{best_partner} pulls the stack up ({best_delta}pp). The rest are within noise — keep the duo, fill around it.",
    },
    {
      // Healthy — name the carry.
      condition: (r, f) => isHealthy(r) && f.best_partner != null,
      english:
        "{best_partner}: {best_wr}% WR (+{best_delta}pp). Lock this person in, ignore everyone else in your friends list.",
    },
  ],

  // ─── Vision ────────────────────────────────────────────────────────────
  // Headline metric is role-specific: support/flex graded on obs/game,
  // core graded on dewards/game. Templates cite the relevant stat plus
  // shared sub-metrics (lifetime, mismatch) when conditions allow.
  vision: [
    {
      // Support / flex placing fewer obs than baseline.
      condition: (r, f) =>
        isConcerning(r) && String(f.role ?? '') !== 'core',
      english:
        "{obs}/game observers (baseline {obs_baseline}). The fog of war is winning.",
    },
    {
      // Core neglecting dewards.
      condition: (r, f) => isConcerning(r) && String(f.role ?? '') === 'core',
      english:
        "{dewards} dewards/game vs {dewards_baseline}. The enemy team appreciates your hands-off vision policy.",
    },
    {
      // High vision-death mismatch — only fires when the mismatch was
      // actually computed and is meaningfully high.
      condition: (_r, f) => Number(f.mismatch ?? 0) >= 30,
      english:
        "{mismatch}% of your deaths in unwarded regions. The map shows where you ward; the body count shows where you don't.",
    },
    {
      // Wards die fast — surfaces when avg lifetime trails baseline by 60s+.
      condition: (_r, f) =>
        Number(f.seconds ?? 0) > 0 &&
        Number(f.seconds ?? 999) <= Number(f.lifetime_baseline_sec ?? 0) - 60,
      english:
        "Wards live {seconds}s on average. Your vision investments have the half-life of a tweet.",
    },
    {
      // Watch — generic role-aware fallback.
      condition: (r) => isWatch(r),
      english:
        "{headline} {role} on the headline vs {headline_baseline} bracket. Vision is leaking points you could be banking.",
    },
    {
      // Healthy.
      condition: (r) => isHealthy(r),
      english:
        "{headline} on the headline vs {headline_baseline}. Vision input is on-pace — now spot-check whether your wards see anything important.",
    },
  ],
}
