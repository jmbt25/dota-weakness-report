import { useState, type FormEvent } from 'react'

interface HeroProps {
  onAnalyze: (raw: string) => void
  isLoading: boolean
  error?: string | null
}

export function Hero({ onAnalyze, isLoading, error }: HeroProps) {
  const [value, setValue] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!isLoading) onAnalyze(value)
  }

  return (
    <header className="w-full max-w-3xl mx-auto px-6 pt-16 pb-10 text-center">
      <div className="inline-flex items-center gap-2 mb-4 text-xs uppercase tracking-widest text-ink-muted">
        <span className="w-2 h-2 rounded-full bg-accent" />
        Dota Weakness Report
      </div>
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
        Find out exactly why your MMR isn’t moving.
      </h1>
      <p className="mt-4 text-ink-muted max-w-xl mx-auto">
        Paste your Steam ID or Dota profile URL. We pull your last 20 matches from OpenDota and grade
        eight things — death timing, farm, item builds, situational items, lane, hero pool, stack synergy,
        and tilt. Free, no signup.
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="123456789, dotabuff.com/players/…, or steamcommunity.com/profiles/…"
          className="input-base flex-1"
          autoComplete="off"
          spellCheck={false}
          disabled={isLoading}
        />
        <button type="submit" className="btn-primary" disabled={isLoading || value.trim().length === 0}>
          {isLoading ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <p className="mt-3 text-xs text-ink-dim">
        Free for 20-match reports. Unlock the 100-match window and per-hero deep dives with a license key below.
      </p>
    </header>
  )
}
