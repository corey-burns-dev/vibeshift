// WebSocket hook for real-time chat

import type { Message } from "@/api/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

interface ChatWebSocketMessage {
	type: "message" | "typing" | "presence" | "connected" | "joined" | "read";
	conversation_id?: number;
	user_id?: number;
	username?: string;
	payload?: any;
}

interface UseChatWebSocketOptions {
	conversationId: number;
	enabled?: boolean;
	onMessage?: (message: Message) => void;
	onTyping?: (userId: number, username: string, isTyping: boolean) => void;
	onPresence?: (userId: number, username: string, status: string) => void;
}

export function useChatWebSocket({
	conversationId,
	enabled = true,
	onMessage,
	onTyping,
	onPresence,
}: UseChatWebSocketOptions) {
	const [isConnected, setIsConnected] = useState(false);
	const [isJoined, setIsJoined] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const queryClient = useQueryClient();
	const reconnectTimeoutRef = useRef<number>();

	const connect = useCallback(() => {
		if (!enabled) return;

		const token = localStorage.getItem("token");
		if (!token) {
			console.error("No auth token found");
			return;
		}

		// Close existing connection
		if (wsRef.current) {
			wsRef.current.close();
		}

		// Create WebSocket connection
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const host = window.location.hostname;
		const port = import.meta.env.VITE_API_PORT || "8080";
		const wsUrl = `${protocol}//${host}:${port}/api/ws/chat?token=${token}`;

		console.log("Connecting to WebSocket:", wsUrl);
		const ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			console.log("WebSocket connected");
			setIsConnected(true);

			// Join the conversation
			ws.send(
				JSON.stringify({
					type: "join",
					conversation_id: conversationId,
				}),
			);
		};

		ws.onmessage = (event) => {
			try {
				const data: ChatWebSocketMessage = JSON.parse(event.data);
				console.log("WebSocket message:", data);

				switch (data.type) {
					case "connected":
						console.log("WebSocket authenticated");
						break;

					case "joined":
						console.log("Joined conversation:", data.conversation_id);
						setIsJoined(true);
						break;

					case "message":
						// Add message to cache
						if (data.payload && data.conversation_id === conversationId) {
							const message = data.payload as Message;

							// Update messages cache
							queryClient.setQueryData<Message[]>(
								["chat", "messages", conversationId],
								(old) => {
									if (!old) return [message];
									// Avoid duplicates
									if (old.some((m) => m.id === message.id)) return old;
									return [...old, message];
								},
							);

							// Call callback
							if (onMessage) {
								onMessage(message);
							}
						}
						break;

					case "typing":
						if (data.payload && onTyping) {
							const { user_id, username, is_typing } = data.payload;
							onTyping(user_id, username, is_typing);
						}
						break;

					case "presence":
						if (data.payload && onPresence) {
							const { user_id, username, status } = data.payload;
							onPresence(user_id, username, status);
						}
						break;

					case "read":
						// Invalidate messages to refresh read status
						queryClient.invalidateQueries({
							queryKey: ["chat", "messages", conversationId],
						});
						break;
				}
			} catch (error) {
				console.error("Failed to parse WebSocket message:", error);
			}
		};

		ws.onerror = (error) => {
			console.error("WebSocket error:", error);
		};

		ws.onclose = () => {
			console.log("WebSocket disconnected");
			setIsConnected(false);
			setIsJoined(false);

			// Attempt to reconnect after 3 seconds
			if (enabled) {
				reconnectTimeoutRef.current = window.setTimeout(() => {
					console.log("Attempting to reconnect...");
					connect();
				}, 3000);
			}
		};

		wsRef.current = ws;
	}, [conversationId, enabled, onMessage, onTyping, onPresence, queryClient]);

	// Connect on mount and when conversation changes
	useEffect(() => {
		connect();

		return () => {
			// Leave conversation before disconnecting
			if (wsRef.current && isJoined) {
				wsRef.current.send(
					JSON.stringify({
						type: "leave",
						conversation_id: conversationId,
					}),
				);
			}

			// Close connection
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}

			// Clear reconnect timeout
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
		};
	}, [connect, conversationId, isJoined]);

	// Send typing indicator
	const sendTyping = useCallback(
		(isTyping: boolean) => {
			if (wsRef.current && isConnected && isJoined) {
				wsRef.current.send(
					JSON.stringify({
						type: "typing",
						conversation_id: conversationId,
						is_typing: isTyping,
					}),
				);
			}
		},
		[conversationId, isConnected, isJoined],
	);

	// Send message via WebSocket (alternative to HTTP)
	const sendMessage = useCallback(
		(content: string) => {
			if (wsRef.current && isConnected && isJoined) {
				wsRef.current.send(
					JSON.stringify({
						type: "message",
						conversation_id: conversationId,
						content,
					}),
				);
			}
		},
		[conversationId, isConnected, isJoined],
	);

	// Mark as read
	const markAsRead = useCallback(() => {
		if (wsRef.current && isConnected && isJoined) {
			wsRef.current.send(
				JSON.stringify({
					type: "read",
					conversation_id: conversationId,
				}),
			);
		}
	}, [conversationId, isConnected, isJoined]);

	return {
		isConnected,
		isJoined,
		sendTyping,
		sendMessage,
		markAsRead,
	};
}
