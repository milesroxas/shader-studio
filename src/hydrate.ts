import type { CollectionAfterReadHook, Field, GlobalAfterReadHook, PayloadRequest } from 'payload'

import type { MediaLike, ResolvedStudioConfig } from './options.js'

import {
  lookGround,
  type PosterMediaSource,
  publishedStills,
  siteStillUses,
  type Surface,
} from './core/index.js'
import {
  GROUND_FIELD,
  LIGHT_POSTER_FIELD,
  SKIP_HYDRATION_CONTEXT,
  STILLS_FIELD,
  THUMBNAIL_FIELD,
} from './paths.js'
import { hasSlots, slotHolders, slotId, slotMap, type SlotMap } from './slots.js'

type LookRow = { id: number | string } & Record<string, unknown>

/**
 * The files a look publishes with: the poster pair and its stills. The pair
 * stored on the look froze each file's URL at publish time, and a file's
 * address can follow the media origin, so the rows the look points at answer
 * today's URL, and the stored pair stands in only where a row is gone. A
 * still is read from its row alone: one that is gone is left out.
 */
async function liveRenders(req: PayloadRequest, config: ResolvedStudioConfig, looks: LookRow[]) {
  const uses = siteStillUses(config.stillUses)
  const siteStills = (look: LookRow) =>
    publishedStills(look[STILLS_FIELD]).filter((still) => uses.includes(still.use))
  const ids = [
    ...new Set(
      looks.flatMap((look) => [
        ...[slotId(look[THUMBNAIL_FIELD]), slotId(look[LIGHT_POSTER_FIELD])].filter(
          (id) => id !== null,
        ),
        ...siteStills(look).map((still) => still.media),
      ]),
    ),
  ]
  const rows = new Map<string, MediaLike>()
  if (ids.length) {
    const result = await req.payload.find({
      collection: config.mediaSlug,
      depth: 0,
      limit: ids.length,
      pagination: false,
      req,
      where: { id: { in: ids } },
    })
    for (const row of result.docs as MediaLike[]) {
      rows.set(String(row.id), row)
    }
  }
  const source = (id: unknown) => {
    const row = id === null || id === undefined ? undefined : rows.get(String(id))
    return row ? config.serializeMedia(row) : undefined
  }
  return (look: LookRow) => {
    const dark = source(slotId(look[THUMBNAIL_FIELD]))
    const light = source(slotId(look[LIGHT_POSTER_FIELD]))
    const stills: Record<string, PosterMediaSource> = {}
    for (const still of siteStills(look)) {
      const row = source(still.media)
      if (row) {
        stills[still.use] = row
      }
    }
    return {
      posters:
        dark && light
          ? ({ dark, light } satisfies Record<Surface, PosterMediaSource>)
          : look.posters,
      ...(Object.keys(stills).length ? { stills } : {}),
    }
  }
}

/**
 * A visual slot stores the id of the Studio look it uses. Walk once at the
 * document boundary, batch every nested slot, and hand each one what the site
 * renders from: the published look's snapshot, posters and hash. A look that
 * was never published keeps its bare id, and the slot falls back to its
 * shipped look.
 */
async function hydrateSlots(
  config: ResolvedStudioConfig,
  map: SlotMap,
  doc: Record<string, unknown>,
  req: PayloadRequest,
) {
  if (!doc || req.context[SKIP_HYDRATION_CONTEXT]) {
    return doc
  }
  const holders = slotHolders(doc, map, config.slotField)
  const ids = [...new Set(holders.map((holder) => slotId(holder[config.slotField])))].filter(
    (id): id is number | string => id !== null,
  )
  if (!ids.length) {
    return doc
  }
  // Per request, and it remembers a miss: a list of documents that share an
  // unpublished look asks for it once.
  const cacheKey = `shaderStudioLooks:${config.looksSlug}`
  req.context[cacheKey] ??= new Map<string, unknown>()
  const cache = req.context[cacheKey] as Map<string, unknown>
  const missing = ids.filter((id) => !cache.has(String(id)))
  if (missing.length) {
    const result = await req.payload.find({
      collection: config.looksSlug,
      depth: 0,
      // The published document, and of it only what a slot reads: this lands
      // in public page responses.
      draft: false,
      limit: missing.length,
      overrideAccess: true,
      pagination: false,
      req,
      select: {
        [GROUND_FIELD]: true,
        [LIGHT_POSTER_FIELD]: true,
        posters: true,
        snapshot: true,
        sourceHash: true,
        [STILLS_FIELD]: true,
        [THUMBNAIL_FIELD]: true,
      } as never,
      where: { id: { in: missing } },
    })
    const looks = result.docs as unknown as LookRow[]
    const renders = await liveRenders(req, config, looks)
    for (const id of missing) {
      cache.set(String(id), null)
    }
    for (const look of looks) {
      if (look.snapshot) {
        cache.set(String(look.id), {
          id: look.id,
          ground: lookGround(look[GROUND_FIELD]),
          snapshot: look.snapshot,
          sourceHash: look.sourceHash,
          ...renders(look),
        })
      }
    }
  }
  for (const holder of holders) {
    const id = slotId(holder[config.slotField])
    holder[config.slotField] = cache.get(String(id)) ?? holder[config.slotField]
  }
  return doc
}

/** The hydration hook for a schema, or none when it holds no slot. */
export function collectionHydration(
  config: ResolvedStudioConfig,
  fields: Field[],
): CollectionAfterReadHook[] {
  const map = slotMap(fields, config.slotField, config.looksSlug)
  if (!hasSlots(map)) {
    return []
  }
  return [({ doc, req }) => hydrateSlots(config, map, doc, req)]
}

export function globalHydration(
  config: ResolvedStudioConfig,
  fields: Field[],
): GlobalAfterReadHook[] {
  const map = slotMap(fields, config.slotField, config.looksSlug)
  if (!hasSlots(map)) {
    return []
  }
  return [({ doc, req }) => hydrateSlots(config, map, doc, req)]
}
