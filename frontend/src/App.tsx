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
import { STRATEGY_CATEGORY, type Preset, type RefreshStatus, type StrategyId } from '@/types'

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

  useEffect(() => {
    api.presets().then(setPresets).catch(() => setPresets([]))
    api.refreshStatus().then(setRefreshStatus).catch(() => setRefreshStatus(undefined))
  }, [])

  const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
  const activePreset = presets.find((p) => p.id === strategy) ?? null
  const updatedAt = refreshStatus?.kline.updatedAt ?? '—'

  return (
    <div className="flex h-screen overflow-hidden bg-cream text-ink">
      <Sidebar />
      <StrategySidebar strategy={strategy} onSelect={setStrategy} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          updatedAt={updatedAt}
          onRefreshKline={() => api.refreshKline().catch(() => {})}
          onRefreshFundamental={() => api.refreshFundamental().catch(() => {})}
        />

        {isTechnical ? (
          <TechnicalScreenView strategy={strategy} preset={activePreset} refreshStatus={refreshStatus} />
        ) : (
          <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
            <div className="flex min-w-0 flex-col gap-5">
              <FilterPanel
                strategy={strategy}
                state={filter}
                onChange={setFilter}
                onApply={() => {}}
                onReset={() => setFilter(DEFAULT_FILTER)}
              />
              <CandidateResults candidates={CANDIDATES} selectedCode={selectedCode} onSelect={setSelectedCode} />
              <DataRefreshProgress status={refreshStatus} />
            </div>
            <div className="min-w-0">
              <StockDetailPanel detail={STOCK_DETAIL} onClose={() => setSelectedCode('')} />
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
