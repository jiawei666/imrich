import { useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { QuarterPoint } from '@/types'

const BRAND = '#c0392b'
const MUTED = '#cdbf9e'
const INK_SOFT = '#5d6b79'

export function ProfitRevenueChart({ data }: { data: QuarterPoint[] }) {
  const [mode, setMode] = useState('quarter')

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
        splitLine: { lineStyle: { color: '#f0e8d4' } },
        axisLabel: { color: '#8b96a1', fontSize: 10 },
      },
      {
        type: 'value',
        splitLine: { show: false },
        axisLabel: { color: '#8b96a1', fontSize: 10 },
      },
    ],
    series: [
      {
        name: '营收（亿元）',
        type: 'bar',
        yAxisIndex: 1,
        data: data.map((d) => d.revenue),
        itemStyle: { color: MUTED, borderRadius: [3, 3, 0, 0] },
        barWidth: 14,
        barGap: '-100%',
      },
      {
        name: '净利润（亿元）',
        type: 'bar',
        data: data.map((d) => d.netProfit),
        itemStyle: { color: BRAND, borderRadius: [3, 3, 0, 0] },
        barWidth: 14,
      },
      {
        name: '净利润趋势',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.map((d) => d.netProfit),
        lineStyle: { color: '#2b3a4d', width: 2 },
        itemStyle: { color: '#2b3a4d' },
        tooltip: { show: false },
        markPoint: {
          symbol: 'roundRect',
          symbolSize: [54, 20],
          symbolOffset: [0, -16],
          itemStyle: { color: BRAND },
          label: { color: '#fff', fontSize: 11, formatter: '创新高' },
          data: [
            {
              name: '创新高',
              coord: [data.length - 1, data[data.length - 1].netProfit],
            },
          ],
        },
      },
    ],
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">
          净利润 &amp; 营收趋势<span className="ml-1 text-xs font-normal text-ink-faint">（单季度）</span>
        </span>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="h-7 p-0.5">
            <TabsTrigger value="quarter" className="px-2.5 py-1 text-xs">
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
