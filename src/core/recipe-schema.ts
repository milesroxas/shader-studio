import type { JSONField } from 'payload'

import type { Effect, Parameter } from './effect.js'
import type { EffectRegistry } from './registry.js'

import { CAPTURE_SIDE, FRAME_MAX, RECIPE_VERSION, SEED_MAX } from './recipe.js'
import { STILL_LIMIT, stillUseIds, type StillUses, withCustomUse } from './stills.js'

/**
 * A recipe as JSON Schema, for the look's `recipe` field. The admin never sees
 * it (the Inspector replaces the JSON editor); it is there for the reader that
 * has no Inspector: an agent drafting a look over the API, whose tool schema is
 * built from this, and the generated `payload-types.ts`.
 *
 * Every name and range below is read out of the effect contracts, so nothing
 * here restates a number. Defaults are left out on purpose: they move with
 * every tuning pass. A published look's `snapshot` already shows every
 * resolved value.
 *
 * `deltas` stays an open object because its keys depend on a sibling field
 * (the look's `effect`), which JSON Schema cannot condition on; the parameter
 * table rides in its description, and `validateRecipe` is what answers on save.
 */

const describeParameter = (key: string, spec: Parameter): string => {
  if ('options' in spec) {
    return `${key}: ${spec.options.map((option) => `"${option}"`).join(' | ')}`
  }
  if ('toggle' in spec) {
    return `${key}: true | false`
  }
  if ('color' in spec) {
    return `${key}: [r, g, b], each 0 to 1`
  }
  if ('vector' in spec) {
    return `${key}: ${spec.vector} numbers, each ${spec.min} to ${spec.max}`
  }
  return `${key}: ${spec.min} to ${spec.max}`
}

const describeEffect = (effect: Effect): string => {
  const groups = new Map<string, string[]>()
  for (const [key, spec] of Object.entries(effect.parameters)) {
    const lines = groups.get(spec.group) ?? []
    lines.push(describeParameter(key, spec))
    groups.set(spec.group, lines)
  }
  const table = [...groups].map(([group, lines]) => `${group}: ${lines.join('; ')}.`).join(' ')
  return `When \`effect\` is "${effect.id}" (${effect.label}): ${table}`
}

const deltasDescription = (registry: EffectRegistry) =>
  [
    'Only the parameters that leave their default, by name. `{}` is the effect as it ships, and the `snapshot.dark` of any published look of the same effect shows every resolved value to start from. An unknown name or a value out of range is refused on save with the reason.',
    ...registry.ids.map((id) => describeEffect(registry.effects[id])),
  ].join(' ')

const uri = 'a://shader-studio/recipe.schema.json'
const stillsUri = 'a://shader-studio/stills.schema.json'

export function recipeJsonSchema(registry: EffectRegistry): NonNullable<JSONField['jsonSchema']> {
  const unseeded = registry.ids
    .filter((id) => !registry.effects[id].seeded)
    .map((id) => registry.effects[id].label)
  return {
    fileMatch: [uri],
    schema: {
      type: 'object',
      additionalProperties: false,
      description:
        'What a Studio look draws. A draft can be written over the API; publishing happens in the admin Studio, where the posters are rendered.',
      properties: {
        deltas: { type: 'object', description: deltasDescription(registry) },
        frame: {
          type: 'integer',
          description: 'The animation frame the posters are captured at.',
          maximum: FRAME_MAX,
          minimum: 1,
        },
        seed: {
          type: 'integer',
          description: `Lays out a seeded effect: a different seed is a different arrangement of the same look.${unseeded.length ? ` Send 0 for an effect no seed changes (${unseeded.join(', ')}).` : ''}`,
          maximum: SEED_MAX,
          minimum: 0,
        },
        version: { type: 'integer', enum: [RECIPE_VERSION] },
      },
      required: ['version', 'seed', 'deltas', 'frame'],
    },
    uri,
  }
}

/**
 * The look's stills as JSON Schema, for the `stills` field, for the same
 * reader. A still is rendered in the admin Studio on Publish; an agent can
 * draft one (its use, face, seed, frame and overrides) and leave the render
 * to the editor. `media` and `hash` are the published output and are never
 * sent.
 */
export function stillsJsonSchema(
  registry: EffectRegistry,
  uses: StillUses,
): NonNullable<JSONField['jsonSchema']> {
  const all = withCustomUse(uses)
  const ids = stillUseIds(uses)
  const describeUses = ids
    .map((use) => `"${use}" (${all[use].label}, ${all[use].width} × ${all[use].height})`)
    .join(', ')
  return {
    fileMatch: [stillsUri],
    schema: {
      type: 'array',
      description: `Static renders of the look, one per use. Each is the live recipe plus its own overrides, rendered in the admin Studio when the look is published; the published look serves its site uses wherever the look is used. Up to ${STILL_LIMIT}.`,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: 'Stable within the look; 6 to 12 lowercase letters and digits.',
            pattern: '^[a-z0-9]{6,12}$',
          },
          deltas: {
            type: 'object',
            description: `Overrides on the live recipe for this still only, by parameter name; \`{}\` is the look as it runs. ${deltasDescription(registry)}`,
          },
          format: { type: 'string', enum: ['webp', 'jpeg'] },
          frame: { type: 'integer', maximum: FRAME_MAX, minimum: 1 },
          height: { type: 'integer', maximum: CAPTURE_SIDE.max, minimum: CAPTURE_SIDE.min },
          label: { type: 'string', description: 'A name for a custom still.', maxLength: 80 },
          scale: {
            type: 'integer',
            description: 'Pixel density: 2 renders twice the size.',
            enum: [1, 2],
          },
          seed: { type: 'integer', maximum: SEED_MAX, minimum: 0 },
          surface: {
            type: 'string',
            description: 'The face the still is of.',
            enum: ['dark', 'light'],
          },
          transparent: {
            type: 'boolean',
            description:
              "Keep alpha instead of flattening onto the face's ground. Custom WebP only.",
          },
          use: { type: 'string', description: `One of ${describeUses}.`, enum: ids },
          width: {
            type: 'integer',
            description: 'Logical pixels. Fixed by the use; free for "custom".',
            maximum: CAPTURE_SIDE.max,
            minimum: CAPTURE_SIDE.min,
          },
        },
        required: [
          'id',
          'use',
          'surface',
          'width',
          'height',
          'scale',
          'format',
          'transparent',
          'seed',
          'frame',
          'deltas',
        ],
      },
    },
    uri: stillsUri,
  }
}
