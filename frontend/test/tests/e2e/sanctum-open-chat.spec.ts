import { expect, test } from '@playwright/test'
import { USER_STATE_PATH } from './fixtures/auth'

test.describe('Sanctum open chat', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('open chat uses default_chat_room_id navigation', async ({ page }) => {
    await page.goto('/s/atrium')
    await page.getByRole('button', { name: 'Open Chat' }).click()
    await expect(page).toHaveURL(/\/chat\/\d+$/)
  })
})
