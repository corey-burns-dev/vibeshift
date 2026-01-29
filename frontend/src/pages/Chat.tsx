import type { Conversation } from '@/api/types';
import { Navbar } from '@/components/Navbar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	useAllChatrooms,
	useJoinChatroom,
	useJoinedChatrooms,
	useMessages,
	useSendMessage,
} from '@/hooks/useChat';
import { useChatWebSocket } from '@/hooks/useChatWebSocket';
import { usePresenceListener, usePresenceStore } from '@/hooks/usePresence';
import { getCurrentUser } from '@/hooks/useUsers';
import { useQueryClient } from '@tanstack/react-query';
import { Hash, LogIn, Send, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function Chat() {
	const [newMessage, setNewMessage] = useState('');
	const [globalConversationId, setGlobalConversationId] = useState<number | null>(null);
	const [chatroomTab, setChatroomTab] = useState<'all' | 'joined'>('joined');
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const typingTimeoutRef = useRef<number | null>(null);

	// Connect to presence WebSocket for real-time online status
	usePresenceListener();
	const onlineUserIds = usePresenceStore(state => state.onlineUserIds);

	const currentUser = getCurrentUser();

	// Chatroom queries
	const { data: allChatrooms, isLoading: allLoading, error: allError } = useAllChatrooms();
	const {
		data: joinedChatrooms,
		isLoading: joinedLoading,
		error: joinedError,
	} = useJoinedChatrooms();
	const joinChatroom = useJoinChatroom();

	// Use the appropriate list based on active tab
	const conversations = chatroomTab === 'all' ? allChatrooms : joinedChatrooms;
	const convLoading = chatroomTab === 'all' ? allLoading : joinedLoading;
	const convError = chatroomTab === 'all' ? allError : joinedError;

	// Debug logging
	useEffect(() => {
		console.log('Chat: currentUser =', currentUser);
		console.log('Chat: conversations =', conversations);
		console.log('Chat: convLoading =', convLoading);
		console.log('Chat: convError =', convError);
	}, [currentUser, conversations, convLoading, convError]);

	// Auto-select first conversation when loaded
	useEffect(() => {
		if (conversations && conversations.length > 0 && !globalConversationId) {
			console.log('Chat: Auto-selecting first conversation:', conversations[0].id);
			setGlobalConversationId(conversations[0].id);
		}
	}, [conversations, globalConversationId]);

	const { data: messages = [], isLoading } = useMessages(globalConversationId || 0);
	const sendMessage = useSendMessage(globalConversationId || 0);
	const queryClient = useQueryClient();

	// Participants state: map of userId -> { id, username, online, typing }
	const [participants, setParticipants] = useState<
		Record<number, { id: number; username?: string; online?: boolean; typing?: boolean }>
	>({});

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, []);

	// Keep chat scrolled to bottom when messages update
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	// Initialize participants from conversations data when selected conversation changes
	useEffect(() => {
		const conv = conversations?.find(c => c.id === globalConversationId);
		if (!conv) return;
		// Use participants property from Conversation type
		const usersList: any[] = conv.participants || [];
		if (usersList && usersList.length > 0) {
			const map: Record<number, any> = {};
			usersList.forEach((u: any) => {
				map[u.id] = { id: u.id, username: u.username || u.name, online: !!u.online, typing: false };
			});
			setParticipants(map);
		}
	}, [conversations, globalConversationId]);

	// WebSocket for real-time updates (messages, typing, presence)
	const chatWs = useChatWebSocket({
		conversationId: globalConversationId || 0,
		enabled: !!globalConversationId,
		onMessage: msg => {
			// append message into react-query cache for messages
			if (globalConversationId) {
				queryClient.setQueryData(['chat', 'messages', globalConversationId], (old: any) => {
					if (!old) return [msg];
					// ensure array
					if (Array.isArray(old)) {
						if (old.some((m: any) => m.id === msg.id)) return old;
						return [...old, msg];
					}
					return old;
				});
			}
		},
		onTyping: (userId, username, isTyping) => {
			setParticipants(prev => ({
				...(prev || {}),
				[userId]: {
					...(prev?.[userId] || { id: userId, username }),
					typing: isTyping,
					online: true,
				},
			}));
		},
		onPresence: (userId, username, status) => {
			const online = status === 'online' || status === 'connected';
			setParticipants(prev => ({
				...(prev || {}),
				[userId]: { ...(prev?.[userId] || { id: userId, username }), online },
			}));
		},
	});

	const handleSendMessage = () => {
		if (!newMessage.trim() || !globalConversationId) return;

		sendMessage.mutate(
			{
				content: newMessage,
				message_type: 'text',
			},
			{
				onSuccess: () => {
					setNewMessage('');
					// notify that user stopped typing
					try {
						chatWs?.sendTyping(false);
					} catch {}
				},
			}
		);
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	};

	const handleInputChange = (val: string) => {
		setNewMessage(val);
		// notify typing true, with debounce to send false
		try {
			chatWs?.sendTyping(true);
		} catch {}
		if (typingTimeoutRef.current) {
			window.clearTimeout(typingTimeoutRef.current);
		}
		typingTimeoutRef.current = window.setTimeout(() => {
			try {
				chatWs?.sendTyping(false);
			} catch {}
		}, 1500) as unknown as number;
	};

	const formatTimestamp = (timestamp: string) => {
		return new Date(timestamp).toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	const getUserColor = (userId: number) => {
		const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f39c12', '#9b59b6', '#e74c3c', '#3498db'];
		return colors[userId % colors.length];
	};

	return (
		<div className="h-screen bg-background flex flex-col overflow-hidden">
			<Navbar />

			{/* Show loading or error states */}
			{convError && (
				<div className="bg-destructive/15 border-b border-destructive p-4">
					<p className="text-sm text-destructive">
						Error loading conversations: {String(convError)}
					</p>
				</div>
			)}

			{convLoading && (
				<div className="bg-muted border-b border-border p-4">
					<p className="text-sm text-muted-foreground">Loading conversations...</p>
				</div>
			)}

			{conversations && conversations.length === 0 && !convLoading && (
				<div className="bg-amber-50 border-b border-amber-200 p-4">
					<p className="text-sm text-amber-800">
						No conversations found. Create one to get started!
					</p>
				</div>
			)}

			{/* Main chat container - full height, no scroll */}
			<div className="flex-1 flex overflow-hidden">
				{/* Left Sidebar - Chatrooms (15%) */}
				<div className="w-[15%] border-r bg-card flex flex-col overflow-hidden">
					<div className="p-4 border-b shrink-0">
						<h2 className="font-semibold text-sm flex items-center gap-2">
							<Hash className="w-4 h-4" />
							Chatrooms
						</h2>
					</div>

					{/* Tabs: ALL / JOINED */}
					<div className="flex border-b shrink-0">
						<button
							type="button"
							onClick={() => setChatroomTab('all')}
							className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
								chatroomTab === 'all'
									? 'text-primary border-b-2 border-primary bg-accent/50'
									: 'text-muted-foreground hover:text-foreground'
							}`}
						>
							ALL
						</button>
						<button
							type="button"
							onClick={() => setChatroomTab('joined')}
							className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
								chatroomTab === 'joined'
									? 'text-primary border-b-2 border-primary bg-accent/50'
									: 'text-muted-foreground hover:text-foreground'
							}`}
						>
							JOINED
						</button>
					</div>

					<ScrollArea className="flex-1">
						<div className="space-y-1 p-2">
							{convLoading ? (
								<div className="text-xs text-muted-foreground text-center py-8">
									Loading chatrooms...
								</div>
							) : convError ? (
								<div className="text-xs text-destructive text-center py-8">
									Error: {String(convError)}
								</div>
							) : conversations && conversations.length > 0 ? (
								conversations.map((room: Conversation & { is_joined?: boolean }) => {
									const isJoined = 'is_joined' in room ? room.is_joined : true;
									return (
										<div
											key={room.id}
											className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
												room.id === globalConversationId
													? 'bg-primary text-primary-foreground'
													: 'hover:bg-accent'
											}`}
										>
											<button
												type="button"
												className="w-full text-left"
												onClick={() => {
													if (isJoined) {
														setGlobalConversationId(room.id);
													}
												}}
												disabled={!isJoined}
											>
												<p className="font-medium truncate flex items-center gap-1">
													<Hash className="w-3 h-3 opacity-50" />
													{room.name || `Room ${room.id}`}
												</p>
												{room.last_message && isJoined && (
													<p className="text-xs opacity-75 truncate">{room.last_message.content}</p>
												)}
											</button>
											{!isJoined && chatroomTab === 'all' && (
												<Button
													size="sm"
													variant="outline"
													className="w-full mt-2 h-7 text-xs"
													onClick={() => joinChatroom.mutate(room.id)}
													disabled={joinChatroom.isPending}
												>
													<LogIn className="w-3 h-3 mr-1" />
													{joinChatroom.isPending ? 'Joining...' : 'Join'}
												</Button>
											)}
										</div>
									);
								})
							) : (
								<div className="text-xs text-muted-foreground text-center py-8">
									{chatroomTab === 'joined' ? 'No joined chatrooms' : 'No chatrooms available'}
								</div>
							)}
						</div>
					</ScrollArea>
				</div>

				{/* Center - Chat Window (70%) */}
				<div className="flex-1 flex flex-col overflow-hidden">
					<div className="border-b p-4 shrink-0 bg-card">
						<h3 className="font-semibold text-sm">
							{conversations?.find(c => c.id === globalConversationId)?.name ||
								`Room ${globalConversationId}`}
						</h3>
					</div>

					{/* Messages Area */}
					<ScrollArea
						className="flex-1 overflow-hidden"
						ref={scrollAreaRef}
					>
						<div className="space-y-3 p-6">
							{isLoading ? (
								<div className="text-center py-8 text-muted-foreground">Loading messages...</div>
							) : messages.length === 0 ? (
								<div className="text-center py-8 text-muted-foreground">
									No messages yet. Start the conversation!
								</div>
							) : (
								messages.map(msg => {
									const isOwnMessage = msg.sender_id === currentUser?.id;
									const sender = msg.sender;
									return (
										<div
											key={msg.id}
											className="flex items-start gap-3"
										>
											<Avatar className="w-8 h-8 shrink-0">
												<AvatarImage
													src={
														sender?.avatar ||
														`https://api.dicebear.com/7.x/avataaars/svg?seed=${sender?.username}`
													}
												/>
												<AvatarFallback className="text-xs">
													{sender?.username?.[0]?.toUpperCase() || 'U'}
												</AvatarFallback>
											</Avatar>
											<div className="flex-1 min-w-0">
												<div className="flex items-baseline gap-2 mb-1">
													<span
														className="font-semibold text-sm"
														style={{ color: getUserColor(msg.sender_id) }}
													>
														{isOwnMessage ? 'You' : sender?.username || 'Unknown'}
													</span>
													<span className="text-xs text-muted-foreground">
														{formatTimestamp(msg.created_at)}
													</span>
												</div>
												<p className="text-sm wrap-break-word">{msg.content}</p>
											</div>
										</div>
									);
								})
							)}

							{/* Typing indicators */}
							{Object.values(participants).some(p => p.typing) && (
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<span>
										{Object.values(participants)
											.filter(p => p.typing)
											.map(p => p.username)
											.join(', ')}{' '}
										is typing...
									</span>
								</div>
							)}

							<div ref={messagesEndRef} />
						</div>
					</ScrollArea>

					{/* Message Input */}
					<div className="border-t bg-card p-4 shrink-0">
						<div className="flex gap-2">
							<Input
								placeholder="Type a message..."
								value={newMessage}
								onChange={e => handleInputChange(e.target.value)}
								onKeyPress={handleKeyPress}
								className="flex-1"
							/>
							<Button
								onClick={handleSendMessage}
								disabled={!newMessage.trim()}
							>
								<Send className="w-4 h-4" />
							</Button>
						</div>
					</div>
				</div>

				{/* Right Sidebar - Participants (15%) */}
				<div className="w-[15%] border-l bg-card flex flex-col overflow-hidden">
					<div className="p-4 border-b shrink-0">
						<h2 className="font-semibold text-sm flex items-center gap-2">
							<Users className="w-4 h-4" />
							Members
						</h2>
					</div>
					<ScrollArea className="flex-1">
						<div className="space-y-2 p-2">
							{Object.values(participants).length > 0 ? (
								Object.values(participants).map(participant => {
									const isOnline = onlineUserIds.has(participant.id);
									return (
										<div
											key={participant.id}
											className="px-3 py-2 rounded-md text-sm"
										>
											<div className="flex items-center gap-2 mb-1">
												<div
													className={`w-2 h-2 rounded-full ${
														isOnline ? 'bg-green-500' : 'bg-gray-400'
													}`}
												/>
												<span className="truncate font-medium text-xs">
													{participant.username || `User ${participant.id}`}
												</span>
											</div>
											{participant.typing && (
												<p className="text-xs text-muted-foreground italic">typing...</p>
											)}
											{!participant.typing && !isOnline && (
												<p className="text-xs text-muted-foreground">offline</p>
											)}
										</div>
									);
								})
							) : (
								<div className="text-xs text-muted-foreground text-center py-8">No members</div>
							)}
						</div>
					</ScrollArea>
				</div>
			</div>
		</div>
	);
}
