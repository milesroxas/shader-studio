'use client'

import '../../styles/studio.css'

import { toast } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'

import { stillInputs, studioGround } from '../../core/index.js'
import { useDraft, useGround } from '../draft.js'
import { type PublishedState, useLook } from '../look-store.js'
import { draftState } from '../status.js'
import { studioStore } from '../store.js'
import { Button } from '../ui/button.js'

export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  })

/**
 * The History tab: every published state of the look, newest first, read
 * from Payload's own versions. Restore copies one into the draft; Compare
 * shows it on the stage beside the draft. Neither changes the site.
 */
export const History: UIFieldClientComponent = () => {
  const { id, effect, key, recipe, restore, stills, studio } = useDraft()
  const ground = useGround()
  const { history, loaded } = useLook(id)
  // A published state is its recipe, its ground and its stills: all are compared, all come back.
  const matchesDraft = (state: PublishedState) =>
    draftState(effect, recipe, ground.ground, stills, state).unchanged

  const restoreState = (state: PublishedState) => {
    try {
      restore(state.recipe, state.stills.map(stillInputs))
      ground.replace(state.ground)
      toast.success(`The draft is back at ${when(state.at)}. Undo in Studio reverses the recipe.`)
    } catch {
      toast.error('This state holds values the current ranges no longer accept.')
    }
  }
  const compare = (state: PublishedState) => {
    studioStore.patch(key, {
      comparison: state.recipe,
      comparisonAt: new Date(state.at).getTime(),
      comparisonGround: state.ground,
      comparisonLabel: when(state.at),
      showComparison: true,
    })
    toast.success('It is on the stage. Open Studio to see it.')
  }

  if (!id || (loaded && !history.length)) {
    return (
      <p className="text-muted-foreground text-xs" data-shader-studio="panel">
        Nothing published yet. Publish from Studio and each published state is kept here.
      </p>
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-border" data-shader-studio="panel">
      {history.map((state, index) => (
        <HistoryRow
          ground={studioGround(state.ground, 'dark', studio.ground)}
          key={state.id}
          matchesDraft={matchesDraft(state)}
          onCompare={() => compare(state)}
          onRestore={() => restoreState(state)}
          onSite={index === 0}
          state={state}
        />
      ))}
    </ul>
  )
}

function HistoryRow({
  ground,
  matchesDraft,
  onCompare,
  onRestore,
  onSite,
  state,
}: {
  /** The colour under the state's dark poster: its own dark ground, else the Studio's. */
  ground: string
  matchesDraft: boolean
  onCompare: () => void
  onRestore: () => void
  onSite: boolean
  state: PublishedState
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 py-3">
      <span
        className="block h-9 w-16 shrink-0 overflow-hidden rounded-sm border border-border"
        style={{ backgroundColor: ground }}
      >
        {state.poster && (
          <img alt="" className="size-full object-cover" loading="lazy" src={state.poster} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-xs">{when(state.at)}</span>
        <span className="text-[11px] text-muted-foreground">
          {[onSite && 'On the site now', matchesDraft && 'matches the draft']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {!matchesDraft && (
          <Button onClick={onRestore} size="sm" type="button" variant="ghost">
            Restore as draft
          </Button>
        )}
        <Button onClick={onCompare} size="sm" type="button" variant="ghost">
          Compare on stage
        </Button>
      </div>
    </li>
  )
}
