'use client'

import { IconX } from '@tabler/icons-react'

import { studioGround, type Surface } from '../../core/index.js'
import { useStudio } from '../config.js'
import { useGround } from '../draft.js'
import { fromHex, GROUND_COPY, toHex } from '../parameters.js'
import { Button } from '../ui/button.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'
import { HexField } from './ParameterRow.js'

/**
 * The look's own ground for the face the stage is showing, beside the face
 * toggle: a swatch that opens the system colour picker, the hex it is set
 * to, and a clear once it departs from the Studio's ground. It sits with
 * the face because it is a property of the face, not of the effect: the
 * colour under the look wherever the look sits in a frame of its own, and the
 * colour a filled still is laid over. It is the look's field beside the
 * recipe (`useGround`), saved with the draft and published with the look; it
 * is not an undo step.
 */
export function GroundControl({ surface }: { surface: Surface }) {
  const studio = useStudio()
  const { ground, set } = useGround()
  const hex = studioGround(ground, surface, studio.ground)
  const changed = Boolean(ground[surface])
  const copy = GROUND_COPY[surface]
  return (
    <div className="flex items-center gap-1.5" data-changed={changed || undefined}>
      <Tooltip>
        <TooltipTrigger asChild>
          <label
            aria-label={copy.label}
            className="relative size-[30px] shrink-0 cursor-pointer overflow-hidden rounded-md border border-input"
            style={{ backgroundColor: hex }}
          >
            <input
              aria-label={copy.label}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={(event) => {
                const next = fromHex(event.target.value)
                if (next) {
                  set(surface, toHex(next))
                }
              }}
              type="color"
              value={hex}
            />
            {changed && (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-1.5 rounded-full bg-primary ring-2 ring-background"
              />
            )}
          </label>
        </TooltipTrigger>
        <TooltipContent collisionPadding={12} side="top" sideOffset={8} variant="panel">
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-[13px]/4 text-foreground">{copy.label}</span>
            <p className="text-pretty text-foreground/80">{copy.description}</p>
            <p className="font-mono text-[11px]/3.5 text-muted-foreground">
              default {studio.ground[surface]}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
      <HexField
        className="h-[30px] w-21"
        label={copy.label}
        onCommit={(next) => set(surface, toHex(next))}
        value={hex}
      />
      {changed && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={`Use the Studio ground for the ${surface} face`}
              className="size-[30px]"
              onClick={() => set(surface, null)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <IconX />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            Back to the Studio ground
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
