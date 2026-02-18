import { expect, request, test } from '@playwright/test'
import {
  ADMIN_STATE_PATH,
  readTokenFromStorageState,
  USER_STATE_PATH,
} from './fixtures/auth'

test.describe('Notification -> open DM', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('creates conversation via API and opens chat route', async ({
    page,
  }) => {
    const apiBase = process.env.PLAYWRIGHT_API_URL
    test.skip(!apiBase, 'PLAYWRIGHT_API_URL not configured')

    const userToken = readTokenFromStorageState(USER_STATE_PATH)
    const adminToken = readTokenFromStorageState(ADMIN_STATE_PATH)

    const userApi = await request.newContext({
      baseURL: apiBase,
      extraHTTPHeaders: { Authorization: `Bearer ${userToken}` },
    })
    const adminApi = await request.newContext({
      baseURL: apiBase,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    })

    try {
      const userMeResp = await userApi.get('users/me')
      expect(userMeResp.ok()).toBeTruthy()
      const userMe = (await userMeResp.json()) as { id: number }

      const adminMeResp = await adminApi.get('users/me')
      expect(adminMeResp.ok()).toBeTruthy()
      const adminMe = (await adminMeResp.json()) as { id: number }
      expect(adminMe.id).not.toBe(userMe.id)

      const resp = await userApi.post('conversations', {
        data: { participant_ids: [adminMe.id] },
      })
      expect(resp.ok()).toBeTruthy()
      const conv = (await resp.json()) as { id: number }

      await page.goto(`/chat/${conv.id}`)

      // The chat input should be visible
      const input = page.getByPlaceholder('Type a message...')
      await expect(input).toBeVisible()

      // Send a test message and ensure it appears in the conversation
      await input.fill('Playwright says hello')
      await input.press('Enter')
      await expect(page.getByText('Playwright says hello')).toBeVisible()
    } finally {
      await userApi.dispose()
      await adminApi.dispose()
    }
  })

  test('unread badge appears after external message and clears on open', async ({
    page,
  }) => {
    const apiBase = process.env.PLAYWRIGHT_API_URL
    test.skip(!apiBase, 'PLAYWRIGHT_API_URL not configured')

    const userToken = readTokenFromStorageState(USER_STATE_PATH)
    const adminToken = readTokenFromStorageState(ADMIN_STATE_PATH)

    const userApi = await request.newContext({
      baseURL: apiBase,
      extraHTTPHeaders: { Authorization: `Bearer ${userToken}` },
    })
    const adminApi = await request.newContext({
      baseURL: apiBase,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    })

    try {
      const userMeResp = await userApi.get('users/me')
      expect(userMeResp.ok()).toBeTruthy()
      const userMe = (await userMeResp.json()) as { id: number }

      const adminMeResp = await adminApi.get('users/me')
      expect(adminMeResp.ok()).toBeTruthy()
      const adminMe = (await adminMeResp.json()) as { id: number }
      expect(adminMe.id).not.toBe(userMe.id)

      const createConvResp = await userApi.post('conversations', {
        data: { participant_ids: [adminMe.id] },
      })
      expect(createConvResp.ok()).toBeTruthy()
      const conv = (await createConvResp.json()) as { id: number }

      const msgResp = await adminApi.post(`conversations/${conv.id}/messages`, {
        data: { content: `Hello from API test ${Date.now()}` },
      })
      expect(msgResp.ok()).toBeTruthy()

      // Now navigate home and assert the ChatDock shows an unread badge
      await page.goto('/')
      const badge = page.getByTestId('chat-dock-unread-badge')
      await expect(badge).toBeVisible()

      // Open the conversation; unread badge should clear
      await page.goto(`/chat/${conv.id}`)
      await expect(badge).not.toBeVisible()
    } finally {
      await userApi.dispose()
      await adminApi.dispose()
    }
  })
})
