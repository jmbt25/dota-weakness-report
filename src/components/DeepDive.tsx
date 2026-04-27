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
    <section className="max-w-6xl mx-auto px-6 pb-16 w-full">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Hero deep dive</h2>
          <p className="text-sm text-ink-muted mt-1">
            Drill into a specific hero — item build vs. winning builds, fight participation, losing patterns.
          </p>
        </div>
        <span className="pill-good">Paid</span>
      </div>

      <form onSubmit={submit} className="card flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <label className="text-sm text-ink-muted sm:w-auto flex-shrink-0">Hero</label>
        <select
          className="input-base flex-1"
          value={selected ?? ''}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {heroOptions.map((h) => (
            <option key={h.heroId} value={h.heroId}>
              {h.name} ({h.games} game{h.games === 1 ? '' : 's'})
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={selected == null}>
          Analyze
        </button>
      </form>

      {submittedHero != null && (
        <article className="card mt-5">
          <header className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold">{getHeroName(submittedHero)}</h3>
            <span className="pill-muted">Coming soon</span>
          </header>
          <p className="mt-4 text-sm text-ink leading-relaxed">
            Hero-specific drilldowns are next on the roadmap: median item build compared against your
            winning builds on this hero, fight participation timing, and the most common lane/timing
            patterns in your losses. The data plumbing is in place — the analysis layer ships next.
          </p>
          <p className="mt-3 text-xs text-ink-dim italic">Paid feature stub — your license unlocks this when it lands.</p>
        </article>
      )}
    </section>
  )
}
