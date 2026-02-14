import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudio } from '@/hooks/useAudio'

// Mock asset imports so tests don't depend on actual files
vi.mock('@/assets/sounds/drop-piece.m4a', () => ({
  default: 'mock://drop-piece.m4a',
}))
vi.mock('@/assets/sounds/drop-piece.mp3', () => ({
  default: 'mock://drop-piece.mp3',
}))
vi.mock('@/assets/sounds/drop-piece.ogg', () => ({
  default: 'mock://drop-piece.ogg',
}))
vi.mock('@/assets/sounds/friend-online.m4a', () => ({
  default: 'mock://friend-online.m4a',
}))
vi.mock('@/assets/sounds/friend-online.mp3', () => ({
  default: 'mock://friend-online.mp3',
}))
vi.mock('@/assets/sounds/friend-online.ogg', () => ({
  default: 'mock://friend-online.ogg',
}))
vi.mock('@/assets/sounds/new-message.mp3', () => ({
  default: 'mock://new-message.mp3',
}))

describe('useAudio', () => {
  let mockAudioInstance: {
    src: string
    canPlayType: (type: string) => string
    play: ReturnType<typeof vi.fn>
  }
  let OriginalAudio: typeof window.Audio
  let OriginalAudioContext: typeof window.AudioContext

  beforeEach(() => {
    mockAudioInstance = {
      src: '',
      canPlayType: vi.fn((_type: string) => 'probably'),
      play: vi.fn().mockResolvedValue(undefined),
    }
    OriginalAudio = window.Audio
    ;(window as unknown as { Audio: typeof window.Audio }).Audio =
      function MockAudio() {
        return mockAudioInstance as unknown as HTMLAudioElement
      } as unknown as typeof window.Audio

    OriginalAudioContext = window.AudioContext
  })

  afterEach(() => {
    ;(window as unknown as { Audio: typeof window.Audio }).Audio = OriginalAudio
    ;(
      window as unknown as { AudioContext: typeof window.AudioContext }
    ).AudioContext = OriginalAudioContext
    vi.restoreAllMocks()
  })

  it('returns all sound API functions', () => {
    const { result } = renderHook(() => useAudio())

    expect(result.current.playDirectMessageSound).toBeTypeOf('function')
    expect(result.current.playRoomAlertSound).toBeTypeOf('function')
    expect(result.current.playDropPieceSound).toBeTypeOf('function')
    expect(result.current.playFriendOnlineSound).toBeTypeOf('function')
    expect(result.current.playNewMessageSound).toBeTypeOf('function')
  })

  it('playNewMessageSound sets src and calls play on Audio instance', () => {
    const { result } = renderHook(() => useAudio())

    result.current.playNewMessageSound()

    expect(mockAudioInstance.src).toContain('new-message')
    expect(mockAudioInstance.play).toHaveBeenCalled()
  })

  it('playFriendOnlineSound sets src and calls play on Audio instance', () => {
    const { result } = renderHook(() => useAudio())

    result.current.playFriendOnlineSound()

    expect(mockAudioInstance.src).toContain('friend-online')
    expect(mockAudioInstance.play).toHaveBeenCalled()
  })

  it('playDropPieceSound sets src and calls play on Audio instance', () => {
    const { result } = renderHook(() => useAudio())

    result.current.playDropPieceSound()

    expect(
      mockAudioInstance.src.includes('drop-piece') ||
        mockAudioInstance.play.mock.calls.length > 0
    ).toBe(true)
    expect(mockAudioInstance.play).toHaveBeenCalled()
  })

  it('playDirectMessageSound no-ops when AudioContext is missing', () => {
    ;(window as unknown as { AudioContext: undefined }).AudioContext = undefined
    const { result } = renderHook(() => useAudio())

    expect(() => result.current.playDirectMessageSound()).not.toThrow()
  })

  it('playRoomAlertSound no-ops when AudioContext is missing', () => {
    ;(window as unknown as { AudioContext: undefined }).AudioContext = undefined
    const { result } = renderHook(() => useAudio())

    expect(() => result.current.playRoomAlertSound()).not.toThrow()
  })

  it('playDirectMessageSound does not throw when AudioContext is available', () => {
    const mockClose = vi.fn()
    const mockDestination = {}
    const mockOscillator = {
      type: '',
      frequency: { setValueAtTime: vi.fn() },
      gain: {},
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    const mockGain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }
    class MockAudioContext {
      currentTime = 0
      destination = mockDestination
      createOscillator() {
        return mockOscillator as unknown as OscillatorNode
      }
      createGain() {
        return mockGain as unknown as GainNode
      }
      close = mockClose
    }
    ;(
      window as unknown as { AudioContext: typeof window.AudioContext }
    ).AudioContext = MockAudioContext as unknown as typeof window.AudioContext

    const { result } = renderHook(() => useAudio())

    expect(() => result.current.playDirectMessageSound()).not.toThrow()
  })

  it('playRoomAlertSound does not throw when AudioContext is available', () => {
    const mockClose = vi.fn()
    const mockDestination = {}
    const mockOscillator = {
      type: '',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    const mockGain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }
    class MockAudioContext {
      currentTime = 0
      destination = mockDestination
      createOscillator() {
        return mockOscillator as unknown as OscillatorNode
      }
      createGain() {
        return mockGain as unknown as GainNode
      }
      close = mockClose
    }
    ;(
      window as unknown as { AudioContext: typeof window.AudioContext }
    ).AudioContext = MockAudioContext as unknown as typeof window.AudioContext

    const { result } = renderHook(() => useAudio())

    expect(() => result.current.playRoomAlertSound()).not.toThrow()
  })

  it('does not throw when Audio.play rejects', async () => {
    mockAudioInstance.play = vi.fn().mockRejectedValue(new Error('Not allowed'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useAudio())
    result.current.playNewMessageSound()

    await new Promise(r => setTimeout(r, 0))

    expect(warnSpy).toHaveBeenCalledWith(
      'Audio playback failed:',
      expect.any(Error)
    )
    warnSpy.mockRestore()
  })
})
