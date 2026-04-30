// Banned-token validator for /breakdowns prose.
//
// Tone register: observation, not editorial. Sharper than dry analysis,
// softer than user-facing roast. The Cat 1B + 1A + 2 templates all pass
// through `validateBreakdownsProse`; failures are dropped silently and
// the player card just renders without that line. At module load we run
// every Cat 1B template against synthetic data and assert validation
// passes — catches drift the moment a contributor adds a banned word.
//
// This list extends — does NOT replace — the honest-mode banned list.
// /report's honest mode is a willing-participant roast (the user opted
// in); /breakdowns comments on pros (not willing participants), so the
// register is stricter on judgment language and direct address.

/**
 * Substring match, case-insensitive. Order doesn't matter.
 *
 * Categories:
 *   1. Prescriptive — "should have", "needed to" — implies the player
 *      made a wrong choice. We describe what happened, not what should.
 *   2. Counterfactual editorial — "could have", "would have" — same
 *      problem with a softer voice.
 *   3. Judgment adjectives — "useless", "embarrassing" — quality
 *      verdicts. Numbers describe quality; words editorialize it.
 *   4. Superiority markers — "obviously", "clearly" — talks down to
 *      the reader.
 *   5. Direct second-person address — "you should", "your fault" —
 *      the player isn't reading the report; addressing them is theater.
 *
 * Keep entries lowercase. The validator lowercases the candidate text
 * before substring matching.
 */
export const BREAKDOWNS_BANNED_TOKENS: string[] = [
  // Prescriptive
  'should have',
  'should’ve',
  "should've",
  'needed to',
  'had to',
  'was supposed to',
  'must have',
  'must’ve',
  "must've",
  // Counterfactual editorial
  'could have',
  'could’ve',
  "could've",
  'would have',
  'would’ve',
  "would've",
  'if only',
  // Judgment adjectives
  'useless',
  'embarrassing',
  'amateur hour',
  'amateur-hour',
  'terrible play',
  'awful play',
  'bad play',
  'dogshit',
  'griefing',
  'griefer',
  'inting',
  'feeder',
  // Superiority markers
  'obviously',
  'clearly',
  'of course',
  // Direct second-person address aimed at the player
  'you should',
  'you needed',
  'you had to',
  'your fault',
  'your bad',
]

/**
 * Returns true if the text is safe (no banned tokens).
 */
export function validateBreakdownsProse(text: string): boolean {
  const lower = text.toLowerCase()
  for (const tok of BREAKDOWNS_BANNED_TOKENS) {
    if (lower.includes(tok)) return false
  }
  return true
}
