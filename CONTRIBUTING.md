# Contributing

The repository follows Payload's plugin template: the package in `src/`, a Payload app for developing against it in `dev/`. Open an issue before starting a large change.

## Setup

```sh
pnpm install
cp dev/.env.example dev/.env
pnpm dev
```

The admin runs at <http://localhost:3002/admin>. The seeded user is `dev@milesroxas.com` / `test`.

## Checks

CI runs these on every pull request.

```sh
pnpm lint           # biome check (format, lint, import order)
pnpm typecheck
pnpm test:unit
pnpm test:int
pnpm build
```

## Layout

| Path                    | Contents                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/core/`             | Pure engine: effect contract, recipes, snapshots, stills, ground, release parsing. Fully unit tested. |
| `src/` (root)           | Plugin: options, looks collection, endpoints, hydration, usage, media guards.                         |
| `src/client/`           | Admin: studio components, client effect registry, capture and preview, UI primitives.                 |
| `src/effects/wash/`     | Shipped example effect: contract, copy, scenes.                                                       |
| `src/styles/studio.css` | Tailwind entry compiled to `dist/styles/studio.css` at build time.                                    |
| `dev/`                  | Development app and integration tests.                                                                |

## Pull requests

- Add tests for behaviour changes. Core changes need unit tests; plugin behaviour needs an integration test in `dev/int.spec.ts`.
- Add an entry under `[Unreleased]` in `CHANGELOG.md`.
- Run `pnpm dev:generate-importmap` after changing which admin components the plugin registers.

## Releasing

1. Move `[Unreleased]` entries in `CHANGELOG.md` under a new version heading with today's date.
2. Bump `version` in `package.json`.
3. Commit, tag `vX.Y.Z` and push the tag. The release workflow builds and publishes to npm.
