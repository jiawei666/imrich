import { AlertTriangle, Check } from 'lucide-react'
import type { RiskItem } from '@/types'

export function RiskChecklist({ risks }: { risks: RiskItem[] }) {
  return (
    <div>
      <div className="mb-3 text-[15px] font-semibold text-ink">风险提示</div>
      <ul className="space-y-2.5">
        {risks.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-[13px]">
            {r.ok ? (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-down/12 text-down">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <AlertTriangle className="size-2.5" strokeWidth={2.5} />
              </span>
            )}
            <span className={r.ok ? 'text-ink-soft' : 'text-ink'}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
