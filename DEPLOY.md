# Deploying to Cloudflare Pages

This is a pure static site — `npm run build` produces a `dist/` folder you can
upload anywhere. The instructions below cover the recommended flow:
Cloudflare Pages connected to your GitHub repo, with auto-deploy on push.

## Prerequisites

- The project is on GitHub (private or public is fine).
- A Cloudflare account with Pages access (free tier is enough).

## One-time setup

1. Sign in to [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorize the Cloudflare app on GitHub and pick the
   `dota-weakness-report` repo.
4. On the **Set up builds and deployments** screen, use:

   | Field | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `Vite` (or *None* — fields below are the same) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Node version | `20` (set via `NODE_VERSION` env var if needed) |
   | Root directory | *(leave empty)* |

5. Click **Save and Deploy**. The first build runs immediately.

That's it. From here, every push to `main` ships a new production deploy and
every push to a non-main branch creates a preview deploy at
`<branch>.<project>.pages.dev`.

## Custom domain

In the project's **Custom domains** tab, add your domain. Cloudflare will
either:

- Automatically configure DNS if the domain is on Cloudflare, or
- Give you a CNAME target to add at your registrar.

HTTPS is provisioned automatically.

## Environment variables

The app needs none — all calls go to the public OpenDota API. If you later
add an OpenDota API key (higher rate limits), set it in
**Settings → Environment variables** as `VITE_OPENDOTA_API_KEY` and read it
from `import.meta.env` in `src/api/opendota.ts`.

## Manual upload (no GitHub)

If you'd rather not connect a git repo:

1. Run `npm run build` locally.
2. In Cloudflare Pages, choose **Direct Upload** instead of **Connect to Git**.
3. Drag the `dist/` folder into the upload box.
4. Name the project, click **Deploy**.

You can re-upload `dist/` any time to publish updates.

## Troubleshooting

- **Build fails with "Module not found"** — make sure Node 20 is selected.
  Older Node versions don't support some of Vite 5's ESM resolution.
- **CORS errors in the browser** — the OpenDota API serves
  `Access-Control-Allow-Origin: *`, so this should never happen. If you see it,
  check whether a browser extension is blocking the request.
- **429 rate limited** — the app already throttles to ~50 req/min. If you hit
  this, you've probably reset the report several times in quick succession;
  wait a minute and try again.
