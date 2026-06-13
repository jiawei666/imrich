import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StrategyId } from '@/types'

const FUNDAMENTAL: { id: StrategyId; label: string }[] = [
  { id: 'super-growth', label: '创新高超级成长' },
  { id: 'oversold-bluechip', label: '低位错杀蓝筹' },
]

const TECHNICAL: { id: StrategyId; label: string }[] = [
  { id: 'trend-support', label: '双线战法' },
  { id: 'b2', label: 'B2战法' },
]

function Item({
  id, label, active, indent, onSelect, showFilter, onFilterClick,
}: {
  id: StrategyId
  label: string
  active: boolean
  indent?: boolean
  onSelect: (s: StrategyId) => void
  showFilter?: boolean
  onFilterClick?: () => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onSelect(id)}
        className={cn(
          'flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
          indent && 'pl-6',
          active
            ? 'bg-brand-soft font-medium text-brand-strong'
            : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
        )}
      >
        <span>{label}</span>
        {active && !showFilter && <span className="size-1.5 rounded-full bg-brand" />}
      </button>
      {showFilter && active && (
        <button
          onClick={(e) => { e.stopPropagation(); onFilterClick?.() }}
          className={cn(
            'rounded-md p-1.5 transition-colors',
            'text-ink-faint hover:bg-paper-2 hover:text-ink-soft',
          )}
          title="筛选参数"
        >
          <SlidersHorizontal className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function StrategySidebar({
  strategy, onSelect, onFilterClick,
}: {
  strategy: StrategyId
  onSelect: (s: StrategyId) => void
  onFilterClick?: () => void
}) {
  const isTechnical = strategy === 'trend-support' || strategy === 'b2'
  const isFundamental = strategy === 'super-growth' || strategy === 'oversold-bluechip'

  return (
    <aside className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-line bg-paper/40 px-3 py-5">
      <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        策略选择
      </div>
      {FUNDAMENTAL.map((s) => (
        <Item
          key={s.id}
          {...s}
          active={strategy === s.id}
          onSelect={onSelect}
          showFilter={isFundamental}
          onFilterClick={onFilterClick}
        />
      ))}

      <div className="my-2 border-t border-line-soft" />
      <div className="px-3 pb-1 text-[12px] font-medium text-ink-soft">技术面战法</div>
      {TECHNICAL.map((s) => (
        <Item
          key={s.id}
          {...s}
          active={strategy === s.id}
          indent
          onSelect={onSelect}
          showFilter={isTechnical}
          onFilterClick={onFilterClick}
        />
      ))}
    </aside>
  )
}
