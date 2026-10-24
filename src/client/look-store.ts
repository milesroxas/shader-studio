'use client'

import { useEffect, useSyncExternalStore } from 'react'

import type { Effect } from '../core/effect.js'
import { type LookGround, lookGround } from '../core/ground.js'
import { canonicalJSON, type Recipe, type Snapshot, snapshotRecipe } from '../core/recipe.js'
import { type PublishedStill, publishedStills } from '../core/stills.js'
import {
  EFFECT_FIELD,
  GROUND_FIELD,
  RECIPE_FIELD,
  STILL_MEDIA_FIELD,
  STILLS_FIELD,
  THUMBNAIL_FIELD,
} from '../paths.js'
import type { LookUse } from '../usage.js'
import type { Studio } from './config.js'
import { useStudio } from './config.js'

export type { LookUse }

/** One published state of a look, newest first in `history`. */
export type PublishedState = {
  at: string
  /** The ground the state was published with; not part of the key. */
  ground: LookGround
  /** The version's id, or `live` for the published document itself. */
  id: string
  /** Canonical snapshot: equal keys draw equal pixels. */
  key: string
  poster: null | string
  recipe: Recipe
  /** Each still's render, by media id: the file and its admin thumbnail. */
  renders: Map<string, Render>
  /** The stills the state was published with, each with its render. */
  stills: PublishedStill[]
}

export type Render = { thumbnail: string; url: string }

export type LookState = {
  history: PublishedState[]
  /** What the site shows now, or `null` for a look that was never published. */
  live: null | PublishedState
  loaded: boolean
  uses: LookUse[]
}

type MediaDoc = {
  id: number | string
  sizes?: Record<string, { url?: null | string } | undefined>
  url?: null | string
}

const EMPTY: LookState = { history: [], live: null, loaded: false, uses: [] }
const looks = new Map<string, LookState>()
const mounted = new Map<string, number>()
const listeners = new Set<() => void>()
/** How each mounted look is fetched: the API base and the collection, from the Studio that mounted it. */
const sources = new Map<string, { api: string; effect: (id: unknown) => Effect; slug: string }>()

/** The admin thumbnail of a media document, else its file: the first size the host declares, by convention `thumbnail`. */
export const posterOf = (media: unknown) => {
  if (!media || typeof media !== 'object') {
    return null
  }
  const doc = media as MediaDoc
  const sizes = doc.sizes ?? {}
  return sizes.thumbnail?.url ?? Object.values(sizes)[0]?.url ?? doc.url ?? null
}

/** A state's rendered stills, from the relationship the state populates. */
const rendersOf = (media: unknown) => {
  const renders = new Map<string, Render>()
  if (!Array.isArray(media)) {
    return renders
  }
  for (const row of media) {
    const doc = row && typeof row === 'object' ? (row as MediaDoc) : null
    const thumbnail = posterOf(doc)
    if (doc?.url && thumbnail) {
      renders.set(String(doc.id), { thumbnail, url: doc.url })
    }
  }
  return renders
}

/** A stored state as the Studio reads it; `null` when today's ranges no longer accept the recipe. */
function stateOf(
  effect: (id: unknown) => Effect,
  id: string,
  at: string,
  doc: Record<string, unknown>,
): null | PublishedState {
  try {
    // The stored snapshot is what the site draws. A version without one
    // resolves from the recipe.
    const snapshot =
      (doc.snapshot as null | Snapshot) ??
      snapshotRecipe(effect(doc[EFFECT_FIELD]), doc[RECIPE_FIELD])
    return {
      id,
      at,
      ground: lookGround(doc[GROUND_FIELD]),
      key: canonicalJSON(snapshot),
      poster: posterOf(doc[THUMBNAIL_FIELD]),
      recipe: doc[RECIPE_FIELD] as Recipe,
      renders: rendersOf(doc[STILL_MEDIA_FIELD]),
      stills: publishedStills(doc[STILLS_FIELD]),
    }
  } catch {
    return null
  }
}

async function load(id: string) {
  const source = sources.get(id)
  if (!source) {
    return
  }
  const { slug, api, effect } = source
  const versions = new URLSearchParams({
    depth: '1',
    limit: '30',
    sort: '-updatedAt',
    'where[parent][equals]': id,
    'where[version._status][equals]': 'published',
  })
  const get = (url: string) =>
    fetch(url, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null))
  const [live, history, usage] = await Promise.all([
    get(`${api}/${slug}/${id}?draft=false&depth=1`),
    get(`${api}/${slug}/versions?${versions}`),
    get(`${api}/${slug}/${id}/usage`),
  ])
  const states: PublishedState[] = []
  for (const row of history?.docs ?? []) {
    const state = stateOf(effect, String(row.id), row.updatedAt, row.version ?? {})
    // Revert to published writes the same state again; one row per state.
    if (state && states.at(-1)?.key !== state.key) {
      states.push(state)
    }
  }
  looks.set(id, {
    history: states,
    live: live?._status === 'published' ? stateOf(effect, 'live', live.updatedAt, live) : null,
    loaded: true,
    uses: usage?.usages ?? [],
  })
  for (const listener of listeners) {
    listener()
  }
}

/**
 * Reload every look on the page now. The Studio's pieces sit in separate
 * branches of Payload's form, so the one that published says so here and the
 * rest catch up.
 */
export const refreshStudio = () => {
  for (const id of mounted.keys()) {
    void load(id).catch(() => {})
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** What is published for a look, its published history and where it is used. One fetch per page, shared. */
export function useLook(id: number | string | undefined): LookState {
  const studio = useStudio()
  return useLookFrom(studio, id)
}

export function useLookFrom(studio: Studio, id: number | string | undefined): LookState {
  const key = id == null ? '' : String(id)
  const { api, effect, looksSlug } = studio
  useEffect(() => {
    if (!key) {
      return
    }
    sources.set(key, { slug: looksSlug, api, effect })
    const count = mounted.get(key) ?? 0
    mounted.set(key, count + 1)
    if (!count) {
      void load(key).catch(() => {})
    }
    return () => {
      const left = (mounted.get(key) ?? 1) - 1
      if (left) {
        mounted.set(key, left)
      } else {
        mounted.delete(key)
      }
    }
  }, [key, api, effect, looksSlug])
  return useSyncExternalStore(
    subscribe,
    () => looks.get(key) ?? EMPTY,
    () => EMPTY,
  )
}
