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

## v1.9.0 — 2026-04-30

User comparison on /breakdowns.

- /breakdowns/{match_id} now compares your stats to pros and bracket
  norms when you've previously run /report.
- Per-player cards display compact stat strips beneath each within-match
  observation: your average vs your bracket median for that position,
  alongside the pro's stat for context.
- Honest-mode toggle adds editorial commentary on user-side strips.
  Different register from /breakdowns prose about pros — that stays
  observation-only. User-side honest mode is sharper because you opted in.
- Comparisons fire only on positions you actually play (≥5 games at
  the position). A pos 5 main looking at a pos 1 card sees the pro
  line only, no strip.
- Disclaimer when match position assignment is ambiguous: stat
  comparisons may not perfectly align with intended roles. (Underlying
  classifier fix tracked for v1.9.1.)
- Personalization stays local — Steam ID lives in your browser only,
  comparison data is computed from your /report run, never leaves
  your device.

## v1.8.1 — 2026-04-30

Renamed /watch → /breakdowns. The "Watch Like a Coach" framing was
aspirational — the feature is post-match analysis, not live viewing.
"Match Breakdowns" describes what the page actually does.

- Renamed /watch → /breakdowns. The "Watch Like a Coach" name was aspirational — the feature is post-match analysis, not live viewing. "Match Breakdowns" describes what the page actually does.
- /watch and /watch/{match_id} now permanently redirect to /breakdowns and /breakdowns/{match_id}. Existing shared links continue to work.
- OG image swapped to og-breakdowns.png with updated "MATCH BREAKDOWNS" wordmark.

## v1.8.0 — 2026-04-30

Phase 7 of the watch-feature buildout — lead-line synthesis, share-preview
asset, and per-route OG meta swap. The /watch surface is now feature-complete
for the v1 launch (TI 2026 Open Qualifiers, June 9). Phase 8 (calibration +
polish) starts after this lands.

- /watch/{match_id} now leads with a "What stood out" section: 2-3 pull-quote headlines synthesized from the strongest per-player and match-level observations. Editorial typography (22px prose, accent left-bar, [01]/[02]/[03] enumeration) makes the synthesis the first thing readers see, with the per-player and match-level cards beneath as supporting detail.
- Lead-line algorithm picks across all three prose categories (cross-match, within-match, match-level) by emphasis score, with per-player dedup so the same individual doesn't appear in two pull-quotes describing the same observation.
- Hero ID resolution refreshed to cover all heroes through current patch (Muerta, Ringmaster, etc.). Previous /watch builds rendered "Hero 138" instead of "Muerta" for recent additions.
- og-watch.png ships as the share-preview asset for /watch routes. Discord/X/Reddit embeds for any /watch URL now render the WATCH LIKE A COACH brand card. Per-match dynamic OG cards remain v1.1 territory.

## v1.7.0 — 2026-04-30

Phase 6 of the watch-feature buildout — match-level prose. /watch/{match_id}
now layers four match-level cards (draft, lane phase, mid game, teamfights)
below the per-player grid. The "What stood out" lead-line synthesis (Phase 7)
is the remaining v1 work.

- /watch/{match_id} now renders four match-level prose sections below the per-player grid: draft (archetype, last picks, ban priority), lane phase (first blood, T1 timings), mid game (first Roshan + Aegis recipient, Roshan count, gold lead swings), and teamfights (count + outcome, longest fight, decisive fight).
- Match-level prose surfaces the "what happened" story that per-player observations can't capture alone — draft intent, lane-phase tempo, map control inflection points, decisive teamfight + immediate consequence (raxx, Roshan, ancient).
- decisive_fight template cross-references teamfights[] with subsequent objectives within 60 seconds — surfaces the moment the match was decided.
- Pre-creep first bloods render with "before the creep wave" framing instead of negative timestamps.
- AEGIS_STOLEN events render alongside ROSHAN_KILL when Roshan is killed by one team but Aegis is taken by the other.
- Empty sub-sections skip entirely — no apologetic placeholder text on matches without notable activity in a sub-section.
- Cat 2 prose passes the same WATCH_BANNED_TOKENS validator as Cat 1A and Cat 1B.

## v1.6.0 — 2026-04-30

Phase 5 of the watch-feature buildout — cross-match per-player observations.
/watch/{match_id} now layers corpus-backed cross-match prose on top of the
within-match observations from v1.5.0. Match-level observations (Phase 6)
and the "What stood out" lead-line synthesis (Phase 7) still pending.

- /watch/{match_id} per-player cards now include cross-match prose (Cat 1A) for corpus-known players: lane WR streaks (with break detection), hero records on the played hero, KDA vs rolling baseline, GPM vs rolling baseline, vision vs rolling, role distribution shifts (e.g., a pos 5 main playing pos 4), and hero-specific KDA outliers.
- Cross-match prose surfaces narrative-shaped comparisons: streak breaks earn the line, continuations don't unless they're remarkable. Hero-specific records suppress general-stat lines when both could fire — specific beats general.
- 48 active TI 2026 cycle pros currently in the corpus. Players outside the corpus continue to render Cat 1B observations only. Corpus expands 2026-06-01 with TI Open Qualifier rosters and current DreamLeague Division 2 rosters.
- All Cat 1A prose passes the WATCH_BANNED_TOKENS validator: past tense, third person, observation register, no editorializing.

## v1.5.0 — 2026-04-30

Phase 4 of the watch-feature buildout — within-match per-player observations.
/watch/{match_id} now renders 10 per-player cards arranged by team, each
showing fired observation lines about that player's match. Match-level
observations (draft, lane, Roshan, teamfights — Phase 6) and the
"What stood out" lead-line synthesis (Phase 7) still pending.

- /watch/{match_id} now renders 10 per-player cards with within-match observations (Cat 1B): vision output, 5-slot timing, KDA extremes, teamfight participation rank, dead-time blocks, buyback discipline, lane efficiency, stun output, hero damage share. Templates compare each player to the other 9 in the same match — observation, not editorial.
- Tone register enforced: WATCH_BANNED_TOKENS validator drops any prose containing prescriptive language, judgment adjectives, counterfactual editorial, superiority markers, or second-person address. Self-test runs at module load.
- Display name resolution: curated name from pro-baselines-list when available, position label fallback otherwise. personaname is structurally not read by any prose code (Steam display names are unstable — some pros use other pros' handles as their display name).
- Multi-unit hero exclusion list (Meepo, Arc Warden, Lone Druid bear, Brewmaster forms, Visage familiars) prevents dead_time_block from firing on simultaneous clone deaths.
- buyback_pattern_zero now requires the player to be on the losing team OR have peak net worth below the buyback cost — eliminates structurally-true noise on winning cores.

## v1.4.0 — 2026-04-30

New "Watch like a coach" feature surface — two new routes for analyzing
recent professional Dota matches. Phase 3 of the v1 buildout: page
scaffolding, routing, and listing-tier filtering. Per-player and match-
level coach prose ships in subsequent versions.

- /watch entry page lists recent pro matches via OpenDota /proMatches with a name-pattern filter for premier-tier tournaments.
- /watch/{match_id} renders match header + raw match data (Phase 3 preview — coach-style prose ships in subsequent versions).
- TopNav extended with Watch link as fourth nav item.
- Disclaimer banner on /watch routes: Observations from public match data. Not affiliated with any team, player, or tournament.
- Sparse-week messaging surfaces the calendar context when tracked-tournament count is low.
- Show-all toggle reveals unfiltered /proMatches feed for users who want it. Default off, does not persist across navigation.
- Pro-baselines corpus and weekly refresh workflow committed (data infrastructure for upcoming Cat 1A prose templates in v1.5.0).

## v1.3.1 — 2026-04-29

SEO and share-preview hygiene pass. No functional changes to the report.

- Added Open Graph and Twitter Card metadata so link previews render correctly when the site is shared on Discord, X, Reddit, etc.
- Per-route page titles and descriptions so each page is distinct in browser tabs and search results.
- Added robots.txt and sitemap.xml for search engine indexing. Sitemap covers /, /meta, /mmr-math, /changelog. /_dev/ is disallowed.

## v1.3.0 — 2026-04-29

New "Pro Comparison" card on /report. Computes a playstyle vector from
your last 50 matches and finds your closest pro twin among ~60 currently-
active TI cycle qualifiers, both overall and broken down by hero
archetype, tempo, farm, vision, and death pattern. Vectors live in
`src/data/pro-vectors.json` and refresh weekly via a GitHub Actions PR
workflow (free-tier OpenDota, no API key). Honest mode adds a "what
changes if you steal one thing" line.

- 30-feature vector: role distribution, hero archetype overlap, tempo,
  farm shape, vision, death pattern, role-conditional spending tempo,
  and fight involvement (kill participation).
- Hero archetypes tagged by hero design (Pudge → initiator, Hoodwink →
  caster_nuker, etc.), not pub-position. The archetype dimension
  measures "what kind of hero you reach for," independent of position.
- Flex players (role-distribution Shannon entropy > 0.95) get the
  per-axis breakdown without a headline twin — three roles in one body
  doesn't have a single pro analogue.
- Pro corpus footnote shows last-updated date; turns to "refresh
  pending" warning past 14 days old.
- Loose-match (cosine similarity < 0.3) renders with explicit caveat
  text rather than pretending the closest pro is a real fit.
- Card hides when user has fewer than 25 matches in the window —
  vector quality is too noisy below that.
- Refresh script: `node scripts/refresh-pro-corpus.mjs`. Fails loudly on
  daily-cap exhaustion or OpenDota outage so partial corpora don't ship.
- Weekly Actions workflow: `.github/workflows/refresh-pro-corpus.yml`
  opens a PR with the regenerated JSON instead of direct-committing.
- Initial corpus shipped at 50 pros (10 top-tier teams) — trimmed from a
  64-pro target during the first build because OpenDota's free-tier daily
  quota was tight after multiple build attempts. Future weekly refreshes
  may grow the corpus back toward 60+ as transient API failures recover
  (Mira, kaori, Abed, Dukalis failed during the v1.3.0 build with `other`
  errors; all are recognizable and should come back). Corpus size
  fluctuating ±5 pros between refreshes is expected behavior, not a bug.

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
