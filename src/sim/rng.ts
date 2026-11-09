/**
 * Seeded PRNG (mulberry32). The generator's whole state is one integer kept
 * inside the game state, so a day can be cloned, serialised and replayed.
 */
export interface RngState {
  rng: number
}

export function seedRng(seed: number): number {
  return seed >>> 0
}

/** Uniform in [0, 1). Advances `s.rng`. */
export function rand(s: RngState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function randRange(s: RngState, min: number, max: number): number {
  return min + (max - min) * rand(s)
}

/** Integer in [min, max], both inclusive. */
export function randInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(rand(s) * (max - min + 1))
}

export function pick<T>(s: RngState, list: readonly T[]): T {
  return list[Math.floor(rand(s) * list.length)]
}

export function pickWeighted<T extends string>(s: RngState, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let r = rand(s) * total
  for (const [key, w] of entries) {
    r -= w
    if (r < 0) return key
  }
  return entries[entries.length - 1][0]
}
