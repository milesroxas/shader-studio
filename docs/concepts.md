# Concepts

A look is a document in the looks collection. This page describes what it holds and how publishing turns it into something a site can render.

## Recipe

What the author stores: `{ version: 1, seed, frame, deltas }`. `deltas` holds only the parameters that differ from the effect's defaults and is validated against the contract on every save. The recipe field carries a JSON schema, so generated types and API clients see every parameter's range.

## Snapshot

What the site renders from. Written only by Publish: the recipe resolved to a full tuning for each face (`dark`, `light`), capped at the effect's widest placement and stamped with the effect's `renderer`. Two recipes that resolve to the same snapshot are the same release. The plugin hashes the canonical snapshot as `sourceHash`.

## Posters

The look as it runs, rendered on both faces at 1600 × 900 with alpha in the editor's browser on Publish, then filed in the media collection. The plugin prevents these media documents from being edited or deleted while a published look serves them.

## Ground

A look may set the colour under itself on each face. It is stored beside the recipe, so posters stay transparent and the page paints the colour. `groundAttributes(release.ground)` returns the custom properties for a stylesheet.

## Stills

Static renders, one per use: a share image the site serves, social sizes to download, or a custom size with or without alpha. A still is the live recipe plus its own overrides at its own seed and frame. Publish renders only stills whose pixels changed.

## Placements

An effect names where it may run, widest first, for example `['hero', 'block', 'card']`. The stage previews each placement at its budget. Snapshots and stills are capped at the widest.

## History and usage

The History tab lists every published state from Payload's versions. Compare one on the stage or restore it as the draft. The Details tab lists every document whose slot holds the look. A look in use cannot be deleted. **Archived** hides a look from the picker without touching the places that use it.

## Publishing

The studio replaces Payload's Publish button. A look published any other way (REST, Revert to published) succeeds only when its recipe, ground and stills match what is already live, because the site needs posters that match the snapshot.
