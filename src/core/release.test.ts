import { describe, expect, it } from 'vitest'

import { washEffect } from '../effects/wash/index.js'
import { emptyRecipe, snapshotRecipe } from './recipe.js'
import { isPosterSource, parseRelease } from './release.js'
import { DEFAULT_STILL_USES } from './stills.js'

const E = washEffect
const recipe = emptyRecipe(E)

const poster = (name: string) => ({
  filename: `${name}.webp`,
  height: 900,
  mimeType: 'image/webp',
  updatedAt: '2026-10-21T00:00:00Z',
  url: `/media/${name}.webp`,
  width: 1600,
})

const release = () => ({
  id: 1,
  ground: { dark: '#000000' },
  posters: { dark: poster('dark'), light: poster('light') },
  snapshot: snapshotRecipe(E, recipe),
  sourceHash: 'a'.repeat(64),
  stills: { preview: poster('preview'), social: poster('social') },
})

describe('isPosterSource', () => {
  it('needs a filed image with its size', () => {
    expect(isPosterSource(poster('x'))).toBe(true)
    expect(isPosterSource({ ...poster('x'), mimeType: 'video/mp4' })).toBe(false)
    expect(isPosterSource({ ...poster('x'), width: 0 })).toBe(false)
    expect(isPosterSource({ ...poster('x'), url: undefined })).toBe(false)
    expect(isPosterSource(null)).toBe(false)
  })
})

describe('parseRelease', () => {
  it('reads a well-formed release, with the ground as a look ground', () => {
    const parsed = parseRelease(E, release())
    expect(parsed).not.toBeNull()
    expect(parsed?.id).toBe(1)
    expect(parsed?.ground).toEqual({ dark: '#000000' })
    expect(parsed?.posters.light.url).toBe('/media/light.webp')
    expect(parsed?.snapshot.renderer).toBe(E.renderer)
  })

  it('serves every still it was given without a use table, and only site uses with one', () => {
    expect(Object.keys(parseRelease(E, release())?.stills ?? {})).toEqual(['preview', 'social'])
    expect(
      Object.keys(parseRelease(E, release(), { stillUses: DEFAULT_STILL_USES })?.stills ?? {}),
    ).toEqual(['preview'])
    const { stills: _stills, ...bare } = release()
    expect(parseRelease(E, bare)).not.toHaveProperty('stills')
  })

  it('leaves out a still that does not parse but keeps the release', () => {
    const parsed = parseRelease(E, {
      ...release(),
      stills: { preview: { url: '/x' }, social: poster('social') },
    })
    expect(parsed).not.toBeNull()
    expect(Object.keys(parsed?.stills ?? {})).toEqual(['social'])
  })

  it('refuses a release from another renderer, a bad hash or a missing poster', () => {
    const base = release()
    expect(parseRelease(E, { ...base, snapshot: { ...base.snapshot, renderer: 'other' } })).toBe(
      null,
    )
    expect(parseRelease(E, { ...base, sourceHash: 'nope' })).toBe(null)
    expect(parseRelease(E, { ...base, posters: { dark: poster('dark') } })).toBe(null)
    expect(parseRelease(E, { ...base, id: null })).toBe(null)
    expect(parseRelease(E, null)).toBe(null)
  })

  it('refuses a snapshot missing a knob or with a frame out of range', () => {
    const base = release()
    const [key] = Object.keys(E.defaults)
    const dark = { ...base.snapshot.dark } as Record<string, unknown>
    delete dark[key]
    expect(parseRelease(E, { ...base, snapshot: { ...base.snapshot, dark } })).toBe(null)
    expect(parseRelease(E, { ...base, snapshot: { ...base.snapshot, frame: 0 } })).toBe(null)
  })

  it('accepts a string id, as a document database stores it', () => {
    expect(parseRelease(E, { ...release(), id: 'abc' })?.id).toBe('abc')
  })
})
