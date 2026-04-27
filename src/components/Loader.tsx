interface LoaderProps {
  stage: string
  done?: number
  total?: number
}

export function Loader({ stage, done, total }: LoaderProps) {
  const pct = total && total > 0 ? Math.round((100 * (done ?? 0)) / total) : null
  return (
    <section className="dwr-loader-wrap">
      <div className="dwr-loader-card">
        <div className="dwr-loader-stage">
          <span className="dwr-loader-pulse" />
          {stage}
        </div>
        {pct != null && (
          <>
            <div className="dwr-loader-bar">
              <div style={{ width: `${pct}%` }} />
            </div>
            <p className="dwr-loader-pct">
              {done}/{total} ({pct}%)
            </p>
          </>
        )}
      </div>
    </section>
  )
}
