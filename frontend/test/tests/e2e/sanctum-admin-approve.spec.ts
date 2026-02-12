import { expect, test } from '@playwright/test'
import {
  ADMIN_STATE_PATH,
  readTokenFromStorageState,
  USER_STATE_PATH,
} from './fixtures/auth'
import { createSanctumRequest, uniqueSlug } from './utils/api'

test.describe('Sanctum admin approve flow', () => {
  test.use({ storageState: ADMIN_STATE_PATH })

  test('admin approves request and sanctum appears in list/detail @smoke', async ({
    page,
    request,
  }) => {
    const userToken = readTokenFromStorageState(USER_STATE_PATH)

    const slug = uniqueSlug('e2e-approve')
    const name = `E2E Approve ${slug}`

    const createResponse = await createSanctumRequest(request, userToken, {
      requested_name: name,
      requested_slug: slug,
      reason: 'Needs approval',
    })
    expect(createResponse.ok()).toBeTruthy()

    await page.goto('/admin/sanctum-requests')

    const row = page
      .locator('article')
      .filter({ hasText: `/${slug}` })
      .first()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Approve' }).click()

    await page.goto('/sanctums')
    const sanctumLink = page.locator(`a[href='/s/${slug}']`).first()
    await expect(sanctumLink).toBeVisible()
    await sanctumLink.click()

    await expect(page).toHaveURL(new RegExp(`/s/${slug}$`))
    await expect(page.getByRole('heading', { name })).toBeVisible()
  })
})
