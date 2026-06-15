import { useRef, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { StrategySidebar } from '@/components/layout/StrategySidebar'
import { HomePage } from '@/pages/HomePage'
import { ScreenPage, type ScreenPageHandle } from '@/pages/ScreenPage'
import type { StrategyId } from '@/types'

export default function App() {
  const [view, setView] = useState<'home' | 'screen'>('home')
  const [strategy, setStrategy] = useState<StrategyId>('super-growth')
  const screenPageRef = useRef<ScreenPageHandle>(null)

  return (
    <div className="flex h-screen overflow-hidden bg-cream text-ink">
      <Sidebar active={view} onNavigate={setView} />
      {view === 'screen' && (
        <StrategySidebar
          strategy={strategy}
          onSelect={(s) => { setStrategy(s); setView('screen') }}
          onFilterClick={() => screenPageRef.current?.toggleFilter()}
        />
      )}
      {view === 'home' ? <HomePage /> : <ScreenPage ref={screenPageRef} strategy={strategy} />}
    </div>
  )
}
