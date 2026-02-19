import { expect, test } from '@playwright/test'
import { TEST_TIMEOUTS } from './config'
import { readTokenFromStorageState, USER_STATE_PATH } from './fixtures/auth'
import { deleteAllMyPosts } from './utils/api'

test.describe('Stress Journeys', () => {
  test.use({ storageState: USER_STATE_PATH })

  // Clean up posts created during tests
  test.afterEach(async ({ request }) => {
    const userToken = readTokenFromStorageState(USER_STATE_PATH)
    const deletedCount = await deleteAllMyPosts(request, userToken)
    if (deletedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`🧹 Cleaned up ${deletedCount} post(s)`)
    }
  })

  test('User can create a post from feed @smoke', async ({ page }) => {
    const postText = `Stress test post from Playwright ${Date.now()}`
    // Canonical feed route is "/" ("/posts" redirects to "/").
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await page.evaluate(() => window.scrollTo(0, 0))
    const composerToggle = page
      .getByRole('button', { name: /what's on your mind/i })
      .first()
    await expect(composerToggle).toBeVisible()
    await composerToggle.click()
    await expect(
      page.locator('textarea[placeholder*="Write your post"]')
    ).toBeVisible()
    await page.fill('textarea[placeholder*="Write your post"]', postText)
    await page.getByRole('button', { name: /^Post$/ }).click()

    await expect(
      page.locator('p').filter({ hasText: postText }).first()
    ).toBeVisible()
  })

  test('Authenticated user can open chat @preprod', async ({ browser }) => {
    const context1 = await browser.newContext({ storageState: USER_STATE_PATH })
    const page1 = await context1.newPage()

    await page1.goto('/chat')
    await expect(page1).toHaveURL(/\/chat/)
    await expect(page1.getByText('Chatrooms').first()).toBeVisible({
      timeout: TEST_TIMEOUTS.POLL,
    })

    await context1.close()
  })
})
