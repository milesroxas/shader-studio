import { describe, expect, it } from 'vitest'

import { washEffect } from '../effects/wash/index.js'
import { type Effect, type RangeParameter, type Tuning, widestPlacement } from './effect.js'
import {
  canonicalJSON,
  emptyRecipe,
  FRAME_MAX,
  recipeFromSnapshot,
  resolveRecipeTuning,
  SEED_MAX,
  snapshotChanges,
  snapshotRecipe,
  starterRecipe,
  validateCapture,
  validateRecipe,
} from './recipe.js'
import { resolveTuning } from './resolve-tuning.js'

const E = washEffect
const base = emptyRecipe(E)

/** The first range parameter of the effect, with its spec, for out-of-range checks. */
const rangeParameter = () => {
  const entry = Object.entries(E.parameters).find(
    ([, spec]) => 'min' in spec && !('vector' in spec),
  )
  if (!entry) {
    throw new Error('The wash effect has no range parameter.')
  }
  return [entry[0], entry[1] as RangeParameter] as const
}

describe('emptyRecipe', () => {
  it('starts at the defaults: version 1, the default seed, no deltas, frame 150', () => {
    expect(base).toEqual({
      deltas: {},
      frame: 150,
      seed: E.seeded ? Number(E.defaults.seed) : 0,
      version: 1,
    })
  })
})

describe('validateRecipe', () => {
  it('accepts a bare recipe and returns it', () => {
    expect(validateRecipe(E, base)).toEqual(base)
  })

  it('refuses anything that is not an object', () => {
    expect(() => validateRecipe(E, null)).toThrow('A recipe is required.')
    expect(() => validateRecipe(E, [])).toThrow('A recipe is required.')
  })

  it('refuses unknown properties and other versions', () => {
    expect(() => validateRecipe(E, { ...base, extra: 1 })).toThrow('Unknown recipe property.')
    expect(() => validateRecipe(E, { ...base, version: 2 })).toThrow('Unsupported recipe version')
  })

  it('holds the seed and the frame to their ranges', () => {
    expect(() => validateRecipe(E, { ...base, seed: -1 })).toThrow('Seed must be')
    expect(() => validateRecipe(E, { ...base, seed: SEED_MAX + 1 })).toThrow('Seed must be')
    expect(() => validateRecipe(E, { ...base, seed: 1.5 })).toThrow('Seed must be')
    expect(() => validateRecipe(E, { ...base, frame: 0 })).toThrow('Capture frame')
    expect(() => validateRecipe(E, { ...base, frame: FRAME_MAX + 1 })).toThrow('Capture frame')
  })

  it('refuses deltas that are not an object, unknown parameters and values out of range', () => {
    expect(() => validateRecipe(E, { ...base, deltas: [] })).toThrow(
      'Recipe deltas must be an object.',
    )
    expect(() => validateRecipe(E, { ...base, deltas: { nope: 1 } })).toThrow(
      'Unsupported parameter: nope',
    )
    const [key, spec] = rangeParameter()
    expect(() => validateRecipe(E, { ...base, deltas: { [key]: spec.max + 1 } })).toThrow(
      `${key} must be between`,
    )
    expect(() => validateRecipe(E, { ...base, deltas: { [key]: 'x' } })).toThrow(
      `${key} must be between`,
    )
  })
})

describe('snapshotRecipe', () => {
  it('stamps the renderer and the frame, and resolves a face per ground', () => {
    const snapshot = snapshotRecipe(E, base)
    expect(snapshot.renderer).toBe(E.renderer)
    expect(snapshot.frame).toBe(base.frame)
    for (const key of Object.keys(E.defaults)) {
      expect(snapshot.dark).toHaveProperty(key)
      expect(snapshot.light).toHaveProperty(key)
    }
  })

  it('caps each face at the widest placement', () => {
    const [key, spec] = rangeParameter()
    const recipe = { ...base, deltas: { [key]: spec.max } }
    const snapshot = snapshotRecipe(E, recipe)
    const tuning = resolveRecipeTuning(E, recipe)
    const widest = widestPlacement(E)
    expect(widest).toBe(E.placements[0])
    expect(snapshot.dark).toEqual(E.limit(E.face(tuning, 'dark'), widest))
    expect(snapshot.light).toEqual(E.limit(E.face(tuning, 'light'), widest))
  })

  it('throws for a recipe it cannot validate', () => {
    expect(() => snapshotRecipe(E, { ...base, deltas: { nope: 1 } })).toThrow()
  })
})

describe('recipeFromSnapshot', () => {
  it('reads a release back as a recipe that resolves to the same snapshot', () => {
    const [key, spec] = rangeParameter()
    const recipe = { ...base, deltas: { [key]: spec.min }, frame: 42, seed: 7 }
    const snapshot = snapshotRecipe(E, recipe)
    const restored = recipeFromSnapshot(E, snapshot)
    expect(restored.frame).toBe(42)
    if (E.seeded) {
      expect(restored.seed).toBe(7)
    }
    expect(canonicalJSON(snapshotRecipe(E, restored))).toBe(canonicalJSON(snapshot))
  })
})

describe('starterRecipe', () => {
  it('turns a shipped look into delta-only tuning against the defaults', () => {
    for (const look of Object.keys(E.looks)) {
      const starter = starterRecipe(E, look)
      expect(resolveRecipeTuning(E, starter)).toEqual(
        resolveTuning(E.defaults, { ...(E as Effect).looks[look].tuning }),
      )
      for (const [key, value] of Object.entries(starter.deltas)) {
        expect(value).not.toEqual((E.defaults as Tuning)[key])
      }
    }
  })

  it('reads an unknown look as the effect with no deltas', () => {
    expect(starterRecipe(E, 'nope').deltas).toEqual({})
  })
})

describe('snapshotChanges', () => {
  it('is zero for the same release however the recipe is written', () => {
    const a = snapshotRecipe(E, base)
    const b = snapshotRecipe(E, { ...base, deltas: {} })
    expect(snapshotChanges(a, b)).toBe(0)
  })

  it('counts the frame and each dark-ground value that moved', () => {
    const [key, spec] = rangeParameter()
    const a = snapshotRecipe(E, base)
    expect(snapshotChanges(a, snapshotRecipe(E, { ...base, frame: base.frame + 1 }))).toBe(1)
    const moved = snapshotRecipe(E, { ...base, deltas: { [key]: spec.min } })
    expect(snapshotChanges(a, moved)).toBeGreaterThanOrEqual(1)
  })
})

describe('validateCapture', () => {
  const capture = {
    format: 'webp',
    height: 630,
    scale: 1,
    surface: 'dark',
    transparent: false,
    width: 1200,
  }

  it('returns only the capture fields', () => {
    expect(validateCapture({ ...capture, extra: true })).toEqual(capture)
  })

  it('holds the frame to its sides, scales and pixel budget', () => {
    expect(() => validateCapture({ ...capture, width: 100 })).toThrow('320 to 1920')
    expect(() => validateCapture({ ...capture, scale: 3 })).toThrow('320 to 1920')
    expect(() => validateCapture({ ...capture, height: 1920, scale: 2, width: 1920 })).toThrow(
      'megapixels',
    )
  })

  it('refuses a transparent JPEG and unknown faces', () => {
    expect(() => validateCapture({ ...capture, format: 'jpeg', transparent: true })).toThrow(
      'JPEG requires a filled background.',
    )
    expect(() => validateCapture({ ...capture, surface: 'red' })).toThrow(
      'Invalid capture format or surface.',
    )
  })
})
