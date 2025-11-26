// API Client - centralized HTTP requests with auth handling

import type {
  AuthResponse,
  Comment,
  Conversation,
  CreateCommentRequest,
  CreateConversationRequest,
  CreatePostRequest,
  LoginRequest,
  Message,
  PaginationParams,
  Post,
  SearchParams,
  SendMessageRequest,
  SignupRequest,
  UpdateCommentRequest,
  UpdatePostRequest,
  UpdateProfileRequest,
  User,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private getAuthToken(): string | null {
    return localStorage.getItem('token')
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const token = this.getAuthToken()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Add existing headers
    if (options.headers) {
      const existingHeaders = new Headers(options.headers)
      existingHeaders.forEach((value, key) => {
        headers[key] = value
      })
    }

    // Add auth token if available and not already set
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    // Read response as text first so we can handle empty/non-JSON bodies
    const text = await response.text()

    if (!response.ok) {
      // Try to parse JSON error body, otherwise use text/status
      let errMsg = `HTTP ${response.status}: ${response.statusText}`
      try {
        const parsed = text ? JSON.parse(text) : null
        if (parsed && typeof parsed === 'object' && parsed.error) {
          errMsg = parsed.error
        } else if (parsed && typeof parsed === 'string') {
          errMsg = parsed
        }
      } catch (_) {
        // not JSON - use text if present
        if (text) errMsg = text
      }
      throw new Error(errMsg)
    }

    // If response body is empty, return undefined cast to T
    if (!text) {
      return undefined as unknown as T
    }

    // Try to parse JSON, otherwise return raw text
    try {
      return JSON.parse(text) as T
    } catch (_) {
      return text as unknown as T
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
    if (params?.offset !== undefined) query.set('offset', params.offset.toString())
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
    if (params.offset !== undefined) query.set('offset', params.offset.toString())
    if (params.limit !== undefined) query.set('limit', params.limit.toString())
    return this.request(`/posts/search?${query.toString()}`)
  }

  // Comments
  async getPostComments(postId: number): Promise<Comment[]> {
    return this.request(`/posts/${postId}/comments`)
  }

  async createComment(postId: number, data: CreateCommentRequest): Promise<Comment> {
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

  async deleteComment(postId: number, commentId: number): Promise<{ message: string }> {
    return this.request(`/posts/${postId}/comments/${commentId}`, {
      method: 'DELETE',
    })
  }

  // Users
  async getUsers(params?: PaginationParams): Promise<User[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined) query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/users${queryString}`)
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

  async createConversation(data: CreateConversationRequest): Promise<Conversation> {
    return this.request('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async markConversationAsRead(id: number): Promise<{ message: string }> {
    return this.request(`/conversations/${id}/read`, {
      method: 'POST',
    })
  }

  // Chat - Messages
  async getMessages(conversationId: number, params?: PaginationParams): Promise<Message[]> {
    const query = new URLSearchParams()
    if (params?.offset !== undefined) query.set('offset', params.offset.toString())
    if (params?.limit !== undefined) query.set('limit', params.limit.toString())
    const queryString = query.toString() ? `?${query.toString()}` : ''
    return this.request(`/conversations/${conversationId}/messages${queryString}`)
  }

  async sendMessage(conversationId: number, data: SendMessageRequest): Promise<Message> {
    return this.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteMessage(conversationId: number, messageId: number): Promise<{ message: string }> {
    return this.request(`/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
    })
  }
}

export const apiClient = new ApiClient(API_BASE_URL)
