/**
 * Renders just under TopNav on /watch and /watch/{match_id}. Required by
 * the spec — pros are public figures, but the prose register is observation
 * not editorial, and the disclaimer makes the unaffiliation explicit.
 *
 * Don't render anywhere outside the /watch routes.
 */
export function WatchDisclaimer() {
  return (
    <div className="dwr-watch-disclaimer" role="note">
      Observations from public match data. Not affiliated with any team,
      player, or tournament. Data via OpenDota.
    </div>
  )
}
