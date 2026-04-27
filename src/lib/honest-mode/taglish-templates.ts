// PAID TIER FEATURE — not yet wired to UI. Templates need user review
// before activation.
//
// This file is intentionally NOT imported by any UI component. It exists
// to preserve the v6 Taglish translation work for the eventual paid-tier
// rollout. When we ship this:
//
//   1. Wire it into honestMode.ts behind an `isPaid && language ===
//      'taglish'` check.
//   2. Re-introduce the Language radio in HonestModeToggle.tsx.
//   3. Re-audit each line for hallucinated behavior (same rules as the
//      English templates — every line must cite a measured stat, no
//      prescriptions for things we don't track like TP scrolls, draft
//      reading, or damage/utility item splits).
//   4. Run the placeholder validator on this file.
//
// Until then this file is dormant — no UI surfaces it.

import type { AnalysisId, AnalysisResult } from '../../types'

export interface TaglishRoastTemplate {
  condition: (
    result: AnalysisResult,
    facts: Record<string, string | number>
  ) => boolean
  taglish: string
}

const isConcerning = (r: AnalysisResult) => r.severity === 'concerning'
const isWatch = (r: AnalysisResult) => r.severity === 'ok'
const isHealthy = (r: AnalysisResult) => r.severity === 'good'
const isStrong = (r: AnalysisResult) => r.severityLabel === 'Strong'

export const TAGLISH_ROAST_TEMPLATES: Partial<Record<AnalysisId, TaglishRoastTemplate[]>> = {
  'death-timing': [
    {
      condition: (r) => isConcerning(r),
      taglish:
        '{deaths_per_game} deaths per game. Bro, libre kang nagpapagive ng gold sa kalaban.',
    },
    {
      condition: (r, f) => isConcerning(r) && Number(f.late_dpg ?? 0) >= 1.4,
      taglish:
        '{late_dpg}x baseline ang deaths mo sa late game. Akala mo dispenser ka ng buyback?',
    },
    {
      condition: (r) => isConcerning(r),
      taglish:
        '{deaths_per_game} deaths/game vs {baseline_dpg} baseline. Sa {worst_window} min ka pinakamasaya — sa fountain.',
    },
    {
      condition: (r) => isWatch(r),
      taglish:
        '{deaths_per_game} deaths/game, baseline {baseline_dpg}. Medyo malusot — mas matagal ka pa sa fountain kaysa sa Rosh.',
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      taglish:
        '{deaths_per_game} deaths/game, baseline {baseline_dpg}. Marunong kang mag-survive — kalahati lang yan ng laban.',
    },
    {
      condition: (r) => isStrong(r),
      taglish:
        '{deaths_per_game} deaths vs {baseline_dpg} baseline. Halos rinerespeto mo na yung sariling buyback mo.',
    },
  ],

  'farm-efficiency': [
    {
      condition: (r) => isConcerning(r),
      taglish:
        'GPM @20 mo ay {gpm}, baseline ay {baseline_gpm}. Hindi ka nag-fafarm, namamahinga ka lang sa lane.',
    },
    {
      condition: (r, f) => isConcerning(r) && Number(f.lh_at_10 ?? 99) < 35,
      taglish:
        '{lh_at_10} last hits sa 10 min. Mas maaga pang tumanda yung creeps kaysa makatama mo.',
    },
    {
      // NOTE: paid-tier audit needed — original v6 line referenced
      // ancient stacks specifically; that's prescriptive but reasonable.
      condition: (r) => isWatch(r),
      taglish:
        'GPM @20 mo ay {gpm}, baseline {baseline_gpm}. {lh_at_10} LH @10 — sa lane stage nagsisimula yung kakulangan.',
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      taglish:
        '{gpm} GPM @20 vs {baseline_gpm} baseline. Sapat ang farm — yung {lh_at_10} LH @10 mo, foundation niyan.',
    },
    {
      condition: (r) => isStrong(r),
      taglish:
        '{gpm} GPM @20 vs {baseline_gpm} baseline. Para kang may special exemption sa creep equilibrium.',
    },
  ],

  'item-timing': [
    {
      condition: (r) => isConcerning(r),
      taglish:
        '{item} sa minute {actual_min}, target {target_min}. Pagkatapos mo bumili, patch na ulit.',
    },
    {
      condition: (r) => isConcerning(r),
      taglish:
        'Sa {hero}, dumadating yung {item} sa minute {actual_min} (target {target_min}). Lampas na yung window ng spike mo, dalawang patch na ang nakalipas.',
    },
    {
      condition: (r) => isWatch(r),
      taglish:
        '{hero} → {item} median {actual_min} min, target {target_min}. Late ang dating ng build, hindi siya naka-schedule.',
    },
    {
      condition: (r) => isHealthy(r),
      taglish:
        '{hero}: {item} on time sa minute {actual_min} (target {target_min}). Dumating ang spike — ngayon ang tanong, ginamit mo ba.',
    },
  ],

  'situational-items': [
    {
      condition: (r, f) => isConcerning(r) && String(f.pattern ?? '') === 'stunlock',
      taglish:
        '{miss_rate}% miss rate sa BKB sa {n} games. Hindi mo binibili BKB kahit puro stun kalaban — laging surprised ka pag na-stunlock.',
    },
    {
      condition: (r, f) => isConcerning(r) && String(f.pattern ?? '').startsWith('magic'),
      taglish:
        '{miss_rate}% miss rate sa Pipe/BKB sa {n} magic-burst games. Mas kabisado pa ng kalaban yung build mo kaysa sayo.',
    },
    {
      condition: (r) => isConcerning(r),
      taglish:
        '{pattern} counter miss rate mo: {miss_rate}% sa {n} games. Hindi yan build, coin flip yan.',
    },
    {
      condition: (r) => isWatch(r),
      taglish:
        '{miss_rate}% miss rate sa {pattern} counter ({n} games). Nakikita mo yung threat, hindi mo lang ina-itemize.',
    },
    {
      condition: (r) => isHealthy(r),
      taglish:
        'Yung build mo nag-aadjust sa kalaban kada game ({parsed_count} parsed matches). Walang patuloy na missed counters — bihira ang W sa situational column.',
    },
  ],

  'lane-outcome': [
    {
      condition: (r) => isConcerning(r),
      taglish:
        'Panalo sa lane: {wins}/{total_lanes} ({wr_pct}%). Pagdating ng 6-min, naghahanap ka na ng job sa GameLeap.',
    },
    {
      condition: (r) => isConcerning(r),
      taglish:
        '{wr_pct}% lane WR ({wins}/{total_lanes}). Karamihan sa talo, panalo na yung kalaban pagdating ng first wave eq.',
    },
    {
      condition: (r) => isWatch(r),
      taglish:
        'Lane WR {wr_pct}% ({wins}/{total_lanes}). Isang pull cycle kada 53 segundo, lilipat ka na sa winning side next week.',
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      taglish:
        '{wins}/{total_lanes} fixed lanes panalo ({wr_pct}%). Sapat na yung first 10 minutes para sumahod ka.',
    },
    {
      condition: (r) => isStrong(r),
      taglish:
        '{wr_pct}% lane WR ({wins}/{total_lanes}). Bago pa mag-5 min, nirereport ka na ng offlaner sa matchmaking abuse.',
    },
  ],

  'hero-pool': [
    {
      condition: (r) => isConcerning(r),
      taglish:
        '{hero_count} heroes sa {games} games. Wala kang main, may type ka lang.',
    },
    {
      condition: (r, f) => isConcerning(r) && Number(f.top_wr ?? 100) < 45,
      taglish:
        'Top hero mo si {top_hero}, {top_wr}% WR. Hindi kayo magkasundo, hiwalayan niyo na.',
    },
    {
      condition: (r) => isWatch(r),
      taglish:
        '{hero_count} heroes sa {games} games, top hero si {top_hero} ({top_wr}%). Pumili ng 5, kalimutan yung iba, akyat MMR.',
    },
    {
      condition: (r) => isHealthy(r),
      taglish:
        '{hero_count} heroes sa {games} games — focused. Si {top_hero}, ginagampanan trabaho sa {top_wr}% WR.',
    },
  ],

  tilt: [
    {
      condition: (r, f) =>
        isConcerning(r) &&
        Number(f.streak ?? 0) >= 4 &&
        Number(f.post_loss ?? 100) <= Number(f.overall ?? 0) - 10,
      taglish:
        '{streak}-game losing streak, post-loss WR {post_loss}% vs {overall}% overall. Yung queue button ang kalaban mo, hindi yung enemy team.',
    },
    {
      condition: (_r, f) =>
        Number(f.post_loss ?? 100) <= Number(f.overall ?? 0) - 15,
      taglish:
        'Post-loss WR {post_loss}% vs overall {overall}%. Hindi ka lang nati-tilt — bumabagsak ka.',
    },
    {
      condition: (r) => isConcerning(r),
      taglish:
        'Post-loss WR: {post_loss}%, overall: {overall}%, pinakamahabang streak: {streak}. Yung pattern, mas malala pa sa matchmaker.',
    },
    {
      condition: (r) => isWatch(r),
      taglish:
        'Bounce-back maganda ({post_loss}% vs {overall}%) pero umabot ka ng {streak}-game streak. Dalawang talo, 10-min na pahinga.',
    },
    {
      condition: (r) => isHealthy(r),
      taglish:
        'Pinakamahabang streak: {streak}, post-loss WR {post_loss}% vs {overall}% overall. Disiplinado kang mag-queue.',
    },
  ],

  'stack-synergy': [
    {
      condition: (r, f) => isConcerning(r) && f.worst_partner != null,
      taglish:
        '{worst_partner}: {worst_wr}% WR ({worst_delta}pp vs solo). Magkaibigan kayo, pero hindi kayo magkasundo sa Dota.',
    },
    {
      condition: (r, f) => isConcerning(r) && f.best_partner != null,
      taglish:
        'Best stack partner mo si {best_partner} sa +{best_delta}pp. OK siya, pero hindi kayang i-carry yung mixed window niyo.',
    },
    {
      condition: (r, f) => isWatch(r) && f.best_partner != null && f.worst_partner != null,
      taglish:
        '{best_partner} ang nag-cacarry sa synergy ({best_delta}pp), {worst_partner} ang nagpapabigat ({worst_delta}pp). Palitan niyo yung role pairs.',
    },
    {
      condition: (r, f) => isWatch(r) && f.best_partner != null,
      taglish:
        '{best_partner} ang nag-aakyat ng stack ({best_delta}pp). Yung iba, within noise lang — itong duo lang, fill na lang sa iba.',
    },
    {
      condition: (r, f) => isHealthy(r) && f.best_partner != null,
      taglish:
        '{best_partner}: {best_wr}% WR (+{best_delta}pp). Itong tao lang. Ban niyo na yung iba sa friends list.',
    },
  ],
}
