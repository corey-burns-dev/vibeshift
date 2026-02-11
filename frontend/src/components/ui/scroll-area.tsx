'use client'

import type * as React from 'react'

import { cn } from '@/lib/utils'

// CSS-based scroll area — replaces Radix ScrollArea which has an infinite
// re-render loop with React 19 (setState inside ref callback).
// Scrollbar styling is handled via CSS in globals.css.

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='scroll-area'
      className={cn('relative overflow-y-auto scroll-area-styled', className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface ScrollBarProps extends React.ComponentProps<'div'> {
  orientation?: 'vertical' | 'horizontal'
}

// Retained for API compatibility — CSS handles scrollbar styling now
function ScrollBar({
  orientation: _orientation = 'vertical',
  ...props
}: ScrollBarProps) {
  return <div data-slot='scroll-area-scrollbar' hidden {...props} />
}

export { ScrollArea, ScrollBar }
