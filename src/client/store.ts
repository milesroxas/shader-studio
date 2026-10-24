'use client'

import { useSyncExternalStore } from 'react'

import type { LookGround } from '../core/ground.js'
import type { Recipe } from '../core/recipe.js'
import type { Still } from '../core/stills.js'

/**
 * What the stage shows and the Inspector edits: the live look (`null`), the
 * poster pair (`'poster'`, the look exactly as it runs, at its capture frame)
 * or one of the look's stills, by id.
 */
export type StillSelection = 'poster' | null | string

/** One undo step: everything of the look an edit in the Studio can change together. */
export type LookEdit = { recipe: Recipe; stills: Still[] }

/** How the stage frames the look: on its own, behind copy as a background, or beside a section's copy. */
export const PREVIEW_LAYOUTS = [
  { label: 'Shader', value: 'shader' },
  { label: 'Background', value: 'background' },
  { label: 'Content', value: 'content' },
] as const

export type PreviewLayout = (typeof PREVIEW_LAYOUTS)[number]['value']

/**
 * Studio session state that is not part of the document: how the stage is
 * showing the recipe, the kept comparison, and the undo stack. The Inspector
 * (the recipe field, in the sidebar) and the Stage (the Studio tab) are
 * rendered in different branches of Payload's form, so they share it through
 * this store instead of a context. One session per open document; it lives
 * for the page, which is as long as the undo stack should.
 */
export type StudioSession = {
  comparison: null | Recipe
  comparisonAt: null | number
  /** The ground the comparison was kept or published with; the stage paints it under the comparison. */
  comparisonGround: LookGround
  comparisonLabel: string
  future: LookEdit[]
  /** Bumped to restart the preview from frame zero. */
  generation: number
  history: LookEdit[]
  layout: PreviewLayout
  paused: boolean
  /** The placement of the slot the Studio was opened from, or empty for the effect's widest. */
  placement: string
  showComparison: boolean
  still: StillSelection
  surface: 'dark' | 'light'
}

const HISTORY_LIMIT = 50

const initial = (): StudioSession => ({
  comparison: null,
  comparisonAt: null,
  comparisonGround: {},
  comparisonLabel: '',
  future: [],
  generation: 0,
  history: [],
  layout: 'shader',
  paused: false,
  placement: '',
  showComparison: false,
  still: null,
  surface: 'dark',
})

const sessions = new Map<string, StudioSession>()
const listeners = new Set<() => void>()

const read = (key: string) => {
  let session = sessions.get(key)
  if (!session) {
    session = initial()
    sessions.set(key, session)
  }
  return session
}

const emit = () => {
  for (const listener of listeners) {
    listener()
  }
}

export const studioStore = {
  /** Forget everything that was made of recipes: the undo stack, the kept comparison and the selection. */
  clear(key: string) {
    const {
      comparison: _comparison,
      comparisonGround: _comparisonGround,
      future: _future,
      generation,
      history: _history,
      showComparison: _showComparison,
      still: _still,
      ...kept
    } = read(key)
    sessions.set(key, { ...initial(), ...kept, generation: generation + 1 })
    emit()
  },
  patch(key: string, next: Partial<StudioSession>) {
    sessions.set(key, { ...read(key), ...next })
    emit()
  },
  read,
  /**
   * Call with the state about to be replaced, before the change. Every change
   * to the draft, undo and redo included, puts the draft back on the stage:
   * an edit made while a comparison is showing would otherwise change nothing
   * the author can see.
   */
  record(key: string, previous: LookEdit) {
    const session = read(key)
    sessions.set(key, {
      ...session,
      future: [],
      history: [...session.history.slice(-(HISTORY_LIMIT - 1)), previous],
      showComparison: false,
    })
    emit()
  },
  redo(key: string, current: LookEdit): LookEdit | null {
    const session = read(key)
    const next = session.future.at(-1)
    if (!next) {
      return null
    }
    sessions.set(key, {
      ...session,
      future: session.future.slice(0, -1),
      history: [...session.history, current],
      showComparison: false,
    })
    emit()
    return next
  },
  restart(key: string) {
    const session = read(key)
    sessions.set(key, { ...session, generation: session.generation + 1 })
    emit()
  },
  undo(key: string, current: LookEdit): LookEdit | null {
    const session = read(key)
    const previous = session.history.at(-1)
    if (!previous) {
      return null
    }
    sessions.set(key, {
      ...session,
      future: [...session.future, current],
      history: session.history.slice(0, -1),
      showComparison: false,
    })
    emit()
    return previous
  },
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The session for one document; `key` is the document id, or `new` before the first save. */
export function useStudioSession(key: string): StudioSession {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => read(key),
  )
}

export const sessionKey = (id: number | string | undefined) => (id == null ? 'new' : String(id))
