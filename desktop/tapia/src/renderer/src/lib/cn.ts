import { cx } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'

export type ClassValue = Parameters<typeof cx>[0]

function cn(...inputs: ClassValue[]): string {
  return twMerge(cx(inputs))
}

export { cn }
