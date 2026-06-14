import { Loader2 } from 'lucide-react'

export function LoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-paper/70 backdrop-blur-[1px]">
      <Loader2 className="size-6 animate-spin text-brand" />
    </div>
  )
}
