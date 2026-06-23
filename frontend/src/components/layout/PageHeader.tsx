import { Wordmark } from './Logo'

export function PageHeader() {
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center border-b border-line bg-cream/80 px-4 backdrop-blur sm:h-16 sm:px-6">
      <Wordmark className="h-8 w-auto sm:h-9" />
    </header>
  )
}
