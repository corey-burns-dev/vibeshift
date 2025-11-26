import { MoreHorizontal, Paperclip, Phone, Search, Send, Smile, Video } from 'lucide-react'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

// Mock conversations data
const conversations = [
  {
    id: 1,
    user: {
      name: 'Alice Johnson',
      username: 'alice_dev',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
      status: 'online',
    },
    lastMessage: {
      text: 'Hey, how are you doing?',
      timestamp: '2m ago',
      isFromMe: false,
    },
    unreadCount: 2,
    isTyping: false,
  },
  {
    id: 2,
    user: {
      name: 'Bob Smith',
      username: 'bob_coder',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
      status: 'online',
    },
    lastMessage: {
      text: 'Thanks for the help with that bug!',
      timestamp: '1h ago',
      isFromMe: true,
    },
    unreadCount: 0,
    isTyping: false,
  },
  {
    id: 3,
    user: {
      name: 'Charlie Brown',
      username: 'charlie_ui',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
      status: 'away',
    },
    lastMessage: {
      text: 'The design looks great!',
      timestamp: '3h ago',
      isFromMe: false,
    },
    unreadCount: 1,
    isTyping: true,
  },
]

// Mock messages for the selected conversation
const messages = [
  {
    id: 1,
    text: 'Hey! How are you?',
    timestamp: '10:30 AM',
    isFromMe: false,
    user: {
      name: 'Alice Johnson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    },
  },
  {
    id: 2,
    text: "I'm doing great! Just working on some new features.",
    timestamp: '10:32 AM',
    isFromMe: true,
  },
  {
    id: 3,
    text: 'That sounds awesome! What kind of features?',
    timestamp: '10:33 AM',
    isFromMe: false,
    user: {
      name: 'Alice Johnson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    },
  },
  {
    id: 4,
    text: 'Mostly UI improvements and some backend optimizations.',
    timestamp: '10:35 AM',
    isFromMe: true,
  },
  {
    id: 5,
    text: "Cool! I've been working on a similar project. Want to share some ideas?",
    timestamp: '10:36 AM',
    isFromMe: false,
    user: {
      name: 'Alice Johnson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    },
  },
]

export default function Messages() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedConversation, setSelectedConversation] = useState(conversations[0])
  const [newMessage, setNewMessage] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const filteredConversations = conversations.filter(
    (conversation) =>
      conversation.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conversation.user.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      // In a real app, this would make an API call
      console.log('Sending message:', newMessage)
      setNewMessage('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const ConversationItem = ({ conversation }: { conversation: any }) => (
    <button
      type="button"
      className={`w-full text-left p-4 hover:bg-accent/50 transition-colors ${
        selectedConversation.id === conversation.id ? 'bg-accent' : ''
      }`}
      onClick={() => setSelectedConversation(conversation)}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar>
            <AvatarImage src={conversation.user.avatar} />
            <AvatarFallback>
              {conversation.user.name
                .split(' ')
                .map((n: string) => n[0])
                .join('')}
            </AvatarFallback>
          </Avatar>
          <div
            className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
              conversation.user.status === 'online'
                ? 'bg-green-500'
                : conversation.user.status === 'away'
                  ? 'bg-yellow-500'
                  : 'bg-gray-500'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold truncate">{conversation.user.name}</h3>
            <span className="text-xs text-muted-foreground">
              {conversation.lastMessage.timestamp}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {conversation.isTyping ? (
              <span className="text-primary">typing...</span>
            ) : (
              conversation.lastMessage.text
            )}
          </p>
        </div>

        {conversation.unreadCount > 0 && (
          <Badge variant="destructive" className="ml-2">
            {conversation.unreadCount}
          </Badge>
        )}
      </div>
    </button>
  )

  const MessageBubble = ({ message }: { message: any }) => (
    <div className={`flex gap-3 mb-4 ${message.isFromMe ? 'justify-end' : 'justify-start'}`}>
      {!message.isFromMe && (
        <Avatar className="w-8 h-8">
          <AvatarImage src={message.user.avatar} />
          <AvatarFallback className="text-xs">
            {message.user.name
              .split(' ')
              .map((n: string) => n[0])
              .join('')}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`max-w-[70%] ${message.isFromMe ? 'order-1' : 'order-2'}`}>
        <div
          className={`rounded-lg px-3 py-2 ${
            message.isFromMe ? 'bg-primary text-primary-foreground ml-auto' : 'bg-muted'
          }`}
        >
          <p className="text-sm">{message.text}</p>
        </div>
        <p
          className={`text-xs text-muted-foreground mt-1 ${
            message.isFromMe ? 'text-right' : 'text-left'
          }`}
        >
          {message.timestamp}
        </p>
      </div>

      {message.isFromMe && (
        <Avatar className="w-8 h-8 order-2">
          <AvatarFallback className="text-xs">ME</AvatarFallback>
        </Avatar>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Messages</h1>
          <p className="text-muted-foreground">Connect and chat with your friends</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
          {/* Conversations List */}
          <div className="lg:col-span-1">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="w-full mx-4 mb-4">
                    <TabsTrigger value="all" className="flex-1">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="unread" className="flex-1">
                      Unread
                    </TabsTrigger>
                  </TabsList>

                  <ScrollArea className="h-[calc(100vh-400px)]">
                    <TabsContent value="all" className="mt-0">
                      {filteredConversations.map((conversation) => (
                        <ConversationItem key={conversation.id} conversation={conversation} />
                      ))}
                    </TabsContent>

                    <TabsContent value="unread" className="mt-0">
                      {filteredConversations
                        .filter((conversation) => conversation.unreadCount > 0)
                        .map((conversation) => (
                          <ConversationItem key={conversation.id} conversation={conversation} />
                        ))}
                    </TabsContent>
                  </ScrollArea>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-2">
            <Card className="h-full flex flex-col">
              {/* Chat Header */}
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar>
                        <AvatarImage src={selectedConversation.user.avatar} />
                        <AvatarFallback>
                          {selectedConversation.user.name
                            .split(' ')
                            .map((n: string) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
                          selectedConversation.user.status === 'online'
                            ? 'bg-green-500'
                            : selectedConversation.user.status === 'away'
                              ? 'bg-yellow-500'
                              : 'bg-gray-500'
                        }`}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold">{selectedConversation.user.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedConversation.isTyping
                          ? 'typing...'
                          : selectedConversation.user.status === 'online'
                            ? 'Active now'
                            : `Last seen recently`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost">
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost">
                      <Video className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Messages */}
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-full p-4">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </ScrollArea>
              </CardContent>

              {/* Message Input */}
              <div className="border-t p-4">
                <div className="flex items-end gap-2">
                  <Button size="sm" variant="ghost" className="shrink-0">
                    <Paperclip className="w-4 h-4" />
                  </Button>

                  <div className="flex-1 relative">
                    <Textarea
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="min-h-10 max-h-[120px] resize-none pr-12"
                      rows={1}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2"
                    >
                      <Smile className="w-4 h-4" />
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className="shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
