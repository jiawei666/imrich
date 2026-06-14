import { useEffect, useRef, useState, useCallback } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { StrategySidebar } from '@/components/layout/StrategySidebar'
import { TopBar } from '@/components/layout/TopBar'
import { FilterPanel, type FilterState } from '@/components/screener/FilterPanel'
import { FundamentalCandidateListCard } from '@/components/screener/FundamentalCandidateListCard'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { Card } from '@/components/ui/card'
import { FilterDrawer } from '@/components/ui/filter-drawer'
import { TechnicalScreenView, type TechnicalScreenViewHandle } from '@/components/technical/TechnicalScreenView'
import { STOCK_DETAIL } from '@/data/mock'
import { api } from '@/lib/api'
import {
  STRATEGY_CATEGORY,
  type ActivityItem,
  type ActivityStatus,
  type Candidate,
  type IndexInfo,
  type MetaResponse,
  type Preset,
  type RefreshStatus,
  type StockDetail,
  type StrategyId,
} from '@/types'

export default function App() {
  const [strategy, setStrategy] = useState<StrategyId>('super-growth')
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [presets, setPresets] = useState<Preset[]>([])
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | undefined>(undefined)
  const [meta, setMeta] = useState<MetaResponse | undefined>(undefined)
  const [stockDetail, setStockDetail] = useState<StockDetail>(STOCK_DETAIL)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activities, setActivities] = useState<ActivityItem[]>([])

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

  const technicalRef = useRef<TechnicalScreenViewHandle>(null)
  const activityTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // 上报后台任务状态，供 TopBar 实时动态区展示；done/error 状态 3 秒后自动消失
  const reportActivity = useCallback((id: string, status: ActivityStatus, label: string, detail?: string) => {
    const timers = activityTimersRef.current
    if (timers[id]) {
      clearTimeout(timers[id])
      delete timers[id]
    }
    setActivities((prev) => [...prev.filter((a) => a.id !== id), { id, label, status, detail }])
    if (status !== 'running') {
      timers[id] = setTimeout(() => {
        setActivities((prev) => prev.filter((a) => a.id !== id))
        delete timers[id]
      }, 3000)
    }
  }, [])

  useEffect(() => {
    api.presets().then(setPresets).catch(() => setPresets([]))
    api.meta().then(setMeta).catch(() => setMeta(undefined))
  }, [])

  const handleStrategyChange = (s: StrategyId) => {
    setStrategy(s)
  }

  const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
  const activePreset = presets.find((p) => p.id === strategy) ?? null
  const updatedAt = meta?.klineDay.updatedAt ?? refreshStatus?.kline.updatedAt ?? '—'

  const reloadMeta = () => api.meta().then(setMeta).catch(() => setMeta(undefined))

  // 基本面：运行筛选
  const runScreen = useCallback(async () => {
    setScreening(true)
    setFilterOpen(false)
    const label = `${activePreset?.name ?? '基本面'}筛选`
    reportActivity('fundamental-screen', 'running', label)
    try {
      const res = await api.screenFundamentalResult(strategy, paramValues)
      setScreenItems(res.items)
      setScreenTotal(res.total)
      setScreenUpdatedAt(res.updatedAt)
      if (res.items[0]) {
        setSelectedCode(res.items[0].code)
        setSelectedCandidate(res.items[0])
      }
      reportActivity('fundamental-screen', 'done', label, `共 ${res.total} 只入选`)
    } catch {
      setScreenItems([])
      setScreenTotal(0)
      reportActivity('fundamental-screen', 'error', label, '请求失败')
    } finally {
      setScreening(false)
    }
  }, [strategy, paramValues, activePreset, reportActivity])

  // 基本面：加载上次结果 + 指数列表
  const loadFundamentalCached = useCallback(async (preset: Preset) => {
    const defaults = Object.fromEntries(preset.params.map((p) => [p.key, p.value]))
    setParamValues(defaults)
    setSelectedCandidate(null)
    setScreening(true)
    const label = `${preset.name}加载`
    reportActivity('fundamental-screen', 'running', label)
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
      reportActivity('fundamental-screen', 'done', label, `共 ${res.total} 只`)
    } catch {
      setScreenItems([])
      setScreenTotal(0)
      setSelectedCode('')
      reportActivity('fundamental-screen', 'error', label, '加载失败')
    } finally {
      setScreening(false)
    }
  }, [reportActivity])

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

  const triggerRefreshKline = (reloadStockList: boolean) => {
    api.refreshKline(reloadStockList).catch(() => {})
  }

  const triggerRefreshFundamental = () => {
    api.refreshFundamental().catch(() => {})
  }

  const triggerRefreshFundamentalStep = (step: string) => {
    api.refreshFundamentalStep(step).catch(() => {})
  }

  const prevStatusRef = useRef<{ kline?: string; fundamentalSteps?: string[] }>({})

  useEffect(() => {
    const close = api.refreshStatusStream((status) => {
      setRefreshStatus(status)
      const prev = prevStatusRef.current
      // kline 整体状态变化时 reloadMeta
      if (prev.kline === 'running' && status.kline.status !== 'running') {
        reloadMeta()
      }
      // fundamental 任意步骤从 running 变为非 running 时 reloadMeta
      if (prev.fundamentalSteps) {
        for (let i = 0; i < status.fundamental.steps.length; i++) {
          if (prev.fundamentalSteps[i] === 'running' && status.fundamental.steps[i].status !== 'running') {
            reloadMeta()
          }
        }
      }
      prev.kline = status.kline.status
      prev.fundamentalSteps = status.fundamental.steps.map(s => s.status)
    })
    return close
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-cream text-ink">
      <Sidebar />
      <StrategySidebar
        strategy={strategy}
        onSelect={handleStrategyChange}
        onFilterClick={() => {
          if (isTechnical) {
            technicalRef.current?.toggleFilter()
          } else {
            setFilterOpen((v) => !v)
          }
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          updatedAt={updatedAt}
          strategy={strategy}
          refreshStatus={refreshStatus}
          activities={activities}
          onRefreshKline={triggerRefreshKline}
          onRefreshFundamental={triggerRefreshFundamental}
          onRefreshFundamentalStep={triggerRefreshFundamentalStep}
        />

        {isTechnical ? (
          <TechnicalScreenView
            ref={technicalRef}
            strategy={strategy}
            preset={activePreset}
            onActivity={reportActivity}
          />
        ) : (
          <div className="relative flex flex-1 overflow-hidden">
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

            {/* 主区域：结果列表 + 详情 */}
            <main className="grid flex-1 grid-cols-1 gap-5 overflow-hidden p-6 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
              <div className="flex min-h-0 flex-col">
                <FundamentalCandidateListCard
                  items={screenItems}
                  total={screenTotal}
                  updatedAt={screenUpdatedAt}
                  selectedCode={selectedCode}
                  onSelectCode={(code, _name) => { setSelectedCode(code); setSelectedCandidate(screenItems.find(i => i.code === code) ?? null) }}
                  indices={indexList}
                  indexConstituentMap={indexConstituentMap}
                  showDrawdown={strategy === 'oversold-bluechip'}
                  loading={screening}
                />
              </div>
              <div className="overflow-y-auto">
                {selectedCode && detailError && <div className="mb-3 text-sm text-red-600">{detailError}</div>}
                {selectedCode ? (
                  <StockDetailPanel
                    detail={stockDetail}
                    candidate={selectedCandidate}
                    onClose={() => setSelectedCode('')}
                    loading={detailLoading}
                  />
                ) : (
                  <Card className="flex h-full items-center justify-center text-sm text-ink-faint">
                    请选择候选股票查看详情
                  </Card>
                )}
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
