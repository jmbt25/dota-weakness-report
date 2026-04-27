/**
 * Shared "waiting on first parsed match" skeleton for the progressive
 * renderer. Used when an analysis returns severity: 'unmeasured' AND the
 * report phase is still 'fetching-details' or 'parsing'. Once at least one
 * match's data has arrived for that card, the skeleton is replaced by the
 * real rendered card and the footnote takes over the sample-size story.
 */

export interface CardSkeletonProps {
  title: string
}

export function CardSkeleton({ title }: CardSkeletonProps) {
  const lower = title.toLowerCase()
  return (
    <article className="card sev-loading">
      <div className="card-head">
        <h3 className="card-title">{title}</h3>
        <span className="pill loading">Loading</span>
      </div>
      <div className="card-skeleton" aria-hidden="true">
        <div className="skeleton-line lg" />
        <div className="skeleton-line md" />
        <div className="skeleton-chart">
          <div className="skeleton-bar" />
          <div className="skeleton-bar" />
          <div className="skeleton-bar" />
          <div className="skeleton-bar" />
        </div>
      </div>
      <p className="prose loading-prose">Waiting on first parsed match for {lower}…</p>
    </article>
  )
}
