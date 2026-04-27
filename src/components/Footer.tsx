import { useState } from 'react'
import { ApertureSigil } from './ApertureSigil'
import { validateLicenseKey } from '../lib/license'

interface FooterProps {
  isPaid: boolean
  onUnlock: (key: string) => void
  onHome?: () => void
}

export function Footer({ isPaid, onUnlock, onHome }: FooterProps) {
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
    <>
      <section className="dwr-cta">
        <div>
          <h3 className="dwr-cta-title">
            Unlock the 100-match window + per-hero deep dive
          </h3>
          <p className="dwr-cta-body">
            The free report runs on your last 50 matches — enough sample for the eight analyses to
            mean something. A license key widens the window to 100 matches and unlocks per-hero
            drilldowns (item build vs. winning builds, fight participation by hero, losing patterns).
            Pay once, no subscription.
          </p>
          {isPaid ? (
            <p className="dwr-cta-active">
              License active. 100-match window + deep dive unlocked.
            </p>
          ) : (
            <form onSubmit={submit} className="dwr-form" style={{ marginTop: 18 }}>
              <div className="dwr-input-wrap">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="dwr-input"
                  spellCheck={false}
                  autoComplete="off"
                  style={{ paddingLeft: 18 }}
                />
              </div>
              <button type="submit" className="dwr-btn">Unlock</button>
            </form>
          )}
          {err && <p className="dwr-error">{err}</p>}
          <p
            className="dwr-cta-meta"
            style={{ marginTop: 16, textAlign: 'left' }}
          >
            License keys are sold via Gumroad (coming soon). Validation is local — no data leaves
            your browser.
          </p>
        </div>

        <div className="dwr-cta-meta">
          <p>
            Match data from the{' '}
            <a href="https://docs.opendota.com/" target="_blank" rel="noreferrer">
              OpenDota API
            </a>
            . Not affiliated with Valve.
          </p>
          <p style={{ marginTop: 8 }}>Static site, no accounts, no tracking.</p>
        </div>
      </section>

      <footer className="dwr-footer">
        <button
          type="button"
          onClick={onHome}
          className="dwr-home-link"
          aria-label="Back to homepage"
        >
          <ApertureSigil size={28} mono />
          <span className="dwr-wm sm"><span>DWR</span></span>
        </button>
        <div className="links">
          <a href="https://docs.opendota.com/" target="_blank" rel="noreferrer">OpenDota</a>
        </div>
      </footer>
    </>
  )
}
