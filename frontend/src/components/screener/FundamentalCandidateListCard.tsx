import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Candidate, SignalKey, IndexInfo } from '@/types'

type SortField = 'score' | 'netProfitYoY' | 'revenueYoY'
type SortOrder = 'asc' | 'desc'

const SIGNAL_LABELS: Record<SignalKey, string> = {
  highGrowth: '业绩大增', newHigh: '创新高', beatExpect: '超预期',
  sectorEffect: '板块效应', industryNewHigh: '行业指数新高', alpha: 'α地位',
  orderFull: '订单饱满', capexExpand: '产能扩张', newProduct: '新产品',
  domesticSub: '国产替代', industryRecover: '行业复苏', valuationRepair: '估值修复',
  oversold: '低位超跌',
}

export function FundamentalCandidateListCard({
  items,
  total,
  updatedAt,
  selectedCode,
  onSelectCode,
  indices,
  indexConstituentMap,
  showDrawdown,
}: {
  items: Candidate[]
  total: number
  updatedAt: string | null
  selectedCode: string | null
  onSelectCode: (code: string, name: string) => void
  indices: IndexInfo[]
  indexConstituentMap: Record<string, Set<string>>
  showDrawdown: boolean
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState('')
  const [sortField, setSortField] = useState<SortField>('score')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const filtered = useMemo(() => {
    let result = items
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(i => i.name.toLowerCase().includes(q) || i.code.includes(q))
    }
    if (selectedIndex && indexConstituentMap[selectedIndex]) {
      const codes = indexConstituentMap[selectedIndex]
      result = result.filter(i => codes.has(i.code))
    }
    result = [...result].sort((a, b) => {
      const av = a[sortField] ?? 0
      const bv = b[sortField] ?? 0
      return sortOrder === 'desc' ? bv - av : av - bv
    })
    return result
  }, [items, searchQuery, selectedIndex, sortField, sortOrder])

  const cols = showDrawdown ? 7 : 6
  const gridCls = showDrawdown
    ? 'grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]'
    : 'grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.7fr)]'

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0 pb-2">
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          {updatedAt ? (
            <span>上次筛选: {new Date(updatedAt).toLocaleString('zh-CN')}</span>
          ) : (
            <span className="text-ink-faint">尚未运行筛选</span>
          )}
          <span className="ml-auto">共 {filtered.length} 只{filtered.length !== total ? ` / ${total}` : ''}</span>
        </div>
      </CardHeader>

      <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-ink-faint" />
          <input
            className="w-full rounded-md border border-line bg-paper-2 py-1 pl-7 pr-2 text-xs"
            placeholder="搜索名称..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="w-20 rounded-md border border-line bg-paper-2 px-1 py-1 text-xs"
          value={selectedIndex}
          onChange={e => setSelectedIndex(e.target.value)}
        >
          <option value="">全部指数</option>
          {indices.map(idx => (
            <option key={idx.indexCode} value={idx.indexCode}>{idx.indexName}</option>
          ))}
        </select>
        <select
          className="w-16 rounded-md border border-line bg-paper-2 px-1 py-1 text-xs"
          value={sortField}
          onChange={e => setSortField(e.target.value as SortField)}
        >
          <option value="score">得分</option>
          <option value="netProfitYoY">净利同比</option>
          <option value="revenueYoY">营收同比</option>
        </select>
        <button
          className="rounded-md border border-line px-1.5 py-1 text-xs"
          onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
        >
          {sortOrder === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      <div className={`grid shrink-0 ${gridCls} gap-1 border-y border-line px-4 py-1 text-[10px] text-ink-faint`}>
        <span>代码</span><span>名称</span><span>行业</span><span>得分</span><span>命中信号</span>
        <span>净利同比</span>
        {showDrawdown && <span>距高回撤</span>}
      </div>

      <CardContent className="flex-1 overflow-y-auto p-0">
        {items.length === 0 && updatedAt === null ? (
          <div className="p-8 text-center text-sm text-ink-faint">
            尚未运行筛选，请点击左侧筛选后运行
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-faint">
            {searchQuery || selectedIndex ? '当前过滤条件无匹配结果' : '无候选股'}
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.code}
              className={`grid ${gridCls} gap-1 cursor-pointer border-b border-line/50 px-4 py-2 text-xs hover:bg-paper-2 ${
                selectedCode === item.code ? 'bg-accent/10' : ''
              }`}
              onClick={() => onSelectCode(item.code, item.name)}
            >
              <span className="font-mono truncate">{item.code}</span>
              <span className="truncate">{item.name}</span>
              <span className="truncate text-ink-soft">{item.industry}</span>
              <span className="font-semibold text-accent">{item.score.toFixed(1)}</span>
              <span className="flex flex-wrap gap-0.5 truncate">
                {item.signals.map(s => (
                  <span key={s} className="rounded bg-accent/10 px-1 text-[9px] text-accent">{SIGNAL_LABELS[s] || s}</span>
                ))}
                {item.extraSignals > 0 && <span className="text-ink-faint">+{item.extraSignals}</span>}
              </span>
              <span>{item.netProfitYoY}%</span>
              {showDrawdown && <span>{(item.drawdownFromHigh * 100).toFixed(1)}%</span>}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
