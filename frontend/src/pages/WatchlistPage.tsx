import { useCallback, useEffect, useState } from 'react'
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

  const fetchGroups = useCallback(async () => {
    try {
      const gs = await api.watchlist.groups()
      setGroups(gs)
      setSelectedGroupId((prev) => {
        if (prev != null && gs.some((g) => g.id === prev)) return prev
        return gs[0]?.id ?? null
      })
    } catch {
      setGroups([])
    }
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  const handleSelectGroup = useCallback((id: number) => {
    setSelectedGroupId(id)
    setSelectedCode('')
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
