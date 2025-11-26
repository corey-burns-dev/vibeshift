import type { Conversation } from "@/api/types";
import { Navbar } from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations, useMessages, useSendMessage } from "@/hooks/useChat";
import { getCurrentUser } from "@/hooks/useUsers";
import { MessageCircle, Send, Settings, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function Chat() {
	const [newMessage, setNewMessage] = useState("");
	const [globalConversationId, setGlobalConversationId] = useState<number>(1); // Default to conversation 1 for now
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const currentUser = getCurrentUser();
	const { data: conversations } = useConversations();
	const { data: messages = [], isLoading } = useMessages(globalConversationId);
	const sendMessage = useSendMessage(globalConversationId);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const handleSendMessage = () => {
		if (!newMessage.trim()) return;

		sendMessage.mutate(
			{
				content: newMessage,
				message_type: "text",
			},
			{
				onSuccess: () => {
					setNewMessage("");
				},
			},
		);
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	};

	const formatTimestamp = (timestamp: string) => {
		return new Date(timestamp).toLocaleTimeString("en-US", {
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const getUserColor = (userId: number) => {
		const colors = [
			"#ff6b6b",
			"#4ecdc4",
			"#45b7d1",
			"#f39c12",
			"#9b59b6",
			"#e74c3c",
			"#3498db",
		];
		return colors[userId % colors.length];
	};

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
										{isLoading ? (
											<div className="text-center py-8 text-muted-foreground">
												Loading messages...
											</div>
										) : messages.length === 0 ? (
											<div className="text-center py-8 text-muted-foreground">
												No messages yet. Start the conversation!
											</div>
										) : (
											messages.map((msg) => {
												const isOwnMessage = msg.sender_id === currentUser?.id;
												const sender = msg.sender;
												return (
													<div
														key={msg.id}
														className="flex items-start gap-3 group"
													>
														<Avatar className="w-8 h-8 shrink-0">
															<AvatarImage
																src={
																	sender?.avatar ||
																	`https://api.dicebear.com/7.x/avataaars/svg?seed=${sender?.username}`
																}
															/>
															<AvatarFallback className="text-xs">
																{sender?.username?.[0].toUpperCase() || "U"}
															</AvatarFallback>
														</Avatar>
														<div className="flex-1 min-w-0">
															<div className="flex items-baseline gap-2 mb-1">
																<span
																	className="font-semibold text-sm"
																	style={{ color: getUserColor(msg.sender_id) }}
																>
																	{isOwnMessage
																		? "You"
																		: sender?.username || "Unknown"}
																</span>
																<span className="text-xs text-muted-foreground">
																	{formatTimestamp(msg.created_at)}
																</span>
															</div>
															<p className="text-sm wrap-break-word">
																{msg.content}
															</p>
														</div>
													</div>
												);
											})
										)}
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
										<Button
											onClick={handleSendMessage}
											disabled={!newMessage.trim()}
										>
											<Send className="w-4 h-4" />
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Sidebar */}
					<div className="space-y-6 lg:flex lg:flex-col">
						{/* Conversations */}
						<Card className="lg:flex-1">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-lg">
									<Users className="w-5 h-5" />
									Conversations ({conversations?.length || 0})
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-3">
									{conversations && conversations.length > 0 ? (
										conversations.map((conversation: Conversation) => (
											<button
												type="button"
												key={conversation.id}
												className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted ${
													conversation.id === globalConversationId
														? "bg-muted"
														: ""
												}`}
												onClick={() => setGlobalConversationId(conversation.id)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														setGlobalConversationId(conversation.id);
													}
												}}
												aria-pressed={conversation.id === globalConversationId}
											>
												<Avatar className="w-8 h-8">
													<AvatarImage
														src={
															conversation.avatar ||
															`https://api.dicebear.com/7.x/avataaars/svg?seed=${conversation.id}`
														}
													/>
													<AvatarFallback className="text-xs">
														{conversation.name?.[0]?.toUpperCase() || "C"}
													</AvatarFallback>
												</Avatar>
												<div className="flex-1 min-w-0">
													<p className="text-sm font-medium truncate">
														{conversation.name ||
															`Conversation ${conversation.id}`}
													</p>
													{conversation.last_message && (
														<p className="text-xs text-muted-foreground truncate">
															{conversation.last_message.content}
														</p>
													)}
												</div>
											</button>
										))
									) : (
										<div className="text-xs text-muted-foreground text-center py-4">
											No conversations yet
										</div>
									)}
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
	);
}
