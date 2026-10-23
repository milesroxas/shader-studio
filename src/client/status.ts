import type { Effect } from '../core/effect.js'
import type { PublishedState } from './look-store.js'

import { type LookGround, sameGround } from '../core/ground.js'
import { canonicalJSON, type Recipe, snapshotRecipe } from '../core/recipe.js'
import { sameStill, type Still, stillChanges } from '../core/stills.js'

/**
 * The draft read against what is published, for every piece of the Studio
 * that says so: the stage header, the Stills list, the Publish button and
 * the publish itself, which renders only what this says has changed.
 */

/** The draft's snapshot key, or nothing while the recipe is refused. */
export function draftKey(effect: Effect, recipe: Recipe): null | string {
  try {
    return canonicalJSON(snapshotRecipe(effect, recipe))
  } catch {
    return null
  }
}

/** Whether the look's pixels, posters included, are what is published: the recipe and the ground. */
export const lookMatches = (
  key: null | string,
  ground: LookGround,
  state: null | PublishedState | undefined,
): state is PublishedState =>
  Boolean(state && key && state.key === key && sameGround(state.ground, ground))

/**
 * Where a still stands: `live` is on the site as the draft has it, `changed`
 * is published but will re-render on publish (its own settings, the recipe
 * under it or the ground it is laid on moved), `new` was never published.
 */
export type StillStatus = 'changed' | 'live' | 'new'

export function stillStatus(
  still: Still,
  live: null | PublishedState,
  unchangedLook: boolean,
): StillStatus {
  const published = live?.stills.find((candidate) => candidate.id === still.id)
  if (!published) {
    return 'new'
  }
  return unchangedLook && sameStill(published, still) ? 'live' : 'changed'
}

/** The whole draft against what is published: identical, or how many settings apart. */
export function draftState(
  effect: Effect,
  recipe: Recipe,
  ground: LookGround,
  stills: Still[],
  live: null | PublishedState,
) {
  const key = draftKey(effect, recipe)
  const unchangedLook = lookMatches(key, ground, live)
  const stillsApart = live ? stillChanges(stills, live.stills) : stills.length
  return {
    key,
    status: (still: Still) => stillStatus(still, live, unchangedLook),
    stillsApart,
    unchanged: unchangedLook && stillsApart === 0,
    unchangedLook,
  }
}
