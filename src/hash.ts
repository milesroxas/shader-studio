import { createHash } from 'node:crypto'
import { APIError } from 'payload'

import { canonicalJSON, type Effect, snapshotRecipe } from './core/index.js'

/**
 * The identity of what a recipe renders: the hash of its resolved snapshot in
 * canonical form. Recipes that resolve to the same snapshot are the same
 * release, however their JSON is ordered and whichever no-op deltas they hold.
 * The snapshot carries its renderer, so two effects never share a hash.
 */
export function recipeHash(effect: Effect, recipe: unknown): string {
  const snapshot = studioInput(() => snapshotRecipe(effect, recipe))
  return createHash('sha256').update(canonicalJSON(snapshot)).digest('hex')
}

/** The identity of a rendered still: the SHA-256 of its canonical key (`stillKey`). */
export const stillHash = (key: string) => createHash('sha256').update(key).digest('hex')

/** The hash of a stored recipe, or `null` when today's validation no longer accepts it. */
export function storedRecipeHash(effect: Effect, recipe: unknown): null | string {
  try {
    return recipeHash(effect, recipe)
  } catch {
    return null
  }
}

/** Runs a core validation and turns its message into the 400 the API answers with. */
export function studioInput<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    throw new APIError((error as Error).message, 400)
  }
}
