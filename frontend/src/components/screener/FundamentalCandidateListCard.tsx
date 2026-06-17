import { useState, useMemo } from 'react'
import type { ReactElement } from 'react'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SignalBadgeList } from './SignalBadge'
import { cn } from '@/lib/utils'
import type { Candidate, IndexInfo } from '@/types'

type SortField = 'score' | 'netProfitYoY' | 'revenueYoY' | 'drawdownFromHigh'
type SortOrder = 'asc' | 'desc'

const ALL_INDEX = '__all__'

function fmtPct(value: number): ReactElement {
  return (
    <span className={value >= 0 ? 'text-up' : 'text-down'}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
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
  loading,
}: {
  items: Candidate[]
  total: number
  updatedAt: string | null
  selectedCode: string | null
  onSelectCode: (code: string, name: string) => void
  indices: IndexInfo[]
  indexConstituentMap: Record<string, Set<string>>
  showDrawdown: boolean
  loading?: boolean
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const sortIcon = (field: SortField): ReactElement => {
    if (sortField !== field) return <ArrowUpDown className="size-3 text-ink-faint/50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="size-3 text-brand" />
    ) : (
      <ArrowDown className="size-3 text-brand" />
    )
  }

  const sortableTh = (field: SortField, label: string) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-2 pb-2 text-right font-medium hover:text-ink-soft"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label} {sortIcon(field)}
      </span>
    </th>
  )

  return (
    <Card className="relative flex max-h-full flex-col">
      <LoadingOverlay show={!!loading && items.length > 0} />
      <CardHeader className="shrink-0 flex-wrap gap-y-2 pb-2">
        <div className="flex items-baseline gap-3">
          <CardTitle>候选结果</CardTitle>
          <span className="text-[13px] text-ink-faint">
            {updatedAt ? `上次筛选: ${new Date(updatedAt).toLocaleString('zh-CN')}` : '尚未运行筛选'}
          </span>
          <span className="text-[13px] text-ink-faint">
            共 {filtered.length} 只{filtered.length !== total ? ` / ${total}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-40">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索代码/名称..."
              className="w-full rounded-lg border border-line-soft bg-paper-2/50 py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-faint/60 focus:border-brand focus:outline-none"
            />
          </div>
          <Select
            value={selectedIndex || ALL_INDEX}
            onValueChange={(v) => setSelectedIndex(v === ALL_INDEX ? '' : v)}
          >
            <SelectTrigger className="h-9 w-32 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_INDEX}>全部指数</SelectItem>
              {indices.map((idx) => (
                <SelectItem key={idx.indexCode} value={idx.indexCode}>{idx.indexName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto pt-2">
        {loading && items.length === 0 ? (
          <table className="w-full border-collapse">
            <tbody>
              {Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-t border-line-soft first:border-t-0">
                  <td className="px-2 py-2.5">
                    <Skeleton className="mb-1.5 h-3.5 w-20" />
                    <Skeleton className="h-2.5 w-14" />
                  </td>
                  <td className="px-2 py-2.5"><Skeleton className="h-3.5 w-12" /></td>
                  <td className="px-2 py-2.5"><Skeleton className="ml-auto h-4 w-10" /></td>
                  <td className="px-2 py-2.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                  <td className="px-2 py-2.5"><Skeleton className="ml-auto h-3.5 w-12" /></td>
                  <td className="px-2 py-2.5"><Skeleton className="ml-auto h-3.5 w-12" /></td>
                  {showDrawdown && <td className="px-2 py-2.5"><Skeleton className="ml-auto h-3.5 w-12" /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : items.length === 0 && updatedAt === null ? (
          <div className="p-8 text-center text-sm text-ink-faint">
            尚未运行筛选，请点击左侧筛选后运行
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-faint">
            {searchQuery || selectedIndex ? '当前过滤条件无匹配结果' : '无候选股'}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="sticky top-0 z-10 bg-paper text-left text-[11px] text-ink-faint">
                <th className="px-2 pb-1.5 font-medium">名称</th>
                <th className="px-2 pb-1.5 font-medium">行业</th>
                {sortableTh('score', '得分')}
                <th className="px-2 pb-1.5 font-medium">命中信号</th>
                {sortableTh('netProfitYoY', '净利同比')}
                {sortableTh('revenueYoY', '营收同比')}
                {showDrawdown && sortableTh('drawdownFromHigh', '距高回撤')}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const on = item.code === selectedCode
                return (
                  <tr
                    key={item.code}
                    onClick={() => onSelectCode(item.code, item.name)}
                    className={cn(
                      'cursor-pointer border-t border-line-soft transition-colors duration-200 hover:bg-paper-2/70',
                      on && 'bg-brand-soft',
                    )}
                  >
                    <td className="px-2 py-2 align-middle">
                      <div className="text-[13px] font-semibold text-ink">{item.name}</div>
                      <div className="tnum text-[11px] text-ink-faint">{item.code}</div>
                    </td>
                    <td className="px-2 py-2 align-middle text-[12px] text-ink-soft">{item.industry || '—'}</td>
                    <td className="tnum px-2 py-2 align-middle text-right text-[14px] font-bold text-ink">{item.score.toFixed(1)}</td>
                    <td className="px-2 py-2 align-middle">
                      <SignalBadgeList signals={item.signals} />
                    </td>
                    <td className="tnum px-2 py-2 align-middle text-right text-[12px]">{fmtPct(item.netProfitYoY)}</td>
                    <td className="tnum px-2 py-2 align-middle text-right text-[12px]">{fmtPct(item.revenueYoY)}</td>
                    {showDrawdown && (
                      <td className="tnum px-2 py-2 align-middle text-right text-[12px] text-down">
                        {(item.drawdownFromHigh * 100).toFixed(1)}%
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
