import type { APIRequestContext } from '@playwright/test'

export interface SanctumRequestPayload {
  requested_name: string
  requested_slug: string
  reason: string
}

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

export async function listMySanctumRequests(
  request: APIRequestContext,
  token: string
): Promise<SanctumRequestResponse[]> {
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

  return (await res.json()) as SanctumRequestResponse[]
}

export async function hasMySanctumRequestBySlug(
  request: APIRequestContext,
  token: string,
  slug: string
): Promise<boolean> {
  const requests = await listMySanctumRequests(request, token)
  return requests.some((item) => item.requested_slug === slug)
}

export async function listAdminRequests(
  request: APIRequestContext,
  token: string,
  status: 'pending' | 'approved' | 'rejected'
) {
  return request.get(`${API_BASE}/admin/sanctum-requests?status=${status}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
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
