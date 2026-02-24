export function playVictoryJingle(): void {
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return

  const audioContext = new AudioContextClass()
  const melody = [523.25, 659.25, 783.99, 1046.5, 1318.51]
  const startAt = audioContext.currentTime + 0.03

  melody.forEach((freq, index) => {
    const noteStart = startAt + index * 0.12
    const noteEnd = noteStart + 0.2

    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, noteStart)

    gain.gain.setValueAtTime(0.0001, noteStart)
    gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd)

    osc.connect(gain)
    gain.connect(audioContext.destination)

    osc.start(noteStart)
    osc.stop(noteEnd)
  })

  window.setTimeout(() => {
    void audioContext.close()
  }, 1400)
}
