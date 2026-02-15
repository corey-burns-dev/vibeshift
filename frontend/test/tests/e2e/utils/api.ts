import type { APIRequestContext } from '@playwright/test'

export interface SanctumRequestPayload {
  requested_name: string
  requested_slug: string
  reason: string
}

// Legacy type - kept for backward compatibility
interface SanctumRequestResponse {
  id: number
  requested_slug: string
}

const API_BASE = (
  process.env.PLAYWRIGHT_API_URL || 'http://localhost:8375/api'
).replace(/\/$/, '')

async function responseBodyOrPlaceholder(res: ResponseLike): Promise<string> {
  try {
    return await res.text()
  } catch (e) {
    return `<unable to read body: ${String(e)}>`
  }
}

interface ResponseLike {
  text(): Promise<string>
}

export function uniqueSlug(prefix: string): string {
  // Produce a slug that matches server validation: 3-24 chars,
  // lowercase letters, numbers, and hyphens only.
  const maxLen = 24

  // sanitize prefix to allowed characters
  let base = (prefix || 's')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  // short unique suffix (letters + numbers)
  const suffixRaw = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const suffix = suffixRaw.slice(-6)

  // compute available length for base (leave room for a hyphen)
  const sep = base ? '-' : ''
  let avail = maxLen - sep.length - suffix.length
  if (avail <= 0) {
    // fallback short base
    base = 's'
    avail = maxLen - 1 - suffix.length
  }
  if (base.length > avail) base = base.slice(0, avail)

  let candidate = `${base}${base ? '-' : ''}${suffix}`
  candidate = candidate.replace(/^-+|-+$/g, '')
  if (candidate.length < 3) candidate = candidate.padEnd(3, 'x')
  return candidate
}

export async function createSanctumRequest(
  request: APIRequestContext,
  token: string,
  payload: SanctumRequestPayload
) {
  const res = await request.post(`${API_BASE}/sanctums/requests`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: payload,
  })

  if (!res.ok()) {
    const body = await responseBodyOrPlaceholder(res)
    throw new Error(
      `createSanctumRequest failed: status=${res.status()} body=${body}`
    )
  }

  return res
}

export interface MySanctumRequest {
  id: number
  requested_slug: string
  requested_name: string
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
  review_notes?: string
}

export async function listMySanctumRequests(
  request: APIRequestContext,
  token: string
): Promise<MySanctumRequest[]> {
  const res = await request.get(`${API_BASE}/sanctums/requests/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok()) {
    const body = await responseBodyOrPlaceholder(res)
    throw new Error(
      `listMySanctumRequests failed: status=${res.status()} body=${body}`
    )
  }

  return (await res.json()) as MySanctumRequest[]
}

/**
 * Get a specific user sanctum request by slug
 */
export async function getMySanctumRequestBySlug(
  request: APIRequestContext,
  token: string,
  slug: string
): Promise<MySanctumRequest | null> {
  const requests = await listMySanctumRequests(request, token)
  return requests.find((r) => r.requested_slug === slug) || null
}

export async function hasMySanctumRequestBySlug(
  request: APIRequestContext,
  token: string,
  slug: string
): Promise<boolean> {
  const requests = await listMySanctumRequests(request, token)
  return requests.some((item) => item.requested_slug === slug)
}

export interface AdminSanctumRequest {
  id: number
  requested_slug: string
  requested_name: string
  status: 'pending' | 'approved' | 'rejected'
  user_id: number
  reason?: string
  review_notes?: string
}

export async function listAdminRequests(
  request: APIRequestContext,
  token: string,
  status: 'pending' | 'approved' | 'rejected'
): Promise<AdminSanctumRequest[]> {
  const res = await request.get(
    `${API_BASE}/admin/sanctum-requests?status=${status}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!res.ok()) {
    const body = await responseBodyOrPlaceholder(res)
    throw new Error(
      `listAdminRequests failed: status=${res.status()} body=${body}`
    )
  }

  return (await res.json()) as AdminSanctumRequest[]
}

/**
 * Get a specific sanctum request by slug from the admin requests list
 */
export async function getAdminRequestBySlug(
  request: APIRequestContext,
  token: string,
  slug: string,
  status: 'pending' | 'approved' | 'rejected'
): Promise<AdminSanctumRequest | null> {
  const requests = await listAdminRequests(request, token, status)
  return requests.find((r) => r.requested_slug === slug) || null
}

export async function approveSanctumRequest(
  request: APIRequestContext,
  token: string,
  id: number,
  review_notes?: string
) {
  return request.post(`${API_BASE}/admin/sanctum-requests/${id}/approve`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: { review_notes },
  })
}

/**
 * Cleanup Utilities
 * These functions are used in test cleanup hooks to prevent data accumulation
 */

/**
 * Delete a sanctum request by ID
 * Returns true if deleted, false if not found, throws on other errors
 */
export async function deleteSanctumRequest(
  request: APIRequestContext,
  token: string,
  requestId: number
): Promise<boolean> {
  const res = await request.delete(`${API_BASE}/sanctums/requests/${requestId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (res.status() === 404) {
    return false // Already deleted or never existed
  }

  if (!res.ok()) {
    const body = await responseBodyOrPlaceholder(res)
    throw new Error(
      `deleteSanctumRequest failed: status=${res.status()} body=${body}`
    )
  }

  return true
}

/**
 * Delete all sanctum requests created by the authenticated user
 * Useful for cleanup in afterEach hooks
 */
export async function deleteAllMySanctumRequests(
  request: APIRequestContext,
  token: string
): Promise<number> {
  const requests = await listMySanctumRequests(request, token)
  let deletedCount = 0

  for (const req of requests) {
    try {
      const deleted = await deleteSanctumRequest(request, token, req.id)
      if (deleted) deletedCount++
    } catch (error) {
      // Log but don't fail cleanup
      // eslint-disable-next-line no-console
      console.warn(`Failed to delete request ${req.id}:`, error)
    }
  }

  return deletedCount
}

/**
 * Delete a post by ID
 * Returns true if deleted, false if not found, throws on other errors
 */
export async function deletePost(
  request: APIRequestContext,
  token: string,
  postId: number
): Promise<boolean> {
  const res = await request.delete(`${API_BASE}/posts/${postId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (res.status() === 404) {
    return false // Already deleted or never existed
  }

  if (!res.ok()) {
    const body = await responseBodyOrPlaceholder(res)
    throw new Error(`deletePost failed: status=${res.status()} body=${body}`)
  }

  return true
}

/**
 * Get current user profile (id, username, etc.) from GET /api/users/me
 */
export async function getMyProfile(
  request: APIRequestContext,
  token: string
): Promise<{ id: number }> {
  const res = await request.get(`${API_BASE}/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok()) {
    const body = await responseBodyOrPlaceholder(res)
    throw new Error(`getMyProfile failed: status=${res.status()} body=${body}`)
  }

  return (await res.json()) as { id: number }
}

/**
 * Get user's own posts via GET /api/users/:id/posts (backend has no /posts/me)
 */
export async function getMyPosts(
  request: APIRequestContext,
  token: string
): Promise<Array<{ id: number; content: string }>> {
  const profile = await getMyProfile(request, token)
  const res = await request.get(`${API_BASE}/users/${profile.id}/posts`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok()) {
    const body = await responseBodyOrPlaceholder(res)
    throw new Error(`getMyPosts failed: status=${res.status()} body=${body}`)
  }

  return (await res.json()) as Array<{ id: number; content: string }>
}

/**
 * Delete all posts created by the authenticated user
 * Useful for cleanup in afterEach hooks
 */
export async function deleteAllMyPosts(
  request: APIRequestContext,
  token: string
): Promise<number> {
  try {
    const posts = await getMyPosts(request, token)
    let deletedCount = 0

    for (const post of posts) {
      try {
        const deleted = await deletePost(request, token, post.id)
        if (deleted) deletedCount++
      } catch (error) {
        // Log but don't fail cleanup
        // eslint-disable-next-line no-console
        console.warn(`Failed to delete post ${post.id}:`, error)
      }
    }

    return deletedCount
  } catch (error) {
    // If getMyPosts fails, log and return 0
    // eslint-disable-next-line no-console
    console.warn('Failed to fetch posts for cleanup:', error)
    return 0
  }
}

/**
 * Delete a sanctum by slug (admin operation)
 * Returns true if deleted, false if not found, throws on other errors
 */
export async function deleteSanctum(
  request: APIRequestContext,
  token: string,
  slug: string
): Promise<boolean> {
  const res = await request.delete(`${API_BASE}/admin/sanctums/${slug}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (res.status() === 404) {
    return false // Already deleted or never existed
  }

  if (!res.ok()) {
    const body = await responseBodyOrPlaceholder(res)
    throw new Error(`deleteSanctum failed: status=${res.status()} body=${body}`)
  }

  return true
}
