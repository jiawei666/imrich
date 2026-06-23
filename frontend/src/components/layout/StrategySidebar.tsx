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
  const filterVisible = !!showFilter && active
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        onClick={() => onSelect(id)}
        className={cn(
          'flex min-w-max flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
          indent && 'lg:pl-6',
          active
            ? 'bg-brand-soft font-medium text-brand-strong'
            : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
        )}
      >
        <span>{label}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onFilterClick?.() }}
        data-filter-toggle
        tabIndex={filterVisible ? 0 : -1}
        aria-hidden={!filterVisible}
        className={cn(
          'rounded-md p-1.5 transition-opacity duration-150',
          'text-ink-faint hover:bg-paper-2 hover:text-ink-soft',
          filterVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        title="筛选参数"
      >
        <SlidersHorizontal className="size-3.5" />
      </button>
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
    <aside className="sticky top-0 z-40 flex min-w-0 gap-2 overflow-x-auto border-b border-line bg-cream/90 px-3 py-2 backdrop-blur lg:static lg:w-[180px] lg:shrink-0 lg:flex-col lg:gap-1 lg:overflow-x-visible lg:border-b-0 lg:border-r lg:bg-paper/40 lg:px-3 lg:py-5 lg:backdrop-blur-none">
      <div className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint lg:block">
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

      <div className="hidden border-t border-line-soft lg:my-2 lg:block" />
      <div className="hidden px-3 pb-1 text-[12px] font-medium text-ink-soft lg:block">技术面战法</div>
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
