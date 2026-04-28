import { useMemo, useState } from 'react'
import type { ODMatchSummary, ODPlayerProfile } from '../types'
import {
  BRACKETS,
  META_BRACKET8_ALIASED,
  META_HEROES,
  META_PATCH,
  META_REFRESHED,
  POSITION_LABELS,
  POSITION_LABELS_SHORT,
  bracketFromRankBucket,
  computeBracketMedians,
  heroPortraitUrl,
  tierBreakdownFor,
  tierFor,
  type MetaBracket,
  type MetaHeroEntry,
  type Position,
  type Tier,
} from '../lib/metaData'
import { rankBucketFromTier } from '../lib/baselines'

interface MetaPageProps {
  /** When provided, default to user's bracket and surface the blindspot
   *  section. */
  profile: ODPlayerProfile | null
  matches: ODMatchSummary[] | null
}

type SortMode = 'tier' | 'wr' | 'pick'
type PositionFilter = 'all' | Position

const TIER_RANK: Record<Tier, number> = { S: 0, A: 1, B: 2, C: 3 }
const POSITION_OPTIONS: { id: PositionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 1, label: POSITION_LABELS[1] },
  { id: 2, label: POSITION_LABELS[2] },
  { id: 3, label: POSITION_LABELS[3] },
  { id: 4, label: POSITION_LABELS[4] },
  { id: 5, label: POSITION_LABELS[5] },
]

export function MetaPage({ profile, matches }: MetaPageProps) {
  const userBracket = useMemo<MetaBracket | null>(() => {
    if (!profile?.rank_tier) return null
    return bracketFromRankBucket(rankBucketFromTier(profile.rank_tier))
  }, [profile])

  const [bracket, setBracket] = useState<MetaBracket>(userBracket ?? 3)
  const [sort, setSort] = useState<SortMode>('tier')
  const [position, setPosition] = useState<PositionFilter>('all')

  const heroesPlayed = useMemo<Set<number>>(() => {
    if (!matches) return new Set()
    const s = new Set<number>()
    for (const m of matches) s.add(m.hero_id)
    return s
  }, [matches])

  const sorted = useMemo(() => {
    const list = META_HEROES.filter(
      (h) => position === 'all' || h.positions.includes(position)
    ).map((h) => ({ hero: h, tier: tierFor(h, bracket) }))
    list.sort((a, b) => {
      if (sort === 'wr') return b.hero.wr[bracket] - a.hero.wr[bracket]
      if (sort === 'pick') return b.hero.pick[bracket] - a.hero.pick[bracket]
      // tier
      const t = TIER_RANK[a.tier] - TIER_RANK[b.tier]
      if (t !== 0) return t
      return b.hero.wr[bracket] - a.hero.wr[bracket]
    })
    return list
  }, [bracket, sort, position])

  const blindspot = useMemo<MetaHeroEntry[]>(() => {
    if (!matches) return []
    const { wr: medWr } = computeBracketMedians(bracket)
    return META_HEROES.filter(
      (h) =>
        !heroesPlayed.has(h.id) &&
        h.wr[bracket] >= medWr + 0.01 &&
        (position === 'all' || h.positions.includes(position))
    )
      .sort((a, b) => b.wr[bracket] - a.wr[bracket])
      .slice(0, 5)
  }, [bracket, heroesPlayed, matches, position])

  const hasAnalyzed = matches != null && matches.length > 0
  const bracketLabel = BRACKETS.find((b) => b.id === bracket)?.label ?? ''

  return (
    <section className="dwr-meta">
      <div className="dwr-meta-head">
        <div className="dwr-meta-eyebrow">Meta · public bracket</div>
        <h1 className="dwr-meta-title">Meta heroes</h1>
        <div className="dwr-meta-meta">
          Patch {META_PATCH} · refreshed {META_REFRESHED}
        </div>
        {META_BRACKET8_ALIASED && (bracket === 7 || bracket === 8) && (
          <div className="dwr-meta-meta dwr-meta-note">
            OpenDota's public dataset combines Divine and Immortal — the
            two bracket views show the same numbers.
          </div>
        )}
      </div>

      <div className="dwr-meta-bracket-row" role="tablist" aria-label="Bracket">
        <span className="label">Bracket:</span>
        {BRACKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={b.id === bracket}
            className={`dwr-meta-bracket-btn${b.id === bracket ? ' active' : ''}`}
            onClick={() => setBracket(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="dwr-meta-bracket-row" role="tablist" aria-label="Position">
        <span className="label">Position:</span>
        {POSITION_OPTIONS.map((opt) => (
          <button
            key={String(opt.id)}
            type="button"
            role="tab"
            aria-selected={opt.id === position}
            className={`dwr-meta-bracket-btn${opt.id === position ? ' active' : ''}`}
            onClick={() => setPosition(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {hasAnalyzed && (
        <Blindspot
          blindspot={blindspot}
          bracketLabel={bracketLabel}
          bracket={bracket}
          sampleSize={matches!.length}
          position={position}
        />
      )}

      <div className="dwr-meta-controls">
        <div className="dwr-meta-sort">
          <span className="label">Sort:</span>
          {([
            { id: 'tier', label: 'Tier' },
            { id: 'wr', label: 'WR' },
            { id: 'pick', label: 'Pick rate' },
          ] as { id: SortMode; label: string }[]).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`dwr-meta-sort-btn${sort === opt.id ? ' active' : ''}`}
              onClick={() => setSort(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="dwr-meta-counts">
          {sorted.length} hero{sorted.length === 1 ? '' : 'es'} · {bracketLabel}
          {position !== 'all' && ` · ${POSITION_LABELS[position]}`}
        </div>
      </div>

      <div className="dwr-meta-grid">
        {sorted.map(({ hero, tier }) => (
          <HeroCard
            key={hero.id}
            hero={hero}
            tier={tier}
            bracket={bracket}
            highlight={false}
          />
        ))}
      </div>
    </section>
  )
}

function Blindspot({
  blindspot,
  bracketLabel,
  bracket,
  sampleSize,
  position,
}: {
  blindspot: MetaHeroEntry[]
  bracketLabel: string
  bracket: MetaBracket
  sampleSize: number
  position: PositionFilter
}) {
  const posSuffix = position === 'all' ? '' : ` · ${POSITION_LABELS[position]}`
  return (
    <div className="dwr-meta-blindspot">
      <h2 className="dwr-meta-blindspot-head">
        Heroes you've never played that are winning at your bracket{posSuffix}
      </h2>
      {blindspot.length === 0 ? (
        <p className="dwr-meta-blindspot-empty">
          You've played all the current meta heroes at your bracket
          {position === 'all' ? '' : ` for ${POSITION_LABELS[position]}`}.
          Now the work is making sure you're playing them well.
        </p>
      ) : (
        <>
          <p className="dwr-meta-blindspot-sub">
            These heroes are above the {bracketLabel} median win rate
            {position === 'all' ? '' : ` and play ${POSITION_LABELS[position]}`}.
            You haven't played any of them in your last {sampleSize} games.
          </p>
          <div className="dwr-meta-grid">
            {blindspot.map((hero) => (
              <HeroCard
                key={hero.id}
                hero={hero}
                tier={tierFor(hero, bracket)}
                bracket={bracket}
                highlight
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function HeroCard({
  hero,
  tier,
  bracket,
  highlight,
}: {
  hero: MetaHeroEntry
  tier: Tier
  bracket: MetaBracket
  highlight: boolean
}) {
  const wrPct = (hero.wr[bracket] * 100).toFixed(1)
  const pickPct = (hero.pick[bracket] * 100).toFixed(1)
  const { wr: medWr } = computeBracketMedians(bracket)
  const wrDir = hero.wr[bracket] > medWr + 0.005 ? 'up' : hero.wr[bracket] < medWr - 0.005 ? 'down' : ''
  const portrait = heroPortraitUrl(hero.id, hero.name)

  // Momentum cue — only render an arrow when WR moved at least ±0.5pp
  // week-over-week. Below that the data is just measurement noise.
  const breakdown = tierBreakdownFor(hero, bracket)
  const momentumCue =
    breakdown.wrDeltaPp >= 0.5
      ? { dir: 'up' as const, text: `▲ ${breakdown.wrDeltaPp.toFixed(1)}pp` }
      : breakdown.wrDeltaPp <= -0.5
      ? { dir: 'down' as const, text: `▼ ${Math.abs(breakdown.wrDeltaPp).toFixed(1)}pp` }
      : null

  // Spell out the tier components so users can see why a hero is S/A/B/C
  // instead of having to trust an opaque label. Title attribute keeps it
  // out of the way for casual viewers but available on hover.
  const tierTooltip =
    `Tier score ${breakdown.score.toFixed(2)} = ` +
    `WR lift ${breakdown.wrLiftPp >= 0 ? '+' : ''}${breakdown.wrLiftPp.toFixed(1)}pp, ` +
    `pick bonus ${breakdown.pickBonus.toFixed(1)}, ` +
    `momentum ${breakdown.momentumBonus >= 0 ? '+' : ''}${breakdown.momentumBonus.toFixed(1)}`

  return (
    <article className={`dwr-meta-card${highlight ? ' highlight' : ''}`}>
      <div className={`dwr-meta-tier t-${tier}`} title={tierTooltip}>{tier}</div>
      <div className="dwr-meta-card-head">
        <img
          src={portrait}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="dwr-meta-card-portrait"
          onError={(e) => {
            const t = e.currentTarget
            t.style.visibility = 'hidden'
          }}
        />
        <div className="dwr-meta-card-name">{hero.name}</div>
      </div>
      <div className="dwr-meta-card-positions" aria-label="Positions">
        {hero.positions.map((p) => (
          <span key={p} className="dwr-meta-pos-pill">
            {POSITION_LABELS_SHORT[p]}
          </span>
        ))}
      </div>
      <div className="dwr-meta-card-stats">
        <div className="dwr-meta-card-stat">
          <div className={`v ${wrDir}`}>
            {wrPct}%
            {momentumCue && (
              <span className={`mom mom-${momentumCue.dir}`} title={`Week-over-week: ${momentumCue.text}`}>
                {momentumCue.text}
              </span>
            )}
          </div>
          <div className="l">Win rate</div>
        </div>
        <div className="dwr-meta-card-stat">
          <div className="v">{pickPct}%</div>
          <div className="l">Pick rate</div>
        </div>
      </div>
    </article>
  )
}
