import { useState } from 'react'
import { Home, Star, Layers, Activity, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Wordmark } from './Logo'

const NAV = [
  { key: 'screen', label: '选股', icon: Home },
  { key: 'watchlist', label: '自选股', icon: Star },
  { key: 'strategy', label: '策略库', icon: Layers },
  { key: 'backtest', label: '回测', icon: Activity },
  { key: 'settings', label: '设置', icon: Settings },
]

export function Sidebar() {
  const [active, setActive] = useState('screen')
  return (
    <aside className="flex w-[76px] shrink-0 flex-col items-center border-r border-line bg-paper/60 py-5">
      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {NAV.map(({ key, label, icon: Icon }) => {
          const on = key === active
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={cn(
                'group flex w-[60px] cursor-pointer flex-col items-center gap-1 rounded-xl py-2 transition-colors duration-200',
                on
                  ? 'bg-brand-soft text-brand-strong'
                  : 'text-ink-faint hover:bg-paper-2 hover:text-ink'
              )}
            >
              <Icon className="size-[19px]" strokeWidth={on ? 2.2 : 1.8} />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-4 w-[60px]">
        <Wordmark className="w-full" />
      </div>
    </aside>
  )
}
