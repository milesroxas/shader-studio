import { describe, expect, it } from 'vitest'

import { washEffect } from '../effects/wash/index.js'
import { FRAME_MAX, RECIPE_VERSION, SEED_MAX } from './recipe.js'
import { recipeJsonSchema, stillsJsonSchema } from './recipe-schema.js'
import { createRegistry } from './registry.js'
import { DEFAULT_STILL_USES, stillUseIds, withCustomUse } from './stills.js'

const E = washEffect
const registry = createRegistry([E])

type Schema = { properties: Record<string, Record<string, unknown>>; required: string[] }

describe('recipeJsonSchema', () => {
  const { schema } = recipeJsonSchema(registry) as { schema: Schema }

  it('requires every recipe property and pins the version', () => {
    expect(schema.required).toEqual(['version', 'seed', 'deltas', 'frame'])
    expect(schema.properties.version.enum).toEqual([RECIPE_VERSION])
    expect(schema.properties.seed.maximum).toBe(SEED_MAX)
    expect(schema.properties.frame.maximum).toBe(FRAME_MAX)
  })

  it('describes every parameter of every effect, by group', () => {
    const description = String(schema.properties.deltas.description)
    expect(description).toContain(`"${E.id}" (${E.label})`)
    for (const [key, spec] of Object.entries(E.parameters)) {
      expect(description).toContain(`${key}:`)
      expect(description).toContain(`${spec.group}:`)
    }
  })
})

describe('stillsJsonSchema', () => {
  const { schema } = stillsJsonSchema(registry, DEFAULT_STILL_USES) as {
    schema: { items: Schema }
  }

  it('offers every use, custom included', () => {
    expect(schema.items.properties.use.enum).toEqual(stillUseIds(DEFAULT_STILL_USES))
    const description = String(schema.items.properties.use.description)
    for (const [use, spec] of Object.entries(withCustomUse(DEFAULT_STILL_USES))) {
      expect(description).toContain(`"${use}" (${spec.label}, ${spec.width} × ${spec.height})`)
    }
  })

  it('requires the inputs and never the outputs', () => {
    expect(schema.items.required).not.toContain('media')
    expect(schema.items.required).not.toContain('hash')
    expect(schema.items.required).toContain('deltas')
    expect(schema.items.properties).not.toHaveProperty('media')
  })
})
