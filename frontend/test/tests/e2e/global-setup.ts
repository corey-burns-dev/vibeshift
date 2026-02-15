import { request as playwrightRequest } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { TEST_TIMEOUTS } from './config'
import { ADMIN_STATE_PATH, AUTH_DIR, USER_STATE_PATH } from './fixtures/auth'

const API_BASE_RAW =
  process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8375/api'
const API_BASE = API_BASE_RAW.endsWith('/') ? API_BASE_RAW : `${API_BASE_RAW}/`
const FRONTEND_ORIGIN =
  process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

type SignupResponse = {
  token: string
  user: {
    id: number
    username: string
    email: string
    is_admin?: boolean
  }
}

// Zustand persist key used by useAuthSessionStore; app reads token from here, not from 'token'.
const AUTH_SESSION_STORAGE_KEY = 'auth-session-storage'

function buildStorageState(token: string, user: SignupResponse['user']) {
  const authSessionStorageValue = JSON.stringify({
    state: {
      accessToken: token,
      _hasHydrated: true,
    },
    version: 0,
  })
  return {
    cookies: [],
    origins: [
      {
        origin: FRONTEND_ORIGIN,
        localStorage: [
          { name: 'token', value: token },
          { name: 'user', value: JSON.stringify(user) },
          { name: AUTH_SESSION_STORAGE_KEY, value: authSessionStorageValue },
        ],
      },
    ],
  }
}

async function signup(
  api: Awaited<ReturnType<typeof playwrightRequest.newContext>>,
  prefix: string
): Promise<SignupResponse> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const username = `${prefix}${suffix}`.slice(0, 20)
  const email = `${prefix}-${suffix}@example.com`

  // Retry signup a few times in case the API is still starting up or transient
  const maxAttempts = 8
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await api.post('auth/signup', {
        data: {
          username,
          email,
          password: 'TestPass123!@#',
        },
      })

      if (!res.ok()) {
        throw new Error(`signup failed (${res.status()}): ${await res.text()}`)
      }

      return (await res.json()) as SignupResponse
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        // exponential backoff with jitter
        const wait =
          Math.min(
            TEST_TIMEOUTS.RETRY_BASE * attempt,
            TEST_TIMEOUTS.RETRY_MAX
          ) + Math.floor(Math.random() * 200)
        // eslint-disable-next-line no-console
        console.warn(
          `signup attempt ${attempt} failed, retrying in ${wait}ms:`,
          String(err)
        )
        // small delay before retrying
        // eslint-disable-next-line no-await-in-loop
        await delay(wait)
        continue
      }
      break
    }
  }

  const hint = `Ensure the API server at ${API_BASE} is running and reachable. Try starting the backend (e.g. run \`make dev\` from repo root or bring up the compose stack) and re-run tests.`
  throw new Error(
    `signup failed after ${maxAttempts} attempts: ${String(lastError)}\n${hint}`
  )
}

async function promoteAdmin(userID: number) {
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
  const configuredDatabase =
    process.env.PGDATABASE || process.env.DB_NAME || process.env.POSTGRES_DB

  // Prefer explicitly configured database, then try common test database names
  const candidates = [
    configuredDatabase,
    'sanctum_test',
    'sanctum',
    'postgres', // fallback for local development
  ].filter((db): db is string => Boolean(db))

  const attemptErrors: string[] = []
  let warnedAboutFallback = false

  for (const database of candidates) {
    const client = new Client({ host, port, user, password, database })

    try {
      await client.connect()
      const result = await client.query(
        'UPDATE users SET is_admin = TRUE WHERE id = $1',
        [userID]
      )
      if ((result.rowCount ?? 0) > 0) {
        // Warn if we're using a fallback database instead of configured one
        if (
          !warnedAboutFallback &&
          database !== configuredDatabase &&
          configuredDatabase
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `⚠️  Using fallback database '${database}' instead of configured '${configuredDatabase}'. ` +
              `Consider setting PGDATABASE=${database} to avoid this warning.`
          )
        }
        await client.end()
        return
      }
    } catch (error) {
      attemptErrors.push(`${database}: ${String(error)}`)
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  throw new Error(
    `Failed to promote e2e admin user ${userID}. ` +
      `Tried connecting to databases: ${candidates.join(', ')} ` +
      `at ${host}:${port} with user=${user}.\n` +
      `Errors:\n${attemptErrors.map(e => `  - ${e}`).join('\n')}\n\n` +
      `Hint: Ensure PostgreSQL is running and PGDATABASE environment variable is set correctly.`
  )
}

export default async function globalSetup() {
  fs.mkdirSync(path.dirname(USER_STATE_PATH), { recursive: true })

  const api = await playwrightRequest.newContext({ baseURL: API_BASE })

  try {
    const user = await signup(api, 'e2euser')
    const admin = await signup(api, 'e2eadmin')

    await promoteAdmin(admin.user.id)

    const adminUser = { ...admin.user, is_admin: true }

    fs.writeFileSync(
      USER_STATE_PATH,
      JSON.stringify(buildStorageState(user.token, user.user), null, 2)
    )
    fs.writeFileSync(
      ADMIN_STATE_PATH,
      JSON.stringify(buildStorageState(admin.token, adminUser), null, 2)
    )
  } finally {
    await api.dispose()
  }

  if (!fs.existsSync(USER_STATE_PATH) || !fs.existsSync(ADMIN_STATE_PATH)) {
    throw new Error(`failed to create auth states in ${AUTH_DIR}`)
  }
}
