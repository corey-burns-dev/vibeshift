import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TypingIndicatorProps {
  typingUsers: string[]
  className?: string
}

export function TypingIndicator({
  typingUsers,
  className,
}: TypingIndicatorProps) {
  const [dots, setDots] = useState('')

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : `${prev}.`))
    }, 400)
    return () => clearInterval(interval)
  }, [])

  if (typingUsers.length === 0) return null

  let text = ''
  if (typingUsers.length === 1) {
    text = `${typingUsers[0]} is typing`
  } else if (typingUsers.length === 2) {
    text = `${typingUsers[0]} and ${typingUsers[1]} are typing`
  } else if (typingUsers.length === 3) {
    text = `${typingUsers[0]}, ${typingUsers[1]}, and ${typingUsers[2]} are typing`
  } else {
    text = `${typingUsers[0]}, ${typingUsers[1]}, ${typingUsers[2]} and ${typingUsers.length - 3} others are typing`
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-primary/90 font-medium animate-in fade-in slide-in-from-bottom-1 duration-200 bg-primary/5 rounded-md px-2.5 py-1.5 border border-primary/10',
        className
      )}
    >
      <div className='flex gap-0.5'>
        <span
          className='h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce'
          style={{ animationDelay: '0ms' }}
        />
        <span
          className='h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce'
          style={{ animationDelay: '150ms' }}
        />
        <span
          className='h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce'
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <span>
        {text}
        {dots}
      </span>
    </div>
  )
}
