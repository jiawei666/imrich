import { useEffect, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Kline, KlineTimeframe } from '@/types'

const UP = '#c0392b'
const DOWN = '#2f8f6f'
const INK_SOFT = '#8b96a1'
const LINE_THRESHOLD = 120

const PERIODS: { key: KlineTimeframe; label: string }[] = [
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
  { key: 'quarter', label: '季K' },
]

const INITIAL_SHOW: Record<KlineTimeframe, number> = {
  day: 60,
  week: 52,
  month: 36,
  quarter: 20,
}

function ChartBody({
  data,
  period,
  highLine,
  highLabel,
}: {
  data: Kline[]
  period: KlineTimeframe
  highLine: number
  highLabel: string
}) {
  const initCount = Math.min(INITIAL_SHOW[period], data.length)
  const initStart = data.length > 0 ? ((data.length - initCount) / data.length) * 100 : 0

  const zoomRef = useRef({ start: initStart, end: 100 })
  const asLineRef = useRef(initCount > LINE_THRESHOLD)
  const [asLine, setAsLine] = useState(asLineRef.current)
  const chartRef = useRef<ReactECharts>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDataZoom = (params: { start?: number; end?: number; batch?: { start?: number; end?: number }[] }) => {
    const p = params.batch?.[0] ?? params
    const start = p.start ?? zoomRef.current.start
    const end = p.end ?? zoomRef.current.end
    zoomRef.current = { start, end }
    const visible = Math.round(((end - start) / 100) * data.length)
    const line = visible > LINE_THRESHOLD
    if (line !== asLineRef.current) {
      asLineRef.current = line
      setAsLine(line)
    }
  }

  // Vertical wheel/pinch keeps ECharts' native zoom (mature default).
  // We only add: two-finger horizontal swipe pans the visible range,
  // intercepted in the capture phase so it doesn't also trigger native zoom.
  useEffect(() => {
    const el = containerRef.current
    const chart = chartRef.current?.getEchartsInstance()
    if (!el || !chart) return

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return

      e.preventDefault()
      e.stopPropagation()
      const { start, end } = zoomRef.current
      const range = end - start
      const shift = (e.deltaX / el.clientWidth) * range
      let newStart = start + shift
      let newEnd = end + shift
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      chart.dispatchAction({ type: 'dataZoom', start: newStart, end: newEnd })
    }

    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  const markLine = {
    symbol: 'none',
    lineStyle: { color: '#2b3a4d', type: 'dashed' as const, width: 1 },
    label: {
      position: 'insideStartTop' as const,
      color: '#2b3a4d',
      fontSize: 11,
      formatter: `${highLabel} ${highLine}`,
    },
    data: [{ yAxis: highLine }],
  }

  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 12, top: 28, bottom: 20, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: asLine ? 'line' : 'cross' },
      backgroundColor: '#fffdf7',
      borderColor: '#e9e0c9',
      textStyle: { color: '#2b3a4d', fontSize: 12 },
    },
    dataZoom: [
      {
        type: 'inside',
        start: zoomRef.current.start,
        end: zoomRef.current.end,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnTouchMove: true,
      },
    ],
    xAxis: {
      type: 'category',
      data: data.map((d) => d.date),
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#e9e0c9' } },
      axisTick: { show: false },
      axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: string) => v.slice(0, 7), interval: 'auto' },
    },
    yAxis: {
      scale: true,
      position: 'right',
      splitLine: { lineStyle: { color: '#f0e8d4' } },
      axisLabel: { color: INK_SOFT, fontSize: 10 },
    },
    series: asLine
      ? [
          {
            type: 'line',
            data: data.map((d) => d.close),
            smooth: true,
            symbol: 'none',
            lineStyle: { color: UP, width: 1.5 },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(192,57,43,0.12)' },
                  { offset: 1, color: 'rgba(192,57,43,0)' },
                ],
              },
            },
            markLine,
          },
        ]
      : [
          {
            type: 'candlestick',
            data: data.map((d) => [d.open, d.close, d.low, d.high]),
            itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
            markLine,
          },
        ],
  }

  return (
    <div ref={containerRef}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: 260 }}
        notMerge
        onEvents={{ datazoom: handleDataZoom }}
      />
    </div>
  )
}

export function PriceChart({
  klineDay,
  klineWeek,
  klineMonth,
  klineQuarter,
  highLine,
  highLabel,
}: {
  klineDay: Kline[]
  klineWeek: Kline[]
  klineMonth: Kline[]
  klineQuarter: Kline[]
  highLine: number
  highLabel: string
}) {
  const [period, setPeriod] = useState<KlineTimeframe>('day')

  const dataMap: Record<KlineTimeframe, Kline[]> = {
    day: klineDay,
    week: klineWeek,
    month: klineMonth,
    quarter: klineQuarter,
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">股价走势</span>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as KlineTimeframe)}>
          <TabsList className="h-7 p-0.5">
            {PERIODS.map(({ key, label }) => (
              <TabsTrigger key={key} value={key} className="px-2.5 py-1 text-xs">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <ChartBody
        key={period}
        data={dataMap[period]}
        period={period}
        highLine={highLine}
        highLabel={highLabel}
      />
    </div>
  )
}
