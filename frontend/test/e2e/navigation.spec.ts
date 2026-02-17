import { expect, test } from '@playwright/test'
import { TEST_TIMEOUTS } from './config'
import { USER_STATE_PATH } from './fixtures/auth'

test.describe('Navigation', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('navigates to sanctums and back @smoke', async ({ page }) => {
    await page.goto('/')
    await page.goto('/sanctums')
    await expect(page).toHaveURL(/\/sanctums/)
    await expect(
      page.getByRole('heading', { name: 'Sanctums' }).first()
    ).toBeVisible({ timeout: TEST_TIMEOUTS.POLL })
  })

  test('navigates to posts', async ({ page }) => {
    await page.goto('/posts')
    await expect(page).toHaveURL(/\/posts/)
  })
})
