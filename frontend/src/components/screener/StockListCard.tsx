import { useCallback, useEffect, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, PackageOpen, RefreshCw, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { StockListItem, StockSortField, SortOrder, TechnicalCandidate } from '@/types'

const PAGE_SIZE = 10

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
  /** 点击行回调 */
  onSelectCode?: (code: string) => void
  /** 清除筛选回调 */
  onClearScreen?: () => void
}

export function StockListCard({
  screenedData,
  selectedCode,
  onSelectCode,
  onClearScreen,
}: StockListCardProps) {
  const isScreened = screenedData !== undefined && screenedData.length >= 0

  // ---- 全市场模式 state ----
  const [data, setData] = useState<StockListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<StockSortField>('code')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ---- 筛选模式 state ----
  const [screenedPage, setScreenedPage] = useState(1)

  // 切换模式时重置分页
  useEffect(() => {
    if (isScreened) {
      setScreenedPage(1)
    }
  }, [isScreened])

  // ---- 全市场模式：服务端分页 ----
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.stockList({ page, pageSize: PAGE_SIZE, sortBy, sortOrder })
      if (res.data.length === 0 && res.total > 0) {
        const lastPage = Math.ceil(res.total / PAGE_SIZE)
        setPage(lastPage)
        return
      }
      setData(res.data)
      setTotal(res.total)
    } catch {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, sortBy, sortOrder])

  useEffect(() => {
    if (!isScreened) fetchData()
  }, [fetchData, isScreened])

  const handleSort = (col: StockSortField) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const sortIcon = (col: StockSortField) => {
    if (sortBy !== col) return <ArrowUpDown className="size-3 text-ink-faint/50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="size-3 text-brand" />
    ) : (
      <ArrowDown className="size-3 text-brand" />
    )
  }

  // ---- 筛选模式：前端分页 ----
  const candidates = screenedData ?? []
  const screenedTotal = candidates.length
  const screenedTotalPages = Math.ceil(screenedTotal / PAGE_SIZE)
  const screenedPageData = candidates.slice(
    (screenedPage - 1) * PAGE_SIZE,
    screenedPage * PAGE_SIZE,
  )

  // ---- 统一表格行渲染 ----
  const activeCode = selectedCode
  const handleRowClick = (code: string) => {
    onSelectCode?.(code)
  }

  const title = isScreened ? '筛选结果' : '股票列表'
  const subtitle = isScreened
    ? `共 ${screenedTotal.toLocaleString()} 只`
    : `共 ${total.toLocaleString()} 只`

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <CardTitle>{title}</CardTitle>
          <span className="text-[13px] text-ink-faint">{subtitle}</span>
        </div>
        {isScreened && onClearScreen && (
          <Button variant="outline" size="sm" onClick={onClearScreen}>
            <X className="size-3" />
            清除筛选
          </Button>
        )}
      </CardHeader>

      <CardContent className="pt-2">
        {/* ---- 全市场模式加载/错误/空状态 ---- */}
        {!isScreened && (
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
              />
            )}
          </>
        )}

        {/* ---- 筛选模式 ---- */}
        {isScreened && (
          <>
            {screenedPageData.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-10 text-center">
                <PackageOpen className="size-7 text-ink-faint/60" strokeWidth={1.5} />
                <span className="text-sm text-ink-soft">暂无筛选结果</span>
                <span className="text-xs text-ink-faint">调整参数后重新运行筛选</span>
              </div>
            ) : (
              <ScreenedTable
                data={screenedPageData}
                activeCode={activeCode}
                onRowClick={handleRowClick}
              />
            )}
          </>
        )}

        {/* 分页 */}
        {!isScreened && data.length > 0 && (
          <Pagination
            page={page}
            totalPages={Math.ceil(total / PAGE_SIZE)}
            totalCount={total}
            onPageChange={setPage}
          />
        )}
        {isScreened && screenedTotalPages > 1 && (
          <Pagination
            page={screenedPage}
            totalPages={screenedTotalPages}
            totalCount={screenedTotal}
            onPageChange={setScreenedPage}
          />
        )}
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
}: {
  data: StockListItem[]
  loading: boolean
  sortIcon: (col: StockSortField) => JSX.Element
  onSort: (col: StockSortField) => void
  activeCode?: string
  onRowClick?: (code: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-xs text-ink-faint">
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
            <th className="px-2 pb-2 font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => {
            const on = s.code === activeCode
            return (
              <tr
                key={s.code}
                onClick={onRowClick ? () => onRowClick(s.code) : undefined}
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
                <td className="px-2 py-2.5">
                  {s.is_st && (
                    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 bg-red-50">
                      ST
                    </span>
                  )}
                  {s.is_bj && (
                    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 bg-amber-50">
                      北交所
                    </span>
                  )}
                  {!s.is_st && !s.is_bj && (
                    <span className="text-[11px] text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- 筛选结果表格 ----
function ScreenedTable({
  data,
  activeCode,
  onRowClick,
}: {
  data: TechnicalCandidate[]
  activeCode?: string
  onRowClick?: (code: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-xs text-ink-faint">
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
                onClick={onRowClick ? () => onRowClick(c.code) : undefined}
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
    </div>
  )
}
