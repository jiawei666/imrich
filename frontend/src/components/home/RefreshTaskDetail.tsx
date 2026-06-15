import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import {
  StatusBadge,
  isStepDone,
  type RefreshTaskConfig,
} from '@/components/home/refreshStatus'
import type { MetaResponse, RefreshStep } from '@/types'

interface RefreshTaskDetailProps {
  config: RefreshTaskConfig
  step: RefreshStep
  meta: MetaResponse | undefined
  blockedDep: string | null
  allRunning: boolean
  onRefresh: (key: string) => void
}

export function RefreshTaskDetail({
  config,
  step,
  meta,
  blockedDep,
  allRunning,
  onRefresh,
}: RefreshTaskDetailProps) {
  const running = step.status === 'running'
  const updatedAt = meta ? config.updatedAt(meta) : null

  const disabled = running || allRunning || !!blockedDep
  const buttonTitle = allRunning
    ? '全部更新中，请稍候'
    : blockedDep
      ? `请先完成：${blockedDep}`
      : running
        ? '正在执行中'
        : `刷新${config.label}`

  const buttonLabel = running
    ? '执行中'
    : step.status === 'error'
      ? '重试'
      : isStepDone(step)
        ? '重新执行'
        : '立即执行'

  return (
    <div className="w-64 rounded-[12px] border border-line bg-paper p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">{config.label}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{config.description}</p>
        </div>
        <StatusBadge step={step} />
      </div>

      <div className="mt-3 space-y-1.5 text-[12px] text-ink-soft">
        {step.status === 'error' ? (
          <p className="text-down">{step.error ?? '更新失败'}</p>
        ) : running ? (
          <>
            <ProgressBar value={step.progress} className="h-1.5" />
            <div className="flex items-center justify-between tnum text-ink-faint">
              <span>已耗时 {step.elapsed}</span>
              {step.total > 0 && (
                <span>
                  {step.done.toLocaleString()} / {step.total.toLocaleString()}
                </span>
              )}
            </div>
          </>
        ) : isStepDone(step) ? (
          <div className="flex items-center justify-between tnum text-ink-faint">
            <span>{updatedAt ?? '—'}</span>
            {step.done > 0 && <span>{step.done.toLocaleString()} 条</span>}
          </div>
        ) : blockedDep ? (
          <p className="text-ink-faint">需先完成：{blockedDep}</p>
        ) : (
          <p className="text-ink-faint">待执行</p>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        title={buttonTitle}
        onClick={() => onRefresh(config.key)}
        className="mt-3 w-full"
      >
        <RotateCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
        {buttonLabel}
      </Button>
    </div>
  )
}
