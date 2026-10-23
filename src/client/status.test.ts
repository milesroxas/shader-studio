import { describe, expect, it } from 'vitest'

import type { PublishedState } from './look-store.js'

import { canonicalJSON, emptyRecipe, snapshotRecipe } from '../core/recipe.js'
import { DEFAULT_STILL_USES, newStill } from '../core/stills.js'
import { washEffect } from '../effects/wash/index.js'
import { draftKey, draftState, lookMatches, stillStatus } from './status.js'

const E = washEffect
const recipe = emptyRecipe(E)
const preview = newStill(DEFAULT_STILL_USES, recipe, 'preview', 'abc123')
const published = (overrides: Partial<PublishedState> = {}): PublishedState => ({
  id: 'live',
  at: '2026-10-21T00:00:00Z',
  ground: {},
  key: canonicalJSON(snapshotRecipe(E, recipe)),
  poster: null,
  recipe,
  renders: new Map(),
  stills: [{ ...preview, hash: 'a'.repeat(64), media: 4 }],
  ...overrides,
})

const [key, spec] = Object.entries(E.parameters).find(
  ([, candidate]) => 'min' in candidate && !('vector' in candidate),
) as [string, { max: number; min: number }]

describe('the draft against what is published', () => {
  it('is unchanged when the recipe, the ground and every still are what the site has', () => {
    const state = draftState(E, recipe, {}, [preview], published())
    expect(state.unchanged).toBe(true)
    expect(state.unchangedLook).toBe(true)
    expect(state.stillsApart).toBe(0)
    expect(state.status(preview)).toBe('live')
  })

  it('re-renders every still when the look under it or its ground moves', () => {
    const moved = draftState(
      E,
      { ...recipe, deltas: { [key]: spec.min } },
      {},
      [preview],
      published(),
    )
    expect(moved.unchangedLook).toBe(false)
    expect(moved.stillsApart).toBe(0)
    expect(moved.status(preview)).toBe('changed')
    const grounded = draftState(E, recipe, { dark: '#000000' }, [preview], published())
    expect(grounded.unchangedLook).toBe(false)
    expect(grounded.status(preview)).toBe('changed')
  })

  it("counts a still's own change, and knows one the site has never seen", () => {
    const social = newStill(DEFAULT_STILL_USES, recipe, 'social', 'abc124')
    const state = draftState(E, recipe, {}, [{ ...preview, frame: 9 }, social], published())
    expect(state.unchanged).toBe(false)
    expect(state.stillsApart).toBe(2)
    expect(state.status({ ...preview, frame: 9 })).toBe('changed')
    expect(state.status(social)).toBe('new')
    expect(draftState(E, recipe, {}, [social], null).stillsApart).toBe(1)
  })

  it('reads an invalid recipe as not published', () => {
    const state = draftState(E, { ...recipe, deltas: { [key]: spec.max + 1 } }, {}, [], published())
    expect(state.key).toBeNull()
    expect(state.unchanged).toBe(false)
    expect(draftKey(E, { ...recipe, deltas: { nope: 1 } })).toBeNull()
  })

  it('matches a published state by key and ground', () => {
    const live = published({ ground: { light: '#ffffff' } })
    expect(lookMatches(live.key, { light: '#ffffff' }, live)).toBe(true)
    expect(lookMatches(live.key, {}, live)).toBe(false)
    expect(lookMatches(null, {}, live)).toBe(false)
    expect(lookMatches(live.key, {}, null)).toBe(false)
  })

  it('reads a still with no published counterpart as new', () => {
    expect(stillStatus(preview, null, true)).toBe('new')
    expect(stillStatus(preview, published(), false)).toBe('changed')
  })
})
