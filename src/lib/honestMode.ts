// Honest mode — opt-in roast voice. Roasts decisions, never people.
//
// Architecture:
//   - Each analysis produces serious-mode prose AND a `roastFacts` map.
//   - When honest mode is on, ReportCard calls `generateRoast(result,
//     accountId)`.
//   - `generateRoast` filters templates by their `condition`, picks one
//     deterministically (seeded with accountId + cardId so refreshing the
//     page produces the same line), substitutes placeholders, validates
//     against the banned-token list, and returns the final string.
//   - If any step fails (no eligible template, validation rejection,
//     missing facts), it returns null and the card falls back to
//     serious-mode prose.
//
// Safety rails:
//   - `validateRoast(text)` rejects banned-phrase output (substring match).
//   - `templateHasPlaceholder(template)` rejects templates that don't
//     bind to any analysis-computed stat — a roast that doesn't cite a
//     measured number tends to drift into hallucinated advice.
//   - At module load, `validateAllTemplates()` runs once and warns about
//     any template missing a placeholder. Such templates are also
//     filtered at runtime so they can't be selected.

import type { AnalysisId, AnalysisResult, HonestLanguage } from '../types'
import { ROAST_TEMPLATES, type RoastTemplate } from './roastTemplates'

/**
 * Banned tokens. Case-insensitive substring match. Templates that produce
 * any of these are rejected and the card falls back to serious mode.
 *
 * Cover both English and Taglish forms (the validator runs against
 * generated output regardless of source language) — slurs and worth
 * attacks shouldn't slip through even if the Taglish file is wired in
 * later for paid-tier rollout.
 */
export const BANNED_ROAST_TOKENS: string[] = [
  // Quitting / self-harm pressure
  'uninstall',
  'quit dota',
  'quit playing',
  'stop playing',
  'give up',
  'kill yourself',
  'kys',
  'k.y.s',
  'delete yourself',
  'mag-uninstall',
  'tigil mo',
  'tumigil ka',
  'huminto ka',
  // Worth-as-a-person attacks
  'no talent',
  'no skill',
  'walang talent',
  'walang skill',
  'trash',
  'garbage',
  'hopeless',
  'basura',
  // Intelligence attacks
  'stupid',
  'dumb',
  'brainless',
  'smooth brain',
  'low iq',
  'tanga',
  'bobo',
  'gago',
  'utak',
  // Slurs (small starter list — extend as needed)
  'retard',
  'retarded',
  'autistic',
  'fag',
  'bakla',
]

/**
 * Returns true if the text is safe (no banned tokens). Case-insensitive
 * substring match; intentionally cheap.
 */
export function validateRoast(text: string): boolean {
  const lower = text.toLowerCase()
  for (const tok of BANNED_ROAST_TOKENS) {
    if (lower.includes(tok)) return false
  }
  return true
}

/**
 * Every roast template must reference at least one stat from the
 * analysis layer (e.g. `{deaths_per_game}`). A template without any
 * placeholder is almost always asserting a behavior we don't actually
 * measure — that erodes trust when users notice. Enforced both at
 * module load and at runtime selection.
 */
export function templateHasPlaceholder(template: RoastTemplate): boolean {
  return /\{\w+\}/.test(template.english)
}

/**
 * One-shot scan at module load. Logs an error for each template missing
 * a placeholder so issues surface in dev console immediately.
 */
function validateAllTemplates(): void {
  for (const [cardId, templates] of Object.entries(ROAST_TEMPLATES)) {
    if (!templates) continue
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]
      if (!templateHasPlaceholder(t)) {
        // eslint-disable-next-line no-console
        console.error(
          `[honest-mode] Template ${cardId}#${i} missing {stat} placeholder — will be skipped at runtime: "${t.english}"`
        )
      }
    }
  }
}
validateAllTemplates()

/**
 * FNV-1a 32-bit hash. Used to derive a deterministic seed from
 * (accountId, cardId) so the same input produces the same roast — refresh
 * doesn't change which template fires.
 */
function fnv1a(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Pick one template deterministically from the eligible list. Seed is the
 * concatenation of accountId and cardId so two different cards on the
 * same account land on different templates.
 */
function pickTemplate<T>(eligible: T[], seed: string): T | null {
  if (eligible.length === 0) return null
  const idx = fnv1a(seed) % eligible.length
  return eligible[idx]
}

/**
 * Substitute `{key}` placeholders with values from `facts`. Keys missing
 * from `facts` cause the function to return null — caller falls back to
 * serious prose rather than render `{key}` literally.
 */
function fillTemplate(
  template: string,
  facts: Record<string, string | number>
): string | null {
  let missing = false
  const filled = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = facts[key]
    if (v == null) {
      missing = true
      return ''
    }
    return String(v)
  })
  return missing ? null : filled
}

/**
 * Generate the roast prose for one card. Returns null if no eligible
 * template exists, facts are missing, or the output fails validation.
 * Caller should fall back to serious-mode prose in any of those cases.
 *
 * Language is passed through for forward-compatibility with the paid-tier
 * Taglish rollout; the launch build only ships English templates so the
 * argument is currently unused inside this function (kept on the
 * signature so the call sites don't need updating later).
 */
export function generateRoast(
  result: AnalysisResult,
  _language: HonestLanguage,
  accountId: number,
  factsOverride?: Record<string, string | number>
): string | null {
  const templates = ROAST_TEMPLATES[result.id as AnalysisId]
  if (!templates || templates.length === 0) return null

  const facts = factsOverride ?? result.roastFacts
  if (!facts) return null

  const eligible = templates.filter(
    (t) => templateHasPlaceholder(t) && safeCondition(t, result, facts)
  )
  const seed = `${accountId}-${result.id}`
  const tpl = pickTemplate(eligible, seed)
  if (!tpl) return null

  const filled = fillTemplate(tpl.english, facts)
  if (!filled) return null

  if (!validateRoast(filled)) {
    // eslint-disable-next-line no-console
    console.warn('[honest-mode] template rejected by validator; falling back', {
      cardId: result.id,
      raw: tpl.english,
    })
    return null
  }
  return filled
}

function safeCondition(
  tpl: RoastTemplate,
  result: AnalysisResult,
  facts: Record<string, string | number>
): boolean {
  try {
    return tpl.condition(result, facts)
  } catch {
    return false
  }
}
