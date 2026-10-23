import type { Field } from 'payload'

/**
 * Where a schema holds a Studio look: every relationship named `slotField`
 * that points at the looks collection, found once when the config is built.
 * Hydration matches a slot in a document by the name of the group, array,
 * block field or named tab that holds it (`containers`), never by the shape
 * of a value; usage queries each slot by its dot path.
 */
export type SlotMap = {
  /** Names of the fields (group, array, blocks, named tab) whose direct children include the slot. */
  containers: Set<string>
  /** The `where` path of every slot: `hero.visual.look`, `layout.visual.look`. */
  paths: string[]
  /** Whether the slot sits at the document's root. */
  root: boolean
}

const isSlot = (field: Field, slotField: string, looksSlug: string) =>
  field.type === 'relationship' &&
  field.name === slotField &&
  (Array.isArray(field.relationTo)
    ? field.relationTo.includes(looksSlug)
    : field.relationTo === looksSlug)

export function slotMap(fields: Field[], slotField: string, looksSlug: string): SlotMap {
  const map: SlotMap = { containers: new Set(), paths: [], root: false }
  const walk = (list: Field[], prefix: string[], container: null | string) => {
    for (const field of list) {
      if (isSlot(field, slotField, looksSlug)) {
        map.paths.push([...prefix, slotField].join('.'))
        if (container) {
          map.containers.add(container)
        } else {
          map.root = true
        }
        continue
      }
      switch (field.type) {
        case 'array':
        case 'group': {
          if ('name' in field && field.name) {
            walk(field.fields, [...prefix, field.name], field.name)
          } else if ('fields' in field) {
            walk(field.fields, prefix, container)
          }
          break
        }
        case 'blocks': {
          for (const block of field.blocks) {
            walk(block.fields, [...prefix, field.name], field.name)
          }
          break
        }
        case 'collapsible':
        case 'row': {
          walk(field.fields, prefix, container)
          break
        }
        case 'tabs': {
          for (const tab of field.tabs) {
            if ('name' in tab && tab.name) {
              walk(tab.fields, [...prefix, tab.name], tab.name)
            } else {
              walk(tab.fields, prefix, container)
            }
          }
          break
        }
        default:
          break
      }
    }
  }
  walk(fields, [], null)
  return map
}

export const hasSlots = (map: SlotMap) => map.root || map.containers.size > 0

/** A stored relationship value, as an id: a bare id, or a populated document's. */
export const slotId = (value: unknown): null | number | string => {
  if (typeof value === 'number' || (typeof value === 'string' && value)) {
    return value
  }
  if (value && typeof value === 'object' && 'id' in value) {
    const { id } = value as { id: unknown }
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

/**
 * Every object in a document that holds the slot: the document itself when
 * the slot is at its root, and each container's value, or each row of one.
 */
export function slotHolders(
  doc: Record<string, unknown>,
  map: SlotMap,
  slotField: string,
): Record<string, unknown>[] {
  const holders: Record<string, unknown>[] = []
  const holds = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value)) &&
    slotId((value as Record<string, unknown>)[slotField]) !== null
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item)
      }
      return
    }
    for (const [key, child] of Object.entries(value)) {
      if (map.containers.has(key)) {
        if (holds(child)) {
          holders.push(child)
        } else if (Array.isArray(child)) {
          for (const item of child) {
            if (holds(item)) {
              holders.push(item)
            }
          }
        }
      }
      walk(child)
    }
  }
  if (map.root && holds(doc)) {
    holders.push(doc)
  }
  walk(doc)
  return holders
}
