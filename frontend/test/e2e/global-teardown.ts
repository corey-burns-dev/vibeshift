import fs from 'node:fs'
import { Client } from 'pg'
import { ADMIN_STATE_PATH, USER_STATE_PATH } from './fixtures/auth'

const API_BASE_RAW =
  process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8375/api'
const API_BASE = API_BASE_RAW.endsWith('/') ? API_BASE_RAW : `${API_BASE_RAW}/`

/**
 * Global teardown for E2E tests
 *
 * This runs once after all tests complete. It provides optional cleanup
 * of test data and users created during the test run.
 *
 * Environment variables:
 * - E2E_CLEANUP_USERS: Set to "true" to delete test users from database
 * - E2E_CLEANUP_AUTH: Set to "true" to delete auth state files
 */
export default async function globalTeardown() {
  const cleanupUsers = process.env.E2E_CLEANUP_USERS === 'true'
  const cleanupAuth = process.env.E2E_CLEANUP_AUTH === 'true'

  // eslint-disable-next-line no-console
  console.log('\n🧹 Global teardown starting...')

  // Clean up authentication state files if requested
  if (cleanupAuth) {
    try {
      if (fs.existsSync(USER_STATE_PATH)) {
        fs.unlinkSync(USER_STATE_PATH)
        // eslint-disable-next-line no-console
        console.log('✓ Removed user auth state file')
      }
      if (fs.existsSync(ADMIN_STATE_PATH)) {
        fs.unlinkSync(ADMIN_STATE_PATH)
        // eslint-disable-next-line no-console
        console.log('✓ Removed admin auth state file')
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Failed to clean up auth state files:', error)
    }
  }

  // Clean up test users from database if requested
  if (cleanupUsers) {
    try {
      await cleanupTestUsers()
      // eslint-disable-next-line no-console
      console.log('✓ Cleaned up test users from database')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  Failed to clean up test users:', error)
    }
  }

  if (!cleanupUsers && !cleanupAuth) {
    // eslint-disable-next-line no-console
    console.log(
      '💡 Tip: Set E2E_CLEANUP_USERS=true or E2E_CLEANUP_AUTH=true to clean up test data'
    )
  }

  // eslint-disable-next-line no-console
  console.log('🧹 Global teardown complete\n')
}

/**
 * Delete test users from the database
 * Removes users created by global-setup and during tests
 */
async function cleanupTestUsers() {
  const host = process.env.PGHOST || process.env.DB_HOST || 'localhost'
  const port = Number(process.env.PGPORT || process.env.DB_PORT || '5432')
  const user =
    process.env.PGUSER ||
    process.env.DB_USER ||
    process.env.POSTGRES_USER ||
    'user'
  const password =
    process.env.PGPASSWORD ||
    process.env.DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    'password'
  const database =
    process.env.PGDATABASE ||
    process.env.DB_NAME ||
    process.env.POSTGRES_DB ||
    'sanctum_test'

  const client = new Client({ host, port, user, password, database })

  try {
    await client.connect()

    // Delete users created by e2e tests
    // These typically have usernames starting with 'e2e' or emails containing 'e2e'
    const result = await client.query(
      `DELETE FROM users
       WHERE username LIKE 'e2e%'
          OR email LIKE '%e2e%@example.com'
       RETURNING id, username, email`
    )

    if (result.rowCount && result.rowCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`   Deleted ${result.rowCount} test user(s):`)
      for (const row of result.rows) {
        // eslint-disable-next-line no-console
        console.log(`   - ${row.username} (${row.email})`)
      }
    }
  } finally {
    await client.end()
  }
}
