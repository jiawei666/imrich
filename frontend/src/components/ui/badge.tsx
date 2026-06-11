import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        brand: 'bg-brand-soft text-brand-strong',
        ink: 'bg-ink/8 text-ink',
        neutral: 'bg-paper-2 text-ink-soft',
        outline: 'border border-line text-ink-soft',
        up: 'bg-up/10 text-up',
        down: 'bg-down/12 text-down',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[11px]',
        md: 'px-2 py-1 text-xs',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'sm' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}
