import { Hash, LogIn } from 'lucide-react'
import { memo } from 'react'
import type { Conversation } from '@/api/types'
import { Button } from '@/components/ui/button'

// import { ScrollArea } from '@/components/ui/scroll-area'

interface ChatSidebarProps {
  activeTab: 'all' | 'joined'
  setActiveTab: (tab: 'all' | 'joined') => void
  conversations: (Conversation & { is_joined?: boolean })[] | undefined
  isLoading: boolean
  error: unknown
  selectedId: number | null
  onSelect: (id: number) => void
  onJoin: (id: number) => void
  isJoining: boolean
}

export const ChatSidebar = memo(function ChatSidebar({
  activeTab,
  setActiveTab,
  conversations,
  isLoading,
  error,
  selectedId,
  onSelect,
  onJoin,
  isJoining,
}: ChatSidebarProps) {
  return (
    <div className='w-[15%] border-r bg-card flex flex-col overflow-hidden'>
      <div className='p-4 border-b shrink-0'>
        <h2 className='font-semibold text-sm flex items-center gap-2'>
          <Hash className='w-4 h-4' />
          Chatrooms
        </h2>
      </div>

      {/* Tabs */}
      <div className='flex border-b shrink-0'>
        <button
          type='button'
          onClick={() => setActiveTab('joined')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'joined'
              ? 'text-primary border-b-2 border-primary bg-accent/50'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          JOINED
        </button>
        <button
          type='button'
          onClick={() => setActiveTab('all')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'all'
              ? 'text-primary border-b-2 border-primary bg-accent/50'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          ALL
        </button>
      </div>

      <div className='flex-1 overflow-y-auto'>
        <div className='space-y-1 p-2'>
          {isLoading ? (
            <div className='text-xs text-muted-foreground text-center py-8'>
              Loading...
            </div>
          ) : error ? (
            <div className='text-xs text-destructive text-center py-8'>
              Error loading
            </div>
          ) : conversations && conversations.length > 0 ? (
            conversations.map(room => {
              const isJoined = 'is_joined' in room ? room.is_joined : true
              return (
                <div
                  key={room.id}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    room.id === selectedId
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  <button
                    type='button'
                    className='w-full text-left'
                    onClick={() => {
                      if (isJoined) onSelect(room.id)
                    }}
                    disabled={!isJoined}
                  >
                    <p className='font-medium truncate flex items-center gap-1'>
                      <Hash className='w-3 h-3 opacity-50' />
                      {room.name || `Room ${room.id}`}
                    </p>
                    {room.last_message && isJoined && (
                      <p className='text-xs opacity-75 truncate'>
                        {room.last_message.content}
                      </p>
                    )}
                  </button>
                  {!isJoined && activeTab === 'all' && (
                    <Button
                      size='sm'
                      variant='outline'
                      className='w-full mt-2 h-7 text-xs'
                      onClick={() => onJoin(room.id)}
                      disabled={isJoining}
                    >
                      <LogIn className='w-3 h-3 mr-1' />
                      {isJoining ? '...' : 'Join'}
                    </Button>
                  )}
                </div>
              )
            })
          ) : (
            <div className='text-xs text-muted-foreground text-center py-8'>
              {activeTab === 'joined'
                ? 'No joined chatrooms'
                : 'No chatrooms available'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
