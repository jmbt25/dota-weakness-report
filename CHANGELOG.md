# Changelog

<!--
Versioning rules
================
- Patch (1.0.x): bug fixes, copy changes, performance improvements,
  no new user-facing features.
- Minor (1.x.0): new features, additive changes, no breaking behavior.
- Major (x.0.0): breaking changes to URLs, data flow, or public behavior.

When a feature lands, bump APP_VERSION (and APP_VERSION_DATE) in
src/lib/version.ts AND add an entry to this file. Both happen in the
same commit. Newest entries go on top.
-->

## v1.2.5 — 2026-04-28

Public-launch prep.

- Removed the unbuilt paid-tier UI. Will return when user demand confirms it's worth building.
- Added GitHub repo link in footer (project is now open source).
- Added Support link in footer (GitHub Sponsors).

## v1.2.4 — 2026-04-28

Review-pass fixes.

- Stack Synergy "Show partner names" toggle now defaults OFF — the screenshot-safe state. The label and the rendered names finally agree.
- Item Timing footnote now counts purchase-log availability across all matches in the filter, not just matches involving the top 3 heroes. Role-split counts now add up: core + support equals all-games.
- Lane Outcome no longer reports 0% lanes won for support players. When `lane_outcome` is missing, the fallback now uses the lane partner's `lane_efficiency_pct` for support games (the support's own farm doesn't reflect lane-aggregate state). Catastrophic-laning prose surfaces directly when 0–1 of 8+ lanes were won.
- Lane Outcome verdict now considers both lane WR and lane efficiency — fixes incoherent "strong laning" verdict when efficiency is poor. When WR is healthy but lane efficiency is below 70%, the card downgrades to Watch and the prose calls out the divergence ("winning despite the farm gap, not because of it").
- Vision card hides the "Vision-death mismatch" tile when fewer than 10 matches contributed death coordinates. The lifetime tile takes the row instead of leaving a permanent empty placeholder.
- Honest-mode prose for Vision, Loss Streak, and Hero Pool now interpolates multiple stats per line. No more identical generic tails ("Two losses, ten-min break" / "Pick 5, ignore the rest, climb" / "spot-check whether your wards see anything") across role-split views.
- Stack Synergy negative-delta callout always anonymized, even when partner names are shown — protects friends from being named as the WR-dropper in shared reports.
- Lane Outcome and Stack Synergy honest-mode prose now match the sharpness of the underlying data — no more soft framing of hard findings. Lane divergence honest line cites both lane WR and lane efficiency directly. Stack synergy flat-loss partners (≤15% WR or ≤-30pp delta across 5+ games) get a "stack that doesn't work" callout instead of the gentler "trends below" phrasing.
- "Free" badge dropped from the report header. Paid status still surfaces when a license is active.

## v1.2.3 — 2026-04-28

- Fix: Immortal bracket on the Meta page showed all zeros. OpenDota's free /heroStats endpoint doesn't separate Immortal — it folds those games into Divine. The refresh script now aliases bracket 8 to bracket 7 when bracket 8 comes back empty, and the page footnotes that the two views show the same numbers.

## v1.2.2 — 2026-04-28

Meta page is now live data + a smarter tier formula.

- Meta page now reads from a weekly OpenDota /heroStats snapshot instead of a hand-tuned static table. Win rate and pick rate are real numbers from public matchmaking, refreshed every Monday by a GitHub Action.
- Tier no longer equals win rate. The new formula is `wrLift + pickBonus + momentumBonus`, where momentum is the week-over-week WR delta — that's the proxy for "buffs/nerfs landed on this hero or its items." Definition documented at the top of `src/lib/metaData.ts` and visible per-hero by hovering the tier badge.
- Hero cards now show a small ▲/▼ momentum indicator next to win rate when the hero moved at least 0.5pp week-over-week.
- Refresh script (`scripts/refresh-meta.mjs`) and weekly workflow (`.github/workflows/refresh-meta.yml`) check in the `current` and `previous` snapshots — momentum is computed from the diff, no manual updates needed.

## v1.2.1 — 2026-04-28

Quality fixes for v1.2.0.

- Session-position WR sub-finding (Loss Streak card) now hides when any bucket has fewer than 8 games, since percentages from small samples are statistical noise. Replaces with a "not enough multi-game sessions" note.
- MMR Math page no longer shows "NEVER" at exactly 50% WR — shows "thousands of games" instead, since calibration adjustments still produce slow movement.
- Meta page blindspot section now handles the case where the user has played every meta hero at their bracket.
- Attribution to public Dota learning community now appears in the footer of every page consistently.

## v1.2.0 — 2026-04-28

Multi-page architecture. New pages and existing card improvements.

NEW
- /mmr-math — Standalone page showing how many games to your next rank at your current WR vs at 55% WR. The most shareable single insight in the tool.
- /meta — Meta heroes for any bracket, sortable by WR/pick rate/tier. Includes a "heroes you've never played that are winning at your bracket" section if you've analyzed your account.
- Top navigation linking the three pages: Report · MMR Math · Meta.

IMPROVED
- Lane Outcome card now shows "lanes won but games lost" — winning lane and converting to match wins are different skills.
- Loss Streak / Tilt card now shows WR by session position (1st game, 2nd, 3rd, 4th+).
- Farm Efficiency card now shows your 5-item power spike timing vs bracket median.

ATTRIBUTION
- Several new insights inspired by Resolut1on's coaching observations and the broader Dota learning community.

## v1.1.1 — 2026-04-27

Progressive card rendering. Based on r/learndota2 feedback that the wait
felt too long.

- Tier 1 cards (death timing, hero pool, loss streak, stack synergy)
  render within 5–10 seconds — they don't depend on parsed replay data.
- Cards needing parsed data render as soon as the first match's data is
  available, with footnotes that update live as more matches finish
  parsing. The full sample is always reflected in real time.
- Top-of-report progress strip showing parse status and rough ETA.
- Stalled parses (matches that don't complete after 3 minutes) are
  surfaced explicitly. Cards still render with whatever data made it
  through; footnotes show the actual sample size including stalled count.
- No fake numbers. No artificial thresholds. The card always shows what's
  true at this moment.

## v1.1.0 — 2026-04-27

- **Role-split view** for flex players. When you have ≥10 games as core
  AND ≥10 games as support in the analysis window, a new toggle appears
  in the report header: `All games / Core only / Support only`. Switching
  re-runs all 9 analyses against the filtered subset, with role-aware
  baselines applied to the matching role. Inspired by r/learndota2 feedback
  that the single dominant-role classifier flattened useful signal for
  genuine flex players.
- Per-match role classification (`classifyMatchRole` in matchHelpers.ts)
  resolves via HERO_ROLES first, then falls back to parsed `lane_role` /
  `is_roaming` / GPM heuristics for flex heroes.
- Stack Synergy card shows a footnote when filtered ("Filtered to your N
  games as core/support.") so the partner sample isn't silently shrinking.
- Fix: bottom-row cards (stack-synergy, tilt, vision) no longer briefly
  vanish when toggling honest mode. The analyses array reference is now
  stable across re-renders, so Recharts doesn't try to re-measure
  off-screen children at 0 height.

## v1.0.1 — 2026-04-27

- App version is now displayed in the footer (`v1.0.1 · changelog`).
- Added a `/changelog` page so changes have a permanent home.

## v1.0.0 — 2026-04-27

Initial public launch.

- 9-card analysis report (Death Timing, Farm Efficiency, Item Timing, Situational Items, Lane Outcome, Hero Pool, Stack Synergy, Loss Streak, Vision)
- Role-aware baselines (core / support / flex detection)
- Rank-aware baselines tuned per bracket (Herald-Crusader, Archon-Legend, Ancient-Divine, Immortal)
- Honest Mode (opt-in roast prose, fire-icon toggle)
- Stack Synergy with anonymization toggle for sharing
- Vision card with Dota 2 minimap visualization
- 50-match analysis window (free)
- License key system for 100-match window and per-hero deep dives (paid tier coming)
