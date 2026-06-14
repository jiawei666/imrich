import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 共享筛选抽屉：左侧滑入，带标题栏 + 滚动内容区。
 * 纯 CSS transition 方案：用 data-open 属性驱动 translate。
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
  const drawerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭（排除筛选按钮，由按钮自行 toggle）
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // 排除筛选 toggle 按钮（它自己负责开/关）
      if (target.closest('[data-filter-toggle]')) return
      if (drawerRef.current && !drawerRef.current.contains(target)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  return (
    <div
      ref={drawerRef}
      data-open={open ? '' : undefined}
      className="
        absolute left-0 top-0 z-30 flex h-full w-[220px] flex-col
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
  )
}
