import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Send } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/api/client'
import { UserMenu } from '@/components/UserMenu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  useCreateComment,
  useDeleteComment,
  usePostComments,
} from '@/hooks/useComments'
import { getCurrentUser } from '@/hooks/useUsers'
import { getAvatarUrl } from '@/lib/chat-utils'
import { logger } from '@/lib/logger'

export const PostComments = memo(function PostComments({
  postId,
}: {
  postId: number
}) {
  const [newComment, setNewComment] = useState('')
  const currentUser = getCurrentUser()
  const { data: comments = [], isLoading } = usePostComments(postId)
  const createCommentMutation = useCreateComment(postId)
  const queryClientLocal = useQueryClient()
  const deleteCommentMutation = useDeleteComment(postId)
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const handleCreateComment = useCallback(() => {
    if (!newComment.trim()) return
    createCommentMutation.mutate(
      { content: newComment },
      {
        onSuccess: () => {
          setNewComment('')
        },
        onError: error => {
          logger.error('Failed to create comment:', error)
          toast.error('Failed to post comment. Please try again.')
        },
      }
    )
  }, [newComment, createCommentMutation])

  const startEditComment = (commentId: number, text: string) => {
    setEditingCommentId(commentId)
    setEditingCommentText(text)
  }

  const cancelEditComment = () => {
    setEditingCommentId(null)
    setEditingCommentText('')
  }

  const saveEditComment = async (commentId: number) => {
    if (!editingCommentText.trim()) return
    try {
      await apiClient.updateComment(postId, commentId, {
        content: editingCommentText,
      })
      await queryClientLocal.invalidateQueries({
        queryKey: ['comments', 'list', postId],
      })
      cancelEditComment()
    } catch (err) {
      logger.error('Failed to update comment:', err)
      toast.error('Failed to update comment. Please try again.')
    }
  }

  const removeComment = (commentId: number) => {
    deleteCommentMutation.mutate(commentId, {
      onSuccess: () => {
        setConfirmDeleteId(null)
      },
      onError: err => {
        logger.error('Failed to delete comment:', err)
        toast.error('Failed to delete comment. Please try again.')
      },
    })
  }

  if (isLoading) {
    return (
      <div className='flex justify-center py-4'>
        <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
      </div>
    )
  }

  return (
    <div className='mt-6 pt-5 border-t'>
      <div className='space-y-3 mb-4'>
        {comments.map(comment => (
          <div key={comment.id} className='flex gap-3'>
            {comment.user && (
              <UserMenu user={comment.user}>
                <Avatar className='w-8 h-8 shrink-0 cursor-pointer hover:opacity-80'>
                  <AvatarImage
                    src={
                      comment.user.avatar || getAvatarUrl(comment.user.username)
                    }
                  />
                  <AvatarFallback className='text-xs'>
                    {comment.user.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </UserMenu>
            )}
            <div className='flex-1'>
              <div className='bg-muted/60 rounded-xl px-3 py-2'>
                <div className='flex items-center gap-2 mb-1'>
                  {comment.user ? (
                    <UserMenu user={comment.user}>
                      <span className='font-semibold text-sm cursor-pointer hover:underline'>
                        {comment.user.username}
                      </span>
                    </UserMenu>
                  ) : (
                    <span className='font-semibold text-sm'>Unknown</span>
                  )}
                  <span className='text-xs text-muted-foreground'>
                    {formatDistanceToNow(new Date(comment.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                {editingCommentId === comment.id ? (
                  <div>
                    <Textarea
                      value={editingCommentText}
                      onChange={e => setEditingCommentText(e.target.value)}
                      rows={2}
                      className='mb-2'
                    />
                    <div className='flex gap-2 justify-end'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={cancelEditComment}
                      >
                        Cancel
                      </Button>
                      <Button
                        size='sm'
                        onClick={() => saveEditComment(comment.id)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className='text-sm'>{comment.content}</p>
                )}

                {currentUser && currentUser.id === comment.user_id && (
                  <div className='flex gap-2 mt-2 text-sm'>
                    {confirmDeleteId === comment.id ? (
                      <>
                        <span className='text-muted-foreground text-xs self-center'>
                          Delete this comment?
                        </span>
                        <Button
                          variant='link'
                          size='sm'
                          className='h-auto p-0 text-destructive'
                          onClick={() => removeComment(comment.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant='link'
                          size='sm'
                          className='h-auto p-0'
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant='link'
                          size='sm'
                          className='h-auto p-0'
                          onClick={() =>
                            startEditComment(comment.id, comment.content)
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          variant='link'
                          size='sm'
                          className='h-auto p-0 text-destructive'
                          onClick={() => setConfirmDeleteId(comment.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {currentUser && (
        <div className='flex gap-3'>
          <Avatar className='w-8 h-8 shrink-0'>
            <AvatarImage
              src={currentUser.avatar || getAvatarUrl(currentUser.username)}
            />
            <AvatarFallback className='text-xs'>
              {currentUser.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className='flex-1 flex gap-2'>
            <Textarea
              placeholder='Write a comment...'
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              className='resize-none text-sm'
              rows={2}
              disabled={createCommentMutation.isPending}
            />
            <Button
              size='sm'
              onClick={handleCreateComment}
              disabled={!newComment.trim() || createCommentMutation.isPending}
              className='self-end'
            >
              {createCommentMutation.isPending ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                <Send className='w-4 h-4' />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})
