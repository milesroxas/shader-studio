'use client'

import type * as React from 'react'

import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './cn.js'

/**
 * Two input treatments, stated once.
 *
 * - `default`: the boxed control (filters, inline forms, a search field).
 * - `value`: the boxed control at inspector density, for the number beside a
 *   slider: mono, right-set, tabular so a changing figure never shifts its
 *   neighbours, and no spinner (the slider is the coarse control).
 *
 * `text-base` below md in `default`: iOS Safari zooms the page when a focused
 * control is under 16px, and the zoom outlives the form.
 */
const inputVariants = cva(
  'w-full min-w-0 transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default:
          'h-7 rounded-md border border-input bg-input/20 px-2 py-0.5 text-base file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        value:
          'h-6.5 rounded-md border border-input bg-input/20 px-2 text-right font-mono text-xs/4 tabular-nums disabled:border-transparent disabled:bg-transparent disabled:text-muted-foreground/60 disabled:opacity-100 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
      },
    },
  },
)

function Input({
  type,
  className,
  variant,
  ...props
}: React.ComponentProps<'input'> & VariantProps<typeof inputVariants>) {
  return (
    <input
      className={cn(inputVariants({ variant }), className)}
      data-slot="input"
      data-variant={variant ?? 'default'}
      type={type}
      {...props}
    />
  )
}

export { Input, inputVariants }
