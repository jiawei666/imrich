import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/ui/field'
import type { Preset } from '@/types'

export function TechnicalFilterCard({
  preset,
  paramValues,
  onParamChange,
  onApply,
}: {
  preset: Preset | null
  paramValues: Record<string, number>
  onParamChange: (key: string, value: number) => void
  onApply: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{preset?.name ?? '技术面战法'}</CardTitle>
        <Button variant="primary" size="sm" onClick={onApply}>运行筛选</Button>
      </CardHeader>
      <CardContent>
        {preset && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
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
      </CardContent>
    </Card>
  )
}
