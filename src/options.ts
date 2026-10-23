import type { CollectionConfig, Config, PayloadRequest } from 'payload'

import {
  createRegistry,
  DEFAULT_GROUND,
  DEFAULT_STILL_USES,
  type Effect,
  type EffectRegistry,
  type PosterMediaSource,
  type StillUses,
  type StudioGround,
} from './core/index.js'

/** One effect, as the plugin takes it: its pure contract for the server, and the client module that draws it. */
export type StudioEffectRegistration = {
  /**
   * The import path of the effect's client registration, as Payload's import
   * map takes a component: `'@/studio/wash.client#WashEffect'`. The export is
   * what `defineStudioEffect` (from `shader-studio/client`) returned. The
   * plugin adds it to the admin's providers, so the Studio can draw the
   * effect wherever it is edited.
   */
  client: string
  /** The effect's authoring contract (`EffectContract`): parameters, looks, caps. Pure: no React, no Three. */
  contract: Effect
}

/** A rendered file as a media document holds it: enough to copy the fields a slot serves. */
export type MediaLike = {
  [key: string]: unknown
  filename?: null | string
  height?: null | number
  id: number | string
  mimeType?: null | string
  updatedAt?: string
  url?: null | string
  width?: null | number
}

export type LookPublishArgs = {
  /** The look as it was written, or as it was left unpublished. */
  doc: Record<string, unknown>
  id: number | string
  operation: 'publish' | 'unpublish'
  req: PayloadRequest
}

export type ShaderStudioPluginConfig = {
  /**
   * Who may author looks and publish them. Applied to every operation on the
   * looks collection and to the render and publish endpoints. Defaults to any
   * signed-in user.
   */
  access?: (args: { req: PayloadRequest }) => boolean
  /** Where the looks collection sits in the admin nav. */
  admin?: { group?: string }
  /**
   * The effects the Studio can author, in the order an editor sees them. At
   * least one. The first is the effect a look is filed under by default.
   */
  effects: StudioEffectRegistration[]
  /**
   * `false` keeps the collection (so the schema and the generated types do
   * not change) but leaves every hook, endpoint and admin component out, the
   * way Payload's own plugins disable.
   */
  enabled?: boolean
  /**
   * Put the looks collection in Payload's folders. Off by default: turning it
   * on enables folders for the whole admin when nothing else has.
   */
  folders?: boolean
  /**
   * The colour under an effect on each face, as `#rrggbb`: the Studio paints
   * it on the stage and flattens an opaque still onto it, and a look may set
   * its own per face. Defaults to a near-black and a warm off-white; set it to
   * your site's two backgrounds.
   */
  ground?: Partial<StudioGround>
  /**
   * Whether a published look's snapshot, posters and ground replace its id
   * wherever a slot references it, on every read. On by default; off, slots
   * carry the bare id and the site fetches the look itself.
   */
  hydrate?: boolean
  labels?: { plural?: string; singular?: string }
  /** The slug of the looks collection. Defaults to `studio-looks`. Never rename it once it has data. */
  looksSlug?: string
  /**
   * Extra data for every media document a render is filed as, beside the file
   * itself: an `alt`, a required category, a folder. The default sets `alt`
   * to the render's title.
   */
  mediaData?: (args: {
    look: Record<string, unknown>
    req: PayloadRequest
    title: string
  }) => Promise<Record<string, unknown>> | Record<string, unknown>
  /**
   * The folder every rendered still is filed in, when the media collection is
   * in folders. `false` files renders at the root. Defaults to `Shader Studio`.
   */
  mediaFolder?: false | string
  /** The upload collection renders are filed in. Defaults to `media`. */
  mediaSlug?: string
  /**
   * Called after a look is published through the Studio (or reverted to a
   * published state) and after one is unpublished. Bust whatever caches hold
   * pages that use looks here: a published look is baked into every page that
   * shows it.
   */
  onPublish?: (args: LookPublishArgs) => Promise<void> | void
  /** Change the looks collection before it is added: fields, access, admin, hooks. Runs last. */
  overrides?: (collection: CollectionConfig) => CollectionConfig
  /**
   * What a slot receives of each rendered file. The default copies the
   * filename, URL, size and MIME type. Add the fields your image CDN needs.
   */
  serializeMedia?: (media: MediaLike) => PosterMediaSource
  /**
   * The name of the relationship field a visual slot stores a look in
   * (`studioLookField()`). Defaults to `look`. Hydration and usage find slots
   * by this name under a group, array or block, so keep it unique to the plugin.
   */
  slotField?: string
  /**
   * The static renders a look offers, by use: a size, a label and whether the
   * site serves it with the look. `custom` (any size) is always offered. The
   * defaults are a 1200 × 630 preview card the site serves, and social sizes.
   */
  stillUses?: StillUses
}

export type ResolvedStudioConfig = {
  access: (args: { req: PayloadRequest }) => boolean
  adminGroup?: string
  effects: StudioEffectRegistration[]
  enabled: boolean
  folders: boolean
  ground: StudioGround
  hydrate: boolean
  labels: { plural: string; singular: string }
  looksSlug: string
  mediaData: NonNullable<ShaderStudioPluginConfig['mediaData']>
  mediaFolder: false | string
  mediaSlug: string
  onPublish?: ShaderStudioPluginConfig['onPublish']
  overrides?: ShaderStudioPluginConfig['overrides']
  registry: EffectRegistry
  serializeMedia: (media: MediaLike) => PosterMediaSource
  slotField: string
  stillUses: StillUses
  /** The auth collection `createdBy` and `updatedBy` relate to, when the host has one. */
  userSlug?: string
}

/**
 * What the admin's Studio components need of the configuration, serialized
 * into the `StudioProvider`'s client props. Everything here is plain data.
 */
export type StudioClientConfig = {
  defaultEffect: string
  effectIds: string[]
  ground: StudioGround
  looksSlug: string
  mediaSlug: string
  slotField: string
  stillUses: StillUses
}

export const defaultSerializeMedia = (media: MediaLike): PosterMediaSource => ({
  filename: String(media.filename ?? ''),
  height: Number(media.height ?? 0),
  mimeType: String(media.mimeType ?? ''),
  updatedAt: media.updatedAt,
  url: String(media.url ?? ''),
  width: Number(media.width ?? 0),
})

const defaultAccess = ({ req }: { req: PayloadRequest }) => Boolean(req.user)

export function resolveStudioConfig(
  options: ShaderStudioPluginConfig,
  config: Config,
): ResolvedStudioConfig {
  if (!Array.isArray(options.effects) || !options.effects.length) {
    throw new Error('shader-studio: pass at least one effect in `effects`.')
  }
  for (const effect of options.effects) {
    if (!effect?.contract || typeof effect.client !== 'string' || !effect.client.includes('#')) {
      throw new Error(
        'shader-studio: each effect is `{ contract, client }`, where `client` is an import path like `@/studio/wash.client#WashEffect`.',
      )
    }
  }
  const registry = createRegistry(options.effects.map((effect) => effect.contract))
  const userSlug =
    config.admin?.user ?? config.collections?.find((collection) => collection.auth)?.slug
  return {
    access: options.access ?? defaultAccess,
    adminGroup: options.admin?.group,
    effects: options.effects,
    enabled: options.enabled !== false,
    folders: options.folders === true,
    ground: { ...DEFAULT_GROUND, ...options.ground },
    hydrate: options.hydrate !== false,
    labels: {
      plural: options.labels?.plural ?? 'Studio Looks',
      singular: options.labels?.singular ?? 'Studio Look',
    },
    looksSlug: options.looksSlug ?? 'studio-looks',
    mediaData: options.mediaData ?? (({ title }) => ({ alt: title })),
    mediaFolder: options.mediaFolder === undefined ? 'Shader Studio' : options.mediaFolder,
    mediaSlug: options.mediaSlug ?? 'media',
    onPublish: options.onPublish,
    overrides: options.overrides,
    registry,
    serializeMedia: options.serializeMedia ?? defaultSerializeMedia,
    slotField: options.slotField ?? 'look',
    stillUses: options.stillUses ?? DEFAULT_STILL_USES,
    userSlug,
  }
}

export const clientConfigOf = (resolved: ResolvedStudioConfig): StudioClientConfig => ({
  defaultEffect: resolved.registry.defaultEffect,
  effectIds: resolved.registry.ids,
  ground: resolved.ground,
  looksSlug: resolved.looksSlug,
  mediaSlug: resolved.mediaSlug,
  slotField: resolved.slotField,
  stillUses: resolved.stillUses,
})
