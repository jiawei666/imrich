import { useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { QuarterPoint } from '@/types'

const BRAND = '#c0392b'
const MUTED = '#cdbf9e'
const INK_SOFT = '#5d6b79'
const DOWN = '#2f8f6f'

export function ProfitRevenueChart({ data }: { data: QuarterPoint[] }) {
  const [mode, setMode] = useState<'quarterly' | 'cumulative'>('quarterly')

  const netKey = mode === 'quarterly' ? 'netProfitQuarterly' : 'netProfit'
  const revKey = mode === 'quarterly' ? 'revenueQuarterly' : 'revenue'

  const netValues = data.map((d) => d[netKey]).filter((v): v is number => v != null)
  const revValues = data.map((d) => d[revKey]).filter((v): v is number => v != null)
  const lastNet = data[data.length - 1]?.[netKey] ?? null
  const isNewHigh = lastNet != null && netValues.length > 0 && lastNet === Math.max(...netValues)

  // 净利润可正可负，营收恒为正；两者使用独立量级的 y 轴，需让两条轴的 0 刻度
  // 对齐到同一像素高度，否则净利润为负时两组柱子的基线会错位、视觉上脱节。
  // 区间统一向上取整到 0.01，避免浮点运算产生的长尾小数撑爆轴标签宽度。
  const round2 = (v: number) => Math.ceil(v * 100) / 100

  const netMax = Math.max(0, ...netValues)
  const netMin = Math.min(0, ...netValues)
  const negSpan = round2(-netMin * 1.15)
  const posSpan = round2(Math.max(netMax * 1.15, negSpan * 0.1, 1e-9))
  const zeroFrac = negSpan / (negSpan + posSpan)

  const revPosSpan = round2(Math.max(Math.max(0, ...revValues) * 1.15, 1e-9))
  const revNegSpan = zeroFrac === 0 ? 0 : round2((revPosSpan * zeroFrac) / (1 - zeroFrac))

  const formatAxisLabel = (value: number) =>
    value === 0 ? '0' : Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2)

  const option: EChartsOption = {
    grid: { left: 8, right: 8, top: 28, bottom: 24, containLabel: true },
    legend: {
      data: ['净利润（亿元）', '营收（亿元）'],
      top: 0,
      left: 0,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: INK_SOFT, fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#fffdf7',
      borderColor: '#e9e0c9',
      textStyle: { color: '#2b3a4d', fontSize: 12 },
      appendTo: 'body',
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.quarter),
      axisLine: { lineStyle: { color: '#e9e0c9' } },
      axisTick: { show: false },
      axisLabel: { color: INK_SOFT, fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        min: -negSpan,
        max: posSpan,
        splitLine: { lineStyle: { color: '#f0e8d4' } },
        axisLabel: { color: '#8b96a1', fontSize: 10, formatter: formatAxisLabel },
      },
      {
        type: 'value',
        min: -revNegSpan,
        max: revPosSpan,
        splitLine: { show: false },
        axisLabel: { color: '#8b96a1', fontSize: 10, formatter: formatAxisLabel },
      },
    ],
    series: [
      {
        name: '营收（亿元）',
        type: 'bar',
        yAxisIndex: 1,
        data: data.map((d) => d[revKey] ?? null),
        itemStyle: { color: MUTED, borderRadius: [3, 3, 0, 0] },
        barWidth: 14,
        barGap: '-100%',
      },
      {
        name: '净利润（亿元）',
        type: 'bar',
        // 负数柱子向下镜像绘制，圆角应在贴近 0 轴的另一端（底部），否则视觉上和正数柱子不对称；
        // 业绩为负时柱子改为绿色（A股涨红跌绿，与 text-down 颜色一致）
        data: data.map((d) => {
          const v = d[netKey]
          if (v == null) return null
          return {
            value: v,
            itemStyle: {
              color: v >= 0 ? BRAND : DOWN,
              borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
            },
          }
        }),
        itemStyle: { color: BRAND },
        barWidth: 14,
      },
      {
        name: '净利润趋势',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.map((d) => d[netKey] ?? null),
        lineStyle: { color: '#2b3a4d', width: 2 },
        itemStyle: { color: '#2b3a4d' },
        tooltip: { show: false },
        markPoint: {
          symbol: 'roundRect',
          symbolSize: [54, 20],
          symbolOffset: [0, -16],
          itemStyle: { color: BRAND },
          label: { color: '#fff', fontSize: 11, formatter: '创新高' },
          data: isNewHigh
            ? [
                {
                  name: '创新高',
                  coord: [data.length - 1, lastNet] as [number, number],
                },
              ]
            : [],
        },
      },
    ],
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">
          净利润 &amp; 营收趋势<span className="ml-1 text-xs font-normal text-ink-faint">（{mode === 'quarterly' ? '单季度' : '累计'}）</span>
        </span>
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'quarterly' | 'cumulative')}>
          <TabsList className="h-7 p-0.5">
            <TabsTrigger value="quarterly" className="px-2.5 py-1 text-xs">
              单季度
            </TabsTrigger>
            <TabsTrigger value="cumulative" className="px-2.5 py-1 text-xs">
              累计
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ReactECharts option={option} style={{ height: 230 }} notMerge />
    </div>
  )
}
