import { type ClassValue, clsx } from 'clsx'
import { type ClassValidator, extendTailwindMerge, validators } from 'tailwind-merge'

const { isArbitraryValue, isNumber } = validators

/* One tw-animate-css enter/exit group: the bare utility (`fade-in`) plus its
   sized form (`fade-in-0`, `fade-in-[.4]`). */
const animateGroup = (...names: string[]): (Record<string, ClassValidator[]> | string)[] => [
  ...names,
  Object.fromEntries(names.map((name) => [name, [isNumber, isArbitraryValue]])),
]

type AnimateGroupIds =
  | 'animate-fade-in'
  | 'animate-fade-out'
  | 'animate-slide-in-x'
  | 'animate-slide-in-y'
  | 'animate-slide-out-x'
  | 'animate-slide-out-y'
  | 'animate-zoom-in'
  | 'animate-zoom-out'

const twMerge = extendTailwindMerge<AnimateGroupIds>({
  extend: {
    classGroups: {
      /* tw-animate-css enter/exit utilities, so a consumer can retune a
         primitive's `data-open:zoom-in-95` with `data-open:zoom-in-98`.
         Unregistered, both classes ship and the primitive's wins on source
         order. Each axis is its own group: a slide from the top and one from
         the left compose, but two from the top conflict. */
      'animate-fade-in': animateGroup('fade-in'),
      'animate-fade-out': animateGroup('fade-out'),
      'animate-slide-in-x': animateGroup('slide-in-from-left', 'slide-in-from-right'),
      'animate-slide-in-y': animateGroup('slide-in-from-top', 'slide-in-from-bottom'),
      'animate-slide-out-x': animateGroup('slide-out-to-left', 'slide-out-to-right'),
      'animate-slide-out-y': animateGroup('slide-out-to-top', 'slide-out-to-bottom'),
      'animate-zoom-in': animateGroup('zoom-in'),
      'animate-zoom-out': animateGroup('zoom-out'),
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
