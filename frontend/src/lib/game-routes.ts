export const SUPPORTED_GAME_TYPES = ['connect4', 'othello'] as const

export type SupportedGameType = (typeof SUPPORTED_GAME_TYPES)[number]

export function isSupportedGameType(type: unknown): type is SupportedGameType {
  return (
    typeof type === 'string' &&
    (SUPPORTED_GAME_TYPES as readonly string[]).includes(type)
  )
}

export function getGameTypeLabel(type: SupportedGameType): string {
  switch (type) {
    case 'connect4':
      return 'Connect Four'
    case 'othello':
      return 'Othello'
  }
}

export function buildGameRoomPath(type: SupportedGameType, roomId: number) {
  return `/games/${type}/${roomId}`
}

export function parseGameRoomPath(pathname: string): {
  type: SupportedGameType
  roomId: number
} | null {
  const match = pathname.match(/^\/games\/([^/]+)\/([^/]+)$/)
  if (!match) return null

  const [, maybeType, maybeRoomId] = match
  if (!isSupportedGameType(maybeType)) return null

  const roomId = Number(maybeRoomId)
  if (!Number.isFinite(roomId) || roomId <= 0) return null

  return {
    type: maybeType,
    roomId,
  }
}
