import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { memo } from 'react';

const USER_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f39c12', '#9b59b6', '#e74c3c', '#3498db'];

const getUserColor = (userId: number) => {
	return USER_COLORS[userId % USER_COLORS.length];
};

const formatTimestamp = (timestamp: string) => {
	return new Date(timestamp).toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
	});
};

interface Message {
	id: number;
	content: string;
	sender_id: number;
	created_at: string;
	sender?: {
		id: number;
		username: string;
		avatar?: string;
	};
}

interface MessageListProps {
	messages: Message[];
	isLoading: boolean;
	currentUserId?: number;
}

export const MessageList = memo(function MessageList({
	messages,
	isLoading,
	currentUserId,
}: MessageListProps) {
	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
				Loading messages...
			</div>
		);
	}

	if (messages.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
				No messages yet. Start the conversation!
			</div>
		);
	}

	return (
		<div className="space-y-4 p-6">
			{messages.map(msg => {
				const isOwnMessage = msg.sender_id === currentUserId;
				const sender = msg.sender;

				return (
					<div
						key={msg.id}
						className="flex items-start gap-3 group"
					>
						<Avatar className="w-8 h-8 shrink-0 mt-0.5">
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
							<div className="flex items-baseline gap-2 mb-0.5">
								<span
									className="font-semibold text-sm"
									style={{
										color: getUserColor(msg.sender_id),
									}}
								>
									{isOwnMessage ? 'You' : sender?.username || 'Unknown'}
								</span>
								<span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
									{formatTimestamp(msg.created_at)}
								</span>
							</div>
							<p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-foreground/90">
								{msg.content}
							</p>
						</div>
					</div>
				);
			})}
		</div>
	);
});
