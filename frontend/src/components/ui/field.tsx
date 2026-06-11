import * as React from 'react'
import { cn } from '@/lib/utils'

/** Labeled numeric input with an operator prefix (≥ / ≤) and unit suffix. */
export function NumberField({
  label,
  op,
  unit,
  value,
  onChange,
  className,
}: {
  label: string
  op?: '≥' | '≤'
  unit?: string
  value: number
  onChange?: (v: number) => void
  className?: string
}) {
  const id = React.useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs text-ink-soft">
        {label}
      </label>
      <div className="flex h-10 items-center rounded-[10px] border border-line bg-paper px-3 transition-colors duration-200 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-ring/30">
        {op && <span className="mr-1.5 text-sm text-ink-faint">{op}</span>}
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="tnum w-full bg-transparent text-sm text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && <span className="ml-1.5 text-sm text-ink-faint">{unit}</span>}
      </div>
    </div>
  )
}

/** Segmented radio pills (used for the stock-pool selector). */
export function RadioPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange?: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange?.(o.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-200 cursor-pointer',
              active
                ? 'border-brand/30 bg-brand-soft text-brand-strong'
                : 'border-line bg-paper text-ink-soft hover:border-ink-faint/40 hover:text-ink'
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                active ? 'bg-brand' : 'bg-ink-faint/40'
              )}
            />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
