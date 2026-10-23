import { APIError } from 'payload'
import { describe, expect, it } from 'vitest'

import type { Tuning } from './core/effect.js'

import { emptyRecipe, recipeFromSnapshot, snapshotRecipe } from './core/recipe.js'
import { washEffect } from './effects/wash/index.js'
import { recipeHash, stillHash, storedRecipeHash, studioInput } from './hash.js'

const E = washEffect
const [key, spec] = Object.entries(E.parameters).find(
  ([, candidate]) => 'min' in candidate && !('vector' in candidate),
) as [string, { max: number; min: number }]

describe('Studio release identity', () => {
  const recipe = { ...emptyRecipe(E), deltas: { [key]: spec.min } }

  it('hashes a recipe the same from the browser and from the database', () => {
    // jsonb returns keys by length, then bytewise: not the order the editor built.
    const stored = {
      deltas: { ...recipe.deltas },
      frame: recipe.frame,
      seed: recipe.seed,
      version: recipe.version,
    }
    expect(recipeHash(E, stored)).toBe(recipeHash(E, recipe))
    expect(recipeHash(E, recipe)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('gives a restored release the hash of the release, so republishing reuses it', () => {
    expect(recipeHash(E, recipeFromSnapshot(E, snapshotRecipe(E, recipe)))).toBe(
      recipeHash(E, recipe),
    )
    // A delta that restates the default is the same output, so the same release.
    expect(
      recipeHash(E, { ...emptyRecipe(E), deltas: { [key]: (E.defaults as Tuning)[key] } }),
    ).toBe(recipeHash(E, emptyRecipe(E)))
  })

  it('separates anything that changes the pixels', () => {
    expect(recipeHash(E, { ...recipe, frame: recipe.frame + 1 })).not.toBe(recipeHash(E, recipe))
    if (E.seeded) {
      expect(recipeHash(E, { ...recipe, seed: recipe.seed + 1 })).not.toBe(recipeHash(E, recipe))
    }
    expect(recipeHash(E, { ...recipe, deltas: { [key]: spec.max } })).not.toBe(
      recipeHash(E, recipe),
    )
  })

  it('reads a stored recipe today rejects as no hash, not an error', () => {
    const invalid = { ...emptyRecipe(E), deltas: { [key]: spec.max + 1 } }
    expect(storedRecipeHash(E, invalid)).toBeNull()
    expect(() => recipeHash(E, invalid)).toThrow(APIError)
  })

  it('hashes a still key as SHA-256', () => {
    expect(stillHash('{}')).toMatch(/^[a-f0-9]{64}$/)
    expect(stillHash('{}')).toBe(stillHash('{}'))
    expect(stillHash('{}')).not.toBe(stillHash('[]'))
  })

  it('turns a core validation into the 400 the API answers with', () => {
    expect(studioInput(() => 1)).toBe(1)
    try {
      studioInput(() => {
        throw new Error('Nope.')
      })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(APIError)
      expect((error as APIError).status).toBe(400)
      expect((error as Error).message).toBe('Nope.')
    }
  })
})
