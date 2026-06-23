import { useCallback, useEffect, useRef, useState } from 'react'
import { WatchlistGroupPanel } from '@/components/watchlist/WatchlistGroupPanel'
import { AddToWatchlistModal } from '@/components/watchlist/AddToWatchlistModal'
import { StockListCard } from '@/components/screener/StockListCard'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { Card, CardContent } from '@/components/ui/card'
import { ChartSkeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { StockDetail, StockRow, WatchlistGroup } from '@/types'

interface WatchlistModalState {
  code: string
  name: string
  industry?: string | null
  strategyId?: string
}

export function WatchlistPage() {
  const [groups, setGroups] = useState<WatchlistGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mobileChartOpen, setMobileChartOpen] = useState(false)
  const [modalState, setModalState] = useState<WatchlistModalState | null>(null)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // 同步访问最新 groups（在回调中使用，不触发重渲）
  const groupsRef = useRef<WatchlistGroup[]>([])
  const initializedRef = useRef(false)

  const fetchGroups = useCallback(async () => {
    try {
      const gs = await api.watchlist.groups()
      groupsRef.current = gs
      setGroups(gs)

      if (!initializedRef.current && gs.length > 0) {
        // 首次加载：自动选中第一分组 + 第一只股票
        initializedRef.current = true
        const firstGroup = gs[0]
        setSelectedGroupId(firstGroup.id)
        const firstCode = firstGroup.items[0]?.stock_code ?? ''
        if (firstCode) setSelectedCode(firstCode)
      } else {
        // 操作后刷新：保持当前选中分组（如被删除则回退到第一个）
        setSelectedGroupId((prev) => {
          if (prev != null && gs.some((g) => g.id === prev)) return prev
          return gs[0]?.id ?? null
        })
      }
    } catch {
      setGroups([])
    }
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  // 切换分组：自动选中该分组第一只股票
  const handleSelectGroup = useCallback((id: number) => {
    setSelectedGroupId(id)
    const group = groupsRef.current.find((g) => g.id === id)
    const firstCode = group?.items[0]?.stock_code ?? ''
    setSelectedCode(firstCode)
    setStockDetail(null)
    setMobileChartOpen(false)
  }, [])

  const currentGroup = groups.find((g) => g.id === selectedGroupId) ?? null
  const stockRows: StockRow[] = (currentGroup?.items ?? []).map((item) => ({
    code: item.stock_code,
    name: item.stock_name,
    industry: item.industry ?? null,
    market_cap: null,
    close: null,
    pct_chg: null,
  }))

  // 加载股票详情
  useEffect(() => {
    if (!selectedCode) { setStockDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    api.stockDetail(selectedCode)
      .then((d) => { if (!cancelled) setStockDetail(d) })
      .catch(() => { if (!cancelled) setStockDetail(null) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedCode])

  const handleSelectCode = useCallback((code: string) => {
    setSelectedCode(code)
    setMobileChartOpen(true)
  }, [])

  // 置顶：将当前分组内指定股票的 sort_order 移到最小值 - 1
  const handlePinCode = useCallback(async (code: string) => {
    const group = groupsRef.current.find((g) => g.id === selectedGroupId)
    if (!group) return
    const item = group.items.find((i) => i.stock_code === code)
    if (!item) return
    const minOrder = group.items.reduce((m, i) => Math.min(m, i.sort_order), 0)
    try {
      await api.watchlist.updateItem(item.id, { sort_order: minOrder - 1 })
      fetchGroups()
    } catch { /* ignore */ }
  }, [selectedGroupId, fetchGroups])

  const handleAddToWatchlist = useCallback((code: string, name: string, industry?: string) => {
    setModalState({ code, name, industry })
  }, [])

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <WatchlistGroupPanel
        groups={groups}
        selectedGroupId={selectedGroupId}
        onSelectGroup={handleSelectGroup}
        onChanged={fetchGroups}
      />

      <div className="relative flex flex-1 overflow-visible lg:overflow-hidden">
        <main className="grid min-w-0 flex-1 grid-cols-1 gap-4 overflow-visible p-4 sm:gap-5 sm:p-6 lg:overflow-y-auto 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <StockListCard
              data={stockRows}
              total={stockRows.length}
              loading={false}
              screening={false}
              loadingMore={false}
              selectedCode={selectedCode}
              onSelectCode={handleSelectCode}
              onPinCode={handlePinCode}
            />
          </div>
          {isDesktop && selectedCode && (
            <div className="min-w-0">
              {stockDetail ? (
                <StockDetailPanel
                  detail={stockDetail}
                  candidate={null}
                  onClose={() => { setSelectedCode(''); setStockDetail(null) }}
                  loading={detailLoading}
                  onAddToWatchlist={handleAddToWatchlist}
                />
              ) : detailLoading ? (
                <Card className="relative">
                  <CardContent className="pt-5">
                    <ChartSkeleton />
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}
        </main>

        {!isDesktop && mobileChartOpen && selectedCode && (
          <div className="fixed inset-0 z-[70] overflow-y-auto bg-cream p-3 lg:hidden">
            {stockDetail ? (
              <StockDetailPanel
                detail={stockDetail}
                candidate={null}
                onClose={() => setMobileChartOpen(false)}
                loading={detailLoading}
                onAddToWatchlist={handleAddToWatchlist}
              />
            ) : detailLoading ? (
              <Card className="relative min-h-full">
                <CardContent className="px-3 pt-4">
                  <ChartSkeleton />
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>

      {modalState && (
        <AddToWatchlistModal
          open={!!modalState}
          stockCode={modalState.code}
          stockName={modalState.name}
          industry={modalState.industry}
          strategyId={modalState.strategyId}
          onClose={() => setModalState(null)}
          onAdded={fetchGroups}
        />
      )}
    </div>
  )
}
