import { useEffect, useRef, useState } from 'react'

interface HonestModeToggleProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

/**
 * Small fire-icon button that opens a panel where the user can opt into
 * roast voice. Off by default; state lives in component memory only (no
 * localStorage, per the embed-safety rule).
 *
 * Launch ships English only. Taglish templates exist in the repo
 * (`lib/honest-mode/taglish-templates.ts`) but are gated behind paid tier
 * — surfaced here as a "coming soon" teaser to preview the feature without
 * gating on region or detection.
 *
 * The icon is intentionally subtle — the spec asks us to NOT auto-suggest
 * enabling it, so it's discoverable but not prompting.
 */
export function HonestModeToggle({ enabled, onToggle }: HonestModeToggleProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Close the panel on outside click.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-base px-2 py-1 rounded border transition ${
          enabled
            ? 'border-amber-700 bg-amber-900/30 text-amber-300'
            : 'border-line bg-bg-raised text-ink-muted hover:text-ink'
        }`}
        aria-label="Honest mode settings"
        aria-expanded={open}
        title="Honest mode"
      >
        🔥
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-line bg-bg-raised shadow-lg p-3 z-10 text-sm">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-ink">Honest mode: roasts based on your data</span>
              <span className="block text-xs text-ink-dim mt-1">
                Same analysis, different voice. Roasts your decisions, never you. Off by default.
              </span>
            </span>
          </label>
          <div className="mt-3 pt-3 border-t border-line text-xs text-ink-dim">
            Taglish coming soon to paid tier <span aria-label="Philippines flag">🇵🇭</span>
          </div>
        </div>
      )}
    </div>
  )
}
