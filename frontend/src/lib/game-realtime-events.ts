export const GAME_ROOM_REALTIME_EVENT = 'sanctum:game-room-realtime-updated'

export interface GameRoomRealtimeUpdateDetail {
  roomId?: number | null
}

export function dispatchGameRoomRealtimeUpdate(
  detail: GameRoomRealtimeUpdateDetail = {}
) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<GameRoomRealtimeUpdateDetail>(GAME_ROOM_REALTIME_EVENT, {
      detail,
    })
  )
}
