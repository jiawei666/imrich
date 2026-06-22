import { LineChart, Home, Star, Layers, Activity, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Wordmark } from './Logo'

const NAV = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'screen', label: '选股', icon: LineChart },
  { key: 'watchlist', label: '自选股', icon: Star },
  { key: 'strategy', label: '策略库', icon: Layers },
  { key: 'backtest', label: '回测', icon: Activity },
  { key: 'settings', label: '设置', icon: Settings },
]

export function Sidebar({
  active,
  onNavigate,
}: {
  active: 'home' | 'screen' | 'watchlist'
  onNavigate: (key: 'home' | 'screen' | 'watchlist') => void
}) {
  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t border-line bg-paper/95 px-2 py-1.5 shadow-[0_-8px_24px_-18px_rgba(43,58,77,0.35)] backdrop-blur lg:static lg:h-auto lg:w-[76px] lg:shrink-0 lg:flex-col lg:items-center lg:border-t-0 lg:border-r lg:bg-paper/60 lg:px-0 lg:py-5 lg:shadow-none lg:backdrop-blur-none">
      <nav className="grid flex-1 grid-cols-6 items-center gap-1 lg:flex lg:flex-col lg:items-center lg:gap-1.5">
        {NAV.map(({ key, label, icon: Icon }) => {
          const on = key === active
          return (
            <button
              key={key}
              onClick={() => {
                if (key === 'home' || key === 'screen' || key === 'watchlist') onNavigate(key)
              }}
              className={cn(
                'group flex min-w-0 cursor-pointer flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors duration-200 lg:w-[60px] lg:gap-1 lg:px-0 lg:py-2',
                on
                  ? 'bg-brand-soft text-brand-strong'
                  : 'text-ink-faint hover:bg-paper-2 hover:text-ink'
              )}
            >
              <Icon className="size-[18px] lg:size-[19px]" strokeWidth={on ? 2.2 : 1.8} />
              <span className="max-w-full truncate text-[10px] font-medium lg:text-[11px]">{label}</span>
            </button>
          )
        })}
      </nav>
      <div className="mt-4 hidden w-[60px] lg:block">
        <Wordmark className="w-full" />
      </div>
    </aside>
  )
}
