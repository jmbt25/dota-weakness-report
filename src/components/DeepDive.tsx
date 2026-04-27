import { useMemo, useState } from 'react'
import type { ODMatchSummary } from '../types'
import { getHeroName } from '../lib/heroes'

interface DeepDiveProps {
  matches: ODMatchSummary[]
}

/**
 * Per-hero deep dive — paid-only stub. Builds the dropdown from the user's
 * actual played heroes (sorted by games played) and runs a placeholder
 * "analysis" that reports the feature is coming. The wiring stays so the
 * real analysis logic can drop in later without UI churn.
 */
export function DeepDive({ matches }: DeepDiveProps) {
  const heroOptions = useMemo(() => {
    const counts = new Map<number, number>()
    for (const m of matches) counts.set(m.hero_id, (counts.get(m.hero_id) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([heroId, games]) => ({ heroId, games, name: getHeroName(heroId) }))
  }, [matches])

  const [selected, setSelected] = useState<number | null>(heroOptions[0]?.heroId ?? null)
  const [submittedHero, setSubmittedHero] = useState<number | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (selected != null) setSubmittedHero(selected)
  }

  if (heroOptions.length === 0) return null

  return (
    <section className="dwr-report-head" style={{ paddingTop: 8, paddingBottom: 48 }}>
      <div className="dwr-section-head" style={{ marginTop: 8 }}>
        <h2 className="dwr-section-title" style={{ fontSize: 28 }}>
          Hero <span className="red">deep</span> dive
          <span className="honest-badge" style={{ background: 'rgba(74,222,128,0.08)', color: 'var(--sev-strong)', borderColor: 'rgba(74,222,128,0.4)', boxShadow: 'none' }}>
            PAID
          </span>
        </h2>
      </div>
      <p className="dwr-section-sub">
        Drill into a specific hero — item build vs. winning builds, fight participation, losing patterns.
      </p>

      <form
        onSubmit={submit}
        className="dwr-form"
        style={{ marginTop: 18, maxWidth: 'none', alignItems: 'center' }}
      >
        <label
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
            color: 'var(--ink-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Hero
        </label>
        <div className="dwr-input-wrap">
          <select
            className="dwr-input"
            style={{ paddingLeft: 18 }}
            value={selected ?? ''}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {heroOptions.map((h) => (
              <option key={h.heroId} value={h.heroId}>
                {h.name} ({h.games} game{h.games === 1 ? '' : 's'})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="dwr-btn" disabled={selected == null}>
          Analyze
        </button>
      </form>

      {submittedHero != null && (
        <article className="card" style={{ marginTop: 20 }}>
          <div className="card-head">
            <h3 className="card-title">{getHeroName(submittedHero)}</h3>
            <span className="pill unmeasured">Coming soon</span>
          </div>
          <p className="prose">
            Hero-specific drilldowns are next on the roadmap: median item build compared against
            your winning builds on this hero, fight participation timing, and the most common
            lane/timing patterns in your losses. The data plumbing is in place — the analysis layer
            ships next.
          </p>
          <div className="footnote">Paid feature stub — your license unlocks this when it lands.</div>
        </article>
      )}
    </section>
  )
}
