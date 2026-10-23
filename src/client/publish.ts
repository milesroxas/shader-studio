import type { useForm } from '@payloadcms/ui'

import type { MediaLike } from '../options.js'
import type { CaptureInput } from './capture.js'
import type { Studio } from './config.js'
import type { PublishedState } from './look-store.js'

import { SURFACES } from '../core/effect.js'
import { type LookGround, studioGround } from '../core/ground.js'
import {
  POSTER_CAPTURE,
  type Recipe,
  snapshotRecipe,
  STILL_UPLOAD_BUDGET,
  validateRecipe,
} from '../core/recipe.js'
import { type Still, stillLabel, validateStills } from '../core/stills.js'
import { stillShot } from './shot.js'
import { draftState } from './status.js'
import { sessionKey, studioStore } from './store.js'

type Submit = ReturnType<typeof useForm>['submit']

/** The saved look a still is rendered from, and the ground a filled still is laid over. */
export type Draft = {
  effect: string
  ground: LookGround
  id: number | string
  recipe: Recipe
  stills: Still[]
}

let chain: Promise<unknown> = Promise.resolve()

/**
 * Captures run one after another, one extra WebGL context at a time: the
 * still preview, the contact sheet and a publish all render through here, so
 * none of them contends with another for the GPU. A call aborted while it
 * waits never renders. The capture module brings React Three Fiber, so it is
 * loaded on first use rather than with the admin.
 */
export function captureSerial(input: CaptureInput): Promise<Blob[]> {
  const run = chain.then(async () => {
    if (input.signal?.aborted) {
      throw new DOMException('The capture was cancelled.', 'AbortError')
    }
    const { captureStills } = await import('./capture.js')
    return captureStills(input)
  })
  chain = run.catch(() => {})
  return run
}

/** Whether an error is a capture that was cancelled, which no one needs to hear about. */
export const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError'

/**
 * The posters of a recipe, rendered in this browser with the live preview
 * paused for the moment it takes, so the capture has the GPU to itself.
 */
async function posters(studio: Studio, { id, effect, ground, recipe }: Draft) {
  const key = sessionKey(id)
  const definition = studio.definition(effect)
  const snapshot = snapshotRecipe(definition.contract, recipe)
  const wasPaused = studioStore.read(key).paused
  studioStore.patch(key, { paused: true })
  try {
    const images: Blob[] = []
    for (const surface of SURFACES) {
      images.push(
        ...(await captureSerial({
          capture: { ...POSTER_CAPTURE, surface },
          effect: definition,
          frames: [snapshot.frame],
          ground: studioGround(ground, surface, studio.ground),
          tuning: snapshot[surface],
        })),
      )
    }
    return images
  } finally {
    studioStore.patch(key, { paused: wasPaused })
  }
}

/** One still of the draft, rendered here. */
async function still(studio: Studio, { effect, ground, recipe }: Draft, target: Still) {
  const definition = studio.definition(effect)
  const shot = stillShot(studio.stillUses, definition.contract, recipe, target)
  const [image] = await captureSerial({
    capture: shot.capture,
    effect: definition,
    frames: [shot.frame],
    ground: studioGround(ground, shot.capture.surface, studio.ground),
    tuning: shot.tuning(shot.seed),
  })
  return image
}

/**
 * One multipart request: the stills travel as the files they are, beside the
 * JSON fields. A still over the budget is stopped here, where the reason can be
 * said, since the platform refuses it with a body that is not JSON.
 */
async function send<T>(
  studio: Studio,
  id: number | string,
  action: string,
  fields: Record<string, unknown>,
  images: Record<string, Blob>,
): Promise<T> {
  const weight = Object.values(images).reduce((sum, image) => sum + image.size, 0)
  if (weight > STILL_UPLOAD_BUDGET) {
    throw new Error(
      `The rendered stills weigh ${(weight / 1024 / 1024).toFixed(1)} MB, over the 4 MB one upload can carry. Choose JPEG or a smaller size.`,
    )
  }
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, JSON.stringify(value))
  }
  for (const [name, image] of Object.entries(images)) {
    form.set(name, image)
  }
  const response = await fetch(`${studio.api}/${studio.looksSlug}/${id}/${action}`, {
    body: form,
    credentials: 'include',
    method: 'POST',
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      result?.errors?.[0]?.message ?? result?.error ?? `The request failed (${response.status}).`,
    )
  }
  return result.doc
}

/** The server renders nothing and publishes the saved draft, so the draft is saved before anything is rendered from it. */
async function saveDraft(studio: Studio, submit: Submit, { id, effect, recipe, stills }: Draft) {
  const contract = studio.effect(effect)
  validateRecipe(contract, recipe)
  validateStills(studio.stillUses, contract, recipe, stills)
  const saved = await submit({
    action: `${studio.api}/${studio.looksSlug}/${id}?draft=true`,
    disableSuccessStatus: true,
    method: 'PATCH',
    overrides: { _status: 'draft' },
  })
  if (!saved?.res.ok) {
    throw new Error('The draft could not be saved, so nothing was published.')
  }
}

/** One still of the saved draft, rendered and filed in media. */
async function fileStill(studio: Studio, draft: Draft, target: Still): Promise<MediaLike> {
  const image = await still(studio, draft, target)
  return send<MediaLike>(
    studio,
    draft.id,
    'stills',
    { recipe: draft.recipe, still: target },
    { image },
  )
}

/** Render: one still, filed in media so it can be opened, downloaded and published. */
export async function renderStill(
  studio: Studio,
  submit: Submit,
  draft: Draft,
  target: Still,
): Promise<MediaLike> {
  await saveDraft(studio, submit, draft)
  return fileStill(studio, draft, target)
}

export type PublishProgress = (step: string) => void

/**
 * Publish: save, render here what the site needs that is not already
 * published as the draft has it (the two posters always, each still whose
 * pixels moved), file each still, and publish the look with everything in one
 * request. Every place that uses the look shows the result.
 */
export async function publishLook(
  studio: Studio,
  submit: Submit,
  draft: Draft,
  live: null | PublishedState,
  onProgress: PublishProgress = () => {},
): Promise<Record<string, unknown>> {
  await saveDraft(studio, submit, draft)
  const { status } = draftState(
    studio.effect(draft.effect),
    draft.recipe,
    draft.ground,
    draft.stills,
    live,
  )
  const renders: Record<string, number | string> = {}
  const pending = draft.stills.filter((target) => status(target) !== 'live')
  for (const [index, target] of pending.entries()) {
    onProgress(
      `Rendering ${stillLabel(studio.stillUses, target)} (${index + 1} of ${pending.length})…`,
    )
    const media = await fileStill(studio, draft, target)
    renders[target.id] = media.id
  }
  onProgress('Rendering posters…')
  const images = await posters(studio, draft)
  onProgress('Publishing…')
  return send<Record<string, unknown>>(
    studio,
    draft.id,
    'publish',
    { recipe: draft.recipe, renders },
    Object.fromEntries(SURFACES.map((surface, index) => [surface, images[index]])),
  )
}
