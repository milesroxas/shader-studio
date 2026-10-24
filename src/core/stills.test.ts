import { describe, expect, it } from 'vitest'

import { washEffect } from '../effects/wash/index.js'
import { DEFAULT_GROUND } from './effect.js'
import { emptyRecipe } from './recipe.js'
import {
  CUSTOM_USE,
  DEFAULT_STILL_USES,
  isStillUse,
  newStill,
  newStillId,
  publishedStills,
  STILL_LIMIT,
  sameStill,
  siteStillUses,
  stillChanges,
  stillInputs,
  stillKey,
  stillLabel,
  stillUseIds,
  validateStills,
  withCustomUse,
} from './stills.js'

const E = washEffect
const USES = DEFAULT_STILL_USES
const recipe = emptyRecipe(E)
const preview = newStill(USES, recipe, 'preview', 'abc123')

describe('still uses', () => {
  it('always offers custom, after the configured uses', () => {
    expect(stillUseIds(USES).at(-1)).toBe(CUSTOM_USE)
    expect(withCustomUse({}).custom.label).toBe('Custom size')
    expect(isStillUse(USES, 'preview')).toBe(true)
    expect(isStillUse(USES, 'custom')).toBe(true)
    expect(isStillUse(USES, 'nope')).toBe(false)
  })

  it('serves the uses marked site', () => {
    expect(siteStillUses(USES)).toEqual(['preview'])
    expect(siteStillUses({})).toEqual([])
  })
})

describe('newStill', () => {
  it('starts at the use size, on the dark face, at the recipe seed and frame', () => {
    expect(preview).toEqual({
      id: 'abc123',
      deltas: {},
      format: 'webp',
      frame: recipe.frame,
      height: 630,
      scale: 1,
      seed: recipe.seed,
      surface: 'dark',
      transparent: false,
      use: 'preview',
      width: 1200,
    })
  })

  it('names a custom still and refuses an unknown use', () => {
    expect(newStill(USES, recipe, 'custom').label).toBe('Custom')
    expect(() => newStill(USES, recipe, 'nope')).toThrow('Unknown still use: nope.')
  })

  it('draws ids from the id alphabet', () => {
    for (let i = 0; i < 20; i++) {
      expect(newStillId()).toMatch(/^[a-z0-9]{8}$/)
    }
  })
})

describe('stillLabel', () => {
  it('reads a use by its label and a custom still by its own name', () => {
    expect(stillLabel(USES, preview)).toBe('Preview card')
    expect(stillLabel(USES, { ...newStill(USES, recipe, 'custom'), label: ' Banner ' })).toBe(
      'Banner',
    )
    expect(stillLabel(USES, { ...newStill(USES, recipe, 'custom'), label: '' })).toBe('Custom size')
  })
})

describe('validateStills', () => {
  it('reads nothing as no stills and passes outputs through', () => {
    expect(validateStills(USES, E, recipe, null)).toEqual([])
    expect(validateStills(USES, E, recipe, undefined)).toEqual([])
    const published = { ...preview, hash: 'a'.repeat(64), media: 4 }
    expect(validateStills(USES, E, recipe, [published])).toEqual([published])
  })

  it('refuses a list that is not one, too many stills, and bad shapes', () => {
    expect(() => validateStills(USES, E, recipe, {})).toThrow('Stills must be a list.')
    const many = Array.from({ length: STILL_LIMIT + 1 }, (_, i) =>
      newStill(USES, recipe, 'custom', `id${String(i).padStart(4, '0')}`),
    )
    expect(() => validateStills(USES, E, recipe, many)).toThrow(`up to ${STILL_LIMIT}`)
    expect(() => validateStills(USES, E, recipe, [{ ...preview, extra: 1 }])).toThrow(
      'Unknown still property: extra.',
    )
    expect(() => validateStills(USES, E, recipe, [{ ...preview, id: 'AB' }])).toThrow(
      'A still id is 6 to 12 lowercase letters and digits.',
    )
    expect(() => validateStills(USES, E, recipe, [{ ...preview, use: 'nope' }])).toThrow(
      'Unknown still use: nope.',
    )
    expect(() => validateStills(USES, E, recipe, [{ ...preview, surface: 'red' }])).toThrow(
      'dark or the light face',
    )
  })

  it('refuses two stills with one id and two of a single use', () => {
    expect(() => validateStills(USES, E, recipe, [preview, { ...preview }])).toThrow(
      'Two stills share the id abc123.',
    )
    const second = newStill(USES, recipe, 'preview', 'abc124')
    expect(() => validateStills(USES, E, recipe, [preview, second])).toThrow(
      'A look holds one Preview card still.',
    )
  })

  it('holds a fixed use to its size and fill, and a custom still to the capture rules', () => {
    expect(() => validateStills(USES, E, recipe, [{ ...preview, width: 1000 }])).toThrow(
      'A Preview card still is 1200 × 630.',
    )
    expect(() => validateStills(USES, E, recipe, [{ ...preview, transparent: true }])).toThrow(
      'A Preview card still is always filled.',
    )
    const custom = newStill(USES, recipe, 'custom', 'cust01')
    expect(validateStills(USES, E, recipe, [{ ...custom, transparent: true }])).toHaveLength(1)
    expect(() => validateStills(USES, E, recipe, [{ ...custom, width: 10 }])).toThrow('320 to 1920')
    expect(() =>
      validateStills(USES, E, recipe, [{ ...custom, format: 'jpeg', transparent: true }]),
    ).toThrow('JPEG requires a filled background.')
  })

  it('holds the seed and the frame to the recipe ranges', () => {
    expect(() => validateStills(USES, E, recipe, [{ ...preview, seed: -1 }])).toThrow(
      'A still seed must be',
    )
    expect(() => validateStills(USES, E, recipe, [{ ...preview, frame: 0 }])).toThrow(
      'A still frame must be',
    )
  })

  it('checks overrides against the effect', () => {
    expect(() => validateStills(USES, E, recipe, [{ ...preview, deltas: { nope: 1 } }])).toThrow(
      'Unsupported parameter: nope',
    )
    expect(() => validateStills(USES, E, recipe, [{ ...preview, deltas: [] }])).toThrow(
      'Still overrides must be an object.',
    )
  })
})

describe('stillKey', () => {
  it('changes with the ground only for a filled still', () => {
    const filled = stillKey(E, recipe, preview, {}, DEFAULT_GROUND)
    expect(stillKey(E, recipe, preview, { dark: '#000000' }, DEFAULT_GROUND)).not.toBe(filled)
    const custom = { ...newStill(USES, recipe, 'custom', 'cust01'), transparent: true }
    expect(stillKey(E, recipe, custom, { dark: '#000000' }, DEFAULT_GROUND)).toBe(
      stillKey(E, recipe, custom, {}, DEFAULT_GROUND),
    )
  })

  it('follows the face, the frame and the seed', () => {
    const key = stillKey(E, recipe, preview, {}, DEFAULT_GROUND)
    expect(stillKey(E, recipe, { ...preview, surface: 'light' }, {}, DEFAULT_GROUND)).not.toBe(key)
    expect(stillKey(E, recipe, { ...preview, frame: 9 }, {}, DEFAULT_GROUND)).not.toBe(key)
    if (E.seeded) {
      expect(stillKey(E, recipe, { ...preview, seed: 9 }, {}, DEFAULT_GROUND)).not.toBe(key)
    }
  })
})

describe('inputs and outputs', () => {
  const published = { ...preview, hash: 'a'.repeat(64), media: 4 }

  it('strips a published still to its inputs', () => {
    expect(stillInputs(published)).toEqual(preview)
  })

  it('keeps only rows with an output', () => {
    expect(publishedStills([preview, published, { media: 1 }])).toEqual([published])
    expect(publishedStills(null)).toEqual([])
    expect(publishedStills([{ ...published, media: 'abc' }])).toHaveLength(1)
  })

  it('compares stills by their inputs', () => {
    expect(sameStill(preview, published)).toBe(true)
    expect(sameStill(preview, { ...preview, frame: 9 })).toBe(false)
  })

  it('counts added, removed and changed stills', () => {
    const social = newStill(USES, recipe, 'social', 'abc124')
    expect(stillChanges([preview], [published])).toBe(0)
    expect(stillChanges([preview, social], [published])).toBe(1)
    expect(stillChanges([], [published])).toBe(1)
    expect(stillChanges([{ ...preview, frame: 9 }], [published])).toBe(1)
  })
})
