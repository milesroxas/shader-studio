'use client'

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'

import type { Surface } from '../core/effect.js'
import type { Recipe } from '../core/recipe.js'
import { snapshotRecipe } from '../core/recipe.js'
import type { StudioEffectDefinition } from './effects.js'
import { loadScenes } from './effects.js'
import { usePrefersReducedMotion } from './hooks/use-prefers-reduced-motion.js'
import type { EffectScene } from './scenes.js'
import type { PreviewLayout } from './store.js'

type StudioPreviewProps = {
  effect: StudioEffectDefinition
  generation: number
  /** The colour under the effect: the look's own ground for this face, else the Studio's. */
  ground: string
  layout?: PreviewLayout
  /** Whether the placement ever runs live; a static one shows the first frame. */
  live: boolean
  paused: boolean
  placement: string
  recipe: Recipe
  surface: Surface
}

const COPY_BASE: CSSProperties = {
  pointerEvents: 'none',
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 1,
}

const LAYOUTS: Record<PreviewLayout, { copy?: CSSProperties; shader: CSSProperties }> = {
  background: {
    copy: { ...COPY_BASE, left: '8%', maxWidth: '60%' },
    shader: { inset: 0 },
  },
  content: {
    copy: { ...COPY_BASE, left: '6%', width: '36%' },
    shader: { borderRadius: 8, inset: '32px 32px 32px 48%', overflow: 'hidden' },
  },
  shader: { shader: { inset: 0 } },
}

const stageStyle = (surface: Surface, ground: string): CSSProperties => ({
  background: ground,
  color: surface === 'dark' ? 'white' : '#111',
  height: '100%',
  isolation: 'isolate',
  minHeight: 300,
  position: 'relative',
  width: '100%',
})

const SLOW_MESSAGE =
  'Preview stopped because this device could not keep up. Reduce detail or density.'

/** The scenes of an effect, once they have loaded. */
export function useEffectScenes(effect: StudioEffectDefinition): EffectScene | null {
  const [scenes, setScenes] = useState<EffectScene | null>(null)
  useEffect(() => {
    let cancelled = false
    setScenes(null)
    void loadScenes(effect).then((loaded) => {
      if (!cancelled) {
        setScenes(loaded)
      }
    })
    return () => {
      cancelled = true
    }
  }, [effect])
  return scenes
}

/** The Studio's stage: a look's draft, live, on a ground, at a placement's budget. */
export function StudioPreview({
  effect,
  generation,
  ground,
  layout = 'shader',
  live,
  paused,
  placement,
  recipe,
  surface,
}: StudioPreviewProps) {
  const root = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const { contract } = effect
  const scenes = useEffectScenes(effect)
  const tuning = useMemo(
    () => contract.limit(snapshotRecipe(contract, recipe)[surface], placement),
    [contract, recipe, surface, placement],
  )
  const blend = contract.blend?.(tuning)
  const { copy, shader } = LAYOUTS[layout]

  return (
    <div ref={root} style={stageStyle(surface, ground)}>
      {error ? (
        <p role="alert">{error}</p>
      ) : scenes ? (
        <div style={{ ...shader, mixBlendMode: blend, position: 'absolute' }}>
          <scenes.Live
            active={!ready || (!paused && !reducedMotion && live)}
            generation={generation}
            onFailure={(reason) => setError(`Preview stopped: ${reason}.`)}
            onReady={() => setReady(true)}
            onSlow={() => setError(SLOW_MESSAGE)}
            rootRef={root}
            tuning={tuning}
          />
        </div>
      ) : null}
      {copy && (
        <div style={copy}>
          <strong style={{ display: 'block', fontSize: 32, lineHeight: 1.1 }}>
            Your next visual.
          </strong>
          <p style={{ marginTop: 12, opacity: 0.8 }}>
            A short description, to check how the look reads with real content.
          </p>
        </div>
      )}
    </div>
  )
}
