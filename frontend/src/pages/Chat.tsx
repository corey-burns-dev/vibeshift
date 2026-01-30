import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { MessageList } from '@/components/chat/MessageList';
import { ParticipantsList } from '@/components/chat/ParticipantsList';
import { Navbar } from '@/components/Navbar';
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
import { usePresenceStore } from '@/hooks/usePresence';
import { getCurrentUser } from '@/hooks/useUsers';
import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function Chat() {
	const [newMessage, setNewMessage] = useState('');
	const [globalConversationId, setGlobalConversationId] = useState<number | null>(null);
	const [chatroomTab, setChatroomTab] = useState<'all' | 'joined'>('joined');
	const [messageError, setMessageError] = useState<string | null>(null);
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const onlineUserIds = usePresenceStore(state => state.onlineUserIds);
	const setOnline = usePresenceStore(state => state.setOnline);
	const setOffline = usePresenceStore(state => state.setOffline);
	const setInitialOnlineUsers = usePresenceStore(state => state.setInitialOnlineUsers);

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

	// Auto-select first conversation when loaded
	useEffect(() => {
		if (conversations && conversations.length > 0 && !globalConversationId) {
			setGlobalConversationId(conversations[0].id);
		}
	}, [conversations, globalConversationId]);

	const { data: messages = [], isLoading } = useMessages(globalConversationId || 0);
	const sendMessage = useSendMessage(globalConversationId || 0);
	const queryClient = useQueryClient();

	// Participants state
	const [participants, setParticipants] = useState<
		Record<number, { id: number; username?: string; online?: boolean; typing?: boolean }>
	>({});

	// Keep chat scrolled to bottom when messages update
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	// Initialize participants from conversations data
	useEffect(() => {
		const conv = conversations?.find(c => c.id === globalConversationId);
		if (!conv) return;
		const usersList: any[] = conv.participants || [];
		const map: Record<number, any> = {};

		if (currentUser) {
			map[currentUser.id] = {
				id: currentUser.id,
				username: currentUser.username,
				online: true,
				typing: false,
			};
		}

		if (usersList && usersList.length > 0) {
			usersList.forEach((u: any) => {
				if (!currentUser || u.id !== currentUser.id) {
					map[u.id] = {
						id: u.id,
						username: u.username || u.name,
						online: !!u.online,
						typing: false,
					};
				}
			});
		}

		setParticipants(map);
	}, [conversations, globalConversationId, currentUser?.id]);

	// WebSocket handlers
	const onMessage = useCallback(
		(msg: any) => {
			if (globalConversationId) {
				queryClient.setQueryData(['chat', 'messages', globalConversationId], (old: any) => {
					if (!old) return [msg];
					if (Array.isArray(old)) {
						if (old.some((m: any) => m.id === msg.id)) return old;
						return [...old, msg];
					}
					return old;
				});
			}
		},
		[globalConversationId, queryClient]
	);

	const onPresence = useCallback(
		(userId: number, username: string, status: string) => {
			const online = status === 'online' || status === 'connected';
			setParticipants(prev => ({
				...prev,
				[userId]: { ...(prev?.[userId] || { id: userId, username }), online },
			}));
			if (status === 'online') setOnline(userId);
			else setOffline(userId);
		},
		[setOnline, setOffline]
	);

	const onConnectedUsers = useCallback(
		(userIds: number[]) => {
			setInitialOnlineUsers(userIds);
		},
		[setInitialOnlineUsers]
	);

	const onParticipantsUpdate = useCallback(
		(participantsList: any) => {
			if (Array.isArray(participantsList)) {
				const map: Record<number, any> = {};
				if (currentUser) {
					map[currentUser.id] = {
						id: currentUser.id,
						username: currentUser.username,
						online: true,
						typing: false,
					};
				}
				participantsList.forEach((u: any) => {
					if (!currentUser || u.id !== currentUser.id) {
						map[u.id] = {
							id: u.id,
							username: u.username || u.name,
							online: !!u.online,
							typing: false,
						};
					}
				});
				setParticipants(map);
			}
		},
		[currentUser]
	);

	const { isJoined } = useChatWebSocket({
		conversationId: globalConversationId || 0,
		enabled: !!globalConversationId,
		onMessage,
		onPresence,
		onConnectedUsers,
		onParticipantsUpdate,
	});

	const handleSendMessage = useCallback(() => {
		if (!newMessage.trim() || !globalConversationId) return;

		const messageSize = new Blob([newMessage]).size;
		if (messageSize > 512) {
			setMessageError(`Message too long (${messageSize}/512 bytes)`);
			setTimeout(() => setMessageError(null), 3000);
			return;
		}

		setMessageError(null);
		sendMessage.mutate(
			{ content: newMessage, message_type: 'text' },
			{ onSuccess: () => setNewMessage('') }
		);
	}, [newMessage, globalConversationId, sendMessage]);

	const handleKeyPress = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				handleSendMessage();
			}
		},
		[handleSendMessage]
	);

	const handleInputChange = useCallback((val: string) => {
		setNewMessage(val);
	}, []);

	const handleSelectConversation = useCallback((id: number) => {
		setGlobalConversationId(id);
	}, []);

	const handleJoinConversation = useCallback(
		(id: number) => {
			joinChatroom.mutate(id);
		},
		[joinChatroom]
	);

	return (
		<div className="h-screen bg-background flex flex-col overflow-hidden">
			<Navbar />

			{/* Error/Loading Banners */}
			{convError && (
				<div className="bg-destructive/15 border-b border-destructive p-4">
					<p className="text-sm text-destructive">
						Error loading conversations: {String(convError)}
					</p>
				</div>
			)}
			{/* ... other banners if needed ... */}

			<div className="flex-1 flex overflow-hidden">
				<ChatSidebar
					activeTab={chatroomTab}
					setActiveTab={setChatroomTab}
					conversations={conversations}
					isLoading={convLoading}
					error={convError}
					selectedId={globalConversationId}
					onSelect={handleSelectConversation}
					onJoin={handleJoinConversation}
					isJoining={joinChatroom.isPending}
				/>

				{/* Center - Chat Window */}
				<div className="flex-1 flex flex-col overflow-hidden">
					<div className="border-b p-4 shrink-0 bg-card">
						<h3 className="font-semibold text-sm">
							{conversations?.find(c => c.id === globalConversationId)?.name ||
								`Room ${globalConversationId}`}
						</h3>
					</div>

					<ScrollArea
						className="flex-1 overflow-hidden"
						ref={scrollAreaRef}
					>
						<MessageList
							messages={messages}
							isLoading={isLoading}
							currentUserId={currentUser?.id}
						/>
						<div ref={messagesEndRef} />
					</ScrollArea>

					{/* Message Input */}
					<div className="border-t bg-card p-4 shrink-0">
						{messageError && <p className="text-xs text-destructive mb-2">{messageError}</p>}
						<div className="flex gap-2">
							<Input
								placeholder={isJoined ? 'Type a message...' : 'Joining conversation...'}
								value={newMessage}
								onChange={e => handleInputChange(e.target.value)}
								onKeyDown={handleKeyPress}
								disabled={!isJoined}
								className="flex-1"
							/>
							<Button
								onClick={handleSendMessage}
								disabled={!newMessage.trim() || !isJoined}
							>
								<Send className="w-4 h-4" />
							</Button>
						</div>
					</div>
				</div>

				<ParticipantsList
					participants={participants}
					onlineUserIds={onlineUserIds}
				/>
			</div>
		</div>
	);
}
