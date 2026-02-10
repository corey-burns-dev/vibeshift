import { logger } from '../lib/logger'
import type {
  AdminSanctumRequestActionResponse,
  AdminSanctumRequestStatus,
  AuthResponse,
  Comment,
  Conversation,
  CreateCommentRequest,
  CreateConversationRequest,
  CreatePostRequest,
  CreateSanctumRequestInput,
  CreateStreamRequest,
  FriendRequest,
  FriendshipStatus,
  GameRoom,
  LoginRequest,
  Message,
  PaginationParams,
  Post,
  SanctumDTO,
  SanctumRequest,
  SearchParams,
  SendMessageRequest,
  SignupRequest,
  Stream,
  StreamMessage,
  StreamsResponse,
  UpdateCommentRequest,
  UpdatePostRequest,
  UpdateProfileRequest,
  UpdateStreamRequest,
  User,
} from './types'

// Add a custom error type that includes request ID
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public requestId?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8375/api'

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private getAuthToken(): string | null {
    return localStorage.getItem('token')
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const token = this.getAuthToken()
    const method = options.method || 'GET'

    logger.debug(`API Request: ${method} ${endpoint}`)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (options.headers) {
      const existingHeaders = new Headers(options.headers)
      existingHeaders.forEach((value, key) => {
        headers[key] = value
      })
    }

    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      const text = await response.text()
      const requestId = response.headers.get('X-Request-ID') || undefined

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}: ${response.statusText}`
        let code: string | undefined

        try {
          const parsed = text ? JSON.parse(text) : null
          if (parsed && typeof parsed === 'object') {
            if (parsed.error) errMsg = parsed.error
            if (parsed.code) code = parsed.code
          }
        } catch (_) {
          if (text) errMsg = text
        }

        logger.error(`API Error: ${method} ${endpoint}`, {
          status: response.status,
          message: errMsg,
          requestId,
        })

        throw new ApiError(errMsg, response.status, code, requestId)
      }

      logger.debug(`API Success: ${method} ${endpoint}`)

      if (!text) {
        return undefined as unknown as T
      }

      try {
        return JSON.parse(text) as T
      } catch (_) {
        return text as unknown as T
      }
    } catch (error) {
      if (error instanceof ApiError) throw error

      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`API Network/Unexpected Error: ${method} ${endpoint}`, {
        error: msg,
      })
      throw new Error(`Connection failed: ${msg}`)
    }
  }

  // Health
  async healthCheck(): Promise<{ message: string }> {
    return this.request('/')
  }

  // Auth
  async signup(data: SignupRequest): Promise<AuthResponse> {
    return this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Posts
  async getPosts(params?: PaginationParams): Promise<Post[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/posts${queryString}`)
  }

  async getPost(id: number): Promise<Post> {
    return this.request(`/posts/${id}`)
  }

  async createPost(data: CreatePostRequest): Promise<Post> {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePost(id: number, data: UpdatePostRequest): Promise<Post> {
    return this.request(`/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deletePost(id: number): Promise<{ message: string }> {
    return this.request(`/posts/${id}`, {
      method: 'DELETE',
    })
  }

  async likePost(id: number): Promise<Post> {
    return this.request(`/posts/${id}/like`, {
      method: 'POST',
    })
  }

  async unlikePost(id: number): Promise<Post> {
    return this.request(`/posts/${id}/like`, {
      method: 'DELETE',
    })
  }

  async searchPosts(params: SearchParams): Promise<Post[]> {
    const query = new URLSearchParams()
    query.set('q', params.q)
    if (params.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params.limit !== undefined) query.set('limit', params.limit.toString())
    return this.request(`/posts/search?${query.toString()}`)
  }

  // Comments
  async getPostComments(postId: number): Promise<Comment[]> {
    return this.request(`/posts/${postId}/comments`)
  }

  async createComment(
    postId: number,
    data: CreateCommentRequest
  ): Promise<Comment> {
    return this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateComment(
    postId: number,
    commentId: number,
    data: UpdateCommentRequest
  ): Promise<Comment> {
    return this.request(`/posts/${postId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteComment(
    postId: number,
    commentId: number
  ): Promise<{ message: string }> {
    return this.request(`/posts/${postId}/comments/${commentId}`, {
      method: 'DELETE',
    })
  }

  // Users
  async getUsers(params?: PaginationParams): Promise<User[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/users${queryString}`)
  }

  async getFriends(params?: PaginationParams): Promise<User[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/friends${queryString}`)
  }

  async sendFriendRequest(
    userId: number
  ): Promise<{ message: string; request_id: number }> {
    return this.request(`/friends/requests/${userId}`, {
      method: 'POST',
    })
  }

  async getPendingRequests(): Promise<FriendRequest[]> {
    return this.request('/friends/requests')
  }

  async getSentRequests(): Promise<FriendRequest[]> {
    return this.request('/friends/requests/sent')
  }

  async acceptFriendRequest(requestId: number): Promise<{ message: string }> {
    return this.request(`/friends/requests/${requestId}/accept`, {
      method: 'POST',
    })
  }

  async rejectFriendRequest(requestId: number): Promise<{ message: string }> {
    return this.request(`/friends/requests/${requestId}/reject`, {
      method: 'POST',
    })
  }

  async getFriendshipStatus(userId: number): Promise<FriendshipStatus> {
    return this.request(`/friends/status/${userId}`)
  }

  async removeFriend(userId: number): Promise<{ message: string }> {
    return this.request(`/friends/${userId}`, {
      method: 'DELETE',
    })
  }

  async getMyProfile(): Promise<User> {
    return this.request('/users/me')
  }

  async getUserProfile(id: number): Promise<User> {
    return this.request(`/users/${id}`)
  }

  async updateMyProfile(data: UpdateProfileRequest): Promise<User> {
    return this.request('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  // Chat - Conversations
  async getConversations(): Promise<Conversation[]> {
    return this.request('/conversations')
  }

  async getConversation(id: number): Promise<Conversation> {
    return this.request(`/conversations/${id}`)
  }

  async createConversation(
    data: CreateConversationRequest
  ): Promise<Conversation> {
    return this.request('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async leaveConversation(id: number): Promise<{ message: string }> {
    return this.request(`/conversations/${id}`, {
      method: 'DELETE',
    })
  }

  async markConversationAsRead(id: number): Promise<{ message: string }> {
    return this.request(`/conversations/${id}/read`, {
      method: 'POST',
    })
  }

  // Chat - Messages
  async getMessages(
    conversationId: number,
    params?: PaginationParams
  ): Promise<Message[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(
      `/conversations/${conversationId}/messages${queryString}`
    )
  }

  async sendMessage(
    conversationId: number,
    data: SendMessageRequest
  ): Promise<Message> {
    return this.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteMessage(
    conversationId: number,
    messageId: number
  ): Promise<{ message: string }> {
    return this.request(
      `/conversations/${conversationId}/messages/${messageId}`,
      {
        method: 'DELETE',
      }
    )
  }

  // Chatrooms (public group conversations)
  async getAllChatrooms(): Promise<(Conversation & { is_joined: boolean })[]> {
    return this.request('/chatrooms')
  }

  async getJoinedChatrooms(): Promise<Conversation[]> {
    return this.request('/chatrooms/joined')
  }

  async joinChatroom(chatroomId: number): Promise<{ message: string }> {
    return this.request(`/chatrooms/${chatroomId}/join`, {
      method: 'POST',
    })
  }

  // Sanctums
  async getSanctums(): Promise<SanctumDTO[]> {
    return this.request('/sanctums')
  }

  async getSanctum(slug: string): Promise<SanctumDTO> {
    return this.request(`/sanctums/${slug}`)
  }

  async createSanctumRequest(
    payload: CreateSanctumRequestInput
  ): Promise<SanctumRequest> {
    return this.request('/sanctums/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async getMySanctumRequests(): Promise<SanctumRequest[]> {
    return this.request('/sanctums/requests/me')
  }

  async getAdminSanctumRequests(
    status: AdminSanctumRequestStatus
  ): Promise<SanctumRequest[]> {
    return this.request(`/admin/sanctum-requests?status=${status}`)
  }

  async approveSanctumRequest(
    id: number,
    review_notes?: string
  ): Promise<AdminSanctumRequestActionResponse> {
    return this.request(`/admin/sanctum-requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ review_notes }),
    })
  }

  async rejectSanctumRequest(
    id: number,
    review_notes?: string
  ): Promise<SanctumRequest> {
    return this.request(`/admin/sanctum-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ review_notes }),
    })
  }

  // Games
  async createGameRoom(type: string): Promise<GameRoom> {
    return this.request('/games/rooms', {
      method: 'POST',
      body: JSON.stringify({ type }),
    })
  }

  async getActiveGameRooms(type?: string): Promise<GameRoom[]> {
    const query = type ? `?type=${type}` : ''
    return this.request(`/games/rooms/active${query}`)
  }

  async getGameRoom(id: number): Promise<GameRoom> {
    return this.request(`/games/rooms/${id}`)
  }

  async leaveGameRoom(
    id: number
  ): Promise<{ message: string; status: string }> {
    return this.request(`/games/rooms/${id}/leave`, {
      method: 'POST',
    })
  }

  // biome-ignore lint/suspicious/noExplicitAny: dynamic stats object
  async getGameStats(type: string): Promise<any> {
    return this.request(`/games/stats/${type}`)
  }

  // Streams
  async getStreams(params?: {
    category?: string
    limit?: number
    offset?: number
  }): Promise<StreamsResponse> {
    const query = new URLSearchParams()
    if (params?.category) query.set('category', params.category)
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/streams${queryString}`)
  }

  async getStream(id: number): Promise<Stream> {
    return this.request(`/streams/${id}`)
  }

  async getStreamCategories(): Promise<string[]> {
    return this.request('/streams/categories')
  }

  async getMyStreams(): Promise<Stream[]> {
    return this.request('/streams/me')
  }

  async createStream(data: CreateStreamRequest): Promise<Stream> {
    return this.request('/streams', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateStream(id: number, data: UpdateStreamRequest): Promise<Stream> {
    return this.request(`/streams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteStream(id: number): Promise<void> {
    return this.request(`/streams/${id}`, {
      method: 'DELETE',
    })
  }

  async goLive(id: number): Promise<Stream> {
    return this.request(`/streams/${id}/go-live`, {
      method: 'POST',
    })
  }

  async endStream(id: number): Promise<Stream> {
    return this.request(`/streams/${id}/end`, {
      method: 'POST',
    })
  }

  async getStreamMessages(
    id: number,
    params?: PaginationParams
  ): Promise<StreamMessage[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/streams/${id}/messages${queryString}`)
  }

  async sendStreamMessage(id: number, content: string): Promise<StreamMessage> {
    return this.request(`/streams/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  }

  async getCurrentUser(): Promise<User> {
    return this.request('/users/me')
  }
}

export const apiClient = new ApiClient(API_BASE_URL)
