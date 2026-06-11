import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a signed percentage with fixed decimals, e.g. +52.3% */
export function pct(value: number, digits = 1) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}
