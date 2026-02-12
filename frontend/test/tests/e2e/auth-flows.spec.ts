import { expect, test } from '@playwright/test'

test.describe('Auth flows', () => {
  test('signup redirects to onboarding', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const username = `e2eauth${suffix}`.slice(0, 20)
    const email = `e2eauth-${suffix}@example.com`

    await page.goto('/signup')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('TestPass123!@#')
    await page.getByLabel('Confirm Password').fill('TestPass123!@#')
    await page.getByRole('button', { name: 'Create Account' }).click()

    await expect(page).toHaveURL(/\/onboarding\/sanctums/)
  })

  test('login redirects to posts', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('e2euser@example.com')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL('/login')
  })
})
