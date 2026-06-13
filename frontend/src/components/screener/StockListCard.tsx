import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, PackageOpen, RefreshCw, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { StockRow, StockSortField, SortOrder, ScreenSnapshotMeta } from '@/types'

interface ListRow {
  code: string
  name: string
}

function fmtCap(cap: number | null): string {
  if (cap == null) return '—'
  if (cap >= 10000) return `${(cap / 10000).toFixed(2)} 万亿`
  return `${cap.toFixed(1)} 亿`
}

function fmtPctChg(pctChg: number | null): ReactElement | string {
  if (pctChg == null) return '—'
  return (
    <span className={pctChg >= 0 ? 'text-up' : 'text-down'}>
      {pctChg >= 0 ? '+' : ''}{pctChg.toFixed(2)}%
    </span>
  )
}

function fmtClose(close: number | null): string {
  if (close == null) return '—'
  return close.toFixed(2)
}

interface StockListCardProps {
  /** 统一的股票行数据 */
  data: StockRow[]
  /** 数据总数（用于标题展示） */
  total: number
  /** 加载中 */
  loading?: boolean
  /** 加载更多中 */
  loadingMore?: boolean
  /** 当前选中的股票代码 */
  selectedCode?: string
  /** 点击行回调 */
  onSelectCode?: (code: string, name: string) => void
  /** 搜索回调 */
  onSearch?: (q: string) => void
  /** 加载更多回调（分页） */
  onLoadMore?: () => void
  /** 排序回调 */
  onSort?: (sortBy: StockSortField, sortOrder: SortOrder) => void
  /** 当前排序字段 */
  sortBy?: StockSortField
  /** 当前排序方向 */
  sortOrder?: SortOrder
  /** 是否显示排序（全市场模式） */
  showSort?: boolean
  /** 是否显示分页加载更多 */
  hasMore?: boolean
  /** 历史快照日期列表 */
  historyList?: ScreenSnapshotMeta[]
  /** 当前选中的历史日期 */
  selectedHistoryDate?: string
  /** 选择历史日期回调 */
  onSelectHistoryDate?: (date: string) => void
  /** 清除历史选择回调 */
  onClearHistory?: () => void
  /** 错误信息 */
  error?: string | null
  /** 重试回调 */
  onRetry?: () => void
}

export function StockListCard({
  data,
  total,
  loading = false,
  loadingMore = false,
  selectedCode,
  onSelectCode,
  onSearch,
  onLoadMore,
  onSort,
  sortBy = 'code',
  sortOrder = 'asc',
  showSort = false,
  hasMore = false,
  historyList,
  selectedHistoryDate,
  onSelectHistoryDate,
  onClearHistory,
  error,
  onRetry,
}: StockListCardProps) {
  // ---- 搜索 ----
  const [searchQuery, setSearchQuery] = useState('')

  // 搜索关键词变化（防抖）→ 通知父组件
  useEffect(() => {
    const query = searchQuery.trim()
    const timer = setTimeout(() => {
      onSearch?.(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, onSearch])

  // ---- 排序 ----
  const handleSort = (col: StockSortField) => {
    if (!onSort) return
    if (sortBy === col) {
      onSort(col, sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(col, 'asc')
    }
  }

  const sortIcon = (col: StockSortField): ReactElement => {
    if (sortBy !== col) return <ArrowUpDown className="size-3 text-ink-faint/50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="size-3 text-brand" />
    ) : (
      <ArrowDown className="size-3 text-brand" />
    )
  }

  // ---- 滚动容器 + 滚动到底自动加载 ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(onLoadMore)
  useEffect(() => { loadMoreRef.current = onLoadMore }, [onLoadMore])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore) loadMoreRef.current?.()
      },
      { root, threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore])

  // ---- 行选中 + 键盘导航 ----
  const activeCode = selectedCode
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

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
    if (data.length === 0) return
    e.preventDefault()
    const idx = data.findIndex((x) => x.code === activeCode)
    if (e.key === 'ArrowDown') {
      if (idx === -1) {
        selectRow(data[0])
      } else if (idx < data.length - 1) {
        selectRow(data[idx + 1])
      }
    } else {
      if (idx === -1) {
        selectRow(data[0])
      } else if (idx > 0) {
        selectRow(data[idx - 1])
      }
    }
  }

  const title = '股票列表'
  const subtitle = `共 ${total.toLocaleString()} 只`

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
          {/* 历史下拉框 — 有历史数据时始终可见 */}
          {historyList && historyList.length > 0 && (
            <select
              value={selectedHistoryDate ?? ''}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') {
                  onClearHistory?.()
                } else {
                  onSelectHistoryDate?.(v)
                }
              }}
              className="rounded-lg border border-line-soft bg-paper-2/50 px-2 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              <option value="">全部股票</option>
              {historyList.map((h) => (
                <option key={h.date} value={h.date}>
                  {h.date}（{h.count}只）
                </option>
              ))}
            </select>
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
          {loading && data.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-ink-faint">
              加载中...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <span className="text-sm text-red-500">{error}</span>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="size-3" />
                  重试
                </Button>
              )}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <PackageOpen className="size-7 text-ink-faint/60" strokeWidth={1.5} />
              <span className="text-sm text-ink-soft">暂无数据</span>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-paper text-left text-xs text-ink-faint">
                  <th
                    className={cn(
                      'px-2 pb-2 font-medium',
                      showSort && 'cursor-pointer select-none hover:text-ink-soft',
                    )}
                    onClick={showSort ? () => handleSort('code') : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      代码 {showSort && sortIcon('code')}
                    </span>
                  </th>
                  <th
                    className={cn(
                      'px-2 pb-2 font-medium',
                      showSort && 'cursor-pointer select-none hover:text-ink-soft',
                    )}
                    onClick={showSort ? () => handleSort('name') : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      名称 {showSort && sortIcon('name')}
                    </span>
                  </th>
                  <th className="px-2 pb-2 font-medium">行业</th>
                  <th
                    className={cn(
                      'px-2 pb-2 text-right font-medium',
                      showSort && 'cursor-pointer select-none hover:text-ink-soft',
                    )}
                    onClick={showSort ? () => handleSort('market_cap') : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      市值 {showSort && sortIcon('market_cap')}
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
                      onClick={() => handleRowClick(s.code, s.name)}
                      className={cn(
                        'cursor-pointer border-t border-line-soft transition-colors duration-200 hover:bg-paper-2/70',
                        on && 'bg-brand-soft',
                      )}
                    >
                      <td className="tnum px-2 py-2.5 text-[13px] text-ink-soft">{s.code}</td>
                      <td className="px-2 py-2.5 text-sm font-semibold text-ink">{s.name}</td>
                      <td className="px-2 py-2.5 text-[13px] text-ink-soft">{s.industry || '—'}</td>
                      <td className="tnum px-2 py-2.5 text-right text-[13px] text-ink-soft">{fmtCap(s.market_cap)}</td>
                      <td className="tnum px-2 py-2.5 text-right text-sm text-ink">{fmtClose(s.close)}</td>
                      <td className="tnum px-2 py-2.5 text-right text-[13px]">{fmtPctChg(s.pct_chg)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* 加载更多提示 + 哨兵 */}
          {loadingMore && (
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
