export function PageHeader({ title }: { title: string }) {
  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center border-b border-line bg-cream/80 px-6 backdrop-blur">
      <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
    </header>
  )
}
