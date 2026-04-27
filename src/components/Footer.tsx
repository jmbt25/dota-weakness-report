import { useState } from 'react'
import { validateLicenseKey } from '../lib/license'

interface FooterProps {
  isPaid: boolean
  onUnlock: (key: string) => void
}

export function Footer({ isPaid, onUnlock }: FooterProps) {
  const [key, setKey] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (validateLicenseKey(key)) {
      setErr(null)
      onUnlock(key.trim())
    } else {
      setErr('That key doesn’t look right. License keys are 16 characters.')
    }
  }

  return (
    <footer className="border-t border-line mt-8">
      <div className="max-w-6xl mx-auto px-6 py-10 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-lg font-semibold">Unlock the 100-match window + per-hero deep dive</h3>
          <p className="text-sm text-ink-muted mt-2">
            The free report runs on your last 20 matches — enough sample for the eight analyses to mean
            something. A license key widens the window to 100 matches and unlocks per-hero drilldowns
            (item build vs. winning builds, fight participation by hero, losing patterns). Pay once,
            no subscription.
          </p>
          {isPaid ? (
            <p className="mt-4 text-sm text-emerald-400">License active. 100-match window + deep dive unlocked.</p>
          ) : (
            <form onSubmit={submit} className="mt-4 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="input-base flex-1"
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" className="btn-primary">Unlock</button>
            </form>
          )}
          {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
          <p className="mt-3 text-xs text-ink-dim">
            License keys are sold via Gumroad (coming soon). Validation is local — no data leaves your browser.
          </p>
        </div>
        <div className="text-sm text-ink-muted md:text-right">
          <p>
            Match data from the{' '}
            <a className="underline hover:text-ink" href="https://docs.opendota.com/" target="_blank" rel="noreferrer">
              OpenDota API
            </a>
            . Not affiliated with Valve.
          </p>
          <p className="mt-2">Static site, no accounts, no tracking.</p>
        </div>
      </div>
    </footer>
  )
}
