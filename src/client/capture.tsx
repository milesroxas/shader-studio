'use client'

import { Canvas, type RootState, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

import type { BlendMode, Tuning } from '../core/effect.js'
import type { CaptureOptions } from '../core/recipe.js'
import type { StudioEffectDefinition } from './effects.js'
import type { EffectScene } from './scenes.js'

import { widestPlacement } from '../core/effect.js'
import { STILL_QUALITY } from '../core/recipe.js'
import { loadScenes } from './effects.js'

export type CaptureInput = {
  capture: CaptureOptions
  effect: StudioEffectDefinition
  /** The frames to read back, ascending, from one run stepped at 1/60 s. */
  frames: readonly number[]
  /** The colour a filled still is laid over, as `#rrggbb`: the look's own ground for this face, else the Studio's. */
  ground: string
  /** Aborting takes the canvas down and rejects with `AbortError`. */
  signal?: AbortSignal
  /** The resolved tuning for the face the still is of; the scene caps it at the widest placement. */
  tuning: Tuning
}

const abortError = () => new DOMException('The capture was cancelled.', 'AbortError')

/**
 * Exact stills, rendered in this browser: the effect's own scene stepped a
 * fixed number of 1/60 s frames with neutral input, read back at each frame
 * asked for and encoded as the capture's own file. It mounts its own offscreen
 * canvas and takes it down again, so the caller needs no element and the
 * website has no readback path. Studio calls it on Publish (the posters and
 * the stills), for the stage's still preview and for the contact sheet; one
 * run yields every moment of a sheet, so a strip of frames costs one
 * simulation, not one per frame.
 */
export async function captureStills(input: CaptureInput): Promise<Blob[]> {
  const scenes = await loadScenes(input.effect)
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      return reject(abortError())
    }
    const host = document.createElement('div')
    // Offscreen, not `display: none`: the canvas sizes itself from layout.
    host.style.cssText =
      'position:fixed;left:-100000px;top:0;pointer-events:none;contain:strict;' +
      `width:${input.capture.width}px;height:${input.capture.height}px`
    document.body.append(host)
    const root = createRoot(host)
    let settled = false
    const settle =
      <T,>(finish: (value: T) => void) =>
      (value: T) => {
        if (settled) {
          return
        }
        settled = true
        input.signal?.removeEventListener('abort', abort)
        // An error can arrive from inside a React effect, where a root cannot
        // be unmounted synchronously.
        setTimeout(() => {
          root.unmount()
          host.remove()
        })
        finish(value)
      }
    const abort = () => settle(reject)(abortError())
    input.signal?.addEventListener('abort', abort, { once: true })
    root.render(
      <CaptureScene
        input={input}
        onError={settle((message: string) => reject(new Error(message)))}
        onResult={settle(resolve)}
        scenes={scenes}
      />,
    )
  })
}

/** One still, at one frame. */
export const captureStill = (input: { frame: number } & Omit<CaptureInput, 'frames'>) =>
  captureStills({ ...input, frames: [input.frame] }).then(([image]) => image)

function CaptureScene({
  input: { capture, effect, frames, ground, tuning },
  onError,
  onResult,
  scenes,
}: {
  input: CaptureInput
  onError: (message: string) => void
  onResult: (images: Blob[]) => void
  scenes: EffectScene
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const Scene = scenes.Capture
  const { contract } = effect
  const limited = contract.limit(tuning, widestPlacement(contract))
  const blend = contract.blend?.(limited)
  return (
    <div ref={rootRef} style={{ height: capture.height, width: capture.width }}>
      <Canvas
        dpr={capture.scale}
        flat
        frameloop="never"
        gl={{
          alpha: true,
          antialias: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
        }}
        linear
        onCreated={({ gl }) => {
          gl.debug.onShaderError = () => onError('Shader compilation failed.')
        }}
      >
        <Scene onError={onError} rootRef={rootRef} tuning={limited} />
        <CaptureFrames
          blend={blend}
          capture={capture}
          frames={frames}
          ground={ground}
          onError={onError}
          onResult={onResult}
        />
      </Canvas>
    </div>
  )
}

/** CSS `plus-lighter` is canvas `lighter`; the other modes share their names. */
const compositeOf = (blend: BlendMode | undefined): GlobalCompositeOperation =>
  !blend || blend === 'normal'
    ? 'source-over'
    : blend === 'plus-lighter'
      ? 'lighter'
      : (blend as GlobalCompositeOperation)

/**
 * The finished file, encoded here: a lossless PNG of a full frame is several
 * megabytes, more than a request to the server can carry. A filled capture is
 * laid over its ground first, an opaque frame through its effect's blend so
 * the ground shows as it does on the page. A browser that cannot encode the
 * format answers with PNG, which the server converts.
 */
function encodeStill(
  source: HTMLCanvasElement,
  capture: CaptureOptions,
  blend: BlendMode | undefined,
  ground: string,
): Promise<Blob> {
  let canvas = source
  if (!capture.transparent) {
    canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('The still could not be encoded.')
    }
    context.fillStyle = ground
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.globalCompositeOperation = compositeOf(blend)
    context.drawImage(source, 0, 0)
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The still could not be encoded.'))),
      `image/${capture.format}`,
      STILL_QUALITY / 100,
    ),
  )
}

/**
 * The run: every frame stepped in order, the ones asked for drawn and read
 * back before the next step, since the drawing buffer is a frame's only until
 * something else is drawn into it. Now and then the thread is handed back on
 * a timer, not a frame callback: frame callbacks stop in a tab that loses the
 * screen mid-capture.
 */
async function readFrames(
  { advance, gl, scene }: Pick<RootState, 'advance' | 'gl' | 'scene'>,
  frames: readonly number[],
  encode: () => Promise<Blob>,
  cancelled: () => boolean,
): Promise<Blob[] | null> {
  const render = gl.render.bind(gl)
  // Only the frames read back are drawn; the simulation steps run regardless.
  let draw = false
  gl.render = (target, camera) => {
    if (target !== scene || draw) {
      render(target, camera)
    }
  }
  try {
    const wanted = [...new Set(frames)].sort((a, b) => a - b)
    const last = wanted.at(-1) ?? 1
    const images: Blob[] = []
    for (let frame = 0; frame < last; frame++) {
      if (cancelled()) {
        return null
      }
      draw = wanted.includes(frame + 1)
      advance(frame / 60)
      if (draw) {
        gl.getContext().finish()
        images.push(await encode())
      } else if (frame % 20 === 19) {
        await new Promise<void>((resolve) => setTimeout(resolve))
      }
    }
    return images
  } finally {
    gl.render = render
  }
}

function CaptureFrames({
  blend,
  capture,
  frames,
  ground,
  onError,
  onResult,
}: {
  blend: BlendMode | undefined
  capture: CaptureOptions
  frames: readonly number[]
  ground: string
  onError: (message: string) => void
  onResult: (images: Blob[]) => void
}) {
  const advance = useThree((state) => state.advance)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const callbacks = useRef({ onError, onResult })
  callbacks.current = { onError, onResult }
  useEffect(() => {
    let cancelled = false
    // Effects, material attachment and canvas size settle before the first fixed step.
    const raf = requestAnimationFrame(async () => {
      try {
        const images = await readFrames(
          { advance, gl, scene },
          frames,
          () => encodeStill(gl.domElement, capture, blend, ground),
          () => cancelled,
        )
        if (images && !cancelled) {
          callbacks.current.onResult(images)
        }
      } catch (error) {
        if (!cancelled) {
          callbacks.current.onError(String(error))
        }
      }
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [advance, blend, capture, frames, gl, ground, scene])
  return null
}
