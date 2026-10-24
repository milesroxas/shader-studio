import type { Effect, Surface, Tuning } from '../core/effect.js'
import type { LookGround } from '../core/ground.js'

import { type CaptureOptions, POSTER_CAPTURE, type Recipe, snapshotRecipe } from '../core/recipe.js'
import {
  type Still,
  type StillUses,
  stillCapture,
  stillLabel,
  stillTuning,
} from '../core/stills.js'

/**
 * What the stage renders when it shows a still rather than the live look: the
 * poster pair (the recipe exactly, one face at a time, with alpha) or one of
 * the look's stills. One description serves the still preview, the contact
 * sheet and the publish, so a render is the same pixels wherever it is asked
 * for.
 */
export type Shot = {
  capture: CaptureOptions
  frame: number
  label: string
  seed: number
  /** The resolved tuning for a seed: the sheet renders other seeds of the same shot. */
  tuning: (seed: number) => Tuning
}

export function posterShot(effect: Effect, recipe: Recipe, surface: Surface): Shot {
  return {
    capture: { ...POSTER_CAPTURE, surface },
    frame: recipe.frame,
    label: 'Poster',
    seed: recipe.seed,
    tuning: (seed) => snapshotRecipe(effect, { ...recipe, seed })[surface],
  }
}

export function stillShot(uses: StillUses, effect: Effect, recipe: Recipe, still: Still): Shot {
  return {
    capture: stillCapture(still),
    frame: still.frame,
    label: stillLabel(uses, still),
    seed: still.seed,
    tuning: (seed) => stillTuning(effect, recipe, { ...still, seed }),
  }
}

/** The shot the stage shows for a selection, on the face the stage is set to. */
export const shotOf = (
  uses: StillUses,
  effect: Effect,
  recipe: Recipe,
  selection: 'poster' | Still,
  surface: Surface,
): Shot =>
  selection === 'poster'
    ? posterShot(effect, recipe, surface)
    : stillShot(uses, effect, recipe, selection)

/** The capture a sheet thumbnail is rendered at: the shot's own frame, at a fraction of its pixels. */
export const sheetCapture = (shot: Shot, scale: number): CaptureOptions => ({
  ...shot.capture,
  format: 'webp',
  scale,
})

/** Everything a shot's render depends on, for a preview to know when to render again. */
export const shotIdentity = (shot: Shot, ground: LookGround) =>
  JSON.stringify([shot.capture, shot.frame, shot.tuning(shot.seed), ground])
