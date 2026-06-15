import { AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RefreshTaskDetail } from '@/components/home/RefreshTaskDetail'
import {
  StatusBadge,
  TASKS,
  getBlockedDep,
  nodeState,
  type NodeState,
} from '@/components/home/refreshStatus'
import type { MetaResponse, RefreshStatus, RefreshStep } from '@/types'

interface RefreshFlowCurveProps {
  status: RefreshStatus | undefined
  meta: MetaResponse | undefined
  allRunning: boolean
  onRefresh: (key: string) => void
}

const SEGMENT_COLOR: Record<'done' | 'active' | 'waiting', string> = {
  done: 'var(--color-ink)',
  active: 'var(--color-brand)',
  waiting: 'var(--color-line)',
}

function segmentKind(left: NodeState, right: NodeState): 'done' | 'active' | 'waiting' {
  const active = (s: NodeState) => s === 'running' || s === 'error'
  if (active(left) || active(right)) return 'active'
  if (left === 'done' && right === 'done') return 'done'
  return 'waiting'
}

function Segment({ kind }: { kind: 'done' | 'active' | 'waiting' }) {
  const color = SEGMENT_COLOR[kind]
  return (
    <div
      className="relative h-[3px] flex-1 animate-[flow-dash_0.9s_linear_infinite]"
      style={{
        backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 8px, transparent 8px 14px)`,
        backgroundSize: '14px 100%',
      }}
    >
      {kind === 'active' && (
        <span className="pointer-events-none absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_6px_2px_var(--color-brand)] animate-[flow-comet_1.6s_linear_infinite]" />
      )}
    </div>
  )
}

function NodeCircle({ state }: { state: NodeState }) {
  if (state === 'done') {
    return (
      <div className="flex size-9 items-center justify-center rounded-full bg-ink text-white">
        <Check className="size-[18px]" strokeWidth={2.4} />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="flex size-9 items-center justify-center rounded-full bg-brand text-white">
        <AlertCircle className="size-[18px]" />
      </div>
    )
  }
  if (state === 'running') {
    return (
      <div className="relative flex size-9 items-center justify-center rounded-full border-2 border-brand bg-paper">
        <span className="absolute inset-0 rounded-full border-2 border-brand animate-ping opacity-60" />
        <span className="size-2.5 rounded-full bg-brand" />
      </div>
    )
  }
  return <div className="size-9 rounded-full border-2 border-line bg-paper" />
}

function FlowNode({
  index,
  total,
  step,
  state,
  shortLabel,
  detail,
}: {
  index: number
  total: number
  step: RefreshStep
  state: NodeState
  shortLabel: string
  detail: React.ReactNode
}) {
  // 首尾节点的详情卡片做边缘对齐，避免溢出容器
  const align =
    index === 0
      ? 'left-0'
      : index === total - 1
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'

  return (
    <div className="group relative flex w-[76px] shrink-0 flex-col items-center">
      <NodeCircle state={state} />
      <div className="mt-2 text-center text-[11px] font-medium leading-tight text-ink">
        {shortLabel}
      </div>
      <div className="mt-0.5 flex justify-center">
        <StatusBadge step={step} />
      </div>

      {/* hover 详情：pb-2 形成可悬停桥接区 */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-full z-50 pb-2 opacity-0 transition-opacity duration-150',
          'group-hover:pointer-events-auto group-hover:opacity-100',
          align
        )}
      >
        {detail}
      </div>
    </div>
  )
}

export function RefreshFlowCurve({ status, meta, allRunning, onRefresh }: RefreshFlowCurveProps) {
  const states: NodeState[] = TASKS.map((t) =>
    status ? nodeState(t.step(status)) : 'waiting'
  )

  return (
    <div className="flex items-start">
      {TASKS.map((config, i) => {
        const step = status
          ? config.step(status)
          : {
              label: config.label,
              status: 'idle' as const,
              error: null,
              progress: 0,
              done: 0,
              total: 0,
              elapsed: '00:00',
            }
        const blockedDep = getBlockedDep(config, status)
        const node = (
          <FlowNode
            key={config.key}
            index={i}
            total={TASKS.length}
            step={step}
            state={states[i]}
            shortLabel={config.shortLabel}
            detail={
              <RefreshTaskDetail
                config={config}
                step={step}
                meta={meta}
                blockedDep={blockedDep}
                allRunning={allRunning}
                onRefresh={onRefresh}
              />
            }
          />
        )
        if (i === TASKS.length - 1) return node
        // 连线段：垂直对齐到节点圆心（圆 size-9 = 36px，圆心距顶部 18px，线高 3px）
        return [
          node,
          <div key={`seg-${config.key}`} className="flex flex-1 pt-[16px]">
            <Segment kind={segmentKind(states[i], states[i + 1])} />
          </div>,
        ]
      })}
    </div>
  )
}
