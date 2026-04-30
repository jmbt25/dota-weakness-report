import { ApertureSigil } from './ApertureSigil'

export type NavRoute = 'report' | 'mmr-math' | 'meta' | 'breakdowns'

interface TopNavProps {
  active: NavRoute
  /** Disable the Report link when no analysis has run yet. Clicking still
   *  takes the user back to the landing page so they can paste an ID. */
  reportDisabled?: boolean
  onNavigate: (route: NavRoute) => void
}

export function TopNav({ active, reportDisabled = false, onNavigate }: TopNavProps) {
  const items: { key: NavRoute; label: string }[] = [
    { key: 'report', label: 'Report' },
    { key: 'mmr-math', label: 'MMR Math' },
    { key: 'meta', label: 'Meta' },
    { key: 'breakdowns', label: 'Breakdowns' },
  ]
  return (
    <header className="dwr-topnav">
      <button
        type="button"
        onClick={() => onNavigate('report')}
        className="dwr-home-link"
        aria-label="Back to homepage"
      >
        <ApertureSigil size={36} />
        <span className="dwr-wm sm">
          <span>DOTA</span>
          <span className="red">WEAKNESS</span>
          <span>REPORT</span>
        </span>
      </button>

      <nav className="dwr-topnav-links" aria-label="Primary">
        {items.map((it) => {
          const isActive = it.key === active
          const isReportLinkDisabled = it.key === 'report' && reportDisabled && !isActive
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onNavigate(it.key)}
              className={`dwr-topnav-link${isActive ? ' active' : ''}${isReportLinkDisabled ? ' dim' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {it.label}
            </button>
          )
        })}
      </nav>
    </header>
  )
}
