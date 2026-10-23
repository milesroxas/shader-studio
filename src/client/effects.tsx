'use client'

import { type ComponentType, createContext, type ReactNode, use, useMemo } from 'react'

import type { EffectCopy } from '../core/copy.js'
import type { EffectContract, Tuning } from '../core/effect.js'
import type { EffectScene } from './scenes.js'

/**
 * An effect as the admin draws it: the same contract the server validates
 * with, the copy the Inspector reads it with, and the scenes that render it.
 * `scenes` is a loader because it imports Three, which the admin should fetch
 * only when a Studio opens.
 */
export type StudioEffectDefinition<T extends Tuning = Tuning> = {
  contract: EffectContract<T>
  copy: EffectCopy<T>
  scenes: () => Promise<EffectScene>
}

type Definitions = Record<string, StudioEffectDefinition>

const EffectsContext = createContext<Definitions>({})

export type StudioEffectComponent = ComponentType<{ children?: ReactNode }>

/**
 * Register an effect with the admin. The result is a React component the
 * plugin mounts as an admin provider: pass its import path as the effect's
 * `client` in the plugin options, and export it from a `'use client'` module.
 *
 * ```tsx
 * 'use client'
 * export const WashEffect = defineStudioEffect({
 *   contract: washContract,
 *   copy: washCopy,
 *   scenes: () => import('./wash.scenes.js'),
 * })
 * ```
 */
export function defineStudioEffect<T extends Tuning>(
  definition: StudioEffectDefinition<T>,
): StudioEffectComponent {
  const erased = definition as unknown as StudioEffectDefinition
  const { id } = definition.contract
  const Effect: StudioEffectComponent = ({ children }) => {
    const prior = use(EffectsContext)
    const value = useMemo(() => ({ ...prior, [id]: erased }), [prior])
    return <EffectsContext value={value}>{children}</EffectsContext>
  }
  Effect.displayName = `StudioEffect(${id})`
  return Effect
}

/** Every effect registered on the client, by id. */
export const useEffectDefinitions = (): Definitions => use(EffectsContext)

const scenesCache = new WeakMap<StudioEffectDefinition, Promise<EffectScene>>()

/** The scenes of an effect, loaded once per page. */
export function loadScenes(definition: StudioEffectDefinition): Promise<EffectScene> {
  let loading = scenesCache.get(definition)
  if (!loading) {
    loading = definition.scenes().then((module) => {
      // A module namespace (`import('./scenes')`) or a plain object both answer.
      const scene = module as { default?: EffectScene } & EffectScene
      return scene.Capture && scene.Live ? scene : (scene.default as EffectScene)
    })
    scenesCache.set(definition, loading)
  }
  return loading
}
