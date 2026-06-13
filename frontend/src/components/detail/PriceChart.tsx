import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const INITIAL_SHOW: Record<KlineTimeframe, number> = { day: 90, week: 52, month: 36, quarter: 20 }

// 统一的 grid left 值，保证多图对齐
const GRID_LEFT = 8
const GRID_RIGHT = 60

function createTooltipFormatter(data: Kline[]) {
  return function tooltipFormatter(params: any[]) {
    if (!params || params.length === 0) return ''
    const date = params[0]?.axisValue ?? ''
    const dataIndex = params[0]?.dataIndex
    const point = dataIndex != null ? data[dataIndex] : undefined

    const kline = params.find((p: any) => p.seriesName === 'K线' || p.seriesName === '收盘')
    const isUp = point ? point.close >= point.open : true
    const closePrice = point != null ? String(point.close) : ''
    const fields: string[] = []

    if (kline && Array.isArray(kline.data)) {
      fields.push(`<span style="color:#8b96a1">开盘:</span> ${kline.data[0]}`)
      fields.push(`<span style="color:#8b96a1">最低:</span> ${kline.data[2]}`)
      fields.push(`<span style="color:#8b96a1">最高:</span> ${kline.data[3]}`)
    } else if (kline && kline.data != null) {
      fields.push(`<span style="color:#8b96a1">收盘:</span> ${kline.data}`)
    }

    const closeColor = isUp ? UP : DOWN

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
}

interface MarkerPoint {
  x: number
  y: number
  price: number
  side: 'left' | 'right'
}

interface MarkerInfo {
  high: MarkerPoint
  low: MarkerPoint
}

function ChartBody({
  data,
  period,
}: {
  data: Kline[]
  period: KlineTimeframe
}) {
  const initCount = Math.min(INITIAL_SHOW[period], data.length)
  const initStart = data.length > 0 ? ((data.length - initCount) / data.length) * 100 : 0

  const zoomRef = useRef({ start: initStart, end: 100 })
  const asLineRef = useRef(initCount > LINE_THRESHOLD)
  const [asLine, setAsLine] = useState(asLineRef.current)
  const chartRef = useRef<ReactECharts>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [markers, setMarkers] = useState<MarkerInfo | null>(null)

  // 数据首次到位（或切换股票后数据变化）时，重置缩放范围为最近 N 条
  const prevDataRef = useRef<Kline[] | null>(null)
  if (data.length > 0 && data !== prevDataRef.current) {
    const count = Math.min(INITIAL_SHOW[period], data.length)
    zoomRef.current = { start: ((data.length - count) / data.length) * 100, end: 100 }
    prevDataRef.current = data
  }

  // 计算可见区域的最高/最低价（含索引，用于定位标记）
  const getVisibleHighLow = () => {
    const { start, end } = zoomRef.current
    const startIdx = Math.floor((start / 100) * data.length)
    const endIdx = Math.min(Math.ceil((end / 100) * data.length), data.length - 1)
    const visible = data.slice(startIdx, endIdx + 1)
    if (visible.length === 0) return null
    let highIdx = 0, lowIdx = 0
    visible.forEach((d, i) => {
      if (d.high > visible[highIdx].high) highIdx = i
      if (d.low < visible[lowIdx].low) lowIdx = i
    })
    return {
      high: { idx: startIdx + highIdx, price: visible[highIdx].high },
      low: { idx: startIdx + lowIdx, price: visible[lowIdx].low },
    }
  }

  // 更新标记像素位置：箭头根据所在水平位置动态显示在左侧或右侧
  const updateMarkers = useCallback(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (!chart || data.length === 0) return
    const hl = getVisibleHighLow()
    if (!hl) { setMarkers(null); return }

    const width = containerRef.current?.clientWidth ?? 0
    const highPixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [hl.high.idx, hl.high.price]) as number[]
    const lowPixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [hl.low.idx, hl.low.price]) as number[]

    setMarkers({
      high: { x: highPixel[0], y: highPixel[1], price: hl.high.price, side: highPixel[0] > width / 2 ? 'left' : 'right' },
      low: { x: lowPixel[0], y: lowPixel[1], price: hl.low.price, side: lowPixel[0] > width / 2 ? 'left' : 'right' },
    })
  }, [data])

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
    requestAnimationFrame(updateMarkers)
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

  // 图表渲染完成后更新标记位置
  useEffect(() => {
    const timer = setTimeout(updateMarkers, 150)
    return () => clearTimeout(timer)
  }, [data, period, updateMarkers])

  const hasKdj = data.some((d) => d.j != null)
  const hasVolume = data.some((d) => d.volume != null && d.volume > 0)

  const priceSeries = asLine
    ? [{
        type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0, name: '收盘',
        data: data.map((d) => d.close), smooth: true, symbol: 'none',
        lineStyle: { color: UP, width: 1.5 },
        areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: 'rgba(192,57,43,0.12)' }, { offset: 1, color: 'rgba(192,57,43,0)' }] } },
      }]
    : [{
        type: 'candlestick' as const, xAxisIndex: 0, yAxisIndex: 0, name: 'K线',
        data: data.map((d) => [d.open, d.close, d.low, d.high]),
        itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
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

  const labelInterval = Math.max(Math.floor(data.length / 8), 0)

  // grid 配置：统一 left/right 保证对齐
  const gridConfigs = () => {
    const base = { left: GRID_LEFT, right: GRID_RIGHT, containLabel: false }
    if (hasKdj && hasVolume) {
      return [
        { ...base, top: 28, height: '42%' },
        { ...base, top: '54%', height: '14%' },
        { ...base, top: '74%', height: '14%' },
      ]
    }
    if (hasVolume) {
      return [
        { ...base, top: 28, height: '50%' },
        { ...base, top: '66%', height: '18%' },
      ]
    }
    if (hasKdj) {
      return [
        { ...base, top: 28, height: '58%' },
        { ...base, top: '74%', height: '18%' },
      ]
    }
    return [{ ...base, top: 28, bottom: 20 }]
  }

  // xAxis 配置：只有最底部显示时间
  const xAxisConfigs = () => {
    const bottomAxis = {
      ...xCommon,
      axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: string) => v.slice(0, 7), interval: labelInterval },
    }
    const hiddenAxis = {
      ...xCommon,
      axisLabel: { show: false },
      axisTick: { show: false },
      axisPointer: { label: { show: false } },
    }

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
      scale: true, position: 'right' as const, splitLine: { lineStyle: { color: '#f0e8d4' } },
      axisLabel: { color: INK_SOFT, fontSize: 10, width: 50, overflow: 'truncate' as const },
    }
    const volumeAxis = {
      position: 'right' as const, splitNumber: 2, splitLine: { show: false },
      axisLabel: { color: INK_SOFT, fontSize: 10, width: 50, overflow: 'truncate' as const,
        formatter: (v: number) => v >= 10000 ? `${(v/10000).toFixed(0)}万` : String(Math.round(v)) },
    }
    const kdjAxis = {
      scale: true, position: 'right' as const, splitNumber: 2,
      splitLine: { lineStyle: { color: '#f0e8d4' } },
      axisLabel: { color: INK_SOFT, fontSize: 10, width: 50, overflow: 'truncate' as const },
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

  // option 仅在 data/period/asLine 变化时重建，避免标记更新（setMarkers）
  // 触发 notMerge 重设 option 而打断 dataZoom 的拖拽/滚轮交互状态
  const option: EChartsOption = useMemo(() => ({
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
      formatter: createTooltipFormatter(data) as any,
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    dataZoom: [{ type: 'inside', xAxisIndex: zoomXAxisIndices(),
      start: zoomRef.current.start, end: zoomRef.current.end,
      zoomOnMouseWheel: true, moveOnMouseMove: true }],
    xAxis: xAxisConfigs() as any,
    yAxis: yAxisConfigs() as any,
    series: [...priceSeries, ...overlaySeries, ...volumeSeries, ...kdjSeries],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, period, asLine])

  return (
    <div ref={containerRef} className="relative">
      <ReactECharts ref={chartRef} option={option} style={{ height: chartHeight() }}
        notMerge shouldSetOption={(prev, curr) => prev.option !== curr.option}
        onEvents={{ datazoom: handleDataZoom }} />
      {/* 最高价标记：箭头指向目标K线，动态显示在左侧或右侧 */}
      {markers && (
        <div
          className="pointer-events-none absolute z-10 flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold"
          style={
            markers.high.side === 'right'
              ? { left: markers.high.x + 4, top: markers.high.y, transform: 'translateY(-50%)', color: UP }
              : { left: markers.high.x - 4, top: markers.high.y, transform: 'translate(-100%, -50%)', color: UP }
          }
        >
          {markers.high.side === 'right' ? (
            <>
              <span>←</span>
              <span>{markers.high.price.toFixed(2)}</span>
            </>
          ) : (
            <>
              <span>{markers.high.price.toFixed(2)}</span>
              <span>→</span>
            </>
          )}
        </div>
      )}
      {/* 最低价标记：箭头指向目标K线，动态显示在左侧或右侧 */}
      {markers && (
        <div
          className="pointer-events-none absolute z-10 flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold"
          style={
            markers.low.side === 'right'
              ? { left: markers.low.x + 4, top: markers.low.y, transform: 'translateY(-50%)', color: DOWN }
              : { left: markers.low.x - 4, top: markers.low.y, transform: 'translate(-100%, -50%)', color: DOWN }
          }
        >
          {markers.low.side === 'right' ? (
            <>
              <span>←</span>
              <span>{markers.low.price.toFixed(2)}</span>
            </>
          ) : (
            <>
              <span>{markers.low.price.toFixed(2)}</span>
              <span>→</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function PriceChart({
  stockName,
  klineDay,
  klineWeek,
  klineMonth,
  klineQuarter,
}: {
  stockName?: string
  klineDay: Kline[]
  klineWeek: Kline[]
  klineMonth: Kline[]
  klineQuarter: Kline[]
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
      <ChartBody key={period} data={dataMap[period]} period={period} />
    </div>
  )
}
