import type { Effect } from './effect.js'

/**
 * Every effect the Studio can author, in the order an editor sees them. The
 * plugin builds one from its `effects` option on the server; the client builds
 * the same one from the effect providers the host registers. An effect's id is
 * stored as the `effect` a Studio look is filed under, so ids are stable.
 */
export type EffectRegistry = {
  /** The effect a look is filed under when its stored id is missing or unknown: the first one. */
  defaultEffect: string
  effects: Record<string, Effect>
  ids: string[]
}

export function createRegistry(contracts: readonly Effect[]): EffectRegistry {
  if (!contracts.length) {
    throw new Error('shader-studio: register at least one effect.')
  }
  const effects: Record<string, Effect> = {}
  for (const contract of contracts) {
    if (!contract.id || typeof contract.id !== 'string') {
      throw new Error('shader-studio: every effect needs a string id.')
    }
    if (effects[contract.id]) {
      throw new Error(`shader-studio: two effects share the id "${contract.id}".`)
    }
    if (!contract.placements?.length) {
      throw new Error(`shader-studio: effect "${contract.id}" declares no placements.`)
    }
    if (contract.seeded && typeof contract.defaults.seed !== 'number') {
      throw new Error(`shader-studio: seeded effect "${contract.id}" has no numeric default seed.`)
    }
    if (!Object.hasOwn(contract.looks, contract.fallbackLook)) {
      throw new Error(
        `shader-studio: effect "${contract.id}" names a fallback look it does not ship.`,
      )
    }
    for (const key of Object.keys(contract.parameters)) {
      if (!(key in contract.defaults)) {
        throw new Error(`shader-studio: effect "${contract.id}" parameter "${key}" has no default.`)
      }
    }
    effects[contract.id] = contract
  }
  const ids = Object.keys(effects)
  return { defaultEffect: ids[0], effects, ids }
}

export const isEffectId = (registry: EffectRegistry, value: unknown): value is string =>
  typeof value === 'string' && Object.hasOwn(registry.effects, value)

/** The contract for a stored effect id. Anything unknown reads as the default effect, as a missing one does. */
export const effectOf = (registry: EffectRegistry, id: unknown): Effect =>
  registry.effects[isEffectId(registry, id) ? id : registry.defaultEffect]

export const effectOptions = (registry: EffectRegistry) =>
  registry.ids.map((id) => ({ label: registry.effects[id].label, value: id }))
