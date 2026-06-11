import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { FilterPanel, type FilterState } from '@/components/screener/FilterPanel'
import { CandidateResults } from '@/components/screener/CandidateResults'
import { DataRefreshProgress } from '@/components/screener/DataRefreshProgress'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { CANDIDATES, STOCK_DETAIL } from '@/data/mock'
import { KEYWORDS } from '@/data/signals'
import type { StrategyId } from '@/types'

const DEFAULT_FILTER: FilterState = {
  netProfitYoY: 30,
  revenueYoY: 20,
  priceFromHigh: 25,
  keywordWindow: '30',
  sectorThreshold: 60,
  keywords: Object.fromEntries(KEYWORDS.map((k) => [k, true])),
  pool: 'all',
  industry: 'all',
}

export default function App() {
  const [strategy, setStrategy] = useState<StrategyId>('super-growth')
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [selectedCode, setSelectedCode] = useState<string>(STOCK_DETAIL.code)

  return (
    <div className="flex h-screen overflow-hidden bg-cream text-ink">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          strategy={strategy}
          onStrategyChange={setStrategy}
          updatedAt="2025-06-16 10:30:00"
          onRefresh={() => {}}
        />

        <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          {/* left — screener */}
          <div className="flex min-w-0 flex-col gap-5">
            <FilterPanel
              strategy={strategy}
              state={filter}
              onChange={setFilter}
              onApply={() => {}}
              onReset={() => setFilter(DEFAULT_FILTER)}
            />
            <CandidateResults
              candidates={CANDIDATES}
              selectedCode={selectedCode}
              onSelect={setSelectedCode}
            />
            <DataRefreshProgress />
          </div>

          {/* right — detail */}
          <div className="min-w-0">
            <StockDetailPanel
              detail={STOCK_DETAIL}
              onClose={() => setSelectedCode('')}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
