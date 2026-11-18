// 영구 성장 + 저장. localStorage가 없거나 막혀도(테스트·사생활 모드) 기본값으로 동작한다.
import type { RunState } from './run.ts'
import { cleanHero, type HeroDef } from './heroes.ts'
import { HEAT_RULE, heatOf, shardMult } from './data/heat.ts'
import { ITEM } from './data/items.ts'

export interface Meta {
  shards: number; unlocked: string[]; best: number; runs: number; wins: number; found: string[]; speed: number; endless: number
  heat: Record<string, number> // 다음 원정에 걸 위험도 (지난 설정을 기억)
  heatBest: number // 클리어한 최고 위험도
  daily: Daily | null // 오늘(마지막으로 한 날) 일일 도전 기록
  seen: string[] // 처음 손에 넣은 숨은 아이템 (찬란한 아이템·유물). 도감에서 정체가 드러난다
}
export interface Daily { date: string; round: number; win: boolean; lives: number; tries: number }
// 같은 날 기록끼리: 클리어가 먼저, 그다음 도달 라운드, 남은 생명
export const dailyBetter = (a: Pick<Daily, 'round' | 'win' | 'lives'>, b: Pick<Daily, 'round' | 'win' | 'lives'>) =>
  a.win !== b.win ? a.win : a.round !== b.round ? a.round > b.round : a.lives > b.lives

const KEY = 'overbuild:meta:v1'
const RUN_KEY = 'overbuild:run:v1'
const HERO_KEY = 'overbuild:heroes:v1'
const SAND_KEY = 'overbuild:sandbox:v1'
const DEF: Meta = { shards: 0, unlocked: [], best: 0, runs: 0, wins: 0, found: [], speed: 1, endless: 0, heat: {}, heatBest: 0, daily: null, seen: [] }

export const UNLOCKS = [
  { id: 'u_phoenix', emoji: '🔥', name: '불사조', desc: '유닛 · 비전/망령. 처음 쓰러지면 부활하며 폭발', cost: 10 },
  { id: 'u_dragonknight', emoji: '🐲', name: '용기사', desc: '유닛 · 수호/야수. 앞쪽 광역 브레스 + 보호막', cost: 10 },
  { id: 'u_shadowlord', emoji: '👤', name: '그림자 군주', desc: '유닛 · 그림자/망령. 분신 2기 소환', cost: 10 },
  { id: 'u_general', emoji: '🐉', name: '청룡도 장수', desc: '유닛 · 수호/동방. 광역 베기, 쓰러뜨릴 때마다 보호막, 체력 절반에서 분노', cost: 10 },
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

export function loadMeta(): Meta {
  const m = { ...DEF, ...read<Partial<Meta>>(KEY) }
  m.seen = Array.isArray(m.seen) ? m.seen.filter(id => ITEM[id]?.tier) : []
  // 저장분은 손댈 수 있으니 규칙 id·단계를 다시 맞춘다
  m.heat = Object.fromEntries(Object.entries(m.heat ?? {}).filter(([k, v]) => HEAT_RULE[k] && Number.isInteger(v) && v > 0).map(([k, v]) => [k, Math.min(HEAT_RULE[k].max, v)]))
  return m
}
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

// 런 종료 정산: 이긴 전투 1 + 정예 2 + 클리어 10 + 처음 찾은 공명 2, 위험도 1마다 +10%
// 무한 원정은 15R 클리어 때 한 번 정산했으니 그 뒤 몫만 더하고 최고 라운드를 남긴다
export function settle(m: Meta, s: RunState): number {
  const e = s.endless
  const heat = heatOf(s.heat)
  const x = shardMult(heat)
  if (e) {
    const shards = Math.round((s.stats.won - e.won + (s.stats.elite - e.elite) * 2 + (s.stats.fresh - e.fresh) * 2) * x)
    m.shards += shards
    m.endless = Math.max(m.endless, s.round)
    saveMeta(m)
    saveRun(null)
    return shards
  }
  if (s.daily) {
    const cur = { round: s.round, win: s.over === 'win', lives: s.lives }
    const d = m.daily?.date === s.daily ? m.daily : { date: s.daily, round: 0, win: false, lives: 0, tries: 0 }
    m.daily = { ...(dailyBetter(cur, d) ? { ...d, ...cur } : d), tries: d.tries + 1 }
  }
  const shards = Math.round((s.stats.won + s.stats.elite * 2 + (s.over === 'win' ? 10 : 0) + s.stats.fresh * 2) * x)
  m.shards += shards
  m.runs++
  if (s.over === 'win') { m.wins++; m.heatBest = Math.max(m.heatBest, heat) }
  m.best = Math.max(m.best, s.round)
  saveMeta(m)
  saveRun(null)
  return shards
}
