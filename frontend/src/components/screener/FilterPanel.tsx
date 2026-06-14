import { useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Preset } from '@/types'

export type FilterState = Record<string, number | string>

const EMPTY_OPTION = '__all__'

/** 带搜索的行业 Combobox（Popover + Command） */
function IndustryCombobox({
  options,
  value,
  onValueChange,
}: {
  options: { value: string; label: string; group?: string }[]
  value: string
  onValueChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  const ungrouped = options.filter((o) => !o.group)
  const grouped = options.filter((o) => o.group)
  const groups = [...new Set(grouped.map((o) => o.group!))]

  const selectedLabel =
    options.find((o) => o.value === value)?.label ??
    ungrouped.find((o) => o.value === EMPTY_OPTION)?.label ??
    '全部行业'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          className="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-line bg-paper px-3 text-[13px] text-ink transition-colors duration-200 hover:border-ink-faint/40 focus:outline-none focus:ring-2 focus:ring-ring/40 data-[placeholder]:text-ink-faint"
        >
          <span className={value ? '' : 'text-ink-faint'}>{selectedLabel}</span>
          <svg
            className="size-4 shrink-0 text-ink-faint"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索行业..." />
          <CommandList>
            <CommandEmpty>未找到匹配行业</CommandEmpty>
            {ungrouped.map((opt) => (
              <CommandItem
                key={opt.value || EMPTY_OPTION}
                value={opt.value || EMPTY_OPTION}
                onSelect={() => {
                  onValueChange(opt.value === EMPTY_OPTION ? '' : opt.value)
                  setOpen(false)
                }}
              >
                <Check className={value === opt.value || (!value && opt.value === EMPTY_OPTION) ? 'mr-2 size-4 opacity-100' : 'mr-2 size-4 opacity-0'} />
                {opt.label}
              </CommandItem>
            ))}
            {groups.map((group) => (
              <CommandGroup key={group} heading={group}>
                {grouped
                  .filter((o) => o.group === group)
                  .map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      onSelect={() => {
                        onValueChange(opt.value)
                        setOpen(false)
                      }}
                    >
                      <Check className={value === opt.value ? 'mr-2 size-4 opacity-100' : 'mr-2 size-4 opacity-0'} />
                      {opt.label}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

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
  // 缓存每个参数的 Slider value 数组，避免每次渲染创建新数组引用
  // 导致 Radix Slider 误判 value 变化触发 onValueChange → 无限循环
  const sliderValues = useMemo(() => {
    const map: Record<string, [number]> = {}
    for (const param of preset.params) {
      if (param.type !== 'select') {
        map[param.key] = [Number(paramValues[param.key] ?? param.value)]
      }
    }
    return map
  }, [preset.params, paramValues])

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
              param.options?.some((o) => o.group) ? (
                <IndustryCombobox
                  options={param.options ?? []}
                  value={String(paramValues[param.key] ?? param.value) || EMPTY_OPTION}
                  onValueChange={(v) => onParamChange(param.key, v === EMPTY_OPTION ? '' : v)}
                />
              ) : (
                <Select
                  value={String(paramValues[param.key] ?? param.value) || EMPTY_OPTION}
                  onValueChange={(v) => onParamChange(param.key, v === EMPTY_OPTION ? '' : v)}
                >
                  <SelectTrigger className="h-9 w-full text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(param.options ?? []).map((opt) => (
                      <SelectItem key={opt.value || EMPTY_OPTION} value={opt.value || EMPTY_OPTION}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : (
              <Slider
                value={sliderValues[param.key]}
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
