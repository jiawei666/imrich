import { cn } from '@/lib/utils'

/** 骨架占位块：首屏无内容时撑起布局结构，避免空白与内容跳动 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-line/70', className)}
      {...props}
    />
  )
}

/** 图表骨架：标题 + 高低错落的柱形占位，撑起 K 线/趋势图首屏空间 */
export function ChartSkeleton({ className }: { className?: string }) {
  const bars = [55, 70, 40, 85, 60, 95, 50, 75, 45, 80, 65, 90, 58, 72, 48]
  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1 flex items-center gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3.5 w-20" />
      </div>
      <Skeleton className="mb-5 h-3 w-24" />
      <div className="flex h-56 items-end gap-1.5">
        {bars.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}
