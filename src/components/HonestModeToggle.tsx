interface HonestModeToggleProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

/**
 * Fire-icon button next to the Free/Paid badge in the report header.
 * Click toggles honest mode in-place — the prototype intentionally drops
 * the dropdown panel because the cosmos + glow tells the user the mode
 * has changed.
 *
 * Off by default; state lives in component memory only (no localStorage,
 * per the embed-safety rule).
 */
export function HonestModeToggle({ enabled, onToggle }: HonestModeToggleProps) {
  return (
    <button
      type="button"
      className={`dwr-fire-btn ${enabled ? 'on' : ''}`}
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? 'Disable honest mode' : 'Enable honest mode'}
      title={enabled ? 'Disable honest mode' : 'Enable honest mode'}
    >
      🔥
    </button>
  )
}
