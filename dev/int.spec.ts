import type { Payload, SanitizedConfig } from 'payload'

import { createLocalReq, getPayload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  DEFAULT_STILL_USES,
  emptyRecipe,
  parseRelease,
  snapshotRecipe,
  validateRecipe,
} from '../src/core/index.js'
import { washEffect } from '../src/effects/wash/index.js'
import { recipeHash } from '../src/hash.js'
import { resolveStudioConfig } from '../src/options.js'
import { PUBLISH_CONTEXT } from '../src/paths.js'
import { lookUsage } from '../src/usage.js'

// Tests boot their own in-memory database, never the dev app's file, whatever dev/.env says.
process.env.DATABASE_URI = 'file::memory:?cache=shared'
process.env.PAYLOAD_SECRET ??= 'test-secret'

const LOOKS = 'studio-looks'
const recipe = emptyRecipe(washEffect)

let payload: Payload
let config: SanitizedConfig

type Doc = { id: number | string } & Record<string, unknown>
type Media = {
  filename: string
  height: number
  mimeType: string
  updatedAt: string
  url: string
  width: number
} & Doc

const messageOf = (error: unknown) => {
  const e = error as { data?: { errors?: { message?: string }[] }; message?: string }
  return [e.message, ...(e.data?.errors ?? []).map((row) => row.message)].filter(Boolean).join(' ')
}

const refused = async (work: () => Promise<unknown>, text: string) => {
  try {
    await work()
  } catch (error) {
    expect(messageOf(error)).toContain(text)
    return
  }
  expect.unreachable(`expected a refusal containing "${text}"`)
}

/** A transparent 1600 × 900 WebP, the poster's own frame, as the browser would send it. */
async function posterFile(name: string) {
  const data = await sharp({
    create: { background: { alpha: 0, b: 0, g: 0, r: 0 }, channels: 4, height: 900, width: 1600 },
  })
    .webp()
    .toBuffer()
  return { name: `${name}.webp`, data, mimetype: 'image/webp', size: data.length }
}

const serialize = (media: Media) => ({
  filename: media.filename,
  height: media.height,
  mimeType: media.mimeType,
  updatedAt: media.updatedAt,
  url: media.url,
  width: media.width,
})

beforeAll(async () => {
  const { default: configPromise } = await import('@payload-config')
  config = await configPromise
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.destroy()
})

describe('the looks collection', () => {
  test('is added with its fields, versions and endpoints', () => {
    const looks = payload.collections[LOOKS]
    expect(looks).toBeDefined()
    const names = looks.config.flattenedFields.map((field) => field.name)
    for (const name of [
      'title',
      'effect',
      'description',
      'tags',
      'thumbnail',
      'lightPoster',
      'ground',
      'archived',
      'createdBy',
      'updatedBy',
      'recipe',
      'stills',
      'snapshot',
      'posters',
      'sourceHash',
      'stillMedia',
    ]) {
      expect(names).toContain(name)
    }
    expect(looks.config.versions?.drafts).toBeTruthy()
    const paths = (looks.config.endpoints || []).map((endpoint) => endpoint.path)
    expect(paths).toEqual(expect.arrayContaining(['/:id/publish', '/:id/stills', '/:id/usage']))
  })

  test('registers the Studio provider and the effect on the admin', () => {
    const providers = config.admin.components?.providers ?? []
    const paths = providers.map((provider) =>
      typeof provider === 'string' ? provider : (provider as { path: string }).path,
    )
    expect(paths).toContain('shader-studio/client#StudioProvider')
    expect(paths).toContain('shader-studio/effects/wash/client#WashEffect')
  })
})

describe('authoring a look', () => {
  let lookId: number | string
  let pageId: number | string
  let dark: Media
  let light: Media

  test('refuses a recipe the effect cannot read', async () => {
    await refused(
      () =>
        payload.create({
          collection: LOOKS,
          data: {
            effect: 'wash',
            recipe: { ...recipe, deltas: { nope: 1 } },
            title: 'Bad look',
          },
          draft: true,
          overrideAccess: true,
        }),
      'Unsupported parameter: nope',
    )
  })

  test('creates a draft filed under the wash effect', async () => {
    const look = (await payload.create({
      collection: LOOKS,
      data: { effect: 'wash', recipe, title: 'Test look' },
      draft: true,
      overrideAccess: true,
    })) as Doc
    lookId = look.id
    expect(look._status).toBe('draft')
    expect(look.effect).toBe('wash')
    expect(validateRecipe(washEffect, look.recipe)).toEqual(recipe)
    expect(look.snapshot).toBeFalsy()
  })

  test('refuses a publish that did not come through the Studio', async () => {
    await refused(
      () =>
        payload.update({
          id: lookId,
          collection: LOOKS,
          data: { _status: 'published' },
          overrideAccess: true,
        }),
      'Use Publish in Studio',
    )
  })

  test('leaves a slot that holds an unpublished look as its id', async () => {
    const page = (await payload.create({
      collection: 'pages',
      data: {
        hero: { look: lookId },
        layout: [{ blockType: 'visual', caption: 'A wash', look: lookId }],
        title: 'Home',
      },
      draft: true,
      overrideAccess: true,
    })) as Doc
    pageId = page.id
    const read = (await payload.findByID({
      id: pageId,
      collection: 'pages',
      draft: true,
      overrideAccess: true,
    })) as { hero: { look: unknown }; layout: { look: unknown }[] } & Doc
    expect(read.hero.look).toBe(lookId)
    expect(read.layout[0].look).toBe(lookId)
  })

  test('refuses to publish the page while its look is unpublished', async () => {
    await refused(
      () =>
        payload.update({
          id: pageId,
          collection: 'pages',
          data: { _status: 'published' },
          overrideAccess: true,
        }),
      'Publish this look in Studio first',
    )
  })

  test('publishes with its posters when the Studio hands them over', async () => {
    dark = (await payload.create({
      collection: 'media',
      data: { alt: 'Test look dark poster' },
      file: await posterFile('dark'),
      overrideAccess: true,
    })) as Media
    light = (await payload.create({
      collection: 'media',
      data: { alt: 'Test look light poster' },
      file: await posterFile('light'),
      overrideAccess: true,
    })) as Media
    expect(dark.width).toBe(1600)
    expect(dark.height).toBe(900)
    const published = (await payload.update({
      id: lookId,
      collection: LOOKS,
      context: { [PUBLISH_CONTEXT]: true },
      data: {
        _status: 'published',
        lightPoster: light.id,
        posters: { dark: serialize(dark), light: serialize(light) },
        snapshot: snapshotRecipe(washEffect, recipe),
        sourceHash: recipeHash(washEffect, recipe),
        stillMedia: [],
        stills: [],
        thumbnail: dark.id,
      },
      overrideAccess: true,
    })) as Doc
    expect(published._status).toBe('published')
    expect(published.sourceHash).toBe(recipeHash(washEffect, recipe))
    expect((published.snapshot as { renderer: string }).renderer).toBe(washEffect.renderer)
  })

  test('hydrates every slot that holds the published look', async () => {
    const page = (await payload.findByID({
      id: pageId,
      collection: 'pages',
      draft: true,
      overrideAccess: true,
    })) as { hero: { look: Doc }; layout: { look: Doc }[] } & Doc
    for (const slot of [page.hero.look, page.layout[0].look]) {
      expect(slot).toMatchObject({
        id: lookId,
        ground: {},
        sourceHash: recipeHash(washEffect, recipe),
      })
      expect((slot.snapshot as { renderer: string }).renderer).toBe(washEffect.renderer)
      expect((slot.posters as { dark: { url: string } }).dark.url).toBe(dark.url)
      expect((slot.posters as { light: { url: string } }).light.url).toBe(light.url)
      expect(parseRelease(washEffect, slot, { stillUses: DEFAULT_STILL_USES })).not.toBeNull()
    }
  })

  test('lets the page publish now that its look is published', async () => {
    const page = (await payload.update({
      id: pageId,
      collection: 'pages',
      data: { _status: 'published' },
      overrideAccess: true,
    })) as Doc
    expect(page._status).toBe('published')
  })

  test('hydrates a global that holds the look', async () => {
    await payload.updateGlobal({
      slug: 'settings',
      data: { background: { look: lookId } },
      overrideAccess: true,
    })
    const settings = (await payload.findGlobal({
      slug: 'settings',
      overrideAccess: true,
    })) as { background: { look: Doc } } & Doc
    expect(settings.background.look).toMatchObject({ id: lookId })
    expect(settings.background.look.sourceHash).toBe(recipeHash(washEffect, recipe))
  })

  test('is found by the query the plugin uses for usage', async () => {
    const { docs } = await payload.find({
      collection: 'pages',
      overrideAccess: true,
      where: { 'hero.look': { equals: lookId } },
    })
    expect(docs.map((doc) => doc.id)).toContain(pageId)
    const byBlock = await payload.find({
      collection: 'pages',
      overrideAccess: true,
      where: { 'layout.look': { equals: lookId } },
    })
    expect(byBlock.docs.map((doc) => doc.id)).toContain(pageId)
  })

  test('reports where it is used, through the plugin', async () => {
    const req = await createLocalReq({}, payload)
    const resolved = resolveStudioConfig(
      {
        effects: [{ client: 'shader-studio/effects/wash/client#WashEffect', contract: washEffect }],
      },
      config as never,
    )
    const uses = await lookUsage(req, resolved, lookId)
    expect(uses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: 'Pages',
          draft: false,
          title: 'Home',
          url: `/admin/collections/pages/${pageId}`,
        }),
        expect.objectContaining({ content: 'Settings', url: '/admin/globals/settings' }),
      ]),
    )
  })

  test('cannot be deleted while a page uses it', async () => {
    await refused(
      () => payload.delete({ id: lookId, collection: LOOKS, overrideAccess: true }),
      'in use',
    )
  })

  test('keeps its posters out of reach in media', async () => {
    await refused(
      () => payload.delete({ id: dark.id, collection: 'media', overrideAccess: true }),
      'render of a published Studio look',
    )
    await refused(
      () =>
        payload.update({
          id: light.id,
          collection: 'media',
          data: { alt: 'renamed' },
          overrideAccess: true,
        }),
      'render of a published Studio look',
    )
  })

  test('republishes what is already published without new posters', async () => {
    const reverted = (await payload.update({
      id: lookId,
      collection: LOOKS,
      data: { _status: 'published' },
      overrideAccess: true,
    })) as Doc
    expect(reverted._status).toBe('published')
    const thumbnail = reverted.thumbnail as Doc | number | string
    expect(typeof thumbnail === 'object' ? thumbnail.id : thumbnail).toBe(dark.id)
  })

  test('keeps the effect fixed once published', async () => {
    const look = (await payload.update({
      id: lookId,
      collection: LOOKS,
      data: { effect: 'other' },
      draft: true,
      overrideAccess: true,
    })) as Doc
    expect(look.effect).toBe('wash')
  })
})
