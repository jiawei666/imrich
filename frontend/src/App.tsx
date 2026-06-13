import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { StrategySidebar } from '@/components/layout/StrategySidebar'
import { TopBar } from '@/components/layout/TopBar'
import { FilterPanel, type FilterState } from '@/components/screener/FilterPanel'
import { FundamentalCandidateListCard } from '@/components/screener/FundamentalCandidateListCard'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
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
  const [strategy, setStrategy] = useState<StrategyId>('trend-support')
  const [selectedCode, setSelectedCode] = useState<string>(STOCK_DETAIL.code)
  const [presets, setPresets] = useState<Preset[]>([])
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | undefined>(undefined)
  const [meta, setMeta] = useState<MetaResponse | undefined>(undefined)
  const [stockDetail, setStockDetail] = useState<StockDetail>(STOCK_DETAIL)
  const [detailError, setDetailError] = useState<string | null>(null)
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
  const drawerRef = useRef<HTMLDivElement>(null)
  const activityTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // 上报后台任务状态，供 TopBar 实时动态区展示；done/error 状态 3 秒后自动消失
  const reportActivity = (id: string, status: ActivityStatus, label: string, detail?: string) => {
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
  }

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
    try {
      const res = await api.screenFundamentalResult(preset.id)
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
    }
  }, [])

  const loadIndexData = useCallback(async () => {
    try {
      const indices = await api.listIndices()
      setIndexList(indices)
      // 加载指数成分股映射
      const map: Record<string, Set<string>> = {}
      for (const idx of indices) {
        // 成分股数据从 /indices 接口只返回列表，需要从后端拿成分股映射
        // 暂时用空集合，后续可单独接口加载
        map[idx.indexCode] = new Set<string>()
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
    api.stockDetail(selectedCode)
      .then((detail) => {
        setStockDetail(detail)
        setDetailError(null)
      })
      .catch(() => setDetailError('详情加载失败'))
  }, [isTechnical, selectedCode])

  // 抽屉外点击关闭
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
            {/* 左侧筛选抽屉 */}
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
                  {activePreset && (
                    <FilterPanel
                      preset={activePreset}
                      paramValues={paramValues}
                      onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
                      onApply={runScreen}
                      loading={screening}
                    />
                  )}
                </div>
              </div>
            )}

            {/* 主区域：结果列表 + 详情 */}
            <main className="grid flex-1 grid-cols-1 gap-5 overflow-hidden p-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
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
                />
              </div>
              <div className="overflow-y-auto">
                {detailError && <div className="mb-3 text-sm text-red-600">{detailError}</div>}
                <StockDetailPanel
                  detail={stockDetail}
                  candidate={selectedCandidate}
                  onClose={() => setSelectedCode('')}
                />
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
