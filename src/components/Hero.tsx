import { useState, type FormEvent, type ReactNode } from 'react'
import { ApertureSigil, MedallionIcons, SkullSm, SteamIcon } from './ApertureSigil'

interface HeroProps {
  onAnalyze: (raw: string) => void
  isLoading: boolean
  error?: string | null
  showLanding: boolean
  onHome?: () => void
  loaderSlot?: ReactNode
  /** Suppress Hero's own `<header>` when a parent already renders TopNav. */
  hideHeader?: boolean
}

export function Hero({ onAnalyze, isLoading, error, showLanding, onHome, loaderSlot, hideHeader }: HeroProps) {
  const [value, setValue] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!isLoading) onAnalyze(value)
  }

  if (!showLanding) {
    return (
      <header className="dwr-header left">
        <button
          type="button"
          onClick={onHome}
          className="dwr-home-link"
          aria-label="Back to homepage"
        >
          <ApertureSigil size={40} />
          <span className="dwr-wm sm">
            <span>DOTA</span>
            <span className="red">WEAKNESS</span>
            <span>REPORT</span>
          </span>
        </button>
      </header>
    )
  }

  return (
    <>
      {!hideHeader && (
        <header className="dwr-header">
          <ApertureSigil size={110} />
        </header>
      )}

      <section className="dwr-hero">
        <div className="dwr-wm" style={{ marginBottom: 24 }}>
          <span>DOTA</span>
          <span className="red">WEAKNESS</span>
          <span>REPORT</span>
        </div>
        <h1 className="dwr-h1">
          See what you
          <span className="red">keep doing wrong</span>
        </h1>
        <div className="dwr-divider">
          <span className="line" />
          <span className="diamond" />
          <span className="line" />
        </div>
        <p className="dwr-sub">
          We analyze your last 50 matches and uncover the habits holding you back from climbing.
        </p>

        <form className="dwr-form" onSubmit={submit}>
          <div className="dwr-input-wrap">
            <span className="dwr-input-icon"><SteamIcon /></span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste your Steam ID or Dotabuff URL"
              className="dwr-input"
              autoComplete="off"
              spellCheck={false}
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            className="dwr-btn"
            disabled={isLoading || value.trim().length === 0}
          >
            {isLoading ? 'Analyzing…' : 'Analyze'}
          </button>
        </form>

        <div className="dwr-free">
          <span className="dot" />
          FREE FOR 50-MATCH REPORTS · NO SIGNUP
        </div>

        {error && <p className="dwr-error">{error}</p>}

        {loaderSlot && <div className="dwr-hero-loader">{loaderSlot}</div>}
      </section>

      {loaderSlot ? null : (
      <>
      <section className="dwr-body">
        <div>
          <div className="dwr-cover-title">
            <span className="diamond" />
            Every report covers
            <span className="diamond" />
          </div>
          <div className="medallion-grid">
            {COVERAGE.map(({ name, desc, Icon }) => (
              <div className="medallion" key={name}>
                <div className="med-circle"><Icon /></div>
                <div className="med-name">{name}</div>
                <div className="med-desc">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="example-card">
          <div className="ex-head">
            <div className="ex-icon"><SkullSm /></div>
            <div>
              <h3 className="ex-title">Death Timing</h3>
              <div className="ex-tag">
                Severity: <span className="red">CONCERNING</span>
              </div>
            </div>
          </div>
          <p className="ex-prose" style={{ marginBottom: 8 }}>
            You die most often in the <b>mid game</b>.
          </p>
          <div className="ex-chart">
            {[2, 3, 4, 5, 7, 8, 7, 5, 3, 2].map((h, i) => (
              <div
                key={i}
                className={`ex-bar ${i === 5 ? 'peak' : ''}`}
                style={{ height: `${h * 9}px` }}
              />
            ))}
          </div>
          <div className="ex-axis"><span>0</span><span>15</span><span>30</span><span>45</span></div>
          <div className="ex-key">KEY INSIGHT</div>
          <p className="ex-prose">
            <b>83%</b> of your deaths between 15:00 and 30:00 are avoidable based on positioning &amp; vision.
          </p>
        </div>
      </section>

      <section className="dwr-quote">
        <div className="dwr-divider" style={{ maxWidth: 300, margin: '0 auto 28px' }}>
          <span className="line" />
          <span className="diamond" />
          <span className="line" />
        </div>
        <p>"Knowledge is the first step to not feeding."</p>
      </section>
      </>
      )}
    </>
  )
}

const COVERAGE: { name: string; desc: string; Icon: () => JSX.Element }[] = [
  { name: 'Death Timing',    desc: "See exactly when, where, and why you're dying.", Icon: MedallionIcons.Death },
  { name: 'Farm Efficiency', desc: 'CS patterns, gold flow, and time lost.',         Icon: MedallionIcons.Farm },
  { name: 'Item Builds',     desc: 'Are your items helping — or just coping?',       Icon: MedallionIcons.Item },
  { name: 'Hero Pool',       desc: 'Comfort picks, win rates, and versatility.',     Icon: MedallionIcons.Hero },
  { name: 'Stack Synergy',   desc: 'Partner win-rate deltas and stacked queue.',     Icon: MedallionIcons.Stack },
  { name: 'Vision Patterns', desc: 'Ward placement, lifetime, and map control.',     Icon: MedallionIcons.Vision },
]
