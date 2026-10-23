'use client'

import { Label } from '../ui/label.js'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.js'

/**
 * A setting on the Inspector's own grid: the same label, control and value
 * columns the parameter rows use, so a still's output setting and a parameter
 * read as one panel rather than two forms that happen to share a sidebar. The
 * caller places what follows the label: a control in the middle column,
 * optionally a readout in the value column, or one element spanning both.
 */
export function SettingRow({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode
  htmlFor?: string
  label: string
}) {
  return (
    <div className="grid grid-cols-[var(--row-label)_minmax(0,1fr)_var(--row-value)] items-center gap-x-2.5">
      <Label className="min-h-9 cursor-default text-foreground/80 text-xs/4" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  )
}

export function SettingToggle({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (next: string) => void
  options: readonly (readonly [value: string, label: string])[]
  value: string
}) {
  return (
    <SettingRow label={label}>
      <ToggleGroup
        aria-label={label}
        onValueChange={(next) => next && onChange(next)}
        size="sm"
        type="single"
        value={value}
        variant="segmented"
      >
        {options.map(([option, text]) => (
          <ToggleGroupItem key={option} value={option}>
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SettingRow>
  )
}
