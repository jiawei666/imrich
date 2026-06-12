import { useEffect, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Kline, KlineTimeframe } from '@/types'

const UP = '#c0392b'
const DOWN = '#2f8f6f'
const INK_SOFT = '#8b96a1'
const WHITE_LINE = '#2b6cb0'
const YELLOW_LINE = '#c79a3a'
const LINE_THRESHOLD = 120

const PERIODS: { key: KlineTimeframe; label: string }[] = [
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
  { key: 'quarter', label: '季K' },
]

const INITIAL_SHOW: Record<KlineTimeframe, number> = { day: 60, week: 52, month: 36, quarter: 20 }

function tooltipFormatter(params: any[]) {
  if (!params || params.length === 0) return ''
  const date = params[0]?.axisValue ?? ''

  const kline = params.find((p: any) => p.seriesName === 'K线' || p.seriesName === '收盘')
  let isUp = true
  let closePrice = ''
  const fields: string[] = []

  if (kline && Array.isArray(kline.data)) {
    isUp = kline.data[1] >= kline.data[0]
    closePrice = String(kline.data[1])
    fields.push(`<span style="color:#8b96a1">开盘:</span> ${kline.data[0]}`)
    fields.push(`<span style="color:#8b96a1">最低:</span> ${kline.data[2]}`)
    fields.push(`<span style="color:#8b96a1">最高:</span> ${kline.data[3]}`)
  } else if (kline && kline.data != null) {
    isUp = true
    closePrice = String(kline.data)
    fields.push(`<span style="color:#8b96a1">收盘:</span> ${kline.data}`)
  }

  const closeColor = isUp ? '#c0392b' : '#2f8f6f'

  const vol = params.find((p: any) => p.seriesName === '成交量')
  if (vol?.data != null) {
    const volVal = typeof vol.data === 'object' && vol.data.value != null ? vol.data.value : vol.data
    if (volVal !== 0 && volVal !== '-') {
      fields.push(`<span style="color:#6b7fa3">成交量:</span> ${volVal}`)
    }
  }

  const white = params.find((p: any) => p.seriesName === '白线')
  const yellow = params.find((p: any) => p.seriesName === '黄线')
  if (white?.data != null) fields.push(`<span style="color:#2b6cb0">白线:</span> ${white.data}`)
  if (yellow?.data != null) fields.push(`<span style="color:#c79a3a">黄线:</span> ${yellow.data}`)

  const j = params.find((p: any) => p.seriesName === 'J')
  let jHtml = ''
  if (j?.data != null) {
    jHtml = `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #e9e0c9">
      <span style="color:#c0392b">J:</span> ${j.data}</div>`
  }

  return `<div style="position:relative;min-width:140px">
    <div style="font-weight:600;margin-bottom:4px">${date}
      <span style="float:right;font-size:16px;font-weight:700;color:${closeColor}">${closePrice}</span>
    </div>
    ${fields.join('<br/>')}
    ${jHtml}
  </div>`
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

  // 水平滚轮缩放
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

  const hasKdj = data.some((d) => d.j != null)
  const hasVolume = data.some((d) => d.volume != null && d.volume > 0)

  const markLine = {
    symbol: 'none',
    lineStyle: { color: '#2b3a4d', type: 'dashed' as const, width: 1 },
    label: { position: 'insideStartTop' as const, color: '#2b3a4d', fontSize: 11, formatter: `${highLabel} ${highLine}` },
    data: [{ yAxis: highLine }],
  }

  const priceSeries = asLine
    ? [{
        type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0, name: '收盘',
        data: data.map((d) => d.close), smooth: true, symbol: 'none',
        lineStyle: { color: UP, width: 1.5 },
        areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: 'rgba(192,57,43,0.12)' }, { offset: 1, color: 'rgba(192,57,43,0)' }] } },
        markLine,
      }]
    : [{
        type: 'candlestick' as const, xAxisIndex: 0, yAxisIndex: 0, name: 'K线',
        data: data.map((d) => [d.open, d.close, d.low, d.high]),
        itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
        markLine,
      }]

  const overlaySeries = [
    { type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0, name: '白线', data: data.map((d) => d.whiteLine ?? null),
      smooth: true, symbol: 'none', lineStyle: { color: WHITE_LINE, width: 1 }, connectNulls: true },
    { type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0, name: '黄线', data: data.map((d) => d.yellowLine ?? null),
      smooth: true, symbol: 'none', lineStyle: { color: YELLOW_LINE, width: 1 }, connectNulls: true },
  ]

  // 成交量系列
  const volumeSeries = hasVolume
    ? [{
        type: 'bar' as const,
        xAxisIndex: 1,
        yAxisIndex: 1,
        name: '成交量',
        data: data.map((d) => ({
          value: d.volume ?? 0,
          itemStyle: { color: d.close >= d.open ? 'rgba(192,57,43,0.6)' : 'rgba(47,143,111,0.6)' },
        })),
      }]
    : []

  // KDJ 只显示 J 线
  const kdjSeries = hasKdj
    ? [
        { type: 'line' as const, xAxisIndex: 2, yAxisIndex: 2, name: 'J', data: data.map((d) => d.j ?? null),
          symbol: 'none', lineStyle: { color: '#c0392b', width: 1 }, connectNulls: true },
      ]
    : []

  const xCommon = {
    type: 'category' as const,
    data: data.map((d) => d.date),
    boundaryGap: true,
    axisLine: { lineStyle: { color: '#e9e0c9' } },
    axisTick: { show: false },
  }

  // x轴间隔：加大间隔避免密集
  const labelInterval = Math.max(Math.floor(data.length / 8), 0)

  // grid 配置：三区域（K线 + 成交量 + KDJ）
  const gridConfigs = () => {
    if (hasKdj && hasVolume) {
      return [
        { left: 8, right: 12, top: 28, height: '42%', containLabel: true },
        { left: 8, right: 12, top: '54%', height: '14%', containLabel: true },
        { left: 8, right: 12, top: '74%', height: '14%', containLabel: true },
      ]
    }
    if (hasVolume) {
      return [
        { left: 8, right: 12, top: 28, height: '50%', containLabel: true },
        { left: 8, right: 12, top: '66%', height: '18%', containLabel: true },
      ]
    }
    if (hasKdj) {
      return [
        { left: 8, right: 12, top: 28, height: '58%', containLabel: true },
        { left: 8, right: 12, top: '74%', height: '18%', containLabel: true },
      ]
    }
    return [{ left: 8, right: 12, top: 28, bottom: 20, containLabel: true }]
  }

  // xAxis 配置
  const xAxisConfigs = () => {
    const bottomAxis = {
      ...xCommon,
      axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: string) => v.slice(0, 7), interval: labelInterval },
    }
    const hiddenAxis = { ...xCommon, axisLabel: { show: false } }

    if (hasKdj && hasVolume) {
      return [
        { ...hiddenAxis, gridIndex: 0 },
        { ...hiddenAxis, gridIndex: 1 },
        { ...bottomAxis, gridIndex: 2 },
      ]
    }
    if (hasVolume) {
      return [
        { ...hiddenAxis, gridIndex: 0 },
        { ...bottomAxis, gridIndex: 1 },
      ]
    }
    if (hasKdj) {
      return [
        { ...hiddenAxis, gridIndex: 0 },
        { ...bottomAxis, gridIndex: 1 },
      ]
    }
    return [{ ...bottomAxis, gridIndex: 0 }]
  }

  // yAxis 配置
  const yAxisConfigs = () => {
    const priceAxis = {
      scale: true, position: 'right', splitLine: { lineStyle: { color: '#f0e8d4' } },
      axisLabel: { color: INK_SOFT, fontSize: 10 },
    }
    const volumeAxis = {
      position: 'right', splitNumber: 2, splitLine: { show: false },
      axisLabel: { color: INK_SOFT, fontSize: 10,
        formatter: (v: number) => v >= 10000 ? `${(v/10000).toFixed(0)}万` : String(Math.round(v)) },
    }
    const kdjAxis = {
      scale: true, position: 'right', splitNumber: 2,
      splitLine: { lineStyle: { color: '#f0e8d4' } },
      axisLabel: { color: INK_SOFT, fontSize: 10 },
    }

    if (hasKdj && hasVolume) {
      return [
        { ...priceAxis, gridIndex: 0 },
        { ...volumeAxis, gridIndex: 1 },
        { ...kdjAxis, gridIndex: 2 },
      ]
    }
    if (hasVolume) {
      return [
        { ...priceAxis, gridIndex: 0 },
        { ...volumeAxis, gridIndex: 1 },
      ]
    }
    if (hasKdj) {
      return [
        { ...priceAxis, gridIndex: 0 },
        { ...kdjAxis, gridIndex: 1 },
      ]
    }
    return [{ ...priceAxis, gridIndex: 0 }]
  }

  // 确定受 dataZoom 控制的 xAxis 索引
  const zoomXAxisIndices = () => {
    if (hasKdj && hasVolume) return [0, 1, 2]
    if (hasVolume || hasKdj) return [0, 1]
    return [0]
  }

  // legend 数据
  const legendData = () => {
    const items = ['白线', '黄线']
    if (hasVolume) items.push('成交量')
    if (hasKdj) items.push('J')
    return items
  }

  // 图表高度
  const chartHeight = () => {
    if (hasKdj && hasVolume) return 440
    if (hasVolume || hasKdj) return 360
    return 260
  }

  const option: EChartsOption = {
    animation: false,
    legend: { show: true, top: 0, right: 8, textStyle: { color: INK_SOFT, fontSize: 10 },
      data: legendData() },
    grid: gridConfigs() as any,
    tooltip: {
      trigger: 'axis',
      triggerOn: 'mousemove',
      axisPointer: { type: asLine ? 'line' : 'cross' },
      backgroundColor: '#fffdf7',
      borderColor: '#e9e0c9',
      textStyle: { color: '#2b3a4d', fontSize: 12 },
      formatter: tooltipFormatter as any,
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    dataZoom: [{ type: 'inside', xAxisIndex: zoomXAxisIndices(),
      start: zoomRef.current.start, end: zoomRef.current.end,
      zoomOnMouseWheel: true, moveOnMouseMove: true }],
    xAxis: xAxisConfigs() as any,
    yAxis: yAxisConfigs() as any,
    series: [...priceSeries, ...overlaySeries, ...volumeSeries, ...kdjSeries],
  }

  return (
    <div ref={containerRef}>
      <ReactECharts ref={chartRef} option={option} style={{ height: chartHeight() }}
        notMerge onEvents={{ datazoom: handleDataZoom }} />
    </div>
  )
}

export function PriceChart({
  stockName,
  klineDay,
  klineWeek,
  klineMonth,
  klineQuarter,
  highLine,
  highLabel,
}: {
  stockName?: string
  klineDay: Kline[]
  klineWeek: Kline[]
  klineMonth: Kline[]
  klineQuarter: Kline[]
  highLine: number
  highLabel: string
}) {
  const [period, setPeriod] = useState<KlineTimeframe>('day')
  const dataMap: Record<KlineTimeframe, Kline[]> = {
    day: klineDay, week: klineWeek, month: klineMonth, quarter: klineQuarter,
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">{stockName ?? '股价走势'}</span>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as KlineTimeframe)}>
          <TabsList className="h-7 p-0.5">
            {PERIODS.map(({ key, label }) => (
              <TabsTrigger key={key} value={key} className="px-2.5 py-1 text-xs">{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <ChartBody key={period} data={dataMap[period]} period={period} highLine={highLine} highLabel={highLabel} />
    </div>
  )
}
