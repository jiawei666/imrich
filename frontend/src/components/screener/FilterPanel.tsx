import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Preset } from '@/types'

export type FilterState = Record<string, number | string>

const EMPTY_OPTION = '__all__'

export function FilterPanel({
  preset,
  paramValues,
  onParamChange,
  onApply,
  loading,
}: {
  preset: Preset
  paramValues: FilterState
  onParamChange: (key: string, value: number | string) => void
  onApply: () => void
  loading: boolean
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6">
        {preset.params.map((param) => (
          <div key={param.key} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-ink-soft">{param.label}</label>
              {param.type !== 'select' && (
                <span className="tnum text-[13px] font-semibold text-ink">
                  {paramValues[param.key] ?? param.value}{param.unit ?? ''}
                </span>
              )}
            </div>
            {param.type === 'select' ? (
              <Select
                value={String(paramValues[param.key] ?? param.value) || EMPTY_OPTION}
                onValueChange={(v) => onParamChange(param.key, v === EMPTY_OPTION ? '' : v)}
              >
                <SelectTrigger className="h-9 w-full text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(param.options ?? []).filter((opt) => !opt.group).map((opt) => (
                    <SelectItem key={opt.value || EMPTY_OPTION} value={opt.value || EMPTY_OPTION}>
                      {opt.label}
                    </SelectItem>
                  ))}
                  {[...new Set((param.options ?? []).filter((opt) => opt.group).map((opt) => opt.group!))].map((group) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {(param.options ?? []).filter((opt) => opt.group === group).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Slider
                value={[Number(paramValues[param.key] ?? param.value)]}
                min={param.min ?? 0}
                max={param.max ?? 100}
                step={param.step ?? 1}
                onValueChange={([v]: number[]) => onParamChange(param.key, v)}
              />
            )}
          </div>
        ))}
      </div>
      <Button variant="primary" size="sm" onClick={onApply} disabled={loading} className="mt-6 w-full">
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
