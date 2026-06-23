import { useCallback, useEffect, useState } from 'react'
import { WatchlistGroupPanel } from '@/components/watchlist/WatchlistGroupPanel'
import { AddToWatchlistModal } from '@/components/watchlist/AddToWatchlistModal'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { api } from '@/lib/api'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { StockDetail, WatchlistGroup } from '@/types'

interface WatchlistModalState {
  code: string
  name: string
  industry?: string | null
  strategyId?: string
}

export function WatchlistPage() {
  const [groups, setGroups] = useState<WatchlistGroup[]>([])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [modalState, setModalState] = useState<WatchlistModalState | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const fetchGroups = useCallback(async () => {
    try {
      setGroups(await api.watchlist.groups())
    } catch {
      setGroups([])
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      await fetchGroups()
    }
    load()
  }, [fetchGroups])

  useEffect(() => {
    if (!selectedCode) return
    let cancelled = false
    const load = async () => {
      setDetailLoading(true)
      try {
        const d = await api.stockDetail(selectedCode)
        if (!cancelled) setStockDetail(d)
      } catch {
        if (!cancelled) setStockDetail(null)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedCode])

  const handleSelectStock = useCallback((code: string) => {
    setSelectedCode(code)
    setMobileDetailOpen(true)
  }, [])

  const handleAddToWatchlist = useCallback((code: string, name: string, industry?: string) => {
    setModalState({ code, name, industry })
  }, [])

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* left panel */}
        <div className={isDesktop ? 'w-72 shrink-0 overflow-hidden' : 'min-w-0 flex-1 overflow-hidden'}>
          <WatchlistGroupPanel
            groups={groups}
            selectedCode={selectedCode}
            onSelectStock={handleSelectStock}
          />
        </div>

        {/* right panel (desktop only) */}
        {isDesktop && (
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {selectedCode && stockDetail ? (
              <StockDetailPanel
                detail={stockDetail}
                candidate={null}
                onClose={() => { setSelectedCode(null); setStockDetail(null) }}
                loading={detailLoading}
                onAddToWatchlist={handleAddToWatchlist}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-ink-faint">点击左侧股票查看详情</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* mobile detail overlay */}
      {!isDesktop && mobileDetailOpen && selectedCode && stockDetail && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-cream p-3">
          <StockDetailPanel
            detail={stockDetail}
            candidate={null}
            onClose={() => setMobileDetailOpen(false)}
            loading={detailLoading}
            onAddToWatchlist={handleAddToWatchlist}
          />
        </div>
      )}

      {/* add modal */}
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
