# AGENTS.md

This file gives coding agents project-specific context. Keep it short and update it when workflows change.

## Project Overview

- Primary package: `shader-studio`, a Payload CMS plugin for authoring and publishing WebGL shader looks. Layout follows Payload's plugin template: package in `src/`, a Payload dev app in `dev/`.
- Main entry points: `src/index.ts` (plugin), `src/exports/client.ts`, `src/exports/types.ts`, `src/effects/wash/index.ts` and `src/effects/wash/client.tsx` (package.json `exports`).
- Important directories: `src/core/` pure engine (fully unit tested), `src/client/` admin studio components, `src/effects/wash/` shipped example effect, `dev/` development app and integration tests. Details in `CONTRIBUTING.md` and `docs/`.

## Architecture Notes

- Module boundaries: `src/core/` is a pure engine; it imports only types from React and Payload, never runtime code. `src/client/` is admin-only code shipped through the `./client` export.
- Generated code: `dev/app/(payload)/admin/importMap.js` (`pnpm generate:importmap`) and `dev/payload-types.ts` (`pnpm generate:types`). `src/client/ui/` holds vendored shadcn-style primitives; their unused exports are exempt in `.fallowrc.jsonc`.
- Sensitive areas: `src/media.ts` guards and `src/endpoints.ts` run with Payload access control; see `SECURITY.md`.

## Commands

<!-- fallow init prefilled these from package.json; confirm before relying on them -->
- Install: `pnpm install`
- Dev app: `pnpm dev` (admin at http://localhost:3002/admin)
- Build: `pnpm build`
- Test: `pnpm test:unit`, `pnpm test:int` (needs `DATABASE_URI` and `PAYLOAD_SECRET`, see `.github/workflows/ci.yml`)
- Lint and format: `pnpm lint` (Biome); fix with `pnpm lint:fix`
- Typecheck: `pnpm typecheck`
- Dead code: `pnpm fallow`

## Fallow

- Use `fallow audit --format json --quiet` before committing AI-generated changes.
- Use `fallow dead-code --format json --quiet`, `fallow dupes --format json --quiet`, and `fallow health --format json --quiet` for targeted checks.
- Use `fallow list --entry-points --format json --quiet` and `fallow list --boundaries --format json --quiet` to inspect project shape.

<!-- generated:task-matrix:start -->
| When the agent is about to...                                        | Run                                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| delete an "unused" export or file                                    | `fallow dead-code --trace <file>:<export>`                                                                                                                    |
| prove a TypeScript symbol's exact consumers before refactoring       | `fallow dead-code --type-aware --symbol-impact <file>:<export-or-class.method>`                                                                               |
| find how one module reaches another                                  | `fallow trace --path <from> <to>` (Reports `reachable: false` instead of failing when no import path exists; type-only hops are reported, not skipped.)       |
| delete an "unused" dependency                                        | `fallow dead-code --trace-dependency <name>`                                                                                                                  |
| migrate a dependency                                                 | `fallow trace --dependency <name> --sites` (Counts each imported name, follows one hop through project wrappers, and counts each use that it cannot resolve.) |
| commit or open a PR                                                  | `fallow audit --base <ref>`                                                                                                                                   |
| read a diff before approving it                                      | `fallow review --base <ref> --brief` (orientation, never gates: deterministic and always exit 0, unlike the audit row)                                        |
| prioritize refactoring                                               | `fallow health --hotspots --targets`                                                                                                                          |
| ask who owns code                                                    | `fallow health --ownership`                                                                                                                                   |
| check untested-but-reachable code                                    | `fallow health --coverage-gaps`                                                                                                                               |
| consolidate duplication                                              | `fallow dupes --trace dup:<fingerprint>`                                                                                                                      |
| find feature flags                                                   | `fallow flags`                                                                                                                                                |
| check which architecture rules apply to a file before changing it    | `fallow guard <files>`                                                                                                                                        |
| check import cycles, boundaries and policy rules after changing code | `fallow architecture`                                                                                                                                         |
| surface security candidates                                          | `fallow security`                                                                                                                                             |
| understand a finding                                                 | `fallow explain <issue-type>`                                                                                                                                 |
| scope a monorepo                                                     | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command)                                                                          |
<!-- generated:task-matrix:end -->

## Agent Rules

- Do not edit generated files by hand: regenerate with the commands above.
- Always ask before deleting an export fallow reports unused; trace it first (`fallow dead-code --trace <file>:<export>`).
- Preferred style: Biome config in `biome.json` (single quotes, no semicolons, 100 columns). Add a `CHANGELOG.md` entry under `[Unreleased]` for behaviour changes, with tests.
