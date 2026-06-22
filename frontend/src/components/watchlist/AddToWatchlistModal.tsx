import { useEffect, useState } from 'react'
import { X, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { WatchlistGroup } from '@/types'

const STRATEGY_NAMES: Record<string, string> = {
  'super-growth': '创新高超级成长',
  'oversold-bluechip': '低位错杀蓝筹',
  'trend-support': '双线战法',
  'b2': 'B2战法',
}

interface AddToWatchlistModalProps {
  open: boolean
  stockCode: string
  stockName: string
  industry?: string | null
  strategyId?: string
  onClose: () => void
  onAdded: () => void
}

export function AddToWatchlistModal({
  open,
  stockCode,
  stockName,
  industry,
  strategyId,
  onClose,
  onAdded,
}: AddToWatchlistModalProps) {
  const [groups, setGroups] = useState<WatchlistGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [useAutoCreate, setUseAutoCreate] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setShowNewGroup(false)
    setNewGroupName('')
    api.watchlist.groups().then((gs) => {
      setGroups(gs)
      const defaultName = strategyId ? STRATEGY_NAMES[strategyId] ?? strategyId : null
      const match = defaultName ? gs.find((g) => g.name === defaultName) : null
      if (match) {
        setSelectedGroupId(match.id)
        setUseAutoCreate(false)
      } else if (defaultName) {
        setSelectedGroupId(null)
        setUseAutoCreate(true)
      } else {
        setSelectedGroupId(gs[0]?.id ?? null)
        setUseAutoCreate(false)
      }
    }).catch(() => setGroups([]))
  }, [open, strategyId])

  if (!open) return null

  const defaultGroupName = strategyId ? STRATEGY_NAMES[strategyId] ?? strategyId : null
  const defaultGroupExists = defaultGroupName ? groups.some((g) => g.name === defaultGroupName) : true

  const isAlreadyIn = (groupId: number) =>
    groups.find((g) => g.id === groupId)?.items.some((i) => i.stock_code === stockCode) ?? false

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      if (showNewGroup && newGroupName.trim()) {
        const group = await api.watchlist.createGroup(newGroupName.trim())
        if (group) {
          await api.watchlist.addItem({
            group_id: group.id,
            stock_code: stockCode,
            stock_name: stockName,
            industry,
            strategy_id: strategyId,
          }).catch(() => {})
        }
      } else if (useAutoCreate && strategyId) {
        await api.watchlist.addItem({
          stock_code: stockCode,
          stock_name: stockName,
          industry,
          strategy_id: strategyId,
        }).catch(() => {})
      } else if (selectedGroupId != null) {
        await api.watchlist.addItem({
          group_id: selectedGroupId,
          stock_code: stockCode,
          stock_name: stockName,
          industry,
          strategy_id: strategyId,
        }).catch(() => {})
      }
      onAdded()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const canConfirm =
    !submitting &&
    (showNewGroup ? newGroupName.trim().length > 0 : selectedGroupId != null || useAutoCreate)

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-paper shadow-xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">加入自选</h3>
            <p className="text-[12px] text-ink-faint">
              {stockName} <span className="tnum">{stockCode}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-paper-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* group list */}
        <div className="max-h-60 overflow-y-auto px-4 py-3">
          <p className="mb-2 text-[12px] text-ink-faint">选择分组</p>

          {/* existing groups */}
          {groups.map((g) => {
            const already = isAlreadyIn(g.id)
            const on = selectedGroupId === g.id && !showNewGroup && !useAutoCreate
            return (
              <button
                key={g.id}
                onClick={() => {
                  setSelectedGroupId(g.id)
                  setShowNewGroup(false)
                  setUseAutoCreate(false)
                }}
                className={cn(
                  'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                  on
                    ? 'bg-brand-soft text-brand-strong'
                    : 'text-ink hover:bg-paper-2',
                )}
              >
                <span className="text-[13px]">{g.name}</span>
                {already && (
                  <span className="flex items-center gap-0.5 rounded-full bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-soft">
                    <Check className="size-2.5" /> 已添加
                  </span>
                )}
              </button>
            )
          })}

          {/* auto-create option (shown when strategy group doesn't exist yet) */}
          {!defaultGroupExists && defaultGroupName && (
            <button
              onClick={() => {
                setUseAutoCreate(true)
                setSelectedGroupId(null)
                setShowNewGroup(false)
              }}
              className={cn(
                'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                useAutoCreate && !showNewGroup
                  ? 'bg-brand-soft text-brand-strong'
                  : 'text-ink hover:bg-paper-2',
              )}
            >
              <span className="text-[13px]">{defaultGroupName}</span>
              <span className="text-[11px] text-ink-faint/60">自动创建</span>
            </button>
          )}
        </div>

        {/* new group */}
        <div className="border-t border-line-soft px-4 py-2.5">
          {showNewGroup ? (
            <input
              autoFocus
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canConfirm && handleConfirm()}
              placeholder="输入分组名称..."
              className="w-full rounded-lg border border-brand bg-paper-2/50 px-3 py-1.5 text-[13px] text-ink focus:outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setShowNewGroup(true)
                setSelectedGroupId(null)
                setUseAutoCreate(false)
              }}
              className="flex items-center gap-1.5 text-[13px] text-brand hover:text-brand-strong"
            >
              <Plus className="size-3.5" />
              新建分组
            </button>
          )}
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? '保存中...' : '确认加入'}
          </Button>
        </div>
      </div>
    </div>
  )
}
