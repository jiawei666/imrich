import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Wordmark } from './Logo'

export function TopBar({
  updatedAt,
  onRefreshKline,
  onRefreshFundamental,
}: {
  updatedAt: string
  onRefreshKline: (reloadStockList: boolean) => void
  onRefreshFundamental: () => void
}) {
  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center gap-6 border-b border-line bg-cream/80 px-6 backdrop-blur">
      <Wordmark className="h-9 w-auto" />

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[13px] text-ink-soft">
          数据更新于 <span className="tnum">{updatedAt}</span>
        </span>

        {/* 刷新行情 — hover 展开选项 */}
        <div className="group relative">
          <Button
            variant="outline"
            size="sm"
            title="更新K线数据（日/周/月/季），建议每日收盘后执行"
          >
            <RotateCw className="size-3.5" />
            刷新行情
          </Button>
          <div className="pointer-events-none absolute right-0 top-full z-50 pt-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            <div className="w-52 rounded-xl border border-line bg-paper shadow-lg">
              <button
                onClick={() => onRefreshKline(true)}
                className="flex w-full flex-col px-4 py-2.5 text-left text-sm transition-colors hover:bg-paper-2 rounded-t-xl"
              >
                <span className="font-medium text-ink">完整刷新</span>
                <span className="text-[11px] text-ink-soft">重新拉取股票列表 + K线</span>
              </button>
              <div className="mx-3 border-t border-line-soft" />
              <button
                onClick={() => onRefreshKline(false)}
                className="flex w-full flex-col px-4 py-2.5 text-left text-sm transition-colors hover:bg-paper-2 rounded-b-xl"
              >
                <span className="font-medium text-ink">仅刷新K线</span>
                <span className="text-[11px] text-ink-soft">跳过股票列表，更快</span>
              </button>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshFundamental}
          title="更新财报、业绩预告快报、行业指数与研报数据，财报季前后建议执行"
        >
          <RotateCw className="size-3.5" />
          刷新基本面
        </Button>
      </div>
    </header>
  )
}
