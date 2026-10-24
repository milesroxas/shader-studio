'use client'

import '../../styles/studio.css'

import { Link, toast } from '@payloadcms/ui'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDice5,
  IconLayoutGrid,
  IconMinus,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
} from '@tabler/icons-react'
import type { UIFieldClientComponent } from 'payload'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  type Effect,
  type EffectBudget,
  effectOptions,
  FRAME_MAX,
  type LookGround,
  lookOptions,
  type Recipe,
  resolveRecipeTuning,
  SEED_MAX,
  type Snapshot,
  type Still,
  type StudioGround,
  type Surface,
  sameGround,
  snapshotChanges,
  snapshotRecipe,
  starterRecipe,
  stillInputs,
  studioGround,
} from '../../core/index.js'
import type { Stills } from '../draft.js'
import { useGround, useStills } from '../draft.js'
import type { StudioEffectDefinition } from '../effects.js'
import type { LookState, LookUse, PublishedState } from '../look-store.js'
import { useLook } from '../look-store.js'
import type { Shot } from '../shot.js'
import { shotOf } from '../shot.js'
import { draftState } from '../status.js'
import type { StudioSession } from '../store.js'
import { studioStore, useStudioSession } from '../store.js'
import { Button } from '../ui/button.js'
import { cn } from '../ui/cn.js'
import { Input } from '../ui/input.js'
import { Kbd } from '../ui/kbd.js'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.js'
import { GroundControl } from './Ground.js'
import { when } from './History.js'
import { StillViewport } from './StillViewport.js'
import { Variations } from './Variations.js'

const Preview = lazy(() =>
  import('../preview.js').then((module) => ({ default: module.StudioPreview })),
)

type Draft = Stills
type Ground = ReturnType<typeof useGround>
type Patch = (next: Partial<StudioSession>) => void
type Update = Draft['update']
type DraftState = ReturnType<typeof compareDraft>
type StageActions = ReturnType<typeof stageActions>

const isEditing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))

const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/** The placement the stage shows at: the session's, when the effect offers it, else the effect's widest. */
const placementOf = (effect: Effect, session: StudioSession): string =>
  effect.placements.includes(session.placement) ? session.placement : effect.placements[0]

/** The draft read against what is published, and what the stage can afford to draw of it. */
function compareDraft(
  effect: Effect,
  recipe: Recipe,
  ground: LookGround,
  stills: Still[],
  session: StudioSession,
  { history, live: published }: LookState,
) {
  let validation = ''
  let snapshot: null | Snapshot = null
  try {
    snapshot = snapshotRecipe(effect, recipe)
  } catch (error) {
    validation = (error as Error).message
  }
  const placement = placementOf(effect, session)
  const state = draftState(effect, recipe, ground, stills, published)
  // The ground and the stills ride beside the snapshot, so they are read beside the key.
  const same = (candidate: PublishedState) =>
    draftState(effect, recipe, ground, stills, candidate).unchanged
  return {
    budget: snapshot
      ? effect.budget(
          effect.limit(snapshot[session.surface], placement),
          resolveRecipeTuning(effect, recipe),
          placement,
        )
      : null,
    /** Whether a published state is the draft, ground and stills included. */
    matches: same,
    // The published state the draft is identical to, whichever one it is: a
    // restored state matches itself, not "12 changes since published".
    matched: history.find(same),
    sincePublished:
      snapshot && published
        ? snapshotChanges(snapshot, JSON.parse(published.key)) +
          Number(!sameGround(published.ground, ground)) +
          state.stillsApart
        : null,
    unchanged: state.unchanged,
    validation,
  }
}

function statusText(id: Draft['id'], published: null | PublishedState, state: DraftState) {
  if (!id) {
    return 'Unsaved. Save once to publish and export.'
  }
  if (state.unchanged) {
    return 'Published, no changes'
  }
  if (state.matched) {
    return `Draft matches what was published ${when(state.matched.at)}`
  }
  const changes = state.sincePublished
  if (published && changes !== null) {
    return `Draft, ${changes} ${changes === 1 ? 'change' : 'changes'} since published`
  }
  return 'Draft, not yet published'
}

function stageActions(
  { changeEffect, effect, effectId, key, recipe, redo, restore, stills, undo, update }: Draft,
  ground: Ground,
) {
  return {
    // A look's effect is open until it is first published; the draft starts over with it.
    chooseEffect: (next: string) => {
      if (next === effectId) {
        return
      }
      if (
        (Object.keys(recipe.deltas).length || stills.length) &&
        !window.confirm('Changing the effect starts this draft over. Continue?')
      ) {
        return
      }
      changeEffect(next)
    },
    compareState: (state: PublishedState) =>
      studioStore.patch(key, {
        comparison: state.recipe,
        comparisonAt: new Date(state.at).getTime(),
        comparisonGround: state.ground,
        comparisonLabel: when(state.at),
        showComparison: true,
      }),
    keep: () => {
      studioStore.patch(key, {
        comparison: recipe,
        comparisonAt: Date.now(),
        comparisonGround: ground.ground,
        comparisonLabel: 'Kept comparison',
        showComparison: false,
      })
    },
    randomize: () => {
      if (!effect.seeded) {
        return
      }
      update({ ...recipe, seed: crypto.getRandomValues(new Uint32Array(1))[0] & SEED_MAX }, true)
    },
    redo,
    // A published state is its recipe, its stills and its ground, so all come
    // back; the ground is not an undo step.
    restoreState: (state: PublishedState, label: string) => {
      try {
        restore(state.recipe, state.stills.map(stillInputs))
        ground.replace(state.ground)
        toast.success(`The draft is back at ${label}. Undo brings your recipe changes back.`)
      } catch {
        toast.error('This state holds values the current ranges no longer accept.')
      }
    },
    undo,
  }
}

/** ⌘Z and ⇧⌘Z anywhere on the page, outside a text field. */
function useUndoShortcut(undo: () => void, redo: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') {
        return
      }
      if (isEditing(event.target)) {
        return
      }
      event.preventDefault()
      if (event.shiftKey) {
        redo()
      } else {
        undo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
}

const stageKeys =
  (session: StudioSession, patch: Patch, randomize: () => void, leave: () => void) =>
  (event: React.KeyboardEvent) => {
    if (isEditing(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    switch (event.key) {
      case ' ':
        event.preventDefault()
        patch({ paused: !session.paused })
        break
      case 'c':
        if (session.comparison) {
          patch({ showComparison: !session.showComparison })
        }
        break
      case 'Escape':
        leave()
        break
      case 'r':
        randomize()
        break
    }
  }

function IconAction({
  children,
  disabled,
  label,
  onClick,
  shortcut,
}: {
  children: React.ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  shortcut?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className="h-full w-8 rounded-none"
          disabled={disabled}
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The stage: the Studio tab of a look, for whichever effect it is filed under.
 * Starters and published history on the left, the live effect in the middle at
 * the chosen placement and ground, and the session controls. Edits happen in
 * the Inspector (the recipe field, in the sidebar); the stage reads the same
 * field and shows the result, or a comparison when asked. With a still chosen
 * on the Inspector's Stills tab, the stage shows that still instead, rendered
 * exactly, and its seed and moment are set here.
 *
 * A look has a draft and what is published. Publish puts the draft on the
 * site, everywhere the look is used; Reset to published and Restore copy a
 * published state back into the draft.
 */
export const Stage: UIFieldClientComponent = () => {
  const draft = useStills()
  const {
    id,
    copy,
    definition,
    effect,
    key,
    patch: patchStill,
    recipe,
    select,
    selected,
    selection,
    stills,
    studio,
    update,
  } = draft
  const session = useStudioSession(key)
  const look = useLook(id)
  const groundField = useGround()
  const { ground } = groundField
  const [live, setLive] = useState(true)
  const [sheet, setSheet] = useState(false)
  const state = compareDraft(effect, recipe, ground, stills, session, look)
  const actions = stageActions(draft, groundField)
  const patch: Patch = (next) => studioStore.patch(key, next)
  const placement = placementOf(effect, session)
  // What the stage shows: the live look, or a shot of it. A still is of one
  // face, so the face toggle sets the still's face while it is up.
  const surface: Surface = selected ? selected.surface : session.surface
  const shot = selection
    ? shotOf(studio.stillUses, effect, recipe, selected ?? 'poster', surface)
    : null
  const setSurface = (next: Surface) =>
    selected ? patchStill(selected.id, { surface: next }) : patch({ surface: next })
  // The seed and the moment belong to what the stage shows: the recipe's for
  // the look and its poster, the still's own for a still.
  const setShot = (next: { frame?: number; seed?: number }) =>
    selected ? patchStill(selected.id, next) : update({ ...recipe, ...next }, 'seed' in next)
  const randomize = () => {
    if (!effect.seeded) {
      return
    }
    setShot({ seed: crypto.getRandomValues(new Uint32Array(1))[0] & SEED_MAX })
  }
  // The stage paints the ground of what it shows: the comparison's while one is up.
  const comparing = !shot && session.showComparison && Boolean(session.comparison)
  const shownGround = studioGround(
    comparing ? session.comparisonGround : ground,
    surface,
    studio.ground,
  )

  useUndoShortcut(actions.undo, actions.redo)

  return (
    <TooltipProvider delayDuration={400}>
      {/* The stage listens for its shortcuts (space, r, c, Escape) on its own box. */}
      <section
        aria-label={copy.title}
        className="@container flex flex-col overflow-hidden rounded-lg border border-input bg-background"
        data-shader-studio
        onKeyDown={stageKeys(session, patch, randomize, () => select(null))}
      >
        <StageHeader
          actions={actions}
          draft={draft}
          look={look}
          onLeave={() => select(null)}
          session={session}
          shot={shot}
          state={state}
        />
        <div className="grid @[768px]:grid-cols-[240px_minmax(0,1fr)] grid-cols-1">
          <aside className="flex flex-col border-border @[768px]:border-r border-b @[768px]:border-b-0 bg-card">
            <StarterList
              effect={effect}
              ground={studio.ground[surface]}
              surface={surface}
              update={update}
            />
            <PublishedList
              actions={actions}
              history={look.history}
              matches={state.matches}
              patch={patch}
              session={session}
            />
          </aside>
          <div className="flex min-w-0 flex-col">
            <Viewport
              defaults={studio.ground}
              definition={definition}
              ground={shownGround}
              live={live}
              lookGround={ground}
              onTurnOn={() => setLive(true)}
              placement={placement}
              recipe={recipe}
              session={session}
              shot={shot}
              state={state}
              surface={surface}
            />
            <Transport
              live={live}
              onToggleLive={() => setLive((v) => !v)}
              patch={patch}
              placement={placement}
              placements={effect.placements}
              restart={() => studioStore.restart(key)}
              session={session}
              setSurface={setSurface}
              still={Boolean(shot)}
              surface={surface}
            >
              {effect.seeded && (
                <SeedField
                  onChange={(seed) => setShot({ seed })}
                  onRandomize={randomize}
                  seed={shot?.seed ?? recipe.seed}
                />
              )}
              <FrameField
                frame={shot?.frame ?? recipe.frame}
                onChange={(frame) => setShot({ frame })}
              />
              <span className="flex h-[30px] items-center overflow-hidden rounded-md border border-input">
                <IconAction label="Variations" onClick={() => setSheet(true)}>
                  <IconLayoutGrid />
                </IconAction>
              </span>
            </Transport>
          </div>
        </div>
        <Variations
          defaults={studio.ground}
          effect={definition}
          ground={ground}
          onOpenChange={setSheet}
          onPick={setShot}
          open={sheet}
          seeded={effect.seeded}
          shot={shot ?? shotOf(studio.stillUses, effect, recipe, 'poster', surface)}
        />
      </section>
    </TooltipProvider>
  )
}

function StageHeader({
  actions,
  draft: { id, copy, effectId, key, studio },
  look: { live: published, loaded, uses },
  onLeave,
  session,
  shot,
  state,
}: {
  actions: StageActions
  draft: Draft
  look: LookState
  onLeave: () => void
  session: StudioSession
  shot: null | Shot
  state: DraftState
}) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-border border-b py-2 pr-4 pl-5">
      <DraftStatus
        id={id}
        places={uses.filter((use) => !use.historical)}
        published={published}
        state={state}
        title={shot ? `${copy.title} · ${shot.label}` : copy.title}
      />
      <div className="flex items-center gap-3">
        {loaded && !published && (
          <EffectPicker
            onChange={actions.chooseEffect}
            options={effectOptions(studio.registry)}
            value={effectId}
          />
        )}
        {published && !state.unchanged && (
          <ResetToPublished onClick={() => actions.restoreState(published, 'what is published')} />
        )}
        <UndoRedo onRedo={actions.redo} onUndo={actions.undo} session={session} />
        {shot ? (
          // A still is one exact render; there is nothing live to compare it
          // with, so the comparison's place goes to the way back to the look.
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={onLeave} size="sm" type="button" variant="outline">
                Back to the look
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              Show the live look
              <Kbd>Esc</Kbd>
            </TooltipContent>
          </Tooltip>
        ) : (
          <ToggleGroup
            className="w-auto"
            onValueChange={(next) =>
              next && studioStore.patch(key, { showComparison: next === 'compare' })
            }
            size="lg"
            type="single"
            value={session.showComparison ? 'compare' : 'draft'}
            variant="segmented"
          >
            <ToggleGroupItem value="draft">Draft</ToggleGroupItem>
            <ToggleGroupItem disabled={!session.comparison} value="compare">
              Compare
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
    </header>
  )
}

function DraftStatus({
  id,
  places,
  published,
  state,
  title,
}: {
  id: Draft['id']
  places: LookUse[]
  published: null | PublishedState
  state: DraftState
  title: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2.5">
      <h2 className="font-semibold text-[15px]/5">{title}</h2>
      {/* The status sets on the title's baseline, so the dot rides in
          the text rather than leading a flex row: a flex container takes
          its baseline from its first item, and an empty 6px span has
          none to give — the line would sit a pixel or two off the
          heading beside it. */}
      <p className="text-muted-foreground text-xs/4">
        <span
          aria-hidden
          className={cn(
            'mr-1.5 inline-block size-1.5 shrink-0 rounded-full align-[0.15em]',
            state.unchanged ? 'bg-success' : published ? 'bg-warning' : 'bg-muted-foreground',
          )}
        />
        {statusText(id, published, state)}
        {/* Where Publish lands. A look is used like a media file: every
            place that uses it shows what is published. */}
        {id && places.length === 1 && (
          <>
            {' · used on '}
            <Link className="underline" href={places[0].url} prefetch={false}>
              {places[0].title}
            </Link>
          </>
        )}
        {places.length > 1 && ` · used in ${places.length} places`}
      </p>
    </div>
  )
}

function EffectPicker({
  onChange,
  options,
  value,
}: {
  onChange: (next: string) => void
  options: { label: string; value: string }[]
  value: string
}) {
  return (
    <ToggleGroup
      aria-label="Effect"
      className="w-auto"
      onValueChange={(next) => next && onChange(next)}
      size="lg"
      type="single"
      value={value}
      variant="segmented"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function ResetToPublished({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button onClick={onClick} size="sm" type="button" variant="ghost">
          Reset to published
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-56" side="bottom" sideOffset={6}>
        Put what is on the site back in the draft. Undo brings your changes back.
      </TooltipContent>
    </Tooltip>
  )
}

function UndoRedo({
  onRedo,
  onUndo,
  session,
}: {
  onRedo: () => void
  onUndo: () => void
  session: StudioSession
}) {
  return (
    <div className="flex h-[34px] items-center divide-x divide-input overflow-hidden rounded-md border border-input">
      <IconAction disabled={!session.history.length} label="Undo" onClick={onUndo} shortcut="⌘Z">
        <IconArrowBackUp />
      </IconAction>
      <IconAction disabled={!session.future.length} label="Redo" onClick={onRedo} shortcut="⇧⌘Z">
        <IconArrowForwardUp />
      </IconAction>
    </div>
  )
}

function StarterList({
  effect,
  ground,
  surface,
  update,
}: {
  effect: Effect
  /** The Studio's ground for the face, under each starter's poster. */
  ground: string
  surface: StudioSession['surface']
  update: Update
}) {
  const starters = lookOptions(effect)
  return (
    <>
      <div className="flex h-10 items-center border-border border-b px-3.5">
        <h3 className="flex-1 font-semibold text-xs/4 tracking-[0.02em]">Starters</h3>
        <span className="text-[11px]/3.5 text-muted-foreground tabular-nums">
          {starters.length}
        </span>
      </div>
      <ul className="flex flex-col">
        {starters.map((look) => {
          const poster = effect.lookPoster?.(look.value, surface)
          return (
            <li key={look.value}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex h-11 w-full cursor-pointer items-center gap-2.5 px-3.5 text-left text-[13px]/4 text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => update(starterRecipe(effect, look.value), true)}
                    type="button"
                  >
                    {poster ? (
                      <img
                        alt=""
                        className="h-6.5 w-11 shrink-0 rounded-[3px] border border-input object-cover"
                        height={26}
                        loading="lazy"
                        src={poster}
                        style={{ backgroundColor: ground }}
                        width={44}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="block h-6.5 w-11 shrink-0 rounded-[3px] border border-input"
                        style={{ backgroundColor: ground }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{look.label}</span>
                    <span className="font-mono text-[10px]/3 text-muted-foreground uppercase tracking-[0.04em]">
                      {effect.lookTag?.(effect.looks[look.value])}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-56" side="right" sideOffset={8}>
                  {look.description}
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function PublishedList({
  actions,
  history,
  matches,
  patch,
  session,
}: {
  actions: StageActions
  history: PublishedState[]
  matches: (state: PublishedState) => boolean
  patch: Patch
  session: StudioSession
}) {
  return (
    <>
      <div className="flex h-10 items-center border-border border-y px-3.5">
        <h3 className="flex-1 font-semibold text-xs/4 tracking-[0.02em]">Published</h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="pressable cursor-pointer text-[11px]/3.5 text-muted-foreground hover:text-foreground"
              onClick={actions.keep}
              type="button"
            >
              Keep
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Keep this draft to compare against while you keep adjusting
            <Kbd>C</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      <ul className="flex flex-col">
        <SessionRows patch={patch} session={session} />
        {/* A published state does two things, so it is two buttons: the
            row puts it on the stage beside the draft, Restore makes it
            the draft. Looking never changes anything. */}
        {history.map((state, index) => (
          <PublishedRow
            actions={actions}
            key={state.id}
            matchesDraft={matches(state)}
            onSite={index === 0}
            state={state}
          />
        ))}
      </ul>
    </>
  )
}

/** The draft, and the kept comparison when there is one. */
function SessionRows({ patch, session }: { patch: Patch; session: StudioSession }) {
  return (
    <>
      <li>
        <button
          aria-current={!session.showComparison || undefined}
          className="flex h-10 w-full cursor-pointer items-center gap-2.5 px-3.5 text-left text-[13px]/4 text-foreground/80 transition-colors hover:bg-muted aria-[current]:text-foreground"
          onClick={() => patch({ showComparison: false })}
          type="button"
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
          <span className="flex-1">Draft</span>
          <span className="text-[11px]/3.5 text-muted-foreground">now</span>
        </button>
      </li>
      {session.comparison && (
        <li>
          <button
            aria-current={session.showComparison || undefined}
            className="flex h-10 w-full cursor-pointer items-center gap-2.5 px-3.5 text-left text-[13px]/4 text-foreground/80 transition-colors hover:bg-muted aria-[current]:text-foreground"
            onClick={() => patch({ showComparison: true })}
            type="button"
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full border border-muted-foreground"
            />
            <span className="flex-1 truncate">{session.comparisonLabel}</span>
            <span className="text-[11px]/3.5 text-muted-foreground tabular-nums">
              {session.comparisonAt ? clock(session.comparisonAt) : ''}
            </span>
          </button>
        </li>
      )}
    </>
  )
}

function PublishedRow({
  actions,
  matchesDraft,
  onSite,
  state,
}: {
  actions: StageActions
  matchesDraft: boolean
  onSite: boolean
  state: PublishedState
}) {
  return (
    <li className="flex items-center gap-2 pr-3.5 transition-colors hover:bg-muted">
      <button
        className="flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 pl-3.5 text-left text-[13px]/4 text-foreground/80"
        onClick={() => actions.compareState(state)}
        type="button"
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            onSite ? 'bg-success' : 'border border-muted-foreground',
          )}
        />
        <span className="min-w-0 flex-1 truncate tabular-nums">{when(state.at)}</span>
        {/* The filled dot is what is on the site; the column is too
            narrow to say so in words beside a date and Restore. */}
        {matchesDraft && (
          <span className="shrink-0 text-[11px]/3.5 text-muted-foreground">matches draft</span>
        )}
      </button>
      {!matchesDraft && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="pressable shrink-0 cursor-pointer text-[11px]/3.5 text-muted-foreground hover:text-foreground"
              onClick={() => actions.restoreState(state, when(state.at))}
              type="button"
            >
              Restore
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-56" side="right" sideOffset={8}>
            Make these settings the draft. The site changes when you publish.
          </TooltipContent>
        </Tooltip>
      )}
    </li>
  )
}

function Viewport({
  defaults,
  definition,
  ground,
  live,
  lookGround,
  onTurnOn,
  placement,
  recipe,
  session,
  shot,
  state: { budget, validation },
  surface,
}: {
  /** The Studio's grounds, which a filled still is laid over where the look sets none. */
  defaults: StudioGround
  definition: StudioEffectDefinition
  /** The colour under what is shown, for the stage's face: the draft's or the comparison's own ground, else the Studio's. */
  ground: string
  live: boolean
  lookGround: LookGround
  onTurnOn: () => void
  placement: string
  recipe: Recipe
  session: StudioSession
  /** The still on the stage, or nothing for the live look. */
  shot: null | Shot
  state: DraftState
  surface: Surface
}) {
  const shown = session.showComparison && session.comparison ? session.comparison : recipe
  return (
    <div
      className="relative"
      style={{
        backgroundColor: ground,
        height: 495,
      }}
    >
      <PreviewBadge
        live={live}
        placement={placement}
        session={session}
        shot={shot}
        surface={surface}
      />
      {shot ? (
        validation ? (
          <PreviewOff onTurnOn={onTurnOn} validation={validation} />
        ) : (
          <StillViewport defaults={defaults} effect={definition} ground={lookGround} shot={shot} />
        )
      ) : live && !validation ? (
        <Suspense
          fallback={
            <p className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
              Loading preview…
            </p>
          }
        >
          <Preview
            effect={definition}
            generation={session.generation}
            ground={ground}
            key={`${definition.contract.id}:${session.generation}:${placement}`}
            live
            paused={session.paused}
            placement={placement}
            recipe={shown}
            surface={surface}
          />
        </Suspense>
      ) : (
        <PreviewOff onTurnOn={onTurnOn} validation={validation} />
      )}
      {/* The readout sits over the effect it describes, so it takes the
          same plate as the placement badge: over a live effect, bare
          text is not readable at any ink. */}
      {budget && !shot && <BudgetReadout budget={budget} />}
    </div>
  )
}

function PreviewBadge({
  live,
  placement,
  session,
  shot,
  surface,
}: {
  live: boolean
  placement: string
  session: StudioSession
  shot: null | Shot
  surface: Surface
}) {
  return (
    <span className="pointer-events-none absolute top-3 left-3 z-10 flex h-6 items-center gap-1.5 rounded-full bg-background/70 pr-2.5 pl-2 font-mono text-[11px]/3.5 text-foreground uppercase tracking-[0.04em] backdrop-blur-xs">
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          !shot && live && !session.paused ? 'bg-primary' : 'bg-muted-foreground',
        )}
      />
      {shot
        ? `Still · ${shot.label} · ${shot.capture.width}×${shot.capture.height} · ${surface}`
        : `${live ? (session.paused ? 'Paused' : 'Live') : 'Off'} · ${placement} · ${surface}`}
      {!shot && session.showComparison && ' · comparison'}
    </span>
  )
}

function PreviewOff({ onTurnOn, validation }: { onTurnOn: () => void; validation: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground text-xs">
      <p className="max-w-xs text-pretty text-center">
        {validation ? validation : 'The live preview is off. Turn it on to see the recipe move.'}
      </p>
      {!validation && (
        <Button onClick={onTurnOn} size="sm" type="button" variant="outline">
          Turn on the live preview
        </Button>
      )}
    </div>
  )
}

function BudgetReadout({ budget }: { budget: EffectBudget }) {
  return (
    <p
      className={cn(
        'pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-24px)] items-start gap-1.5 rounded-full bg-background/70 py-1 pr-2.5 pl-2 font-mono text-[11px]/3.5 tabular-nums tracking-[0.02em] backdrop-blur-xs',
        budget.capped ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      {budget.capped && (
        <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-warning" />
      )}
      <span>{budget.text}</span>
    </p>
  )
}

/**
 * Face and its ground, then placement and playback for the live look;
 * `children` are the seed and frame of what the stage shows, and the way to
 * its variations. A still has no placement and nothing to play: the controls
 * that only mean something live leave while it is up, rather than sit dimmed.
 */
function Transport({
  children,
  live,
  onToggleLive,
  patch,
  placement,
  placements,
  restart,
  session,
  setSurface,
  still,
  surface,
}: {
  children: React.ReactNode
  live: boolean
  onToggleLive: () => void
  patch: Patch
  placement: string
  placements: readonly string[]
  restart: () => void
  session: StudioSession
  setSurface: (next: Surface) => void
  still: boolean
  surface: Surface
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-4 border-border border-t px-4 py-3">
      <div className="flex items-center gap-2">
        <ToggleGroup
          aria-label="Face"
          className="w-auto"
          onValueChange={(next) => next && setSurface(next as Surface)}
          type="single"
          value={surface}
          variant="segmented"
        >
          <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
          <ToggleGroupItem value="light">Light</ToggleGroupItem>
        </ToggleGroup>
        <GroundControl surface={surface} />
      </div>
      {!still && placements.length > 1 && (
        <ToggleGroup
          aria-label="Placement"
          className="w-auto"
          onValueChange={(next) => {
            if (!next) {
              return
            }
            patch({ placement: next })
            restart()
          }}
          type="single"
          value={placement}
          variant="segmented"
        >
          {placements.map((candidate) => (
            <ToggleGroupItem className="capitalize" key={candidate} value={candidate}>
              {candidate}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {!still && (
        <Playback
          live={live}
          onToggleLive={onToggleLive}
          patch={patch}
          paused={session.paused}
          restart={restart}
        />
      )}
      <div className="ml-auto flex flex-wrap items-center gap-4">{children}</div>
    </div>
  )
}

function Playback({
  live,
  onToggleLive,
  patch,
  paused,
  restart,
}: {
  live: boolean
  onToggleLive: () => void
  patch: Patch
  paused: boolean
  restart: () => void
}) {
  return (
    <div className="flex h-[30px] items-center divide-x divide-input overflow-hidden rounded-md border border-input">
      <IconAction
        label={paused ? 'Play' : 'Pause'}
        onClick={() => patch({ paused: !paused })}
        shortcut="Space"
      >
        {paused ? <IconPlayerPlay /> : <IconPlayerPause />}
      </IconAction>
      <IconAction label="Restart" onClick={restart}>
        <IconRefresh />
      </IconAction>
      <IconAction
        label={live ? 'Turn the live preview off' : 'Turn the live preview on'}
        onClick={onToggleLive}
      >
        <span
          aria-hidden
          className={cn('size-2 rounded-full', live ? 'bg-success' : 'bg-muted-foreground')}
        />
      </IconAction>
    </div>
  )
}

function SeedField({
  onChange,
  onRandomize,
  seed,
}: {
  onChange: (seed: number) => void
  onRandomize: () => void
  seed: number
}) {
  return (
    <label
      className="flex items-center gap-2 text-muted-foreground text-xs/4"
      htmlFor="studio-seed"
    >
      Seed
      <span className="flex h-[30px] items-center divide-x divide-input overflow-hidden rounded-md border border-input">
        <Input
          className="h-full w-23 rounded-none border-0 px-2.5 text-left"
          id="studio-seed"
          max={SEED_MAX}
          min={0}
          onChange={(event) =>
            onChange(Math.min(SEED_MAX, Math.max(0, Number(event.target.value) || 0)))
          }
          type="number"
          value={seed}
          variant="value"
        />
        <IconAction label="Randomize seed" onClick={onRandomize} shortcut="R">
          <IconDice5 />
        </IconAction>
      </span>
    </label>
  )
}

function FrameField({ frame, onChange }: { frame: number; onChange: (frame: number) => void }) {
  const set = (next: number) => onChange(Math.min(FRAME_MAX, Math.max(1, next || 1)))
  return (
    <label
      className="flex items-center gap-2 text-muted-foreground text-xs/4"
      htmlFor="studio-frame"
    >
      Frame
      <span className="flex h-[30px] items-center divide-x divide-input overflow-hidden rounded-md border border-input">
        <Button
          aria-label="Earlier frame"
          className="h-full w-6.5 rounded-none"
          disabled={frame <= 1}
          onClick={() => set(frame - 10)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconMinus />
        </Button>
        <Input
          className="h-full w-12 rounded-none border-0 text-center"
          id="studio-frame"
          max={FRAME_MAX}
          min={1}
          onChange={(event) => set(Number(event.target.value))}
          type="number"
          value={frame}
          variant="value"
        />
        <Button
          aria-label="Later frame"
          className="h-full w-6.5 rounded-none"
          disabled={frame >= FRAME_MAX}
          onClick={() => set(frame + 10)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconPlus />
        </Button>
      </span>
    </label>
  )
}
