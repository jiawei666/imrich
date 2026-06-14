import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SIGNAL_META } from '@/data/signals'
import type { SignalKey } from '@/types'

export function SignalBadge({ signal }: { signal: SignalKey }) {
  const meta = SIGNAL_META[signal]
  if (!meta) return null
  return (
    <Badge variant={meta.tone} size="sm">
      {meta.label}
    </Badge>
  )
}

export function SignalBadgeList({
  signals,
  max = 2,
}: {
  signals: SignalKey[]
  /** 最多直接展示几个标签，其余收进 +N（点击展开） */
  max?: number
}) {
  const visible = signals.slice(0, max)
  const hidden = signals.slice(max)

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((s) => (
        <SignalBadge key={s} signal={s} />
      ))}
      {hidden.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-5 cursor-pointer items-center rounded-md border border-line-soft px-1.5 text-[11px] font-medium text-ink-faint transition-colors hover:border-brand hover:text-brand"
            >
              +{hidden.length}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto max-w-[260px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap gap-1">
              {hidden.map((s) => (
                <SignalBadge key={s} signal={s} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
