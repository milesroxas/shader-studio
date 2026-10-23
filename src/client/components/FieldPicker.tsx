'use client'

import '../../styles/studio.css'

import type { RelationshipFieldClientProps } from 'payload'

import { toast, useDocumentDrawer, useDocumentInfo, useField, useFormFields } from '@payloadcms/ui'
import { IconPlus } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'

import type { LookFieldClientProps } from '../../fields/look-field.js'
import type { Studio } from '../config.js'

import {
  emptyRecipe,
  isEffectId,
  isLookId,
  lookGround,
  lookOptions,
  starterRecipe,
  studioGround,
} from '../../core/index.js'
import { EFFECT_FIELD } from '../../paths.js'
import { useStudio } from '../config.js'
import { posterOf } from '../look-store.js'
import { sessionKey, studioStore } from '../store.js'
import { Button } from '../ui/button.js'
import { cn } from '../ui/cn.js'
import { Input } from '../ui/input.js'

type LookDoc = {
  effect?: string
  ground?: unknown
  id: number | string
  snapshot?: unknown
  thumbnail?: unknown
  title?: string
} & Record<string, unknown>

type PickerProps = Partial<LookFieldClientProps> & RelationshipFieldClientProps

const idOf = (value: unknown): null | number | string =>
  value && typeof value === 'object' && 'id' in value
    ? (value as { id: number | string }).id
    : typeof value === 'number' || (typeof value === 'string' && value)
      ? value
      : null

type Id = null | number | string | undefined

const sameId = (a: Id, b: Id) => a != null && b != null && String(a) === String(b)

/** The path of a sibling of this field: the field's path with its last segment replaced. */
const siblingPath = (path: string, name: string) =>
  [...path.split('.').slice(0, -1), name].join('.')

/** The colour under a look's dark poster: its own dark ground, else the Studio's. */
const groundOf = (studio: Studio, look: LookDoc | null) =>
  studioGround(lookGround(look?.ground), 'dark', studio.ground)

function Card({
  caption,
  children,
  disabled,
  ground,
  onClick,
  selected,
  src,
  title,
}: {
  caption?: string
  children?: React.ReactNode
  disabled?: boolean
  /** The colour under the dark poster: a look's own dark ground, else the Studio's. */
  ground: string
  onClick: () => void
  selected?: boolean
  src?: null | string
  title: string
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        'pressable flex cursor-pointer flex-col gap-1.5 rounded-md border p-1.5 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-60',
        selected ? 'border-primary' : 'border-input',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-sm text-muted-foreground"
        style={{ backgroundColor: ground }}
      >
        {src ? (
          <img alt="" className="size-full object-cover" loading="lazy" src={src} />
        ) : (
          children
        )}
      </span>
      <span className="flex min-w-0 flex-col px-0.5 pb-0.5">
        <span className="truncate font-medium text-xs/4">{title}</span>
        {caption && <span className="truncate text-[11px]/4 text-muted-foreground">{caption}</span>}
      </span>
    </button>
  )
}

type Slot = ReturnType<typeof useSlot>

/** The slot this field fills: the look it holds, its shipped-look sibling when it has one, and the effect it chose. */
function useSlot(studio: Studio, path: string, props: PickerProps) {
  const { effect: slotEffect = studio.registry.defaultEffect, label = 'Slot', placement } = props
  const looksSlug = props.looksSlug ?? studio.looksSlug
  const { errorMessage, setValue, showError, value } = useField<null | number | string>({ path })
  const { title: pageTitle } = useDocumentInfo()
  // The effect is fixed by the field, or chosen in a sibling select.
  const effectPath = typeof slotEffect === 'string' ? null : siblingPath(path, slotEffect.sibling)
  const chosen = useFormFields(([fields]) => (effectPath ? fields[effectPath]?.value : undefined))
  const wanted = typeof slotEffect === 'string' ? slotEffect : chosen
  const effectId = isEffectId(studio.registry, wanted) ? wanted : studio.registry.defaultEffect
  // The shipped-look sibling, when the field names one. Without one the hook
  // reads this field itself and nothing writes through it.
  const presetPath = props.presetField ? siblingPath(path, props.presetField) : null
  const presetField = useField<null | string>({ path: presetPath ?? path })
  const preset = presetPath
    ? {
        errorMessage: presetField.errorMessage,
        setValue: presetField.setValue,
        showError: presetField.showError,
        value: presetField.value,
      }
    : null
  return {
    id: idOf(value),
    effect: studio.effect(effectId),
    effectId,
    error: (showError && errorMessage) || (preset?.showError && preset.errorMessage),
    label,
    looksSlug,
    noun: studio.definition(effectId).copy.noun,
    pageTitle,
    placement,
    preset,
    setValue,
  }
}

/**
 * The published document: its title and poster are what the site shows. A
 * look that was never published answers with its draft and no poster.
 */
function useSelectedLook(
  studio: Studio,
  looksSlug: string,
  id: null | number | string,
  isDrawerOpen: boolean,
) {
  const [selected, setSelected] = useState<LookDoc | null>(null)
  const loadSelected = useCallback(async () => {
    if (!id) {
      return setSelected(null)
    }
    const response = await fetch(`${studio.api}/${looksSlug}/${id}?draft=false&depth=1`, {
      credentials: 'include',
    })
    setSelected(response.ok ? await response.json() : null)
  }, [studio.api, looksSlug, id])
  // Closing the drawer is the moment the look may have been published.
  useEffect(() => {
    if (!isDrawerOpen) {
      void loadSelected().catch(() => {})
    }
  }, [isDrawerOpen, loadSelected])
  return selected
}

/**
 * The slot's effect changed under what it held: a look filed under another
 * effect cannot be drawn here, and a shipped look's id means nothing to this
 * one, so the slot lands on this effect's own default rather than on an error.
 */
function useSlotFollowsEffect(
  { id, effect, effectId, preset, setValue }: Slot,
  selected: LookDoc | null,
  readOnly: boolean | undefined,
) {
  const presetValue = preset?.value
  const setPreset = preset?.setValue
  useEffect(() => {
    if (readOnly) {
      return
    }
    if (selected && sameId(selected.id, id) && selected[EFFECT_FIELD] !== effectId) {
      setValue(null)
    } else if (setPreset && !id && !isLookId(effect, presetValue)) {
      setPreset(effect.fallbackLook)
    }
  }, [readOnly, selected, id, effectId, effect, presetValue, setPreset, setValue])
}

/** A new look made for the slot, which the slot holds and Studio opens at once. */
function useNewLook(studio: Studio, slot: Slot, openDrawer: () => void, onCreated: () => void) {
  const { id } = slot
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState<null | number | string>(null)
  // A look made here opens in Studio as soon as the slot holds it.
  useEffect(() => {
    if (opening !== null && sameId(opening, id)) {
      setOpening(null)
      openDrawer()
    }
  }, [opening, id, openDrawer])

  const create = async () => {
    setBusy(true)
    try {
      const created = await postLook(studio, slot)
      if (slot.placement) {
        studioStore.patch(sessionKey(created), { placement: slot.placement })
      }
      slot.setValue(created)
      onCreated()
      setOpening(created)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, create }
}

/** The author's own looks for this effect, newest first, while the grid is choosing. */
function useLookSearch(
  studio: Studio,
  looksSlug: string,
  choosing: boolean,
  search: string,
  effectId: string,
) {
  const [looks, setLooks] = useState<LookDoc[]>([])
  useEffect(() => {
    if (!choosing) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      // As drafts: an archived flag saved without a publish still hides the look.
      const params = new URLSearchParams({
        [`where[${EFFECT_FIELD}][equals]`]: effectId,
        depth: '1',
        draft: 'true',
        limit: '24',
        sort: '-updatedAt',
        'where[archived][not_equals]': 'true',
      })
      if (search) {
        params.set('where[title][like]', search)
      }
      const response = await fetch(`${studio.api}/${looksSlug}?${params}`, {
        credentials: 'include',
        signal: controller.signal,
      })
      if (response.ok) {
        setLooks((await response.json()).docs)
      }
    }, 200)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [studio.api, looksSlug, choosing, search, effectId])
  return looks
}

/** A new draft look for the slot; resolves to its id. */
async function postLook(
  studio: Studio,
  { effect, effectId, label, looksSlug, noun, pageTitle, preset }: Slot,
) {
  // Start from the shipped look the slot shows now, so "make it mine" begins where the page is.
  const recipe =
    preset && isLookId(effect, preset.value)
      ? starterRecipe(effect, preset.value)
      : emptyRecipe(effect)
  const response = await fetch(`${studio.api}/${looksSlug}?draft=true&depth=0`, {
    body: JSON.stringify({
      _status: 'draft',
      [EFFECT_FIELD]: effectId,
      recipe,
      title: [pageTitle, label].filter(Boolean).join(' · '),
    }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.errors?.[0]?.message ?? `Could not create a ${noun}.`)
  }
  return result.doc.id as number | string
}

/**
 * The visual slot's one picker, for whichever effect the slot chose. A look is
 * used like a media file: the slot holds it, the site shows what is published,
 * and editing happens in Studio, opened here in a drawer so the editor never
 * leaves the page. A shipped look and a look of your own are chosen from the
 * same grid; the grid writes the sibling preset field for the first and this
 * field for the second, and the slot never shows a version.
 */
export function FieldPicker(props: PickerProps) {
  const { path, readOnly } = props
  const studio = useStudio()
  const slot = useSlot(studio, path, props)
  const { id, looksSlug } = slot
  const [choosing, setChoosing] = useState(false)
  const [search, setSearch] = useState('')
  const [DocumentDrawer, , { isDrawerOpen, openDrawer }] = useDocumentDrawer({
    id: id ?? undefined,
    collectionSlug: looksSlug,
  })
  const selected = useSelectedLook(studio, looksSlug, id, isDrawerOpen)
  useSlotFollowsEffect(slot, selected, readOnly)
  const { busy, create } = useNewLook(studio, slot, openDrawer, () => setChoosing(false))
  const looks = useLookSearch(studio, looksSlug, choosing, search, slot.effectId)

  return (
    <div className="mb-6 flex flex-col gap-3" data-shader-studio="picker">
      <span className="text-[13px]/5 text-foreground">{slot.effect.label}</span>

      {id && !choosing ? (
        <ChosenLook
          onChange={() => setChoosing(true)}
          openDrawer={openDrawer}
          readOnly={readOnly}
          selected={selected}
          slot={slot}
          studio={studio}
        />
      ) : (
        <>
          <LookGrid
            busy={busy}
            choosing={choosing}
            looks={looks}
            onChosen={() => setChoosing(false)}
            onCreate={create}
            readOnly={readOnly}
            slot={slot}
            studio={studio}
          />
          <BrowseOrSearch
            choosing={choosing}
            noun={slot.noun}
            onBrowse={() => setChoosing(true)}
            onSearch={setSearch}
            readOnly={readOnly}
            search={search}
          />
        </>
      )}

      {slot.error && (
        <p className="text-destructive text-xs/4" role="alert">
          {slot.error}
        </p>
      )}
      <DocumentDrawer />
    </div>
  )
}

/** What the slot holds now, and the way into Studio to change it. */
function ChosenLook({
  onChange,
  openDrawer,
  readOnly,
  selected,
  slot: { id, noun, placement },
  studio,
}: {
  onChange: () => void
  openDrawer: () => void
  readOnly: boolean | undefined
  selected: LookDoc | null
  slot: Slot
  studio: Studio
}) {
  const edit = () => {
    if (id && placement) {
      studioStore.patch(sessionKey(id), { placement })
    }
    openDrawer()
  }
  const live = Boolean(selected?.snapshot)
  const poster = posterOf(selected?.thumbnail)
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border border-input p-2">
      <span
        className="block aspect-video w-36 shrink-0 overflow-hidden rounded-sm"
        style={{ backgroundColor: groundOf(studio, selected) }}
      >
        {selected && poster && <img alt="" className="size-full object-cover" src={poster} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-[13px]/5">
          {selected?.title ?? `Look #${id}`}
        </span>
        <span className="text-muted-foreground text-xs/4">
          {live
            ? 'The page shows what is published. Edit it in Studio and publish to change it here.'
            : 'Not published yet, so the page shows nothing of it. Open it in Studio and publish.'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button onClick={edit} size="sm" type="button" variant="outline">
          Edit {noun}
        </Button>
        {!readOnly && (
          <Button onClick={onChange} size="sm" type="button" variant="ghost">
            Change
          </Button>
        )}
      </div>
    </div>
  )
}

/** Shipped looks when the slot names a preset field, the author's own while choosing, and a new one made for this slot. */
function LookGrid({
  busy,
  choosing,
  looks,
  onChosen,
  onCreate,
  readOnly,
  slot: { id, effect, label, noun, preset, setValue },
  studio,
}: {
  busy: boolean
  choosing: boolean
  looks: LookDoc[]
  onChosen: () => void
  onCreate: () => void
  readOnly: boolean | undefined
  slot: Slot
  studio: Studio
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
      {preset &&
        lookOptions(effect).map((look) => (
          <Card
            caption="Shipped look"
            disabled={readOnly}
            ground={studio.ground.dark}
            key={look.value}
            onClick={() => {
              preset.setValue(look.value)
              setValue(null)
              onChosen()
            }}
            selected={!id && preset.value === look.value}
            src={effect.lookPoster?.(look.value, 'dark') ?? null}
            title={look.label}
          />
        ))}
      {choosing &&
        looks.map((look) => (
          <Card
            caption={look.snapshot ? `Your ${noun}` : `Your ${noun}, not published`}
            disabled={readOnly}
            ground={groundOf(studio, look)}
            key={look.id}
            onClick={() => {
              setValue(look.id)
              onChosen()
            }}
            selected={sameId(look.id, id)}
            src={posterOf(look.thumbnail)}
            title={look.title ?? `Look #${look.id}`}
          />
        ))}
      {!readOnly && (
        <NewLookCard
          busy={busy}
          ground={studio.ground.dark}
          label={label}
          noun={noun}
          onCreate={onCreate}
        />
      )}
    </div>
  )
}

function NewLookCard({
  busy,
  ground,
  label,
  noun,
  onCreate,
}: {
  busy: boolean
  ground: string
  label: string
  noun: string
  onCreate: () => void
}) {
  return (
    <Card
      caption={`For this ${label.toLowerCase()}`}
      disabled={busy}
      ground={ground}
      onClick={onCreate}
      title={busy ? 'Creating…' : `New ${noun}`}
    >
      <IconPlus aria-hidden className="size-5" />
    </Card>
  )
}

function BrowseOrSearch({
  choosing,
  noun,
  onBrowse,
  onSearch,
  readOnly,
  search,
}: {
  choosing: boolean
  noun: string
  onBrowse: () => void
  onSearch: (search: string) => void
  readOnly: boolean | undefined
  search: string
}) {
  if (choosing) {
    return (
      <Input
        aria-label="Search your looks"
        className="h-8 max-w-xs text-xs"
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Search your looks"
        value={search}
      />
    )
  }
  if (readOnly) {
    return null
  }
  return (
    <button
      className="pressable w-fit cursor-pointer text-muted-foreground text-xs/4 underline hover:text-foreground"
      onClick={onBrowse}
      type="button"
    >
      Use a {noun} made in Studio
    </button>
  )
}
