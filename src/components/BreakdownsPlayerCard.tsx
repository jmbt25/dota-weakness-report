import { useState } from 'react'
import type { ProseFire, PlayerContext } from '../lib/breakdownsProse/cat1b'
import type { UserCompareData } from '../lib/userCompareData'
import { UserCompareStrip } from './UserCompareStrip'

interface BreakdownsPlayerCardProps {
  ctx: PlayerContext
  /** Cat 1A (corpus-backed cross-match) — empty for non-corpus players. */
  cat1aFires: ProseFire[]
  /** Cat 1B (within-match) — runs for every player. */
  cat1bFires: ProseFire[]
  displayName: string
  /** v1.9.0 user-comparison: snapshot from localStorage. Null when no
   *  /report has been run; the strip layer no-ops in that case. */
  userCompareData: UserCompareData | null
  honestMode: boolean
}

/**
 * One card per player on /breakdowns/{match_id}. Header carries position +
 * hero + display name. Body lists Cat 1B prose lines (zero or more).
 * Show-more toggle reveals the per-player stats table.
 *
 * Display name resolution happens upstream in the grid (resolveDisplayName
 * from src/lib/breakdownsProse/displayName.ts). This component never
 * reaches into player.personaname directly — the structural guarantee of
 * the "no personaname for display" rule.
 */
export function BreakdownsPlayerCard({
  ctx,
  cat1aFires,
  cat1bFires,
  displayName,
  userCompareData,
  honestMode,
}: BreakdownsPlayerCardProps) {
  const [open, setOpen] = useState(false)
  const p = ctx.player
  const kills = p.kills ?? 0
  const deaths = p.deaths ?? 0
  const assists = p.assists ?? 0
  const kda = ((kills + assists) / Math.max(deaths, 1)).toFixed(1)
  const gpm = p.gold_per_min ?? 0
  const xpm = p.xp_per_min ?? 0
  const lh = p.last_hits ?? 0
  const dn = p.denies ?? 0
  const laneEff = p.lane_efficiency_pct
  const tfPart = p.teamfight_participation
  const obs = Array.isArray(p.obs_log) ? p.obs_log.length : (p.obs_placed ?? 0)
  const sen = Array.isArray(p.sen_log) ? p.sen_log.length : (p.sen_placed ?? 0)
  const heroDmg = p.hero_damage
  const buybacks = p.buyback_count
  const stuns = p.stuns

  return (
    <article className={`card dwr-breakdowns-player ${ctx.isRadiant ? 'radiant' : 'dire'}`}>
      <header className="dwr-breakdowns-player-head">
        <span className="dwr-breakdowns-player-pos">POS {ctx.position}</span>
        <div className="dwr-breakdowns-player-id">
          <span className="dwr-breakdowns-player-hero">{ctx.heroName}</span>
          <span className="dwr-breakdowns-player-name">{displayName}</span>
        </div>
      </header>

      {(cat1aFires.length + cat1bFires.length) > 0 ? (
        <div className="dwr-breakdowns-player-body">
          {cat1aFires.map((f) => (
            <p key={`a-${f.templateId}`} className="dwr-breakdowns-player-prose cat1a">
              {f.text}
            </p>
          ))}
          {cat1bFires.map((f) => (
            <div key={`b-${f.templateId}`} className="dwr-breakdowns-player-line">
              <p className="dwr-breakdowns-player-prose">{f.text}</p>
              <UserCompareStrip
                fire={f}
                userCompareData={userCompareData}
                honestMode={honestMode}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="dwr-breakdowns-player-body empty">
          <p className="dwr-breakdowns-player-prose dim">No observations fired for this player.</p>
        </div>
      )}

      <button
        type="button"
        className="dwr-breakdowns-player-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? '▴ Hide stats' : '▾ Show stats'}
      </button>

      {open && (
        <dl className="dwr-breakdowns-player-stats">
          <Row label="K / D / A" value={`${kills}/${deaths}/${assists}`} />
          <Row label="KDA" value={kda} />
          <Row label="GPM" value={String(gpm)} />
          <Row label="XPM" value={String(xpm)} />
          <Row label="LH / DN" value={`${lh} / ${dn}`} />
          {typeof laneEff === 'number' && <Row label="Lane efficiency" value={`${laneEff}%`} />}
          {typeof tfPart === 'number' && <Row label="Teamfight" value={`${Math.round(tfPart * 100)}%`} />}
          {typeof heroDmg === 'number' && <Row label="Hero damage" value={heroDmg.toLocaleString()} />}
          {typeof stuns === 'number' && <Row label="Stuns (sec)" value={stuns.toFixed(1)} />}
          {typeof buybacks === 'number' && <Row label="Buybacks" value={String(buybacks)} />}
          <Row label="Obs / Sen placed" value={`${obs} / ${sen}`} />
          {typeof p.net_worth === 'number' && <Row label="Net worth" value={p.net_worth.toLocaleString()} />}
        </dl>
      )}
    </article>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="dwr-breakdowns-player-stat-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
