# Writing an effect

An effect has three parts: a pure contract, the copy the Inspector uses to describe it, and the scenes that draw it. The shipped `wash` effect in `src/effects/wash/` is a complete reference.

## Contract

The contract is pure TypeScript: no React, no Three. It is shared by the server, the admin and the front end.

```ts
// src/studio/aurora.ts
import { color, type EffectContract, range, unit } from 'shader-studio'

export type AuroraTuning = {
  seed: number
  scale: number
  speed: number
  tint: [number, number, number]
  dpr: number // code-owned: not in `parameters`
}

export const AURORA_DEFAULTS: AuroraTuning = {
  seed: 7,
  scale: 1,
  speed: 0.5,
  tint: [0.3, 0.8, 0.9],
  dpr: 1.5,
}

export const auroraEffect: EffectContract<AuroraTuning> = {
  id: 'aurora',
  label: 'Aurora',
  renderer: 'aurora-1',
  defaults: AURORA_DEFAULTS,
  parameters: {
    scale: range('Field', 0.2, 4, 0.05),
    speed: unit('Motion'),
    tint: color('Color'),
  },
  looks: {
    north: { id: 'north', label: 'North', description: 'The default aurora.', tuning: {} },
    ember: {
      id: 'ember',
      label: 'Ember',
      description: 'Warm and slow.',
      tuning: { tint: [1, 0.5, 0.2], speed: 0.2 },
    },
  },
  fallbackLook: 'north',
  seeded: true,
  placements: ['hero', 'block'],
  face: (tuning, surface) =>
    surface === 'light' ? { ...tuning, tint: lift(tuning.tint) } : tuning,
  limit: (tuning, placement) => ({
    ...tuning,
    dpr: Math.min(tuning.dpr, placement === 'hero' ? 1.5 : 1),
  }),
  budget: (limited) => ({ capped: false, text: `DPR ≤ ${limited.dpr}` }),
}
```

| Member                                  | Description                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                    | Stored as the `effect` a look is filed under. Never change it.                                                                        |
| `renderer`                              | Stamped on every snapshot. Bump it when a shader change makes old snapshots render differently.                                       |
| `defaults`                              | Every knob with its default, authorable or not. A seeded effect has a numeric `seed`.                                                 |
| `parameters`                            | The authorable subset of `defaults`: `range`, `unit`, `vector`, `options`, `color`, `toggle`. Each names a `group` for the Inspector. |
| `looks`, `fallbackLook`                 | Shipped looks as delta-only tunings. The picker offers them beside the editor's own.                                                  |
| `seeded`                                | Whether the seed changes the output.                                                                                                  |
| `placements`                            | Where the effect may run, widest first.                                                                                               |
| `face(tuning, surface)`                 | Derives the light face from the tuning authored on the dark one.                                                                      |
| `limit(tuning, placement)`              | Code-owned ceilings per placement. Must cap, never raise, and be idempotent.                                                          |
| `budget(limited, requested, placement)` | One line for the stage describing what the placement costs.                                                                           |
| `check?(tuning)`                        | Rules that span parameters. Throw the message the editor should read.                                                                 |
| `blend?(tuning)`                        | CSS blend mode for an effect that draws an opaque frame.                                                                              |
| `lookPoster?(look, surface)`            | URL of a shipped look's thumbnail.                                                                                                    |
| `lookTag?(look)`                        | Short tag shown beside a starter.                                                                                                     |

## Copy

Copy owns the wording. Ranges, steps, options and defaults come from the contract.

```ts
import type { EffectCopy } from 'shader-studio'

export const auroraCopy: EffectCopy<AuroraTuning, 'scale' | 'speed' | 'tint'> = {
  title: 'Aurora Studio',
  noun: 'aurora',
  parameters: {
    scale: { label: 'Scale', description: 'Size of one ribbon. Larger is broader and slower.' },
    speed: { label: 'Speed', description: 'How fast the ribbons drift. 0 freezes the field.' },
    tint: { label: 'Tint', description: 'Colour of the brightest ribbon.' },
  },
  dependencies: {},
  summary: (group, tuning) =>
    group === 'Color' ? { swatches: [tuning.tint] } : `× ${tuning.scale}`,
}
```

- `dependencies` marks a control that has no effect until another setting changes. The row renders muted with the reason and a fix.
- `ranges` draws two parameters as one two-thumb row.
- `interaction` moves one group onto a second tab with a note.
- `hint` adds code-owned readouts beside a control.

## Scenes

```tsx
// src/studio/aurora.scenes.tsx
'use client'
import type { CaptureSceneProps, LiveSceneProps } from 'shader-studio/client'

export function Capture({ tuning, onError }: CaptureSceneProps) {
  // Mounted inside the studio's <Canvas frameloop="never">. Accumulate the delta
  // from useFrame into your time uniform; the studio steps 1/60 s per frame.
}

export function Live({ tuning, rootRef, active, generation, onReady, onFailure }: LiveSceneProps) {
  // Render your own <Canvas> filling rootRef's box. Pause while !active,
  // restart from zero when generation changes, call onReady after the first frame.
}
```

## Registration

Define the client effect, then point the plugin at it with an import-map path.

```tsx
// src/studio/aurora.client.tsx
'use client'
import { defineStudioEffect } from 'shader-studio/client'
import { auroraCopy, auroraEffect } from './aurora'

export const AuroraEffect = defineStudioEffect({
  contract: auroraEffect,
  copy: auroraCopy,
  scenes: () => import('./aurora.scenes'), // lazy: Three loads when a studio opens
})
```

```ts
// payload.config.ts
shaderStudioPlugin({
  effects: [{ contract: auroraEffect, client: '@/studio/aurora.client#AuroraEffect' }],
})
```

The plugin mounts the client effect as an admin provider so the studio can draw it wherever a look is edited. Run `payload generate:importmap` after adding or moving one.
