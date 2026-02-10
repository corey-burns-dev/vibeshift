import fs from 'node:fs'
import path from 'node:path'

export const AUTH_DIR = path.resolve(__dirname, '..', '.auth')
export const USER_STATE_PATH = path.join(AUTH_DIR, 'user.json')
export const ADMIN_STATE_PATH = path.join(AUTH_DIR, 'admin.json')

interface StorageState {
  cookies: unknown[]
  origins: Array<{
    origin: string
    localStorage: Array<{ name: string; value: string }>
  }>
}

export function readTokenFromStorageState(statePath: string): string {
  const raw = fs.readFileSync(statePath, 'utf-8')
  const parsed = JSON.parse(raw) as StorageState
  const token = parsed.origins
    .flatMap(origin => origin.localStorage)
    .find(item => item.name === 'token')?.value

  if (!token) {
    throw new Error(`token missing in storage state: ${statePath}`)
  }

  return token
}
