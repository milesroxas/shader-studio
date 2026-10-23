import type { Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { hasSlots, slotHolders, slotId, slotMap } from './slots.js'

const LOOKS = 'studio-looks'
const look = (): Field => ({ name: 'look', type: 'relationship', relationTo: LOOKS })

const fields: Field[] = [
  { name: 'title', type: 'text' },
  look(),
  { name: 'author', type: 'relationship', relationTo: 'users' },
  // A relationship with the slot's name to another collection is not a slot.
  {
    name: 'other',
    type: 'group',
    fields: [{ name: 'look', type: 'relationship', relationTo: 'users' }],
  },
  { name: 'hero', type: 'group', fields: [{ type: 'row', fields: [look()] }] },
  {
    type: 'tabs',
    tabs: [
      { fields: [{ name: 'items', type: 'array', fields: [look()] }], label: 'Content' },
      { name: 'meta', fields: [{ type: 'collapsible', fields: [look()], label: 'Meta' }] },
    ],
  },
  {
    name: 'layout',
    type: 'blocks',
    blocks: [
      { slug: 'visual', fields: [{ name: 'caption', type: 'text' }, look()] },
      { slug: 'text', fields: [{ name: 'body', type: 'textarea' }] },
    ],
  },
  {
    name: 'poly',
    type: 'group',
    fields: [{ name: 'look', type: 'relationship', relationTo: ['users', LOOKS] }],
  },
]

describe('slotMap', () => {
  const map = slotMap(fields, 'look', LOOKS)

  it('finds a slot at the root, under groups, named tabs, arrays and blocks', () => {
    expect(map.root).toBe(true)
    expect(map.paths).toEqual([
      'look',
      'hero.look',
      'items.look',
      'meta.look',
      'layout.look',
      'poly.look',
    ])
    expect([...map.containers].sort()).toEqual(['hero', 'items', 'layout', 'meta', 'poly'])
    expect(hasSlots(map)).toBe(true)
  })

  it('ignores a schema with no slot, and a relationship of the same name elsewhere', () => {
    const none = slotMap(
      [
        { name: 'title', type: 'text' },
        { name: 'look', type: 'relationship', relationTo: 'users' },
      ],
      'look',
      LOOKS,
    )
    expect(hasSlots(none)).toBe(false)
    expect(none.paths).toEqual([])
    expect(map.containers.has('other')).toBe(false)
  })

  it('matches the configured field name only', () => {
    expect(slotMap(fields, 'visual', LOOKS).paths).toEqual([])
  })
})

describe('slotId', () => {
  it('reads a bare id or a populated document, and nothing else', () => {
    expect(slotId(3)).toBe(3)
    expect(slotId('abc')).toBe('abc')
    expect(slotId({ id: 4, title: 'x' })).toBe(4)
    expect(slotId({ id: 'abc' })).toBe('abc')
    expect(slotId(null)).toBe(null)
    expect(slotId('')).toBe(null)
    expect(slotId({ title: 'x' })).toBe(null)
  })
})

describe('slotHolders', () => {
  const map = slotMap(fields, 'look', LOOKS)

  it('returns every object that holds the slot, root included', () => {
    const doc = {
      hero: { look: 2 },
      items: [{ look: 3 }, { look: null }],
      layout: [
        { blockType: 'visual', caption: 'a', look: { id: 4 } },
        { blockType: 'text', body: 'b' },
      ],
      look: 1,
      meta: { look: 5 },
      other: { look: 9 },
      poly: { look: 6 },
      title: 'Page',
    }
    const holders = slotHolders(doc, map, 'look')
    expect(holders.map((holder) => slotId(holder.look)).sort()).toEqual([1, 2, 3, 4, 5, 6])
    expect(holders).toContain(doc)
    expect(holders).toContain(doc.hero)
    expect(holders).toContain(doc.layout[0])
    expect(holders).not.toContain(doc.other)
  })

  it('reaches containers nested inside rows that are not containers themselves', () => {
    const nested = slotMap(
      [
        {
          name: 'wrap',
          type: 'group',
          fields: [{ name: 'hero', type: 'group', fields: [look()] }],
        },
      ],
      'look',
      LOOKS,
    )
    const doc = { wrap: { hero: { look: 7 } } }
    expect(nested.paths).toEqual(['wrap.hero.look'])
    expect(slotHolders(doc, nested, 'look')).toEqual([{ look: 7 }])
  })
})
