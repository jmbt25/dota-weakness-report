// Cloudflare Worker entry point.
//
// Pre-Phase-7 the project ran on pure Cloudflare Workers Static Assets
// — no Worker code, just file serving + SPA fallback. Phase 7 adds an
// HTMLRewriter pass that swaps the og:image (and twitter:image) tags
// in index.html on /watch routes so Discord / X / Reddit / Slack
// unfurlers show the watch-feature share card instead of the homepage
// card.
//
// Why a runtime rewriter and not pre-rendered variants:
// - Static unfurlers don't run JS, so the swap has to happen
//   server-side (or in our case at the edge).
// - Pre-rendering would mean two index.html variants in dist/ and a
//   lookup at request-time — same complexity for less flexibility.
// - HTMLRewriter is a streaming transform — no measurable latency
//   added on top of the static asset fetch.
//
// Scope of the rewrite (v1 of /watch share previews):
// - /watch and /watch/{any} → swap og:image, twitter:image, og:title,
//   og:description, twitter:title, twitter:description.
// - All other routes pass through unchanged. The homepage card lives
//   on /, /report, /meta, /mmr-math, /changelog without modification.
// - Per-match dynamic OG cards (showing actual team names + score)
//   remain v1.1 territory — would require either pre-rendered images
//   per match or runtime image generation.
//
// Bundle: pure TypeScript, wrangler bundles via esbuild internally.
// No deps from src/.

interface Env {
  ASSETS: Fetcher
}

const WATCH_OG_IMAGE = 'https://dotaweakness.com/og-watch.png'
const WATCH_OG_TITLE = 'Watch like a coach — Dota Weakness Report'
const WATCH_OG_DESCRIPTION =
  'Coach-style breakdowns of recent professional Dota 2 matches. What stood out — every recent pro match.'

class AttributeSwapper {
  constructor(private attribute: string, private value: string) {}
  element(el: Element): void {
    el.setAttribute(this.attribute, this.value)
  }
}

function isWatchRoute(pathname: string): boolean {
  // /watch, /watch/, /watch/{anything}
  return /^\/watch(\/|$)/.test(pathname)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Always defer asset fetching to the static-assets binding. The
    // SPA fallback (configured in wrangler.toml) returns index.html for
    // any path the bundle doesn't have, so /watch/{id} comes back as
    // index.html with HTML content-type.
    const response = await env.ASSETS.fetch(request)

    if (!isWatchRoute(url.pathname)) return response

    // Only rewrite text/html. Static assets (images, JS, CSS) under
    // /watch don't exist today but if they ever do, don't try to parse
    // them as HTML.
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return response

    const swapImage = new AttributeSwapper('content', WATCH_OG_IMAGE)
    const swapTitle = new AttributeSwapper('content', WATCH_OG_TITLE)
    const swapDescription = new AttributeSwapper('content', WATCH_OG_DESCRIPTION)

    return new HTMLRewriter()
      .on('meta[property="og:image"]', swapImage)
      .on('meta[name="twitter:image"]', swapImage)
      .on('meta[property="og:image:alt"]', new AttributeSwapper('content', 'Watch like a coach'))
      .on('meta[property="og:title"]', swapTitle)
      .on('meta[name="twitter:title"]', swapTitle)
      .on('meta[property="og:description"]', swapDescription)
      .on('meta[name="twitter:description"]', swapDescription)
      .transform(response)
  },
} satisfies ExportedHandler<Env>
