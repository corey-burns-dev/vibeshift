import { vi } from 'vitest'

export function mockFetchJsonOnce(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  } as Response)
}

export function mockFetchErrorOnce(message: string) {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error(message))
}
