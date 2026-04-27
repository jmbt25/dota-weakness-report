// Browser → OpenDota client. Free tier is 60 req/min. We throttle below that
// (~50/min) to leave headroom for retries.

import type { ODHero, ODMatchDetail, ODMatchSummary, ODPlayerProfile } from '../types'

const BASE_URL = 'https://api.opendota.com/api'

// Token-bucket-ish rate limiter: enforces a minimum gap between request starts.
// 60 req/min = 1 req per 1000ms. We use 1050ms to stay just under the ceiling
// while leaving a small safety margin for clock drift; 429s are retried once.
const MIN_GAP_MS = 1050

class RateLimiter {
  private nextAllowedAt = 0

  async acquire(signal?: AbortSignal): Promise<void> {
    const now = Date.now()
    const wait = Math.max(0, this.nextAllowedAt - now)
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + MIN_GAP_MS
    if (wait > 0) await sleep(wait, signal)
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  signal?: AbortSignal
): Promise<T> {
  await limiter.acquire(signal)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, { method, signal })
    if (res.ok) {
      // Some POSTs return empty bodies; tolerate that.
      const text = await res.text()
      return (text ? JSON.parse(text) : {}) as T
    }
    if (res.status === 429 && attempt === 0) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 5
      await sleep(Math.min(retryAfter, 10) * 1000, signal)
      continue
    }
    const body = await res.text().catch(() => '')
    throw new HttpError(res.status, `OpenDota ${method} ${path} → ${res.status} ${body.slice(0, 200)}`)
  }
  throw new HttpError(0, `OpenDota ${method} ${path} failed`)
}

const get = <T,>(path: string, signal?: AbortSignal) => request<T>('GET', path, signal)
const post = <T,>(path: string, signal?: AbortSignal) => request<T>('POST', path, signal)

export async function fetchHeroes(signal?: AbortSignal): Promise<ODHero[]> {
  return get<ODHero[]>('/heroes', signal)
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

export interface ParseRequestResponse {
  job?: { jobId: number }
}

/**
 * Ask OpenDota to parse this match's replay. Returns immediately — actual
 * parsing happens server-side; clients poll `fetchMatchDetail` to detect
 * completion (the `version` field becomes non-null).
 */
export async function requestMatchParse(
  matchId: number,
  signal?: AbortSignal
): Promise<ParseRequestResponse> {
  return post<ParseRequestResponse>(`/request/${matchId}`, signal)
}

export interface MatchFetchProgress {
  done: number
  total: number
}

/**
 * Streaming variant: fires `onMatch` after each individual /matches/{id} call
 * resolves (or fails). Used by the progressive renderer so cards can update
 * the moment a match's data becomes available — not after the whole batch
 * finishes. The caller is responsible for accumulating the resulting detail
 * map in their own state (so React re-renders on each update).
 */
export async function fetchAllMatchDetails(
  matchIds: number[],
  onMatch: (matchId: number, detail: ODMatchDetail | null, progress: MatchFetchProgress) => void,
  signal?: AbortSignal
): Promise<Record<number, ODMatchDetail>> {
  const out: Record<number, ODMatchDetail> = {}
  let done = 0
  // Sequential because the limiter would otherwise just queue them anyway.
  // The visible progress UI feels better in order.
  for (const id of matchIds) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    let detail: ODMatchDetail | null = null
    try {
      detail = await fetchMatchDetail(id, signal)
      out[id] = detail
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      // One bad match shouldn't kill the report; just skip it.
      // eslint-disable-next-line no-console
      console.warn(`Failed to fetch match ${id}:`, err)
    }
    done++
    onMatch(id, detail, { done, total: matchIds.length })
  }
  return out
}

/**
 * For each match without parsed data, POST a parse request and then poll
 * `/matches/{id}` every 5s until parsed or timeout. Runs up to `concurrency`
 * matches in parallel; the underlying rate limiter still serializes the
 * actual HTTP calls.
 *
 * Mutates the `details` map in place so the caller's reference is updated.
 */
export interface ParseProgress {
  done: number
  total: number
  stalled: number
}

export type ParseOutcome = 'parsed' | 'stalled'

export async function parseMatches(
  matches: ODMatchSummary[],
  details: Record<number, ODMatchDetail>,
  options: {
    concurrency?: number
    /** Wait this long after kicking off a parse before the first status check. OpenDota
     *  parses almost never finish in <15s, so the first few polls are pure waste against
     *  the rate limiter. Default 15s. */
    initialDelayMs?: number
    pollIntervalMs?: number
    /** Per-match polling ceiling. Default 90s — see CLAUDE.md ("Don't lower
     *  parseMatches timeoutMs below 90s") for the calibration rationale. */
    timeoutMs?: number
    /** Hard stall ceiling — if a parse hasn't completed after this long, we
     *  drop it and surface it as stalled so the user can refresh. The 3-min
     *  default matches the spec ("If a match's parse hasn't completed after
     *  3 minutes of polling, mark it as stalled"). */
    stallTimeoutMs?: number
    /** Fires after each individual match resolves (parsed or stalled), so
     *  the caller can update React state and re-run analyses live. */
    onMatchResolved?: (matchId: number, detail: ODMatchDetail | null, outcome: ParseOutcome) => void
    onProgress?: (p: ParseProgress) => void
    signal?: AbortSignal
  } = {}
): Promise<void> {
  const concurrency = options.concurrency ?? 5
  const initialDelayMs = options.initialDelayMs ?? 15_000
  const pollIntervalMs = options.pollIntervalMs ?? 7_000
  const timeoutMs = options.timeoutMs ?? 90_000
  // 3-min stall ceiling per the progressive-render spec. Independent of
  // timeoutMs, which is the per-poll-cycle ceiling — stallTimeoutMs is the
  // outermost bound after which the worker gives up entirely on this match.
  const stallTimeoutMs = options.stallTimeoutMs ?? 180_000

  const needsParse = matches
    .map((m) => m.match_id)
    .filter((id) => {
      const d = details[id]
      return !d || d.version == null
    })

  const total = needsParse.length
  let done = 0
  let stalled = 0
  options.onProgress?.({ done, total, stalled })
  if (total === 0) return

  const queue = [...needsParse]

  async function worker() {
    while (queue.length > 0) {
      if (options.signal?.aborted) return
      const id = queue.shift()
      if (id == null) return
      let outcome: ParseOutcome = 'stalled'
      try {
        outcome = await parseOne(
          id,
          initialDelayMs,
          pollIntervalMs,
          timeoutMs,
          stallTimeoutMs,
          details,
          options.signal
        )
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        // eslint-disable-next-line no-console
        console.warn(`Parse for match ${id} did not complete:`, err)
        outcome = 'stalled'
      }
      done++
      if (outcome === 'stalled') stalled++
      options.onMatchResolved?.(id, details[id] ?? null, outcome)
      options.onProgress?.({ done, total, stalled })
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, needsParse.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
}

async function parseOne(
  matchId: number,
  initialDelayMs: number,
  pollIntervalMs: number,
  timeoutMs: number,
  stallTimeoutMs: number,
  details: Record<number, ODMatchDetail>,
  signal?: AbortSignal
): Promise<ParseOutcome> {
  const stallStart = Date.now()
  // Kick off the parse job. Some matches (very old, abandoned, or already
  // queued) may return errors — we still poll afterwards in case the data
  // appears anyway.
  try {
    await requestMatchParse(matchId, signal)
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    // Continue to polling — sometimes the POST 4xx's but the match is parsable.
  }

  // OpenDota parses typically take 25-45s. Skip the first ~15s of polling
  // entirely instead of burning rate-limiter slots on guaranteed misses.
  await sleep(initialDelayMs, signal)
  let detail: ODMatchDetail | null = null
  try {
    detail = await fetchMatchDetail(matchId, signal)
    details[matchId] = detail
    if (detail.version != null) return 'parsed'
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    // transient — fall through to polling loop
  }

  const pollStart = Date.now()
  while (Date.now() - pollStart < timeoutMs && Date.now() - stallStart < stallTimeoutMs) {
    await sleep(pollIntervalMs, signal)
    try {
      detail = await fetchMatchDetail(matchId, signal)
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      continue // transient — try again next poll
    }
    details[matchId] = detail
    if (detail.version != null) return 'parsed'
  }
  // Timed out — leave whatever last detail we have in place and surface
  // the match as stalled.
  return 'stalled'
}

export { HttpError }
