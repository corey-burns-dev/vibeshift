import { expect, test } from '@playwright/test'
import { USER_STATE_PATH } from './fixtures/auth'

test.describe('Chat smoke', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('ChatDock toggles open and shows Friends header', async ({ page }) => {
    await page.goto('/')

    // Ensure ChatDock floating button exists
    const fab = page.getByRole('button', { name: /open messages/i })
    await expect(fab).toBeVisible()

    await fab.click()

    // The dock panel shows a Friends header when open
    await expect(page.getByRole('heading', { name: /friends/i })).toBeVisible()
  })
})
