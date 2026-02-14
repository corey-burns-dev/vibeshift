import { logger } from '../lib/logger'
import { useAuthSessionStore } from '../stores/useAuthSessionStore'
import type {
  AdminBanRequest,
  AdminSanctumRequestActionResponse,
  AdminSanctumRequestStatus,
  AdminUserDetailResponse,
  AuthResponse,
  BanUserRequest,
  BulkSanctumMembershipsInput,
  ChatroomModerator,
  ChatroomMute,
  Comment,
  Conversation,
  CreateCommentRequest,
  CreateConversationRequest,
  CreatePostRequest,
  CreateSanctumRequestInput,
  FriendRequest,
  FriendshipStatus,
  GameRoom,
  LoginRequest,
  Message,
  MessageMention,
  MessageReactionResponse,
  ModerationReport,
  MuteChatroomUserRequest,
  PaginationParams,
  Post,
  ReportRequest,
  ResolveModerationReportRequest,
  SanctumAdmin,
  SanctumDTO,
  SanctumMembership,
  SanctumRequest,
  SearchParams,
  SendMessageRequest,
  SignupRequest,
  UpdateCommentRequest,
  UpdatePostRequest,
  UpdateProfileRequest,
  UploadedImage,
  User,
  UserBlock,
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

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

class ApiClient {
  private baseUrl: string
  private refreshPromise: Promise<string | null> | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private getAuthToken(): string | null {
    return useAuthSessionStore.getState().accessToken
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Ensure we pass an absolute URL to `fetch`. When `VITE_API_URL` is a
    // relative path (e.g. '/api') some runtimes (node fetch) require an
    // absolute URL. Prefer `baseUrl` when absolute, otherwise build from
    // `window.location.origin` so tests and SSR-like environments work.
    const url = this.baseUrl?.startsWith('http')
      ? `${this.baseUrl}${endpoint}`
      : typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}${this.baseUrl}${endpoint}`
        : `${this.baseUrl}${endpoint}`
    const token = this.getAuthToken()
    const method = options.method || 'GET'
    const isFormDataBody = options.body instanceof FormData

    logger.debug(`API Request: ${method} ${endpoint}`)

    const headers: Record<string, string> = {}
    if (!isFormDataBody) {
      headers['Content-Type'] = 'application/json'
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
    if (isFormDataBody) {
      // Let the browser set multipart boundaries automatically.
      delete headers['Content-Type']
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      })

      const text = await response.text()
      const requestId = response.headers.get('X-Request-ID') || undefined

      if (!response.ok) {
        // Handle token refresh on 401
        // Allow refresh attempt even when no in-memory token is present (cookie bootstrap case),
        // excluding auth endpoints.
        if (
          response.status === 401 &&
          endpoint !== '/auth/login' &&
          endpoint !== '/auth/signup' &&
          endpoint !== '/auth/refresh' &&
          endpoint !== '/auth/logout'
        ) {
          logger.info('Access token missing or expired, attempting refresh...')

          try {
            const newToken = await this.performRefresh()
            if (newToken) {
              logger.info('Token refreshed successfully, retrying request')
              // Retry with new token
              return this.request(endpoint, options)
            }
          } catch (refreshErr) {
            logger.error('Token refresh failed', { error: refreshErr })
          }

          // If refresh fails, clear auth and redirect to login
          useAuthSessionStore.getState().clear()
          localStorage.removeItem('user')
          window.location.href = '/login'
        }

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

  private async performRefresh(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = (async () => {
      try {
        const refreshUrl = this.baseUrl?.startsWith('http')
          ? `${this.baseUrl}/auth/refresh`
          : typeof window !== 'undefined' && window.location?.origin
            ? `${window.location.origin}${this.baseUrl}/auth/refresh`
            : `${this.baseUrl}/auth/refresh`

        const refreshResponse = await fetch(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })

        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          if (data.token) {
            useAuthSessionStore.getState().setAccessToken(data.token)
            return data.token
          }
        }
        return null
      } catch (err) {
        logger.error('Refresh call failed', { error: err })
        return null
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  // Health
  async healthCheck(): Promise<{ message: string }> {
    return this.request('/')
  }

  // Auth
  async signup(data: SignupRequest): Promise<AuthResponse> {
    const resp = await this.request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (resp.token) {
      useAuthSessionStore.getState().setAccessToken(resp.token)
    }
    return resp
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const resp = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (resp.token) {
      useAuthSessionStore.getState().setAccessToken(resp.token)
    }
    return resp
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', {
        method: 'POST',
      })
    } catch (err) {
      logger.error('Logout request failed', { error: err })
    } finally {
      useAuthSessionStore.getState().clear()
      localStorage.removeItem('user')
    }
  }

  async refresh(): Promise<{ token: string }> {
    const resp = await this.request<{ token: string }>('/auth/refresh', {
      method: 'POST',
    })
    if (resp.token) {
      useAuthSessionStore.getState().setAccessToken(resp.token)
    }
    return resp
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

  async uploadImage(file: File): Promise<UploadedImage> {
    const formData = new FormData()
    formData.append('image', file)
    return this.request('/images/upload', {
      method: 'POST',
      body: formData,
    })
  }

  async updatePost(id: number, data: UpdatePostRequest): Promise<Post> {
    return this.request(`/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async votePoll(postId: number, pollOptionId: number): Promise<Post> {
    return this.request(`/posts/${postId}/poll/vote`, {
      method: 'POST',
      body: JSON.stringify({ poll_option_id: pollOptionId }),
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

  async reportPost(id: number, data: ReportRequest): Promise<ModerationReport> {
    return this.request(`/posts/${id}/report`, {
      method: 'POST',
      body: JSON.stringify(data),
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

  async getMyMentions(params?: PaginationParams): Promise<MessageMention[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/users/me/mentions${queryString}`)
  }

  async getMyBlocks(): Promise<UserBlock[]> {
    return this.request('/users/blocks/me')
  }

  async blockUser(userId: number): Promise<{ message: string }> {
    return this.request(`/users/${userId}/block`, {
      method: 'POST',
    })
  }

  async unblockUser(userId: number): Promise<{ message: string }> {
    return this.request(`/users/${userId}/block`, {
      method: 'DELETE',
    })
  }

  async reportUser(
    userId: number,
    data: ReportRequest
  ): Promise<ModerationReport> {
    return this.request(`/users/${userId}/report`, {
      method: 'POST',
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

  async addMessageReaction(
    conversationId: number,
    messageId: number,
    emoji: string
  ): Promise<MessageReactionResponse> {
    return this.request(
      `/conversations/${conversationId}/messages/${messageId}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }
    )
  }

  async removeMessageReaction(
    conversationId: number,
    messageId: number,
    emoji: string
  ): Promise<MessageReactionResponse> {
    const query = new URLSearchParams({ emoji })
    return this.request(
      `/conversations/${conversationId}/messages/${messageId}/reactions?${query.toString()}`,
      {
        method: 'DELETE',
      }
    )
  }

  async reportMessage(
    conversationId: number,
    messageId: number,
    data: ReportRequest
  ): Promise<ModerationReport> {
    return this.request(
      `/conversations/${conversationId}/messages/${messageId}/report`,
      {
        method: 'POST',
        body: JSON.stringify(data),
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

  async getChatroomModerators(
    chatroomId: number
  ): Promise<ChatroomModerator[]> {
    return this.request(`/chatrooms/${chatroomId}/moderators`)
  }

  async addChatroomModerator(
    chatroomId: number,
    userId: number
  ): Promise<ChatroomModerator> {
    return this.request(`/chatrooms/${chatroomId}/moderators/${userId}`, {
      method: 'POST',
    })
  }

  async removeChatroomModerator(
    chatroomId: number,
    userId: number
  ): Promise<{ message: string }> {
    return this.request(`/chatrooms/${chatroomId}/moderators/${userId}`, {
      method: 'DELETE',
    })
  }

  async getChatroomMutes(chatroomId: number): Promise<ChatroomMute[]> {
    return this.request(`/chatrooms/${chatroomId}/mutes`)
  }

  async muteChatroomUser(
    chatroomId: number,
    userId: number,
    data: MuteChatroomUserRequest
  ): Promise<{ message: string }> {
    return this.request(`/chatrooms/${chatroomId}/mutes/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async unmuteChatroomUser(
    chatroomId: number,
    userId: number
  ): Promise<{ message: string }> {
    return this.request(`/chatrooms/${chatroomId}/mutes/${userId}`, {
      method: 'DELETE',
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

  async getMySanctumMemberships(): Promise<SanctumMembership[]> {
    return this.request('/sanctums/memberships/me')
  }

  async upsertMySanctumMemberships(
    payload: BulkSanctumMembershipsInput
  ): Promise<SanctumMembership[]> {
    return this.request('/sanctums/memberships/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
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

  async getSanctumAdmins(slug: string): Promise<SanctumAdmin[]> {
    return this.request(`/sanctums/${slug}/admins`)
  }

  async promoteSanctumAdmin(
    slug: string,
    userId: number
  ): Promise<SanctumAdmin> {
    return this.request(`/sanctums/${slug}/admins/${userId}`, {
      method: 'POST',
    })
  }

  async demoteSanctumAdmin(
    slug: string,
    userId: number
  ): Promise<SanctumAdmin> {
    return this.request(`/sanctums/${slug}/admins/${userId}`, {
      method: 'DELETE',
    })
  }

  async getAdminReports(params?: {
    status?: string
    target_type?: string
    limit?: number
    offset?: number
  }): Promise<ModerationReport[]> {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.target_type) query.set('target_type', params.target_type)
    if (params?.limit !== undefined) query.set('limit', String(params.limit))
    if (params?.offset !== undefined) query.set('offset', String(params.offset))
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/admin/reports${queryString}`)
  }

  async resolveAdminReport(
    id: number,
    data: ResolveModerationReportRequest
  ): Promise<ModerationReport> {
    return this.request(`/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getAdminBanRequests(
    params?: PaginationParams
  ): Promise<AdminBanRequest[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/admin/ban-requests${queryString}`)
  }

  async getAdminUsers(
    params?: PaginationParams & { q?: string }
  ): Promise<User[]> {
    const query = new URLSearchParams()
    if (params?.q) query.set('q', params.q)
    if (params?.offset !== undefined)
      query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/admin/users${queryString}`)
  }

  async getAdminUserDetail(id: number): Promise<AdminUserDetailResponse> {
    return this.request(`/admin/users/${id}`)
  }

  async banAdminUser(
    id: number,
    data: BanUserRequest = {}
  ): Promise<{ message: string }> {
    return this.request(`/admin/users/${id}/ban`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async unbanAdminUser(id: number): Promise<{ message: string }> {
    return this.request(`/admin/users/${id}/unban`, {
      method: 'POST',
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

  async getCurrentUser(): Promise<User> {
    return this.request('/users/me')
  }

  // WebSocket Tickets
  async issueWSTicket(): Promise<{ ticket: string; expires_in: number }> {
    return this.request('/ws/ticket', {
      method: 'POST',
    })
  }
}

export const apiClient = new ApiClient(API_BASE_URL)
