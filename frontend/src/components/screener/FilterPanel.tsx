import { Slider } from '@/components/ui/slider'
import type { Preset } from '@/types'

export type FilterState = Record<string, number | string>

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
    <div className="space-y-5">
      {preset.params.map((param) => (
        <div key={param.key} className="space-y-1.5">
          <label className="text-[11px] font-medium text-ink-soft">{param.label}</label>
          {param.type === 'select' ? (
            <select
              className="w-full rounded-md border border-line bg-paper-2 px-2 py-1 text-xs"
              value={String(paramValues[param.key] ?? param.value)}
              onChange={(e) => onParamChange(param.key, e.target.value)}
            >
              {(param.options ?? []).map((opt) =>
                opt.group ? (
                  <optgroup key={`${opt.group}-${opt.value}`} label={opt.group}>
                    <option value={opt.value}>{opt.label}</option>
                  </optgroup>
                ) : (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                )
              )}
            </select>
          ) : (
            <>
              <Slider
                defaultValue={[Number(paramValues[param.key] ?? param.value)]}
                min={param.min ?? 0}
                max={param.max ?? 100}
                step={param.step ?? 1}
                onValueChange={([v]: number[]) => onParamChange(param.key, v)}
              />
              <div className="text-right text-[10px] text-ink-faint">
                {paramValues[param.key] ?? param.value}{param.unit ?? ''}
              </div>
            </>
          )}
        </div>
      ))}
      <button
        className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        onClick={onApply}
        disabled={loading}
      >
        {loading ? '筛选中...' : '运行筛选'}
      </button>
    </div>
  )
}
