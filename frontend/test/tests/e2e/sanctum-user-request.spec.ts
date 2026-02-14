import { expect, test } from '@playwright/test'
import { readTokenFromStorageState, USER_STATE_PATH } from './fixtures/auth'
import { hasMySanctumRequestBySlug, uniqueSlug } from './utils/api'

test.describe('Sanctum request user flow', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('auth user submits request and sees it in My requests @smoke', async ({
    page,
    request,
  }) => {
    const userToken = readTokenFromStorageState(USER_STATE_PATH)
    const slug = uniqueSlug('e2e-req')
    const name = `E2E Request ${slug}`

    await page.goto('/sanctums/request')

    await page.getByLabel('Requested Name').fill(name)
    await page.getByLabel('Requested Slug').fill(slug)
    await page.getByLabel('Reason').fill('E2E verification')
    await page.getByRole('button', { name: 'Submit Request' }).click()

    await expect(page.getByText('Request submitted.')).toBeVisible()

    await expect
      .poll(
        () => hasMySanctumRequestBySlug(request, userToken, slug),
        { timeout: 15000, intervals: [500] }
      )
      .toBe(true)

    await page.goto('/sanctums/requests')
    await page.reload()
    await expect(page.getByText(`/${slug}`)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(name)).toBeVisible({ timeout: 15000 })
  })
})
