import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/ui/field'
import type { Preset } from '@/types'

export function TechnicalFilterCard({
  preset,
  paramValues,
  onParamChange,
  onApply,
  loading,
}: {
  preset: Preset | null
  paramValues: Record<string, number>
  onParamChange: (key: string, value: number) => void
  onApply: () => void
  loading?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-medium text-ink-soft">{preset?.name ?? '技术面战法'}</div>
      {preset && (
        <div className="flex flex-col gap-3">
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
      <Button variant="primary" size="sm" onClick={onApply} disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            筛选中...
          </>
        ) : '运行筛选'}
      </Button>
    </div>
  )
}
