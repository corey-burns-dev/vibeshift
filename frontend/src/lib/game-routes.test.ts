import { describe, expect, it } from 'vitest'
import {
  buildGameRoomPath,
  getGameTypeLabel,
  isSupportedGameType,
  parseGameRoomPath,
} from './game-routes'

describe('game-routes helpers', () => {
  it('parses supported game room routes', () => {
    expect(parseGameRoomPath('/games/connect4/42')).toEqual({
      type: 'connect4',
      roomId: 42,
    })
    expect(parseGameRoomPath('/games/othello/9')).toEqual({
      type: 'othello',
      roomId: 9,
    })
  })

  it('rejects unsupported or invalid routes', () => {
    expect(parseGameRoomPath('/games/chess/1')).toBeNull()
    expect(parseGameRoomPath('/games/connect4/not-a-number')).toBeNull()
    expect(parseGameRoomPath('/games')).toBeNull()
  })

  it('builds room paths and labels', () => {
    expect(buildGameRoomPath('connect4', 18)).toBe('/games/connect4/18')
    expect(getGameTypeLabel('othello')).toBe('Othello')
    expect(isSupportedGameType('connect4')).toBe(true)
    expect(isSupportedGameType('chess')).toBe(false)
  })
})
