/**
 * An effect owns one `defaults` table: tuning lives once, call sites pass
 * deltas, shipped looks are delta-only presets. This resolves a caller's
 * deltas against the table so the table stays the only place a default is
 * written. An explicitly passed `undefined` falls back to the default, the way
 * a destructuring default behaves and a plain object spread does not.
 */
export function resolveTuning<T extends object>(defaults: T, deltas: Partial<T>): T {
  const overrides = Object.fromEntries(
    Object.entries(deltas).filter(([, value]) => value !== undefined),
  ) as Partial<T>
  return { ...defaults, ...overrides }
}
