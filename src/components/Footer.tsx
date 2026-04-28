import { ApertureSigil } from './ApertureSigil'
import { APP_VERSION } from '../lib/version'

interface FooterProps {
  onHome?: () => void
  onChangelog?: () => void
  // Show the trust block (OpenDota credit, "no accounts, no tracking")
  // on the landing/report flow only — content pages like /changelog
  // don't need it.
  showCta?: boolean
}

const GITHUB_REPO_URL = 'https://github.com/jmbt25/dota-weakness-report'
const SUPPORT_URL = 'https://github.com/sponsors/jmbt25'

export function Footer({ onHome, onChangelog, showCta = true }: FooterProps) {
  return (
    <>
      {showCta && (
        <section className="dwr-cta">
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
      )}

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
          <button
            type="button"
            className="dwr-version"
            onClick={onChangelog}
            aria-label={`Version ${APP_VERSION} — view changelog`}
          >
            v{APP_VERSION}
          </button>
          <span className="sep" aria-hidden="true">·</span>
          <button type="button" className="dwr-link-btn" onClick={onChangelog}>
            CHANGELOG
          </button>
          <span className="sep" aria-hidden="true">·</span>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          <span className="sep" aria-hidden="true">·</span>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer">Support</a>
          <span className="sep" aria-hidden="true">·</span>
          <a href="https://docs.opendota.com/" target="_blank" rel="noreferrer">OpenDota</a>
        </div>
      </footer>

      <p className="dwr-attribution">
        Some insights inspired by the public Dota learning community,
        including Resolut1on, BSJ, and others. Thank you.
      </p>
    </>
  )
}
