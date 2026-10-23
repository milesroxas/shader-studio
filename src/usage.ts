import type { PayloadRequest, Where } from 'payload'

import type { ResolvedStudioConfig } from './options.js'

import { SKIP_HYDRATION_CONTEXT } from './paths.js'
import { hasSlots, slotHolders, slotId, slotMap } from './slots.js'

export type LookUse = {
  /** The collection or global, as the admin labels it. */
  content: string
  /** Only the document's unpublished draft uses the look so far. */
  draft: boolean
  /** Kept for the client's shape; this reading never lists retained versions. */
  historical: false
  title: string
  url: string
}

const labelOf = (label: unknown, fallback: string) => (typeof label === 'string' ? label : fallback)

const sameId = (a: unknown, b: number | string) => a !== null && String(a) === String(b)

/**
 * Where a look is used, read through Payload's own queries so every database
 * adapter answers alike: each collection that holds a slot is asked for the
 * documents whose slot stores the look, published and as their latest draft,
 * and each global is read and walked. A document counts once: as itself when
 * its published state uses the look, else as its draft.
 */
export async function lookUsage(
  req: PayloadRequest,
  config: ResolvedStudioConfig,
  id: number | string,
): Promise<LookUse[]> {
  const { payload } = req
  const admin = payload.config.routes.admin
  const context = { ...req.context, [SKIP_HYDRATION_CONTEXT]: true }
  const uses = new Map<string, LookUse>()
  const claim = (use: LookUse) => {
    const known = uses.get(use.url)
    if (!known || (known.draft && !use.draft)) {
      uses.set(use.url, use)
    }
  }

  for (const collection of payload.config.collections) {
    if (collection.slug === config.looksSlug) {
      continue
    }
    const map = slotMap(collection.fields, config.slotField, config.looksSlug)
    if (!hasSlots(map)) {
      continue
    }
    const where: Where = { or: map.paths.map((path) => ({ [path]: { equals: id } })) }
    const content = labelOf(collection.labels?.plural, collection.slug)
    const titleField = collection.admin?.useAsTitle || 'id'
    const drafts = Boolean(collection.versions?.drafts)
    const query = (draft: boolean) =>
      payload.find({
        collection: collection.slug,
        context,
        depth: 0,
        draft,
        limit: 100,
        overrideAccess: true,
        pagination: false,
        req,
        where,
      })
    const [published, drafted] = await Promise.all([
      query(false),
      drafts ? query(true) : Promise.resolve(null),
    ])
    const use = (doc: Record<string, unknown>, draft: boolean): LookUse => ({
      content,
      draft,
      historical: false,
      title: String(doc[titleField] ?? content),
      url: `${admin}/collections/${collection.slug}/${encodeURIComponent(String(doc.id))}`,
    })
    for (const doc of published.docs as Record<string, unknown>[]) {
      claim(use(doc, false))
    }
    for (const doc of (drafted?.docs ?? []) as Record<string, unknown>[]) {
      claim(use(doc, true))
    }
  }

  for (const global of payload.config.globals) {
    const map = slotMap(global.fields, config.slotField, config.looksSlug)
    if (!hasSlots(map)) {
      continue
    }
    const content = labelOf(global.label, global.slug)
    const url = `${admin}/globals/${global.slug}`
    const read = (draft: boolean) =>
      payload.findGlobal({
        slug: global.slug,
        context,
        depth: 0,
        draft,
        overrideAccess: true,
        req,
      }) as Promise<Record<string, unknown>>
    const holds = (doc: Record<string, unknown>) =>
      slotHolders(doc, map, config.slotField).some((holder) =>
        sameId(slotId(holder[config.slotField]), id),
      )
    if (holds(await read(false))) {
      claim({ content, draft: false, historical: false, title: content, url })
    } else if (global.versions?.drafts && holds(await read(true))) {
      claim({ content, draft: true, historical: false, title: content, url })
    }
  }

  return [...uses.values()]
}
