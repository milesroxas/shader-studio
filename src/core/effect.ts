import type { CSSProperties } from 'react'

/**
 * What the Studio needs to know about an effect to author it: a closed
 * contract, pure data and pure functions. Nothing here imports Three, React
 * Three Fiber or the DOM, so the Payload config, server validation and the
 * admin all read the same table. The scenes that draw an effect are the one
 * part that cannot live here; they are registered on the client
 * (`defineStudioEffect` in `shader-studio/client`).
 *
 * This is the authoring contract, not a tuning provider: every number still
 * originates in exactly one place (the effect's `defaults`, the deltas of its
 * shipped looks), and a contract only points at them.
 */

/** A resolved tuning: every knob with its default filled in. */
export type Tuning = Record<string, unknown>

/** The ground an effect sits on. Every effect renders a face for each. */
export type Surface = 'dark' | 'light'
export const SURFACES = ['dark', 'light'] as const satisfies readonly Surface[]

/**
 * The colour the Studio paints under an effect on each face, and flattens an
 * opaque still onto: a host's page background in each palette, as hex because
 * the admin loads no site CSS and sharp reads no `hsl()` space syntax.
 */
export type StudioGround = Record<Surface, string>
export const DEFAULT_GROUND: StudioGround = { dark: '#09090b', light: '#f5f5f4' }

type Grouped = { group: string }
export type RangeParameter = { max: number; min: number; step?: number } & Grouped
export type OptionsParameter = {
  /**
   * Values a resolved tuning may also hold, because the effect derives them
   * for a ground (`EffectContract.face`), and no author may choose.
   */
  derived?: readonly string[]
  /** What an author may choose. */
  options: readonly string[]
} & Grouped
/** Three channels from 0 to 1: a colour an editor can read as hex. */
export type ColorParameter = { color: true } & Grouped
/** `vector` numbers sharing one range: a direction, or a per-channel multiplier that may pass 1. */
export type VectorParameter = { vector: number } & RangeParameter
export type ToggleParameter = { toggle: true } & Grouped
export type Parameter =
  | ColorParameter
  | OptionsParameter
  | RangeParameter
  | ToggleParameter
  | VectorParameter

export const range = (group: string, min: number, max: number, step = 0.01): RangeParameter => ({
  group,
  max,
  min,
  step,
})
export const unit = (group: string): RangeParameter => range(group, 0, 1)
export const vector = (
  group: string,
  size: number,
  min: number,
  max: number,
  step = 0.01,
): VectorParameter => ({ ...range(group, min, max, step), vector: size })
export const options = (group: string, choices: readonly string[]): OptionsParameter => ({
  group,
  options: choices,
})
export const color = (group: string): ColorParameter => ({ color: true, group })
export const toggle = (group: string): ToggleParameter => ({ group, toggle: true })

/** A shipped look: a stable id stored as text in Payload, and delta-only tuning. */
export type EffectLook<T extends Tuning> = {
  /** One line for the admin picker. */
  description: string
  id: string
  label: string
  /** Delta-only tuning against the effect's defaults. Never restates a default. */
  tuning: Partial<T>
}

/** A CSS blend mode, as the `mix-blend-mode` property takes it. */
export type BlendMode = NonNullable<CSSProperties['mixBlendMode']>

/** What a placement costs, in the effect's own words, for the Studio's stage. */
export type EffectBudget = { capped: boolean; text: string }

export type EffectContract<T extends Tuning = Tuning> = {
  /**
   * How a frame of this tuning meets the ground under it. An effect that draws
   * with alpha leaves this out; one that draws an opaque frame names the CSS
   * blend that drops its ground out, and its canvas and its posters are both
   * composited that way.
   */
  blend?(tuning: T): BlendMode
  budget(limited: T, requested: T, placement: string): EffectBudget
  /** Rules that span parameters. Throws the message the editor reads. */
  check?(tuning: T): void
  /** Every knob with its default. The authorable subset is `parameters`; the rest is code-owned. */
  defaults: T
  /** The tuning for one ground, from the tuning authored on the dark one. */
  face(tuning: T, surface: Surface): T
  /** The look an unknown or missing id degrades to. */
  fallbackLook: string
  /** The visual kind an editor chooses, and the `effect` a Studio look is filed under. Stored as text. */
  id: string
  label: string
  /** Code-owned ceilings for a placement. Caps, never raises, and is idempotent. */
  limit(tuning: T, placement: string): T
  /** A URL for a shipped look's poster on one face, for the Studio's starters and the slot picker. */
  lookPoster?(look: string, surface: Surface): string | undefined
  looks: Record<string, EffectLook<T>>
  /** A short tag beside a look in the Studio's starters, when the effect has one to show. */
  lookTag?(look: EffectLook<T>): string | undefined
  /** The authorable subset of `defaults`, by name. */
  parameters: Record<string, Parameter>
  /**
   * Where a live effect may run, by name, most generous first: snapshots and
   * stills are capped at the first one. The Studio's stage offers each.
   */
  placements: readonly string[]
  /** Stamped on every snapshot. A snapshot from another renderer keeps its posters and never runs live. */
  renderer: string
  /** Whether a seed changes what is drawn. A seeded effect keeps a `seed` knob in `defaults`. */
  seeded: boolean
}

/** A contract with its tuning type erased, for code that handles any effect. */
export type Effect = EffectContract<Tuning>

/** The widest placement: what snapshots, posters and stills are capped at. */
export const widestPlacement = (effect: Effect): string => effect.placements[0] ?? 'default'

export const isLookId = (effect: Effect, value: unknown): value is string =>
  typeof value === 'string' && Object.hasOwn(effect.looks, value)

/** Admin picker options: id, label and description, in table order. */
export const lookOptions = (effect: Effect) =>
  Object.values(effect.looks).map(({ id, description, label }) => ({
    description,
    label,
    value: id,
  }))

const inRange = (n: unknown, min: number, max: number) =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max

/** `length` numbers, each from `min` to `max`. */
const isTuple = (value: unknown, length: number, min: number, max: number) =>
  Array.isArray(value) && value.length === length && value.every((n) => inRange(n, min, max))

function optionsError(key: string, spec: OptionsParameter, value: unknown, resolved: boolean) {
  const allowed = resolved ? [...spec.options, ...(spec.derived ?? [])] : spec.options
  return typeof value === 'string' && allowed.includes(value) ? null : `Invalid ${key}.`
}

/**
 * The rule one value has to meet for its parameter. Returns the reason it does
 * not, or `null`. `resolved` reads a value out of a tuning the effect produced
 * rather than one an author wrote, so it also admits what the effect derives.
 */
export function parameterError(
  key: string,
  spec: Parameter,
  value: unknown,
  { resolved = false } = {},
): null | string {
  if ('options' in spec) {
    return optionsError(key, spec, value, resolved)
  }
  if ('toggle' in spec) {
    return typeof value === 'boolean' ? null : `${key} must be on or off.`
  }
  if ('color' in spec) {
    return isTuple(value, 3, 0, 1) ? null : `${key} must be three color values from 0 to 1.`
  }
  if ('vector' in spec) {
    return isTuple(value, spec.vector, spec.min, spec.max)
      ? null
      : `${key} must be ${spec.vector} values between ${spec.min} and ${spec.max}.`
  }
  return inRange(value, spec.min, spec.max)
    ? null
    : `${key} must be between ${spec.min} and ${spec.max}.`
}
