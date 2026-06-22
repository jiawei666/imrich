import { useState } from 'react'
import { Settings, ChevronDown, ChevronRight, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WatchlistGroup } from '@/types'

interface WatchlistGroupPanelProps {
  groups: WatchlistGroup[]
  selectedCode: string | null
  onSelectStock: (code: string, name: string) => void
  onManageClick: () => void
}

export function WatchlistGroupPanel({
  groups,
  selectedCode,
  onSelectStock,
  onManageClick,
}: WatchlistGroupPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0)

  const toggleGroup = (id: number) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="flex h-full flex-col border-r border-line bg-paper/40">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line-soft px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">自选股</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onManageClick}
          className="h-8 gap-1 text-[12px] text-ink-soft"
        >
          <Settings className="size-3.5" />
          管理
        </Button>
      </div>

      {/* group list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Star className="size-7 text-ink-faint/50" strokeWidth={1.5} />
            <p className="text-sm text-ink-faint">暂无自选股</p>
            <p className="text-[12px] text-ink-faint/70">在选股页点击"加入自选"添加</p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = !!collapsed[group.id]
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-paper-2/50"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5 shrink-0 text-ink-faint" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0 text-ink-faint" />
                  )}
                  <span className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
                    {group.name}
                  </span>
                  <span className="text-[11px] text-ink-faint/60">{group.items.length}</span>
                </button>
                {!isCollapsed &&
                  group.items.map((item) => {
                    const on = item.stock_code === selectedCode
                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelectStock(item.stock_code, item.stock_name)}
                        className={cn(
                          'flex w-full items-start gap-2 px-4 py-2.5 text-left transition-colors hover:bg-paper-2/70',
                          on && 'bg-brand-soft',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-ink">
                            {item.stock_name}
                          </div>
                          <div className="flex gap-2 text-[11px] text-ink-faint">
                            <span className="tnum">{item.stock_code}</span>
                            {item.industry && <span>{item.industry}</span>}
                          </div>
                        </div>
                      </button>
                    )
                  })}
              </div>
            )
          })
        )}
      </div>

      {/* footer */}
      <div className="shrink-0 border-t border-line-soft px-4 py-2 text-[12px] text-ink-faint">
        共 {totalCount} 只
      </div>
    </div>
  )
}
