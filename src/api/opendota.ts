// Browser → OpenDota client. Free tier is 60 req/min. We throttle below that
// (50/min) to leave headroom for retries and other tabs hitting the same IP.

import type { ODMatchDetail, ODMatchSummary, ODPlayerProfile } from '../types'

const BASE_URL = 'https://api.opendota.com/api'

// Token-bucket-ish rate limiter: enforces a minimum gap between request starts.
// 60 req/min = 1 req per 1000ms. We use 1200ms to stay safely under.
const MIN_GAP_MS = 1200

class RateLimiter {
  private nextAllowedAt = 0

  async acquire(): Promise<void> {
    const now = Date.now()
    const wait = Math.max(0, this.nextAllowedAt - now)
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + MIN_GAP_MS
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  }
}

const limiter = new RateLimiter()

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  await limiter.acquire()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // Single retry on 429 with Retry-After honoring (capped).
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, { signal })
    if (res.ok) return (await res.json()) as T
    if (res.status === 429 && attempt === 0) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 5
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000))
      continue
    }
    const body = await res.text().catch(() => '')
    throw new HttpError(res.status, `OpenDota ${path} → ${res.status} ${body.slice(0, 200)}`)
  }
  throw new HttpError(0, `OpenDota ${path} failed`)
}

export async function fetchPlayerProfile(
  accountId: number,
  signal?: AbortSignal
): Promise<ODPlayerProfile> {
  return get<ODPlayerProfile>(`/players/${accountId}`, signal)
}

export async function fetchPlayerMatches(
  accountId: number,
  limit = 20,
  signal?: AbortSignal
): Promise<ODMatchSummary[]> {
  return get<ODMatchSummary[]>(
    `/players/${accountId}/matches?limit=${limit}&significant=0`,
    signal
  )
}

export async function fetchMatchDetail(
  matchId: number,
  signal?: AbortSignal
): Promise<ODMatchDetail> {
  return get<ODMatchDetail>(`/matches/${matchId}`, signal)
}

export interface MatchFetchProgress {
  done: number
  total: number
}

export async function fetchAllMatchDetails(
  matchIds: number[],
  onProgress: (p: MatchFetchProgress) => void,
  signal?: AbortSignal
): Promise<Record<number, ODMatchDetail>> {
  const out: Record<number, ODMatchDetail> = {}
  let done = 0
  // Sequential because the limiter would otherwise just queue them anyway.
  // The visible progress UI feels better in order.
  for (const id of matchIds) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      out[id] = await fetchMatchDetail(id, signal)
    } catch (err) {
      // One bad match shouldn't kill the report; just skip it.
      // eslint-disable-next-line no-console
      console.warn(`Failed to fetch match ${id}:`, err)
    }
    done++
    onProgress({ done, total: matchIds.length })
  }
  return out
}

export { HttpError }
