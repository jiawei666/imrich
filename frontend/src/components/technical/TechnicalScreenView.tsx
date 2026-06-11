import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { DataRefreshProgress } from '@/components/screener/DataRefreshProgress'
import { PriceChart } from '@/components/detail/PriceChart'
import { TechnicalCandidateList } from './TechnicalCandidateList'
import { api } from '@/lib/api'
import { TECH_CANDIDATES } from '@/data/mock'
import type { Kline, KlineTimeframe, Preset, RefreshStatus, StrategyId, TechnicalCandidate } from '@/types'

const EMPTY_KLINE: Record<KlineTimeframe, Kline[]> = { day: [], week: [], month: [], quarter: [] }

export function TechnicalScreenView({
  strategy,
  preset,
  refreshStatus,
}: {
  strategy: StrategyId
  preset: Preset | null
  refreshStatus?: RefreshStatus
}) {
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [candidates, setCandidates] = useState<TechnicalCandidate[]>(TECH_CANDIDATES)
  const [selectedCode, setSelectedCode] = useState<string>(TECH_CANDIDATES[0]?.code ?? '')
  const [kline, setKline] = useState<Record<KlineTimeframe, Kline[]>>(EMPTY_KLINE)
  const [highLine, setHighLine] = useState(0)
  const [highLabel, setHighLabel] = useState('历史高点')

  // 切换策略时重置参数为预设默认
  useEffect(() => {
    if (preset) setParamValues(Object.fromEntries(preset.params.map((p) => [p.key, p.value])))
  }, [preset])

  const runScreen = useMemo(() => async () => {
    try {
      const res = await api.screenTechnical(strategy, paramValues)
      setCandidates(res)
      if (res[0]) setSelectedCode(res[0].code)
    } catch {
      setCandidates(TECH_CANDIDATES)
    }
  }, [strategy, paramValues])

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

  return (
    <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <TechnicalCandidateList
          preset={preset}
          paramValues={paramValues}
          onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
          onApply={runScreen}
          candidates={candidates}
          selectedCode={selectedCode}
          onSelect={setSelectedCode}
        />
        <DataRefreshProgress status={refreshStatus} />
      </div>

      <div className="min-w-0">
        <Card>
          <CardContent className="pt-5">
            <PriceChart
              klineDay={kline.day} klineWeek={kline.week}
              klineMonth={kline.month} klineQuarter={kline.quarter}
              highLine={highLine} highLabel={highLabel}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
