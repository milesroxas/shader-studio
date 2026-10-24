'use client'

import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react'

import type { Parameter, RangeParameter, VectorParameter } from '../../core/index.js'

import {
  type Dependency,
  decimals,
  formatValue,
  fromHex,
  optionLabel,
  type ParameterCopy,
  toHex,
} from '../parameters.js'
import { cn } from '../ui/cn.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.js'
import { Slider } from '../ui/slider.js'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js'

/** A toggle is a two-option control like any other; these are its options. */
const TOGGLE = ['off', 'on'] as const

/**
 * What a row is about: the parameter's name, its contract, its copy and the
 * value it departs from. Editing the look, that is the effect's default;
 * editing a still, it is the look's own value, and `base` says which.
 */
export type RowParameter = {
  base?: 'default' | 'look'
  copy: ParameterCopy
  fallback: unknown
  name: string
  spec: Parameter
}

const controlId = (name: string) => `studio-${name}`

/** `next` held to the range and rounded to the field's places. */
const clampTo = (next: number, min: number, max: number, places: number) =>
  Number(Math.min(max, Math.max(min, next)).toFixed(places))

/** What a field shows while it is typed in; outside an edit it follows `value`. */
function useFieldDraft(value: string) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) {
      setDraft(value)
    }
  }, [value, editing])
  return { draft, setDraft, setEditing }
}

type ValueFieldProps = {
  className?: string
  disabled?: boolean
  invalid?: boolean
  label: string
  max: number
  min: number
  onCommit: (next: number) => void
  places: number
  step?: number
  value: number
}

/**
 * A number typed into the value field. It commits on Enter or blur, clamped
 * to the parameter's range and rounded to its step; Escape reverts; Shift
 * with an arrow steps by ten. The slider is the coarse control, so the field
 * shows no spinner of its own.
 */
function ValueField({
  className,
  disabled,
  invalid,
  label,
  max,
  min,
  onCommit,
  places,
  step = 0.01,
  value,
}: ValueFieldProps) {
  const shown = String(Number(value.toFixed(places)))
  const { draft, setDraft, setEditing } = useFieldDraft(shown)

  const commit = () => {
    setEditing(false)
    const parsed = Number.parseFloat(draft)
    if (!Number.isFinite(parsed)) {
      return setDraft(shown)
    }
    onCommit(clampTo(parsed, min, max, places))
  }

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(shown)
      setEditing(false)
      event.currentTarget.blur()
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.shiftKey) {
      event.preventDefault()
      const direction = event.key === 'ArrowUp' ? 1 : -1
      onCommit(clampTo(value + direction * step * 10, min, max, places))
    }
  }

  return (
    <Input
      aria-invalid={invalid || undefined}
      aria-label={label}
      className={className}
      disabled={disabled}
      inputMode="decimal"
      max={max}
      min={min}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setEditing(true)}
      onKeyDown={keys}
      step={step}
      type="number"
      value={draft}
      variant="value"
    />
  )
}

function ParameterTooltip({
  changed,
  children,
  parameter: { name, base = 'default', copy, fallback, spec },
}: {
  changed: boolean
  children: ReactNode
  parameter: RowParameter
}) {
  const defaultText =
    'color' in spec
      ? toHex(fallback as readonly number[])
      : 'options' in spec
        ? optionLabel(copy, String(fallback))
        : 'toggle' in spec
          ? optionLabel(copy, TOGGLE[Number(fallback)])
          : 'vector' in spec
            ? (fallback as readonly number[]).map((n) => formatValue(spec, n)).join(', ')
            : formatValue(spec, Number(fallback))
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent collisionPadding={12} side="left" sideOffset={12} variant="panel">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="flex-1 font-semibold text-[13px]/4 text-foreground">{copy.label}</span>
            <span className="font-mono text-[11px]/3.5 text-muted-foreground">{name}</span>
          </div>
          <p className="text-pretty text-foreground/80">{copy.description}</p>
          <p className="flex gap-3 whitespace-nowrap font-mono text-[11px]/3.5 text-muted-foreground">
            {'min' in spec && (
              <>
                <span>
                  {spec.min}–{spec.max}
                  {copy.unit ? ` ${copy.unit}` : ''}
                </span>
                <span>step {spec.step ?? 0.01}</span>
              </>
            )}
            <span>
              {base} {defaultText}
            </span>
          </p>
          {changed && (
            <p className="flex items-center gap-1.5 text-[11px]/3.5 text-primary">
              <span aria-hidden className="size-1.25 shrink-0 rounded-full bg-primary" />
              Changed from {defaultText}. Option-click the label to reset.
            </p>
          )}
          {'min' in spec && (
            <p className="border-muted border-t pt-2 font-mono text-[10px]/3.5 text-muted-foreground uppercase tracking-[0.02em]">
              ↑↓ step · ⇧ ×10 · ⏎ type
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The frame every parameter shares: a label column, a control column, and a
 * value column fixed at `--row-value` so that one number, a range pair and a
 * select's readout all end on the same rule and every slider track stops at
 * the same place. A value that departs from its default is marked by a dot
 * before its label, in a slot the label reserves whether or not the dot
 * shows, so the column reads down one rule as values are edited. A row whose
 * control does nothing until another setting changes shows muted, with the
 * reason under it and a button that makes the change.
 */
function RowShell({
  changed,
  children,
  inactive,
  label,
  note,
  onFix,
  onReset,
  parameter,
}: {
  changed: boolean
  children: ReactNode
  inactive?: Dependency
  label?: string
  note?: ReactNode
  onFix: (fix: Dependency['fix']) => void
  onReset: () => void
  parameter: RowParameter
}) {
  const disabled = Boolean(inactive)
  return (
    <div
      className="group/row relative grid grid-cols-[var(--row-label)_minmax(0,1fr)_var(--row-value)] items-center gap-x-2.5"
      data-changed={changed || undefined}
      data-inactive={disabled || undefined}
    >
      <ParameterTooltip changed={changed} parameter={parameter}>
        <Label
          className="min-h-9 cursor-default gap-1.5 text-foreground/80 text-xs/4 transition-colors group-hover/row:text-foreground group-data-[changed]/row:text-foreground group-data-[inactive]/row:text-muted-foreground/60"
          htmlFor={controlId(parameter.name)}
          onClick={(event) => {
            if (event.altKey) {
              event.preventDefault()
              onReset()
            }
          }}
        >
          {/* The marker holds its place whether or not it shows, so a label's
              text starts on the same rule in every row and the column stays
              scannable while values are edited. */}
          <span
            aria-hidden
            className="size-1.5 shrink-0 scale-50 rounded-full bg-primary opacity-0 transition-[opacity,scale] duration-200 ease-out-quint group-data-[changed]/row:scale-100 group-data-[changed]/row:opacity-100 motion-reduce:transition-none"
          />
          {label ?? parameter.copy.label}
        </Label>
      </ParameterTooltip>
      {children}
      {/* The reason wraps on a narrow panel, so the line sizes to its content:
          a fixed height here spills into the row below. */}
      {inactive && <InactiveReason inactive={inactive} onFix={onFix} />}
      {note}
    </div>
  )
}

function InactiveReason({
  inactive,
  onFix,
}: {
  inactive: Dependency
  onFix: (fix: Dependency['fix']) => void
}) {
  return (
    <p className="col-span-2 col-start-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 pb-1.5 text-[11px]/4 text-muted-foreground">
      {inactive.reason}
      {inactive.fix && (
        <button
          className="pressable cursor-pointer whitespace-nowrap text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => onFix(inactive.fix)}
          type="button"
        >
          {inactive.fixLabel}
        </button>
      )}
    </p>
  )
}

type RowProps = {
  changed: boolean
  /** Small text after a select's value, such as the octave count the code owns. */
  hint?: string
  inactive?: Dependency
  invalid?: boolean
  onChange: (next: unknown) => void
  onFix: (fix: Dependency['fix']) => void
  onReset: () => void
  parameter: RowParameter
  value: unknown
}

export function ParameterRow(props: RowProps) {
  const { changed, inactive, onFix, onReset, parameter } = props
  return (
    <RowShell
      changed={changed}
      inactive={inactive}
      onFix={onFix}
      onReset={onReset}
      parameter={parameter}
    >
      {controlFor(props)}
    </RowShell>
  )
}

type ControlProps = {
  copy: ParameterCopy
  disabled: boolean
  name: string
  onChange: (next: unknown) => void
}

/** The controls a row holds, by the kind of parameter it is. */
function controlFor({
  changed,
  hint,
  inactive,
  invalid,
  onChange,
  parameter: { name, copy, fallback, spec },
  value,
}: RowProps): ReactNode {
  const control = { name, copy, disabled: Boolean(inactive), onChange }
  if ('options' in spec || 'toggle' in spec) {
    const toggle = 'toggle' in spec
    const choice = {
      choose: (next: string) => next && onChange(toggle ? next === 'on' : next),
      current: toggle ? TOGGLE[Number(value)] : String(value),
      options: toggle ? TOGGLE : spec.options,
    }
    // A discrete control fills the control column, the way the slider and the
    // select beside it do: three controls that stop on the same rule read as
    // one column, and a two-option toggle at that width is still a control
    // rather than a target.
    if (choice.options.length <= 2) {
      return <ChoiceToggle {...control} {...choice} />
    }
    return <ChoiceSelect {...control} {...choice} hint={hint} />
  }
  if ('color' in spec) {
    return <ColorControl {...control} value={value as readonly number[]} />
  }
  if ('vector' in spec) {
    return <VectorControl {...control} spec={spec} values={value as readonly number[]} />
  }
  return (
    <RangeControl
      {...control}
      changed={changed}
      fallback={fallback}
      invalid={invalid}
      spec={spec}
      value={Number(value)}
    />
  )
}

type Choice = {
  choose: (next: string) => unknown
  current: string
  options: readonly string[]
}

function ChoiceToggle({ name, choose, copy, current, disabled, options }: Choice & ControlProps) {
  return (
    <ToggleGroup
      disabled={disabled}
      onValueChange={choose}
      size="sm"
      type="single"
      value={current}
      variant="segmented"
    >
      {options.map((option) => {
        const item = (
          <ToggleGroupItem
            id={option === current ? controlId(name) : undefined}
            key={option}
            value={option}
          >
            {optionLabel(copy, option)}
          </ToggleGroupItem>
        )
        // A toggle's two states say what they are; an option earns a line.
        return copy.options?.[option] ? (
          <Tooltip key={option}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {copy.options[option]}
            </TooltipContent>
          </Tooltip>
        ) : (
          item
        )
      })}
    </ToggleGroup>
  )
}

function ChoiceSelect({
  name,
  choose,
  copy,
  current,
  disabled,
  hint,
  options,
}: { hint?: string } & Choice & ControlProps) {
  return (
    <>
      <Select disabled={disabled} onValueChange={choose} value={current}>
        <SelectTrigger className="w-full max-w-56" id={controlId(name)} size="field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((option) => (
            <SelectItem description={copy.options?.[option]} key={option} value={option}>
              {optionLabel(copy, option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* A count the code owns, not a value the editor sets: it belongs in
          the value column with the numbers, not inside the trigger. */}
      {hint && (
        <span className="text-right font-mono text-[11px]/3.5 text-muted-foreground tabular-nums">
          {hint}
        </span>
      )}
    </>
  )
}

function ColorControl({
  name,
  copy,
  disabled,
  onChange,
  value,
}: { value: readonly number[] } & ControlProps) {
  const hex = toHex(value)
  return (
    <div className="flex items-center gap-2 justify-self-start">
      <label
        aria-label={`${copy.label} swatch`}
        className="relative size-6.5 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input"
        style={{ backgroundColor: hex }}
      >
        <input
          aria-label={`${copy.label} swatch`}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          disabled={disabled}
          id={controlId(name)}
          onChange={(event) => {
            const next = fromHex(event.target.value)
            if (next) {
              onChange(next)
            }
          }}
          type="color"
          value={hex}
        />
      </label>
      <HexField disabled={disabled} label={copy.label} onCommit={onChange} value={hex} />
    </div>
  )
}

function VectorControl({
  copy,
  disabled,
  onChange,
  spec,
  values,
}: { spec: VectorParameter; values: readonly number[] } & ControlProps) {
  const places = decimals(spec)
  return (
    // A vector has no one slider to give: its numbers share the control
    // and value columns, and still end on the rule every row ends on.
    <div className="col-span-2 flex items-center gap-1">
      {values.map((component, index) => (
        <ValueField
          className="min-w-0 flex-1 px-1"
          disabled={disabled}
          // biome-ignore lint/suspicious/noArrayIndexKey: a vector component is its position
          key={index}
          label={`${copy.label} ${index + 1}`}
          max={spec.max}
          min={spec.min}
          onCommit={(next) => onChange(values.map((v, i) => (i === index ? next : v)))}
          places={places}
          step={spec.step}
          value={component}
        />
      ))}
    </div>
  )
}

function RangeControl({
  name,
  changed,
  copy,
  disabled,
  fallback,
  invalid,
  onChange,
  spec,
  value,
}: {
  changed: boolean
  fallback: unknown
  invalid?: boolean
  spec: RangeParameter
  value: number
} & ControlProps) {
  const signed = spec.min < 0
  const places = decimals(spec)
  return (
    <>
      <Slider
        aria-label={copy.label}
        disabled={disabled}
        formatValue={(v) => formatValue(spec, v)}
        id={controlId(name)}
        invalid={invalid}
        marks={[
          ...(signed ? [{ kind: 'zero' as const, value: 0 }] : []),
          ...(changed ? [{ value: Number(fallback) }] : []),
        ]}
        max={spec.max}
        min={spec.min}
        onValueChange={([next]) => onChange(next)}
        origin={signed ? 0 : undefined}
        step={spec.step}
        value={[value]}
        variant={changed ? 'changed' : 'default'}
      />
      <ValueField
        className="w-full"
        disabled={disabled}
        invalid={invalid}
        label={copy.label}
        max={spec.max}
        min={spec.min}
        onCommit={onChange}
        places={places}
        step={spec.step}
        value={value}
      />
    </>
  )
}

/** A hex colour typed in: commits a valid `#rrggbb` on Enter or blur, reverts otherwise. */
export function HexField({
  className,
  disabled,
  label,
  onCommit,
  value,
}: {
  className?: string
  disabled?: boolean
  label: string
  onCommit: (next: [number, number, number]) => void
  value: string
}) {
  const { draft, setDraft, setEditing } = useFieldDraft(value)
  const commit = () => {
    setEditing(false)
    const next = fromHex(draft)
    if (next) {
      onCommit(next)
    } else {
      setDraft(value)
    }
  }
  return (
    <Input
      aria-label={`${label} hex`}
      className={cn('w-20 text-left', className)}
      disabled={disabled}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          setDraft(value)
          setEditing(false)
          event.currentTarget.blur()
        }
      }}
      spellCheck={false}
      value={draft.toUpperCase()}
      variant="value"
    />
  )
}

type RangePairProps = {
  changed: boolean
  error?: string
  high: { value: number } & RowParameter
  label: string
  low: { value: number } & RowParameter
  onChange: (next: Record<string, number>) => void
  onReset: () => void
}

/**
 * A low and a high bound on one track with two thumbs. Dragging cannot cross
 * them; only the fields can, and then the server's own message shows under
 * the row and the offending thumb turns red until it is fixed.
 */
export function RangePairRow({
  changed,
  error,
  high,
  label,
  low,
  onChange,
  onReset,
}: RangePairProps) {
  const spec = low.spec as RangeParameter
  const places = decimals(spec)
  const invalid = low.value > high.value
  const set = (a: number, b: number) => onChange({ [high.name]: b, [low.name]: a })
  const field = (bound: typeof low, commit: (next: number) => void) => (
    <ValueField
      className="min-w-0 flex-1 px-1"
      invalid={invalid}
      label={bound.copy.label}
      max={spec.max}
      min={spec.min}
      onCommit={commit}
      places={places}
      step={spec.step}
      value={bound.value}
    />
  )
  return (
    <RowShell
      changed={changed}
      label={label}
      note={error ? <RowError>{error}</RowError> : undefined}
      onFix={() => {}}
      onReset={onReset}
      parameter={low}
    >
      <Slider
        aria-label={`${label} range`}
        formatValue={(v) => formatValue(spec, v)}
        id={controlId(low.name)}
        invalid={invalid}
        max={spec.max}
        min={spec.min}
        minStepsBetweenThumbs={0}
        onValueChange={([a, b]) => set(a, b)}
        step={spec.step}
        value={invalid ? [high.value, low.value] : [low.value, high.value]}
        variant={changed ? 'changed' : 'default'}
      />
      {/* The pair shares the one value column, so the track above still ends
          where every other track ends. */}
      <div className="flex items-center gap-1">
        {field(low, (next) => set(next, high.value))}
        {field(high, (next) => set(low.value, next))}
      </div>
    </RowShell>
  )
}

function RowError({ children }: { children: ReactNode }) {
  return (
    <p className="col-span-2 col-start-2 text-[11px]/3.5 text-destructive" role="alert">
      {children}
    </p>
  )
}
