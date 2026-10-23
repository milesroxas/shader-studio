import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionAfterOperationHook,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type Field,
} from 'payload'

import type { ResolvedStudioConfig } from './options.js'

import {
  canonicalJSON,
  type Effect,
  effectOf,
  effectOptions,
  emptyRecipe,
  GROUND_HEX_MESSAGE,
  isGroundHex,
  recipeJsonSchema,
  stillInputs,
  stillsJsonSchema,
  SURFACES,
  validateRecipe,
  validateStills,
} from './core/index.js'
import { lookEndpoints } from './endpoints.js'
import { recipeHash, storedRecipeHash, studioInput } from './hash.js'
import {
  component,
  EFFECT_FIELD,
  GROUND_FIELD,
  LIGHT_POSTER_FIELD,
  PUBLISH_CONTEXT,
  RECIPE_FIELD,
  STILL_MEDIA_FIELD,
  STILLS_FIELD,
  THUMBNAIL_FIELD,
} from './paths.js'
import { lockLook } from './transaction.js'
import { lookUsage } from './usage.js'

const internal = () => false

/**
 * What the website reads, written only by Publish: the resolved snapshot, the
 * poster manifest and the hash of the published recipe. They ride on the look
 * the way image sizes ride on a media document.
 */
const published = (field: Field): Field =>
  ({
    ...field,
    access: { create: internal, update: internal },
    admin: { hidden: true },
  }) as Field

type ChangeArgs = Parameters<CollectionBeforeChangeHook>[0]

/** The stills a write carries, as inputs only: outputs are Publish's to write. */
const inputStills = (raw: unknown) =>
  Array.isArray(raw) ? raw.map((still) => stillInputs(still)) : []

/** What an afterOperation hook receives, however its collection is typed. */
type OperationArg = { args: unknown; operation: string; result: unknown }

/**
 * The documents a live save left unpublished: an unpublish, whichever client
 * sent it. A draft save (autosave, Save draft) never changes the live document
 * and is skipped. afterChange's `previousDoc` cannot tell the two apart: it is
 * the latest version, which is a draft as soon as one autosave follows a
 * publish, so an unpublish would look like a draft-to-draft save.
 */
const unpublishedByOperation = <T extends { _status?: null | string }>({
  args,
  operation,
  result,
}: OperationArg): T[] => {
  if (operation !== 'update' && operation !== 'updateByID') {
    return []
  }
  if ((args as { draft?: boolean }).draft) {
    return []
  }
  const docs = operation === 'update' ? (result as { docs: T[] }).docs : [result as T]
  return docs.filter((doc) => doc._status !== 'published')
}

export function createLooksCollection(config: ResolvedStudioConfig): CollectionConfig {
  const { access, looksSlug, registry, stillUses } = config
  const effect = (id: unknown): Effect => effectOf(registry, id)
  const allow = ({ req }: { req: Parameters<typeof access>[0]['req'] }) => access({ req })

  /**
   * A published look always has its posters and its stills' renders: Publish in
   * Studio is the one way to publish new output. Publishing what is already
   * published (Payload's Revert to published) changes nothing the site shows,
   * so it goes through with the live outputs.
   */
  async function requireStudioPublish({ data, originalDoc, req }: ChangeArgs, contract: Effect) {
    const id: number | string | undefined = originalDoc?.id
    const live = id
      ? await req.payload.findByID({
          id,
          collection: looksSlug,
          depth: 0,
          disableErrors: true,
          draft: false,
          req,
        })
      : null
    const unchanged =
      live?._status === 'published' &&
      storedRecipeHash(contract, live[RECIPE_FIELD]) ===
        recipeHash(contract, data[RECIPE_FIELD] ?? originalDoc?.[RECIPE_FIELD]) &&
      canonicalJSON(inputStills(data[STILLS_FIELD] ?? originalDoc?.[STILLS_FIELD])) ===
        canonicalJSON(inputStills(live[STILLS_FIELD]))
    if (!unchanged) {
      throw new APIError('Use Publish in Studio: it renders the posters the site needs.', 400)
    }
    data[STILLS_FIELD] = live[STILLS_FIELD]
    data[STILL_MEDIA_FIELD] = live[STILL_MEDIA_FIELD]
  }

  const notify = async (
    operation: 'publish' | 'unpublish',
    doc: Record<string, unknown>,
    req: ChangeArgs['req'],
  ) => {
    if (!config.onPublish || req.context.disableRevalidate) {
      return
    }
    req.payload.logger.info(`shader-studio: look ${String(doc.id)} ${operation}ed`)
    await config.onPublish({ id: doc.id as number | string, doc, operation, req })
  }

  const afterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
    if (doc._status === 'published') {
      await notify('publish', doc, req)
    }
    return doc
  }

  const afterOperation: CollectionAfterOperationHook = async (arg) => {
    const { req, result } = arg
    for (const doc of unpublishedByOperation<Record<string, unknown>>(arg)) {
      await notify('unpublish', doc, req)
    }
    return result
  }

  const userFields: Field[] = config.userSlug
    ? [
        {
          type: 'row',
          fields: [
            {
              name: 'createdBy',
              type: 'relationship',
              access: { create: internal, update: internal },
              admin: { readOnly: true },
              relationTo: config.userSlug,
            },
            {
              name: 'updatedBy',
              type: 'relationship',
              access: { create: internal, update: internal },
              admin: { readOnly: true },
              relationTo: config.userSlug,
            },
          ],
        },
      ]
    : []

  /**
   * A look is one effect, authored. It is used like a media file: a page slot
   * references the document, and the site shows whatever is published. The
   * draft is the working copy (autosaved); Publish renders the two posters in
   * the editor's browser and publishes the look with them in one write.
   * History is Payload's own versions, so there is no second version system.
   */
  return {
    slug: looksSlug,
    access: {
      create: allow,
      delete: allow,
      read: allow,
      readVersions: allow,
      update: allow,
    },
    admin: {
      components: {
        edit: { PublishButton: component('PublishButton') },
      },
      defaultColumns: ['title', THUMBNAIL_FIELD, EFFECT_FIELD, 'tags', '_status', 'updatedAt'],
      description:
        'Tune the look in the Inspector, watch it on the stage, add the stills it should ship as, then publish. Every place that uses the look shows what is published.',
      group: config.adminGroup,
      useAsTitle: 'title',
    },
    endpoints: lookEndpoints(config),
    fields: [
      // The stage and the meta live on tabs in the main column; the Inspector
      // (the recipe field) sits in the sidebar so it stays beside the stage on
      // every tab. Tabs are unnamed, so the schema is flat.
      {
        type: 'tabs',
        tabs: [
          {
            fields: [
              {
                name: 'stage',
                type: 'ui',
                admin: { components: { Field: component('Stage') } },
              },
            ],
            label: 'Studio',
          },
          {
            fields: [
              { name: 'title', type: 'text', index: true, required: true },
              {
                name: EFFECT_FIELD,
                type: 'select',
                // Chosen on the stage, with the recipe it invalidates, and fixed
                // once the look is published (the `beforeChange` hook holds it).
                admin: {
                  description: 'What this look draws. Chosen in Studio before the first publish.',
                  readOnly: true,
                },
                defaultValue: registry.defaultEffect,
                index: true,
                options: effectOptions(registry),
                required: true,
              },
              { name: 'description', type: 'textarea' },
              { name: 'tags', type: 'text', hasMany: true, index: true },
              {
                type: 'row',
                fields: [
                  {
                    name: THUMBNAIL_FIELD,
                    type: 'upload',
                    access: { create: internal, update: internal },
                    admin: {
                      components: { Cell: component('Thumbnail') },
                      description: 'Rendered on Publish. Also the library thumbnail.',
                      readOnly: true,
                    },
                    label: 'Dark poster',
                    relationTo: config.mediaSlug,
                  },
                  {
                    name: LIGHT_POSTER_FIELD,
                    type: 'upload',
                    access: { create: internal, update: internal },
                    admin: { description: 'Rendered on Publish.', readOnly: true },
                    relationTo: config.mediaSlug,
                  },
                ],
              },
              {
                // Edited on the stage's Ground control, beside the face toggle,
                // so the row is hidden here; it is in the form all the same.
                name: GROUND_FIELD,
                type: 'group',
                admin: { hidden: true },
                fields: SURFACES.map((surface) => ({
                  name: surface,
                  type: 'text',
                  admin: {
                    description: `The colour painted behind the effect wherever this look sits on a ${surface} ground, as #rrggbb. Empty keeps the default, ${config.ground[surface]}.`,
                  },
                  label: surface === 'dark' ? 'Dark ground' : 'Light ground',
                  validate: (value: null | string | undefined) =>
                    !value || isGroundHex(value) || GROUND_HEX_MESSAGE,
                })),
                label: 'Ground',
              },
              {
                name: 'archived',
                type: 'checkbox',
                admin: {
                  description: 'Hides the look from the picker. Places that use it keep working.',
                },
                defaultValue: false,
                index: true,
              },
              ...userFields,
              {
                name: 'usage',
                type: 'ui',
                admin: { components: { Field: component('Usage') } },
              },
            ],
            label: 'Details',
          },
          {
            description:
              'Every published state of this look. Restore copies one into the draft; nothing changes on the site until you publish.',
            fields: [
              {
                name: 'history',
                type: 'ui',
                admin: { components: { Field: component('History') } },
              },
            ],
            label: 'History',
          },
        ],
      },
      {
        name: RECIPE_FIELD,
        type: 'json',
        admin: {
          components: { Field: component('Inspector') },
          position: 'sidebar',
        },
        defaultValue: emptyRecipe(effect(registry.defaultEffect)),
        // For an agent drafting a look over the API; the Inspector replaces the JSON editor here.
        jsonSchema: recipeJsonSchema(registry),
        required: true,
        validate: (value, { siblingData }) => {
          try {
            validateRecipe(effect((siblingData as Record<string, unknown>)[EFFECT_FIELD]), value)
            return true
          } catch (error) {
            return (error as Error).message
          }
        },
      },
      {
        // Edited on the Inspector's Stills tab and the stage; the admin form
        // carries it like the recipe, so autosave, versions and validation see
        // every change.
        name: STILLS_FIELD,
        type: 'json',
        admin: { hidden: true },
        defaultValue: [],
        jsonSchema: stillsJsonSchema(registry, stillUses),
        validate: (value, { siblingData }) => {
          try {
            const data = siblingData as Record<string, unknown>
            validateStills(
              stillUses,
              effect(data[EFFECT_FIELD]),
              data[RECIPE_FIELD] as never,
              value,
            )
            return true
          } catch (error) {
            return (error as Error).message
          }
        },
      },
      published({ name: 'snapshot', type: 'json' }),
      published({ name: 'posters', type: 'json' }),
      published({ name: 'sourceHash', type: 'text' }),
      published({
        name: STILL_MEDIA_FIELD,
        type: 'relationship',
        hasMany: true,
        relationTo: config.mediaSlug,
      }),
    ],
    folders: config.folders,
    hooks: {
      afterChange: [afterChange],
      afterOperation: [afterOperation],
      beforeChange: [
        async (args) => {
          const { context, data, operation, originalDoc, req } = args
          if (originalDoc?.id) {
            await lockLook(req, looksSlug, originalDoc.id)
          }
          // The effect is open until the look is first published, then fixed:
          // every published state, poster and slot that uses the look was made
          // for that effect. The stage changes it together with the recipe.
          if (originalDoc?.snapshot) {
            data[EFFECT_FIELD] = originalDoc[EFFECT_FIELD]
          }
          const contract = effect(data[EFFECT_FIELD] ?? originalDoc?.[EFFECT_FIELD])
          if (data[RECIPE_FIELD]) {
            studioInput(() => validateRecipe(contract, data[RECIPE_FIELD]))
          }
          if (data[STILLS_FIELD] !== undefined) {
            const recipe = data[RECIPE_FIELD] ?? originalDoc?.[RECIPE_FIELD]
            studioInput(() => validateStills(stillUses, contract, recipe, data[STILLS_FIELD]))
            // A draft stores what the editor set; the render is Publish's to add.
            if (data._status !== 'published') {
              data[STILLS_FIELD] = inputStills(data[STILLS_FIELD])
            }
          }
          if (config.userSlug) {
            if (operation === 'create') {
              data.createdBy = req.user?.id
            }
            data.updatedBy = req.user?.id ?? originalDoc?.updatedBy
          }
          if (data._status === 'published' && !context[PUBLISH_CONTEXT]) {
            await requireStudioPublish(args, contract)
          }
          return data
        },
      ],
      beforeDelete: [
        async ({ id, req }) => {
          const uses = await lookUsage(req, config, id)
          if (uses.length) {
            throw new APIError(
              `This look is in use on ${uses.length === 1 ? uses[0].title : `${uses.length} places`}. Remove it there first.`,
              400,
            )
          }
        },
      ],
    },
    labels: config.labels,
    versions: { drafts: { autosave: { interval: 2000 } }, maxPerDoc: 50 },
  }
}
