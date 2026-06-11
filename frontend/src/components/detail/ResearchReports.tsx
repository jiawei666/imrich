import { ChevronRight } from 'lucide-react'
import type { ResearchReport } from '@/types'

export function ResearchReports({ reports }: { reports: ResearchReport[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 text-[15px] font-semibold text-ink">
        研报摘要<span className="ml-1 text-xs font-normal text-ink-faint">（近30天）</span>
      </div>
      <ul className="flex-1 space-y-1">
        {reports.map((r, i) => (
          <li
            key={r.title}
            className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition-colors duration-200 hover:bg-paper-2/70"
          >
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-2 text-[11px] font-semibold text-ink-soft">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">{r.title}</p>
              <span className="text-[11px] text-ink-faint">{r.org}</span>
            </div>
            <span className="tnum mt-0.5 shrink-0 text-[11px] text-ink-faint">
              {r.date}
            </span>
          </li>
        ))}
      </ul>
      <button className="mt-2 flex cursor-pointer items-center justify-center gap-0.5 border-t border-line-soft pt-3 text-[13px] text-ink-soft transition-colors hover:text-brand">
        查看更多研报 <ChevronRight className="size-3.5" />
      </button>
    </div>
  )
}
