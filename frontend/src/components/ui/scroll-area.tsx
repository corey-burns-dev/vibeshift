import * as React from 'react'

import { cn } from '@/lib/utils'

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot='scroll-area'
      className={cn('relative overflow-y-auto scroll-area-styled', className)}
      {...props}
    >
      {children}
    </div>
  )
})
ScrollArea.displayName = 'ScrollArea'

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
