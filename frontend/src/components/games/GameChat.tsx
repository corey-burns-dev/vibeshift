import { ChevronDown, Send } from 'lucide-react'
import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type GameChatMessage = {
  user_id: number
  username: string
  text: string
}

interface GameChatProps {
  messages: GameChatMessage[]
  currentUserId: number | undefined
  chatInput: string
  onChatInputChange: (value: string) => void
  onSend: () => void
  accentColor?: 'blue' | 'emerald' | 'teal' | 'amber'
  placeholder?: string
  chatScrollRef: RefObject<HTMLDivElement | null>
  compact?: boolean
  defaultCollapsed?: boolean
}

const ACCENT = {
  blue: {
    header: 'bg-blue-500/5',
    dot: 'bg-blue-500',
    ring: 'focus-visible:ring-blue-500/30',
    border: 'border-blue-500/10',
    ownBubble: 'bg-blue-600 text-white rounded-tr-none',
    button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/10',
  },
  emerald: {
    header: 'bg-emerald-500/10',
    dot: 'bg-emerald-500',
    ring: 'focus-visible:ring-emerald-500/30',
    border: 'border-emerald-500/10',
    ownBubble: 'bg-emerald-600 text-white rounded-tr-none',
    button: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10',
  },
  teal: {
    header: 'bg-teal-500/5',
    dot: 'bg-teal-500',
    ring: 'focus-visible:ring-teal-500/30',
    border: 'border-teal-500/10',
    ownBubble: 'bg-teal-600 text-white rounded-tr-none',
    button: 'bg-teal-600 hover:bg-teal-700 shadow-teal-500/10',
  },
  amber: {
    header: 'bg-amber-500/5',
    dot: 'bg-amber-500',
    ring: 'focus-visible:ring-amber-500/30',
    border: 'border-amber-500/10',
    ownBubble: 'bg-amber-600 text-white rounded-tr-none',
    button: 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/10',
  },
} as const

export function GameChat({
  messages,
  currentUserId,
  chatInput,
  onChatInputChange,
  onSend,
  accentColor = 'blue',
  placeholder = 'Send a message...',
  chatScrollRef,
  compact = false,
  defaultCollapsed = true,
}: GameChatProps) {
  const accent = ACCENT[accentColor]
  const [collapsed, setCollapsed] = useState(compact && defaultCollapsed)

  useEffect(() => {
    setCollapsed(compact && defaultCollapsed)
  }, [compact, defaultCollapsed])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onSend()
  }

  return (
    <>
      <button
        type='button'
        onClick={() => compact && setCollapsed(prev => !prev)}
        className={cn(
          `flex w-full items-center gap-3 border-b text-xs font-black uppercase tracking-widest ${accent.header}`,
          compact ? 'px-3 py-2' : 'p-4',
          compact && 'cursor-pointer'
        )}
      >
        <div className={`h-2 w-2 animate-pulse rounded-full ${accent.dot}`} />
        <span>Game Feed</span>
        {compact && (
          <span className='ml-auto inline-flex items-center gap-1 text-[10px] tracking-wide text-muted-foreground'>
            {collapsed ? 'Open chat' : 'Hide chat'}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                !collapsed && 'rotate-180'
              )}
            />
          </span>
        )}
      </button>
      {!collapsed && (
        <>
          <CardContent
            ref={chatScrollRef}
            className={cn(
              'flex-1 space-y-4 overflow-y-auto',
              compact ? 'max-h-[34dvh] p-3' : 'p-4'
            )}
          >
            {messages.length === 0 && (
              <div className='flex h-full flex-col items-center justify-center opacity-20 grayscale'>
                <Send className='mb-2 h-12 w-12' />
                <p className='text-xs font-bold uppercase tracking-tighter'>
                  No messages yet
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={`${m.user_id}-${i}-${m.text.slice(0, 20)}`}
                className={`flex flex-col ${m.user_id === currentUserId ? 'items-end' : 'items-start'}`}
              >
                <span className='mb-1 text-[9px] font-black uppercase tracking-tighter text-muted-foreground/60'>
                  {m.username}
                </span>
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm font-medium shadow-sm ${
                    m.user_id === currentUserId
                      ? accent.ownBubble
                      : 'rounded-tl-none border bg-muted'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </CardContent>
          <div
            className={cn(
              'border-t bg-background/80 backdrop-blur-md',
              compact ? 'p-3' : 'p-4'
            )}
          >
            <div className='flex gap-2'>
              <Input
                className={`bg-card/50 ${accent.border} ${accent.ring}`}
                placeholder={placeholder}
                value={chatInput}
                onChange={e => onChatInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button
                className={`shadow-lg ${accent.button}`}
                size='icon'
                onClick={onSend}
              >
                <Send className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
