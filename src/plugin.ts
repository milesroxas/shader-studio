import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
  Config,
  Plugin,
} from 'payload'

import { createLooksCollection } from './collection.js'
import { collectionHydration, globalHydration } from './hydrate.js'
import { protectRender } from './media.js'
import {
  clientConfigOf,
  type ResolvedStudioConfig,
  resolveStudioConfig,
  type ShaderStudioPluginConfig,
} from './options.js'
import { component } from './paths.js'

const schemaOnly = ({ endpoints: _endpoints, hooks: _hooks, ...collection }: CollectionConfig) =>
  collection

/**
 * The Studio: the looks collection, the hydration of every visual slot that
 * uses one, the guard on the renders a published look owns, and the admin
 * components that author and publish a look. Payload's plugin shape: options
 * in, a function of the config out, every existing hook kept.
 */
export const shaderStudioPlugin =
  (options: ShaderStudioPluginConfig): Plugin =>
  (incoming: Config): Config => {
    const config = resolveStudioConfig(options, incoming)
    const looks = createLooksCollection(config)
    const finished = config.overrides ? config.overrides(looks) : looks
    if (!config.enabled) {
      return {
        ...incoming,
        collections: [...(incoming.collections ?? []), schemaOnly(finished)],
      }
    }
    return withStudio(incoming, config, finished)
  }

function withStudio(
  incoming: Config,
  config: ResolvedStudioConfig,
  looks: CollectionConfig,
): Config {
  const guard = (id: number | string, req: Parameters<CollectionBeforeDeleteHook>[0]['req']) =>
    protectRender(req, config, id)
  const providers = [
    ...(incoming.admin?.components?.providers ?? []),
    { clientProps: clientConfigOf(config), path: component('StudioProvider') },
    ...config.effects.map((effect) => effect.client),
  ]
  return {
    ...incoming,
    admin: {
      ...incoming.admin,
      components: {
        ...incoming.admin?.components,
        providers,
      },
    },
    collections: [
      ...(incoming.collections ?? []).map((collection) => ({
        ...collection,
        hooks: {
          ...collection.hooks,
          ...(config.hydrate
            ? {
                afterRead: [
                  ...(collection.hooks?.afterRead ?? []),
                  ...collectionHydration(config, collection.fields),
                ],
              }
            : {}),
          ...(collection.slug === config.mediaSlug
            ? {
                beforeChange: [
                  ...(collection.hooks?.beforeChange ?? []),
                  (async (args) => {
                    if (args.operation === 'update' && args.originalDoc?.id) {
                      await guard(args.originalDoc.id, args.req)
                    }
                    return args.data
                  }) satisfies CollectionBeforeChangeHook,
                ],
                beforeDelete: [
                  ...(collection.hooks?.beforeDelete ?? []),
                  (async ({ id, req }) => {
                    await guard(id, req)
                  }) satisfies CollectionBeforeDeleteHook,
                ],
              }
            : {}),
        },
      })),
      looks,
    ],
    globals: (incoming.globals ?? []).map((global) => ({
      ...global,
      hooks: {
        ...global.hooks,
        ...(config.hydrate
          ? {
              afterRead: [
                ...(global.hooks?.afterRead ?? []),
                ...globalHydration(config, global.fields),
              ],
            }
          : {}),
      },
    })),
  }
}
