'use client'

import type * as React from 'react'

import { IconCheck, IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react'
import { Select as SelectPrimitive } from 'radix-ui'

import { cn } from './cn.js'

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

/** The viewport owns the margin around the rows; a group only scrolls clear of it. */
function SelectGroup({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      className={cn('scroll-my-1', className)}
      data-slot="select-group"
      {...props}
    />
  )
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

/** The boxed trigger, at three heights: `default` (28), `sm` (24) and `field` (26, the inspector row). */
const selectTriggerClasses =
  "flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-input/20 px-2 py-1.5 text-xs/relaxed whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-7 data-[size=sm]:h-6 data-[size=field]:h-6.5 data-[size=field]:px-2.5 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"

function SelectTrigger({
  children,
  className,
  icon,
  size = 'default',
  ...props
}: {
  /** Replaces the default selector glyph, for triggers styled as bare text. */
  icon?: React.ReactNode
  size?: 'default' | 'field' | 'sm'
} & React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(selectTriggerClasses, className)}
      data-size={size}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        {icon ?? <IconSelector className="pointer-events-none size-3.5 text-muted-foreground" />}
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  align = 'center',
  children,
  className,
  position = 'item-aligned',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        align={align}
        className={cn(
          'relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10',
          // A picker aligned to its trigger already sits where the value was,
          // so it materialises in place: sliding or scaling it would fight the
          // alignment that put it there. A popper menu comes from its trigger,
          // so it scales out of that corner and leaves the same way.
          position === 'item-aligned'
            ? 'duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0'
            : 'duration-150 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          'motion-reduce:animate-none',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        data-align-trigger={position === 'item-aligned'}
        data-slot="select-content"
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        {/* Popper mode matches the trigger's width but never its height: a
            trigger styled as bare text is one line tall, and pinning the
            viewport to it would clip the menu to a single row. The rows sit
            inside a margin of their own, so a highlighted row's rounded
            corners read against the panel's and no row touches its edge. */}
        <SelectPrimitive.Viewport
          className="p-1 data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)"
          data-position={position}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
      data-slot="select-label"
      {...props}
    />
  )
}

/**
 * `description` is a second line under the option, for a menu whose options
 * need a word of explanation (a noise formula, an export format). It sits
 * outside the item text, so the trigger shows only the option itself.
 */
function SelectItem({
  children,
  className,
  description,
  ...props
}: { description?: React.ReactNode } & React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-7 pl-2 text-xs/relaxed outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      data-slot="select-item"
      {...props}
    >
      {/* The mark sits on the first line, not centred over the pair: with a
          description under it, a vertically centred tick belongs to neither
          line. The row reserves its column, so no label runs under it. */}
      <span className="pointer-events-none absolute top-1.5 right-2 flex h-4.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {/* A div, not a span: the option's own row is the span Radix renders
          for the item text, and it is that row, not this column, that lays
          an icon out beside the label. Radix drops a className on ItemText,
          so the column states the row's layout for it. */}
      <div className="flex min-w-0 flex-col items-start gap-0.5 *:first:flex *:first:items-center *:first:gap-2">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description && (
          <span className="max-w-56 text-[11px]/4 text-pretty text-muted-foreground">
            {description}
          </span>
        )}
      </div>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border/50', className)}
      data-slot="select-separator"
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      className={cn(
        "z-10 flex h-7 cursor-default items-start justify-center rounded-t-lg bg-gradient-to-b from-popover from-65% to-transparent pt-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      data-slot="select-scroll-up-button"
      {...props}
    >
      <IconChevronUp />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      className={cn(
        "z-10 flex h-7 cursor-default items-end justify-center rounded-b-lg bg-gradient-to-t from-popover from-65% to-transparent pb-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      data-slot="select-scroll-down-button"
      {...props}
    >
      <IconChevronDown />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
