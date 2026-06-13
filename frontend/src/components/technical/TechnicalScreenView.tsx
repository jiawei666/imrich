import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle } from 'react'
import { X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { StockListCard } from '@/components/screener/StockListCard'
import { PriceChart } from '@/components/detail/PriceChart'
import { TechnicalFilterCard } from './TechnicalFilterCard'
import { api } from '@/lib/api'
import type { Kline, KlineTimeframe, Preset, RefreshStatus, StrategyId, TechnicalCandidate } from '@/types'

const EMPTY_KLINE: Record<KlineTimeframe, Kline[]> = { day: [], week: [], month: [], quarter: [] }

type ScreenMode = 'market' | 'screened'

export interface TechnicalScreenViewHandle {
  toggleFilter: () => void
}

export const TechnicalScreenView = forwardRef<TechnicalScreenViewHandle, {
  strategy: StrategyId
  preset: Preset | null
  refreshStatus?: RefreshStatus
}>(function TechnicalScreenView({
  strategy,
  preset,
  refreshStatus,
}, ref) {
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [candidates, setCandidates] = useState<TechnicalCandidate[]>([])
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [selectedName, setSelectedName] = useState<string>('')
  const [screenMode, setScreenMode] = useState<ScreenMode>('market')
  const [kline, setKline] = useState<Record<KlineTimeframe, Kline[]>>(EMPTY_KLINE)
  const [highLine, setHighLine] = useState(0)
  const [highLabel, setHighLabel] = useState('历史高点')
  const [filterOpen, setFilterOpen] = useState(false)

  // 暴露 toggleFilter 给父组件（StrategySidebar 的筛选按钮调用）
  useImperativeHandle(ref, () => ({
    toggleFilter: () => setFilterOpen((v) => !v),
  }))

  // 切换策略时重置参数为预设默认 + 切回市场模式 + 关闭抽屉
  useEffect(() => {
    if (preset) {
      const defaults = Object.fromEntries(preset.params.map((p) => [p.key, p.value]))
      setParamValues(() => defaults)
    }
    setScreenMode(() => 'market')
    setFilterOpen(false)
  }, [preset])

  const clearScreen = () => {
    setScreenMode('market')
  }

  const handleSelectCode = (code: string, name: string) => {
    setSelectedCode(code)
    setSelectedName(name)
  }

  // 选中股票 → 拉取四周期K线
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
        setHighLine(results[0].highLine)
        setHighLabel(results[0].highLabel)
      } catch {
        if (!cancelled) setKline(EMPTY_KLINE)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedCode])

  const showScreenedData = screenMode === 'screened' ? candidates : undefined

  // 点击抽屉外区域收起
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

  const runScreen = useMemo(() => async () => {
    try {
      const res = await api.screenTechnical(strategy, paramValues)
      setCandidates(res)
      setScreenMode('screened')
      if (res[0]) {
        setSelectedCode(res[0].code)
        setSelectedName(res[0].name)
      }
    } catch {
      setCandidates([])
      setScreenMode('screened')
    }
    setFilterOpen(false)
  }, [strategy, paramValues])

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* 筛选抽屉 — 覆盖式 */}
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
              onApply={runScreen}
            />
          </div>
        </div>
      )}

      {/* 主内容区 — 响应式布局 */}
      <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <StockListCard
            screenedData={showScreenedData}
            selectedCode={selectedCode}
            onSelectCode={handleSelectCode}
            onClearScreen={clearScreen}
            onFirstLoad={(code, name) => {
              setSelectedCode(code)
              setSelectedName(name)
            }}
          />
        </div>
        <div className="min-w-0">
          <Card>
            <CardContent className="pt-5">
              <PriceChart
                stockName={selectedName}
                klineDay={kline.day} klineWeek={kline.week}
                klineMonth={kline.month} klineQuarter={kline.quarter}
                highLine={highLine} highLabel={highLabel}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
})
