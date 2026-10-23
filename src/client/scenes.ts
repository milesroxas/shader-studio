import type { ComponentType, RefObject } from 'react'

import type { Tuning } from '../core/effect.js'

/**
 * The part of an effect its contract cannot hold: the scenes that draw it.
 * Both are React Three Fiber scene graphs rendered inside a `Canvas` the
 * Studio owns. `Capture` is stepped a fixed 1/60 s per frame with neutral
 * input, mounted in an offscreen canvas so a still can be read back exactly;
 * `Live` is the effect's production runtime, for the stage.
 */

export type CaptureSceneProps = {
  onError: (message: string) => void
  /** The element around the canvas, for scenes that size or listen on it. */
  rootRef: RefObject<HTMLElement | null>
  /** Resolved for the face being captured and capped at the widest placement. */
  tuning: Tuning
}

/** What the Studio's stage hands a live effect, whichever one it is. */
export type LiveSceneProps = {
  /** Whether to run: off while paused, under reduced motion, or at a static placement. */
  active: boolean
  /** Bumped to restart from frame zero. */
  generation: number
  onFailure: (reason: string) => void
  onReady: () => void
  /** Sustained long frames, from an effect that watches for them. */
  onSlow: () => void
  rootRef: RefObject<HTMLElement | null>
  /** Resolved for the stage's face and capped at the stage's placement. */
  tuning: Tuning
}

export type EffectScene = {
  /** Mounted inside an R3F `Canvas` with `frameloop="never"`: draw from `tuning`, advance by the delta `useFrame` hands you. */
  Capture: ComponentType<CaptureSceneProps>
  /** Renders its own `Canvas` into `rootRef`'s box: the effect as it runs on a page. */
  Live: ComponentType<LiveSceneProps>
}

/** One frame of a capture, in seconds. Scenes may read it to step deterministically. */
export const CAPTURE_DELTA = 1 / 60
