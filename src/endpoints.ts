import { APIError, type Endpoint, type PayloadRequest } from 'payload'
import {
  effectOf,
  type LookGround,
  lookGround,
  POSTER_CAPTURE,
  type PublishedStill,
  publishedStills,
  type Still,
  SURFACES,
  sameStill,
  snapshotRecipe,
  stillCapture,
  stillKey,
  stillLabel,
  validateStills,
} from './core/index.js'
import { recipeHash, stillHash, studioInput } from './hash.js'
import { fileRender } from './media.js'
import type { MediaLike, ResolvedStudioConfig } from './options.js'
import {
  EFFECT_FIELD,
  GROUND_FIELD,
  LIGHT_POSTER_FIELD,
  PUBLISH_CONTEXT,
  RECIPE_FIELD,
  STILL_MEDIA_FIELD,
  STILLS_FIELD,
  THUMBNAIL_FIELD,
} from './paths.js'
import { inTransaction, lockLook } from './transaction.js'
import { lookUsage } from './usage.js'

type LookDoc = {
  _status?: null | string
  archived?: boolean | null
  id: number | string
  title?: string
} & Record<string, unknown>

const isMediaId = (value: unknown): value is number | string =>
  Number.isInteger(value) || (typeof value === 'string' && value.length > 0)

export function lookEndpoints(config: ResolvedStudioConfig): Endpoint[] {
  const { looksSlug, registry, stillUses } = config

  function editor(req: PayloadRequest) {
    if (!config.access({ req }) || !req.user) {
      throw new APIError('Sign in to publish a look.', 401)
    }
    return req.user
  }
  /** The multipart body of Publish and Render: JSON fields beside the stills as files. */
  const form = (req: PayloadRequest) =>
    studioInput(async () => {
      if (!req.formData) {
        throw new Error('Form data required.')
      }
      return req.formData()
    })
  const field = (data: FormData, name: string): unknown =>
    studioInput(() => JSON.parse(String(data.get(name))))

  const effectOfLook = (look: LookDoc) => effectOf(registry, look[EFFECT_FIELD])
  const groundOf = (look: LookDoc): LookGround => lookGround(look[GROUND_FIELD])

  /**
   * The saved draft, read as the editor. The pixels in the request were rendered
   * from the recipe the editor was looking at, so it has to be the recipe that
   * was saved: anything else and the poster would not match the field.
   */
  async function savedDraft(req: PayloadRequest, recipe: unknown): Promise<LookDoc> {
    const look = (await req.payload.findByID({
      id: String(req.routeParams?.id),
      collection: looksSlug,
      depth: 0,
      draft: true,
      overrideAccess: false,
      req,
      user: req.user,
    })) as LookDoc
    const contract = effectOfLook(look)
    if (recipeHash(contract, recipe) !== recipeHash(contract, look[RECIPE_FIELD])) {
      throw new APIError('The draft changed while the stills rendered. Try again.', 409)
    }
    return look
  }

  /** The saved draft's stills, as the editor stored them. */
  const draftStills = (look: LookDoc): Still[] =>
    validateStills(
      stillUses,
      effectOfLook(look),
      look[RECIPE_FIELD] as never,
      look[STILLS_FIELD],
    ) as Still[]

  /** The still the request renders, as the saved draft holds it. */
  function savedStill(look: LookDoc, sent: unknown): Still {
    const id = String((sent as null | Partial<Still>)?.id ?? '')
    const still = draftStills(look).find((candidate) => candidate.id === id)
    if (!still) {
      throw new APIError('This still is no longer on the look.', 404)
    }
    if (!sameStill(still, sent as Still)) {
      throw new APIError('The still changed while it rendered. Try again.', 409)
    }
    return still
  }

  /** The published look, with its stills' outputs, or nothing for a look never published. */
  async function liveLook(req: PayloadRequest, id: number | string) {
    const live = (await req.payload.findByID({
      id,
      collection: looksSlug,
      depth: 0,
      disableErrors: true,
      draft: false,
      req,
    })) as LookDoc | null
    return live?._status === 'published' ? live : null
  }

  /** A media document Render filed for this still: an image at the still's exact size. */
  async function verifyRender(req: PayloadRequest, id: number | string, still: Still) {
    const media = (await req.payload.findByID({
      id,
      collection: config.mediaSlug,
      depth: 0,
      disableErrors: true,
      req,
    })) as MediaLike | null
    const capture = stillCapture(still)
    if (
      !media?.mimeType?.startsWith('image/') ||
      media.width !== capture.width * capture.scale ||
      media.height !== capture.height * capture.scale
    ) {
      throw new APIError(
        `The ${stillLabel(stillUses, still)} still's render does not match it. Try again.`,
        409,
      )
    }
  }

  /**
   * Each still of the draft with its output: the render this publish carries
   * (`renders`, still id to the media filed by Render), else the live look's
   * output when the still is unchanged since it was rendered. A still with
   * neither cannot be published: the site would serve a stale or missing file.
   */
  async function resolveStills(
    req: PayloadRequest,
    look: LookDoc,
    renders: Record<string, unknown>,
  ): Promise<PublishedStill[]> {
    const contract = effectOfLook(look)
    const stills = draftStills(look)
    if (!stills.length) {
      return []
    }
    const live = await liveLook(req, look.id)
    const published = new Map(
      publishedStills(live?.[STILLS_FIELD]).map((still) => [still.id, still]),
    )
    const ground = groundOf(look)
    const output: PublishedStill[] = []
    for (const still of stills) {
      const hash = stillHash(
        stillKey(contract, look[RECIPE_FIELD] as never, still, ground, config.ground),
      )
      const rendered = renders[still.id]
      if (isMediaId(rendered)) {
        await verifyRender(req, rendered, still)
        output.push({ ...still, hash, media: rendered })
        continue
      }
      const reuse = published.get(still.id)
      if (reuse && reuse.hash === hash) {
        output.push({ ...still, hash, media: reuse.media })
        continue
      }
      throw new APIError(
        `The ${stillLabel(stillUses, still)} still was not rendered. Try again.`,
        409,
      )
    }
    return output
  }

  return [
    {
      handler: async (req) => {
        editor(req)
        const data = await form(req)
        return inTransaction(req, async () => {
          const id = String(req.routeParams?.id)
          await lockLook(req, looksSlug, id)
          const look = await savedDraft(req, field(data, 'recipe'))
          if (look.archived) {
            throw new APIError('Unarchive this look before publishing.', 400)
          }
          const renders = data.has('renders') ? field(data, 'renders') : {}
          if (!renders || typeof renders !== 'object' || Array.isArray(renders)) {
            throw new APIError('Invalid renders.', 400)
          }
          const stills = await resolveStills(req, look, renders as Record<string, unknown>)
          const contract = effectOfLook(look)
          const ground = groundOf(look)
          // One at a time: each is a storage write inside the look's row lock.
          const posters = {} as Record<(typeof SURFACES)[number], MediaLike>
          for (const surface of SURFACES) {
            posters[surface] = await fileRender(req, config, {
              capture: { ...POSTER_CAPTURE, surface },
              file: data.get(surface),
              ground,
              look,
              title: `${look.title ?? 'Look'} ${surface} poster`,
            })
          }
          // Payload merges an operation's context into the request and leaves it
          // there, so the pass is handed over for this one write and taken back.
          try {
            const doc = await req.payload.update({
              id: look.id,
              collection: looksSlug,
              context: { [PUBLISH_CONTEXT]: true },
              data: {
                ...look,
                _status: 'published',
                [LIGHT_POSTER_FIELD]: posters.light.id,
                posters: {
                  dark: config.serializeMedia(posters.dark),
                  light: config.serializeMedia(posters.light),
                },
                snapshot: snapshotRecipe(contract, look[RECIPE_FIELD]),
                sourceHash: recipeHash(contract, look[RECIPE_FIELD]),
                [STILL_MEDIA_FIELD]: stills.map((still) => still.media),
                [STILLS_FIELD]: stills,
                [THUMBNAIL_FIELD]: posters.dark.id,
              },
              depth: 0,
              req,
            })
            return Response.json({ doc })
          } finally {
            delete req.context[PUBLISH_CONTEXT]
          }
        })
      },
      method: 'post',
      path: '/:id/publish',
    },
    {
      // Render: one still of the saved draft, filed in media. Publish references
      // the file by id; a still rendered to be opened or downloaded is filed the
      // same way, so nothing is encoded or stored twice.
      handler: async (req) => {
        editor(req)
        const data = await form(req)
        const look = await savedDraft(req, field(data, 'recipe'))
        const still = savedStill(look, field(data, 'still'))
        const media = await fileRender(req, config, {
          capture: stillCapture(still),
          file: data.get('image'),
          ground: groundOf(look),
          look,
          title: `${look.title ?? 'Look'} · ${stillLabel(stillUses, still)}`,
        })
        return Response.json({ doc: media })
      },
      method: 'post',
      path: '/:id/stills',
    },
    {
      handler: async (req) => {
        editor(req)
        const raw = req.routeParams?.id
        const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : String(raw ?? '')
        if (id === '') {
          throw new APIError('Invalid look.', 400)
        }
        return Response.json({ usages: await lookUsage(req, config, id) })
      },
      method: 'get',
      path: '/:id/usage',
    },
  ]
}
