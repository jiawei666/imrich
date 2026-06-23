import { RotateCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  TASKS,
  getBlockedDep,
  nodeState,
  type NodeState,
} from '@/components/home/refreshStatus'
import type { MetaResponse, RefreshStatus, RefreshStep } from '@/types'

interface TaskListProps {
  status: RefreshStatus | undefined
  meta: MetaResponse | undefined
  allRunning: boolean
  onRefresh: (key: string) => void
}

const IDLE_STEP: RefreshStep = {
  label: '',
  status: 'idle',
  error: null,
  progress: 0,
  done: 0,
  total: 0,
  elapsed: '00:00',
}

/* ─── 状态徽章（带圆点的胶囊）─── */

const BADGE: Record<NodeState, { text: string; pill: string; dot: string }> = {
  done: { text: '已完成', pill: 'bg-down/10 text-down', dot: 'bg-down' },
  running: { text: '进行中', pill: 'bg-amber-500/10 text-amber-600', dot: 'bg-amber-500 animate-pulse' },
  error: { text: '失败', pill: 'bg-brand-soft text-brand', dot: 'bg-brand' },
  waiting: { text: '待执行', pill: 'bg-line-soft text-ink-faint', dot: 'bg-ink-faint' },
}

function StatusBadge({ state }: { state: NodeState }) {
  const b = BADGE[state]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
        b.pill
      )}
    >
      <span className={cn('size-1.5 rounded-full', b.dot)} />
      {b.text}
    </span>
  )
}

/* ─── 单行 ─── */

const PROGRESS_TONE: Record<NodeState, string> = {
  done: 'bg-brand',
  running: 'bg-brand',
  error: 'bg-brand',
  waiting: 'bg-line',
}

interface TaskRowProps {
  index: number
  status: RefreshStatus | undefined
  meta: MetaResponse | undefined
  allRunning: boolean
  onRefresh: (key: string) => void
}

function TaskRow({ index, status, meta, allRunning, onRefresh }: TaskRowProps) {
  const config = TASKS[index]
  const step = status ? config.step(status) : IDLE_STEP
  const state = nodeState(step)
  const blockedDep = getBlockedDep(config, status)
  const updatedAt = meta ? config.updatedAt(meta) : null

  const pct = state === 'done' ? 100 : step.progress
  const showPct = state === 'done' || state === 'running' || (state === 'error' && step.progress > 0)

  const disabled = state === 'running' || allRunning || !!blockedDep
  const title = allRunning
    ? '全部更新中，请稍候'
    : blockedDep
      ? `请先完成：${blockedDep}`
      : state === 'running'
        ? '正在执行中'
        : `立即更新${config.label}`

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-line-soft px-4 py-4 transition-colors hover:bg-paper-2/50 md:grid-cols-[minmax(0,1fr)_112px_180px_168px_40px] md:items-center md:gap-4 md:px-5">
      {/* 任务名 + 描述 */}
      <div className="min-w-0">
        <div className="truncate text-[14px] font-bold text-ink">{config.label}</div>
        <div className="mt-0.5 truncate text-[12px] text-ink-faint">{config.description}</div>
      </div>

      {/* 状态 */}
      <div className="justify-self-end md:justify-self-auto">
        <StatusBadge state={state} />
      </div>

      {/* 进度 */}
      <div className="col-span-2 flex items-center gap-3 md:col-span-1">
        <ProgressBar value={pct} barClassName={PROGRESS_TONE[state]} className="h-1.5 flex-1" />
        <span className="w-9 shrink-0 text-right text-[12px] tnum text-ink-faint">
          {showPct ? `${pct}%` : '—'}
        </span>
      </div>

      {/* 更新时间 */}
      <div className="min-w-0 truncate text-[12px] tnum text-ink-soft md:min-w-0">{updatedAt ?? '—'}</div>

      {/* 操作 */}
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => onRefresh(config.key)}
        className="flex size-8 items-center justify-center justify-self-end rounded-lg border border-line bg-paper text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-paper md:justify-self-end"
      >
        <RotateCw className={cn('size-4', state === 'running' && 'animate-spin text-amber-500')} />
      </button>
    </div>
  )
}

/* ─── 表格 ─── */

export function TaskList({ status, meta, allRunning, onRefresh }: TaskListProps) {
  return (
    <Card className="overflow-hidden">
      {/* 卡片标题 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 md:px-5 md:pt-5">
        <h2 className="text-[15px] font-bold text-ink">数据任务</h2>
      </div>

      {/* 列头 */}
      <div className="hidden grid-cols-[minmax(0,1fr)_112px_180px_168px_40px] items-center gap-4 px-5 pb-2 text-[12px] font-medium text-ink-faint md:grid">
        <div>任务</div>
        <div>状态</div>
        <div>进度</div>
        <div>更新时间</div>
        <div />
      </div>

      {/* 行 */}
      {TASKS.map((t, i) => (
        <TaskRow
          key={t.key}
          index={i}
          status={status}
          meta={meta}
          allRunning={allRunning}
          onRefresh={onRefresh}
        />
      ))}
    </Card>
  )
}
