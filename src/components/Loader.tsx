interface LoaderProps {
  stage: string
  done?: number
  total?: number
}

export function Loader({ stage, done, total }: LoaderProps) {
  const pct = total && total > 0 ? Math.round((100 * (done ?? 0)) / total) : null
  return (
    <section className="max-w-2xl mx-auto px-6 py-10">
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-accent animate-pulse" />
          <h2 className="text-lg font-medium">{stage}</h2>
        </div>
        {pct != null && (
          <>
            <div className="mt-4 h-1.5 w-full bg-bg-raised rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {done}/{total} ({pct}%)
            </p>
          </>
        )}
      </div>
    </section>
  )
}
