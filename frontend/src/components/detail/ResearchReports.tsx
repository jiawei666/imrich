import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ResearchReport } from '@/types'

const PAGE_SIZE = 5

export function ResearchReports({ reports }: { reports: ResearchReport[] }) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(reports.length / PAGE_SIZE))
  const current = reports.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[15px] font-semibold text-ink">研报摘要</div>
        {pageCount > 1 && (
          <div className="flex items-center gap-1 text-xs text-ink-faint">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex size-5 cursor-pointer items-center justify-center rounded transition-colors disabled:cursor-default disabled:opacity-30 enabled:hover:bg-paper-2 enabled:hover:text-ink"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="tnum">{page + 1} / {pageCount}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="flex size-5 cursor-pointer items-center justify-center rounded transition-colors disabled:cursor-default disabled:opacity-30 enabled:hover:bg-paper-2 enabled:hover:text-ink"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {current.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-ink-faint">暂无研报数据</div>
      ) : (
        <ul className="flex-1 space-y-1">
          {current.map((r, i) => (
            <li
              key={r.title + r.date}
              onClick={() => r.pdfUrl && window.open(r.pdfUrl, '_blank', 'noopener,noreferrer')}
              className={cn(
                'flex items-start gap-3 rounded-lg px-2 py-2 transition-colors duration-200',
                r.pdfUrl ? 'cursor-pointer hover:bg-paper-2/70' : 'cursor-default',
              )}
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-2 text-[11px] font-semibold text-ink-soft">
                {page * PAGE_SIZE + i + 1}
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
      )}
    </div>
  )
}
