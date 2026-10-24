'use client'

import '../../styles/studio.css'

import { IconChevronsDown, IconChevronsUp } from '@tabler/icons-react'
import type { JSONFieldClientComponent } from 'payload'
import { useState } from 'react'

import type { Effect, Recipe, Still, StillUses, Tuning } from '../../core/index.js'
import {
  resolveRecipeTuning,
  resolveTuning,
  stillLabel,
  validateRecipe,
  validateStills,
} from '../../core/index.js'
import type { Stills } from '../draft.js'
import { useGround, useStills } from '../draft.js'
import { useLook } from '../look-store.js'
import {
  type EffectCopy,
  type GroupSummary,
  lookGroups,
  parameterCopy,
  parameterKeys,
  toHex,
} from '../parameters.js'
import { draftState } from '../status.js'
import { cn } from '../ui/cn.js'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.js'
import { ParameterRow, RangePairRow, type RowParameter } from './ParameterRow.js'
import { StillsPanel } from './StillsPanel.js'

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A collapsed group's one line: text, or the colours it is set to. */
const summaryNode = (summary: GroupSummary) =>
  typeof summary === 'string' ? (
    summary
  ) : (
    <span className="flex gap-1">
      {summary.swatches.map((rgb, index) => (
        <span
          aria-hidden
          className="size-3 rounded-[3px] ring-1 ring-border ring-inset"
          // biome-ignore lint/suspicious/noArrayIndexKey: a swatch is its position in the palette
          key={index}
          style={{ backgroundColor: toHex(rgb) }}
        />
      ))}
    </span>
  )

/** The message a draft is refused with, or nothing. */
function validationOf(read: () => unknown) {
  try {
    read()
    return ''
  } catch (error) {
    return (error as Error).message
  }
}

/**
 * What the rows edit: the look, whose values depart from the effect's
 * defaults, or one still, whose overrides depart from the look. The rows,
 * the dots and the summaries read the same way for both; only what counts as
 * the base changes, and `base` names it in each tooltip.
 */
type Target = {
  base: 'default' | 'look'
  defaults: Tuning
  overrides: Tuning
  set: (overrides: Tuning) => void
  tuning: Tuning
  validation: string
}

function lookTarget(effect: Effect, recipe: Recipe, update: Stills['update']): Target {
  return {
    base: 'default',
    defaults: effect.defaults,
    overrides: recipe.deltas,
    set: (deltas) => update({ ...recipe, deltas }),
    tuning: resolveRecipeTuning(effect, recipe),
    validation: validationOf(() => validateRecipe(effect, recipe)),
  }
}

function stillTarget(
  uses: StillUses,
  effect: Effect,
  recipe: Recipe,
  still: Still,
  patch: Stills['patch'],
): Target {
  const defaults = resolveRecipeTuning(effect, recipe)
  return {
    base: 'look',
    defaults,
    overrides: still.deltas,
    set: (deltas) => patch(still.id, { deltas }),
    tuning: resolveTuning(defaults, still.deltas),
    validation: validationOf(() => validateStills(uses, effect, recipe, [still])),
  }
}

/** The target as the panel edits it: what each parameter is set to, and the edits that change it. */
function recipePanel(effect: Effect, copy: EffectCopy, target: Target) {
  const { base, defaults, overrides, tuning, validation } = target
  const change = (patch: Record<string, unknown>) => {
    const next = { ...overrides }
    for (const [name, value] of Object.entries(patch)) {
      if (value === undefined || sameValue(value, defaults[name])) {
        delete next[name]
      } else {
        next[name] = value
      }
    }
    target.set(next)
  }
  const reset = (keys: readonly string[]) => {
    const next = { ...overrides }
    for (const name of keys) {
      delete next[name]
    }
    target.set(next)
  }
  const changedKeys = Object.keys(overrides)
  // A pair out of order is the one rule the effect checks across parameters,
  // so its message belongs under the pair rather than under the panel.
  const crossed = copy.ranges?.find(({ keys }) => Number(tuning[keys[0]]) > Number(tuning[keys[1]]))
  return { base, change, changedKeys, copy, crossed, defaults, effect, reset, tuning, validation }
}

type Panel = ReturnType<typeof recipePanel>

/**
 * The rows of a group, without the section around them: the Look tab puts
 * them in a disclosure, the interaction tab, which is one group, does not.
 */
function rowsOf(
  keys: string[],
  { base, change, changedKeys, copy, crossed, defaults, effect, reset, tuning, validation }: Panel,
) {
  const parameter = (name: string): RowParameter => ({
    name,
    base,
    copy: parameterCopy(copy, name),
    fallback: defaults[name],
    spec: effect.parameters[name],
  })
  return keys.map((name) => {
    const pair = copy.ranges?.find(({ keys: bounds }) => bounds.includes(name))
    if (pair) {
      const [low, high] = pair.keys
      if (name === high) {
        return null
      }
      return (
        <RangePairRow
          changed={pair.keys.some((key) => changedKeys.includes(key))}
          error={pair === crossed ? validation : undefined}
          high={{ ...parameter(high), value: Number(tuning[high]) }}
          key={pair.label}
          label={pair.label}
          low={{ ...parameter(low), value: Number(tuning[low]) }}
          onChange={change}
          onReset={() => reset(pair.keys)}
        />
      )
    }
    const dependency = copy.dependencies[name]
    return (
      <ParameterRow
        changed={changedKeys.includes(name)}
        hint={copy.hint?.(name, tuning)}
        inactive={dependency && !dependency.active(tuning) ? dependency : undefined}
        key={name}
        onChange={(next) => change({ [name]: next })}
        onFix={(fix) => fix && change(fix)}
        onReset={() => reset([name])}
        parameter={parameter(name)}
        value={tuning[name]}
      />
    )
  })
}

/**
 * Which sections are open lives in the Inspector rather than in each group: a
 * document opens with every section shut, so the panel reads as a contents
 * page of what this look is set to before it asks anyone to read a slider;
 * one control can drive them all; and a tab switch, which unmounts the
 * content it leaves, no longer forgets what was open.
 */
function useOpenSections(groups: string[]) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  // Sections are the Look tab's structure, so the control that works them is
  // the Look tab's too. The label names what the press does from here.
  const allOpen = groups.every((name) => openGroups[name])
  const toggleAll = () =>
    setOpenGroups(allOpen ? {} : Object.fromEntries(groups.map((name) => [name, true])))
  return { allOpen, groups, openGroups, setOpenGroups, toggleAll }
}

/**
 * The Inspector: every authorable parameter of the look's effect as a row,
 * grouped into sections on the Look tab and flat on the interaction tab when
 * the effect's copy names one, and the look's stills on the Stills tab, in
 * the document sidebar so it stays beside the stage on every tab. It reads
 * the rows off the effect's contract and their wording off its copy, so it
 * holds no parameter by name. It is the recipe field's own component: the
 * value it edits is the field's value, so Payload's autosave, versions and
 * validation see every change as they would any other field's. With a still
 * chosen on the Stills tab, the Look and interaction rows edit that still's
 * overrides instead, and the bar under the tabs says so.
 */
export const Inspector: JSONFieldClientComponent = ({ path }) => {
  const stills = useStills(path)
  const { id, copy, effect, errorMessage, patch, recipe, select, selected, studio, update } = stills
  const { ground } = useGround()
  const look = useLook(id)
  const state = draftState(effect, recipe, ground, stills.stills, look.live)
  const target = selected
    ? stillTarget(studio.stillUses, effect, recipe, selected, patch)
    : lookTarget(effect, recipe, update)
  const panel = recipePanel(effect, copy, target)
  const { changedKeys, validation } = panel
  const [tab, setTab] = useState('look')
  const sections = useOpenSections(lookGroups(effect, copy))
  const { interaction } = copy
  const interactionKeys = interaction ? parameterKeys(effect, interaction.group) : []

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={600}>
      {/* Payload's sidebar gutter is zeroed for the Studio (studio.css), so
          the panel owns its margins: content never touches the column edge,
          and the change dots live in the left one. The trailing space is the
          scroll region's own: the last row of the last group has to clear the
          bottom of the column rather than end on it. */}
      <div className="flex flex-col gap-3 px-(--row-gutter) pb-16" data-shader-studio="inspector">
        <Tabs className="gap-0" onValueChange={setTab} value={tab}>
          <TabStrip
            allOpen={sections.allOpen}
            changed={changedKeys.length}
            interactionLabel={interaction?.label}
            onToggleAll={sections.toggleAll}
            showToggle={tab === 'look'}
            stillsApart={state.stillsApart}
          />
          {selected && (
            <SelectionBar
              editing={tab !== 'stills'}
              label={stillLabel(studio.stillUses, selected)}
              onDone={() => select(null)}
            />
          )}
          <LookTab panel={panel} sections={sections} />
          {interaction && (
            <InteractionTab
              changed={interactionKeys.filter((k) => changedKeys.includes(k)).length}
              label={interaction.label}
              note={interaction.note}
              onReset={() => panel.reset(interactionKeys)}
            >
              {rowsOf(interactionKeys, panel)}
            </InteractionTab>
          )}
          <TabsContent className="pt-5" value="stills">
            <StillsPanel
              ground={ground}
              look={look}
              status={state.status}
              stills={stills}
              unchangedLook={state.unchangedLook}
            />
          </TabsContent>
        </Tabs>
        {(validation || errorMessage) && !panel.crossed && (
          <p className="text-destructive text-xs/relaxed" role="alert">
            {validation || errorMessage}
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * The tab strip is the scroll region's header: it names where you are and
 * carries the changed count, so it stays put while the groups run under it.
 * The strip is the sticky band and owns the hairline; the tab list inside it
 * holds tabs and nothing else, so the controls at its right end stay out of
 * the `tablist`.
 */
function TabStrip({
  allOpen,
  changed,
  interactionLabel,
  onToggleAll,
  showToggle,
  stillsApart,
}: {
  allOpen: boolean
  changed: number
  interactionLabel?: string
  onToggleAll: () => void
  showToggle: boolean
  stillsApart: number
}) {
  return (
    <div className="sticky top-0 z-20 -mx-(--row-gutter) flex h-(--inspector-tabs) items-center gap-5 border-border border-b bg-background px-(--row-gutter)">
      <TabsList className="h-full gap-5 border-b-0" variant="line">
        <TabsTrigger value="look">Look</TabsTrigger>
        {interactionLabel && <TabsTrigger value="interaction">{interactionLabel}</TabsTrigger>}
        <TabsTrigger className="gap-1.5" value="stills">
          Stills
          {/* A still that will render on publish is marked where the tab is,
              so the count of edits on the strip stays the count of rows. */}
          {stillsApart > 0 && <span aria-hidden className="size-1.5 rounded-full bg-warning" />}
          {stillsApart > 0 && (
            <span className="sr-only">{stillsApart} stills render on publish</span>
          )}
        </TabsTrigger>
      </TabsList>
      {/* The count and the section control are the strip's right end:
          what has changed, and how much of the panel is open. The
          control is left out of the tabs that have no sections to
          work, rather than shown there dimmed; its slot stays, so the
          count, the one thing on the strip that outlives a tab switch,
          does not move when the tab changes. */}
      <div className="ml-auto flex items-center gap-2.5">
        <span
          aria-live="polite"
          className="font-mono text-[11px]/3.5 text-primary tabular-nums tracking-[0.02em]"
        >
          {changed ? `${changed} changed` : ''}
        </span>
        <div className="-mr-1 size-6 shrink-0">
          {showToggle && <ToggleAllButton allOpen={allOpen} onClick={onToggleAll} />}
        </div>
      </div>
    </div>
  )
}

/**
 * The one line that says what the rows are editing while a still is chosen:
 * a still's overrides, not the look. It parks under the tab strip on every
 * tab, and Done puts the look back under the rows and on the stage.
 */
function SelectionBar({
  editing,
  label,
  onDone,
}: {
  editing: boolean
  label: string
  onDone: () => void
}) {
  return (
    <div
      className="sticky top-(--inspector-tabs) z-20 -mx-(--row-gutter) flex min-h-8 items-center gap-2.5 border-border border-b bg-muted/60 px-(--row-gutter) text-[11px]/4 backdrop-blur-xs"
      role="status"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="min-w-0 flex-1 truncate text-foreground">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {editing ? ' · the rows override the look for this still' : ' · on the stage'}
        </span>
      </span>
      <button
        className="pressable shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
        onClick={onDone}
        type="button"
      >
        Done
      </button>
    </div>
  )
}

function ToggleAllButton({ allOpen, onClick }: { allOpen: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={allOpen ? 'Collapse all sections' : 'Expand all sections'}
          className="pressable flex size-full cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={onClick}
          type="button"
        >
          {allOpen ? (
            <IconChevronsUp aria-hidden className="size-3.5" />
          ) : (
            <IconChevronsDown aria-hidden className="size-3.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {allOpen ? 'Collapse all' : 'Expand all'}
      </TooltipContent>
    </Tooltip>
  )
}

function LookTab({
  panel,
  sections: { groups, openGroups, setOpenGroups },
}: {
  panel: Panel
  sections: ReturnType<typeof useOpenSections>
}) {
  const { changedKeys, copy, effect, reset, tuning } = panel
  return (
    <TabsContent className="flex flex-col pt-5" value="look">
      {groups.map((name) => {
        const keys = parameterKeys(effect, name)
        return (
          <Group
            changed={keys.filter((k) => changedKeys.includes(k)).length}
            key={name}
            name={name}
            onOpenChange={(next) => setOpenGroups((state) => ({ ...state, [name]: next }))}
            onReset={() => reset(keys)}
            open={openGroups[name] ?? false}
            summary={summaryNode(copy.summary(name, tuning))}
          >
            {rowsOf(keys, panel)}
          </Group>
        )
      })}
    </TabsContent>
  )
}

/**
 * One group's worth of rows, so they are not put behind a disclosure: a
 * section that opens onto the whole tab is a click between the editor and the
 * only thing there. The tab names the section, the paragraph says when the
 * terms run, and Reset keeps the place it holds in a section header.
 */
function InteractionTab({
  changed,
  children,
  label,
  note,
  onReset,
}: {
  changed: number
  children: React.ReactNode
  label: string
  note: string
  onReset: () => void
}) {
  return (
    <TabsContent className="flex flex-col pt-5" value="interaction">
      <div className="flex items-start gap-4">
        <p className="min-w-0 flex-1 text-muted-foreground text-xs/5">{note}</p>
        {/* Hidden rather than absent: the note beside it keeps one wrap
            whether or not anything has been changed, so a slider does
            not push every row down the moment it leaves its default. */}
        <button
          aria-label={`Reset ${label.toLowerCase()} terms`}
          className={cn(
            'pressable shrink-0 cursor-pointer text-[11px]/5 text-muted-foreground hover:text-foreground',
            changed === 0 && 'invisible',
          )}
          onClick={onReset}
          type="button"
        >
          Reset
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-0.5 border-border border-t pt-3">{children}</div>
    </TabsContent>
  )
}

/**
 * One section of the Inspector. The header is a row, not a single button:
 * the trigger takes the name and, while the group is closed, the one line
 * that says what it is set to. Reset is a real button beside it, and it is
 * there only when the group has something to reset: an always-present,
 * always-dimmed control is chrome, not an affordance. Nothing counts the
 * changed values: the dots in the gutter already mark them row by row, and
 * the total lives once, in the tab strip. Open is the panel's state, not the
 * section's, so one control in that strip can work them all.
 */
function Group({
  name,
  changed,
  children,
  onOpenChange,
  onReset,
  open,
  summary,
}: {
  changed: number
  children: React.ReactNode
  name: string
  onOpenChange: (open: boolean) => void
  onReset: () => void
  open: boolean
  summary: React.ReactNode
}) {
  return (
    <Collapsible className="border-border border-b" onOpenChange={onOpenChange} open={open}>
      {/* The section header parks under the tab strip while its own rows
          scroll, and hands over when the next group reaches it, so the name
          of the thing being edited is never off screen. */}
      <div className="sticky top-(--inspector-tabs) z-10 -mx-(--row-gutter) flex items-center gap-2.5 bg-background px-(--row-gutter)">
        <CollapsibleTrigger className="w-auto min-w-0 flex-1 text-[11px]/4 text-muted-foreground uppercase tracking-[0.06em] hover:text-foreground data-[state=open]:text-foreground">
          {name}
          {!open && (
            <span className="ml-auto flex items-center gap-2 whitespace-nowrap font-mono font-normal text-[11px]/3.5 text-muted-foreground normal-case tabular-nums tracking-normal">
              {changed > 0 && (
                <>
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="sr-only">{changed} changed</span>
                </>
              )}
              {summary}
            </span>
          )}
        </CollapsibleTrigger>
        {open && changed > 0 && (
          <button
            aria-label={`Reset ${name}`}
            className="pressable shrink-0 cursor-pointer text-[11px]/3.5 text-muted-foreground hover:text-foreground"
            onClick={onReset}
            type="button"
          >
            Reset
          </button>
        )}
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
