# Watch-Like-A-Coach — v1 Spec

**Status**: draft for review (Phase 1 deliverable, no code yet)
**Author**: written 2026-04-30 from Phase 0 data verification findings
**Target ship**: 2026-06-07 (TI 2026 Open Qualifiers begin 2026-06-09)

---

## 0. Scope + non-goals

**In v1**:
- Two routes: `/watch` (entry, lists recent finished pro matches) and `/watch/{match_id}` (per-match analysis).
- Post-match recap only. Data source: OpenDota `/proMatches` + `/matches/{id}`.
- Client-only. sessionStorage cache (5-min TTL on `/proMatches` listing, indefinite TTL on per-match data — pro match results are immutable).
- Two prose categories: per-player (1A cross-match + 1B within-match) and match-level (2).
- Static OG image for share previews; dynamic title via existing `useEffect` document-title pattern.

**Out of v1**:
- `/live` data integration (deferred to v2 — Phase 0 confirmed `/live` lacks the per-player depth required for coach-style prose).
- Team-tendency observations (Category 3, deferred to v1.1 — needs per-team baseline corpus, more API calls per page-view).
- Dynamic per-route OG cards (deferred to v1.1 — would require Cloudflare Workers HTMLRewriter or pre-rendering).
- Backend, Worker KV cache, server-side proxy. Same hard constraint as the rest of the product.
- Paid-tier features — v1.2.5 paid surface is still removed; this feature ships free-tier-only.

---

## 1. Page layouts

### 1.1 `/watch` (entry page)

**Route match**: pathname `/watch` exactly. Add to `App.tsx`'s pathname-based router alongside `isMmrMath` / `isMeta`.
**Data fetch**: single `GET /proMatches` on mount. sessionStorage cache key `dwr.watch.proMatches`, 5-min TTL.

**Sections, top to bottom**:
1. **TopNav** — extend [TopNav.tsx](src/components/TopNav.tsx) to add a fourth `Watch` link. Keep the active-underline pattern.
2. **Disclaimer banner** (italic, dim, full-width, just under nav): _"Observations from public match data. Not affiliated with any team, player, or tournament. Data via OpenDota."_
3. **Page header**: small Aperture sigil + `WATCH LIKE A COACH` wordmark + 1-line tagline ("_Recent pro matches, with what stood out._").
4. **Match list**: top 50 entries from `/proMatches` rendered as match cards in a responsive grid (3-col desktop, 2-col tablet, 1-col mobile). No filtering by league_id in v1 — `/proMatches` returns a mix of major and amateur tournaments; treat that as the canonical "recent pro" surface. (League-tier curation is a v1.1 candidate once we see whether amateur leagues clutter the feed.)
5. **Loading state**: 8–12 skeleton cards while `/proMatches` is in flight. Reuse [CardSkeleton.tsx](src/components/CardSkeleton.tsx) shape.
6. **Empty / error state**: _"Couldn't load recent pro matches. Try again in a minute."_ + retry button.
7. **Footer** — existing [Footer.tsx](src/components/Footer.tsx).

**Match card content** (priority order — most important info first):
- Caption (mono, dim): league name (`league_name`).
- Heading (Bebas Neue): `Radiant team` `vs` `Dire team` (winner bolded).
- Score row: `26 — 15` (winner highlighted).
- Meta row: duration (`31:14`), "ended X ago" (relative time from `start_time + duration`).

Click anywhere on card → `history.pushState` to `/watch/{match_id}`, render that route. Same routing pattern as `/changelog`.

### 1.2 `/watch/{match_id}` (match analysis)

**Route match**: pathname matching `/^\/watch\/(\d+)$/`. Capture group is the match ID.
**Data fetch**: single `GET /matches/{match_id}` on mount. sessionStorage key `dwr.watch.match.{match_id}`, indefinite TTL.

**Sections, top to bottom**:
1. **TopNav**.
2. **Disclaimer banner** (same as `/watch`).
3. **Match header** (large, Bebas Neue):
   - `{Radiant team}` `{radiant_score}` — `{dire_score}` `{Dire team}`, winner bolded.
   - Caption row: `{league_name}` · `{duration formatted MM:SS}` · `Ended {relative time}` · external link to `dotabuff.com/matches/{id}` (small, mono).
4. **What stood out** — 2–3 lead observation cards. Standalone short cards, no chart, monospace overline (`OBSERVATION 01`, `02`, `03`). Selected by the lead-line synthesis algorithm in §2. These are pull-outs (also rendered in their original section below), not extractions.
5. **Per-player observations** — 10 cards in a grid analogous to [ReportGrid.tsx](src/components/ReportGrid.tsx). Each card:
   - Header: position badge (Pos 1–5, derived from lane + role), hero portrait, `personaname`.
   - Body: 1–3 prose lines (Cat 1B always; Cat 1A appended when player is in the corpus).
   - Footnote: one key stat (KDA / GPM / lane efficiency / obs placed) + `Show more details` toggle (renders a small key-value table — kills, deaths, assists, GPM, XPM, LH/min, lane efficiency, teamfight participation, obs placed, sen placed).
6. **Match-level observations** — four sub-sections, each a single card or short prose block:
   - **Draft** — picks_bans cross-referenced with HERO_ARCHETYPES + HERO_TRAITS.
   - **Lane phase** — first blood, T1 timings, lane efficiency comparisons across the five lanes.
   - **Mid game / Roshan** — first Roshan, total Rosh count, gold-advantage swings.
   - **Teamfights** — count, win/loss split, longest fight, decisive fight call-out.
7. **Footer**.

**Loading state**: full-page skeleton — header line, 2 lead-line skeletons, 10 per-player skeletons, 4 match-level skeletons. Single fetch, ~1–3 s on a parsed pro match.
**Error states**:
- Invalid match ID format → render the match-level 404 ("That match ID doesn't look right" + back to `/watch`).
- 404 from OpenDota → "Couldn't load match {id}" + back-to-`/watch` button + retry.
- 502 / 5xx from OpenDota → ErrorBoundary already covers this. Retry button.

**Direct deep links**: a user landing on `/watch/{match_id}` cold (no `/watch` referrer cache) gets all needed header data from the `/matches/{id}` response itself (it carries team names, score, league, duration). No extra `/proMatches` call needed.

---

## 2. Prose template categories

### 2.1 Tone register (cross-cutting, enforced by validator)

**Sharper than dry analysis, softer than user-facing roast. Observation territory, not editorializing.**

Extends the existing honest-mode template validator pattern in [src/lib/honestMode.ts](src/lib/honestMode.ts). Add a new `WATCH_BANNED_TOKENS` list, applied to all watch-feature templates:

Banned (in addition to the existing `BANNED_ROAST_TOKENS`):
- Prescriptive: `should have`, `needed to`, `had to`, `was supposed to`, `must have`
- Counterfactual editorial: `could have`, `would have`, `if only`
- Judgment adjectives: `useless`, `embarrassing`, `amateur`, `terrible`, `awful`, `bad play`, `dogshit`, `griefing`
- Superiority markers: `obviously`, `clearly`, `of course`
- Direct address: any second-person `you` aimed at the player (third-person only)

Required (existing rules carry over):
- Every template must contain at least one `{stat}` placeholder (`templateHasPlaceholder` check).
- Every template references a measured fact, not a recommended action.
- Past tense, third person, neutral verbs.

Examples — the line:
- ✅ "Pos 4 placed 1 obs across 31 minutes." → observation, factual.
- ❌ "Pos 4 only placed 1 obs across 31 minutes." → "only" is editorial.
- ✅ "Carry hit 5-slot at 31:00; the median pos 1 in this match did at 24:30." → comparison, no judgment.
- ❌ "Carry was farming way too long." → editorial verdict.

### 2.2 Category 1A — Per-player CROSS-match observations (corpus-backed)

**Fires when**: player's `account_id` is present in `pro-baselines.json` AND the relevant aggregate has ≥ 5 sample matches.
**Falls back silently** when player isn't in the corpus or sample is too thin.

**Examples** (5):
1. "Pos 4 (Crystal Maiden) hasn't won a lane in his last 5 ranked games — won this one at 73% efficiency, +18pp above his rolling average."
2. "Mid (Invoker) is 11–3 on this hero across the last 14 days. Lost this one. Went 4/9/12, KDA 1.78 — his Invoker average is 4.2."
3. "Carry's GPM (612) was 8% under his 30-day median (665). Five-slot landed at 31:00; his median timing on Sven is 26:30."
4. "Pos 5 went 0 obs / 0 sen. His DreamLeague Div 2 average across 22 games is 14 obs / 9 sen."
5. "Offlane (Mars) finished 9–3–14, his best KDA on this hero in the last 30 days (rolling avg 3.1)."

**Templates needed**: lane-WR streak, hero-WR delta, KDA-vs-rolling, GPM-vs-rolling, vision-vs-rolling, role-distribution-shift (when a pro plays an unusual role for the night), 5-slot-timing-vs-rolling.

### 2.3 Category 1B — Per-player WITHIN-match observations (no corpus needed)

**Fires for**: every player in every match. Compares against the other 9 in the match, or against absolute floors (e.g. 0 wards in a 31-min game).

**Examples** (6):
1. "Pos 4 (Pudge) placed 1 obs across 31 minutes. Median pos 4/5 in this match: 8.5."
2. "Carry's 5-slot timing landed at 31:14 — 6 minutes after the Dire pos 1 (Sven) hit his."
3. "Mid finished with 2.1 stuns/min on Tiny. The other 9 players combined for 1.8."
4. "Offlane spent 47 seconds dead between 18:00 and 22:00. Three of those deaths were on the high ground."
5. "Pos 1 had 0 buybacks — never held more than 4400 net worth across the game."
6. "Pos 5 (CM) had 73% teamfight participation, second-highest on the team behind the offlane."

**Templates needed**: vision-output-vs-team, 5-slot-timing-vs-match, KDA-extreme, teamfight-participation-rank, dead-time-block, buyback-pattern, lane-efficiency-vs-match, stun-duration-rank, hero-damage-share.

### 2.4 Category 2 — Match-level observations

**Fires for**: every match. Sourced from match-level fields, no per-player baselines.

**Draft sub-templates** (3 examples):
1. "Radiant drafted a physical-damage stack: Sven, Drow, Hoodwink. Dire's only physical mitigation came from Pos 5 Lion's hex — picked last."
2. "Both teams banned Pudge round one. Dire took Lina + Lion phase one (double magic burst). Radiant answered with Mirana phase two — last pick was Sven."
3. "Two heroes seen 8+ times this league were banned out: Marci (1st phase), Primal Beast (2nd phase). Radiant got the third high-priority hero — Mars — at pick four."

**Lane / early game** (3 examples):
1. "First blood at 2:51 on the bottom lane. Pos 4 (Pudge) hooked the carry over the safe-lane creep wave."
2. "Radiant top T1 fell at 11:21 — earliest of the six T1s. Dire bottom T1 stood until 22:14."
3. "Three of five lanes won by Radiant per OpenDota's lane efficiency metric (Pos 1 / Pos 2 / Pos 3 above 50%)."

**Mid game / Roshan** (3 examples):
1. "First Rosh at 18:42, taken by Dire uncontested. Aegis on Pos 2 (Tiny) — used at 21:30 in the contested mid push."
2. "Two Roshans this match — Dire 18:42, Radiant 24:11. Cheese on Radiant Pos 1 (Sven), unused at game end."
3. "Radiant's gold lead peaked at +9.8k around 17 minutes, swung to −6.2k by 27, never recovered."

**Teamfights** (3 examples):
1. "Five teamfights logged. Dire won 4. The decisive one: 23:14 mid lane — three Radiant cores died, Dire took raxx within 90 seconds."
2. "Longest fight: 38 seconds at 28:50 around Roshan pit. Six total deaths, 24 abilities used, no buybacks."
3. "Three of the four Radiant teamfight wins came inside 23 minutes. After that point, Dire won every fight."

### 2.5 "What stood out" lead-line synthesis

**Selection algorithm** (2–3 lines surfaced from the body):
- Score each fired template by an emphasis score:
  - Cat 1A: number of standard deviations the in-match value sits from the player's rolling baseline (clamped to ±5).
  - Cat 1B: number of std-devs above/below the in-match peer median, OR absolute-floor hits (0 wards, 0 buybacks in a long game).
  - Cat 2: pre-tagged emphasis weight per template (decisive teamfight > 5-slot timing > T1 timing).
- Pick top 2–3 across all categories.
- Diversification rule: at most one lead from any single category. Ties broken Cat 1A > Cat 2 > Cat 1B (Cat 1A is highest-information because it's cross-time).
- Lead-line cards render as standalone pull-quotes; the same observation also appears in its body section. Pull-out, not extraction.

**Calibration**: thresholds need tuning against ~5 real matches in Phase 8. Don't ship without that pass — a trigger-happy lead-line that fires on every observation feels like noise.

---

## 3. Data flow — concrete field mapping

Per-page-view API budget:
- `/watch`: 1 call (`/proMatches`), sessionStorage-cached 5 min.
- `/watch/{match_id}`: 1 call (`/matches/{id}`), sessionStorage-cached indefinitely.
- Static corpus (`pro-baselines.json`) ships in the bundle; zero runtime fetches.
- Estimated worst-case daily traffic per IP: 50 unique match views = 50 calls. Free tier (3000/day) is unmeetable in v1.

### 3.1 Match-level templates → /matches/{id} fields

| Template ID | Reads from `/matches/{id}` | External tables |
|---|---|---|
| `draft_archetype` | `picks_bans[]`, `radiant_win` | `HERO_ARCHETYPES` ([src/lib/heroArchetypes.ts](src/lib/heroArchetypes.ts)) |
| `draft_counter_pattern` | `picks_bans[]` | `HERO_TRAITS` ([src/lib/heroTraits.ts](src/lib/heroTraits.ts)) |
| `draft_last_pick` | `picks_bans[].order`, `.is_pick` | — |
| `first_blood` | `objectives` filtered to `CHAT_MESSAGE_FIRSTBLOOD` | — |
| `t1_timing_per_lane` | `objectives` filtered to `building_kill` with `tower1_*` keys | — |
| `roshan_first` | `objectives` filtered to `CHAT_MESSAGE_ROSHAN_KILL` | — |
| `roshan_count` | `objectives` Roshan events | — |
| `aegis_usage` | `objectives` Roshan timestamps + `players[].purchase_log` for `item_aegis` events + subsequent kill events | — |
| `gold_lead_swing` | `radiant_gold_adv` (per-minute array) | — |
| `xp_lead_swing` | `radiant_xp_adv` (per-minute array) | — |
| `teamfight_count` | `teamfights.length` | — |
| `teamfight_outcome` | `teamfights[].players[].deaths` per team | — |
| `longest_fight` | `teamfights[].start, .end` | — |
| `decisive_fight` | `teamfights` cross-referenced with `objectives` building/raxx events within 60 s after fight end | — |

### 3.2 Per-player templates → players[i] fields

| Template ID | Reads from `players[i]` (current match) | Reads from corpus[account_id] |
|---|---|---|
| `within_lane_efficiency` | `lane_efficiency_pct`, `lane_role`, `is_roaming` | — |
| `within_kda` | `kills`, `deaths`, `assists` | — |
| `within_gpm` | `gold_per_min` | — |
| `within_5slot_timing` | `purchase_log` (compute 5th non-consumable item time) | — |
| `within_obs_placed` | `obs_log.length` | — |
| `within_sen_placed` | `sen_log.length` | — |
| `within_teamfight_part` | `teamfight_participation` | — |
| `within_stuns` | `stuns` (and derived `stuns / duration_min`) | — |
| `within_buybacks` | `buyback_log.length`, `net_worth` peaks | — |
| `within_dead_time_block` | `life_state` aggregate (already an object keyed by life-state code) | — |
| `cross_lane_streak` | this match: `lane_efficiency_pct ≥ 55 ? won : lost` | `recent_lane_outcomes[]` |
| `cross_hero_wr` | this match: `hero_id`, `win` | `recent_hero_pool[hero_id]` |
| `cross_role_wr` | this match: derived role from `lane_role` + role classifier | `season_role_wr` |
| `cross_kda_delta` | this match: `kda` | `rolling_kda` |
| `cross_gpm_delta` | this match: `gold_per_min` | `rolling_gpm` |
| `cross_obs_average` | this match: `obs_log.length` | `rolling_obs_per_game` |

### 3.3 New corpus file: `src/data/pro-baselines.json`

**Shape**:
```json
{
  "generated_at": "2026-04-30T...",
  "window_days": 30,
  "version": 1,
  "corpus_size": 80,
  "players": {
    "{account_id}": {
      "personaname": "...",
      "matches_in_window": 47,
      "last_match_unix": 1777485600,
      "rolling_kda": 3.1,
      "rolling_gpm": 612,
      "rolling_xpm": 720,
      "rolling_lh_per_min": 6.2,
      "rolling_obs_per_game": 12.4,
      "rolling_sen_per_game": 8.1,
      "rolling_teamfight_part": 0.71,
      "season_role_distribution": [0.85, 0.10, 0.05, 0, 0],
      "recent_hero_pool": {
        "{hero_id}": { "games": 11, "wins": 8, "kda_avg": 4.2 }
      },
      "recent_lane_outcomes": [
        { "match_id": 8791260652, "won": true, "lane_efficiency_pct": 78 }
      ]
    }
  }
}
```

**Refresh script**: new `scripts/refresh-pro-baselines.mjs`, mirrors the architecture of `scripts/refresh-pro-corpus.mjs`. Pulls `/players/{id}/recentMatches` (1 call), then samples up to 20 matches via `/matches/{id}` (already cached upstream, may even be free if recently fetched). Per pro: ~20–25 calls.

**Workflow**: new `.github/workflows/refresh-pro-baselines.yml`, weekly (Mondays, offset from existing meta + corpus refreshes — proposed 11:00 UTC). Opens a PR (does NOT direct-commit), same rationale as the pro-corpus refresh.

**API budget**: 80 pros × ~25 calls = 2000 calls. Fits in one daily-cap window with headroom. If the corpus grows past 100 pros (likely after TI 2026 Open Qualifier rosters lock), the refresh either spans two days or moves to an API key (premium tier ≈ $0.20 per refresh).

**Curation**: new `scripts/pro-baselines-list.json`, seeded from `scripts/pro-corpus-list.json` (50 pros) + 30 active TI 2026 cycle qualifier players. Hand-edited 2026-06-01 once Open Qualifier rosters publish; corpus refresh runs 2026-06-02; ships into v1 deploy 2026-06-04.

---

## 4. draft_timings sample check — RESULT

Empirical pass against 8 finished pro matches across 4 leagues, 2026-04-30:

| match_id | league | dt_len | pb_len | obj_len | tf_len | version |
|---|---|---|---|---|---|---|
| 8791604589 | Dota 2 Space League | 0 | 24 | 17 | 5 | 22 |
| 8791570136 | Dota 2 Space League | 0 | 24 | 13 | 4 | 22 |
| 8791412342 | Ultras Dota Pro League | 0 | 24 | 23 | 13 | 22 |
| 8791355185 | Ultras Dota Pro League | 0 | 24 | 30 | 6 | 22 |
| 8791262735 | European Pro League | 0 | 24 | 14 | 3 | 22 |
| 8791260652 | DreamLeague Division 2 | 0 | 24 | 30 | 3 | 22 |
| 8791499838 | Dota 2 Space League | 0 | 24 | 17 | 9 | 22 |
| 8791274175 | Ultras Dota Pro League | 0 | 24 | 33 | 5 | 22 |

**Result**: `draft_timings` populated 0/8. Across 4 distinct leagues, all `version: 22` parsed.

**Spec impact**:
- ❌ DROP any prose template depending on per-pick countdown timer ("drafter took 22 seconds on pick 4").
- ✅ KEEP every other draft template — `picks_bans` is consistently 24/24, draft archetype + counter + last-pick + ban-priority analysis all viable.
- ⚠️ REVISIT in v1.1 by re-running `scripts/check-draft-timings.mjs` (move the inspection script into `scripts/`). If OpenDota fixes upstream parsing, the per-pick-timer prose unlocks without any other rework.

---

## 5. SEO meta tags strategy

### 5.1 `/watch` (entry page)

- `index.html`: keep homepage `<head>` static (homepage values render for crawlers cold-loading any route — fine for v1).
- Client-side `useEffect` in `App.tsx` (extends the existing `[isChangelog, isMmrMath, isMeta, isReportRoute, isStreaming]` dependency list to add `isWatchRoute`, `isWatchMatchRoute`):
  - `/watch` title: `"Watch — Dota Weakness Report"`.
  - `/watch` description: `"Coach-style analysis of recent pro Dota 2 matches. Updated as matches finish."`.
- `public/robots.txt`: add explicit `Allow: /watch/` line. Defends against future overzealous Disallow entries.
- `public/sitemap.xml`: add `<url><loc>https://dotaweakness.com/watch</loc><changefreq>daily</changefreq></url>`.

### 5.2 `/watch/{match_id}` — v1 (Static OG, dynamic title)

- `index.html`: ships generic homepage values. Crawlers without JS see those.
- Client-side `useEffect` mutates `document.title` once data loads: `"{Radiant} {radiant_score}–{dire_score} {Dire} — DotaWR Watch"` (e.g. `"Nigma Galaxy 29–11 1w Team — DotaWR Watch"`).
- Description: `"Coach-style breakdown of {match_id} ({league_name})."`
- **Share previews** (Reddit / Discord / X / Slack — all server-side renderers, JS-blind): every match page shares the homepage OG values. Acceptable for v1 because:
  - The watch feature ships its own dedicated OG asset (next item).
  - Per-match dynamic OG cards are deliberately deferred (§5.3).
- New asset: `public/og-watch.png` (1200×630). Cosmic gradient + Aperture sigil + `WATCH LIKE A COACH` wordmark + 1-line tagline. Generated by the same PowerShell + System.Drawing pattern as the existing `og-image.png`.
- `index.html` strategy: keep the existing `og:image` pointed at `og-image.png` for `/`, `/changelog`, `/meta`, `/mmr-math`. There is no clean way to swap the og:image per route in pure-static deploys.
  - **Decision**: ship `og-watch.png` as an unused-by-default asset in v1, ready for the v1.1 dynamic-injection epic.
  - For v1 launch share-quality on `/watch/*`, accept that the homepage `og-image.png` previews. The brand asset stands alone; the title (visible client-side post-load) carries the per-match info.

### 5.3 v1.1 candidate — Dynamic per-route OG injection

Path forward: Cloudflare Workers Static Assets supports an `HTMLRewriter` API that runs at request-time on `index.html`. Per-route `og:image` + `og:title` + `og:description` injection is a small, pure-function rewriter — does not cross the no-backend line (no auth, no DB, no request-state). Per-match OG image rendering needs either:
- Pre-rendered OG images per match (run a generator weekly, store in R2 or `public/og-cache/`), or
- Runtime image generation (Workers + `ImageResponse` from Satori or similar — adds ~50ms per cold request).

Both options are real engineering work. Pre-rendered is simpler. **Not in v1 scope.** Flagged here so it doesn't get re-derived from scratch when v1.1 planning starts.

---

## 6. Build sequencing toward 2026-06-07

| Phase | Work | Days | Cumulative |
|---|---|---|---|
| 2 | `pro-baselines.json` corpus build script + first refresh + GH Actions workflow | 2 | day 2 |
| 3 | Page scaffolding: `App.tsx` route additions, sessionStorage cache layer, `WatchPage.tsx`, `WatchMatchPage.tsx`, fetch + skeleton states, TopNav `Watch` link | 1.5 | day 3.5 |
| 4 | Category 1B prose templates (within-match per-player, no corpus) | 2 | day 5.5 |
| 5 | Category 1A prose templates (cross-match per-player, corpus-backed) | 2 | day 7.5 |
| 6 | Category 2 prose templates (match-level: draft + lane + roshan + teamfights) | 2 | day 9.5 |
| 7 | Tone-register validator + `WATCH_BANNED_TOKENS`, footer disclaimer wiring, `og-watch.png`, robots/sitemap update, lead-line synthesis | 1 | day 10.5 |
| 8 | Manual review pass against 5+ live pro matches, copy polish, lead-line threshold calibration, edge cases (unknown players, very short games, no Roshan, no teamfights tracked) | 1.5 | day 12 |

Today: 2026-04-30. June 7 = 38 days away. Working budget ~12 days → comfortable buffer; the slack absorbs corpus-refresh API budget overruns and Phase 8 calibration overruns.

**Critical date**: TI 2026 Open Qualifier rosters lock ~2026-06-01. Plan a corpus refresh 2026-06-02 with the locked rosters added to `scripts/pro-baselines-list.json`. Ship that data into the v1 deploy 2026-06-04 (3 days before launch).

---

## 7. Open questions — resolve before Phase 2

1. **Corpus size + API budget**: 80 pros × 25 calls = 2000 daily-cap calls. If the curated list grows past 100 pros after Open Qualifier rosters land, the refresh either spans two days or needs an API key (~$0.20 per run). Is API-key spend OK in principle? It would simplify everything downstream.
2. **Lead-line emphasis thresholds**: §2.5 sketches the algorithm but the std-dev cutoffs need calibration in Phase 8 against real matches. Acceptance criterion to define: how many leads is the right number per match? 2–3? 3–5?
3. **Anonymization stance**: confirm — pros are public figures, no anonymization in `/watch` prose. Footer disclaimer covers the legal-ish surface. (Stack Synergy's "Friend N" rule does NOT carry over to /watch.)
4. **Hero variant / facets**: heroes since 7.36 have multiple facets. `players[].hero_variant` is populated in our sample; HERO_ARCHETYPES doesn't model facets. Phase 6 work needs to decide whether facet-aware draft prose ("Dire took the second facet of Lich, the freeze build") is in v1 scope or v1.1.
5. **OpenDota outage handling**: existing `ErrorBoundary` covers render failures, but what's the user-facing message for a `/proMatches` 502 specifically? Probably "OpenDota's having a moment — try again in a minute" + a link to status.opendota.com. Confirm copy.
6. **Card key rotation**: `/report` keys cards as `${id}-${roleFilter}` to remount on filter switch (v1.1.1 fix). `/watch/{match_id}` has no equivalent filter so no remount issue, but Phase 3 should still remember the precedent — if any per-card filter lands later (e.g. "show only the losing team"), apply the same pattern.

---

## 8. CLAUDE.md integration

When v1 ships, append a new top-level section to `CLAUDE.md`:

> **## Watch feature (v1.4.0+, 2026-06-07)**
>
> Two routes (`/watch`, `/watch/{match_id}`) for coach-style post-match recaps of finished pro matches. Browser-only, sessionStorage-cached, OpenDota `/proMatches` + `/matches/{id}`. Per-player baselines static-corpus'd in `src/data/pro-baselines.json` (refreshed weekly via `.github/workflows/refresh-pro-baselines.yml`). Watch-feature prose register is observation-not-editorial: extends the existing template validator with `WATCH_BANNED_TOKENS`. Footer disclaimer required on both routes.

Plus new "Things NOT to do" entries:
- Don't render Watch prose with editorial language. The validator catches the obvious cases; reviewers should still read for tone.
- Don't power Watch prose from `/live` data. Phase 0 confirmed it lacks per-player depth.
- Don't add per-match OG cards via client-side JS — same constraint as the `/report` SEO note.
- Don't direct-commit the pro-baselines refresh from CI. PR-based, same as pro-corpus refresh.
