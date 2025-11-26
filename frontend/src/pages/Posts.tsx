// External libraries

import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Heart, Loader2, MessageCircle, Send } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
// API
import { apiClient } from "@/api/client";
// Types
import type { Post } from "@/api/types";

// Components
import { Navbar } from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

// Hooks
import {
	useCreateComment,
	useDeleteComment,
	usePostComments,
} from "@/hooks/useComments";
import {
	useCreatePost,
	useDeletePost,
	useInfinitePosts,
	useLikePost,
	useUnlikePost,
} from "@/hooks/usePosts";
import { getCurrentUser, useIsAuthenticated } from "@/hooks/useUsers";

function handleAuthOrFKError(error: unknown) {
	let msg: string;
	if (
		typeof error === "object" &&
		error &&
		"message" in error &&
		typeof (error as { message?: unknown }).message === "string"
	) {
		msg = (error as { message: string }).message;
	} else {
		msg = String(error);
	}
	if (
		msg.includes("401") ||
		msg.includes("403") ||
		msg.toLowerCase().includes("unauthorized") ||
		msg.toLowerCase().includes("forbidden") ||
		msg.includes("foreign key constraint")
	) {
		localStorage.removeItem("token");
		localStorage.removeItem("user");
		alert(
			"Your session is invalid or your user no longer exists. Please log in again.",
		);
		window.location.href = "/login";
		return true;
	}
	return false;
}

// Component for individual post comments
const PostComments = memo(function PostComments({
	postId,
}: {
	postId: number;
}) {
	const [newComment, setNewComment] = useState("");
	const currentUser = getCurrentUser();
	const { data: comments = [], isLoading } = usePostComments(postId);
	const createCommentMutation = useCreateComment(postId);
	const queryClientLocal = useQueryClient();
	const deleteCommentMutation = useDeleteComment(postId);
	const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
	const [editingCommentText, setEditingCommentText] = useState("");

	const handleCreateComment = useCallback(() => {
		if (!newComment.trim()) return;
		createCommentMutation.mutate(
			{ content: newComment },
			{
				onSuccess: () => {
					setNewComment("");
				},
				onError: (error) => {
					console.error("Failed to create comment:", error);
				},
			},
		);
	}, [newComment, createCommentMutation]);

	const startEditComment = (commentId: number, text: string) => {
		setEditingCommentId(commentId);
		setEditingCommentText(text);
	};

	const cancelEditComment = () => {
		setEditingCommentId(null);
		setEditingCommentText("");
	};

	const saveEditComment = async (commentId: number) => {
		if (!editingCommentText.trim()) return;
		try {
			await apiClient.updateComment(postId, commentId, {
				content: editingCommentText,
			});
			await queryClientLocal.invalidateQueries({
				queryKey: ["comments", "list", postId],
			});
			cancelEditComment();
		} catch (err) {
			console.error("Failed to update comment:", err);
		}
	};

	const removeComment = (commentId: number) => {
		deleteCommentMutation.mutate(commentId, {
			onError: (err) => console.error("Failed to delete comment:", err),
		});
	};

	if (isLoading) {
		return (
			<div className="flex justify-center py-4">
				<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="mt-4 pt-4 border-t">
			{/* Existing Comments */}
			<div className="space-y-3 mb-4">
				{comments.map((comment) => (
					<div key={comment.id} className="flex gap-3">
						<Avatar className="w-8 h-8 shrink-0">
							<AvatarImage
								src={
									comment.user?.avatar ||
									`https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.user?.username}`
								}
							/>
							<AvatarFallback className="text-xs">
								{comment.user?.username?.[0]?.toUpperCase() || "U"}
							</AvatarFallback>
						</Avatar>
						<div className="flex-1">
							<div className="bg-muted rounded-lg px-3 py-2">
								<div className="flex items-center gap-2 mb-1">
									<span className="font-semibold text-sm">
										{comment.user?.username}
									</span>
									<span className="text-xs text-muted-foreground">
										{formatDistanceToNow(new Date(comment.created_at), {
											addSuffix: true,
										})}
									</span>
								</div>
								{editingCommentId === comment.id ? (
									<div>
										<Textarea
											value={editingCommentText}
											onChange={(e) => setEditingCommentText(e.target.value)}
											rows={2}
											className="mb-2"
										/>
										<div className="flex gap-2 justify-end">
											<Button
												size="sm"
												variant="outline"
												onClick={cancelEditComment}
											>
												Cancel
											</Button>
											<Button
												size="sm"
												onClick={() => saveEditComment(comment.id)}
											>
												Save
											</Button>
										</div>
									</div>
								) : (
									<p className="text-sm">{comment.content}</p>
								)}

								{/* Comment actions */}
								{currentUser && currentUser.id === comment.user_id && (
									<div className="flex gap-2 mt-2 text-sm">
										<button
											type="button"
											className="text-blue-500"
											onClick={() =>
												startEditComment(comment.id, comment.content)
											}
										>
											Edit
										</button>
										<button
											type="button"
											className="text-red-500"
											onClick={() => removeComment(comment.id)}
										>
											Delete
										</button>
									</div>
								)}
							</div>
						</div>
					</div>
				))}
			</div>
			{/* Add Comment */}
			{currentUser && (
				<div className="flex gap-3">
					<Avatar className="w-8 h-8 shrink-0">
						<AvatarImage
							src={
								currentUser.avatar ||
								`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`
							}
						/>
						<AvatarFallback className="text-xs">
							{currentUser.username?.[0]?.toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="flex-1 flex gap-2">
						<Textarea
							placeholder="Write a comment..."
							value={newComment}
							onChange={(e) => setNewComment(e.target.value)}
							className="resize-none text-sm"
							rows={2}
							disabled={createCommentMutation.isPending}
						/>
						<Button
							size="sm"
							onClick={handleCreateComment}
							disabled={!newComment.trim() || createCommentMutation.isPending}
							className="self-end"
						>
							{createCommentMutation.isPending ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Send className="w-4 h-4" />
							)}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
});

export default function Posts() {
	const [newPostTitle, setNewPostTitle] = useState("");
	const [newPostContent, setNewPostContent] = useState("");
	const [expandedComments, setExpandedComments] = useState<Set<number>>(
		new Set(),
	);

	const isAuthenticated = useIsAuthenticated();
	const currentUser = getCurrentUser();
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
		useInfinitePosts(10);
	const createPostMutation = useCreatePost();
	const likePostMutation = useLikePost();
	const _unlikePostMutation = useUnlikePost();
	const deletePostMutation = useDeletePost();
	const [editingPostId, setEditingPostId] = useState<number | null>(null);
	const [editingPostTitle, setEditingPostTitle] = useState("");
	const [editingPostContent, setEditingPostContent] = useState("");
	const queryClient = useQueryClient();
	const debounceRef = useRef<number | null>(null);
	const [likingPostId, setLikingPostId] = useState<number | null>(null);

	// Flatten pages into single array of posts
	const posts = data?.pages.flat() ?? [];

	// Infinite scroll with debouncing
	const handleScroll = useCallback(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}
		debounceRef.current = setTimeout(() => {
			if (
				window.innerHeight + window.scrollY >=
					document.documentElement.scrollHeight - 500 &&
				hasNextPage &&
				!isFetchingNextPage
			) {
				fetchNextPage();
			}
		}, 200);
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	useEffect(() => {
		window.addEventListener("scroll", handleScroll);
		return () => {
			window.removeEventListener("scroll", handleScroll);
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [handleScroll]);

	const handleNewPost = () => {
		if (!newPostTitle.trim() || !newPostContent.trim()) return;

		createPostMutation.mutate(
			{
				title: newPostTitle,
				content: newPostContent,
			},
			{
				onSuccess: () => {
					setNewPostTitle("");
					setNewPostContent("");
					// Invalidate posts query to refresh the list
					queryClient.invalidateQueries({ queryKey: ["posts"] });
				},
				onError: (error) => {
					if (!handleAuthOrFKError(error)) {
						console.error("Failed to create post:", error);
					}
				},
			},
		);
	};

	const toggleComments = (postId: number) => {
		setExpandedComments((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(postId)) {
				newSet.delete(postId);
			} else {
				newSet.add(postId);
			}
			return newSet;
		});
	};

	const handleLikeToggle = (post: Post) => {
		if (likingPostId === post.id) return; // Prevent double-clicks

		setLikingPostId(post.id);
		// Backend now handles toggle logic automatically
		likePostMutation.mutate(post.id, {
			onSuccess: () => {
				setLikingPostId(null);
			},
			onError: (error) => {
				setLikingPostId(null);
				console.error("Failed to toggle like:", error);
			},
		});
	};

	const startEditPost = (post: Post) => {
		setEditingPostId(post.id);
		setEditingPostTitle(post.title ?? "");
		setEditingPostContent(post.content ?? "");
	};

	const cancelEditPost = () => {
		setEditingPostId(null);
		setEditingPostTitle("");
		setEditingPostContent("");
	};

	const saveEditPost = async (postId: number) => {
		if (!editingPostTitle.trim() || !editingPostContent.trim()) return;
		try {
			await apiClient.updatePost(postId, {
				title: editingPostTitle,
				content: editingPostContent,
			});
			await queryClient.invalidateQueries({ queryKey: ["posts"] });
			cancelEditPost();
		} catch (err) {
			console.error("Failed to update post:", err);
		}
	};

	const removePost = (postId: number) => {
		deletePostMutation.mutate(postId, {
			onError: (err) => console.error("Failed to delete post:", err),
		});
	};

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background">
				<Navbar />
				<div className="max-w-2xl mx-auto px-4 py-6 flex justify-center">
					<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			<Navbar />

			<div className="max-w-2xl mx-auto px-4 py-6">
				{/* Create Post */}
				{isAuthenticated && (
					<Card className="mb-6">
						<CardHeader>
							<div className="flex items-center gap-3">
								<Avatar>
									<AvatarImage
										src={
											currentUser?.avatar ||
											`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.username}`
										}
									/>
									<AvatarFallback>
										{currentUser?.username?.[0]?.toUpperCase() || "U"}
									</AvatarFallback>
								</Avatar>
								<div>
									<p className="font-semibold">Create Post</p>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<input
								type="text"
								placeholder="Post title..."
								value={newPostTitle}
								onChange={(e) => setNewPostTitle(e.target.value)}
								className="w-full mb-3 px-3 py-2 border rounded-md"
								disabled={createPostMutation.isPending}
							/>
							<Textarea
								placeholder="What's on your mind?"
								value={newPostContent}
								onChange={(e) => setNewPostContent(e.target.value)}
								className="mb-3 resize-none"
								rows={3}
								disabled={createPostMutation.isPending}
							/>
							<div className="flex justify-end">
								<Button
									onClick={handleNewPost}
									disabled={
										!newPostTitle.trim() ||
										!newPostContent.trim() ||
										createPostMutation.isPending
									}
								>
									{createPostMutation.isPending ? (
										<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									) : (
										<Send className="w-4 h-4 mr-2" />
									)}
									Post
								</Button>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Posts Feed */}
				<div className="space-y-6">
					{posts.map((post) => (
						<Card key={post.id}>
							<CardHeader>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<Avatar>
											<AvatarImage
												src={
													post.user?.avatar ||
													`https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.username}`
												}
											/>
											<AvatarFallback>
												{post.user?.username?.[0]?.toUpperCase() || "U"}
											</AvatarFallback>
										</Avatar>
										<div>
											<p className="font-semibold">{post.user?.username}</p>
											<p className="text-sm text-muted-foreground">
												{formatDistanceToNow(new Date(post.created_at), {
													addSuffix: true,
												})}
											</p>
										</div>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								{editingPostId === post.id ? (
									<div>
										<input
											type="text"
											value={editingPostTitle}
											onChange={(e) => setEditingPostTitle(e.target.value)}
											className="w-full mb-2 px-3 py-2 border rounded-md"
										/>
										<Textarea
											value={editingPostContent}
											onChange={(e) => setEditingPostContent(e.target.value)}
											rows={4}
											className="mb-2"
										/>
										<div className="flex justify-end gap-2">
											<Button
												size="sm"
												variant="outline"
												onClick={cancelEditPost}
											>
												Cancel
											</Button>
											<Button size="sm" onClick={() => saveEditPost(post.id)}>
												Save
											</Button>
										</div>
									</div>
								) : (
									<>
										<h3 className="font-semibold text-lg mb-2">{post.title}</h3>
										<p className="mb-4">{post.content}</p>
									</>
								)}

								{post.image_url && (
									<div className="mb-4 rounded-lg overflow-hidden">
										<img
											src={post.image_url}
											alt={`Post: ${post.title}`}
											className="w-full h-auto object-cover"
											loading="lazy"
										/>
									</div>
								)}

								<div className="flex items-center justify-between pt-4 border-t">
									<div className="flex items-center gap-6">
										<Button
											variant={post.liked ? "default" : "ghost"}
											size="sm"
											onClick={() => handleLikeToggle(post)}
											disabled={!isAuthenticated || likingPostId === post.id}
											aria-label={`Like post by ${post.user?.username}`}
										>
											<Heart
												className={`w-4 h-4 mr-2 ${post.liked ? "fill-current" : ""}`}
											/>
											{post.likes_count}
										</Button>
										{/* Post owner actions */}
										{currentUser && currentUser.id === post.user_id && (
											<>
												<Button
													size="sm"
													variant="outline"
													onClick={() => startEditPost(post)}
												>
													Edit
												</Button>
												<Button
													size="sm"
													variant="destructive"
													onClick={() => removePost(post.id)}
												>
													Delete
												</Button>
											</>
										)}
										<Button
											variant="ghost"
											size="sm"
											onClick={() => toggleComments(post.id)}
											className={
												expandedComments.has(post.id) ? "text-blue-500" : ""
											}
											aria-label={`${
												expandedComments.has(post.id) ? "Hide" : "Show"
											} comments for post by ${post.user?.username}`}
										>
											<MessageCircle className="w-4 h-4 mr-2" />
											{`Comments (${post.comments_count ?? 0})`}
										</Button>
									</div>
								</div>

								{/* Comments Section */}
								{expandedComments.has(post.id) && (
									<PostComments postId={post.id} />
								)}
							</CardContent>
						</Card>
					))}

					{/* Loading indicator for infinite scroll */}
					{isFetchingNextPage && (
						<div className="flex justify-center py-4">
							<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
						</div>
					)}

					{/* End of feed */}
					{!hasNextPage && posts.length > 0 && (
						<div className="text-center py-4 text-muted-foreground text-sm">
							You've reached the end!
						</div>
					)}

					{/* Empty state */}
					{posts.length === 0 && (
						<div className="text-center py-12">
							<p className="text-muted-foreground mb-4">No posts yet</p>
							{isAuthenticated && (
								<p className="text-sm">Be the first to create a post!</p>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
