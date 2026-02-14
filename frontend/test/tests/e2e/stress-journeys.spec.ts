import { test, expect } from '@playwright/test'
import { USER_STATE_PATH } from './fixtures/auth'

test.describe('Stress Journeys @preprod', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('User can create a post from feed', async ({ page }) => {
    const postText = `Stress test post from Playwright ${Date.now()}`
    await page.goto('/posts')
    await expect(page).toHaveURL(/\/posts/)
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

  test('Authenticated user can open chat', async ({ browser }) => {
    const context1 = await browser.newContext({ storageState: USER_STATE_PATH })
    const page1 = await context1.newPage()

    await page1.goto('/chat')
    await expect(page1).toHaveURL(/\/chat/)
    await expect(page1.getByText('Chatrooms').first()).toBeVisible({
      timeout: 15000,
    })

    await context1.close()
  })
})
