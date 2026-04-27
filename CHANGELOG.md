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
