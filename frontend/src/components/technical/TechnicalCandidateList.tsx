import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import type { Preset, TechnicalCandidate } from '@/types'

export function TechnicalCandidateList({
  preset,
  paramValues,
  onParamChange,
  onApply,
  candidates,
  selectedCode,
  onSelect,
}: {
  preset: Preset | null
  paramValues: Record<string, number>
  onParamChange: (key: string, value: number) => void
  onApply: () => void
  candidates: TechnicalCandidate[]
  selectedCode: string
  onSelect: (code: string) => void
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{preset?.name ?? '技术面战法'}</CardTitle>
        <Button variant="primary" size="sm" onClick={onApply}>运行筛选</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 精简参数面板 */}
        {preset && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line-soft pb-4 sm:grid-cols-3">
            {preset.params.map((p) => (
              <NumberField
                key={p.key}
                label={p.label}
                op="="
                unit={p.unit ?? ''}
                value={paramValues[p.key] ?? p.value}
                onChange={(v) => onParamChange(p.key, v)}
              />
            ))}
          </div>
        )}

        {/* 候选列表 */}
        <div className="flex flex-col gap-1.5">
          {candidates.length === 0 && (
            <div className="py-8 text-center text-sm text-ink-faint">暂无候选，点击「运行筛选」</div>
          )}
          {candidates.map((c) => {
            const on = c.code === selectedCode
            return (
              <button
                key={c.code}
                onClick={() => onSelect(c.code)}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
                  on ? 'border-brand bg-brand-soft' : 'border-line-soft hover:bg-paper-2',
                )}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                  <span className="tnum text-[11px] text-ink-faint">{c.code} · {c.industry || '—'}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="tnum text-sm text-ink">{c.close}</span>
                  <span className={cn('tnum text-[11px]', c.pctChg >= 0 ? 'text-up' : 'text-down')}>
                    {c.pctChg >= 0 ? '+' : ''}{c.pctChg}%
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
