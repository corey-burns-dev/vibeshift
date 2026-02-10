import { expect, test } from '@playwright/test'
import { USER_STATE_PATH, readTokenFromStorageState } from './fixtures/auth'
import { approveSanctumRequest, createSanctumRequest, uniqueSlug } from './utils/api'

test.describe('Sanctum access control', () => {
  test.use({ storageState: USER_STATE_PATH })

  test('non-admin cannot access admin page or approve endpoints', async ({
    page,
    request,
  }) => {
    const userToken = readTokenFromStorageState(USER_STATE_PATH)

    await page.goto('/admin/sanctum-requests')
    await expect(page).toHaveURL(/\/sanctums$/)

    const slug = uniqueSlug('e2e-deny')
    const createResponse = await createSanctumRequest(request, userToken, {
      requested_name: `E2E Deny ${slug}`,
      requested_slug: slug,
      reason: 'Access control test',
    })
    expect(createResponse.ok()).toBeTruthy()

    const requestBody = (await createResponse.json()) as { id: number }

    const approveResponse = await approveSanctumRequest(
      request,
      userToken,
      requestBody.id,
      'should not be allowed'
    )
    expect(approveResponse.status()).toBe(403)
  })
})
