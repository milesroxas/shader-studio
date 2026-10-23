# shader-studio

A [Payload CMS](https://payloadcms.com) plugin that puts a shader studio in the admin. Editors tune a WebGL effect on a live stage, publish it, and place it in any document like a media file. The site renders the published look from a snapshot and a poster pair the plugin keeps on the document, so pages never wait on the GPU to know what to show.

- **Looks are content.** A look is a document: an effect, a recipe of the parameters that left their default, a seed, a capture frame, an optional ground colour per face, and the stills it ships as. Payload's drafts, autosave and versions are its history.
- **Publishing renders.** On Publish the editor's browser renders the dark and light posters and every still that changed, exactly, and the look is published with them in one request. Every place that uses the look shows the result.
- **Slots reference, the plugin hydrates.** A `studioLookField()` in any collection or global stores a look's id. On every read the id becomes the published look's snapshot, posters, ground and stills. A look that was never published stays an id, so the slot can fall back to a shipped look.
- **Effects are yours.** The plugin ships the studio, the publish pipeline, the hydration and one example effect. An effect is a pure contract (parameters, defaults, shipped looks, caps per placement) plus two React Three Fiber scenes. Register as many as you like.

## Requirements

- Payload `^3.82` on the Next.js App Router (the admin components are React 19 client components).
- `three` and `@react-three/fiber` (peer dependencies): the stage and the capture path mount an R3F canvas.
- `sharp` in the host (`buildConfig({ sharp })`, as `create-payload-app` sets up) or installed beside the plugin: renders are checked and, when a browser sends PNG, converted on the server.
- Any database adapter. On Postgres the publish takes a row lock on the look; other adapters run the same code without it.

## Install

```sh
pnpm add shader-studio three @react-three/fiber
```

## Quick start

Register the plugin with an effect. The package ships one, `wash`, so you can see the studio before writing your own.

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { shaderStudioPlugin, studioLookField } from 'shader-studio'
import { washEffect } from 'shader-studio/effects/wash'
import sharp from 'sharp'

export default buildConfig({
  sharp,
  collections: [
    Users,
    Media,
    {
      slug: 'pages',
      versions: { drafts: true },
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'hero',
          type: 'group',
          fields: [studioLookField({ effect: 'wash', label: 'Hero', placement: 'hero' })],
        },
      ],
    },
  ],
  plugins: [
    shaderStudioPlugin({
      effects: [{ contract: washEffect, client: 'shader-studio/effects/wash/client#WashEffect' }],
      ground: { dark: '#09090b', light: '#f5f5f4' },
      onPublish: async ({ operation, id }) => {
        // bust whatever caches hold pages that use looks
      },
    }),
  ],
})
```

Then regenerate the import map so the admin can find the studio's components and your effect:

```sh
pnpm payload generate:importmap
```

Open the admin. **Studio Looks** is a new collection: create one, tune it on the Studio tab, press **Publish**. Open a page: the hero's **Look** field is a picker that creates a look for the slot and opens the studio in a drawer.

On the front end, the slot carries the published look:

```ts
import { parseRelease } from 'shader-studio'
import { washEffect } from 'shader-studio/effects/wash'

const release = parseRelease(washEffect, page.hero.look)
if (release) {
  // release.snapshot.dark / release.snapshot.light: the resolved tuning per face
  // release.posters.dark.url / release.posters.light.url: 1600 × 900 WebP with alpha
  // release.ground: the look's own background per face, if it set one
  // release.stills?.preview: the 1200 × 630 share image, if the look has one
}
```

Render `release.snapshot[surface]` with the effect's live scene, or show `release.posters[surface]` where the effect does not run (reduced motion, no WebGL, cards, social). `parseRelease` never throws: a slot holding an unpublished look, a look of another effect or a malformed snapshot reads as `null`.

## How a look works

**Recipe.** What the author stores: `{ version: 1, seed, frame, deltas }`. `deltas` holds only the parameters that left the effect's defaults, validated against the contract on every save. The JSON schema of the recipe is on the field, so the generated types and an agent writing over the REST API both see every parameter's range.

**Snapshot.** What the site draws from, written only by Publish: the recipe resolved to a full tuning for each face (`dark`, `light`), already capped at the effect's widest placement, stamped with the effect's `renderer`. Two recipes that resolve to the same snapshot are the same release; the plugin hashes the canonical snapshot as `sourceHash`.

**Posters.** The look exactly as it runs, rendered on both faces at 1600 × 900 with alpha, in the editor's browser on Publish, filed in the media collection. The plugin keeps the media rows from being edited or deleted while a published look serves them.

**Ground.** A look may set the colour under itself on each face. It rides beside the recipe, so the posters stay transparent and the frame paints the colour; `groundAttributes(release.ground)` gives you the custom properties for a stylesheet.

**Stills.** Static renders for one use each: a share image the site serves, social sizes to download, or a custom size with or without alpha. A still is the live recipe plus its own overrides at its own seed and frame. Publish renders only the stills whose pixels changed.

**Placements.** An effect names where it may run, widest first (`['hero', 'block', 'card']`). The stage previews each at its budget; snapshots and stills are capped at the widest.

**History and usage.** The History tab lists every published state from Payload's versions: compare one on the stage, or restore it as the draft. The Details tab lists every document whose slot holds the look; a look in use cannot be deleted. **Archived** hides a look from the picker without touching the places that use it.

**Publishing is the studio's.** Payload's own Publish button is replaced. A look published any other way (the REST API, Revert to published) goes through only when its recipe, ground and stills are exactly what is already live, because the site needs posters that match.

## Writing an effect

An effect is three things: a pure contract, the copy the Inspector reads it with, and the scenes that draw it.

### The contract

```ts
// src/studio/aurora.ts — pure: no React, no Three
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

| Member                                  | What it is                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                    | Stored as the `effect` a look is filed under. Never change it.                                                                                    |
| `renderer`                              | Stamped on every snapshot. Bump it when a shader change makes old snapshots draw differently.                                                     |
| `defaults`                              | Every knob with its default, authorable or not. A seeded effect has a numeric `seed`.                                                             |
| `parameters`                            | The authorable subset of `defaults`: `range`, `unit`, `vector`, `options`, `color`, `toggle`, each in a `group` the Inspector shows as a section. |
| `looks`, `fallbackLook`                 | Shipped looks as delta-only tunings. The picker offers them beside the editor's own.                                                              |
| `seeded`                                | Whether the seed changes what is drawn.                                                                                                           |
| `placements`                            | Where the effect may run, widest first.                                                                                                           |
| `face(tuning, surface)`                 | The light face from the tuning authored on the dark one.                                                                                          |
| `limit(tuning, placement)`              | Code-owned ceilings per placement. Caps, never raises, idempotent.                                                                                |
| `budget(limited, requested, placement)` | One line for the stage: what the placement costs.                                                                                                 |
| `check?(tuning)`                        | Rules that span parameters. Throws the message the editor reads.                                                                                  |
| `blend?(tuning)`                        | A CSS blend mode for an effect that draws an opaque frame.                                                                                        |
| `lookPoster?(look, surface)`            | A URL for a shipped look's thumbnail, if you have one.                                                                                            |
| `lookTag?(look)`                        | A short tag beside a starter.                                                                                                                     |

### The copy

```ts
import type { EffectCopy } from 'shader-studio'

export const auroraCopy: EffectCopy<AuroraTuning, 'scale' | 'speed' | 'tint'> = {
  title: 'Aurora Studio',
  noun: 'aurora',
  parameters: {
    scale: { label: 'Scale', description: 'Size of one ribbon. Larger is broader and slower.' },
    speed: { label: 'Speed', description: 'How fast the ribbons drift. 0 freezes the field.' },
    tint: { label: 'Tint', description: 'The colour of the brightest ribbon.' },
  },
  dependencies: {},
  summary: (group, tuning) =>
    group === 'Color' ? { swatches: [tuning.tint] } : `× ${tuning.scale}`,
}
```

Copy owns the reading, never a number: ranges, steps, options and defaults come from the contract. `dependencies` marks a control that does nothing until another setting changes (the row shows muted with the reason and a fix). `ranges` draws two parameters as one two-thumb row. `interaction` moves one group (pointer terms, say) onto a second tab with a note. `hint` adds code-owned readouts beside a control.

### The scenes

```tsx
// src/studio/aurora.scenes.tsx
'use client'
import type { CaptureSceneProps, LiveSceneProps } from 'shader-studio/client'

export function Capture({ tuning, onError }: CaptureSceneProps) {
  // Mounted inside the studio's <Canvas frameloop="never">. Accumulate the delta
  // useFrame hands you into your time uniform: the studio steps 1/60 s per frame.
}

export function Live({ tuning, rootRef, active, generation, onReady, onFailure }: LiveSceneProps) {
  // Render your own <Canvas> filling rootRef's box. Stop advancing while !active,
  // restart from zero when generation changes, call onReady after the first frame.
}
```

See `src/effects/wash/scenes.tsx` in this repository for a complete pair.

### Registering it

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

`client` is an import-map path, the way Payload takes any admin component. The plugin mounts it as an admin provider, so the studio can draw the effect wherever a look is edited. Run `payload generate:importmap` after adding one.

## Options

| Option           | Default                                             | What it does                                                                                                    |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `effects`        | required                                            | `{ contract, client }` per effect, in the order editors see them. The first is the default.                     |
| `enabled`        | `true`                                              | `false` keeps the collection (so the schema does not change) but removes hooks, endpoints and admin components. |
| `looksSlug`      | `'studio-looks'`                                    | The looks collection's slug. Never rename it once it has data.                                                  |
| `labels`         | Studio Look / Studio Looks                          | Collection labels.                                                                                              |
| `admin.group`    | none                                                | Admin nav group.                                                                                                |
| `slotField`      | `'look'`                                            | The relationship field name `studioLookField()` uses. Hydration and usage find slots by it.                     |
| `mediaSlug`      | `'media'`                                           | The upload collection renders are filed in.                                                                     |
| `mediaFolder`    | `'Shader Studio'`                                   | The folder for renders when the media collection is in folders; `false` for none.                               |
| `mediaData`      | `({ title }) => ({ alt: title })`                   | Extra data for every media document a render is filed as.                                                       |
| `serializeMedia` | filename, url, width, height, mimeType, updatedAt   | What a slot receives of each rendered file. Add the fields your image CDN needs.                                |
| `ground`         | `#09090b` / `#f5f5f4`                               | The colour under an effect on each face: the stage's background, and what an opaque still is flattened onto.    |
| `stillUses`      | preview (1200 × 630, served), social, square, story | The static renders a look offers. `custom` is always offered.                                                   |
| `access`         | any signed-in user                                  | Who may read, write and publish looks.                                                                          |
| `hydrate`        | `true`                                              | Replace slot ids with the published look on read.                                                               |
| `folders`        | `false`                                             | Put looks in Payload's folders.                                                                                 |
| `onPublish`      | none                                                | Called after a publish or an unpublish. Bust caches here.                                                       |
| `overrides`      | none                                                | Change the looks collection before it is added.                                                                 |

### `studioLookField()`

| Argument      | Default          | What it does                                                                                                            |
| ------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `effect`      | required         | An effect id, or `{ sibling: 'visualType' }` to read the id from a sibling field so one slot can offer several effects. |
| `name`        | `'look'`         | Must equal the plugin's `slotField`.                                                                                    |
| `looksSlug`   | `'studio-looks'` | Must equal the plugin's `looksSlug`.                                                                                    |
| `label`       | `'Slot'`         | The slot's name in a new look's title: "Page title · Hero".                                                             |
| `placement`   | first placement  | The placement the studio opens at from this slot.                                                                       |
| `presetField` | none             | A sibling text field holding a shipped look's id. The picker offers shipped looks and writes it.                        |
| `overrides`   | none             | Merged over the relationship field.                                                                                     |

The field validates when the host document is published: the look must be published and filed under the slot's effect.

## Authoring over the API

A look's draft can be written over REST or the Local API: `POST /api/studio-looks?draft=true` with a `title`, an `effect` and a `recipe`. The `recipe` and `stills` fields carry JSON schemas that list every parameter with its range, so an agent (or `payload-types.ts`) knows what to send. Publishing is the admin studio's, where the posters are rendered.

The plugin adds three endpoints to the looks collection, all behind `access`:

- `POST /:id/publish` — multipart: `recipe` (JSON), `renders` (JSON, still id → media id), `dark` and `light` (the posters). Used by the studio.
- `POST /:id/stills` — multipart: `recipe`, `still` (JSON), `image`. Files one still in media.
- `GET /:id/usage` — the documents whose slot holds the look.

## Development

```sh
pnpm install
cp dev/.env.example dev/.env
pnpm dev                 # the dev app at http://localhost:3002/admin (dev@payloadcms.com / test)
pnpm test:unit           # the core, no database
pnpm test:int            # Payload on in-memory SQLite
pnpm build               # dist/: types, JS (SWC) and the compiled studio.css
```

The dev app (`dev/`) is a Payload project on SQLite with the `wash` effect, a `pages` collection with a hero slot and a visual block, and a `settings` global. Run `pnpm dev:generate-importmap` after changing which components the plugin registers.

The admin's styles are Tailwind utilities compiled at build time into `dist/styles/studio.css` and imported by the studio's components; they are scoped to the studio's roots and read Payload's own `--theme-*` scale, so the studio follows the admin's light and dark themes.

## License

MIT
