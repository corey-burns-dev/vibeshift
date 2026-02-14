import { ApiError, apiClient } from '@/api/client'
import { getWsBaseUrl } from './chat-utils'
import { logger } from './logger'

/**
 * Options for creating a ticketed WebSocket connection
 */
export interface TicketedWSOptions {
  path: string
  onMessage?: (event: MessageEvent) => void
  onOpen?: (event: Event) => void
  onClose?: (event: CloseEvent) => void
  onError?: (event: Event) => void
}

/**
 * Creates a WebSocket connection using a fresh authentication ticket.
 * The ticket is requested via API and appended to the WebSocket URL.
 */
export async function createTicketedWS(
  options: TicketedWSOptions
): Promise<WebSocket> {
  let ticketResp: { ticket: string; expires_in: number }
  try {
    ticketResp = await apiClient.issueWSTicket()
    logger.debug(
      '[ws] ticket issued (not logged) expires_in=',
      ticketResp.expires_in
    )
  } catch (err) {
    if (err instanceof ApiError) {
      logger.error('[ws] ticket issuance failed', {
        status: err.status,
        code: err.code,
        message: err.message,
      })
      // Suggest a retry delay for developers (non-authoritative)
      logger.debug('[ws] suggested retry in', getNextBackoff(0), 'ms')
    } else {
      logger.error('[ws] ticket issuance unexpected error', err)
      logger.debug('[ws] suggested retry in', getNextBackoff(0), 'ms')
    }
    throw err
  }

  const baseUrl = getWsBaseUrl()
  const separator = options.path.includes('?') ? '&' : '?'
  const wsUrl = `${baseUrl}${options.path}${separator}ticket=${ticketResp.ticket}`

  const wsUrlNoTicket = `${baseUrl}${options.path}`

  // Log the base WS endpoint (do not log the ticket)
  logger.debug('[ws] connecting to', wsUrlNoTicket, '(ticket appended)')

  let ws: WebSocket
  try {
    ws = new WebSocket(wsUrl)
  } catch (err) {
    logger.error('[ws] WebSocket constructor failed for', wsUrlNoTicket, err)
    throw err
  }

  if (options.onOpen) ws.onopen = options.onOpen
  if (options.onMessage) ws.onmessage = options.onMessage
  if (options.onClose) ws.onclose = options.onClose
  if (options.onError) ws.onerror = options.onError

  return ws
}

/**
 * Shared logic for exponential backoff with jitter
 */
export function getNextBackoff(
  attempt: number,
  base = 1000,
  cap = 30000
): number {
  const delay = Math.min(cap, base * 2 ** attempt)
  const jitter = delay * 0.1 * Math.random()
  return delay + jitter
}
