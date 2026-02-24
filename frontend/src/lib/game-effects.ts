export const VICTORY_BLAST_DURATION_MS = 4200

export const DEFAULT_CONFETTI_COLORS = [
  '#facc15',
  '#fb7185',
  '#38bdf8',
  '#34d399',
  '#c084fc',
  '#f97316',
] as const

export const DEFAULT_DEFEAT_COLORS = [
  '#64748b',
  '#334155',
  '#0f172a',
  '#1e293b',
  '#475569',
  '#111827',
] as const

export interface ConfettiPiece {
  id: number
  left: number
  delay: number
  duration: number
  rotate: number
  color: string
}

function createPieces(
  colors: readonly string[],
  leftStep: number,
  delayMod: number,
  delayStep: number,
  durationBase: number,
  durationMod: number,
  durationStep: number,
  rotateStep: number
): ConfettiPiece[] {
  return Array.from({ length: 30 }, (_, index) => ({
    id: index,
    left: (index * leftStep) % 100,
    delay: (index % delayMod) * delayStep,
    duration: durationBase + (index % durationMod) * durationStep,
    rotate: (index * rotateStep) % 360,
    color: colors[index % colors.length],
  }))
}

export function createConfettiPieces(
  colors: readonly string[] = DEFAULT_CONFETTI_COLORS
): ConfettiPiece[] {
  return createPieces(colors, 13, 7, 0.14, 2.4, 5, 0.25, 37)
}

export function createDefeatPieces(
  colors: readonly string[] = DEFAULT_DEFEAT_COLORS
): ConfettiPiece[] {
  return createPieces(colors, 11, 8, 0.12, 2.3, 6, 0.2, 17)
}
