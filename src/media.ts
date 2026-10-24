import { randomUUID } from 'node:crypto'
import { APIError, type Config, type PayloadRequest } from 'payload'
import {
  CAPTURE_PIXEL_BUDGET,
  type CaptureOptions,
  type LookGround,
  STILL_QUALITY,
  STILL_UPLOAD_BUDGET,
  studioGround,
} from './core/index.js'
import type { MediaLike, ResolvedStudioConfig } from './options.js'
import { LIGHT_POSTER_FIELD, STILL_MEDIA_FIELD, THUMBNAIL_FIELD } from './paths.js'

type Sharp = NonNullable<Config['sharp']>

/** The host's sharp: the one its config passes Payload, else the package beside it. */
async function sharpOf(req: PayloadRequest): Promise<Sharp> {
  if (req.payload.config.sharp) {
    return req.payload.config.sharp
  }
  try {
    const module = await import('sharp')
    return (module.default ?? module) as unknown as Sharp
  } catch {
    throw new APIError(
      'shader-studio needs sharp to file a render: pass `sharp` to buildConfig or install it.',
      500,
    )
  }
}

/** The folder renders are filed in, found or made, when the media collection is in folders. */
async function folderFor(req: PayloadRequest, config: ResolvedStudioConfig) {
  const { folders } = req.payload.config
  const media = req.payload.collections[config.mediaSlug]?.config
  if (!folders || !media?.folders || config.mediaFolder === false) {
    return null
  }
  const foldersSlug = folders.slug
  const found = await req.payload.find({
    collection: foldersSlug,
    depth: 0,
    limit: 1,
    req,
    where: {
      and: [
        { name: { equals: config.mediaFolder } },
        { folderType: { contains: config.mediaSlug } },
      ],
    },
  })
  const folder =
    found.docs[0] ??
    (await req.payload.create({
      collection: foldersSlug,
      data: { name: config.mediaFolder, folderType: [config.mediaSlug] },
      req,
    }))
  return { [folders.fieldName]: folder.id }
}

/**
 * The browser sends the capture's own file at its exact size, which is stored
 * as it arrived. PNG from a browser that cannot encode the format is converted
 * here. Anything else is refused before it is stored.
 */
export async function fileRender(
  req: PayloadRequest,
  config: ResolvedStudioConfig,
  {
    capture,
    file,
    ground,
    look,
    title,
  }: {
    capture: CaptureOptions
    file: FormDataEntryValue | null
    ground: LookGround
    look: Record<string, unknown>
    title: string
  },
): Promise<MediaLike> {
  if (!file || typeof file === 'string' || file.size > STILL_UPLOAD_BUDGET) {
    throw new APIError('Invalid image payload.', 400)
  }
  const sharp = await sharpOf(req)
  const buffer = Buffer.from(await file.arrayBuffer())
  const metadata = await sharp(buffer, { limitInputPixels: CAPTURE_PIXEL_BUDGET })
    .metadata()
    .catch(() => null)
  if (
    !metadata ||
    metadata.width !== capture.width * capture.scale ||
    metadata.height !== capture.height * capture.scale ||
    (metadata.format !== capture.format && metadata.format !== 'png')
  ) {
    throw new APIError('Render dimensions or encoding do not match the capture.', 400)
  }
  let output: Buffer = buffer
  if (metadata.format !== capture.format) {
    let pipeline = sharp(buffer)
    if (!capture.transparent) {
      pipeline = pipeline.flatten({
        background: studioGround(ground, capture.surface, config.ground),
      })
    }
    output = await pipeline.toFormat(capture.format, { quality: STILL_QUALITY }).toBuffer()
  }
  const data = {
    ...(await folderFor(req, config)),
    ...(await config.mediaData({ look, req, title })),
  }
  return req.payload.create({
    collection: config.mediaSlug,
    data,
    depth: 0,
    file: {
      name: `studio-${randomUUID()}.${capture.format}`,
      data: output,
      mimetype: `image/${capture.format}`,
      size: output.length,
    },
    req,
  }) as Promise<MediaLike>
}

/** A poster or a still a published look serves is replaced by publishing the look, never edited in media. */
export async function protectRender(
  req: PayloadRequest,
  config: ResolvedStudioConfig,
  id: number | string,
) {
  const used = await req.payload.count({
    collection: config.looksSlug,
    req,
    where: {
      or: [
        { [THUMBNAIL_FIELD]: { equals: id } },
        { [LIGHT_POSTER_FIELD]: { equals: id } },
        { [STILL_MEDIA_FIELD]: { equals: id } },
      ],
    },
  })
  if (used.totalDocs) {
    throw new APIError(
      'This is a render of a published Studio look. Publish the look again to replace it.',
      400,
    )
  }
}
