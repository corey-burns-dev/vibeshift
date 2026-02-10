import fs from 'node:fs'
import path from 'node:path'
import { request as playwrightRequest } from '@playwright/test'
import { Client } from 'pg'
import { ADMIN_STATE_PATH, AUTH_DIR, USER_STATE_PATH } from './fixtures/auth'

const API_BASE_RAW =
  process.env.PLAYWRIGHT_API_URL || 'http://localhost:8375/api'
const API_BASE = API_BASE_RAW.endsWith('/') ? API_BASE_RAW : `${API_BASE_RAW}/`
const FRONTEND_ORIGIN = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

type SignupResponse = {
  token: string
  user: {
    id: number
    username: string
    email: string
    is_admin?: boolean
  }
}

function buildStorageState(token: string, user: SignupResponse['user']) {
  return {
    cookies: [],
    origins: [
      {
        origin: FRONTEND_ORIGIN,
        localStorage: [
          { name: 'token', value: token },
          { name: 'user', value: JSON.stringify(user) },
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
}

async function promoteAdmin(userID: number) {
  const host = process.env.PGHOST || process.env.DB_HOST || 'localhost'
  const port = Number(process.env.PGPORT || process.env.DB_PORT || '5432')
  const user =
    process.env.PGUSER ||
    process.env.DB_USER ||
    process.env.POSTGRES_USER ||
    'sanctum_user'
  const password =
    process.env.PGPASSWORD ||
    process.env.DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    'sanctum_password'
  const configuredDatabase =
    process.env.PGDATABASE || process.env.DB_NAME || process.env.POSTGRES_DB

  const candidates = [
    configuredDatabase,
    'sanctum_test',
    'aichat',
    'social_media',
    'postgres',
  ].filter((db): db is string => Boolean(db))

  let lastError: unknown = null

  for (const database of candidates) {
    const client = new Client({ host, port, user, password, database })

    try {
      await client.connect()
      const result = await client.query(
        'UPDATE users SET is_admin = TRUE WHERE id = $1',
        [userID]
      )
      if ((result.rowCount ?? 0) > 0) {
        await client.end()
        return
      }
    } catch (error) {
      lastError = error
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  throw new Error(
    `unable to promote e2e admin user ${userID} in candidate databases ${candidates.join(', ')}: ${String(lastError)}`
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

    fs.writeFileSync(USER_STATE_PATH, JSON.stringify(buildStorageState(user.token, user.user), null, 2))
    fs.writeFileSync(ADMIN_STATE_PATH, JSON.stringify(buildStorageState(admin.token, adminUser), null, 2))
  } finally {
    await api.dispose()
  }

  if (!fs.existsSync(USER_STATE_PATH) || !fs.existsSync(ADMIN_STATE_PATH)) {
    throw new Error(`failed to create auth states in ${AUTH_DIR}`)
  }
}
