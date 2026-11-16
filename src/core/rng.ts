// 시드 고정 난수 (mulberry32). 상태가 숫자 하나라 런 저장(JSON)에 그대로 들어간다.
export interface Rng { s: number }

export const mkRng = (seed: number): Rng => ({ s: seed >>> 0 })

export function rand(r: Rng): number {
  let t = (r.s = (r.s + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(rand(r) * a.length)]

export function pickW<T>(r: Rng, a: readonly T[], w: (x: T) => number): T {
  let v = rand(r) * a.reduce((s, x) => s + w(x), 0)
  for (const x of a) if ((v -= w(x)) < 0) return x
  return a[a.length - 1]
}

export function shuffle<T>(r: Rng, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(r) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
