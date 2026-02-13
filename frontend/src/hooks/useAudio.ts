import { useCallback } from 'react'
import dropPieceM4a from '@/assets/sounds/drop-piece.m4a'
import dropPieceMp3 from '@/assets/sounds/drop-piece.mp3'
import dropPieceOgg from '@/assets/sounds/drop-piece.ogg'
import friendOnlineM4a from '@/assets/sounds/friend-online.m4a'
import friendOnlineMp3 from '@/assets/sounds/friend-online.mp3'
import friendOnlineOgg from '@/assets/sounds/friend-online.ogg'
import newMessageMp3 from '@/assets/sounds/new-message.mp3'

/**
 * Shared audio notification hooks for chat sounds.
 *
 * playDirectMessageSound — two-tone ascending chime for DMs
 * playRoomAlertSound     — single soft triangle ping for chatroom activity
 */
export function useAudio() {
  const playFileSound = useCallback(
    (sources: { src: string; type: string }[]) => {
      const audio = new Audio()

      // Find first supported source or fallback to first
      const supportedSource =
        sources.find(s => audio.canPlayType(s.type) !== '') || sources[0]

      if (supportedSource) {
        audio.src = supportedSource.src
        audio.play().catch(err => {
          // Browsers often block audio until user interaction
          console.warn('Audio playback failed:', err)
        })
      }
    },
    []
  )

  const playDropPieceSound = useCallback(() => {
    playFileSound([
      { src: dropPieceM4a, type: 'audio/mp4' },
      { src: dropPieceOgg, type: 'audio/ogg' },
      { src: dropPieceMp3, type: 'audio/mpeg' },
    ])
  }, [playFileSound])

  const playFriendOnlineSound = useCallback(() => {
    playFileSound([
      { src: friendOnlineM4a, type: 'audio/mp4' },
      { src: friendOnlineOgg, type: 'audio/ogg' },
      { src: friendOnlineMp3, type: 'audio/mpeg' },
    ])
  }, [playFileSound])

  const playNewMessageSound = useCallback(() => {
    playFileSound([{ src: newMessageMp3, type: 'audio/mpeg' }])
  }, [playFileSound])

  const playDirectMessageSound = useCallback(() => {
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return
    const audioContext = new AudioContextClass()
    const startAt = audioContext.currentTime + 0.01
    const tones = [659.25, 880]

    for (const [index, frequency] of tones.entries()) {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const noteStart = startAt + index * 0.085
      const noteEnd = noteStart + 0.12

      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, noteStart)
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.07, noteStart + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd)

      osc.connect(gain)
      gain.connect(audioContext.destination)
      osc.start(noteStart)
      osc.stop(noteEnd)
    }

    window.setTimeout(() => {
      void audioContext.close()
    }, 700)
  }, [])

  const playRoomAlertSound = useCallback(() => {
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return
    const audioContext = new AudioContextClass()
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const startAt = audioContext.currentTime + 0.01
    const endAt = startAt + 0.14

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(523.25, startAt)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt)

    osc.connect(gain)
    gain.connect(audioContext.destination)
    osc.start(startAt)
    osc.stop(endAt)

    window.setTimeout(() => {
      void audioContext.close()
    }, 500)
  }, [])

  return {
    playDirectMessageSound,
    playRoomAlertSound,
    playDropPieceSound,
    playFriendOnlineSound,
    playNewMessageSound,
  }
}
