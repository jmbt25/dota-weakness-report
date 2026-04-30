/**
 * Renders just under TopNav on /breakdowns and /breakdowns/{match_id}.
 * Required by the spec — pros are public figures, but the prose register
 * is observation not editorial, and the disclaimer makes the unaffiliation
 * explicit.
 *
 * Don't render anywhere outside the /breakdowns routes.
 */
export function BreakdownsDisclaimer() {
  return (
    <div className="dwr-breakdowns-disclaimer" role="note">
      Observations from public match data. Not affiliated with any team,
      player, or tournament. Data via OpenDota.
    </div>
  )
}
