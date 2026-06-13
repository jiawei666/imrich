import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, PackageOpen, RefreshCw, X, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { StockListItem, StockSortField, SortOrder, StockSearchItem, TechnicalCandidate, ScreenSnapshotMeta } from '@/types'

const PAGE_SIZE = 30

/** 三种模式下表格行的最小公共字段，用于滚动加载与键盘导航的统一处理 */
interface ListRow {
  code: string
  name: string
}

function fmtCap(cap: number | null): string {
  if (cap == null) return '—'
  if (cap >= 10000) return `${(cap / 10000).toFixed(2)} 万亿`
  return `${cap.toFixed(1)} 亿`
}

interface StockListCardProps {
  /** 筛选结果（有值→筛选模式，空→全市场模式） */
  screenedData?: TechnicalCandidate[]
  /** 当前选中的股票代码 */
  selectedCode?: string
  /** 点击行回调（code, name） */
  onSelectCode?: (code: string, name: string) => void
  /** 清除筛选回调 */
  onClearScreen?: () => void
  /** 首次加载完成回调（code, name） */
  onFirstLoad?: (code: string, name: string) => void
  /** 历史快照日期列表 */
  historyList?: ScreenSnapshotMeta[]
  /** 当前选中的历史日期 */
  selectedHistoryDate?: string
  /** 选择历史日期回调 */
  onSelectHistoryDate?: (date: string) => void
}

export function StockListCard({
  screenedData,
  selectedCode,
  onSelectCode,
  onClearScreen,
  onFirstLoad,
  historyList,
  selectedHistoryDate,
  onSelectHistoryDate,
}: StockListCardProps) {
  const isScreened = screenedData !== undefined
  const candidates = screenedData ?? []

  // ---- 全市场模式 state ----
  const [data, setData] = useState<StockListItem[]>([])
  const [total, setTotal] = useState(0)
  const [nextPage, setNextPage] = useState(1)
  const [sortBy, setSortBy] = useState<StockSortField>('code')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- 搜索 ----
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StockSearchItem[] | null>(null)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchNextPage, setSearchNextPage] = useState(1)
  const [searching, setSearching] = useState(false)
  const [searchLoadingMore, setSearchLoadingMore] = useState(false)

  // ---- 筛选模式：本地分批展示 ----
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // 重新筛选后重置展示数量
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [screenedData])

  // 搜索关键词变化（防抖）→ 重新查询第一页
  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults(null)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.searchStocks(query, 1, PAGE_SIZE)
        setSearchResults(res.data)
        setSearchTotal(res.total)
        setSearchNextPage(2)
      } catch {
        setSearchResults([])
        setSearchTotal(0)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const loadMoreSearch = useCallback(async () => {
    if (searchLoadingMore || searching || !searchResults || searchResults.length >= searchTotal) return
    const query = searchQuery.trim()
    if (!query) return
    setSearchLoadingMore(true)
    try {
      const res = await api.searchStocks(query, searchNextPage, PAGE_SIZE)
      if (res.data.length === 0) {
        setSearchTotal(searchResults.length)
      } else {
        setSearchResults((prev) => [...(prev ?? []), ...res.data])
        setSearchNextPage((p) => p + 1)
      }
    } catch {
      // 忽略，下次滚动会重试
    } finally {
      setSearchLoadingMore(false)
    }
  }, [searchLoadingMore, searching, searchResults, searchTotal, searchQuery, searchNextPage])

  // ---- 全市场模式：首批加载（初始 / 排序变化） ----
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.stockList({ page: 1, pageSize: PAGE_SIZE, sortBy, sortOrder })
      setData(res.data)
      setTotal(res.total)
      setNextPage(2)
    } catch {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }, [sortBy, sortOrder])

  useEffect(() => {
    if (!isScreened) fetchData()
  }, [fetchData, isScreened])

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || data.length >= total) return
    setLoadingMore(true)
    try {
      const res = await api.stockList({ page: nextPage, pageSize: PAGE_SIZE, sortBy, sortOrder })
      if (res.data.length === 0) {
        setTotal(data.length)
      } else {
        setData((prev) => [...prev, ...res.data])
        setNextPage((p) => p + 1)
      }
    } catch {
      // 忽略，下次滚动会重试
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, loading, data, total, nextPage, sortBy, sortOrder])

  // 全市场模式首次加载完成 → 自动选中第一只并回调
  const firstLoadRef = useRef(false)
  useEffect(() => {
    if (!isScreened && !firstLoadRef.current && data.length > 0) {
      firstLoadRef.current = true
      onFirstLoad?.(data[0].code, data[0].name)
    }
  }, [isScreened, data, onFirstLoad])

  const handleSort = (col: StockSortField) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortOrder('asc')
    }
  }

  const sortIcon = (col: StockSortField) => {
    if (sortBy !== col) return <ArrowUpDown className="size-3 text-ink-faint/50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="size-3 text-brand" />
    ) : (
      <ArrowDown className="size-3 text-brand" />
    )
  }

  // ---- 当前模式下已渲染的数组 / 加载状态（供滚动加载与键盘导航统一处理）----
  const visibleCandidates = candidates.slice(0, visibleCount)
  const currentList: ListRow[] = searchResults !== null
    ? searchResults
    : isScreened ? visibleCandidates : data
  const currentHasMore = searchResults !== null
    ? searchResults.length < searchTotal
    : isScreened ? visibleCount < candidates.length : data.length < total
  const currentLoadingMore = searchResults !== null ? searchLoadingMore : loadingMore

  const loadMoreCurrent = useCallback(() => {
    if (searchResults !== null) {
      loadMoreSearch()
    } else if (isScreened) {
      setVisibleCount((v) => v + PAGE_SIZE)
    } else {
      loadMore()
    }
  }, [searchResults, isScreened, loadMoreSearch, loadMore])

  // ---- 滚动容器 + 滚动到底自动加载下一批 ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(loadMoreCurrent)
  useEffect(() => {
    loadMoreRef.current = loadMoreCurrent
  }, [loadMoreCurrent])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current()
      },
      { root, threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // ---- 行选中 + 键盘上下键导航 ----
  const activeCode = selectedCode
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const pendingSelectIndexRef = useRef<number | null>(null)

  const registerRow = (code: string) => (el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(code, el)
    else rowRefs.current.delete(code)
  }

  const selectRow = useCallback((row: ListRow) => {
    onSelectCode?.(row.code, row.name)
    requestAnimationFrame(() => {
      rowRefs.current.get(row.code)?.scrollIntoView({ block: 'nearest' })
    })
  }, [onSelectCode])

  const handleRowClick = (code: string, name: string) => {
    onSelectCode?.(code, name)
    scrollRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (currentList.length === 0) return
    e.preventDefault()
    const idx = currentList.findIndex((x) => x.code === activeCode)
    if (e.key === 'ArrowDown') {
      if (idx === -1) {
        selectRow(currentList[0])
      } else if (idx < currentList.length - 1) {
        selectRow(currentList[idx + 1])
      } else if (currentHasMore) {
        pendingSelectIndexRef.current = currentList.length
        loadMoreCurrent()
      }
    } else {
      if (idx === -1) {
        selectRow(currentList[0])
      } else if (idx > 0) {
        selectRow(currentList[idx - 1])
      }
    }
  }

  // 加载下一批到达后，选中此前等待的那一条
  useEffect(() => {
    const idx = pendingSelectIndexRef.current
    if (idx !== null && currentList.length > idx) {
      pendingSelectIndexRef.current = null
      selectRow(currentList[idx])
    }
  }, [currentList, selectRow])

  const title = isScreened ? '筛选结果' : '股票列表'
  const subtitle = isScreened
    ? `共 ${candidates.length.toLocaleString()} 只`
    : `共 ${total.toLocaleString()} 只`

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <CardTitle>{title}</CardTitle>
          <span className="text-[13px] text-ink-faint">{subtitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 搜索框 */}
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
          {isScreened && historyList && historyList.length > 0 && (
            <select
              value={selectedHistoryDate ?? ''}
              onChange={(e) => onSelectHistoryDate?.(e.target.value)}
              className="rounded-lg border border-line-soft bg-paper-2/50 px-2 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              {historyList.map((h) => (
                <option key={h.date} value={h.date}>
                  {h.date}（{h.count}只）
                </option>
              ))}
            </select>
          )}
          {isScreened && onClearScreen && (
            <Button variant="outline" size="sm" onClick={onClearScreen}>
              <X className="size-3" />
              清除筛选
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <div
          ref={scrollRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="max-h-[calc(100vh-220px)] overflow-y-auto overflow-x-auto rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          {/* ---- 搜索模式 ---- */}
          {searchResults !== null && (
            <>
              {searching && searchResults.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-sm text-ink-faint">搜索中...</div>
              ) : searchResults.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-sm text-ink-faint">无匹配结果</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-paper text-left text-xs text-ink-faint">
                      <th className="px-2 pb-2 font-medium">代码</th>
                      <th className="px-2 pb-2 font-medium">名称</th>
                      <th className="px-2 pb-2 text-right font-medium">收盘价</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((s) => {
                      const on = s.code === activeCode
                      return (
                        <tr
                          key={s.code}
                          ref={registerRow(s.code)}
                          onClick={() => handleRowClick(s.code, s.name)}
                          className={cn(
                            'cursor-pointer border-t border-line-soft transition-colors duration-200 hover:bg-paper-2/70',
                            on && 'bg-brand-soft',
                          )}
                        >
                          <td className="tnum px-2 py-2.5 text-[13px] text-ink-soft">{s.code}</td>
                          <td className="px-2 py-2.5 text-sm font-semibold text-ink">{s.name}</td>
                          <td className="tnum px-2 py-2.5 text-right text-sm text-ink">
                            {s.close != null ? s.close.toFixed(2) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* ---- 全市场模式 ---- */}
          {searchResults === null && !isScreened && (
            <>
              {loading && data.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-sm text-ink-faint">
                  加载中...
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <span className="text-sm text-red-500">{error}</span>
                  <Button variant="outline" size="sm" onClick={fetchData}>
                    <RefreshCw className="size-3" />
                    重试
                  </Button>
                </div>
              ) : data.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-10 text-center">
                  <PackageOpen className="size-7 text-ink-faint/60" strokeWidth={1.5} />
                  <span className="text-sm text-ink-soft">暂无股票数据</span>
                  <span className="text-xs text-ink-faint">请先执行行情刷新以加载股票列表</span>
                </div>
              ) : (
                <MarketTable
                  data={data}
                  loading={loading}
                  sortIcon={sortIcon}
                  onSort={handleSort}
                  activeCode={activeCode}
                  onRowClick={handleRowClick}
                  registerRow={registerRow}
                />
              )}
            </>
          )}

          {/* ---- 筛选结果模式 ---- */}
          {searchResults === null && isScreened && (
            <>
              {visibleCandidates.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-10 text-center">
                  <PackageOpen className="size-7 text-ink-faint/60" strokeWidth={1.5} />
                  <span className="text-sm text-ink-soft">暂无筛选结果</span>
                  <span className="text-xs text-ink-faint">调整参数后重新运行筛选</span>
                </div>
              ) : (
                <ScreenedTable
                  data={visibleCandidates}
                  activeCode={activeCode}
                  onRowClick={handleRowClick}
                  registerRow={registerRow}
                />
              )}
            </>
          )}

          {/* ---- 滚动加载提示 + 哨兵 ---- */}
          {currentLoadingMore && (
            <div className="flex items-center justify-center gap-1.5 py-3 text-xs text-ink-faint">
              <Loader2 className="size-3 animate-spin" />
              加载中...
            </div>
          )}
          <div ref={sentinelRef} className="h-px" />
        </div>
      </CardContent>
    </Card>
  )
}

// ---- 全市场表格 ----
function MarketTable({
  data,
  loading,
  sortIcon,
  onSort,
  activeCode,
  onRowClick,
  registerRow,
}: {
  data: StockListItem[]
  loading: boolean
  sortIcon: (col: StockSortField) => ReactElement
  onSort: (col: StockSortField) => void
  activeCode?: string
  onRowClick?: (code: string, name: string) => void
  registerRow: (code: string) => (el: HTMLTableRowElement | null) => void
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="sticky top-0 z-10 bg-paper text-left text-xs text-ink-faint">
          <th
            className="cursor-pointer select-none px-2 pb-2 font-medium hover:text-ink-soft"
            onClick={() => onSort('code')}
          >
            <span className="inline-flex items-center gap-1">
              代码 {sortIcon('code')}
            </span>
          </th>
          <th
            className="cursor-pointer select-none px-2 pb-2 font-medium hover:text-ink-soft"
            onClick={() => onSort('name')}
          >
            <span className="inline-flex items-center gap-1">
              名称 {sortIcon('name')}
            </span>
          </th>
          <th className="px-2 pb-2 font-medium">行业</th>
          <th
            className="cursor-pointer select-none px-2 pb-2 text-right font-medium hover:text-ink-soft"
            onClick={() => onSort('market_cap')}
          >
            <span className="inline-flex items-center gap-1">
              市值 {sortIcon('market_cap')}
            </span>
          </th>
          <th className="px-2 pb-2 text-right font-medium">收盘价</th>
          <th className="px-2 pb-2 text-right font-medium">涨跌幅</th>
        </tr>
      </thead>
      <tbody>
        {data.map((s) => {
          const on = s.code === activeCode
          return (
            <tr
              key={s.code}
              ref={registerRow(s.code)}
              onClick={onRowClick ? () => onRowClick(s.code, s.name) : undefined}
              className={cn(
                'border-t border-line-soft transition-colors duration-200 hover:bg-paper-2/70',
                on && 'bg-brand-soft',
                onRowClick && 'cursor-pointer',
                loading && 'opacity-50',
              )}
            >
              <td className="tnum px-2 py-2.5 text-[13px] text-ink-soft">
                {s.code}
              </td>
              <td className="px-2 py-2.5 text-sm font-semibold text-ink">
                {s.name}
              </td>
              <td className="px-2 py-2.5 text-[13px] text-ink-soft">
                {s.industry || '—'}
              </td>
              <td className="tnum px-2 py-2.5 text-right text-[13px] text-ink-soft">
                {fmtCap(s.market_cap)}
              </td>
              <td className="tnum px-2 py-2.5 text-right text-sm text-ink">
                {s.close != null ? s.close.toFixed(2) : '—'}
              </td>
              <td className="tnum px-2 py-2.5 text-right text-[13px]">
                {s.pct_chg != null ? (
                  <span className={s.pct_chg >= 0 ? 'text-up' : 'text-down'}>
                    {s.pct_chg >= 0 ? '+' : ''}{s.pct_chg.toFixed(2)}%
                  </span>
                ) : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---- 筛选结果表格 ----
function ScreenedTable({
  data,
  activeCode,
  onRowClick,
  registerRow,
}: {
  data: TechnicalCandidate[]
  activeCode?: string
  onRowClick?: (code: string, name: string) => void
  registerRow: (code: string) => (el: HTMLTableRowElement | null) => void
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="sticky top-0 z-10 bg-paper text-left text-xs text-ink-faint">
          <th className="px-2 pb-2 font-medium">代码</th>
          <th className="px-2 pb-2 font-medium">名称</th>
          <th className="px-2 pb-2 font-medium">行业</th>
          <th className="px-2 pb-2 text-right font-medium">收盘价</th>
          <th className="px-2 pb-2 text-right font-medium">涨跌幅</th>
        </tr>
      </thead>
      <tbody>
        {data.map((c) => {
          const on = c.code === activeCode
          return (
            <tr
              key={c.code}
              ref={registerRow(c.code)}
              onClick={onRowClick ? () => onRowClick(c.code, c.name) : undefined}
              className={cn(
                'border-t border-line-soft transition-colors duration-200 hover:bg-paper-2/70',
                on && 'bg-brand-soft',
                onRowClick && 'cursor-pointer',
              )}
            >
              <td className="tnum px-2 py-2.5 text-[13px] text-ink-soft">
                {c.code}
              </td>
              <td className="px-2 py-2.5 text-sm font-semibold text-ink">
                {c.name}
              </td>
              <td className="px-2 py-2.5 text-[13px] text-ink-soft">
                {c.industry || '—'}
              </td>
              <td className="tnum px-2 py-2.5 text-right text-sm text-ink">
                {c.close}
              </td>
              <td className="tnum px-2 py-2.5 text-right text-[13px]">
                <span className={cn(c.pctChg >= 0 ? 'text-up' : 'text-down')}>
                  {c.pctChg >= 0 ? '+' : ''}{c.pctChg}%
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
