'use client'

import { useConfig } from '@payloadcms/ui'
import { createContext, type ReactNode, use, useEffect, useMemo } from 'react'
import { type Effect, type EffectRegistry, isEffectId } from '../core/index.js'
import type { StudioClientConfig } from '../options.js'
import { type StudioEffectDefinition, useEffectDefinitions } from './effects.js'

const ConfigContext = createContext<null | StudioClientConfig>(null)

/**
 * The plugin's configuration, as the admin's Studio components read it. The
 * plugin mounts this as an admin provider with the configuration in its
 * client props; nothing here is a host concern.
 */
export function StudioProvider({
  children,
  ...config
}: { children?: ReactNode } & StudioClientConfig) {
  // The props are plain data from the server; a new object each render is the same configuration.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the serialized configuration, not the object
  const value = useMemo(() => config, [JSON.stringify(config)])
  return <ConfigContext value={value}>{children}</ConfigContext>
}

/** Everything a Studio component needs of the configuration and the registered effects. */
export type Studio = {
  /** The admin route, for links to documents. */
  adminRoute: string
  /** The REST base, `${serverURL}${routes.api}`, for the look endpoints. */
  api: string
  /** The registered client definition for a stored effect id; unknown ids read as the default effect. */
  definition: (id: unknown) => StudioEffectDefinition
  definitions: Record<string, StudioEffectDefinition>
  /** The contract for a stored effect id; unknown ids read as the default effect. */
  effect: (id: unknown) => Effect
  registry: EffectRegistry
} & StudioClientConfig

export function useStudio(): Studio {
  const config = use(ConfigContext)
  const definitions = useEffectDefinitions()
  const {
    config: { routes, serverURL },
  } = useConfig()
  if (!config) {
    throw new Error(
      'shader-studio: no StudioProvider. Register shaderStudioPlugin() in payload.config.ts and regenerate the import map.',
    )
  }
  const missing = config.effectIds.filter((id) => !definitions[id])
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the joined ids, not the array
  useEffect(() => {
    if (missing.length) {
      // biome-ignore lint/suspicious/noConsole: a misconfiguration the admin cannot otherwise see
      console.error(
        `shader-studio: no client registration for effect${missing.length > 1 ? 's' : ''} ${missing.join(', ')}. Pass each effect's \`client\` path in the plugin options and regenerate the import map.`,
      )
    }
  }, [missing.join(',')])
  return useMemo(() => {
    const ids = config.effectIds.filter((id) => definitions[id])
    const effects: Record<string, Effect> = {}
    for (const id of ids) {
      effects[id] = definitions[id].contract
    }
    const registry: EffectRegistry = {
      defaultEffect: ids.includes(config.defaultEffect) ? config.defaultEffect : ids[0],
      effects,
      ids,
    }
    const definition = (id: unknown) =>
      definitions[isEffectId(registry, id) ? id : registry.defaultEffect]
    return {
      ...config,
      adminRoute: routes.admin,
      api: `${serverURL ?? ''}${routes.api}`,
      definition,
      definitions,
      effect: (id: unknown) => definition(id)?.contract,
      registry,
    }
  }, [config, definitions, routes.admin, routes.api, serverURL])
}
