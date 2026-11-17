// 영구 성장 + 저장. localStorage가 없거나 막혀도(테스트·사생활 모드) 기본값으로 동작한다.
import type { RunState } from './run.ts'
import { cleanHero, type HeroDef } from './heroes.ts'

export interface Meta { shards: number; unlocked: string[]; best: number; runs: number; wins: number; found: string[]; speed: number; endless: number }

const KEY = 'overbuild:meta:v1'
const RUN_KEY = 'overbuild:run:v1'
const HERO_KEY = 'overbuild:heroes:v1'
const SAND_KEY = 'overbuild:sandbox:v1'
const DEF: Meta = { shards: 0, unlocked: [], best: 0, runs: 0, wins: 0, found: [], speed: 1, endless: 0 }

export const UNLOCKS = [
  { id: 'u_phoenix', emoji: '🔥', name: '불사조', desc: '유닛 · 비전/망령. 처음 쓰러지면 부활하며 폭발', cost: 10 },
  { id: 'u_dragonknight', emoji: '🐲', name: '용기사', desc: '유닛 · 수호/야수. 앞쪽 광역 브레스 + 보호막', cost: 10 },
  { id: 'u_shadowlord', emoji: '👤', name: '그림자 군주', desc: '유닛 · 그림자/망령. 분신 2기 소환', cost: 10 },
  { id: 'a_smite', emoji: '🌩️', name: '증강체: 천벌', desc: '10번째 공격마다 낙뢰. 광란과 공명', cost: 8 },
  { id: 'a_timewarp', emoji: '⏳', name: '증강체: 시간 정지', desc: '전투 시작 3.5초간 모든 적 정지', cost: 12 },
  { id: 'a_splitsoul', emoji: '🌗', name: '증강체: 영혼 분열', desc: '가장 강한 아군의 분신이 함께 싸움', cost: 12 },
  { id: 'gold', emoji: '💰', name: '전쟁 자금', desc: '시작 골드 +3', cost: 6 },
  { id: 'augroll', emoji: '🎲', name: '선견지명', desc: '증강체 새로고침 +1회', cost: 8 },
  { id: 'shop6', emoji: '🏪', name: '큰 상점', desc: '상점 칸 5 → 6', cost: 12 },
  { id: 'life', emoji: '❤️', name: '여분의 목숨', desc: '생명 3 → 4', cost: 15 },
  { id: 'startaug', emoji: '🚀', name: '선봉 증강', desc: '1라운드 전에 증강체를 하나 고르고 시작', cost: 18 },
]

const ls = (): Storage | null => { try { return globalThis.localStorage ?? null } catch { return null } }
const read = <T>(k: string): T | null => { try { const v = ls()?.getItem(k); return v ? JSON.parse(v) : null } catch { return null } }
const write = (k: string, v: unknown) => { try { v === null ? ls()?.removeItem(k) : ls()?.setItem(k, JSON.stringify(v)) } catch { /* 저장 불가 환경 */ } }

// 옛 이름(broken-build) 시절 저장분을 한 번 옮기고 지운다
for (const k of [KEY, RUN_KEY]) {
  const old = k.replace('overbuild:', 'broken-build:')
  try { const v = ls()?.getItem(old); if (v != null) { if (ls()?.getItem(k) == null) ls()?.setItem(k, v); ls()?.removeItem(old) } } catch { /* 저장 불가 환경 */ }
}

export const loadMeta = (): Meta => ({ ...DEF, ...read<Partial<Meta>>(KEY) })
export const saveMeta = (m: Meta) => write(KEY, m)
export const loadRun = (): RunState | null => read<RunState>(RUN_KEY)
export const saveRun = (s: RunState | null) => write(RUN_KEY, s)
export function loadHeroes(): HeroDef[] {
  const v = read<Partial<HeroDef>[]>(HERO_KEY)
  return (Array.isArray(v) ? v : []).map(h => cleanHero(h)).filter((h): h is HeroDef => !!h)
}
export const saveHeroes = (h: HeroDef[]) => write(HERO_KEY, h)
export const loadSand = (): RunState | null => read<RunState>(SAND_KEY)
export const saveSand = (s: RunState) => write(SAND_KEY, s)

export function buyUnlock(m: Meta, id: string): string | null {
  const u = UNLOCKS.find(x => x.id === id)
  if (!u || m.unlocked.includes(id)) return null
  if (m.shards < u.cost) return '별조각이 부족합니다'
  m.shards -= u.cost
  m.unlocked.push(id)
  saveMeta(m)
  return null
}

// 런 종료 정산: 이긴 전투 1 + 정예 2 + 클리어 10 + 처음 찾은 공명 2
// 무한 원정은 15R 클리어 때 한 번 정산했으니 그 뒤 몫만 더하고 최고 라운드를 남긴다
export function settle(m: Meta, s: RunState): number {
  const e = s.endless
  if (e) {
    const shards = s.stats.won - e.won + (s.stats.elite - e.elite) * 2 + (s.stats.fresh - e.fresh) * 2
    m.shards += shards
    m.endless = Math.max(m.endless, s.round)
    saveMeta(m)
    saveRun(null)
    return shards
  }
  const shards = s.stats.won + s.stats.elite * 2 + (s.over === 'win' ? 10 : 0) + s.stats.fresh * 2
  m.shards += shards
  m.runs++
  if (s.over === 'win') m.wins++
  m.best = Math.max(m.best, s.round)
  saveMeta(m)
  saveRun(null)
  return shards
}
