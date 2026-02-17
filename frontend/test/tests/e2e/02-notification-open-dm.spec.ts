import { expect, request, test } from '@playwright/test'

test.describe('Notification -> open DM', () => {
  test('creates conversation via API and opens chat route', async ({ page }) => {
    const apiBase = process.env.PLAYWRIGHT_API_URL
    test.skip(!apiBase, 'PLAYWRIGHT_API_URL not configured')

    const api = await request.newContext({ baseURL: apiBase })
    // create a conversation with a fake user id (test backend should accept)
    const resp = await api.post('conversations', {
      data: { participant_ids: [2] },
    })
    test.expect(resp.ok()).toBeTruthy()
    const conv = await resp.json()

    await page.goto(`/chat/${conv.id}`)

    // The chat input should be visible
    const input = page.getByPlaceholder('Type a message...')
    await expect(input).toBeVisible()

    // Send a test message and ensure it appears in the conversation
    await input.fill('Playwright says hello')
    await input.press('Enter')
    await expect(page.getByText('Playwright says hello')).toBeVisible()
  })
})

test('unread badge appears after external message and clears on open', async ({ page }) => {
  const apiBase = process.env.PLAYWRIGHT_API_URL
  test.skip(!apiBase, 'PLAYWRIGHT_API_URL not configured')

  const api = await request.newContext({ baseURL: apiBase })
  // create a conversation with a fake user id
  const resp = await api.post('conversations', { data: { participant_ids: [2] } })
  test.expect(resp.ok()).toBeTruthy()
  const conv = await resp.json()

  // Attempt to post a message as the other participant (API may enforce auth).
  const msgResp = await api.post(`conversations/${conv.id}/messages`, {
    data: { body: 'Hello from API test' },
  })

  test.skip(!msgResp.ok(), 'Message creation via API not permitted in this environment')

  // Now navigate home and assert the ChatDock shows an unread badge
  await page.goto('/')
  const badge = page.getByTestId('chat-dock-unread-badge')
  await expect(badge).toBeVisible()

  // Open the dock and open the conversation; unread badge should clear
  const fab = page.getByRole('button', { name: /message/i })
  await fab.click()
  await page.getByText(/friends/i).click()
  await page.goto(`/chat/${conv.id}`)
  await expect(badge).not.toBeVisible()
})
