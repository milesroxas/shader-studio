import type { CSSProperties } from 'react'

import { type StudioGround, SURFACES, type Surface } from './effect.js'

/**
 * A look's own ground: the colour painted under the effect on each face, as
 * `#rrggbb`. It rides on the look beside the recipe, not inside it, so it is
 * never part of a snapshot or its hash: the posters stay transparent and the
 * frame that shows them paints the colour, on the site and in the Studio
 * alike. A face left out keeps the ground the slot lands on.
 */
export type LookGround = Partial<Record<Surface, string>>

const GROUND_HEX = /^#[0-9a-f]{6}$/i

export const isGroundHex = (value: unknown): value is string =>
  typeof value === 'string' && GROUND_HEX.test(value)

/** The validation message the admin and the API answer a bad face with. */
export const GROUND_HEX_MESSAGE = 'Use a six-digit hex colour, like #0a0a0a.'

/**
 * The ground stored on a look, as everything reads it: a valid face is kept,
 * lowercased; an empty, missing or malformed one is dropped. Never throws.
 */
export function lookGround(raw: unknown): LookGround {
  const ground: LookGround = {}
  if (!raw || typeof raw !== 'object') {
    return ground
  }
  for (const surface of SURFACES) {
    const value = (raw as Record<string, unknown>)[surface]
    if (isGroundHex(value)) {
      ground[surface] = value.toLowerCase()
    }
  }
  return ground
}

export const hasGround = (ground: LookGround | undefined): ground is LookGround =>
  Boolean(ground && (ground.dark || ground.light))

export const sameGround = (a: LookGround | undefined, b: LookGround | undefined) =>
  SURFACES.every((surface) => (a?.[surface] ?? null) === (b?.[surface] ?? null))

/** The colour the Studio paints and an export is flattened onto: the look's own face, else the Studio's ground. */
export const studioGround = (
  ground: LookGround | undefined,
  surface: Surface,
  defaults: StudioGround,
): string => ground?.[surface] ?? defaults[surface]

/**
 * What a slot's frame carries for a stylesheet: one custom property per face
 * the look sets, and `data-visual-ground` so a rule can apply. A frame with no
 * ground of its own gets nothing.
 */
export function groundAttributes(ground: LookGround | undefined): {
  'data-visual-ground'?: ''
  style?: CSSProperties
} {
  if (!hasGround(ground)) {
    return {}
  }
  return {
    'data-visual-ground': '',
    style: {
      '--visual-ground-dark': ground.dark,
      '--visual-ground-light': ground.light,
    } as CSSProperties,
  }
}
