# Dota Weakness Report

Personalized Dota 2 performance analysis. Paste your Steam ID, get a data-driven
report on your recurring mistakes and how to fix them.

The site is local-first and 100% client-side: a static React bundle that fetches
your match history from the public [OpenDota API](https://docs.opendota.com/)
straight from your browser. No backend, no accounts, no tracking.

## What it analyzes

For your last 5 (free) or 20 (paid) matches:

1. **Death timing distribution** — when in the game you tend to die
2. **Farm efficiency** — GPM/XPM at the 10- and 20-minute marks vs. role baseline
3. **Item timing** — your top 3 heroes' core item timings vs. benchmark
4. **Lane outcome** — lane win rate and how it correlates with match wins
5. **Hero pool concentration** — distinct heroes played, win rate on most-played
6. **Loss streak / tilt detection** — longest streak and post-loss win rate

Baselines in v1 are hardcoded role/rank averages. Search the codebase for
`TODO: replace with dynamic baseline` for the spots to wire up live data.

## Run locally

Requires Node 18+.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the dist/ build locally
```

## Project structure

```
src/
  api/opendota.ts      # OpenDota API client + rate limiter (60 req/min cap)
  analyses/            # one file per analysis
  components/          # React components
  lib/
    baselines.ts       # hardcoded role/rank/item baselines (v1 placeholders)
    parseInput.ts      # accept Steam IDs and Dotabuff/OpenDota/Stratz URLs
    matchHelpers.ts    # tiny helpers for pulling fields out of OD responses
    license.ts         # stubbed license key validation
  App.tsx              # top-level UI and state machine
  types.ts             # shared types
```

## Deploy

See [DEPLOY.md](DEPLOY.md) for step-by-step Cloudflare Pages instructions.
The same `dist/` output also drops straight into Vercel, Netlify, or
GitHub Pages.

## License

MIT — see [LICENSE](LICENSE).
