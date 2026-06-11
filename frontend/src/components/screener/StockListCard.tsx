import { useCallback, useEffect, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, PackageOpen, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { api } from '@/lib/api'
import type { StockListItem, StockSortField, SortOrder } from '@/types'

const PAGE_SIZE = 20

function fmtCap(cap: number | null): string {
  if (cap == null) return '—'
  if (cap >= 10000) return `${(cap / 10000).toFixed(2)} 万亿`
  return `${cap.toFixed(1)} 亿`
}

export function StockListCard() {
  const [data, setData] = useState<StockListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<StockSortField>('code')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.stockList({ page, pageSize: PAGE_SIZE, sortBy, sortOrder })
      if (res.data.length === 0 && res.total > 0) {
        // 当前页超出范围，回到最后一页
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
    fetchData()
  }, [fetchData])

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

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <CardTitle>股票列表</CardTitle>
          <span className="text-[13px] text-ink-faint">共 {total.toLocaleString()} 只</span>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
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
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-xs text-ink-faint">
                    <th
                      className="cursor-pointer select-none px-2 pb-2 font-medium hover:text-ink-soft"
                      onClick={() => handleSort('code')}
                    >
                      <span className="inline-flex items-center gap-1">
                        代码 {sortIcon('code')}
                      </span>
                    </th>
                    <th
                      className="cursor-pointer select-none px-2 pb-2 font-medium hover:text-ink-soft"
                      onClick={() => handleSort('name')}
                    >
                      <span className="inline-flex items-center gap-1">
                        名称 {sortIcon('name')}
                      </span>
                    </th>
                    <th className="px-2 pb-2 font-medium">行业</th>
                    <th
                      className="cursor-pointer select-none px-2 pb-2 text-right font-medium hover:text-ink-soft"
                      onClick={() => handleSort('market_cap')}
                    >
                      <span className="inline-flex items-center gap-1">
                        市值 {sortIcon('market_cap')}
                      </span>
                    </th>
                    <th className="px-2 pb-2 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((s, i) => (
                    <tr
                      key={s.code}
                      className={`border-t border-line-soft transition-colors duration-200 hover:bg-paper-2/70 ${
                        loading ? 'opacity-50' : ''
                      }`}
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
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={total}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
