import { Badge } from '@/components/ui/badge'
import { SIGNAL_META } from '@/data/signals'
import type { SignalKey } from '@/types'

export function SignalBadge({ signal }: { signal: SignalKey }) {
  const meta = SIGNAL_META[signal]
  return (
    <Badge variant={meta.tone} size="sm">
      {meta.label}
    </Badge>
  )
}

export function SignalBadgeList({
  signals,
  extra = 0,
}: {
  signals: SignalKey[]
  extra?: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {signals.map((s) => (
        <SignalBadge key={s} signal={s} />
      ))}
      {extra > 0 && (
        <Badge variant="outline" size="sm" className="text-ink-faint">
          +{extra}
        </Badge>
      )}
    </div>
  )
}
