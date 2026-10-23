'use client'

import { useEffect, useRef, useState } from 'react'

import type { StudioEffectDefinition } from '../effects.js'

import { type LookGround, type StudioGround, studioGround } from '../../core/index.js'
import { captureSerial, isAbort } from '../publish.js'
import { type Shot, shotIdentity } from '../shot.js'
import { cn } from '../ui/cn.js'

/** How long the stage waits after the last edit before it renders the still again. */
const SETTLE_MS = 350

type Rendered = { identity: string; url: string }

/**
 * The stage, showing a still: the exact pixels the still publishes as,
 * rendered here and shown at its own aspect inside the viewport. It renders
 * again a moment after the last edit that changes it, keeps the last render
 * dimmed while the next one draws, and cancels a render the next edit
 * overtakes. What is on the stage is what Publish files.
 */
export function StillViewport({
  defaults,
  effect,
  ground,
  shot,
}: {
  /** The Studio's grounds, which a filled still is laid over where the look sets none. */
  defaults: StudioGround
  effect: StudioEffectDefinition
  ground: LookGround
  shot: Shot
}) {
  const identity = shotIdentity(shot, ground)
  const [rendered, setRendered] = useState<null | Rendered>(null)
  const [error, setError] = useState('')
  // The effect keys on the identity string; the shot itself is read when it runs.
  const latest = useRef({ ground, shot })
  latest.current = { ground, shot }

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const { ground: currentGround, shot: current } = latest.current
      try {
        const [image] = await captureSerial({
          // The preview is the still's own pixels at 1x: scale only adds density.
          capture: { ...current.capture, scale: 1 },
          effect,
          frames: [current.frame],
          ground: studioGround(currentGround, current.capture.surface, defaults),
          signal: controller.signal,
          tuning: current.tuning(current.seed),
        })
        setRendered((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous.url)
          }
          return { identity, url: URL.createObjectURL(image) }
        })
        setError('')
      } catch (reason) {
        if (!isAbort(reason)) {
          setError((reason as Error).message)
        }
      }
    }, SETTLE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [effect, defaults, identity])

  useEffect(
    () => () => {
      setRendered((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous.url)
        }
        return null
      })
    },
    [],
  )

  const stale = !rendered || rendered.identity !== identity
  const { height, width } = shot.capture
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      {rendered ? (
        <img
          alt=""
          className={cn(
            'max-h-full max-w-full object-contain shadow-[0_0_0_1px_rgb(0_0_0/0.08)] transition-opacity duration-300',
            stale && 'opacity-60',
          )}
          height={height}
          src={rendered.url}
          style={{ aspectRatio: `${width} / ${height}` }}
          width={width}
        />
      ) : (
        <div
          aria-hidden
          className="max-h-full max-w-full rounded-sm border border-foreground/10 border-dashed"
          style={{ aspectRatio: `${width} / ${height}`, width: '100%' }}
        />
      )}
      {(stale || error) && (
        <p
          className={cn(
            'pointer-events-none absolute right-3 bottom-3 z-10 rounded-full bg-background/70 px-2.5 py-1 font-mono text-[11px]/3.5 backdrop-blur-xs',
            error ? 'text-destructive' : 'text-muted-foreground',
          )}
          role="status"
        >
          {error || 'Rendering…'}
        </p>
      )}
    </div>
  )
}
