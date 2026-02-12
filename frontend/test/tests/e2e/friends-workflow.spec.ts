import { expect, test } from '@playwright/test'
import { USER_STATE_PATH } from './fixtures/auth'

test.describe('Friends workflow', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('friends page loads and shows find people or list', async ({ page }) => {
    await page.goto('/friends')
    await expect(
      page
        .getByRole('heading', { name: /friends/i })
        .or(page.getByText(/friend/i))
    ).toBeVisible({ timeout: 10000 })
  })
})
