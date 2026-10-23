import { describe, expect, it } from 'vitest'

import { washEffect } from '../effects/wash/index.js'
import { createRegistry, effectOf, effectOptions, isEffectId } from './registry.js'

const E = washEffect

describe('createRegistry', () => {
  it('needs at least one effect and files the first as the default', () => {
    expect(() => createRegistry([])).toThrow('register at least one effect')
    const registry = createRegistry([E])
    expect(registry.ids).toEqual([E.id])
    expect(registry.defaultEffect).toBe(E.id)
    expect(registry.effects[E.id]).toBe(E)
  })

  it('refuses two effects with one id', () => {
    expect(() => createRegistry([E, { ...E }])).toThrow(`share the id "${E.id}"`)
  })

  it('refuses a contract that cannot be authored', () => {
    expect(() => createRegistry([{ ...E, id: '' }])).toThrow('string id')
    expect(() => createRegistry([{ ...E, placements: [] }])).toThrow('declares no placements')
    expect(() => createRegistry([{ ...E, fallbackLook: 'nope' }])).toThrow('fallback look')
    expect(() =>
      createRegistry([{ ...E, parameters: { ...E.parameters, nope: E.parameters.scale } }]),
    ).toThrow('parameter "nope" has no default')
    const { seed: _seed, ...defaults } = E.defaults
    expect(() => createRegistry([{ ...E, defaults, seeded: true }])).toThrow(
      'no numeric default seed',
    )
  })
})

describe('effectOf', () => {
  const registry = createRegistry([E])

  it('answers the contract for a known id and the default for anything else', () => {
    expect(effectOf(registry, E.id)).toBe(E)
    expect(effectOf(registry, 'nope')).toBe(E)
    expect(effectOf(registry, undefined)).toBe(E)
  })

  it('knows its ids and lists them for a select', () => {
    expect(isEffectId(registry, E.id)).toBe(true)
    expect(isEffectId(registry, 'nope')).toBe(false)
    expect(effectOptions(registry)).toEqual([{ label: E.label, value: E.id }])
  })
})
