import { expect, test } from '@playwright/test'
import {
  ADMIN_STATE_PATH,
  readTokenFromStorageState,
  USER_STATE_PATH,
} from './fixtures/auth'
import {
  approveSanctumRequest,
  createSanctumRequest,
  deleteSanctum,
  getAdminRequestBySlug,
  uniqueSlug,
} from './utils/api'

test.describe('Sanctum open chat', () => {
  test.use({ storageState: ADMIN_STATE_PATH })

  let createdSlug: string | null = null

  test.afterEach(async ({ request }) => {
    if (createdSlug) {
      const adminToken = readTokenFromStorageState(ADMIN_STATE_PATH)
      await deleteSanctum(request, adminToken, createdSlug).catch(() => {})
      createdSlug = null
    }
  })

  test('open chat uses default_chat_room_id navigation @smoke', async ({
    page,
    request,
  }) => {
    const userToken = readTokenFromStorageState(USER_STATE_PATH)
    const adminToken = readTokenFromStorageState(ADMIN_STATE_PATH)

    const slug = uniqueSlug('e2e-chat')
    createdSlug = slug

    // Create and approve a sanctum so it has a default_chat_room_id
    await createSanctumRequest(request, userToken, {
      requested_name: `E2E Chat ${slug}`,
      requested_slug: slug,
      reason: 'Open chat smoke test',
    })

    const pending = await getAdminRequestBySlug(request, adminToken, slug, 'pending')
    expect(pending).not.toBeNull()
    await approveSanctumRequest(request, adminToken, pending!.id)

    await page.goto(`/sanctums/${slug}/manage`)
    await page.getByRole('button', { name: 'Open Chat' }).click()
    await expect(page).toHaveURL(/\/chat\/\d+$/)
  })
})
