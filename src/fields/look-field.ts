import type { PayloadRequest, RelationshipField } from 'payload'

import { component, EFFECT_FIELD } from '../paths.js'

/** How a slot names its effect: one fixed effect id, or a sibling field whose value is the id. */
export type SlotEffect = { sibling: string } | string

export type StudioLookFieldArgs = {
  /**
   * The effect this slot draws: an effect id, or `{ sibling: 'visualType' }`
   * to read it from a sibling field (a select of effect ids), so one slot can
   * offer several effects.
   */
  effect: SlotEffect
  /** The slot's name in a new look's title ("Hero"): a look made from the slot is "Page title · Hero". */
  label?: string
  /** The looks collection's slug, when the plugin was given one other than `studio-looks`. */
  looksSlug?: string
  /** The field's name. Must equal the plugin's `slotField` (`look` unless configured). */
  name?: string
  /** Fields merged over the relationship: `label`, `admin.description`, `required`. */
  overrides?: Partial<Omit<RelationshipField, 'name' | 'relationTo' | 'type'>>
  /** The placement the Studio opens at for a look made or edited from this slot; one of the effect's `placements`. */
  placement?: string
  /**
   * A sibling text field that holds a shipped look's id. The picker offers
   * the effect's shipped looks beside the editor's own and writes this field
   * for the first; a new look starts from the shipped look it names.
   */
  presetField?: string
}

/** The props the picker receives, serialized into the field's client props. */
export type LookFieldClientProps = {
  effect: SlotEffect
  label?: string
  looksSlug: string
  placement?: string
  presetField?: string
}

const effectAt = (effect: SlotEffect, siblingData: unknown): null | string => {
  if (typeof effect === 'string') {
    return effect
  }
  const value = (siblingData as Record<string, unknown> | undefined)?.[effect.sibling]
  return typeof value === 'string' ? value : null
}

/**
 * The relationship a visual slot stores a Studio look in. On every read the
 * plugin replaces the id with the published look's snapshot, posters and
 * ground (`parseRelease` reads it); the admin shows the Studio's picker, which
 * creates a look for the slot and opens it in a drawer. A host document can
 * publish only with a look that is published and filed under the slot's effect.
 */
export function studioLookField({
  name = 'look',
  effect,
  label,
  looksSlug = 'studio-looks',
  overrides,
  placement,
  presetField,
}: StudioLookFieldArgs): RelationshipField {
  const clientProps: LookFieldClientProps = { effect, label, looksSlug, placement, presetField }
  return {
    name,
    type: 'relationship',
    admin: {
      components: { Field: { clientProps, path: component('FieldPicker') } },
    },
    index: true,
    label: 'Look',
    // Never populated: the plugin hydrates the id with the published look's
    // snapshot and posters, for every reader alike.
    maxDepth: 0,
    relationTo: looksSlug,
    // Runs when the host document is published (draft saves skip validation):
    // a look with nothing published has no poster and no snapshot to render
    // from, and one filed under another effect cannot be drawn here at all.
    validate: async (
      value: unknown,
      { req, siblingData }: { req: PayloadRequest; siblingData?: unknown },
    ) => {
      if (!value) {
        return true
      }
      const id = typeof value === 'object' && value && 'id' in value ? value.id : value
      const look = (await req.payload.findByID({
        id: String(id),
        collection: looksSlug,
        depth: 0,
        disableErrors: true,
        draft: false,
        req,
        select: { [EFFECT_FIELD]: true, snapshot: true } as never,
      })) as null | Record<string, unknown>
      if (!look) {
        return 'Choose an available look.'
      }
      const wanted = effectAt(effect, siblingData)
      if (wanted && look[EFFECT_FIELD] !== wanted) {
        return 'This look was made for another effect. Choose a look of this effect.'
      }
      return look.snapshot ? true : 'Publish this look in Studio first.'
    },
    ...overrides,
  } as RelationshipField
}
