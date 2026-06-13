import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle } from 'react'
import { X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { StockListCard } from '@/components/screener/StockListCard'
import { PriceChart } from '@/components/detail/PriceChart'
import { TechnicalFilterCard } from './TechnicalFilterCard'
import { api } from '@/lib/api'
import type { ActivityStatus, Kline, KlineTimeframe, Preset, StrategyId, StockRow, ScreenSnapshotMeta, StockSortField, SortOrder } from '@/types'

const EMPTY_KLINE: Record<KlineTimeframe, Kline[]> = { day: [], week: [], month: [], quarter: [] }

export interface TechnicalScreenViewHandle {
  toggleFilter: () => void
}

export const TechnicalScreenView = forwardRef<TechnicalScreenViewHandle, {
  strategy: StrategyId
  preset: Preset | null
  onActivity: (id: string, status: ActivityStatus, label: string, detail?: string) => void
}>(function TechnicalScreenView({
  strategy,
  preset,
  onActivity,
}, ref) {
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [selectedName, setSelectedName] = useState<string>('')
  const [kline, setKline] = useState<Record<KlineTimeframe, Kline[]>>(EMPTY_KLINE)
  const [filterOpen, setFilterOpen] = useState(false)
  const [screening, setScreening] = useState(false)
  const screeningRef = useRef(false)

  // ---- 统一列表数据 ----
  const [stockData, setStockData] = useState<StockRow[]>([])
  const [stockTotal, setStockTotal] = useState(0)
  const [stockLoading, setStockLoading] = useState(true)
  const [stockLoadingMore, setStockLoadingMore] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  const [nextPage, setNextPage] = useState(1)
  const [sortBy, setSortBy] = useState<StockSortField>('code')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // ---- 搜索 / 历史 / 数据源标记 ----
  const [searchQuery, setSearchQuery] = useState('')
  const [historyList, setHistoryList] = useState<ScreenSnapshotMeta[]>([])
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null)
  // 'market' = 全市场列表, 'screen' = 筛选结果, 'history' = 历史结果
  const [dataSource, setDataSource] = useState<'market' | 'screen' | 'history'>('market')

  const isMarketMode = dataSource === 'market'

  // 暴露 toggleFilter
  useImperativeHandle(ref, () => ({
    toggleFilter: () => setFilterOpen((v) => !v),
  }))

  // ---- 加载全市场列表 ----
  const fetchMarketData = useCallback(async (page: number = 1, append: boolean = false) => {
    if (page === 1) {
      setStockLoading(true)
      setStockError(null)
    } else {
      setStockLoadingMore(true)
    }
    try {
      const res = await api.stocks({
        q: searchQuery || undefined,
        page,
        pageSize: 30,
        sortBy,
        sortOrder,
      })
      // 将 StockListItem 映射为 StockRow
      const items: StockRow[] = res.data.map((s) => ({
        code: s.code,
        name: s.name,
        industry: s.industry,
        market_cap: s.market_cap,
        close: s.close,
        pct_chg: s.pct_chg,
      }))
      if (append) {
        setStockData((prev) => [...prev, ...items])
      } else {
        setStockData(items)
        if (items.length > 0 && page === 1 && !selectedCode) {
          setSelectedCode(items[0].code)
          setSelectedName(items[0].name)
        }
      }
      setStockTotal(res.total)
      setNextPage(page + 1)
    } catch {
      if (!append) setStockError('加载失败')
    } finally {
      setStockLoading(false)
      setStockLoadingMore(false)
    }
  }, [searchQuery, sortBy, sortOrder, selectedCode])

  // 初始加载 / 排序/搜索变化时重新加载
  useEffect(() => {
    if (isMarketMode) fetchMarketData(1, false)
  }, [fetchMarketData, isMarketMode])

  // ---- 加载历史列表 ----
  const loadHistoryList = useCallback(async () => {
    try {
      const hList = await api.screenHistory(strategy)
      setHistoryList(hList)
    } catch {
      setHistoryList([])
    }
  }, [strategy])

  useEffect(() => {
    loadHistoryList()
  }, [loadHistoryList])

  // ---- 切换策略时重置 ----
  useEffect(() => {
    if (preset) {
      const defaults = Object.fromEntries(preset.params.map((p) => [p.key, p.value]))
      setParamValues(() => defaults)
    }
    setFilterOpen(false)
    setSearchQuery('')
    setSelectedHistoryDate(null)
    setDataSource('market')
    setHistoryList([])
    setSelectedCode('')
    setSelectedName('')
  }, [preset])

  // ---- 选中股票 → 拉取K线 ----
  useEffect(() => {
    if (!selectedCode) return
    let cancelled = false
    const load = async () => {
      try {
        const periods: KlineTimeframe[] = ['day', 'week', 'month', 'quarter']
        const results = await Promise.all(periods.map((p) => api.stockKline(selectedCode, p)))
        if (cancelled) return
        setKline({
          day: results[0].data, week: results[1].data,
          month: results[2].data, quarter: results[3].data,
        })
      } catch {
        if (!cancelled) setKline(EMPTY_KLINE)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedCode])

  // ---- 搜索回调 ----
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    setSelectedHistoryDate(null)
    setDataSource('market')
  }, [])

  // ---- 排序回调 ----
  const handleSort = useCallback((newSortBy: StockSortField, newSortOrder: SortOrder) => {
    setSortBy(newSortBy)
    setSortOrder(newSortOrder)
  }, [])

  // ---- 加载更多回调 ----
  const handleLoadMore = useCallback(() => {
    if (stockLoadingMore || stockData.length >= stockTotal) return
    fetchMarketData(nextPage, true)
  }, [stockLoadingMore, stockData, stockTotal, nextPage, fetchMarketData])

  // ---- 运行筛选 ----
  const runScreenFn = useMemo(() => async () => {
    if (screeningRef.current) return
    screeningRef.current = true
    setScreening(true)
    setFilterOpen(false)
    const label = `${preset?.name ?? '技术面'}筛选`
    onActivity('technical-screen', 'running', label)
    try {
      const res = await api.screenResult({ preset: strategy, params: paramValues })
      setStockData(res.items)
      setStockTotal(res.total)
      setDataSource('screen')
      setSelectedHistoryDate(null)
      setSearchQuery('')
      if (res.items[0]) {
        setSelectedCode(res.items[0].code)
        setSelectedName(res.items[0].name)
      }
      onActivity('technical-screen', 'done', label, `共 ${res.total} 只入选`)
      // 刷新历史列表
      loadHistoryList()
    } catch {
      setStockData([])
      setStockTotal(0)
      setDataSource('screen')
      onActivity('technical-screen', 'error', label, '请求失败')
    } finally {
      screeningRef.current = false
      setScreening(false)
    }
  }, [strategy, paramValues, preset, onActivity, loadHistoryList])

  // ---- 选择历史日期 ----
  const handleSelectHistoryDate = useCallback(async (date: string) => {
    if (date === selectedHistoryDate) return
    try {
      const res = await api.screenResult({ preset: strategy, historyDate: date })
      setStockData(res.items)
      setStockTotal(res.total)
      setDataSource('history')
      setSelectedHistoryDate(date)
      setSearchQuery('')
      if (res.items[0]) {
        setSelectedCode(res.items[0].code)
        setSelectedName(res.items[0].name)
      }
    } catch {
      // 请求失败时不切换
    }
  }, [strategy, selectedHistoryDate])

  // ---- 清除历史选择 → 返回全市场 ----
  const handleClearHistory = useCallback(() => {
    setSelectedHistoryDate(null)
    setDataSource('market')
    setSearchQuery('')
  }, [])

  // ---- 抽屉外点击收起 ----
  const drawerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [filterOpen])

  const handleSelectCode = useCallback((code: string, name: string) => {
    setSelectedCode(code)
    setSelectedName(name)
  }, [])

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* 筛选抽屉 */}
      {filterOpen && (
        <div
          ref={drawerRef}
          className="absolute left-0 top-0 z-30 flex h-full w-[180px] flex-col border-r border-line bg-paper/95 px-3 py-5 shadow-lg backdrop-blur-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-soft">筛选参数</span>
            <button
              onClick={() => setFilterOpen(false)}
              className="rounded-md p-1 text-ink-faint hover:bg-paper-2 hover:text-ink-soft"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <TechnicalFilterCard
              preset={preset}
              paramValues={paramValues}
              onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
              onApply={runScreenFn}
              loading={screening}
            />
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <StockListCard
            data={stockData}
            total={stockTotal}
            loading={stockLoading}
            loadingMore={stockLoadingMore}
            selectedCode={selectedCode}
            onSelectCode={handleSelectCode}
            onSearch={handleSearch}
            onLoadMore={isMarketMode ? handleLoadMore : undefined}
            onSort={isMarketMode ? handleSort : undefined}
            sortBy={sortBy}
            sortOrder={sortOrder}
            showSort={isMarketMode}
            hasMore={isMarketMode && stockData.length < stockTotal}
            historyList={historyList.length > 0 ? historyList : undefined}
            selectedHistoryDate={selectedHistoryDate ?? undefined}
            onSelectHistoryDate={handleSelectHistoryDate}
            onClearHistory={handleClearHistory}
            error={stockError}
            onRetry={isMarketMode ? () => fetchMarketData(1, false) : undefined}
          />
        </div>
        <div className="min-w-0">
          <Card>
            <CardContent className="pt-5">
              <PriceChart
                stockName={selectedName}
                klineDay={kline.day} klineWeek={kline.week}
                klineMonth={kline.month} klineQuarter={kline.quarter}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
})
