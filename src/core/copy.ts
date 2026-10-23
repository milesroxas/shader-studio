import type { Tuning } from './effect.js'

/**
 * What the Inspector says about an effect, beside what the effect's contract
 * already states. Ranges, steps, options and defaults are never restated in
 * copy: they come from the contract. Copy owns only the reading. It is
 * registered with the effect's scenes on the client (`defineStudioEffect`).
 */
export type ParameterCopy = {
  description: string
  label: string
  /**
   * Display name for an option whose raw value is not its reading: `fbm` is
   * fractal Brownian motion, not a word to capitalize. Anything left out
   * takes the raw value with its first letter capitalized.
   */
  optionLabels?: Record<string, string>
  /** One line per option, for the option tooltips of a select. */
  options?: Record<string, string>
  /** Suffix for the value field, shown in the tooltip's range line. */
  unit?: string
}

/**
 * A control that does nothing until another setting changes. The row shows
 * muted with the reason under it, and clicking the row applies `fix`.
 */
export type Dependency<T extends Tuning = Tuning> = {
  active(tuning: T): boolean
  fix?: Partial<T>
  /** What the button under the row does, in its own words. */
  fixLabel?: string
  reason: string
}

/** A collapsed group's header: one line, or the colours it is set to. */
export type GroupSummary = { swatches: readonly (readonly number[])[] } | string

export type EffectCopy<T extends Tuning = Tuning, K extends string = string> = {
  dependencies: Partial<Record<K, Dependency<T>>>
  /** Small text beside a row's control: a number the code owns, not one the editor sets. */
  hint?(key: K, tuning: T): string | undefined
  /**
   * One contract group shown flat on a second Inspector tab (pointer or scroll
   * terms, say), with a note above it. Left out, every group sits on the Look tab.
   */
  interaction?: { group: string; label: string; note: string }
  /** What an editor calls one of these, in a sentence: "New field", "this leak". */
  noun: string
  parameters: Record<K, ParameterCopy>
  /** A low and a high bound drawn as one two-thumb row, under the first key's place. */
  ranges?: readonly { keys: readonly [K, K]; label: string }[]
  summary(group: string, tuning: T): GroupSummary
  /** The stage's heading. */
  title: string
}
