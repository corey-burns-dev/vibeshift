import { isSupportedGameType, type SupportedGameType } from '@/lib/game-routes'

export type ResumableGameType = SupportedGameType
export type ResumableGameStatus = 'pending' | 'active'
export const GAME_ROOM_PRESENCE_EVENT = 'sanctum:game-room-presence-updated'

export interface ResumableGameRoom {
  roomId: number
  type: ResumableGameType
  status: ResumableGameStatus
  updatedAt: number
}

const MAX_TRACKED_ROOMS = 8

function getStorageKey(userId: number) {
  return `sanctum:resumable-game-rooms:${userId}`
}

function isResumableRoom(value: unknown): value is ResumableGameRoom {
  if (!value || typeof value !== 'object') return false
  const room = value as Partial<ResumableGameRoom>
  return (
    typeof room.roomId === 'number' &&
    isSupportedGameType(room.type) &&
    (room.status === 'pending' || room.status === 'active') &&
    typeof room.updatedAt === 'number'
  )
}

function loadRooms(userId: number): ResumableGameRoom[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(getStorageKey(userId))
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isResumableRoom)
  } catch {
    return []
  }
}

function saveRooms(userId: number, rooms: ResumableGameRoom[]) {
  if (typeof window === 'undefined') return

  if (rooms.length === 0) {
    window.localStorage.removeItem(getStorageKey(userId))
    window.dispatchEvent(
      new CustomEvent(GAME_ROOM_PRESENCE_EVENT, { detail: { userId } })
    )
    return
  }

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(rooms))
  window.dispatchEvent(
    new CustomEvent(GAME_ROOM_PRESENCE_EVENT, { detail: { userId } })
  )
}

export function getResumableGameRooms(
  userId: number | null | undefined
): ResumableGameRoom[] {
  if (!userId) return []
  return loadRooms(userId).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function upsertResumableGameRoom(
  userId: number | null | undefined,
  room: Omit<ResumableGameRoom, 'updatedAt'>
) {
  if (!userId) return

  const existing = loadRooms(userId).filter(item => item.roomId !== room.roomId)
  existing.unshift({
    ...room,
    updatedAt: Date.now(),
  })

  saveRooms(userId, existing.slice(0, MAX_TRACKED_ROOMS))
}

export function removeResumableGameRoom(
  userId: number | null | undefined,
  roomId: number
) {
  if (!userId) return

  const next = loadRooms(userId).filter(room => room.roomId !== roomId)
  saveRooms(userId, next)
}
