# Breakdowns User Comparison — v1.9.0 Spec

**Status**: spec only, no code yet. Builds on top of v1.8.1 ([breakdowns-feature-v1-spec.md](breakdowns-feature-v1-spec.md)).
**Author**: written 2026-04-30 from prior-discussion design lock-in.
**Target ship**: v1.9.0, ~2026-05 (post-spec gate).

---

## 0. Premise + scope

### What ships in v1.9.0
A user-comparison layer on `/breakdowns/{match_id}`. Each per-player Cat 1B
prose line on the match page may render a compact user-side stat strip
beneath it, comparing the user's bracket-aggregated stat to the same
metric on the pro card. Activates silently when the user has previously
run `/report` and a Steam ID is in localStorage.

### Out of scope
- Cat 1A (cross-match corpus prose) does **not** get user-comparison
  strips. Reasoning in §B.
- Cat 2 (match-level prose) does not get user-comparison strips —
  match-level observations aren't player-keyed.
- No Steam ID input on `/breakdowns`. Acquisition routes through
  `/report` per §G.
- No query-param sharing of personalization. URLs stay public-canonical;
  personalization rides on localStorage only.
- No paid-tier surface. The free-tier 50-match window is enough for
  bracket medians; paid would only add precision the user wouldn't
  notice on a stat strip.

### Locked design decisions (carry-forward from prior discussion)
1. Role mismatch: silent suppression below 5 user games at the
   position; render with no caveat above 15; render with
   "(small sample, N games)" between 5–15.
2. Bracket gap: render as compact 2–3 data point stat strip, not
   narrative prose. Bracket medians sourced from the user's own
   match-history lobby-mate stats.
3. Honest mode register coexistence: pro lines stay observation-only
   under `BREAKDOWNS_BANNED_TOKENS`; user lines run through `/report`'s
   existing roast register (`BANNED_ROAST_TOKENS` from
   [src/lib/honestMode.ts](../src/lib/honestMode.ts)) when the toggle
   is on.
4. Steam ID UX: subtle disclaimer-area link to `/report`; no input on
   `/breakdowns`.
5. Persistence: localStorage-backed Steam ID. No query param.
   Sharers see personalization in their own browser; receivers of a
   shared link see the public artifact.

---

## 1. Open questions surfaced during spec write — resolve before Phase A

These are the inconsistencies / new design decisions that the prior
discussion didn't fully nail. They each have a recommended default the
spec assumes; flag if you want a different call.

### Q1. localStorage and the embed-safety constraint
[CLAUDE.md](../CLAUDE.md) hard-constraints "No localStorage/sessionStorage
unless explicitly requested. The site is designed to work in embed
contexts that block storage." This brief explicitly requests it, so the
constraint isn't violated — but the spec assumes the feature **silently
no-ops in storage-blocked contexts** (no error, no nudge, just falls
back to the public-artifact view). Cache reads/writes mirror the
defensive shape already in [src/lib/breakdownsCache.ts](../src/lib/breakdownsCache.ts):

```ts
function safeRead(): UserComparisonCache | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem('dwr.userCompare.v1')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
```

**Recommended default**: silent fallback. Confirm before Phase A.

### Q2. Honest mode is not actually localStorage-backed
The brief says "Honest mode toggle is shared with /report via existing
localStorage state." [src/components/HonestModeToggle.tsx](../src/components/HonestModeToggle.tsx)
explicitly comments "no localStorage, per the embed-safety rule," and
[src/App.tsx:85](../src/App.tsx#L85) holds it as `useState(false)`. So
the toggle resets every page reload.

What this spec assumes: `/breakdowns` reads `honestMode` from the
shared App.tsx component state (works in-session because both routes
mount under one App). Adding localStorage persistence to honest mode
is a **separate decision** out of scope for this spec — if you want it,
flag it now; otherwise the user-comparison feature inherits whatever
the toggle is doing this session.

**Recommended default**: ride existing in-memory state, do not
persist honest mode. Plumbing change: thread `honestMode` prop from
App.tsx → `BreakdownsMatchPage` → `BreakdownsPlayerGrid` →
`BreakdownsPlayerCard`.

### Q3. Where does the honest-mode toggle live on /breakdowns?
Today the fire-button only renders inside `ReportGrid` (the report
page). On `/breakdowns`, with the user-comparison layer active, the
user has a register choice to make but no UI affordance to make it.

**Recommended default**: surface the existing `<HonestModeToggle>`
on `/breakdowns/{match_id}` only when localStorage Steam ID is
present (i.e. when there's a user-side line that would change voice).
Render it in the disclaimer-area row, right-aligned.
Hidden on `/breakdowns` listing page (no per-player prose to roast).

### Q4. Bracket median: what does "bracket" mean exactly?
The brief says "bracket medians derived from the user's own match
history (lobby-mate stats from /report's existing fetch path)." Lobby
mates' `rank_tier` is **not** populated on `ODMatchPlayer`
([src/types.ts:46](../src/types.ts#L46)). The two real signals are:
- `ODMatch.average_rank` (per-match summary, integer rank tier of the
  whole lobby).
- The user's own `rank_tier` from `fetchPlayerProfile`.

**Recommended default**: "bracket" means the user's own bracket.
The user's match history is a noisy-but-tight sample of that bracket
(MMR matchmaking keeps the 9 lobby-mates within ~±1 rank tier of the
user, per pubs experience). We aggregate per-match-per-position-stat
across the 9 lobby-mates without rank-filtering further. Optional
v1.9.1 refinement: drop matches whose `average_rank` is > 1 tier off
the user's tier. Don't do it in v1.9.0 — adds noise to the spec for
marginal accuracy gain.

### Q5. Visual marker on user-side strips
Brief: '"// You" prefix or pip icon or just italic + indent + dim?'

**Recommended default**: italic, indent (12px left padding), dim
accent color (`#8a4a6a` — pink-toned, distinct from `#E94560` accent
red), 2px left border bar in same color. **No textual prefix.** "// You"
reads as developer-y; an `>` or `▸` glyph reads as console
output. The visual treatment alone is sufficient — pro line is
flat-prose body text; user line is indented-italic-pink with a side
bar. CSS class: `.dwr-breakdowns-user-strip`.

Alternative if rejected: a single italic word marker at line start
("Yours: …") — softer than "// You", carries the same affordance. Low
cost to swap; keep this open for §F visual review.

---

## A. Page-layout integration

### A.1 Where the strip slots in
On `/breakdowns/{match_id}`, inside each `BreakdownsPlayerCard`'s body,
the user-comparison strip renders **directly beneath the corresponding
Cat 1B prose line**. One Cat 1B fire → up to one user-side strip. Cat
1A lines (cross-match corpus prose) render above Cat 1B today; they
remain user-strip-free. Card render order, top to bottom:

```
┌──────────────────────────────────────────────────┐
│ POS 4   Pudge   "Cr1t-"                          │  ← header (unchanged)
├──────────────────────────────────────────────────┤
│ Cat 1A line 1 (corpus context)                   │  ← unchanged
│ Cat 1A line 2                                    │
│                                                  │
│ Cat 1B prose line                                │  ← unchanged
│   ▸ user-comparison strip (when applicable)      │  ← NEW v1.9.0
│ Cat 1B prose line                                │
│   ▸ user-comparison strip                        │  ← NEW v1.9.0
├──────────────────────────────────────────────────┤
│ ▾ Show stats                                     │  ← unchanged
└──────────────────────────────────────────────────┘
```

A strip renders only when **all** of:
- localStorage has a Steam ID and a `userCompare.v1` cache.
- The Cat 1B template ID is in the supported-mappings table (§C).
- The user has at least 5 games in their /report window at the same
  position bucket (§B small-sample logic).
- The bracket-median value for the relevant stat is computable (≥ 5
  per-match-per-position observations across the user's match history).

Below 5 user games at that position: silent suppression (no strip,
no caveat).
5–15 games: strip renders with `(small sample, N games)` footnote
appended at line end.
≥15 games: strip renders without caveat.

### A.2 Disclaimer-area changes
`BreakdownsDisclaimer` ([src/components/BreakdownsDisclaimer.tsx](../src/components/BreakdownsDisclaimer.tsx))
becomes the host for two affordances when the user is on the match
sub-route:
- **No personalization yet** (no Steam ID in localStorage):
  trailing right-aligned link "Run a report to compare your stats →"
  pointing to `/`. Same italic dim styling as the disclaimer body, no
  emphasis.
- **Personalization active**: replace the link with the
  `<HonestModeToggle>` button (per Q3 — same component as on /report,
  no redesign). To the left of the toggle, a two-clause affordance,
  dim and italic:

  > _"Comparing against your last N matches at {bracket}. Most useful for {pos_role_label} cards."_

  Where:
  - `N` = total matches in user's analyze window (≤ 50).
  - `{bracket}` = resolved rank-tier label (e.g. "Crusader 3"). For
    unranked accounts, replace this whole token with "your match
    history" (so the line reads "Comparing against your last N
    matches in your match history.").
  - `{pos_role_label}` = `'support' | 'core' | 'flex'` derived from the
    user's role distribution:
    - **support** if top position is 4 or 5 with ≥ 50% share
    - **core** if top position is 1, 2, or 3 with ≥ 50% share
    - **flex** if top position has < 50% share

  This sets expectations for why some Cat 1B cards have strips and
  others don't (a pos 5 main looking at a strong pos 1 fire sees no
  strip on that card — correct behavior, now made legible).
  Click on the affordance → navigate to `/` (home), doubling as a
  "re-run report" gesture.

The listing page (`/breakdowns` no match_id) keeps the original
disclaimer with no link — there's nothing to personalize against on
the listing.

### A.3 Plumbing
`BreakdownsMatchPage` (currently a self-contained data-fetcher)
gains two props from App.tsx:
- `userCompareData: UserCompareData | null` — resolved upstream from
  localStorage.
- `honestMode: boolean` + `onToggleHonestMode: (v: boolean) => void`
  — same shape App.tsx already passes to `ReportGrid`.

Both flow through to `BreakdownsPlayerGrid` → `BreakdownsPlayerCard`.

---

## B. Which prose categories get user-comparison strips

### B.1 Cat 1B: included
Cat 1B is structurally a comparison ("player vs match-9-others"). Adding
"user vs bracket" reads as parallel structure — both are scoped to a
single observation. Of the 9 Cat 1B templates today
([src/lib/breakdownsProse/cat1b.ts](../src/lib/breakdownsProse/cat1b.ts)),
the spec maps 5 in v1.9.0:

| ID | Maps in v1.9.0 | Reason |
|----|----|----|
| `vision_output_low` | ✓ | Direct support obs/game baseline available from /report's vision card |
| `five_slot_timing_outlier` | ✓ | Direct 5-slot-timing baseline from /report's farm-efficiency card; gates on role-match (cores only on both sides) |
| `kda_extreme` | ✓ | KDA baseline trivially computed from /report's match window |
| `teamfight_participation_rank` | ✓ | TF% baseline computable from match-list (parsed-only on user side) |
| `lane_efficiency_extreme` | ✓ | Lane-efficiency baseline already used by /report's lane-outcome card |
| `dead_time_block` | ✗ | Baseline would be "user's typical densest-death window" — not a metric users have a mental model for; comparing windows reads as criticism. Skip in v1.9.0; reconsider if users ask. |
| `buyback_pattern_zero` | ✗ | "You also don't buy back in long games" is not actionable. Skip permanently. |
| `stun_duration_high` | ✗ | Stuns/min varies wildly by hero. Bracket median would be confounded by hero pool. Skip until per-hero normalization is real (out of v1.9.0). |
| `hero_damage_share` | ✗ | Share is per-team-per-match; user side has no clean analog. Skip permanently. |

5 mappable templates is enough surface for the v1.9.0 ship — the page
will average ~2-3 user-strips per match (most templates fire on a
fraction of players).

### B.2 Cat 1A: excluded
Cat 1A lines are themselves comparisons ("hasn't won a lane in 5
corpus games — won this one at 75%"). A user strip beneath would create
a triple comparison (corpus vs current-match vs user-bracket) on one
card. The card would read as a stack of three different yardsticks. Skip.

### B.3 Cat 2: excluded
Match-level. No player keying.

---

## C. Compact stat strip prose templates

### C.1 Strip format
Single line, italic, dim, indented under the source Cat 1B line. No
narrative — 2 or 3 stat tokens separated by middle-dots. Format:

```
{user_stat_label}: {user_value} · Bracket median: {bracket_value}
```

Add a third token only when there's a meaningful pro-side anchor
already implied by the Cat 1B line (e.g. "the pro placed 1" already
appears in the Cat 1B prose; the strip shows user vs bracket; the pro
number is already on the Cat 1B line so doesn't need duplicating).

### C.2 Per-template strip mappings

For each of the 5 Cat 1B templates we map, the strip template + facts:

#### vision_output_low
**Cat 1B**: "Pos 4 (Pudge) placed 1 obs across 31 minutes. Median pos 4/5 in this match: 8.5."
**Strip (default)**: `Yours: 6.8 obs/game (pos 4) · Bracket median: 5.2`
**Strip (honest)**: `Yours: 6.8 obs/game — already ahead of bracket norm (5.2). The pro placed 1.`

Facts:
- `user_obs_per_game`: user's median obs/game across same-position support games (pos 4 if pos 4, pos 5 if pos 5; not crossed)
- `bracket_obs_per_game`: median across all same-position support games in user's window's lobby-mates
- `position`: pos 4 / pos 5

#### five_slot_timing_outlier
**Cat 1B**: "Pos 1 (Sven)'s 5-slot timing landed at 18:30 — 6 min before the match-core median."
**Strip (default)**: `Yours on Sven: 24:10 5-slot timing · Bracket median: 26:40 (pos 1)`
**Strip (default, no hero match)**: `Yours: 25:30 typical pos 1 5-slot · Bracket median: 26:40`
**Strip (honest, no hero match)**: `Your typical pos 1 5-slot: 25:30 — bracket norm 26:40. The pro hit it at 18:30.`

Facts:
- `user_5slot_min`: median 5-slot timing in user's same-role-bucket games (cores). Hero-matched if user has ≥3 games on same hero.
- `bracket_5slot_min`: median across same-role-bucket lobby-mate games in user's window
- `hero_match`: bool — whether the user has hero-specific data
- `position_bucket`: 'pos1' / 'pos2' / 'pos3' (pro's actual position; user side aggregated to that bucket)

#### kda_extreme
**Cat 1B**: "Pos 2 (Storm) finished 14/2/9, KDA 11.5 — highest in the match."
**Strip (default)**: `Yours: 2.8 KDA in pos 2 games · Bracket median: 2.5`
**Strip (honest)**: `Your pos 2 KDA: 2.8. Bracket norm: 2.5. The pro: 11.5.`

Facts:
- `user_kda_pos`: user's median KDA in same-position games
- `bracket_kda_pos`: median across same-position lobby-mate games
- `position`: pos 1-5

#### teamfight_participation_rank
**Cat 1B**: "Pos 4 (Hoodwink) had 78% teamfight participation, highest on the team."
**Strip (default)**: `Yours: 62% TF participation in pos 4 games · Bracket median: 64%`
**Strip (honest)**: `Your pos 4 TF%: 62 — slightly below bracket norm (64). The pro: 78.`

Facts:
- `user_tf_pct`: median teamfight participation in user's same-position games (parsed-only)
- `bracket_tf_pct`: median across same-position lobby-mate games (parsed-only)
- `position`: pos 1-5

Suppression: skip strip if user has < 5 parsed games at the position.
Parsed-only is a real constraint — `teamfight_participation` doesn't
populate on unparsed match summaries.

#### lane_efficiency_extreme
**Cat 1B**: "Pos 1 (PA) won lane phase at 92% efficiency, highest among the 4 cores."
**Strip (default)**: `Yours: 71% lane efficiency in pos 1 games · Bracket median: 68%`
**Strip (honest)**: `Your pos 1 lane efficiency: 71 — bracket norm 68. The pro: 92.`

Facts:
- `user_lane_eff_pct`: median lane_efficiency_pct (or laneAggregateEfficiency for supports — same plumbing as /report's lane-outcome card per CLAUDE.md) in user's same-position games
- `bracket_lane_eff_pct`: median across same-position lobby-mate games
- `position`: pos 1-5

Cores only on both sides (pro template gates on cores already; user
side restricts to cores too — supports on this comparison would inherit
the support-aggregate plumbing complexity for marginal value).

### C.3 Honest mode register integration on user strips

Default register (toggle off): two-token neutral stat row, no editorial.
Honest mode (toggle on): adds **one editorial clause** weaving the user
stat against the bracket norm and (where it fits) the pro stat. Always
contains at least two stats (validator ensures placeholder presence,
same as /report). Passes through `validateRoast` from
[src/lib/honestMode.ts](../src/lib/honestMode.ts).

Banned tokens still apply: any honest-mode user-strip output containing
a token from `BANNED_ROAST_TOKENS` falls back silently to the default
register strip. Failure mode is "strip renders neutral," never
"strip disappears."

The `BREAKDOWNS_BANNED_TOKENS` list does **not** apply to user-side
strips — the user opted into roast voice on `/report`, and the strip
is talking about the user's own data, not commenting on the pro. This
keeps the two registers cleanly separated:

| Line type | Validator |
|---|---|
| Cat 1A (pro context) | `validateBreakdownsProse` (BREAKDOWNS_BANNED_TOKENS) |
| Cat 1B (pro within-match) | `validateBreakdownsProse` |
| User strip, default mode | neutral validator (just placeholder check) |
| User strip, honest mode | `validateRoast` (BANNED_ROAST_TOKENS) |

### C.4 Anti-bleed rule
A user-strip template **cannot** name the pro player or the pro's team.
The strip is the user's mirror; conflating registers ("Cr1t- placed 1
ward, you place 6.8") attributes user-roast voice to a pro line. Strip
prose only references "the pro" generically when honest-mode includes
a third stat token; never by name.

This is a structural rule — enforced by the strip-prose builder
receiving only the `facts` object from the Cat 1B fire, never the
`displayName` or `text`. The Cat 1B layer keeps its names; the strip
layer is text-blind to the upstream prose.

---

## D. Bracket median computation

### D.1 Data source
/report's existing fetch path produces, in order:
1. `fetchPlayerProfile(accountId)` → user's `rank_tier`.
2. `fetchPlayerMatches(accountId, 50)` → 50 match summaries.
3. `fetchAllMatchDetails(ids)` → 50 `ODMatchDetail` entries, each with
   10 `ODMatchPlayer` rows.

For the user-comparison cache, we hook in **at the end of /report's
analyze pipeline**, after all parsed matches have landed (or stalled).
The cache builder runs once, on the same 50-match window the report
already used. Zero additional API calls.

### D.2 Aggregation logic

For each match `m` in the user's window, for each of the 9 non-user
players `q` in `m.players`:
- Classify `q.position` via the same `classifyPosition` helper used in
  Cat 1B ([src/lib/breakdownsProse/positionFromMatch.ts](../src/lib/breakdownsProse/positionFromMatch.ts)).
- For each of the 5 mapped stats, append the value to a per-position
  bucket: `bracketBuckets[position][stat] += [value]`.

Per-stat extraction:

| Stat | Extractor | Notes |
|---|---|---|
| `obs_per_game` | `q.obs_log?.length ?? q.obs_placed ?? 0` | Use the same `obsCount` helper as Cat 1B. Available on summary if not parsed. |
| `5slot_timing_min` | `fiveSlotSec(q) / 60` | Parsed-only. Skip null. |
| `kda_pos` | `(q.kills + q.assists) / max(q.deaths, 1)` | Always populated. |
| `tf_participation_pct` | `q.teamfight_participation` | Parsed-only. |
| `lane_efficiency_pct` | `q.lane_efficiency_pct` (cores only) | Parsed-only. |

After all matches processed, take the **median** of each bucket. Result
shape, written to localStorage:

```ts
interface UserCompareData {
  version: 1
  account_id: number
  rank_tier: number | null
  rank_label: string  // "Crusader 3" etc., resolved from rank_tier
  built_at: number    // Date.now(), used for staleness (§D.4)
  /** Pre-computed for §A.2's "Most useful for {pos_role_label} cards"
   *  affordance. 'core' / 'support' / 'flex' per top-position share. */
  user_role_label: 'core' | 'support' | 'flex'
  /** The user's top-played position. Useful for the affordance copy and
   *  for Phase C's strip-suppression decisions. */
  user_top_position: Position
  match_window: {
    total_matches: number     // total in /report's window (≤50)
    parsed_matches: number    // how many had parsed data
  }
  user_per_position: Record<Position, UserPositionStats>  // for small-sample gating per §A.1
  bracket_per_position: Record<Position, BracketPositionStats>
}

interface UserPositionStats {
  game_count: number          // user's games at this position
  obs_per_game: number | null
  five_slot_min: number | null  // hero-aggregated, cores only; null if no 5-slot data
  hero_5slot: Record<number, { games: number; median_min: number }>  // for hero match
  kda: number | null
  tf_pct: number | null  // parsed-only matches; nullable if < 5 parsed
  lane_eff_pct: number | null  // cores only
}

interface BracketPositionStats {
  sample_count: number  // total lobby-mate games at this position
  obs_per_game: number | null
  five_slot_min: number | null
  kda: number | null
  tf_pct: number | null
  lane_eff_pct: number | null
}
```

`Position` is `1 | 2 | 3 | 4 | 5` (matches existing breakdowns
classifier). Storage size estimate: ~2 KB per cache entry. Well under
localStorage 5 MB budget; one entry per Steam ID.

### D.3 Storage shape + cache key
- localStorage key: `dwr.userCompare.v1`
- Stores a single `UserCompareData` object — the most recently
  analyzed account's data. No multi-account support in v1.9.0
  (nobody asked for it; trivial v1.9.1 add).
- Read defensively (Q1 fallback); parse error → null + clear key.

### D.4 Refresh / invalidation
- Recomputed every time the user runs /report (analyze success →
  pipeline writes the cache).
- Stale-display threshold: > 30 days old. After 30 days, the strip
  still renders but the disclaimer-area affordance switches to "Last
  /report run was {N} days ago — re-run for current bracket." (Click
  → /). Doesn't block strips; just nudges.
- No automatic background refresh. The user re-runs /report manually.

### D.5 Edge cases
- **Insufficient data**: if user has < 5 games at a position OR
  bracket sample < 5 at that position, `UserPositionStats[stat]` and
  `BracketPositionStats[stat]` are `null`. Strip-render layer reads
  null and skips silently.
- **Smurfs / unranked games**: `rank_tier` is null on unranked
  accounts. Strip still renders with "Bracket median" label
  unchanged (the bracket is still the user's lobby-mate average,
  just unanchored to a tier label). The disclaimer-area "at
  {bracket}" pill says "across your last N matches" instead.
- **First-run cache build performance**: aggregation runs in
  ≤ 50 ms on a typical match set (50 matches × 9 players × 5 stats
  = 2250 numeric extractions). Synchronous in the analyze pipeline
  finally-block; user doesn't perceive it.

---

## E. Honest mode register integration (deeper dive)

§C.3 covers the per-strip register split. This subsection covers the
broader integration shape and the failure modes.

### E.1 State plumbing
- `honestMode` state lives in App.tsx, same `useState(false)` as today
  (Q2 default).
- New prop chain: App.tsx → `BreakdownsMatchPage` →
  `BreakdownsPlayerGrid` → `BreakdownsPlayerCard` → `<UserCompareStrip>`.
- `<UserCompareStrip>` is a new component receiving `(facts,
  templateId, honestMode, userCompareData)`. Selects strip template
  by `(templateId, honestMode)`; substitutes; validates; renders or
  null.

### E.2 Validator boundary
The two registers must not bleed:
- **Pro lines** (Cat 1A, Cat 1B) keep their existing `validateBreakdownsProse`.
  No change.
- **User strips** validate via:
  - Default mode: a new neutral validator that only enforces
    placeholder presence (`templateHasPlaceholder` from
    [src/lib/honestMode.ts](../src/lib/honestMode.ts)).
  - Honest mode: `validateRoast` (the existing user-side check),
    which runs `BANNED_ROAST_TOKENS`.
- A user strip that fails honest-mode validation falls back to the
  default-mode strip for the same template. Never null — having data
  to compare and rendering nothing is worse UX than rendering a
  neutral comparison.

### E.3 Anti-leak rule
The strip-prose builder is structurally text-blind to the Cat 1B
prose (§C.4). It sees only:
- The `facts` object from the Cat 1B fire (numbers + position).
- The user's `UserCompareData` for the same position.
- `honestMode: boolean`.
- `templateId: string` (selects strip template).

It cannot accidentally include pro names, team names, or the Cat 1B
text. The Cat 1B prose is a sibling render, not an input.

### E.4 Honest-mode contrast example
Same Cat 1B fire (`vision_output_low`, pos 4 placed 1 obs):

```
[Cat 1B line, unchanged in either mode]
Pos 4 (Pudge) placed 1 obs across 31 minutes. Median pos 4/5 in this match: 8.5.

[user strip, default mode]
  Yours: 6.8 obs/game (pos 4) · Bracket median: 5.2

[user strip, honest mode]
  Your pos 4 obs/game: 6.8 — already ahead of bracket norm (5.2). The pro placed 1.
```

Note: the honest-mode strip is **sharper**, not crueler. The brief was
"sharper editorial register"; the strip surfaces a non-trivial finding
("you're already ahead of your bracket here, the pro just isn't a
warding pos 4 hero") rather than just doubling the data. Templates
that can't add editorial value beyond the data fall back to default
mode automatically.

---

## F. Visual differentiation between pro and user lines

### F.1 Decision (Q5 default)
- **Pro line**: existing `.dwr-breakdowns-player-prose` styling. White-
  cream body text, no prefix, no indent.
- **User strip**: new `.dwr-breakdowns-user-strip` class:
  - `font-style: italic`
  - `padding-left: 12px` (indent)
  - `border-left: 2px solid #8a4a6a` (pink-toned accent, distinct
    from `#E94560` accent red used for pro emphasis)
  - `color: #8a4a6a` (same pink-toned dim)
  - `font-size: 0.85em` (one notch smaller than body)
  - `font-family: 'JetBrains Mono', monospace` for the data tokens
    (numbers, units), Inter for any natural-language editorial in
    honest mode. **Decision**: keep it all Inter italic — mixing
    families inside one strip line is visually busy. The italic
    + pink + indent already does the differentiation work.

### F.2 What the pink-toned color signals
The site's visual language reserves `#E94560` (accent red) for
"concerning severity" and pro-emphasis. A second accent in the same
red family would conflict. Pink-violet (`#8a4a6a`) sits adjacent to
the cosmic violet palette (`--accent-violet: #5B3A8F`) without
clashing — reads as "user-themed sub-content" without claiming red's
emphasis weight.

If the visual review during Phase D rejects the pink: fall back to
`#5B3A8F` (cosmic violet, already in the palette). Less differentiated
from base body but still clearly indented + italic.

### F.3 Mobile
At ≤ 640px, strips keep their styling but reduce padding to
`padding-left: 8px`. The 2px border bar stays.

### F.4 Honest mode visual cue
No additional visual change on strips when honest mode is on. The
existing cosmos warm-red wash + concerning-card glow already signals
the mode. Doubling-up on strips would make the page feel painted-in-
red. Strip prose changes; visual treatment doesn't.

---

## G. Steam ID nudge in disclaimer area

### G.1 Wording + placement
Wording: **"Run a report to compare your stats →"**
Placement: right-aligned in the disclaimer row on
`/breakdowns/{match_id}` only. Not on `/breakdowns` (listing).
Styling: dim italic, matches disclaimer body weight; underline on hover
only.
Link target: `/` (homepage). Existing `goHome()` handler already
preserves the user's path → home navigation.

### G.2 Visibility logic
- **No localStorage Steam ID**: render the link.
- **Steam ID present, cache valid**: hide the link, show the "Comparing
  against your last N matches at {bracket}" affordance + honest-mode
  toggle (per A.2).
- **Steam ID present, cache stale (> 30 days)**: render
  "Last /report run was {N} days ago — re-run for current bracket"
  in place of the standard affordance. Click → `/`.
- **During cold-load**: render nothing in the right-aligned slot until
  the localStorage check completes. The check is synchronous in
  App.tsx's bootstrap effect (typically same render frame), so this
  is sub-frame invisible — but the structural rule is "no flicker."

### G.3 Privacy framing
The disclaimer body remains: "Observations from public match data.
Not affiliated with any team, player, or tournament. Data via OpenDota."
The personalization affordance does **not** add a "your data is
local-only" line — that's a footer / privacy-page concern. The
existing footer is the right place for that disclosure if it's worth
adding (recommend: yes, in the existing trust block, one line:
"User-comparison data lives only in your browser; we don't see it.").
Out of v1.9.0 scope as a hard requirement; flagged for the launch
checklist.

---

## H. Build sequencing

Five phases, each ships its own preview deploy + visual gate review
before the next starts. Total estimated build time: **6–8 working days**
across phases. The bottleneck is Phase A (data plumbing into
localStorage) and Phase E (calibration against real data).

### Phase A — bracket median compute + cache (2 days)
- Add `src/lib/userCompareData.ts`: `buildUserCompareData(matches,
  details, profile)` returning `UserCompareData`. Sync, pure.
- Add `src/lib/userCompareCache.ts`: defensive localStorage read/write
  with a `safe*()` shape mirroring `breakdownsCache.ts`.
- Wire into App.tsx's analyze pipeline: on stream-done, build cache
  + write to localStorage. Idempotent — multiple analyses overwrite.
- Add a unit-test fixture (synthetic 50-match set) confirming
  position bucketing + median math. Self-test on module load,
  console.error on drift.
- Preview deploy + verification: open browser devtools, confirm
  localStorage key populates after running /report on `magsasaka`
  account, confirm shape matches §D.2 spec.

**Gate-review questions**:
- Does the cache shape survive serialization round-trip without
  precision loss?
- Are position buckets resilient to flex players in lobby-mates? (the
  classifier already handles this for /breakdowns; verify here.)

### Phase B — strip prose templates + validators (1.5 days)
- Add `src/lib/breakdownsProse/userStrips.ts`: 5 strip-template
  builders, one per mapped Cat 1B template. Each takes `(facts,
  userCompareData, honestMode)` → `string | null`.
- Hook the new neutral validator (placeholder check only).
- Honest-mode strip variants run through existing `validateRoast`.
- Module-load self-test: run each strip builder against synthetic
  data, assert validation passes in both modes.
- No UI yet — Phase B is library-layer.

**Gate-review questions**:
- Do honest-mode strips read as sharper-but-fair, or do they read as
  rubbing-it-in? (Calibration against real user data is in Phase E,
  but a smell-test on synthetic data here catches obvious drift.)
- Are placeholder counts ≥ 2 across all strip templates? (Templates
  with one stat token read flat in honest mode.)

### Phase C — rendering + disclaimer integration (1.5 days)
- New `<UserCompareStrip>` component in
  `src/components/UserCompareStrip.tsx`.
- `BreakdownsPlayerCard` accepts `userCompareData` + `honestMode`
  props; renders strip beneath each Cat 1B prose line where
  applicable.
- `BreakdownsDisclaimer` accepts new props (`hasUserCompare`,
  `userCompareData`, `honestMode`, `onToggleHonestMode`,
  `onNavigateHome`); renders the right-side affordance per §G.2.
- Plumb props through App.tsx → `BreakdownsMatchPage` →
  `BreakdownsPlayerGrid` → `BreakdownsPlayerCard`.
- Preview deploy + visual gate.

**Gate-review questions**:
- Does the strip render cleanly on mobile (≤ 640px)?
- Does the disclaimer-area honest-mode toggle feel discoverable, or
  buried?

### Phase D — visual styling + register polish (0.5–1 day)
- New CSS class in `src/index.css`: `.dwr-breakdowns-user-strip`
  per §F.1.
- Honest-mode + default-mode strip parity check on visual review:
  same length-of-line, no layout shift on toggle.
- Mobile padding-and-border check.
- Decision point: pink (`#8a4a6a`) vs violet (`#5B3A8F`) vs
  pink-with-larger-bar. Visual review picks one.

**Gate-review questions**:
- Does the pink read as "user-themed" or as "concerning"?
- Is the indent + border combination enough differentiation, or does
  the strip merge visually with the Cat 1B line above it?

### Phase E — calibration pass (1–2 days)
- Run /report on `magsasaka` (the existing test account) to populate
  cache.
- Open ~10 different `/breakdowns/{match_id}` pages spanning multiple
  pro positions and observe strip behavior:
  - Does the right strip fire on the right Cat 1B line?
  - Are small-sample footnotes appearing where expected?
  - Do honest-mode strips read sharper-but-fair?
- Eyeball the data: does the bracket median for a Herald support's
  obs/game land near 4-6 (publicly known ballpark)?
- If any strip reads as criticism rather than data: revisit template
  copy in Phase B; loop.
- Verify silent fallback in a localStorage-blocked context (Firefox
  private mode with strict tracking protection, or a manually
  Object.defineProperty'd window.localStorage that throws).

**Gate-review questions**:
- Does the feature actually add value on the test runs, or does it
  just clutter the cards?
- Is anyone going to look at this and feel embarrassed by their own
  data? (The "negative-delta partner stays anonymized" social-cost
  rule from /report's stack-synergy is the precedent — same instinct
  applies here.)

### Phase F (out of scope, flagged for v1.9.1 if Phase E surfaces it)
- Cache invalidation if user runs /report on a different account
  (today the cache is per-account; switching accounts mid-session
  needs a path).
- Footer privacy-disclosure line about user-compare data being
  local-only.
- v1.9.0 ships without these unless Phase E surfaces them as
  shippable-blockers.

---

## Acceptance bar self-check

Per the brief's acceptance bar:

- [x] All 8 subsections (A–H) covered with concrete decisions, not
  TBD.
- [x] Compact stat-strip mappings defined for every Cat 1B template
  that supports user-comparison (5 of 9, with reasons for the 4
  exclusions).
- [x] Bracket median computation specified to the level Phase A can
  build directly without re-deriving — extractors named by field name
  ([§D.2](#d2-aggregation-logic)), source data flow tied to /report's
  existing pipeline ([§D.1](#d1-data-source)), storage shape declared
  with TS types ([§D.2](#d2-aggregation-logic)).
- [x] Visual differentiation decision made — pink-toned italic with
  left border bar, no textual prefix (§F.1, with fallback to violet).
- [x] Build sequencing has rough day estimates per phase
  (A: 2, B: 1.5, C: 1.5, D: 0.5–1, E: 1–2, total 6–8 days).

### New design questions surfaced (need resolution before build)

These are §1's open questions, restated for the reviewer's checklist:

1. **Q1**: Confirm silent-fallback behavior in localStorage-blocked
   contexts is acceptable.
2. **Q2**: Confirm we're NOT adding localStorage persistence to honest
   mode — it stays in-memory, plumbed as a prop.
3. **Q3**: Confirm honest-mode toggle surfaces in the disclaimer area
   on `/breakdowns/{match_id}` (only when personalization is active).
4. **Q4**: Confirm "bracket" = user's own bracket, lobby-mate
   aggregation without further rank-filtering.
5. **Q5**: Confirm pink-toned italic + 2px border bar + no textual
   prefix is the visual treatment.

After the 5 questions are resolved + Q1–Q5 defaults confirmed (or
overridden), Phase A can start.

### Bracket median feasibility check

Real or hand-waved? **Real.** /report's existing fetch path
([src/App.tsx:128–158](../src/App.tsx#L128)) returns 50 match details
with full per-player stats on all 10 players in each match. The 5
mapped stats are extractable from existing fields — no new API calls.
Only structural change: a post-pipeline aggregation step (~50 ms) that
writes to localStorage. The summary-only stats (obs counts, KDA) work
on unparsed matches; the parsed-only stats (5-slot, TF%, lane
efficiency) gracefully degrade to null when sample is < 5.

### Honest mode register coexistence verification

Pro-side prose: passes through `validateBreakdownsProse`
(BREAKDOWNS_BANNED_TOKENS), no second-person, no editorializing — same
as today.
User-side strips: pass through `validateRoast` in honest mode
(BANNED_ROAST_TOKENS) or a neutral placeholder check otherwise.
The strip-prose builder is structurally text-blind to the Cat 1B
prose ([§E.3](#e3-anti-leak-rule)), so register bleed is impossible
by construction — it can't accidentally weave a banned token into a
pro line because it never sees the pro line. The two validators run
on disjoint text inputs.

---

## Stop point

Spec doc complete. No code, no template implementation. Awaiting
review on §1's five open questions and the §0 design decisions
restatement.
