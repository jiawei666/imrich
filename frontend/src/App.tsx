import { useCallback, useRef, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { StrategySidebar } from '@/components/layout/StrategySidebar'
import { HomePage } from '@/pages/HomePage'
import { ScreenPage, type ScreenPageHandle } from '@/pages/ScreenPage'
import { WatchlistPage } from '@/pages/WatchlistPage'
import type { StrategyId } from '@/types'

export default function App() {
  const [view, setView] = useState<'home' | 'screen' | 'watchlist'>('home')
  const [strategy, setStrategy] = useState<StrategyId>('super-growth')
  const screenPageRef = useRef<ScreenPageHandle>(null)

  const handleNavigate = useCallback((key: 'home' | 'screen' | 'watchlist') => {
    setView(key)
  }, [])

  return (
    <div className="min-h-dvh bg-cream pb-20 text-ink lg:flex lg:h-screen lg:overflow-hidden lg:pb-0">
      <Sidebar active={view} onNavigate={handleNavigate} />
      {view === 'screen' && (
        <StrategySidebar
          strategy={strategy}
          onSelect={(s) => { setStrategy(s); setView('screen') }}
          onFilterClick={() => screenPageRef.current?.toggleFilter()}
        />
      )}
      {view === 'home' && <HomePage />}
      {view === 'screen' && <ScreenPage ref={screenPageRef} strategy={strategy} />}
      {view === 'watchlist' && <WatchlistPage />}
    </div>
  )
}
