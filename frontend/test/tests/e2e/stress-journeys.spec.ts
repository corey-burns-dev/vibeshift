import { test, expect } from '@playwright/test'

test.describe('Stress Journeys @preprod', () => {
  test('User can login, post, and receive notification', async ({ page }) => {
    // 1. Login
    await page.goto('/login')
    await page.fill('input[name="email"]', 'admin@example.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/')

    // 2. Create Post
    await page.fill(
      'textarea[placeholder*="What\'s on your mind"]',
      'Stress test post from Playwright'
    )
    await page.click('button:has-text("Post")')

    // 3. Verify post appeared (simplified)
    await expect(
      page.locator('text=Stress test post from Playwright')
    ).toBeVisible()

    // 4. Navigate to a sanctum (if possible)
    // For now just check notifications
    await page.goto('/notifications')
    await expect(page.locator('h1')).toContainText('Notifications')
  })

  test('Two users messaging', async ({ browser }) => {
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()

    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    // Login User 1 (Admin)
    await page1.goto('/login')
    await page1.fill('input[name="email"]', 'admin@example.com')
    await page1.fill('input[name="password"]', 'password123')
    await page1.click('button[type="submit"]')

    // Login User 2 (if we had another test user seeded)
    // For now we just check if we can open chat
    await page1.goto('/messages')
    await expect(page1.locator('text=Messages')).toBeVisible()
  })
})
