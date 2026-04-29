# Dota Weakness Report

A static website that grades your last 50 Dota 2 matches and tells you,
specifically, what you keep doing wrong. Paste your Steam ID, get a
ten-card report covering deaths, farm, items, lanes, hero pool, stack
synergy, vision, tilt, and your closest pro twin. Live at
**[dotaweakness.com](https://dotaweakness.com)**.

## What it does

Nine analyses, one card each. Each card surfaces a measured stat against
a role-aware, rank-aware baseline and grades it Strong / Healthy / Watch
/ Concerning. Nothing predictive — these are descriptive findings on
games that already happened.

- **Death timing** — total deaths/game, plus a distribution across
  early/mid/late game when parsed timing data is available.
- **Farm efficiency** — GPM and XPM at the 10- and 20-minute marks vs
  your bracket's role baseline. Surfaces 5-item power-spike timing for
  cores.
- **Item timing** — your top heroes' core item timings vs benchmark.
- **Situational items** — flags enemy lineups (stunlock, magic burst,
  evasion, etc.) and checks whether you built the canonical counter.
- **Lane outcome** — lane win rate plus a "winning lane but losing
  game" sub-finding. Verdict considers both lane WR and lane efficiency
  so cores can't get a Strong badge while their farm side is losing.
- **Hero pool** — distinct heroes played, win rate per hero, and
  recommended top-picks for your bracket.
- **Stack synergy** — per-partner WR delta vs your overall WR, with a
  95% CI and a "show partner names" toggle for screenshot safety.
- **Loss streak / tilt** — longest streak, post-loss WR, and a WR-by-
  session-position sub-finding (1st game / 2nd / 3rd / 4th+).
- **Vision** — observer/sentry placements rendered over the Dota 2
  minimap, with ward-lifetime and (when death coordinates are in the
  parsed data) a vision-death mismatch tile.
- **Pro Comparison** — computes a 30-feature playstyle vector from your
  last 50 matches, finds your closest twin among ~60 currently-active
  TI cycle qualifiers, and breaks the comparison down by hero
  archetype, tempo, farm shape, vision, and death pattern. Hides for
  windows under 25 matches. Suppresses the headline twin for genuine
  3+ role flex players (per-axis breakdown still renders).

Baselines are tuned per role (core / support / flex) and per rank
bucket (Herald-Crusader / Archon-Legend / Ancient-Divine / Immortal),
so an Archon support and a Divine carry don't get judged against the
same numbers.

There's also a fire-icon **Honest Mode** toggle that swaps each card's
prose to a sharper roast voice. Constrained: every honest-mode line
must cite a measured stat — templates without a `{stat}` placeholder
are filtered out. No prescriptions for things we don't measure (no "buy
TP scrolls" advice from data we don't have).

Two extra pages alongside the report:

- **[/mmr-math](https://dotaweakness.com/mmr-math)** — at your current
  WR, how many games to the next bracket? Compares against a 55%
  benchmark. Branches for Immortal, climbing (>51%), near-breakeven
  (49-51%), and sub-49% trajectories.
- **[/meta](https://dotaweakness.com/meta)** — per-bracket meta heroes
  with a position filter and a "blindspot" section (heroes you've never
  played that are winning at your rank). Tier formula combines WR lift,
  pick rate, and week-over-week momentum — refreshed weekly via a
  GitHub Action that pulls live data from OpenDota's `/heroStats`.

## How it works

Static React + Vite + TypeScript site. No backend, no accounts, no
server-side state, no tracking. Match data is fetched from the public
[OpenDota API](https://docs.opendota.com/) directly from your browser
— rate-limited to ~57 req/min to stay inside their free-tier ceiling.

The Pro Comparison card uses a static JSON corpus
(`src/data/pro-vectors.json`) of pre-computed pro playstyle vectors,
refreshed weekly via a GitHub Actions workflow that opens a PR with
the regenerated data. Your own vector is computed in-browser from the
same matches the rest of the report runs on — no extra API calls, no
data leaves your session.

Charts are Recharts. Routing is a 50-line pathname router, no
react-router. Production deploy is Cloudflare Workers Static Assets.

Anyone can fork and run it locally. The deploy is a static `dist/`
folder — drop it on any host that serves files.

## What it doesn't do

- Doesn't replace coaching or replay review. It surfaces patterns; it
  doesn't watch your games.
- Sample size floor is 50 matches. Below that the role classifier and
  several of the analyses get noisy. Results stabilize at 50 but
  aren't predictive at smaller windows.
- Death timing distribution falls back to an approximation from total
  deaths and match duration when parsed timing data isn't available.
  The card footnote discloses this.
- Vision-death mismatch metric only renders when at least 10 of your
  parsed matches carry death coordinates. Older matches frequently
  don't, and the metric is hidden until the sample is real.
- Per-hero deep dive (item-build vs winning-build divergence, fight
  participation, losing patterns) is scaffolded but not implemented.

## Running locally

Requires Node 20+.

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the dist/ build locally
```

No environment variables needed — the OpenDota free tier doesn't
require an API key.

To refresh the Pro Comparison corpus locally (the production version
runs weekly via GitHub Actions):

```bash
node scripts/refresh-pro-corpus.mjs
```

Pulls last-50-match samples for every pro in
`scripts/pro-corpus-list.json` and rewrites `src/data/pro-vectors.json`.
Takes ~20 minutes on the free OpenDota rate limit. Fails loudly on
daily-cap exhaustion or upstream outage rather than writing partial
data. The curated pro list is hand-edited at the start of each TI
cycle when team rosters lock in.

## Contributing

Solo weekend project. Contributions welcome but not actively recruited.

- Bug reports are most useful when they include the Steam ID you ran
  the report on (or a representative one) and a screenshot of the card
  that misbehaved.
- Open an issue before a large PR so we can talk through scope.
- Small fixes (typos, baseline tweaks, hero-trait additions) — go
  ahead and PR directly.

The architecture and constraints live in [CHANGELOG.md](CHANGELOG.md);
that's the best place to start if you want to understand why a piece
of code is shaped the way it is.

## Inspirations

Several insights are inspired by the public Dota learning community,
including Resolut1on, BSJ, and others. Thank you.

## License

[AGPL-3.0-or-later](LICENSE). Copyright © 2026 jmbt25.

If you fork this and run a modified version on a public server, the
AGPL requires you to make your source available to users of that
server. Practically: forking and self-hosting is fine; rebadging the
live site as your own SaaS without disclosing source isn't.

## Not affiliated with Valve

Hero names, item names, the minimap image, and Dota 2 itself are
property of Valve. This project uses public data from the OpenDota API
and does not modify, intercept, or interact with the game client.
