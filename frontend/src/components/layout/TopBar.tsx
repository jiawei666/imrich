import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Wordmark } from './Logo'

export function TopBar({
  updatedAt,
  onRefreshKline,
  onRefreshFundamental,
}: {
  updatedAt: string
  onRefreshKline: () => void
  onRefreshFundamental: () => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-line bg-cream/80 px-6 backdrop-blur">
      <Wordmark className="h-9 w-auto" />

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[13px] text-ink-soft">
          数据更新于 <span className="tnum">{updatedAt}</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshKline}
          title="更新股票列表与全市场K线数据（日/周/月/季），建议每日收盘后执行"
        >
          <RotateCw className="size-3.5" />
          刷新行情
        </Button>
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
