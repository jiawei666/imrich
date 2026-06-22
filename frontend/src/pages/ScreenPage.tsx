import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { FilterDrawer } from '@/components/ui/filter-drawer'
import { FilterPanel, type FilterState } from '@/components/screener/FilterPanel'
import { FundamentalCandidateListCard } from '@/components/screener/FundamentalCandidateListCard'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { TechnicalScreenView, type TechnicalScreenViewHandle } from '@/components/technical/TechnicalScreenView'
import { PageHeader } from '@/components/layout/PageHeader'
import { AddToWatchlistModal } from '@/components/watchlist/AddToWatchlistModal'
import { STOCK_DETAIL } from '@/data/mock'
import { api } from '@/lib/api'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { STRATEGY_CATEGORY, type Candidate, type IndexInfo, type Preset, type StockDetail, type StrategyId } from '@/types'

export interface ScreenPageHandle {
  toggleFilter: () => void
}

export const ScreenPage = forwardRef<ScreenPageHandle, { strategy: StrategyId }>(
  function ScreenPage({ strategy }, ref) {
    const [selectedCode, setSelectedCode] = useState<string>('')
    const [presets, setPresets] = useState<Preset[]>([])
    const [presetsLoading, setPresetsLoading] = useState(true)
    const [stockDetail, setStockDetail] = useState<StockDetail>(STOCK_DETAIL)
    const [detailError, setDetailError] = useState<string | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    // 基本面专属状态
    const [filterOpen, setFilterOpen] = useState(false)
    const [paramValues, setParamValues] = useState<FilterState>({})
    const [screenItems, setScreenItems] = useState<Candidate[]>([])
    const [screenTotal, setScreenTotal] = useState(0)
    const [screenUpdatedAt, setScreenUpdatedAt] = useState<string | null>(null)
    const [screening, setScreening] = useState(false)
    const [indexList, setIndexList] = useState<IndexInfo[]>([])
    const [indexConstituentMap, setIndexConstituentMap] = useState<Record<string, Set<string>>>({})
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [watchlistModalOpen, setWatchlistModalOpen] = useState(false)
    const [watchlistModalStock, setWatchlistModalStock] = useState<{
      code: string
      name: string
      industry?: string
      strategyId?: string
    } | null>(null)

    const handleAddToWatchlist = useCallback((code: string, name: string, industry?: string) => {
      setWatchlistModalStock({ code, name, industry, strategyId: strategy })
      setWatchlistModalOpen(true)
    }, [strategy])

    const technicalRef = useRef<TechnicalScreenViewHandle>(null)

    const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
    const activePreset = presets.find((p) => p.id === strategy) ?? null
    const isDesktop = useMediaQuery('(min-width: 1024px)')

    useImperativeHandle(ref, () => ({
      toggleFilter: () => {
        if (isTechnical) {
          technicalRef.current?.toggleFilter()
        } else {
          setFilterOpen((v) => !v)
        }
      },
    }))

    useEffect(() => {
      api.presets()
        .then(setPresets)
        .catch(() => setPresets([]))
        .finally(() => setPresetsLoading(false))
    }, [])

    // 基本面：运行筛选
    const runScreen = useCallback(async () => {
      setScreening(true)
      setFilterOpen(false)
      try {
        const res = await api.screenFundamentalResult(strategy, paramValues)
        setScreenItems(res.items)
        setScreenTotal(res.total)
        setScreenUpdatedAt(res.updatedAt)
        if (res.items[0]) {
          setSelectedCode(res.items[0].code)
          setSelectedCandidate(res.items[0])
        }
      } catch {
        setScreenItems([])
        setScreenTotal(0)
      } finally {
        setScreening(false)
      }
    }, [strategy, paramValues])

    // 基本面：加载上次结果 + 指数列表
    const loadFundamentalCached = useCallback(async (preset: Preset) => {
      const defaults = Object.fromEntries(preset.params.map((p) => [p.key, p.value]))
      setParamValues(defaults)
      setSelectedCandidate(null)
      setDetailOpen(false)
      setScreening(true)
      try {
        const res = await api.screenFundamentalResult(preset.id)
        setScreenItems(res.items)
        setScreenTotal(res.total)
        setScreenUpdatedAt(res.updatedAt)
        if (res.items[0]) {
          setSelectedCode(res.items[0].code)
          setSelectedCandidate(res.items[0])
        } else {
          setSelectedCode('')
        }
      } catch {
        setScreenItems([])
        setScreenTotal(0)
        setSelectedCode('')
      } finally {
        setScreening(false)
      }
    }, [])

    const loadIndexData = useCallback(async () => {
      try {
        const indices = await api.listIndices()
        setIndexList(indices)
        const map: Record<string, Set<string>> = {}
        for (const idx of indices) {
          map[idx.indexCode] = new Set(idx.stockCodes)
        }
        setIndexConstituentMap(map)
      } catch {
        setIndexList([])
      }
    }, [])

    // 切换策略时重置基本面状态
    useEffect(() => {
      if (!isTechnical && activePreset) {
        setFilterOpen(false)
        setDetailOpen(false)
        loadFundamentalCached(activePreset)
        loadIndexData()
      }
    }, [isTechnical, activePreset, loadFundamentalCached, loadIndexData])

    useEffect(() => {
      if (isTechnical || !selectedCode) return
      let cancelled = false
      setDetailLoading(true)
      api.stockDetail(selectedCode)
        .then((detail) => {
          if (cancelled) return
          setStockDetail(detail)
          setDetailError(null)
        })
        .catch(() => { if (!cancelled) setDetailError('详情加载失败') })
        .finally(() => { if (!cancelled) setDetailLoading(false) })
      return () => { cancelled = true }
    }, [isTechnical, selectedCode])

    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader />
        {isTechnical ? (
          <TechnicalScreenView
            ref={technicalRef}
            strategy={strategy}
            preset={activePreset}
            onAddToWatchlist={handleAddToWatchlist}
          />
        ) : (
          <div className="relative flex flex-1 overflow-visible lg:overflow-hidden">
            <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} title={activePreset?.name ?? '筛选参数'}>
              {activePreset && (
                <FilterPanel
                  preset={activePreset}
                  paramValues={paramValues}
                  onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
                  onApply={runScreen}
                  loading={screening}
                />
              )}
            </FilterDrawer>

            <main className="grid min-w-0 flex-1 grid-cols-1 gap-4 overflow-visible p-4 sm:gap-5 sm:p-6 lg:overflow-y-auto 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
              <div className="flex min-h-0 min-w-0 flex-col">
                <FundamentalCandidateListCard
                  items={screenItems}
                  total={screenTotal}
                  updatedAt={screenUpdatedAt}
                  selectedCode={selectedCode}
                  onSelectCode={(code) => {
                    setSelectedCode(code)
                    setSelectedCandidate(screenItems.find(i => i.code === code) ?? null)
                    setDetailOpen(true)
                  }}
                  indices={indexList}
                  indexConstituentMap={indexConstituentMap}
                  showDrawdown={strategy === 'oversold-bluechip'}
                  loading={screening || presetsLoading}
                />
              </div>
              {isDesktop && (
                <div className="min-w-0 overflow-visible 2xl:overflow-y-auto">
                  {selectedCode && detailError && <div className="mb-3 text-sm text-red-600">{detailError}</div>}
                  {selectedCode ? (
                    <StockDetailPanel
                      detail={stockDetail}
                      candidate={selectedCandidate}
                      onClose={() => setSelectedCode('')}
                      loading={detailLoading}
                      onAddToWatchlist={handleAddToWatchlist}
                    />
                  ) : (
                    <Card className="flex min-h-40 items-center justify-center text-sm text-ink-faint 2xl:h-full">
                      请选择候选股票查看详情
                    </Card>
                  )}
                </div>
              )}
            </main>
            {!isDesktop && selectedCode && detailOpen && (
              <div
                data-mobile-detail-overlay
                className="fixed inset-0 z-[70] overflow-y-auto bg-cream p-3 lg:hidden"
              >
                {detailError && <div className="mb-3 text-sm text-red-600">{detailError}</div>}
                <StockDetailPanel
                  detail={stockDetail}
                  candidate={selectedCandidate}
                  onClose={() => setDetailOpen(false)}
                  loading={detailLoading}
                  onAddToWatchlist={handleAddToWatchlist}
                />
              </div>
            )}
          </div>
        )}
        {watchlistModalOpen && watchlistModalStock && (
          <AddToWatchlistModal
            open={watchlistModalOpen}
            stockCode={watchlistModalStock.code}
            stockName={watchlistModalStock.name}
            industry={watchlistModalStock.industry}
            strategyId={watchlistModalStock.strategyId}
            onClose={() => setWatchlistModalOpen(false)}
            onAdded={() => {}}
          />
        )}
      </div>
    )
  }
)
