# shader-studio

[![npm](https://img.shields.io/npm/v/shader-studio)](https://www.npmjs.com/package/shader-studio)
[![CI](https://github.com/milesroxas/shader-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/milesroxas/shader-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Payload CMS](https://payloadcms.com) plugin for authoring, publishing and placing WebGL shader looks from the admin. Editors tune an effect on a live stage and publish it. Pages reference the published look like a media file and render it from a snapshot and a poster pair, so the site never waits on the GPU.

## Features

- **Studio in the admin.** A looks collection with a live stage, an Inspector generated from the effect's contract, stills, history and usage.
- **Publish renders.** Dark and light posters (1600 × 900 WebP with alpha) and stills render in the editor's browser and publish with the look in one request.
- **Slots hydrate.** `studioLookField()` stores a look id in any collection or global. On read the id becomes the published snapshot, posters, ground and stills.
- **Bring your own effects.** An effect is a pure contract plus two React Three Fiber scenes. One example effect, `wash`, ships with the package.
- **Any database adapter.** Postgres additionally takes a row lock on publish.

## Requirements

| Peer dependency             | Version                                      |
| --------------------------- | -------------------------------------------- |
| `payload`, `@payloadcms/ui` | `^3.82`                                      |
| `react`, `react-dom`        | `^19`                                        |
| `three`                     | `>=0.160`                                    |
| `@react-three/fiber`        | `^9`                                         |
| `sharp`                     | `>=0.32`, passed to `buildConfig({ sharp })` |

## Installation

```sh
pnpm add shader-studio three @react-three/fiber
```

## Quick start

Register the plugin with at least one effect and add a slot to a collection.

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
      onPublish: async ({ operation, id }) => {
        // revalidate pages that use looks
      },
    }),
  ],
})
```

Regenerate the import map so the admin can load the studio and your effect:

```sh
pnpm payload generate:importmap
```

In the admin, **Studio Looks** is a new collection. Create a look, tune it on the Studio tab and press **Publish**. On a page, the hero's **Look** field is a picker that creates a look for the slot and opens the studio in a drawer.

On the front end, read the hydrated slot with `parseRelease`:

```ts
import { parseRelease } from 'shader-studio'
import { washEffect } from 'shader-studio/effects/wash'

const release = parseRelease(washEffect, page.hero.look)
// release.snapshot.dark | .light   resolved tuning per face, for the live scene
// release.posters.dark.url | .light 1600 × 900 WebP, for reduced motion, no WebGL, cards
// release.ground                    the look's own background per face, if set
// release.stills?.preview           1200 × 630 share image, if the look has one
```

`parseRelease` returns `null` for an unpublished look, a look of another effect or a malformed snapshot. It never throws.

## Configuration

### Plugin options

| Option           | Default                                           | Description                                                                              |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `effects`        | required                                          | `{ contract, client }` per effect, in the order editors see them. The first is default.  |
| `enabled`        | `true`                                            | `false` keeps the collection schema but removes hooks, endpoints and admin components.   |
| `looksSlug`      | `'studio-looks'`                                  | Slug of the looks collection. Do not rename once it has data.                            |
| `labels`         | Studio Look / Studio Looks                        | Collection labels.                                                                       |
| `admin.group`    | none                                              | Admin navigation group.                                                                  |
| `slotField`      | `'look'`                                          | Field name `studioLookField()` uses. Hydration and usage find slots by it.               |
| `mediaSlug`      | `'media'`                                         | Upload collection renders are filed in.                                                  |
| `mediaFolder`    | `'Shader Studio'`                                 | Folder for renders when the media collection uses folders. `false` for none.             |
| `mediaData`      | `({ title }) => ({ alt: title })`                 | Extra data for every media document a render creates.                                    |
| `serializeMedia` | filename, url, width, height, mimeType, updatedAt | Fields a slot receives for each rendered file. Add what your image CDN needs.            |
| `ground`         | `#09090b` / `#f5f5f4`                             | Colour under an effect on each face: the stage background and the fill of opaque stills. |
| `stillUses`      | preview, social, square, story                    | Static renders a look offers. `custom` is always available.                              |
| `access`         | any signed-in user                                | Who may read, write and publish looks.                                                   |
| `hydrate`        | `true`                                            | Replace slot ids with the published look on read.                                        |
| `folders`        | `false`                                           | Place looks in Payload folders.                                                          |
| `onPublish`      | none                                              | Called after publish and unpublish. Revalidate caches here.                              |
| `overrides`      | none                                              | Modify the looks collection before it is added.                                          |

### `studioLookField()`

| Argument      | Default          | Description                                                                                  |
| ------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `effect`      | required         | An effect id, or `{ sibling: 'fieldName' }` to read the id from a sibling field.             |
| `name`        | `'look'`         | Must equal the plugin's `slotField`.                                                         |
| `looksSlug`   | `'studio-looks'` | Must equal the plugin's `looksSlug`.                                                         |
| `label`       | `'Slot'`         | Used in a new look's title: "Page title · Hero".                                             |
| `placement`   | first placement  | Placement the studio opens at from this slot.                                                |
| `presetField` | none             | Sibling text field holding a shipped look id. The picker offers shipped looks and writes it. |
| `overrides`   | none             | Merged over the relationship field.                                                          |

When the host document is published, the field validates that the look is published and belongs to the slot's effect.

## Documentation

- [Concepts](docs/concepts.md): recipes, snapshots, posters, ground, stills, placements, history.
- [Writing an effect](docs/effects.md): the contract, copy, scenes and registration.
- [API](docs/api.md): authoring looks over REST and the endpoints the plugin adds.

## Development

```sh
pnpm install
cp dev/.env.example dev/.env
pnpm dev          # dev app at http://localhost:3002/admin (dev@payloadcms.com / test)
pnpm test         # unit tests, then integration tests on in-memory SQLite
pnpm build        # dist/: types, JS and the compiled studio.css
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and release process.

## License

[MIT](LICENSE)
