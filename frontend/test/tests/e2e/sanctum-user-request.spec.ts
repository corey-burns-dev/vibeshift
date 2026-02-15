import { expect, test } from '@playwright/test'
import { TEST_TIMEOUTS } from './config'
import { readTokenFromStorageState, USER_STATE_PATH } from './fixtures/auth'
import {
  deleteAllMySanctumRequests,
  getMySanctumRequestBySlug,
  hasMySanctumRequestBySlug,
  uniqueSlug,
} from './utils/api'

test.describe('Sanctum request user flow', () => {
  test.use({ storageState: USER_STATE_PATH })

  // Clean up any sanctum requests created during tests
  test.afterEach(async ({ request }) => {
    const userToken = readTokenFromStorageState(USER_STATE_PATH)
    const deletedCount = await deleteAllMySanctumRequests(request, userToken)
    if (deletedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`🧹 Cleaned up ${deletedCount} sanctum request(s)`)
    }
  })

  test('auth user submits request and sees it in My requests @smoke', async ({
    page,
    request,
  }) => {
    const userToken = readTokenFromStorageState(USER_STATE_PATH)
    const slug = uniqueSlug('e2e-req')
    const name = `E2E Request ${slug}`

    // Step 1: Navigate to request form and fill details
    await page.goto('/sanctums/request')

    await page.getByLabel('Requested Name').fill(name)
    await page.getByLabel('Requested Slug').fill(slug)
    await page.getByLabel('Reason').fill('E2E verification')

    // Step 2: Submit the request
    await page.getByRole('button', { name: 'Submit Request' }).click()

    // Assertion: Verify success message appears
    await expect(page.getByText('Request submitted.')).toBeVisible()

    // Assertion: Verify request exists in API
    await expect
      .poll(
        () => hasMySanctumRequestBySlug(request, userToken, slug),
        { timeout: TEST_TIMEOUTS.POLL, intervals: [TEST_TIMEOUTS.POLL_INTERVAL] }
      )
      .toBe(true)

    // Assertion: Verify request has "pending" status
    const createdRequest = await getMySanctumRequestBySlug(
      request,
      userToken,
      slug
    )
    expect(createdRequest).not.toBeNull()
    expect(createdRequest?.status).toBe('pending')
    expect(createdRequest?.requested_name).toBe(name)
    expect(createdRequest?.requested_slug).toBe(slug)

    // Step 3: Navigate to My Requests page
    await page.goto('/sanctums/requests', { waitUntil: 'networkidle' })

    // Assertion: Wait for list to load then verify request appears (slug shown as /slug in UI)
    await expect(
      page.locator('article').filter({ hasText: slug }).first()
    ).toBeVisible({ timeout: TEST_TIMEOUTS.POLL })
    await expect(page.getByText(name)).toBeVisible({
      timeout: TEST_TIMEOUTS.POLL,
    })

    // Assertion: Verify "pending" status is displayed in UI
    const requestRow = page.locator('article').filter({ hasText: slug }).first()
    await expect(requestRow).toBeVisible()
    await expect(requestRow.getByText(/pending/i)).toBeVisible()

    // Assertion: Verify request details (reason) are displayed
    await expect(requestRow.getByText('E2E verification')).toBeVisible()
  })
})
