import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const authHookPath = path.resolve(__dirname, 'useAuth.ts')
const onboardingDocPath = path.resolve(
  __dirname,
  '../../../docs/ONBOARDING_SANCTUMS_TODO.md'
)

describe('signup onboarding guardrails', () => {
  it('keeps signup redirect on /posts until onboarding API exists and docs are updated', () => {
    const authHook = fs.readFileSync(authHookPath, 'utf-8')

    expect(authHook).toContain("TODO(onboarding/sanctums)")
    expect(authHook).toContain("navigate('/posts')")
    expect(authHook).not.toContain("navigate('/onboarding/sanctums')")
  })

  it('requires onboarding TODO spec doc to exist with backend endpoint contract', () => {
    expect(fs.existsSync(onboardingDocPath)).toBe(true)

    const doc = fs.readFileSync(onboardingDocPath, 'utf-8')
    expect(doc).toContain('Status: **Not implemented intentionally**.')
    expect(doc).toContain('Minimal backend API needed')
    expect(doc).toContain('POST /api/sanctums/memberships/bulk')
    expect(doc).toContain('GET /api/sanctums/memberships/me')
    expect(doc).toContain('/onboarding/sanctums')
  })
})
