import { Navbar } from '@/components/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageCircle, Send, Settings, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// Mock chat messages
const initialMessages = [
  {
    id: 1,
    username: 'alice_dev',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    message: 'Hey everyone! Just pushed some updates to the main branch 🚀',
    timestamp: '14:32',
    color: '#ff6b6b',
  },
  {
    id: 2,
    username: 'bob_coder',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
    message: 'Nice! The new dark mode looks amazing',
    timestamp: '14:33',
    color: '#4ecdc4',
  },
  {
    id: 3,
    username: 'charlie_ui',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
    message: 'Anyone else having issues with the chat scroll? It seems to jump sometimes',
    timestamp: '14:34',
    color: '#45b7d1',
  },
  {
    id: 4,
    username: 'system',
    avatar: '',
    message: 'diana_design joined the chat',
    timestamp: '14:35',
    color: '#95a5a6',
    isSystem: true,
  },
  {
    id: 5,
    username: 'diana_design',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana',
    message: 'Hey! The new posts page looks great. Love the Instagram-style layout',
    timestamp: '14:36',
    color: '#f39c12',
  },
]

export default function Chat() {
  const [messages, setMessages] = useState(initialMessages)
  const [newMessage, setNewMessage] = useState('')
  const [onlineUsers] = useState(24)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = () => {
    if (!newMessage.trim()) return

    const message = {
      id: messages.length + 1,
      username: 'you',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=you',
      message: newMessage,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      }),
      color: '#9b59b6',
    }

    setMessages([...messages, message])
    setNewMessage('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
          {/* Chat Area */}
          <div className="lg:col-span-3 flex flex-col">
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader className="shrink-0">
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Live Chat
                </CardTitle>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                {/* Messages */}
                <ScrollArea className="flex-1 px-6 min-h-0" ref={scrollAreaRef}>
                  <div className="space-y-3 py-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className="flex items-start gap-3 group">
                        {msg.isSystem ? (
                          <div className="flex-1">
                            <p className="text-sm text-muted-foreground italic">{msg.message}</p>
                          </div>
                        ) : (
                          <>
                            <Avatar className="w-8 h-8 shrink-0">
                              <AvatarImage src={msg.avatar} />
                              <AvatarFallback className="text-xs">
                                {msg.username[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 mb-1">
                                <span
                                  className="font-semibold text-sm"
                                  style={{ color: msg.color }}
                                >
                                  {msg.username}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {msg.timestamp}
                                </span>
                              </div>
                              <p className="text-sm wrap-break-word">{msg.message}</p>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="border-t p-4 shrink-0">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="flex-1"
                    />
                    <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6 lg:flex lg:flex-col">
            {/* Online Users */}
            <Card className="lg:flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5" />
                  Online ({onlineUsers})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {['alice_dev', 'bob_coder', 'charlie_ui', 'diana_design', 'you'].map((user) => (
                    <div key={user} className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <Avatar className="w-6 h-6">
                        <AvatarImage
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user}`}
                        />
                        <AvatarFallback className="text-xs">{user[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{user}</span>
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground mt-3">
                    +{onlineUsers - 5} more users online
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Chat Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="w-5 h-5" />
                  Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Show timestamps</span>
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Highlight mentions</span>
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Sound notifications</span>
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
