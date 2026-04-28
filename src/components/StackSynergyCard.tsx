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
import { CardSkeleton } from './CardSkeleton'
import type { ReportPhase } from './ProgressStrip'

const TOOLTIP_STYLE = {
  background: '#12151f',
  border: '1px solid #3A3F52',
  borderRadius: 6,
  color: '#ECE6D6',
  fontSize: 12,
  fontFamily: '"JetBrains Mono", monospace',
}

function severityClass(result: { severity: Severity; severityLabel?: string }): string {
  if (result.severity === 'good') {
    return result.severityLabel?.toLowerCase() === 'strong' ? 'pill strong' : 'pill healthy'
  }
  if (result.severity === 'ok') return 'pill watch'
  if (result.severity === 'unmeasured') return 'pill unmeasured'
  return 'pill concerning'
}

function severityLabelText(sev: Severity): string {
  if (sev === 'good') return 'Healthy'
  if (sev === 'ok') return 'Watch'
  if (sev === 'unmeasured') return 'Unmeasured'
  return 'Concerning'
}

function cardSeverityClass(sev: Severity): string {
  if (sev === 'good') return ''
  if (sev === 'ok') return 'sev-watch'
  if (sev === 'unmeasured') return 'sev-unmeasured'
  return 'sev-concerning'
}

interface StackSynergyCardProps {
  result: AnalysisResult
  honestMode: boolean
  language: HonestLanguage
  accountId: number
  /** When the role-split filter is active, the partner counts are over a
   * filtered subset — say so in a footnote. */
  roleFilter?: 'all' | 'core' | 'support'
  roleFilterMatchCount?: number
  phase?: ReportPhase
}

export function StackSynergyCard({
  result,
  honestMode,
  language,
  accountId,
  roleFilter = 'all',
  roleFilterMatchCount,
  phase,
}: StackSynergyCardProps) {
  // Default OFF: names hidden — screenshot-safe by default. The label
  // reads "Show partner names" + the switch is off, which matches what
  // the user actually sees on the page (Friend 1 / Friend 2 / …).
  const [showNames, setShowNames] = useState(false)
  const data = result.stackSynergy
  const isUnmeasured = result.severity === 'unmeasured'

  const displayPartners: (StackSynergyPartner & { displayName: string })[] = useMemo(() => {
    if (!data) return []
    return data.partners.map((p, i) => ({
      ...p,
      displayName: showNames ? p.personaName : `Friend ${i + 1}`,
    }))
  }, [data, showNames])

  // Find the partner the analysis flagged as the negative-delta call-out
  // (the "trends below" line). They're identified by name in roastFacts —
  // we look them up to know which name to always anonymize, regardless
  // of the global "Show partner names" toggle.
  //
  // Why force anonymization here even when the toggle is on: the
  // negative-delta callout is the most socially loaded line on the
  // page. If a friend opens this report and sees themselves named as
  // the WR-dropper, that's a real social cost — not one the tool
  // should quietly inflict. The chart and any positive mentions still
  // honor the toggle.
  const worstPartner = useMemo<StackSynergyPartner | null>(() => {
    if (!data) return null
    const worstName = result.roastFacts?.worst_partner
    if (typeof worstName !== 'string') return null
    return data.partners.find((p) => p.personaName === worstName) ?? null
  }, [data, result.roastFacts])

  const worstPartnerAnonName = useMemo<string | null>(() => {
    if (!worstPartner || !data) return null
    const idx = data.partners.indexOf(worstPartner)
    return idx >= 0 ? `Friend ${idx + 1}` : null
  }, [worstPartner, data])

  const seriousFinding = useMemo(() => {
    if (!data) return result.finding
    let text = result.finding
    // Always anonymize the negative-delta partner regardless of toggle.
    if (worstPartner && worstPartnerAnonName) {
      const escaped = worstPartner.personaName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
      text = text.replace(new RegExp(escaped, 'g'), worstPartnerAnonName)
    }
    // Then if the user has the global toggle off, anonymize the rest too.
    if (!showNames) text = anonymizeProse(text, data.partners)
    return text
  }, [result.finding, data, showNames, worstPartner, worstPartnerAnonName])

  const finding = useMemo(() => {
    if (!honestMode) return seriousFinding
    const facts = { ...(result.roastFacts ?? {}) }
    if (data) {
      // best_partner: respects the global toggle.
      const bestRaw = facts.best_partner
      if (typeof bestRaw === 'string') {
        const matchPartner = data.partners.find((p) => p.personaName === bestRaw)
        if (matchPartner) {
          const display = displayPartners.find((dp) => dp.id === matchPartner.id)
          if (display) facts.best_partner = display.displayName
        }
      }
      // worst_partner: ALWAYS anonymized, toggle or not.
      if (worstPartnerAnonName) facts.worst_partner = worstPartnerAnonName
    }
    const roast = generateRoast(result, language, accountId, facts)
    return roast ?? seriousFinding
  }, [
    honestMode,
    language,
    accountId,
    result,
    data,
    displayPartners,
    seriousFinding,
    worstPartnerAnonName,
  ])

  // Progressive renderer: stack synergy needs party_id from parsed match
  // details, so during fetch/parse phases we show the shared "waiting"
  // skeleton. Placed AFTER all hooks to satisfy the Rules of Hooks — the
  // skeleton-vs-real swap mid-stream would otherwise change hook count
  // between renders. Once any partner data resolves the analysis returns
  // a non-unmeasured result and this branch falls through.
  if (isUnmeasured && phase && phase !== 'done') {
    return <CardSkeleton title={result.title} />
  }

  return (
    <article className={`card ${cardSeverityClass(result.severity)}`}>
      <div className="card-head">
        <h3 className="card-title">{result.title}</h3>
        <span className={severityClass(result)}>
          {result.severityLabel ?? severityLabelText(result.severity)}
        </span>
      </div>

      {!isUnmeasured && (
        <>
          <div className="metric">
            {result.metric}
            <small>{result.metricLabel}</small>
          </div>
          <div className="baseline">
            vs {result.baseline} {result.baselineLabel}
          </div>
        </>
      )}

      {data && data.partners.length > 0 && (
        <>
          <div className="toggle-row">
            <label htmlFor="stack-anon">Show partner names</label>
            <div
              id="stack-anon"
              role="switch"
              aria-checked={showNames}
              tabIndex={0}
              className={`toggle-switch ${showNames ? 'on' : ''}`}
              onClick={() => setShowNames((s) => !s)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  setShowNames((s) => !s)
                }
              }}
            />
          </div>
          <p className="toggle-hint">
            Turn off before screenshotting — protects your friends&apos; privacy.
          </p>
        </>
      )}

      {!isUnmeasured && displayPartners.length > 0 && (
        <PartnerChart partners={displayPartners} userOverallWr={data!.userOverallWr} />
      )}

      <p className="prose">{finding}</p>
      <div className="what">
        <b>What to do</b>
        {result.suggestion}
      </div>
      <p className="privacy">
        Partner data is only visible to you. Names hidden by default in shared
        reports. Negative-delta partners stay anonymized even when the toggle
        is on — your stack reads this report too.
      </p>
      {roleFilter !== 'all' && roleFilterMatchCount != null && (
        <div className="footnote">
          Filtered to your {roleFilterMatchCount} games as {roleFilter}.
        </div>
      )}
      {result.note && <div className="footnote">{result.note}</div>}
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
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 12, bottom: 4 }}>
          <CartesianGrid stroke="#2A2E3D" horizontal={false} />
          <XAxis
            type="number"
            stroke="#8A8474"
            fontSize={10}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            allowDataOverflow
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke="#C9C2B0"
            fontSize={10}
            width={140}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: '#1a1e2b' }}
            formatter={(value: number, _: string, item: { payload?: { delta: number | null } }) => {
              const d = item.payload?.delta
              const dStr = d == null ? ' (—)' : ` (${d >= 0 ? '+' : ''}${d}pp vs solo)`
              return [`${value}%${dStr}`, 'WR']
            }}
          />
          <ReferenceLine
            x={userPct}
            stroke="#E94560"
            strokeDasharray="4 4"
            label={{
              value: `solo ${userPct}%`,
              fill: '#E94560',
              fontSize: 10,
              position: 'top',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          />
          <Bar dataKey="wr" name="WR" fill="#E94560" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function anonymizeProse(text: string, partners: StackSynergyPartner[]): string {
  let out = text
  partners.forEach((p, i) => {
    if (!p.personaName) return
    const escaped = p.personaName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    out = out.replace(new RegExp(escaped, 'g'), `Friend ${i + 1}`)
  })
  return out
}
