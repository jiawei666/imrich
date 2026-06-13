import { ArrowLeft, Star, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatCards } from './StatCards'
import { ProfitRevenueChart } from './ProfitRevenueChart'
import { PriceChart } from './PriceChart'
import { ResearchReports } from './ResearchReports'
import { RiskChecklist } from './RiskChecklist'
import type { StockDetail, Candidate, SignalKey } from '@/types'

const SIGNAL_LABELS: Record<SignalKey, string> = {
  highGrowth: '业绩大增', newHigh: '创新高', beatExpect: '超预期',
  sectorEffect: '板块效应', industryNewHigh: '行业指数新高', alpha: 'α地位',
  orderFull: '订单饱满', capexExpand: '产能扩张', newProduct: '新产品',
  domesticSub: '国产替代', industryRecover: '行业复苏', valuationRepair: '估值修复',
  oversold: '低位超跌',
}

export function StockDetailPanel({
  detail,
  candidate,
  onClose,
}: {
  detail: StockDetail
  candidate?: Candidate | null
  onClose: () => void
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
        <button
          onClick={onClose}
          className="flex cursor-pointer items-center text-ink-faint transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg font-bold text-ink">{detail.name}</h2>
          <span className="tnum text-sm text-ink-faint">{detail.code}</span>
        </div>
        <span className="ml-1 text-[13px] text-ink-soft">
          {detail.industry} · {detail.subIndustry}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Star className="size-3.5" />
            加入自选
          </Button>
          <button
            onClick={onClose}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* scroll body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <StatCards detail={detail} />

        {candidate && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-ink-soft">综合得分</div>
                  <div className="text-2xl font-bold text-accent">{candidate.score.toFixed(1)}</div>
                </CardContent>
              </Card>
              <Card className="col-span-2">
                <CardContent className="pt-4">
                  <div className="text-xs text-ink-soft">命中信号</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {candidate.signals.map(s => (
                      <span key={s} className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                        {SIGNAL_LABELS[s] || s}
                      </span>
                    ))}
                    {candidate.extraSignals > 0 && (
                      <span className="text-xs text-ink-faint">+{candidate.extraSignals}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            {candidate.risks && candidate.risks.length > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-ink-soft mb-2">风险检查</div>
                  <div className="space-y-1">
                    {candidate.risks.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={r.ok ? 'text-green-500' : 'text-red-500'}>{r.ok ? '✓' : '✗'}</span>
                        <span className={r.ok ? 'text-ink-soft' : 'text-red-500'}>{r.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="rounded-[14px] border border-line-soft bg-paper p-4">
            <ProfitRevenueChart data={detail.quarters} />
            <p className="tnum mt-1 text-[12px] text-ink-soft">{detail.latestNote}</p>
          </div>
          <div className="rounded-[14px] border border-line-soft bg-paper p-4">
            <PriceChart
              stockName={detail.name}
              klineDay={detail.klineDay}
              klineWeek={detail.klineWeek}
              klineMonth={detail.klineMonth}
              klineQuarter={detail.klineQuarter}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="rounded-[14px] border border-line-soft bg-paper p-4">
            <ResearchReports reports={detail.reports} />
          </div>
          {candidate?.risks && candidate.risks.length > 0 && (
            <div className="rounded-[14px] border border-line-soft bg-paper p-4">
              <RiskChecklist risks={candidate.risks} />
            </div>
          )}
        </div>

        <p className="border-t border-line-soft pt-4 text-[12px] leading-relaxed text-ink-faint">
          免责声明：本系统基于公开数据与研报分析生成，仅供参考，不构成任何投资建议。
        </p>
      </div>
    </Card>
  )
}
