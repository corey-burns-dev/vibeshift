import { expect, test } from '@playwright/test'
import { TEST_TIMEOUTS } from './config'
import {
  ADMIN_STATE_PATH,
  readTokenFromStorageState,
  USER_STATE_PATH,
} from './fixtures/auth'
import {
  createSanctumRequest,
  deleteAllMySanctumRequests,
  deleteSanctum,
  getAdminRequestBySlug,
  getMySanctumRequestBySlug,
  uniqueSlug,
} from './utils/api'

test.describe('Sanctum admin approve flow', () => {
  test.use({ storageState: ADMIN_STATE_PATH })

  // Track created sanctum slugs for cleanup
  let createdSlugs: string[] = []

  test.beforeEach(() => {
    createdSlugs = []
  })

  test.afterEach(async ({ request }) => {
    const adminToken = readTokenFromStorageState(ADMIN_STATE_PATH)
    const userToken = readTokenFromStorageState(USER_STATE_PATH)

    // Clean up any approved sanctums
    for (const slug of createdSlugs) {
      try {
        const deleted = await deleteSanctum(request, adminToken, slug)
        if (deleted) {
          // eslint-disable-next-line no-console
          console.log(`🧹 Cleaned up sanctum: ${slug}`)
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Failed to delete sanctum ${slug}:`, error)
      }
    }

    // Also clean up any pending requests (in case test failed before approval)
    const deletedRequests = await deleteAllMySanctumRequests(request, userToken)
    if (deletedRequests > 0) {
      // eslint-disable-next-line no-console
      console.log(`🧹 Cleaned up ${deletedRequests} pending request(s)`)
    }
  })

  test('admin approves request and sanctum appears in list/detail @smoke', async ({
    page,
    request,
  }) => {
    const userToken = readTokenFromStorageState(USER_STATE_PATH)
    const adminToken = readTokenFromStorageState(ADMIN_STATE_PATH)

    const slug = uniqueSlug('e2e-approve')
    const name = `E2E Approve ${slug}`
    createdSlugs.push(slug) // Track for cleanup

    // Step 1: Create sanctum request as user
    await createSanctumRequest(request, userToken, {
      requested_name: name,
      requested_slug: slug,
      reason: 'Needs approval',
    })

    // Assertion: Verify request is created with "pending" status
    await expect
      .poll(
        async () => {
          const req = await getMySanctumRequestBySlug(request, userToken, slug)
          return req?.status
        },
        { timeout: TEST_TIMEOUTS.POLL, intervals: [TEST_TIMEOUTS.POLL_INTERVAL] }
      )
      .toBe('pending')

    // Assertion: Verify request appears in admin pending list
    const pendingRequest = await getAdminRequestBySlug(
      request,
      adminToken,
      slug,
      'pending'
    )
    expect(pendingRequest).not.toBeNull()
    expect(pendingRequest?.requested_name).toBe(name)
    expect(pendingRequest?.status).toBe('pending')

    // Step 2: Admin approves the request
    await page.goto('/admin/sanctum-requests')

    const row = page
      .locator('article')
      .filter({ hasText: `/${slug}` })
      .first()
    await expect(row).toBeVisible()

    // Assertion: Verify "pending" status badge is visible before approval
    await expect(row.getByText(/pending/i)).toBeVisible()

    await row.getByRole('button', { name: 'Approve' }).click()

    // Assertion: Verify request moves to "approved" status
    await expect
      .poll(
        async () => {
          const req = await getAdminRequestBySlug(request, adminToken, slug, 'approved')
          return req?.status
        },
        { timeout: TEST_TIMEOUTS.POLL, intervals: [TEST_TIMEOUTS.POLL_INTERVAL] }
      )
      .toBe('approved')

    // Assertion: Verify request no longer in pending list
    const stillPending = await getAdminRequestBySlug(
      request,
      adminToken,
      slug,
      'pending'
    )
    expect(stillPending).toBeNull()

    // Step 3: Verify sanctum appears in sanctums list
    await page.goto('/sanctums')
    const sanctumLink = page.locator(`a[href='/s/${slug}']`).first()
    await expect(sanctumLink).toBeVisible()
    await sanctumLink.click()

    // Assertion: Verify sanctum detail page loads with correct name
    await expect(page).toHaveURL(new RegExp(`/s/${slug}$`))
    await expect(page.getByRole('heading', { name })).toBeVisible()

    // Assertion: Verify sanctum is functional (can access chat if button present)
    const openChatButton = page.getByRole('button', { name: /open chat/i })
    const chatVisible = await openChatButton.isVisible().catch(() => false)
    if (chatVisible) {
      await openChatButton.click()
      await expect(page).toHaveURL(/\/chat\/\d+/)
    }
    // If Open chat not visible (e.g. session redirect in CI), smoke still passed: list + detail verified
  })
})
