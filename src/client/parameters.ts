import type { EffectCopy, ParameterCopy } from '../core/copy.js'
import type { Effect, Parameter, Surface } from '../core/effect.js'

export type { Dependency, EffectCopy, GroupSummary, ParameterCopy } from '../core/copy.js'

/** The stage's Ground control: the look's own colour under each face, effect-blind. */
export const GROUND_COPY: Record<Surface, ParameterCopy> = {
  dark: {
    description:
      'The colour under the look on its dark face: on the stage, under a filled still, and on the site wherever the look sits in a frame of its own. The default is the Studio ground.',
    label: 'Dark ground',
  },
  light: {
    description:
      'The colour under the look on its light face: on the stage, under a filled still, and on the site wherever the look sits in a frame of its own. The default is the Studio ground.',
    label: 'Light ground',
  },
}

/** How an option reads in a control: the authored name, else Capitalized. */
export const optionLabel = (copy: ParameterCopy | undefined, option: string) =>
  copy?.optionLabels?.[option] ?? option.replace(/^./, (character) => character.toUpperCase())

/** The copy for a parameter, or a reading built from its name when the effect wrote none. */
export const parameterCopy = (copy: EffectCopy, name: string): ParameterCopy =>
  copy.parameters[name] ?? {
    description: '',
    label: name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
  }

/** The contract's groups in table order, without the one the interaction tab holds. */
export const lookGroups = (effect: Effect, copy: EffectCopy): string[] => [
  ...new Set(
    Object.values(effect.parameters)
      .map((spec) => spec.group)
      .filter((group) => group !== copy.interaction?.group),
  ),
]

export const parameterKeys = (effect: Effect, group: string): string[] =>
  Object.keys(effect.parameters).filter((key) => effect.parameters[key].group === group)

/** Decimal places a value shows, derived from the parameter's step. */
export const decimals = (spec: Parameter): number => {
  if (!('step' in spec) || spec.step === undefined || spec.step >= 1) {
    return 0
  }
  return String(spec.step).split('.')[1]?.length ?? 0
}

/** A value at the parameter's precision with trailing zeros dropped: 0, 1.2, 0.08. */
export const formatValue = (spec: Parameter, value: number) =>
  String(Number(value.toFixed(decimals(spec))))

export const toHex = (rgb: readonly number[]) =>
  `#${rgb
    .map((n) =>
      Math.round(Math.min(1, Math.max(0, n)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`

export const fromHex = (hex: string): [number, number, number] | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) {
    return null
  }
  const [r, g, b] = [0, 2, 4].map(
    (offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255,
  )
  return [r, g, b]
}
