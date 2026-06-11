import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { StrategySidebar } from '@/components/layout/StrategySidebar'
import { TopBar } from '@/components/layout/TopBar'
import { FilterPanel, type FilterState } from '@/components/screener/FilterPanel'
import { CandidateResults } from '@/components/screener/CandidateResults'
import { DataRefreshProgress } from '@/components/screener/DataRefreshProgress'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { TechnicalScreenView } from '@/components/technical/TechnicalScreenView'
import { CANDIDATES, STOCK_DETAIL } from '@/data/mock'
import { KEYWORDS } from '@/data/signals'
import { api } from '@/lib/api'
import {
  STRATEGY_CATEGORY,
  type Candidate,
  type MetaResponse,
  type Preset,
  type RefreshStatus,
  type StockDetail,
  type StrategyId,
} from '@/types'

const DEFAULT_FILTER: FilterState = {
  netProfitYoY: 30, revenueYoY: 20, priceFromHigh: 25, keywordWindow: '30',
  sectorThreshold: 60, keywords: Object.fromEntries(KEYWORDS.map((k) => [k, true])),
  pool: 'all', industry: 'all',
}

export default function App() {
  const [strategy, setStrategy] = useState<StrategyId>('trend-support')
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [selectedCode, setSelectedCode] = useState<string>(STOCK_DETAIL.code)
  const [presets, setPresets] = useState<Preset[]>([])
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | undefined>(undefined)
  const [meta, setMeta] = useState<MetaResponse | undefined>(undefined)
  const [candidates, setCandidates] = useState<Candidate[]>(CANDIDATES)
  const [stockDetail, setStockDetail] = useState<StockDetail>(STOCK_DETAIL)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    api.presets().then(setPresets).catch(() => setPresets([]))
    api.refreshStatus().then(setRefreshStatus).catch(() => setRefreshStatus(undefined))
    api.meta().then(setMeta).catch(() => setMeta(undefined))
  }, [])

  const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
  const activePreset = presets.find((p) => p.id === strategy) ?? null
  const updatedAt = meta?.klineDay.updatedAt ?? refreshStatus?.kline.updatedAt ?? '—'

  const reloadMeta = () => api.meta().then(setMeta).catch(() => setMeta(undefined))
  const reloadRefreshStatus = () =>
    api.refreshStatus().then(setRefreshStatus).catch(() => setRefreshStatus(undefined))

  const loadFundamental = () => {
    setLoadingCandidates(true)
    api.screenFundamental(strategy, { ...filter })
      .then((rows) => {
        setCandidates(rows)
        if (rows.length > 0) setSelectedCode(rows[0].code)
      })
      .catch(() => setCandidates([]))
      .finally(() => setLoadingCandidates(false))
  }

  useEffect(() => {
    if (!isTechnical) loadFundamental()
  }, [strategy])

  useEffect(() => {
    if (isTechnical || !selectedCode) return
    api.stockDetail(selectedCode)
      .then((detail) => {
        setStockDetail(detail)
        setDetailError(null)
      })
      .catch(() => setDetailError('详情加载失败'))
  }, [isTechnical, selectedCode])

  const triggerRefreshKline = (reloadStockList: boolean) => {
    api.refreshKline(reloadStockList).then(() => {
      reloadRefreshStatus()
      reloadMeta()
    }).catch(() => {})
  }

  const triggerRefreshFundamental = () => {
    api.refreshFundamental().then(() => {
      reloadRefreshStatus()
      reloadMeta()
    }).catch(() => {})
  }

  useEffect(() => {
    if (
      refreshStatus?.kline.status !== 'running' &&
      refreshStatus?.fundamental.status !== 'running'
    ) {
      return
    }
    const id = window.setInterval(() => {
      reloadRefreshStatus()
      reloadMeta()
    }, 3000)
    return () => window.clearInterval(id)
  }, [refreshStatus?.fundamental.status, refreshStatus?.kline.status])

  return (
    <div className="flex h-screen overflow-hidden bg-cream text-ink">
      <Sidebar />
      <StrategySidebar strategy={strategy} onSelect={setStrategy} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          updatedAt={updatedAt}
          onRefreshKline={triggerRefreshKline}
          onRefreshFundamental={triggerRefreshFundamental}
        />

        {isTechnical ? (
          <TechnicalScreenView strategy={strategy} preset={activePreset} refreshStatus={refreshStatus} />
        ) : (
          <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
            <div className="flex min-w-0 flex-col gap-5">
              <DataRefreshProgress status={refreshStatus} category="fundamental" />
              <FilterPanel
                strategy={strategy}
                state={filter}
                onChange={setFilter}
                onApply={loadFundamental}
                onReset={() => setFilter(DEFAULT_FILTER)}
              />
              {loadingCandidates ? <div className="px-1 text-sm text-ink-soft">正在筛选候选股...</div> : null}
              <CandidateResults candidates={candidates} selectedCode={selectedCode} onSelect={setSelectedCode} />
            </div>
            <div className="min-w-0">
              {detailError ? <div className="mb-3 text-sm text-red-600">{detailError}</div> : null}
              <StockDetailPanel detail={stockDetail} onClose={() => setSelectedCode('')} />
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
