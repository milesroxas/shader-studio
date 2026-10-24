'use client'

import { IconDice5 } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FRAME_MAX,
  type LookGround,
  SEED_MAX,
  type StudioGround,
  studioGround,
} from '../../core/index.js'
import type { StudioEffectDefinition } from '../effects.js'
import { captureSerial, isAbort } from '../publish.js'
import { type Shot, sheetCapture } from '../shot.js'
import { Button } from '../ui/button.js'
import { cn } from '../ui/cn.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js'

/** The moments a sheet offers, across the whole range a capture frame may take. */
const FRAME_LADDER = [15, 45, 90, 150, 225, 300, 450, 600].filter((frame) => frame <= FRAME_MAX)
/** How many arrangements a sheet offers beside the current one. */
const SEED_COUNT = 7
/** A thumbnail's pixels, as a fraction of the still's: enough to read density and layout. */
const THUMB_SCALE = 0.5

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] & SEED_MAX
const rollSeeds = (current: number) => [current, ...Array.from({ length: SEED_COUNT }, randomSeed)]

type Thumb = { key: number; url: null | string }

/**
 * A contact sheet for the shot on the stage: the same still at other seeds
 * (arrangements) and at other moments of the run (frames), rendered here at a
 * fraction of the still's pixels. Choosing one sets the shot's seed or frame
 * at once; the stage behind renders the exact still. The moments come from
 * one run read back at each frame, so a strip costs one simulation.
 */
export function Variations({
  defaults,
  effect,
  ground,
  onOpenChange,
  onPick,
  open,
  seeded,
  shot,
}: {
  /** The Studio's grounds, which a filled still is laid over where the look sets none. */
  defaults: StudioGround
  effect: StudioEffectDefinition
  ground: LookGround
  onOpenChange: (open: boolean) => void
  onPick: (next: { frame?: number; seed?: number }) => void
  open: boolean
  seeded: boolean
  shot: Shot
}) {
  const { height, width } = shot.capture
  const aspect = `${width} / ${height}`
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[88svh] flex-col gap-5 overflow-y-auto sm:max-w-4xl"
        data-shader-studio="sheet"
        // The sheet is portaled out of the stage but not out of its React
        // tree: a key pressed here (Escape to close, Space) is the sheet's
        // own, not the stage's shortcut.
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]/5">
            Variations of the {shot.label.toLowerCase()}
          </DialogTitle>
          <DialogDescription className="text-xs/5">
            Pick an arrangement or a moment; the stage shows the exact still behind this sheet.
          </DialogDescription>
        </DialogHeader>
        {seeded && (
          <SeedStrip
            aspect={aspect}
            defaults={defaults}
            effect={effect}
            ground={ground}
            onPick={(seed) => onPick({ seed })}
            open={open}
            shot={shot}
          />
        )}
        <FrameStrip
          aspect={aspect}
          defaults={defaults}
          effect={effect}
          ground={ground}
          onPick={(frame) => onPick({ frame })}
          open={open}
          shot={shot}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Blob URLs that are let go when a strip renders again or closes. */
function useThumbs() {
  const [thumbs, setThumbs] = useState<Thumb[]>([])
  const replace = useCallback(
    (next: Thumb[]) =>
      setThumbs((previous) => {
        for (const thumb of previous) {
          if (thumb.url) {
            URL.revokeObjectURL(thumb.url)
          }
        }
        return next
      }),
    [],
  )
  useEffect(() => () => replace([]), [replace])
  return [thumbs, replace] as const
}

type StripProps = {
  aspect: string
  defaults: StudioGround
  effect: StudioEffectDefinition
  ground: LookGround
  open: boolean
  shot: Shot
}

function SeedStrip({
  aspect,
  defaults,
  effect,
  ground,
  onPick,
  open,
  shot,
}: { onPick: (seed: number) => void } & StripProps) {
  const [seeds, setSeeds] = useState<number[]>([])
  const [thumbs, setThumbs] = useThumbs()
  const [busy, setBusy] = useState(false)
  const latest = useRef({ ground, shot })
  latest.current = { ground, shot }
  // Everything but the seed: a sheet of seeds is rendered again when the shot
  // under them changes, not when one of them is chosen.
  const identity = JSON.stringify([shot.capture, shot.frame, shot.tuning(0), ground])

  // A fresh roll each time the sheet opens, headed by the seed the shot has then.
  useEffect(() => {
    setSeeds(open ? rollSeeds(latest.current.shot.seed) : [])
  }, [open])

  // The shot is read through a ref and the run is keyed by its identity, so a
  // render that rebuilds the shot object does not render the sheet again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `identity` stands in for the shot read through the ref
  useEffect(() => {
    if (!open || !seeds.length) {
      return
    }
    const controller = new AbortController()
    const { ground: currentGround, shot: current } = latest.current
    setThumbs(seeds.map((seed) => ({ key: seed, url: null })))
    setBusy(true)
    void (async () => {
      const rendered: Thumb[] = []
      try {
        for (const seed of seeds) {
          const [image] = await captureSerial({
            capture: sheetCapture(current, THUMB_SCALE),
            effect,
            frames: [current.frame],
            ground: studioGround(currentGround, current.capture.surface, defaults),
            signal: controller.signal,
            tuning: current.tuning(seed),
          })
          rendered.push({ key: seed, url: URL.createObjectURL(image) })
          setThumbs([
            ...rendered,
            ...seeds.slice(rendered.length).map((key) => ({ key, url: null })),
          ])
        }
      } catch (reason) {
        if (!isAbort(reason)) {
          setThumbs(rendered)
        }
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false)
        }
      }
    })()
    return () => controller.abort()
    // The shot's identity stands in for the shot; `seeds` is the strip's own roll.
  }, [open, effect, defaults, identity, seeds, setThumbs])

  return (
    <Strip
      action={
        <Button
          disabled={busy}
          onClick={() => setSeeds(rollSeeds(shot.seed))}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconDice5 aria-hidden />
          Shuffle
        </Button>
      }
      aspect={aspect}
      busy={busy}
      current={shot.seed}
      label={(seed) => `Seed ${seed}`}
      note="The same look laid out from another seed."
      onPick={onPick}
      thumbs={thumbs}
      title="Arrangement"
    />
  )
}

function FrameStrip({
  aspect,
  defaults,
  effect,
  ground,
  onPick,
  open,
  shot,
}: { onPick: (frame: number) => void } & StripProps) {
  const [thumbs, setThumbs] = useThumbs()
  const [busy, setBusy] = useState(false)
  const latest = useRef({ ground, shot })
  latest.current = { ground, shot }
  // Everything but the frame, the seed included: another seed is another run.
  const identity = JSON.stringify([shot.capture, shot.tuning(shot.seed), ground])
  const frames = [...new Set([shot.frame, ...FRAME_LADDER])].sort((a, b) => a - b)

  // The shot is read through a ref and the run is keyed by its identity, so a
  // render that rebuilds the shot object does not render the strip again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `identity` stands in for the shot read through the ref
  useEffect(() => {
    if (!open) {
      return
    }
    const controller = new AbortController()
    const { ground: currentGround, shot: current } = latest.current
    const ladder = [...new Set([current.frame, ...FRAME_LADDER])].sort((a, b) => a - b)
    setThumbs(ladder.map((frame) => ({ key: frame, url: null })))
    setBusy(true)
    void (async () => {
      try {
        const images = await captureSerial({
          capture: sheetCapture(current, THUMB_SCALE),
          effect,
          frames: ladder,
          ground: studioGround(currentGround, current.capture.surface, defaults),
          signal: controller.signal,
          tuning: current.tuning(current.seed),
        })
        setThumbs(
          ladder.map((frame, index) => ({ key: frame, url: URL.createObjectURL(images[index]) })),
        )
      } catch (reason) {
        if (!isAbort(reason)) {
          setThumbs([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false)
        }
      }
    })()
    return () => controller.abort()
  }, [open, effect, defaults, identity, setThumbs])

  return (
    <Strip
      aspect={aspect}
      busy={busy}
      current={shot.frame}
      label={(frame) => `Frame ${frame}`}
      note={`The run at another frame, 1 to ${FRAME_MAX}. ${frames.length} moments.`}
      onPick={onPick}
      thumbs={thumbs}
      title="Moment"
    />
  )
}

function Strip({
  action,
  aspect,
  busy,
  current,
  label,
  note,
  onPick,
  thumbs,
  title,
}: {
  action?: React.ReactNode
  aspect: string
  busy: boolean
  current: number
  label: (key: number) => string
  note: string
  onPick: (key: number) => void
  thumbs: Thumb[]
  title: string
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <header className="flex items-baseline gap-3">
        <h3 className="font-semibold text-xs/4 tracking-[0.02em]">{title}</h3>
        <p className="min-w-0 flex-1 text-[11px]/4 text-muted-foreground">{note}</p>
        <span aria-live="polite" className="font-mono text-[11px]/4 text-muted-foreground">
          {busy ? 'Rendering…' : ''}
        </span>
        {action}
      </header>
      <ul className="grid grid-cols-4 gap-2">
        {thumbs.map((thumb) => (
          <li key={thumb.key}>
            <button
              aria-label={label(thumb.key)}
              aria-pressed={thumb.key === current}
              className={cn(
                'pressable flex w-full cursor-pointer flex-col gap-1 rounded-md border p-1 text-left transition-colors hover:bg-muted disabled:cursor-default',
                thumb.key === current ? 'border-primary' : 'border-input',
              )}
              disabled={!thumb.url}
              onClick={() => onPick(thumb.key)}
              type="button"
            >
              <span
                className="block w-full overflow-hidden rounded-sm bg-muted"
                style={{ aspectRatio: aspect }}
              >
                {thumb.url && <img alt="" className="size-full object-cover" src={thumb.url} />}
              </span>
              <span className="px-0.5 font-mono text-[11px]/4 text-muted-foreground tabular-nums">
                {label(thumb.key)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
