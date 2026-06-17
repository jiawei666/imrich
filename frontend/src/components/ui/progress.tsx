import { cn } from '@/lib/utils'

export function ProgressBar({
  value,
  className,
  barClassName,
}: {
  value: number
  className?: string
  /** 覆盖填充条颜色，如 "bg-down" / "bg-amber-500"（默认品牌红） */
  barClassName?: string
}) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}>
      <div
        className={cn('h-full rounded-full bg-brand transition-[width] duration-500', barClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

/** Circular progress ring (used in data-refresh cards) */
export function ProgressRing({
  value,
  size = 36,
  stroke = 4,
}: {
  value: number
  size?: number
  stroke?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  )
}
