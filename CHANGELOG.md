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
