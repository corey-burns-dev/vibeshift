import { useEffect } from 'react'
import {
  type ResumableGameStatus,
  removeResumableGameRoom,
  upsertResumableGameRoom,
} from '@/lib/game-room-presence'
import type { SupportedGameType } from '@/lib/game-routes'

interface UseResumableGameRoomPresenceOptions {
  userId?: number
  roomId?: number | null
  type: SupportedGameType
  status?: string | null
  isParticipant: boolean
}

export function useResumableGameRoomPresence({
  userId,
  roomId,
  type,
  status,
  isParticipant,
}: UseResumableGameRoomPresenceOptions) {
  useEffect(() => {
    if (!roomId || Number.isNaN(roomId) || !userId) return

    if (!isParticipant) {
      removeResumableGameRoom(userId, roomId)
      return
    }

    if (status === 'pending' || status === 'active') {
      upsertResumableGameRoom(userId, {
        roomId,
        type,
        status: status as ResumableGameStatus,
      })
      return
    }

    removeResumableGameRoom(userId, roomId)
  }, [isParticipant, roomId, status, type, userId])
}
