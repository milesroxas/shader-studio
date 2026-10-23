'use client'

import { toast, useDocumentInfo, useForm } from '@payloadcms/ui'
import { IconDownload, IconExternalLink, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'

import type { LookGround, Still, StillUses, StudioGround } from '../../core/index.js'
import type { Stills } from '../draft.js'
import type { LookState } from '../look-store.js'
import type { StillStatus } from '../status.js'
import type { StillSelection } from '../store.js'

import {
  CUSTOM_USE,
  POSTER_CAPTURE,
  stillLabel,
  stillUseIds,
  studioGround,
  withCustomUse,
} from '../../core/index.js'
import { renderStill } from '../publish.js'
import { Button } from '../ui/button.js'
import { Checkbox } from '../ui/checkbox.js'
import { cn } from '../ui/cn.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
import { Input } from '../ui/input.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.js'
import { SettingRow, SettingToggle } from './SettingRow.js'

const SCALES = [
  ['1', '1×'],
  ['2', '2×'],
] as const

const STATUS_COPY: Record<StillStatus, { text: string; tone: string }> = {
  changed: { text: 'Re-renders on publish', tone: 'bg-warning' },
  live: { text: 'On the site', tone: 'bg-success' },
  new: { text: 'Not published', tone: 'bg-muted-foreground' },
}

/** A tab opened on the click, while the browser still counts it as the editor's; the file loads in it once it is filed. */
function openTab() {
  const tab = window.open('', '_blank')
  if (tab) {
    tab.opener = null
  }
  return tab
}

const absolute = (url: string) => new URL(url, window.location.origin).href

type PanelProps = {
  ground: LookGround
  look: LookState
  status: (still: Still) => StillStatus
  stills: Stills
  unchangedLook: boolean
}

/**
 * The Inspector's Stills tab: the look's static renders, one per use, and the
 * poster pair that every look has. Choosing one puts it on the stage, where
 * the seed, the moment and the face are set, and makes the Look and
 * interaction tabs edit its own overrides. What is here is the still's
 * output: its use, size, density and encoding, and the ways out: open,
 * download, remove. Publish renders every still that is not already on the
 * site as the draft has it.
 */
export function StillsPanel({ ground, look, status, stills, unchangedLook }: PanelProps) {
  const { add, select, selected, selection, studio } = stills
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[58ch] text-muted-foreground text-xs/5">
        Stills are shots of this look for one use each. The site serves the uses it lists wherever
        the look opens a page; the rest are yours to download. Publish renders what changed.
      </p>
      <ul className="flex flex-col divide-y divide-border border-border border-y">
        <PosterRow
          defaults={studio.ground}
          ground={ground}
          onSelect={() => select(selection === 'poster' ? null : 'poster')}
          poster={look.live?.poster ?? null}
          selected={selection === 'poster'}
          state={unchangedLook ? 'live' : look.live ? 'changed' : 'new'}
        />
        {stills.stills.map((still) => (
          <StillRow
            defaults={studio.ground}
            ground={ground}
            key={still.id}
            onSelect={() => select(selection === still.id ? null : still.id)}
            selected={selection === still.id}
            state={status(still)}
            still={still}
            thumbnail={thumbnailOf(still, look)}
            uses={studio.stillUses}
          />
        ))}
      </ul>
      <AddStill onAdd={add} stills={stills.stills} uses={studio.stillUses} />
      {selected && (
        <StillSettings
          ground={ground}
          key={selected.id}
          look={look}
          select={select}
          state={status(selected)}
          still={selected}
          stills={stills}
        />
      )}
    </div>
  )
}

/** The admin thumbnail of a still's published render, when the site has one. */
function thumbnailOf(still: Still, look: LookState) {
  const published = look.live?.stills.find((candidate) => candidate.id === still.id)
  return published ? (look.live?.renders.get(String(published.media))?.thumbnail ?? null) : null
}

function Row({
  aspect,
  ground,
  meta,
  onSelect,
  selected,
  state,
  thumbnail,
  title,
}: {
  aspect: string
  ground: string
  meta: string
  onSelect: () => void
  selected: boolean
  state: StillStatus
  thumbnail: null | string
  title: string
}) {
  const { text, tone } = STATUS_COPY[state]
  return (
    <li>
      <button
        aria-pressed={selected}
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 py-2 text-left transition-colors hover:bg-muted',
          '-mx-(--row-gutter) w-[calc(100%+2*var(--row-gutter))] px-(--row-gutter)',
          selected && 'bg-muted',
        )}
        onClick={onSelect}
        type="button"
      >
        <span
          className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-input"
          style={{ backgroundColor: ground }}
        >
          <span
            className="block max-h-full max-w-full overflow-hidden"
            style={{ aspectRatio: aspect, height: '100%' }}
          >
            {thumbnail && (
              <img alt="" className="size-full object-cover" loading="lazy" src={thumbnail} />
            )}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              'truncate text-xs/4',
              selected ? 'text-foreground' : 'text-foreground/80',
            )}
          >
            {title}
          </span>
          <span className="truncate font-mono text-[11px]/3.5 text-muted-foreground tabular-nums">
            {meta}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px]/3.5 text-muted-foreground">
          <span aria-hidden className={cn('size-1.5 rounded-full', tone)} />
          {text}
        </span>
      </button>
    </li>
  )
}

function PosterRow({
  defaults,
  ground,
  onSelect,
  poster,
  selected,
  state,
}: {
  defaults: StudioGround
  ground: LookGround
  onSelect: () => void
  poster: null | string
  selected: boolean
  state: StillStatus
}) {
  return (
    <Row
      aspect={`${POSTER_CAPTURE.width} / ${POSTER_CAPTURE.height}`}
      ground={studioGround(ground, 'dark', defaults)}
      meta={`${POSTER_CAPTURE.width} × ${POSTER_CAPTURE.height} · both faces · alpha`}
      onSelect={onSelect}
      selected={selected}
      state={state}
      thumbnail={poster}
      title="Poster"
    />
  )
}

function StillRow({
  defaults,
  ground,
  onSelect,
  selected,
  state,
  still,
  thumbnail,
  uses,
}: {
  defaults: StudioGround
  ground: LookGround
  onSelect: () => void
  selected: boolean
  state: StillStatus
  still: Still
  thumbnail: null | string
  uses: StillUses
}) {
  return (
    <Row
      aspect={`${still.width} / ${still.height}`}
      ground={studioGround(ground, still.surface, defaults)}
      meta={`${still.width} × ${still.height}${still.scale > 1 ? ` · ${still.scale}×` : ''} · ${still.surface}`}
      onSelect={onSelect}
      selected={selected}
      state={state}
      thumbnail={thumbnail}
      title={stillLabel(uses, still)}
    />
  )
}

/** The uses a look can still take: a single use already held is offered no second time. */
function AddStill({
  onAdd,
  stills,
  uses,
}: {
  onAdd: (use: string) => void
  stills: Still[]
  uses: StillUses
}) {
  const all = withCustomUse(uses)
  const held = new Set(stills.map((still) => still.use))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="w-fit" size="sm" type="button" variant="outline">
          <IconPlus aria-hidden />
          Add still
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {stillUseIds(uses).map((use) => {
          const { description, height, label, single, width } = all[use]
          const taken = Boolean(single && held.has(use))
          return (
            <DropdownMenuItem
              className="flex-col items-start gap-0.5"
              disabled={taken}
              key={use}
              onSelect={() => onAdd(use)}
            >
              <span className="flex w-full items-baseline gap-2">
                <span className="flex-1">{label}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {width} × {height}
                </span>
              </span>
              <span className="text-[11px]/4 text-muted-foreground">
                {taken ? 'This look has one.' : description}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A still's output settings and the ways out of the Studio with it. */
function StillSettings({
  ground,
  look,
  select,
  state,
  still,
  stills,
}: {
  ground: LookGround
  look: LookState
  select: (next: StillSelection) => void
  state: StillStatus
  still: Still
  stills: Stills
}) {
  const { id, effectId, patch, recipe, remove, studio } = stills
  const { submit } = useForm()
  const { title } = useDocumentInfo()
  const [busy, setBusy] = useState<'download' | 'open' | null>(null)
  const uses = withCustomUse(studio.stillUses)
  const spec = (use: string) => uses[use]
  const set = (next: Partial<Still>) => patch(still.id, next)
  const overrides = Object.keys(still.deltas).length
  const custom = still.use === CUSTOM_USE

  /** The still's file: the published render while it is what the draft asks for, else one rendered now. */
  const fileFor = async () => {
    const published = look.live?.stills.find((candidate) => candidate.id === still.id)
    const render = published && look.live?.renders.get(String(published.media))
    if (state === 'live' && render) {
      return absolute(render.url)
    }
    if (!id) {
      throw new Error('Save this look first.')
    }
    const media = await renderStill(
      studio,
      submit,
      { id, effect: effectId, ground, recipe, stills: stills.stills },
      still,
    )
    if (!media.url) {
      throw new Error('The still was filed without a URL.')
    }
    return absolute(media.url)
  }

  const open = async () => {
    const tab = openTab()
    setBusy('open')
    try {
      const url = await fileFor()
      if (tab) {
        tab.location.href = url
      }
    } catch (error) {
      tab?.close()
      toast.error((error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const download = async () => {
    setBusy('download')
    try {
      const url = await fileFor()
      const name = `${title || 'look'} ${stillLabel(studio.stillUses, still)}`.replace(
        /[^\w.-]+/g,
        '-',
      )
      const blob = await fetch(url)
        .then((response) => (response.ok ? response.blob() : null))
        .catch(() => null)
      const anchor = document.createElement('a')
      anchor.href = blob ? URL.createObjectURL(blob) : url
      anchor.download = `${name}.${still.format}`
      anchor.rel = 'noopener'
      anchor.click()
      if (blob) {
        setTimeout(() => URL.revokeObjectURL(anchor.href), 1000)
      }
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      aria-label={`${stillLabel(studio.stillUses, still)} settings`}
      className="flex flex-col border-border border-t pt-3"
    >
      <p className="pb-2 text-[11px]/4 text-muted-foreground">
        On the stage. Seed, moment and face are set there; the Look and interaction tabs now edit
        this still&apos;s own overrides.
      </p>
      <SettingRow htmlFor="studio-still-use" label="Use">
        <Select
          onValueChange={(next) => {
            const use = next
            const { height, width } = spec(use)
            set({
              height: use === CUSTOM_USE ? still.height : height,
              label: use === CUSTOM_USE ? still.label || 'Custom' : undefined,
              transparent: use === CUSTOM_USE ? still.transparent : false,
              use,
              width: use === CUSTOM_USE ? still.width : width,
            })
          }}
          value={still.use}
        >
          <SelectTrigger className="col-span-2 w-full" id="studio-still-use" size="field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {stillUseIds(studio.stillUses).map((use) => {
              const { description, label, single } = spec(use)
              const taken =
                single && use !== still.use && stills.stills.some((other) => other.use === use)
              return (
                <SelectItem
                  description={description}
                  disabled={Boolean(taken)}
                  key={use}
                  value={use}
                >
                  {label}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </SettingRow>
      {custom && (
        <SettingRow htmlFor="studio-still-label" label="Name">
          <Input
            className="col-span-2 w-full text-left"
            id="studio-still-label"
            maxLength={80}
            onChange={(event) => set({ label: event.target.value })}
            value={still.label ?? ''}
            variant="value"
          />
        </SettingRow>
      )}
      {custom && <SizeRow set={set} still={still} />}
      <SettingToggle
        label="Scale"
        onChange={(next) => set({ scale: Number(next) as Still['scale'] })}
        options={SCALES}
        value={String(still.scale)}
      />
      <SettingRow htmlFor="studio-still-format" label="Format">
        <Select
          onValueChange={(next) =>
            set({
              format: next as Still['format'],
              transparent: next === 'jpeg' ? false : still.transparent,
            })
          }
          value={still.format}
        >
          <SelectTrigger className="w-full" id="studio-still-format" size="field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="webp">WebP</SelectItem>
            <SelectItem value="jpeg">JPEG</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      {custom && (
        <SettingRow htmlFor="studio-still-transparent" label="Alpha">
          <div className="col-span-2 flex items-center gap-2">
            <Checkbox
              checked={still.transparent}
              disabled={still.format === 'jpeg'}
              id="studio-still-transparent"
              onCheckedChange={(checked) => set({ transparent: checked === true })}
            />
            <span className="text-[11px]/4 text-muted-foreground">
              {still.format === 'jpeg' ? 'JPEG is always filled.' : 'Transparent ground.'}
            </span>
          </div>
        </SettingRow>
      )}
      <SettingRow label="Overrides">
        <span className="col-span-2 flex items-center gap-3 text-[11px]/4 text-muted-foreground">
          <span className="flex-1">
            {overrides
              ? `${overrides} ${overrides === 1 ? 'setting departs' : 'settings depart'} from the look.`
              : 'As the look runs, at this seed and moment.'}
          </span>
          {overrides > 0 && (
            <button
              className="pressable cursor-pointer hover:text-foreground"
              onClick={() => set({ deltas: {} })}
              type="button"
            >
              Reset
            </button>
          )}
        </span>
      </SettingRow>
      <div className="mt-3 flex flex-wrap items-center gap-1 border-border border-t pt-3">
        <Button disabled={busy !== null} onClick={open} size="sm" type="button" variant="outline">
          <IconExternalLink aria-hidden />
          {busy === 'open' ? 'Rendering…' : state === 'live' ? 'Open' : 'Render and open'}
        </Button>
        <Button disabled={busy !== null} onClick={download} size="sm" type="button" variant="ghost">
          <IconDownload aria-hidden />
          {busy === 'download' ? 'Rendering…' : 'Download'}
        </Button>
        <Button
          className="ml-auto text-muted-foreground"
          disabled={busy !== null}
          onClick={() => {
            remove(still.id)
            select(null)
            toast.success('Removed. Undo brings it back.')
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          Remove
        </Button>
      </div>
    </section>
  )
}

/** A side of a custom still: free while typed, held to 320 to 1920 on commit. */
function SideField({
  id,
  label,
  onCommit,
  value,
}: {
  id?: string
  label: string
  onCommit: (next: number) => void
  value: number
}) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : String(value)
  const commit = () => {
    setEditing(false)
    const next = Math.round(Number.parseFloat(draft))
    if (Number.isFinite(next)) {
      onCommit(Math.min(1920, Math.max(320, next)))
    }
  }
  return (
    <Input
      aria-label={label}
      className="min-w-0 flex-1"
      id={id}
      inputMode="numeric"
      max={1920}
      min={320}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        setDraft(String(value))
        setEditing(true)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
          event.currentTarget.blur()
        }
      }}
      type="number"
      value={shown}
      variant="value"
    />
  )
}

function SizeRow({ set, still }: { set: (next: Partial<Still>) => void; still: Still }) {
  const megapixels = (still.width * still.height * still.scale ** 2) / 1_000_000
  return (
    <SettingRow htmlFor="studio-still-width" label="Size">
      <div className="flex items-center gap-1.5">
        <SideField
          id="studio-still-width"
          label="Width"
          onCommit={(width) => set({ width })}
          value={still.width}
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">×</span>
        <SideField label="Height" onCommit={(height) => set({ height })} value={still.height} />
      </div>
      <span className="text-right font-mono text-[11px]/3.5 text-muted-foreground tabular-nums">
        {megapixels.toFixed(1)} MP
      </span>
    </SettingRow>
  )
}
