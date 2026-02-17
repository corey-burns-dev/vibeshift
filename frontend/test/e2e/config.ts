/**
 * E2E Test Configuration Constants
 *
 * Centralized timeout and polling configuration for end-to-end tests.
 */

export const TEST_TIMEOUTS = {
  /** Default polling timeout for async operations (15s) */
  POLL: 15_000,

  /** Polling interval for expect.poll() checks (500ms) */
  POLL_INTERVAL: 500,

  /** Base delay for exponential backoff in retry logic (2s) */
  RETRY_BASE: 2000,

  /** Maximum delay for exponential backoff in retry logic (10s) */
  RETRY_MAX: 10_000,
} as const
