import type { Dependency, EffectCopy, ParameterCopy } from '../../core/copy.js'
import type { BlendMode, EffectContract, EffectLook, Surface } from '../../core/effect.js'

import { color, options, range, unit, vector } from '../../core/effect.js'

/**
 * Wash: a slow, seeded, layered-noise colour wash. One full-screen quad, one
 * fragment shader: a warped fBm field mapped through a three-stop gradient,
 * drifting in a direction of the author's choosing. The effect the package
 * ships so a host, the dev app and the tests have a working one out of the box.
 *
 * This module is pure: the contract and its copy. The scenes that draw it
 * live in `./scenes.tsx` and are registered on the client in `./client.tsx`.
 */

/** Every knob of a wash, resolved: the authorable ones (`parameters`) and the code-owned ones. */
export type WashTuning = {
  /** How the frame meets the ground. The light face derives `multiply`. */
  blendMode: 'multiply' | 'normal' | 'plus-lighter' | 'screen'
  colorA: [number, number, number]
  colorB: [number, number, number]
  colorC: [number, number, number]
  contrast: number
  /** Code-owned: the canvas's device pixel ratio cap, set by the placement. */
  dpr: number
  /** Where the field slides, as a direction. */
  drift: [number, number]
  grain: number
  /** Code-owned: fBm layers, set by the placement. */
  octaves: number
  opacity: number
  scale: number
  /** Lays the field out; the contract is seeded, so a recipe's seed lands here. */
  seed: number
  speed: number
  vignette: number
  warp: number
  warpScale: number
}

export const WASH_DEFAULTS: WashTuning = {
  blendMode: 'normal',
  colorA: [0.09, 0.07, 0.2],
  colorB: [0.55, 0.25, 0.45],
  colorC: [0.98, 0.62, 0.38],
  contrast: 1,
  dpr: 1.5,
  drift: [0.3, 0.1],
  grain: 0.04,
  octaves: 4,
  opacity: 1,
  scale: 1.2,
  seed: 1,
  speed: 0.4,
  vignette: 0.6,
  warp: 0.5,
  warpScale: 1.5,
}

const DPR_CAPS: Record<string, number> = { block: 1, card: 1, hero: 1.5 }
const OCTAVE_CAPS: Record<string, number> = { block: 3, card: 2, hero: 4 }

/** Blend modes an author may choose; `multiply` is the light face's, derived and never authored. */
const BLEND_MODES = ['normal', 'screen', 'plus-lighter'] as const
const PAPER_BLEND: WashTuning['blendMode'] = 'multiply'
/** How far each colour is lifted toward white on the light face. */
const PAPER_LIFT = 0.55

const lift = (rgb: readonly number[]): [number, number, number] =>
  [0, 1, 2].map((i) => rgb[i] + (1 - rgb[i]) * PAPER_LIFT) as [number, number, number]

/**
 * The paper face: the same wash read as ink on a light ground. Every colour
 * lifts toward white and the frame multiplies into the ground, so dark stays
 * dark where the field is dense and the paper shows through where it is thin.
 */
const paperFace = (tuning: WashTuning): WashTuning => ({
  ...tuning,
  blendMode: PAPER_BLEND,
  colorA: lift(tuning.colorA),
  colorB: lift(tuning.colorB),
  colorC: lift(tuning.colorC),
})

const look = <T extends EffectLook<WashTuning>>(value: T) => value

export const washEffect = {
  id: 'wash',
  blend: (tuning: WashTuning): BlendMode => tuning.blendMode,
  budget: (limited: WashTuning, requested: WashTuning, placement: string) => {
    const capped = limited.octaves < requested.octaves
    return {
      capped,
      text: `${limited.octaves} octaves${capped ? ` of ${requested.octaves}, capped to the ${placement} budget` : ''} · DPR ≤ ${limited.dpr}`,
    }
  },
  defaults: WASH_DEFAULTS,
  face: (tuning: WashTuning, surface: Surface): WashTuning =>
    surface === 'light' ? paperFace(tuning) : tuning,
  fallbackLook: 'dusk',
  label: 'Wash',
  limit: (tuning: WashTuning, placement: string): WashTuning => ({
    ...tuning,
    dpr: Math.max(1, Math.min(tuning.dpr, DPR_CAPS[placement] ?? 1)),
    octaves: Math.max(1, Math.min(Math.round(tuning.octaves), OCTAVE_CAPS[placement] ?? 2)),
  }),
  // Table order is the order the Studio lists starters and rows in.
  looks: {
    dusk: look({
      description: 'Indigo into plum into apricot, drifting right. The default wash.',
      id: 'dusk',
      label: 'Dusk',
      tuning: {},
    }),
    sea: look({
      description: 'Deep navy through teal to foam, slow and cool.',
      id: 'sea',
      label: 'Sea',
      tuning: {
        colorA: [0.02, 0.08, 0.2],
        colorB: [0.08, 0.45, 0.55],
        colorC: [0.75, 0.92, 0.9],
        drift: [-0.2, 0.25],
        speed: 0.25,
        warp: 0.7,
      },
    }),
    ember: look({
      description: 'Char through ember to flame, a fast warm pull upward.',
      id: 'ember',
      label: 'Ember',
      tuning: {
        colorA: [0.08, 0.02, 0.02],
        colorB: [0.72, 0.18, 0.06],
        colorC: [1, 0.78, 0.3],
        contrast: 1.4,
        drift: [0, 0.6],
        grain: 0.08,
        speed: 0.8,
      },
    }),
  },
  lookTag: () => 'drift',
  parameters: {
    scale: range('Field', 0.3, 4, 0.05),
    warp: unit('Field'),
    warpScale: range('Field', 0.2, 6, 0.05),
    speed: range('Motion', 0, 2),
    drift: vector('Motion', 2, -1, 1, 0.05),
    colorA: color('Color'),
    colorB: color('Color'),
    colorC: color('Color'),
    contrast: range('Color', 0.2, 3, 0.05),
    blendMode: { ...options('Color', BLEND_MODES), derived: [PAPER_BLEND] },
    grain: range('Finish', 0, 0.3, 0.005),
    vignette: range('Finish', 0, 2),
    opacity: unit('Finish'),
  },
  placements: ['hero', 'block', 'card'],
  renderer: 'wash-1',
  seeded: true,
} as const satisfies EffectContract<WashTuning>

export type WashParameterKey = keyof typeof washEffect.parameters

type WashDependency = Dependency<WashTuning>

// Rows read in the contract's order.
const PARAMETERS: Record<WashParameterKey, ParameterCopy> = {
  scale: {
    description:
      'Size of one feature of the field. Lower is broader swells, higher is finer cloud.',
    label: 'Scale',
  },
  warp: {
    description: 'How much the field folds into itself. 0 is a plain gradient cloud.',
    label: 'Warp',
  },
  warpScale: {
    description: 'Size of the folds. Higher is tighter and more turbulent.',
    label: 'Warp scale',
  },
  speed: {
    description: 'How fast the field evolves. 0 freezes it.',
    label: 'Speed',
  },
  drift: {
    description: 'X and Y of the direction the whole field slides in, in field units per second.',
    label: 'Drift',
  },
  colorA: {
    description: 'The colour where the field is lowest: the shadow of the wash.',
    label: 'Low',
  },
  colorB: {
    description: 'The colour through the middle of the field.',
    label: 'Mid',
  },
  colorC: {
    description: 'The colour where the field is highest: the highlight of the wash.',
    label: 'High',
  },
  contrast: {
    description:
      'Steepness of the gradient around its middle. Above 1 pushes the field to its ends.',
    label: 'Contrast',
  },
  blendMode: {
    description:
      'How the frame meets a dark ground. A light ground always multiplies: that face is derived.',
    label: 'Blend',
    optionLabels: { 'plus-lighter': 'Plus lighter' },
    options: {
      normal: 'Painted over the ground, with the opacity set below.',
      'plus-lighter': 'Straight addition. The brightest, and the one that clips first.',
      screen: 'Addition that eases off toward white, so highlights roll off instead of clipping.',
    },
  },
  grain: {
    description: 'Film grain over the whole frame.',
    label: 'Grain',
  },
  vignette: {
    description: 'Darkens the corners of the frame.',
    label: 'Vignette',
  },
  opacity: {
    description: 'How solid the wash is over the ground. Below 1 the ground shows through.',
    label: 'Opacity',
  },
}

const DEPENDENCIES: Partial<Record<WashParameterKey, WashDependency>> = {
  drift: {
    active: (t) => t.speed > 0,
    fix: { speed: WASH_DEFAULTS.speed },
    fixLabel: 'Set the speed',
    reason: 'Runs when Speed is above 0.',
  },
  warpScale: {
    active: (t) => t.warp > 0,
    fix: { warp: WASH_DEFAULTS.warp },
    fixLabel: 'Add the warp',
    reason: 'Runs when Warp is above 0.',
  },
}

const optionText = (key: WashParameterKey, value: string) =>
  PARAMETERS[key].optionLabels?.[value] ?? value.replace(/^./, (c) => c.toUpperCase())

export const washCopy: EffectCopy<WashTuning, WashParameterKey> = {
  dependencies: DEPENDENCIES,
  noun: 'wash',
  parameters: PARAMETERS,
  summary(group, tuning) {
    switch (group) {
      case 'Color':
        return { swatches: [tuning.colorA, tuning.colorB, tuning.colorC] }
      case 'Field':
        return `scale ${tuning.scale} · warp ${tuning.warp}`
      case 'Finish':
        return `${optionText('blendMode', tuning.blendMode)} · grain ${tuning.grain}`
      case 'Motion':
        return tuning.speed === 0 ? 'still' : `× ${tuning.speed}`
      default:
        return ''
    }
  },
  title: 'Wash Studio',
}
