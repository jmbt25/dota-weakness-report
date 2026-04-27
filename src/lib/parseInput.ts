// Parse a user-pasted Steam ID or profile URL into a 32-bit account ID.
//
// Accepted forms:
//   - bare 32-bit account ID:  "123456789"
//   - 64-bit SteamID:          "76561198083722517"
//   - OpenDota:                "https://www.opendota.com/players/123456789"
//   - Dotabuff:                "https://www.dotabuff.com/players/123456789"
//   - Stratz:                  "https://stratz.com/players/123456789"
//   - Steam community profile: "https://steamcommunity.com/profiles/7656119...."
//
// Vanity steam URLs (steamcommunity.com/id/<custom>) cannot be resolved
// without an API key, so we reject them with a friendly message.

const STEAM_64_OFFSET = 76561197960265728n

export interface ParseSuccess {
  ok: true
  accountId: number
}
export interface ParseFailure {
  ok: false
  error: string
}
export type ParseResult = ParseSuccess | ParseFailure

export function parseAccountInput(raw: string): ParseResult {
  const input = raw.trim()
  if (!input) return { ok: false, error: 'Enter a Steam ID or profile URL.' }

  // Bare numeric: could be 32-bit or 64-bit.
  if (/^\d+$/.test(input)) return fromNumeric(input)

  // URL forms.
  let url: URL
  try {
    url = new URL(input.startsWith('http') ? input : `https://${input}`)
  } catch {
    return { ok: false, error: 'That doesn’t look like a Steam ID or profile URL.' }
  }

  const host = url.hostname.replace(/^www\./, '')
  const segments = url.pathname.split('/').filter(Boolean)

  if (host === 'steamcommunity.com') {
    // /profiles/<steam64> or /id/<vanity>
    if (segments[0] === 'profiles' && segments[1]) return fromNumeric(segments[1])
    if (segments[0] === 'id') {
      return {
        ok: false,
        error:
          'Custom Steam URLs (steamcommunity.com/id/<name>) can’t be resolved without an API key. Paste your numeric Steam ID or your OpenDota/Dotabuff URL instead.',
      }
    }
    return { ok: false, error: 'Couldn’t find an ID in that Steam URL.' }
  }

  // Most Dota stat sites put the account_id at /players/<id>.
  if (
    host === 'opendota.com' ||
    host === 'dotabuff.com' ||
    host === 'stratz.com'
  ) {
    const idx = segments.indexOf('players')
    if (idx >= 0 && segments[idx + 1]) return fromNumeric(segments[idx + 1])
    return { ok: false, error: `Couldn’t find an account ID in that ${host} URL.` }
  }

  return { ok: false, error: 'Unrecognized URL. Try OpenDota, Dotabuff, Stratz, or a Steam profile URL.' }
}

function fromNumeric(s: string): ParseResult {
  if (!/^\d+$/.test(s)) return { ok: false, error: 'Steam IDs are numeric.' }
  // 17-digit IDs are 64-bit; convert by subtracting the SteamID offset.
  if (s.length >= 17) {
    try {
      const big = BigInt(s)
      if (big <= STEAM_64_OFFSET) return { ok: false, error: 'That Steam ID looks invalid.' }
      const id = Number(big - STEAM_64_OFFSET)
      if (!Number.isSafeInteger(id) || id <= 0) {
        return { ok: false, error: 'That Steam ID looks invalid.' }
      }
      return { ok: true, accountId: id }
    } catch {
      return { ok: false, error: 'Couldn’t parse that Steam ID.' }
    }
  }
  // Otherwise treat as a 32-bit account ID directly.
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n <= 0) return { ok: false, error: 'Account ID out of range.' }
  return { ok: true, accountId: n }
}
