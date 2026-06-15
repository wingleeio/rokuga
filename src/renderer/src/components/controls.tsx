import type { ReactNode } from 'react'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { cn } from '../lib/cn'

export function Field({
  label,
  children,
  className
}: {
  label?: string
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      {children}
    </div>
  )
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  disabled
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  disabled?: boolean
}): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-2.5', disabled && 'opacity-40 pointer-events-none')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-[11px] tabular text-foreground/70">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  )
}

export function SwitchRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-[13px] font-medium text-foreground/90">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
