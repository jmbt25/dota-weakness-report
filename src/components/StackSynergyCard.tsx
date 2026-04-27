import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalysisResult, HonestLanguage, Severity, StackSynergyPartner } from '../types'
import { generateRoast } from '../lib/honestMode'

const TOOLTIP_STYLE = {
  background: '#13161d',
  border: '1px solid #222632',
  borderRadius: 8,
  color: '#e6e8ee',
  fontSize: 12,
}

function severityClass(sev: Severity): string {
  if (sev === 'good') return 'pill-good'
  if (sev === 'ok') return 'pill-neutral'
  if (sev === 'unmeasured') return 'pill-muted'
  return 'pill-bad'
}

function severityLabel(sev: Severity): string {
  if (sev === 'good') return 'Healthy'
  if (sev === 'ok') return 'Watch'
  if (sev === 'unmeasured') return 'Unmeasured'
  return 'Concerning'
}

interface StackSynergyCardProps {
  result: AnalysisResult
  honestMode: boolean
  language: HonestLanguage
  accountId: number
}

export function StackSynergyCard({ result, honestMode, language, accountId }: StackSynergyCardProps) {
  const [showNames, setShowNames] = useState(true)
  const data = result.stackSynergy
  const isUnmeasured = result.severity === 'unmeasured'

  const displayPartners: (StackSynergyPartner & { displayName: string })[] = useMemo(() => {
    if (!data) return []
    return data.partners.map((p, i) => ({
      ...p,
      displayName: showNames ? p.personaName : `Friend ${i + 1}`,
    }))
  }, [data, showNames])

  const seriousFinding = useMemo(() => {
    if (showNames || !data) return result.finding
    return anonymizeProse(result.finding, data.partners)
  }, [result.finding, data, showNames])

  // Honest mode prose. We override the partner-name facts with the
  // (possibly anonymized) display names so toggling "Show partner names"
  // also anonymizes the roast.
  const finding = useMemo(() => {
    if (!honestMode) return seriousFinding
    const facts = { ...(result.roastFacts ?? {}) }
    if (data) {
      // Map raw persona names -> anonymized display names if applicable.
      for (const key of ['best_partner', 'worst_partner'] as const) {
        const raw = facts[key]
        if (typeof raw === 'string') {
          const matchPartner = data.partners.find((p) => p.personaName === raw)
          if (matchPartner) {
            const display = displayPartners.find((dp) => dp.id === matchPartner.id)
            if (display) facts[key] = display.displayName
          }
        }
      }
    }
    const roast = generateRoast(result, language, accountId, facts)
    return roast ?? seriousFinding
  }, [honestMode, language, accountId, result, data, displayPartners, seriousFinding])

  return (
    <article className="card flex flex-col">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">{result.title}</h3>
        <span className={severityClass(result.severity)}>
          {result.severityLabel ?? severityLabel(result.severity)}
        </span>
      </header>

      {!isUnmeasured && (
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{result.metric}</span>
          <span className="text-xs text-ink-muted">{result.metricLabel}</span>
          <span className="ml-auto text-xs text-ink-dim tabular-nums">
            vs {result.baseline} {result.baselineLabel}
          </span>
        </div>
      )}

      {data && data.partners.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowNames((s) => !s)}
            className={`px-2 py-1 rounded border transition ${
              showNames
                ? 'border-line bg-bg-raised text-ink'
                : 'border-emerald-700 bg-emerald-900/20 text-emerald-300'
            }`}
            aria-pressed={!showNames}
          >
            {showNames ? 'Show partner names: ON' : 'Show partner names: OFF'}
          </button>
          <span className="text-ink-dim">
            Turn off before screenshotting — protects your friends&apos; privacy.
          </span>
        </div>
      )}

      {!isUnmeasured && displayPartners.length > 0 && (
        <PartnerChart partners={displayPartners} userOverallWr={data!.userOverallWr} />
      )}

      <p className="mt-4 text-sm text-ink leading-relaxed">{finding}</p>
      <p className="mt-3 text-sm text-ink-muted leading-relaxed">
        <span className="text-ink-dim text-xs uppercase tracking-wider mr-2">What to do</span>
        {result.suggestion}
      </p>
      {result.note && (
        <p className="mt-3 text-xs text-ink-dim italic leading-relaxed">{result.note}</p>
      )}
    </article>
  )
}

function PartnerChart({
  partners,
  userOverallWr,
}: {
  partners: (StackSynergyPartner & { displayName: string })[]
  userOverallWr: number
}) {
  const data = partners.map((p) => ({
    label: `${p.displayName} (${p.gamesTogether})`,
    wr: Math.round(p.wrTogether * 100),
    delta: p.deltaPp != null ? Math.round(p.deltaPp) : null,
  }))
  const height = Math.max(140, data.length * 28 + 32)
  const userPct = Math.round(userOverallWr * 100)

  return (
    <div className="mt-4" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 12, bottom: 4 }}>
          <CartesianGrid stroke="#222632" horizontal={false} />
          <XAxis
            type="number"
            stroke="#6b7280"
            fontSize={11}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            allowDataOverflow
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke="#9aa3b2"
            fontSize={11}
            width={150}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: '#1a1e27' }}
            formatter={(value: number, _: string, item: { payload?: { delta: number | null } }) => {
              const d = item.payload?.delta
              const dStr = d == null ? ' (—)' : ` (${d >= 0 ? '+' : ''}${d}pp vs solo)`
              return [`${value}%${dStr}`, 'WR']
            }}
          />
          <ReferenceLine
            x={userPct}
            stroke="#9aa3b2"
            strokeDasharray="4 4"
            label={{ value: `solo ${userPct}%`, fill: '#9aa3b2', fontSize: 10, position: 'top' }}
          />
          <Bar dataKey="wr" name="WR" fill="#ef4444" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Replace each partner's persona name with "Friend N" inside the prose. */
function anonymizeProse(text: string, partners: StackSynergyPartner[]): string {
  let out = text
  partners.forEach((p, i) => {
    if (!p.personaName) return
    const escaped = p.personaName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    out = out.replace(new RegExp(escaped, 'g'), `Friend ${i + 1}`)
  })
  return out
}

