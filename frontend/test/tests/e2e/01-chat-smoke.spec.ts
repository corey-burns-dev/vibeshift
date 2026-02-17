import { expect, test } from '@playwright/test'

test.describe('Chat smoke', () => {
  test('ChatDock toggles open and shows Friends header', async ({ page }) => {
    await page.goto('/')

    // Ensure ChatDock floating button exists
    const fab = page.getByRole('button', { name: /message/i })
    await expect(fab).toBeVisible()

    await fab.click()

    // The dock panel shows a Friends header when open
    await expect(page.getByRole('heading', { name: /friends/i })).toBeVisible()
  })
})
