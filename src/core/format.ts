/**
 * Prices in this app are POINTS FROM THE SESSION OPEN, never absolute levels --
 * an absolute ES price plus the shape of the daily rail is enough for anyone who
 * follows the market to work out which day is being played, and then look up what
 * happens next.
 *
 * So they are always rendered signed and relative: "+12.50", "-8.25", "0.00".
 */
export function signed(points: number, dp = 2): string {
  const v = points.toFixed(dp);
  return points > 0 ? `+${v}` : v;
}
