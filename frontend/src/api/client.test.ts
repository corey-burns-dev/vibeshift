import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { useAuthSessionStore } from '@/stores/useAuthSessionStore'

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  } as Response
}

function errorJson(
  status: number,
  body: Record<string, unknown>,
  statusText = 'Error'
): Response {
  return {
    ok: false,
    status,
    statusText,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  } as Response
}

describe('apiClient uploadImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('sends multipart/form-data without forcing Content-Type', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      okJson({
        id: 1,
        hash: 'abc',
        url: '/api/images/abc',
        thumbnail_url: '/api/images/abc?size=thumbnail',
        medium_url: '/api/images/abc?size=medium',
        width: 10,
        height: 10,
        size_bytes: 12,
        mime_type: 'image/png',
      })
    )

    const file = new File([new Uint8Array([1, 2, 3])], 'avatar.png', {
      type: 'image/png',
    })

    await apiClient.uploadImage(file)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(init?.body).toBeInstanceOf(FormData)

    const headers = new Headers(init?.headers as HeadersInit)
    expect(headers.get('Content-Type')).toBeNull()

    const sent = init?.body as FormData
    expect(sent.get('image')).toBe(file)
  })

  it('keeps JSON Content-Type for non-FormData requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      okJson({
        id: 10,
        title: 'hello',
        content: 'world',
        likes_count: 0,
        user_id: 1,
        created_at: '',
        updated_at: '',
      })
    )

    await apiClient.createPost({ title: 'hello', content: 'world' })

    const [, init] = fetchSpy.mock.calls[0]
    const headers = new Headers(init?.headers as HeadersInit)
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('logout sends empty JSON body and Content-Type header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okJson({ message: 'Logged out successfully' }))

    await apiClient.logout()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    const headers = new Headers(init?.headers as HeadersInit)
    expect(headers.get('Content-Type')).toBe('application/json')
    // Body should be explicit empty JSON object
    const bodyText = init?.body
    // In fetch init, body may be a string; convert if necessary
    if (typeof bodyText === 'string') {
      expect(bodyText).toBe(JSON.stringify({}))
    } else if (bodyText instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(new Uint8Array(bodyText))
      expect(text).toBe(JSON.stringify({}))
    } else {
      expect(bodyText).not.toBeUndefined()
    }
  })
})

describe('apiClient game room chat', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('fetches game room messages from the expected endpoint', async () => {
    const payload = [
      {
        id: 1,
        created_at: '2026-02-24T00:00:00Z',
        game_room_id: 42,
        user_id: 7,
        username: 'alice',
        text: 'hello',
      },
    ]
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okJson(payload))

    const result = await apiClient.getGameRoomMessages(42)

    expect(result).toEqual(payload)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('/games/rooms/42/messages')
  })
})

describe('apiClient websocket auth behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useAuthSessionStore.getState().clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useAuthSessionStore.getState().clear()
  })

  it('does not clear auth session when /ws/ticket returns 401', async () => {
    const jwtPayload = { exp: Math.floor(Date.now() / 1000) + 60 * 60 }
    const token = `a.${btoa(JSON.stringify(jwtPayload))}.c`
    useAuthSessionStore.getState().setAccessToken(token)
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, username: 'alice', email: 'a@example.com' })
    )

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(errorJson(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(errorJson(401, { error: 'Refresh failed' }))

    await expect(apiClient.issueWSTicket()).rejects.toThrow('Unauthorized')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(useAuthSessionStore.getState().accessToken).toBe(token)
    expect(localStorage.getItem('user')).toContain('"alice"')
  })
})
