import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { StockListCard } from '@/components/screener/StockListCard'
import { PriceChart } from '@/components/detail/PriceChart'
import { TechnicalFilterCard } from './TechnicalFilterCard'
import { api } from '@/lib/api'
import type { Kline, KlineTimeframe, Preset, RefreshStatus, StrategyId, TechnicalCandidate } from '@/types'

const EMPTY_KLINE: Record<KlineTimeframe, Kline[]> = { day: [], week: [], month: [], quarter: [] }

type ScreenMode = 'market' | 'screened'

export function TechnicalScreenView({
  strategy,
  preset,
  refreshStatus,
  filterOpen,
  onToggleFilter,
}: {
  strategy: StrategyId
  preset: Preset | null
  refreshStatus?: RefreshStatus
  filterOpen?: boolean
  onToggleFilter?: () => void
}) {
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [candidates, setCandidates] = useState<TechnicalCandidate[]>([])
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [selectedName, setSelectedName] = useState<string>('')
  const [screenMode, setScreenMode] = useState<ScreenMode>('market')
  const [kline, setKline] = useState<Record<KlineTimeframe, Kline[]>>(EMPTY_KLINE)
  const [highLine, setHighLine] = useState(0)
  const [highLabel, setHighLabel] = useState('历史高点')

  // 切换策略时重置参数为预设默认 + 切回市场模式
  useEffect(() => {
    if (preset) {
      const defaults = Object.fromEntries(preset.params.map((p) => [p.key, p.value]))
      setParamValues(() => defaults)
    }
    setScreenMode(() => 'market')
  }, [preset])

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
    // 运行筛选后自动收起抽屉
    onToggleFilter?.()
  }, [strategy, paramValues, onToggleFilter])

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
        onToggleFilter?.()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [filterOpen, onToggleFilter])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 筛选抽屉 */}
      {filterOpen && (
        <div ref={drawerRef} className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-line bg-paper/40 px-3 py-5">
          <TechnicalFilterCard
            preset={preset}
            paramValues={paramValues}
            onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
            onApply={runScreen}
          />
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 gap-5 overflow-y-auto p-6">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
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
          <div className="min-w-0 flex-1">
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
        </div>
      </div>
    </div>
  )
}
