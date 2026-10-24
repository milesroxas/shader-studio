import { canonicalJSON } from './canonical-json.js'
import {
  type EffectContract,
  parameterError,
  type StudioGround,
  SURFACES,
  type Surface,
  type Tuning,
  widestPlacement,
} from './effect.js'
import { type LookGround, studioGround } from './ground.js'
import { type CaptureOptions, FRAME_MAX, type Recipe, SEED_MAX, validateCapture } from './recipe.js'
import { resolveTuning } from './resolve-tuning.js'

/**
 * A still is a shot of a look for one use: a static render with its own
 * frame, seed, moment and face, and a bounded set of parameter overrides on
 * top of the live recipe. The live look is drawn with content over it, so it
 * can afford to be sparse; a still stands on its own, so it may be denser or
 * brighter without touching what the site runs live. A look stores its stills
 * beside the recipe (`stills`), the Studio renders them in the editor's
 * browser on Publish, and the published look carries each one's output.
 *
 * The poster pair is not a still here: it is the look exactly as it runs,
 * rendered on both faces with alpha, and its seed and frame are the recipe's.
 */

/** A use is a size with a purpose. The site serves the ones marked `site` by itself. */
export type StillUseSpec = {
  /** One line for the editor: what the still is for and who shows it. */
  description: string
  height: number
  label: string
  /** A look holds at most one of these. */
  single?: true
  /** A visual slot that uses the look receives this still, and the site serves it. */
  site?: true
  width: number
}

export type StillUses = Record<string, StillUseSpec>

/** The uses a look offers unless the plugin is configured with its own. `custom` is always offered. */
export const DEFAULT_STILL_USES = {
  preview: {
    description:
      'The share image for links to a page that opens on this look, unless the page sets its own. Open Graph, 1200 × 630.',
    height: 630,
    label: 'Preview card',
    single: true,
    site: true,
    width: 1200,
  },
  social: {
    description: 'A feed post, 4:5 portrait at 1080 × 1350. Download it from here.',
    height: 1350,
    label: 'Social post',
    width: 1080,
  },
  square: {
    description: 'A square post or avatar at 1080 × 1080. Download it from here.',
    height: 1080,
    label: 'Square post',
    width: 1080,
  },
  story: {
    description: 'A vertical story at 1080 × 1920. Download it from here.',
    height: 1920,
    label: 'Story',
    width: 1080,
  },
} as const satisfies StillUses

/** The one use every configuration offers: any size, with or without alpha. */
export const CUSTOM_USE = 'custom'
export const CUSTOM_USE_SPEC: StillUseSpec = {
  description: 'Any size from 320 to 1920 logical pixels per side, with or without alpha.',
  height: 1200,
  label: 'Custom size',
  width: 1800,
}

/** The uses as the Studio reads them: the configured ones, then `custom`. */
export const withCustomUse = (uses: StillUses): StillUses => ({
  ...uses,
  [CUSTOM_USE]: uses[CUSTOM_USE] ?? CUSTOM_USE_SPEC,
})

export const stillUseIds = (uses: StillUses): string[] => Object.keys(withCustomUse(uses))

export const isStillUse = (uses: StillUses, value: unknown): value is string =>
  typeof value === 'string' && Object.hasOwn(withCustomUse(uses), value)

/** The uses a visual slot receives from a published look. */
export const siteStillUses = (uses: StillUses): string[] =>
  Object.keys(uses).filter((use) => uses[use].site)

export type StillFormat = 'jpeg' | 'webp'

/** What the author stores for a still. Everything an editor can set. */
export type Still = {
  /** Overrides on the live recipe, by parameter name: a still may be denser or brighter than the look that runs live. */
  deltas: Tuning
  format: StillFormat
  frame: number
  height: number
  /** Stable within the look; the published output is keyed by it. */
  id: string
  /** A name of the editor's own; a custom still has no use to name it. */
  label?: string
  scale: 1 | 2
  seed: number
  surface: Surface
  /** Keep alpha instead of flattening onto the face's ground. Custom only. */
  transparent: boolean
  use: string
  width: number
}

/** A still as the published look carries it: the input and its rendered output. */
export type PublishedStill = {
  /** `sha256(stillKey(...))` of what was rendered: equal hashes draw equal pixels. */
  hash: string
  /** The rendered file, in the media collection. */
  media: number | string
} & Still

const STILL_ID = /^[a-z0-9]{6,12}$/
const STILL_KEYS = [
  'id',
  'use',
  'label',
  'surface',
  'width',
  'height',
  'scale',
  'format',
  'transparent',
  'seed',
  'frame',
  'deltas',
] as const
const OUTPUT_KEYS = ['media', 'hash'] as const

/** Eight random characters from the id's own alphabet, drawn with the platform's entropy. */
export const newStillId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => (byte % 36).toString(36)).join('')

/** A new still for a use: the look as it is, at the use's size, on the dark face. */
export function newStill(uses: StillUses, recipe: Recipe, use: string, id = newStillId()): Still {
  const spec = withCustomUse(uses)[use]
  if (!spec) {
    throw new Error(`Unknown still use: ${use}.`)
  }
  return {
    id,
    use,
    ...(use === CUSTOM_USE ? { label: 'Custom' } : {}),
    deltas: {},
    format: 'webp',
    frame: recipe.frame,
    height: spec.height,
    scale: 1,
    seed: recipe.seed,
    surface: 'dark',
    transparent: false,
    width: spec.width,
  }
}

/** The capture a still renders as: its size, scale, face and encoding. */
export const stillCapture = (still: Still): CaptureOptions => ({
  format: still.format,
  height: still.height,
  scale: still.scale,
  surface: still.surface,
  transparent: still.transparent,
  width: still.width,
})

/** How a still reads in a list: its use, or the editor's own name for a custom one. */
export const stillLabel = (uses: StillUses, still: Still) => {
  const all = withCustomUse(uses)
  return still.use === CUSTOM_USE
    ? still.label?.trim() || all[CUSTOM_USE].label
    : (all[still.use]?.label ?? still.use)
}

/** The still's inputs alone, as the draft stores them: a published still's output is left out. */
export function stillInputs(still: PublishedStill | Still): Still {
  const inputs = {} as Record<string, unknown>
  for (const key of STILL_KEYS) {
    if (still[key] !== undefined) {
      inputs[key] = still[key]
    }
  }
  return inputs as Still
}

const isMediaId = (value: unknown) =>
  Number.isInteger(value) || (typeof value === 'string' && value.length > 0)

const isOutput = (value: unknown): value is Pick<PublishedStill, 'hash' | 'media'> => {
  const still = value as null | Partial<PublishedStill> | undefined
  return Boolean(
    still &&
      isMediaId(still.media) &&
      typeof still.hash === 'string' &&
      /^[a-f0-9]{64}$/.test(still.hash),
  )
}

/** The published stills in a stored value, with their outputs; a row without one is left out. */
export const publishedStills = (raw: unknown): PublishedStill[] =>
  Array.isArray(raw) ? raw.filter((still): still is PublishedStill => isOutput(still)) : []

/**
 * The resolved tuning a still draws: the recipe's deltas, the still's own on
 * top, its seed, the face it is for, and the widest placement's caps, the way
 * a poster is drawn. Never checks ranges; `validateStills` does.
 */
export function stillTuning<T extends Tuning>(
  effect: EffectContract<T>,
  recipe: Recipe,
  still: Still,
): T {
  const base = resolveTuning<T>(effect.defaults, {
    ...recipe.deltas,
    ...still.deltas,
    ...(effect.seeded ? { seed: still.seed } : {}),
  } as Partial<T>)
  return effect.limit(effect.face(base, still.surface), widestPlacement(effect))
}

/**
 * The identity of what a still renders, in canonical form: the renderer, the
 * resolved tuning, the moment, the frame geometry, the encoding and the ground
 * a filled still is laid over. The published still stores its SHA-256; the
 * Studio compares drafts to published states over the same string.
 */
export function stillKey<T extends Tuning>(
  effect: EffectContract<T>,
  recipe: Recipe,
  still: Still,
  ground: LookGround,
  defaults: StudioGround,
): string {
  return canonicalJSON({
    format: still.format,
    frame: still.frame,
    ground: still.transparent ? null : studioGround(ground, still.surface, defaults),
    height: still.height,
    renderer: effect.renderer,
    scale: still.scale,
    tuning: stillTuning(effect, recipe, still),
    width: still.width,
  })
}

/** The one rule a still's shape has to meet before its values are read. */
function stillShape(uses: StillUses, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('A still is an object.')
  }
  const value = raw as Record<string, unknown>
  const known = [...STILL_KEYS, ...OUTPUT_KEYS] as readonly string[]
  const unknown = Object.keys(value).find((key) => !known.includes(key))
  if (unknown) {
    throw new Error(`Unknown still property: ${unknown}.`)
  }
  if (typeof value.id !== 'string' || !STILL_ID.test(value.id)) {
    throw new Error('A still id is 6 to 12 lowercase letters and digits.')
  }
  if (!isStillUse(uses, value.use)) {
    throw new Error(`Unknown still use: ${String(value.use)}.`)
  }
  if (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 80)) {
    throw new Error('A still label is up to 80 characters.')
  }
  if (!(SURFACES as readonly unknown[]).includes(value.surface)) {
    throw new Error('A still is for the dark or the light face.')
  }
  return value
}

/** The frame a still renders in: the capture's own rules, then the use's size and fill. */
function stillFrame(uses: StillUses, value: Record<string, unknown>): CaptureOptions {
  const capture = validateCapture({
    format: value.format,
    height: value.height,
    scale: value.scale,
    surface: value.surface,
    transparent: value.transparent,
    width: value.width,
  })
  if (value.use === CUSTOM_USE) {
    return capture
  }
  const spec = withCustomUse(uses)[value.use as string]
  if (capture.width !== spec.width || capture.height !== spec.height) {
    throw new Error(`A ${spec.label} still is ${spec.width} × ${spec.height}.`)
  }
  if (capture.transparent) {
    throw new Error(`A ${spec.label} still is always filled.`)
  }
  return capture
}

/** The moment and the arrangement: a still's seed and frame share the recipe's ranges. */
function stillMoment(value: Record<string, unknown>) {
  if (!Number.isInteger(value.seed) || Number(value.seed) < 0 || Number(value.seed) > SEED_MAX) {
    throw new Error('A still seed must be a nonnegative 31-bit integer.')
  }
  if (
    !Number.isInteger(value.frame) ||
    Number(value.frame) < 1 ||
    Number(value.frame) > FRAME_MAX
  ) {
    throw new Error(`A still frame must be between 1 and ${FRAME_MAX}.`)
  }
}

/** A still's overrides: authorable parameters in range, and the effect's cross-parameter rules on the result. */
function stillOverrides<T extends Tuning>(
  effect: EffectContract<T>,
  recipe: Recipe,
  deltas: unknown,
): Tuning {
  if (!deltas || typeof deltas !== 'object' || Array.isArray(deltas)) {
    throw new Error('Still overrides must be an object.')
  }
  for (const [key, val] of Object.entries(deltas)) {
    if (!Object.hasOwn(effect.parameters, key)) {
      throw new Error(`Unsupported parameter: ${key}`)
    }
    const error = parameterError(key, effect.parameters[key], val)
    if (error) {
      throw new Error(error)
    }
  }
  effect.check?.(
    resolveTuning<T>(effect.defaults, { ...recipe.deltas, ...(deltas as Tuning) } as Partial<T>),
  )
  return deltas as Tuning
}

function validateStill<T extends Tuning>(
  uses: StillUses,
  effect: EffectContract<T>,
  recipe: Recipe,
  raw: unknown,
) {
  const value = stillShape(uses, raw)
  stillFrame(uses, value)
  stillMoment(value)
  stillOverrides(effect, recipe, value.deltas)
  return value as unknown as Still
}

/** How many stills a look may hold. */
export const STILL_LIMIT = 12

/**
 * The stills a look may store, each checked against the effect and the recipe
 * they sit on. Throws the message the editor reads. Outputs (`media`, `hash`)
 * are passed through for the publish path to verify; everything else is held
 * to its range. An empty or missing list is no stills.
 */
export function validateStills<T extends Tuning>(
  uses: StillUses,
  effect: EffectContract<T>,
  recipe: Recipe,
  raw: unknown,
): (PublishedStill | Still)[] {
  if (raw === null || raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    throw new Error('Stills must be a list.')
  }
  if (raw.length > STILL_LIMIT) {
    throw new Error(`A look holds up to ${STILL_LIMIT} stills.`)
  }
  const all = withCustomUse(uses)
  const stills = raw.map((still) => validateStill(uses, effect, recipe, still))
  const ids = new Set<string>()
  const singles = new Set<string>()
  for (const still of stills) {
    if (ids.has(still.id)) {
      throw new Error(`Two stills share the id ${still.id}.`)
    }
    ids.add(still.id)
    const spec = all[still.use]
    if (spec.single) {
      if (singles.has(still.use)) {
        throw new Error(`A look holds one ${spec.label} still.`)
      }
      singles.add(still.use)
    }
  }
  return stills
}

/** Whether two stored stills ask for the same render, outputs aside. */
export const sameStill = (a: PublishedStill | Still, b: PublishedStill | Still) =>
  canonicalJSON(stillInputs(a)) === canonicalJSON(stillInputs(b))

/** How many stills differ between two lists: added, removed or changed, by id. */
export function stillChanges(
  a: readonly (PublishedStill | Still)[],
  b: readonly (PublishedStill | Still)[],
): number {
  const byId = new Map(b.map((still) => [still.id, still]))
  let changes = 0
  for (const still of a) {
    const other = byId.get(still.id)
    if (!other || !sameStill(still, other)) {
      changes++
    }
    byId.delete(still.id)
  }
  return changes + byId.size
}
