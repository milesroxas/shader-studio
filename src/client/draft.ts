'use client'

import { useDocumentInfo, useField } from '@payloadcms/ui'
import { type LookGround, lookGround } from '../core/ground.js'
import { emptyRecipe, type Recipe, validateRecipe } from '../core/recipe.js'
import { isEffectId } from '../core/registry.js'
import { newStill, type Still } from '../core/stills.js'
import { EFFECT_FIELD, GROUND_FIELD, RECIPE_FIELD, STILLS_FIELD } from '../paths.js'
import type { Studio } from './config.js'
import { useStudio } from './config.js'
import {
  type LookEdit,
  type StillSelection,
  sessionKey,
  studioStore,
  useStudioSession,
} from './store.js'

/**
 * The look's own ground, one face at a time, from the hidden group in the
 * same form. It rides beside the recipe, not inside it: a change here is not
 * an undo step, autosaves with the draft, and reaches the site on Publish.
 */
export function useGround() {
  const dark = useField<null | string>({ path: `${GROUND_FIELD}.dark` })
  const light = useField<null | string>({ path: `${GROUND_FIELD}.light` })
  const ground: LookGround = lookGround({ dark: dark.value, light: light.value })
  return {
    ground,
    /** Both faces at once, as a published state carries them: a face it leaves out is cleared. */
    replace: (next: LookGround) => {
      dark.setValue(next.dark ?? null)
      light.setValue(next.light ?? null)
    },
    set: (surface: keyof LookGround, next: null | string) =>
      (surface === 'dark' ? dark : light).setValue(next),
  }
}

/**
 * The look's draft: the recipe and the stills of the open document, which
 * Payload autosaves, read against the effect the look is filed under. Every
 * piece of the Studio that changes either goes through `update` or
 * `updateStills`, so each change is one undo step over both and puts the draft
 * back on the stage.
 */
export function useDraft(path: string = RECIPE_FIELD) {
  const studio = useStudio()
  const { errorMessage, setValue, value } = useField<Recipe>({ path })
  const stillsField = useField<null | Still[]>({ path: STILLS_FIELD })
  const stored = useField<string>({ path: EFFECT_FIELD })
  const { id } = useDocumentInfo()
  const key = sessionKey(id)
  const effectId = isEffectId(studio.registry, stored.value)
    ? stored.value
    : studio.registry.defaultEffect
  const definition = studio.definition(effectId)
  const effect = definition.contract
  const recipe = value ?? emptyRecipe(effect)
  const stills = Array.isArray(stillsField.value) ? stillsField.value : []
  const setStills = stillsField.setValue

  const edit = (): LookEdit => ({ recipe, stills })
  const apply = (state: LookEdit | null) => {
    if (!state) {
      return
    }
    setValue(state.recipe)
    setStills(state.stills)
  }
  const update = (next: Recipe, restart = false) => {
    studioStore.record(key, edit())
    setValue(next)
    if (restart) {
      studioStore.restart(key)
    }
  }
  const updateStills = (next: Still[]) => {
    studioStore.record(key, edit())
    setStills(next)
  }

  return {
    /**
     * File the look under another effect. A recipe is only ever read against
     * the effect it was written for, so the draft and its stills start over
     * and the undo stack, which holds the other effect's recipes, goes with
     * them. The server allows this until the look is first published.
     */
    id,
    changeEffect: (next: string) => {
      studioStore.clear(key)
      stored.setValue(next)
      setValue(emptyRecipe(studio.effect(next)))
      setStills([])
    },
    copy: definition.copy,
    definition,
    effect,
    effectId,
    errorMessage: errorMessage || stillsField.errorMessage,
    key,
    recipe,
    redo: () => apply(studioStore.redo(key, edit())),
    /**
     * Make a published state the draft: its recipe and its stills. Nothing on
     * the site changes until the draft is published. Throws for a recipe
     * today's ranges no longer accept.
     */
    restore: (published: Recipe, publishedStills: Still[] = []) => {
      const next = validateRecipe(effect, published)
      studioStore.record(key, edit())
      setValue(next)
      setStills(publishedStills)
      studioStore.restart(key)
    },
    stills,
    studio,
    undo: () => apply(studioStore.undo(key, edit())),
    update,
    updateStills,
  }
}

export type Draft = ReturnType<typeof useDraft>

/**
 * The draft with what the stage shows and the Inspector edits: the live look,
 * the poster, or one still. A selection that names a still the draft no
 * longer holds reads as the live look.
 */
export function useStills(path?: string) {
  const draft = useDraft(path)
  const { key, recipe, stills, studio, updateStills } = draft
  const session = useStudioSession(key)
  const selected =
    session.still && session.still !== 'poster'
      ? (stills.find((still) => still.id === session.still) ?? null)
      : null
  const selection: StillSelection = session.still === 'poster' ? 'poster' : (selected?.id ?? null)
  const select = (next: StillSelection) =>
    studioStore.patch(key, { showComparison: false, still: next })

  return {
    ...draft,
    /** A new still for a use, starting as the look is, selected at once. */
    add: (use: string) => {
      const still = newStill(studio.stillUses, recipe, use)
      updateStills([...stills, still])
      select(still.id)
      return still
    },
    patch: (id: string, next: Partial<Still>) =>
      updateStills(stills.map((still) => (still.id === id ? { ...still, ...next } : still))),
    remove: (id: string) => {
      updateStills(stills.filter((still) => still.id !== id))
      if (selection === id) {
        select(null)
      }
    },
    select,
    selected,
    selection,
  }
}

export type Stills = ReturnType<typeof useStills>

export type { Studio }
