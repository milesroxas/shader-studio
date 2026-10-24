import {
  type EffectContract,
  parameterError,
  SURFACES,
  type Surface,
  type Tuning,
} from './effect.js'
import { type LookGround, lookGround } from './ground.js'
import { FRAME_MAX, type Snapshot } from './recipe.js'
import { type StillUses, siteStillUses } from './stills.js'

/**
 * A rendered file as a visual slot receives it: what the plugin copies off a
 * media document when a look is published, and refreshes from the live row
 * when the look is read. Hosts that serve media through a CDN can add the
 * fields they need with the `serializeMedia` option; they ride along here.
 */
export type PosterMediaSource = {
  [key: string]: unknown
  filename: string
  height: number
  mimeType: string
  updatedAt?: string
  url: string
  width: number
}

/** A published Studio look as a visual slot receives it: what the plugin's hydration hands over. */
export type ReleaseDescriptor<T extends Tuning = Tuning> = {
  /** The look's own ground per face (`./ground`); absent or empty, the slot's ground shows. */
  ground?: LookGround
  id: number | string
  posters: Record<Surface, PosterMediaSource>
  snapshot: Snapshot<T>
  sourceHash: string
  /** The look's published stills the site serves, by use (`./stills`): a `site` use is served with the look. */
  stills?: Partial<Record<string, PosterMediaSource>>
}

/** Whether a stored value is a still the site can serve: a filed image with its size. */
export const isPosterSource = (value: unknown): value is PosterMediaSource => {
  const poster = value as null | Partial<PosterMediaSource> | undefined
  return Boolean(
    poster &&
      typeof poster.filename === 'string' &&
      typeof poster.url === 'string' &&
      poster.mimeType?.startsWith('image/') &&
      poster.width &&
      poster.height,
  )
}

/**
 * Whether a stored value is a whole tuning for this effect: every knob
 * present, authorable ones inside their parameter, code-owned ones of the
 * default's type. Ceilings are not restated here: whatever draws a snapshot
 * puts it through the effect's `limit` first, which holds both ends.
 */
function isTuning<T extends Tuning>(effect: EffectContract<T>, raw: unknown): raw is T {
  if (!raw || typeof raw !== 'object') {
    return false
  }
  const value = raw as Tuning
  return Object.entries(effect.defaults).every(([key, base]) => {
    const v = value[key]
    const spec = effect.parameters[key]
    if (spec) {
      return parameterError(key, spec, v, { resolved: true }) === null
    }
    if (typeof base === 'number') {
      return typeof v === 'number' && Number.isFinite(v)
    }
    if (Array.isArray(base)) {
      return (
        Array.isArray(v) &&
        v.length === base.length &&
        v.every((n) => typeof n === 'number' && Number.isFinite(n))
      )
    }
    return typeof v === typeof base
  })
}

const isDocumentId = (value: unknown) =>
  Number.isInteger(value) || (typeof value === 'string' && value.length > 0)

/**
 * Read a hydrated look for one effect. Never throws and never guesses: a look
 * filed under another effect, a malformed snapshot or a missing poster is
 * `null`, and the slot falls back to its shipped look.
 */
export function parseRelease<T extends Tuning>(
  effect: EffectContract<T>,
  raw: unknown,
  { stillUses }: { stillUses?: StillUses } = {},
): null | ReleaseDescriptor<T> {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const release = raw as ReleaseDescriptor<T>
  if (
    !isDocumentId(release.id) ||
    typeof release.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(release.sourceHash)
  ) {
    return null
  }
  const snapshot = release.snapshot
  if (
    !snapshot ||
    typeof snapshot.renderer !== 'string' ||
    snapshot.renderer !== effect.renderer ||
    !SURFACES.every((surface) => isTuning(effect, snapshot[surface])) ||
    !Number.isInteger(snapshot.frame) ||
    snapshot.frame < 1 ||
    snapshot.frame > FRAME_MAX
  ) {
    return null
  }
  for (const surface of SURFACES) {
    if (!isPosterSource(release.posters?.[surface])) {
      return null
    }
  }
  // A still that does not parse is left out, never the release: the slot still runs.
  const stills: NonNullable<ReleaseDescriptor['stills']> = {}
  const uses = stillUses ? siteStillUses(stillUses) : Object.keys(release.stills ?? {})
  for (const use of uses) {
    const still = release.stills?.[use]
    if (isPosterSource(still)) {
      stills[use] = still
    }
  }
  return {
    id: release.id,
    ground: lookGround(release.ground),
    posters: release.posters,
    snapshot,
    sourceHash: release.sourceHash,
    ...(Object.keys(stills).length ? { stills } : {}),
  }
}
