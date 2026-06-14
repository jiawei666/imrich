import { PackageOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SignalBadgeList } from './SignalBadge'
import { pct } from '@/lib/utils'
import type { Candidate } from '@/types'

export function CandidateResults({
  candidates,
  selectedCode,
  onSelect,
}: {
  candidates: Candidate[]
  selectedCode?: string
  onSelect: (code: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline gap-3">
          <CardTitle>候选结果</CardTitle>
          <span className="text-[13px] text-ink-faint">
            共 {candidates.length} 只股票
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-faint">排序</span>
          <Select defaultValue="score">
            <SelectTrigger className="h-8 w-[160px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">综合得分从高到低</SelectItem>
              <SelectItem value="gain">区间涨幅从高到低</SelectItem>
              <SelectItem value="growth">业绩增速从高到低</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-ink-faint">
              <th className="px-2 pb-2 font-medium">代码</th>
              <th className="px-2 pb-2 font-medium">名称</th>
              <th className="px-2 pb-2 font-medium">行业</th>
              <th className="px-2 pb-2 font-medium">综合得分</th>
              <th className="px-2 pb-2 font-medium">命中信号（命中数）</th>
              <th className="px-2 pb-2 font-medium">财务指标（最新季度）</th>
              <th className="px-2 pb-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const on = c.code === selectedCode
              return (
                <tr
                  key={c.code}
                  onClick={() => onSelect(c.code)}
                  className={`group cursor-pointer border-t border-line-soft transition-colors duration-200 ${
                    on ? 'bg-brand-soft/40' : 'hover:bg-paper-2/70'
                  }`}
                >
                  <td className="tnum px-2 py-3 text-[13px] text-ink-soft">
                    {c.code}
                  </td>
                  <td className="px-2 py-3 text-sm font-semibold text-ink">
                    {c.name}
                  </td>
                  <td className="px-2 py-3 text-[13px] text-ink-soft">
                    {c.industry}
                  </td>
                  <td className="tnum px-2 py-3 text-[15px] font-bold text-ink">
                    {c.score.toFixed(1)}
                  </td>
                  <td className="px-2 py-3">
                    <SignalBadgeList signals={c.signals} />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-0.5 text-[12px]">
                      <span className="text-ink-soft">
                        净利润同比{' '}
                        <span className="tnum font-medium text-up">
                          {pct(c.netProfitYoY)}
                        </span>
                      </span>
                      <span className="text-ink-soft">
                        营收同比{' '}
                        <span className="tnum font-medium text-up">
                          {pct(c.revenueYoY)}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(c.code)
                      }}
                    >
                      查看详情
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <PackageOpen className="size-7 text-ink-faint/60" strokeWidth={1.5} />
          <span className="text-sm text-ink-soft">暂无更多数据</span>
          <span className="text-xs text-ink-faint">
            尝试调整筛选条件以获得更多结果
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
