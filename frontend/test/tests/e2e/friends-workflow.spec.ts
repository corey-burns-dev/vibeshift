import { expect, test } from '@playwright/test'
import { TEST_TIMEOUTS } from './config'
import { USER_STATE_PATH } from './fixtures/auth'

test.describe('Friends workflow', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('friends page loads and shows find people or list @smoke', async ({
    page,
  }) => {
    await page.goto('/friends')
    await expect(
      page.getByRole('heading', { name: 'Friends', level: 1 })
    ).toBeVisible({ timeout: TEST_TIMEOUTS.POLL })
  })
})
