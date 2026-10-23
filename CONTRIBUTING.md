# Contributing

Thanks for looking. The plugin follows the layout of Payload's official plugin template: the package in `src/`, a Payload app for developing against it in `dev/`.

## Setup

```sh
pnpm install
cp dev/.env.example dev/.env
pnpm dev
```

The admin is at <http://localhost:3002/admin>; the seeded user is `dev@payloadcms.com` / `test`.

## Checks

```sh
pnpm format      # oxfmt
pnpm lint        # eslint (@payloadcms/eslint-config)
pnpm typecheck
pnpm test:unit
pnpm test:int
pnpm build
```

CI runs all of these on every pull request.

## Layout

- `src/core/` — the pure engine: effect contract, recipes, snapshots, stills, ground, release parsing. No React, no Payload, no Three. Everything here has unit tests.
- `src/` (root) — the plugin: options, the looks collection, endpoints, hydration, usage, media guards.
- `src/client/` — the admin: the studio's components, the client registry of effects, capture and preview, the Tailwind primitives.
- `src/effects/wash/` — the shipped example effect: contract, copy, scenes.
- `src/styles/studio.css` — the Tailwind entry compiled into `dist/styles/studio.css` at build time.
- `dev/` — the development app and the integration tests.

## Releasing

Bump the version in `package.json`, add a section to `CHANGELOG.md`, tag `vX.Y.Z` and push the tag. The release workflow builds and publishes to npm.
