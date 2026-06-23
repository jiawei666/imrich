import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 共享筛选抽屉：左侧滑入 + 半透明遮罩。
 * 关闭方式：点击遮罩、按 ESC、或由外部（筛选按钮 / 运行筛选）置 open=false。
 */
export function FilterDrawer({
  open,
  onClose,
  title = '筛选参数',
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  // ESC 关闭；defaultPrevented 守卫避免与 Radix 弹层自身 ESC 关闭冲突造成双关
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <>
      {/* 遮罩：点击关闭。关闭态淡出且不拦截点击 */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'absolute inset-0 z-20 bg-ink/20 transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      {/* 抽屉本体 */}
      <div
        data-open={open ? '' : undefined}
        className="
          absolute left-0 top-0 z-30 flex h-full w-[min(90vw,320px)] flex-col sm:w-[260px] lg:w-[220px]
          bg-cream/90 backdrop-blur-md
          shadow-[4px_0_20px_-6px_rgba(43,58,77,0.10)]
          transition-transform duration-200 ease-out
          -translate-x-full
          data-open:translate-x-0
        "
      >
        {/* header */}
        <div className="px-4 pt-5 pb-3">
          <span className="text-[13px] font-semibold text-ink">{title}</span>
        </div>
        {/* scroll body */}
        <div className="flex-1 overflow-y-auto px-4 pb-5">
          {children}
        </div>
      </div>
    </>
  )
}
