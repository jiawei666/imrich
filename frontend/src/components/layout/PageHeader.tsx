import { Wordmark } from './Logo'

export function PageHeader() {
  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center border-b border-line bg-cream/80 px-6 backdrop-blur">
      <Wordmark className="h-9 w-auto" />
    </header>
  )
}
