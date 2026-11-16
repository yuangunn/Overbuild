// 한 판(런)의 진행 상태. 전부 JSON 직렬화 가능 → localStorage에 그대로 저장.
import { UNIT, UNITS, type TraitId, type UnitTpl } from './data/units.ts'
import { AUG, AUGMENTS, RESONANCES, type AugDef, type PickCtx, type ResDef } from './data/augments.ts'
import { ITEM, ITEMS } from './data/items.ts'
import { TRAITS, TRAIT_IDS } from './data/traits.ts'
import { ENEMIES, makeWave, type Wave } from './data/enemies.ts'
import { Battle, STEP, type Mod, type Side } from './battle.ts'
import { mkRng, pick, pickW, rand, shuffle, type Rng } from './rng.ts'

export const MAX_ROUND = 15
export const AUG_ROUNDS = [1, 4, 7, 10, 13]
export const BENCH = 8
export const ROWS = 4
const SLOTS = [3, 4, 4, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8]

export interface OwnedUnit { id: number; tpl: string; star: number; items: string[]; pos: number | null; bonus: number }

export type Reward =
  | { kind: 'unit'; tpl: string; star: number }
  | { kind: 'gold'; n: number }
  | { kind: 'item'; ids: string[] }
  | { kind: 'train'; n: number }
  | { kind: 'slot' }

export interface Summary {
  win: boolean
  label: string
  kind: Wave['kind']
  time: number
  dmg: { id: string; name: string; emoji: string; star: number; v: number; n: number }[]
  counts: Record<string, number>
  maxHit: number
  growth: number
}

export interface RunState {
  rng: Rng
  round: number
  lives: number
  maxLives: number
  gold: number
  units: OwnedUnit[]
  nextId: number
  shop: (string | null)[]
  shopSize: number
  wave: Wave
  augments: string[]
  items: string[]
  queue: ('augment' | 'reward')[]
  augChoices: string[]
  rewardChoices: Reward[]
  augRerolls: number
  freeRerolls: number
  bonusSlots: number
  pity: number // 패배 누적 → 다음 증강체 등급 상승
  after: boolean // 지금 고르는 게 전투 뒤 보상인지 (다 고르면 다음 라운드)
  unlocked: string[]
  stats: { won: number; elite: number; bestHit: number; fresh: number }
  over: null | 'win' | 'lose'
  last: Summary | null
  newRes: string[]
  notes: string[] // UI가 꺼내서 토스트로 보여준다
}

const has = (s: RunState, id: string) => s.augments.includes(id)
export const boardOf = (s: RunState) => s.units.filter(u => u.pos !== null)
export const benchOf = (s: RunState) => s.units.filter(u => u.pos === null)
export const slotsOf = (s: RunState) => Math.min(12, SLOTS[Math.min(s.round, MAX_ROUND) - 1] + s.bonusSlots)
export const sellValue = (u: OwnedUnit) => UNIT[u.tpl].cost * 3 ** (u.star - 1)
export const shopPool = (s: RunState) => UNITS.filter(t => !t.locked || s.unlocked.includes('u_' + t.id))
export const activeRes = (s: RunState): ResDef[] => RESONANCES.filter(r => r.pair.every(p => has(s, p)))

// 칸 번호 → 좌표. 플레이어 col 0 = 후열(왼쪽), 적 col 0 = 전열.
export const cellXY = (cell: number, side: Side) => {
  const c = Math.floor(cell / ROWS)
  return { x: side === 0 ? 0.7 + c : 6.3 + c, y: 0.5 + (cell % ROWS) }
}

export function newRun(meta: { unlocked: string[] }, seed = Date.now()): RunState {
  const u = meta.unlocked
  const lives = 3 + (u.includes('life') ? 1 : 0)
  const rng = mkRng(seed)
  const s: RunState = {
    rng, round: 1, lives, maxLives: lives, gold: 6 + (u.includes('gold') ? 3 : 0),
    units: [], nextId: 1, shop: [], shopSize: u.includes('shop6') ? 6 : 5, wave: makeWave(1, rng),
    augments: [], items: [], queue: [], augChoices: [], rewardChoices: [],
    augRerolls: 1 + (u.includes('augroll') ? 1 : 0), freeRerolls: 0, bonusSlots: 0, pity: 0, after: false,
    unlocked: [...u], stats: { won: 0, elite: 0, bestHit: 0, fresh: 0 }, over: null, last: null, newRes: [], notes: [],
  }
  rollShop(s)
  if (u.includes('startaug')) { s.queue.push('augment'); rollAugs(s) }
  return s
}

// ── 상점
const ODDS = (r: number) => (r <= 3 ? [75, 25, 0] : r <= 6 ? [50, 40, 10] : r <= 9 ? [35, 40, 25] : [22, 40, 38])

export function rollShop(s: RunState) {
  const odds = ODDS(s.round)
  const pool = shopPool(s)
  s.shop = Array.from({ length: s.shopSize }, () => {
    const tier = pickW(s.rng, [1, 2, 3], t => odds[t - 1])
    return pick(s.rng, pool.filter(x => x.cost === tier)).id
  })
}

export function reroll(s: RunState): string | null {
  if (s.freeRerolls > 0) s.freeRerolls--
  else if (s.gold >= 1) s.gold--
  else return '골드가 부족합니다'
  rollShop(s)
  return null
}

const wouldMerge = (s: RunState, tpl: string) => s.units.filter(u => u.tpl === tpl && u.star === 1).length >= 2
const canAdd = (s: RunState, tpl: string) =>
  boardOf(s).length < slotsOf(s) || benchOf(s).length < BENCH || wouldMerge(s, tpl)

export function buy(s: RunState, i: number): string | null {
  const id = s.shop[i]
  if (!id) return null
  const t = UNIT[id]
  if (s.gold < t.cost) return '골드가 부족합니다'
  if (!canAdd(s, id)) return '자리가 없습니다 — 유닛을 상점으로 끌어 판매하세요'
  s.gold -= t.cost
  s.shop[i] = null
  addUnit(s, id, 1)
  return null
}

export function autoCell(s: RunState, tpl: UnitTpl): number | null {
  const taken = new Set(s.units.map(u => u.pos))
  const order = tpl.range >= 3 ? [0, 1, 2] : tpl.range >= 2 ? [1, 2, 0] : [2, 1, 0]
  for (const c of order) for (const r of [1, 2, 0, 3]) if (!taken.has(c * ROWS + r)) return c * ROWS + r
  return null
}

export function addUnit(s: RunState, tpl: string, star: number) {
  const u: OwnedUnit = { id: s.nextId++, tpl, star, items: [], pos: null, bonus: 0 }
  if (boardOf(s).length < slotsOf(s)) u.pos = autoCell(s, UNIT[tpl])
  s.units.push(u)
  mergeAll(s)
  if (benchOf(s).length > BENCH && s.units.includes(u)) {
    sell(s, u.id)
    s.notes.push(`대기석이 가득 차 ${UNIT[tpl].name}을(를) 골드로 바꿨습니다`)
  }
}

// 같은 유닛·같은 별 3개 → 한 단계 승급 (보드에 있는 쪽을 남긴다)
function mergeAll(s: RunState) {
  for (let again = true; again;) {
    again = false
    for (const u of s.units) {
      if (u.star >= 3) continue
      const same = s.units.filter(o => o.tpl === u.tpl && o.star === u.star)
      if (same.length < 3) continue
      same.sort((a, b) => (b.pos !== null ? 1 : 0) - (a.pos !== null ? 1 : 0))
      const [keep, ...rest] = same.slice(0, 3)
      keep.star++
      keep.bonus = Math.max(keep.bonus, ...rest.map(r => r.bonus))
      for (const r of rest) {
        for (const it of r.items) (keep.items.length < 3 ? keep.items : s.items).push(it)
        s.units.splice(s.units.indexOf(r), 1)
      }
      s.notes.push(`⭐ ${UNIT[keep.tpl].name} ★${keep.star} 승급!`)
      again = true
      break
    }
  }
}

export function sell(s: RunState, id: number): number {
  const i = s.units.findIndex(u => u.id === id)
  if (i < 0) return 0
  const [u] = s.units.splice(i, 1)
  s.items.push(...u.items)
  const v = sellValue(u)
  s.gold += v
  return v
}

// dest: 칸 번호 또는 null(대기석). 다른 유닛이 있으면 자리를 바꾼다.
export function move(s: RunState, id: number, dest: number | null): string | null {
  const u = s.units.find(x => x.id === id)
  if (!u || u.pos === dest) return null
  if (dest === null) {
    if (benchOf(s).length >= BENCH) return '대기석이 가득 찼습니다'
    u.pos = null
    return null
  }
  const other = s.units.find(x => x.pos === dest)
  if (other) { other.pos = u.pos; u.pos = dest; return null }
  if (u.pos === null && boardOf(s).length >= slotsOf(s)) return `이번 라운드는 ${slotsOf(s)}명까지 배치할 수 있습니다`
  u.pos = dest
  return null
}

export function equip(s: RunState, idx: number, unitId: number): string | null {
  const u = s.units.find(x => x.id === unitId)
  if (!u || idx < 0 || idx >= s.items.length) return null
  if (u.items.length >= 3) return '아이템은 유닛당 3개까지'
  u.items.push(s.items.splice(idx, 1)[0])
  return null
}

// ── 시너지
export interface Syn { id: TraitId; count: number; tier: number; x: number; crest: boolean }

export function synergies(s: RunState): Syn[] {
  const seen = new Set<string>()
  const cnt: Partial<Record<TraitId, number>> = {}
  for (const u of boardOf(s)) {
    if (seen.has(u.tpl)) continue
    seen.add(u.tpl)
    for (const t of UNIT[u.tpl].traits) cnt[t] = (cnt[t] ?? 0) + 1
  }
  return TRAIT_IDS.map(id => {
    const crest = has(s, 'crest_' + id)
    const count = (cnt[id] ?? 0) + (crest ? 1 : 0)
    return { id, count, tier: TRAITS[id].tiers.filter(n => count >= n).length, x: crest ? 2 : 1, crest }
  }).filter(x => x.count > 0).sort((a, b) => b.tier - a.tier || b.count - a.count)
}

// 보유 유닛 전체(대기석 포함)에서 많이 모은 특성 순 → 증강체·보상 제안 편향
function topTraits(s: RunState): TraitId[] {
  const cnt: Partial<Record<TraitId, number>> = {}
  for (const tpl of new Set(s.units.map(u => u.tpl))) for (const t of UNIT[tpl].traits) cnt[t] = (cnt[t] ?? 0) + 1
  return (Object.keys(cnt) as TraitId[]).sort((a, b) => cnt[b]! - cnt[a]!)
}

// ── 전투
export function buildBattle(s: RunState): Battle {
  const res = activeRes(s).map(r => r.id)
  const hasX = (id: string) => has(s, id) || res.includes(id)
  const mods: Mod[] = []
  for (const id of s.augments) { const m = AUG[id]?.mod?.(hasX); if (m) mods.push(m) }
  for (const sy of synergies(s)) if (sy.tier) mods.push(TRAITS[sy.id].mod(sy.tier, sy.x))
  const b = new Battle([mods, []], Math.floor(rand(s.rng) * 2 ** 31), slotsOf(s))
  for (const u of boardOf(s)) {
    const { x, y } = cellXY(u.pos!, 0)
    const f = b.add(UNIT[u.tpl], u.star, 0, x, y, 1 + u.bonus)
    f.owner = u.id
    for (const it of u.items) ITEM[it].apply(f)
  }
  for (const sp of s.wave.spawns) {
    const { x, y } = cellXY(sp.cell, 1)
    b.add(ENEMIES[sp.tpl], 1, 1, x, y, sp.mult)
  }
  b.start()
  return b
}

export function endBattle(s: RunState, b: Battle): Summary {
  for (let g = 0; !b.done && g < 60 * 80; g++) b.step(STEP)
  const win = b.win
  const kind = s.wave.kind
  const agg = new Map<string, Summary['dmg'][number]>()
  for (const f of b.fighters) {
    if (f.side !== 0) continue
    const key = f.owner !== null ? 'u' + f.owner : f.tpl.id
    const e = agg.get(key) ?? { id: f.tpl.id, name: f.name, emoji: f.emoji, star: f.owner !== null ? f.star : 0, v: 0, n: 0 }
    e.v += f.dealt
    e.n++
    agg.set(key, e)
  }
  const sum: Summary = {
    win, label: s.wave.label, kind, time: b.t, dmg: [...agg.values()].sort((a, c) => c.v - a.v),
    counts: { ...b.counts }, maxHit: b.maxHit, growth: 0,
  }
  s.stats.bestHit = Math.max(s.stats.bestHit, b.maxHit)
  if (win) {
    s.stats.won++
    if (kind !== 'normal') s.stats.elite++
    if (has(s, 'growth')) {
      sum.growth = activeRes(s).some(r => r.id === 'res_legend') ? 0.16 : 0.08
      for (const u of boardOf(s)) u.bonus += sum.growth
    }
  } else {
    s.lives--
    s.pity++
  }
  s.last = sum
  if (win && s.round >= MAX_ROUND) s.over = 'win'
  else if (s.lives <= 0) s.over = 'lose'
  if (s.over) return sum
  s.after = true
  if (AUG_ROUNDS.includes(s.round) || (!win && kind === 'boss')) { s.queue.push('augment'); rollAugs(s) }
  if (win) { s.queue.push('reward'); rollRewards(s, kind !== 'normal') }
  if (!s.queue.length) advance(s)
  return sum
}

export const income = (s: RunState, won: boolean) => 5 + Math.floor(s.round / 3) + (won ? 1 : 2) + (has(s, 'midas') ? 2 : 0)

function advance(s: RunState) {
  s.after = false
  const won = s.last?.win ?? true
  if (won || s.round < MAX_ROUND) s.round++ // 보스에게 지면 보스 재도전
  s.gold += income(s, won)
  s.freeRerolls = has(s, 'midas') ? 1 : 0
  s.wave = makeWave(s.round, s.rng)
  rollShop(s)
}

function finishPick(s: RunState) {
  s.queue.shift()
  if (!s.queue.length && s.after) advance(s)
}

// ── 증강체
const formsRes = (s: RunState, id: string) => RESONANCES.some(r => r.pair.includes(id) && r.pair.some(p => p !== id && has(s, p)))

export function rollAugs(s: RunState) {
  const top = topTraits(s)
  const pool = AUGMENTS.filter(a => !has(s, a.id) && (!a.locked || s.unlocked.includes('a_' + a.id)) && (!a.crest || top.includes(a.crest)))
  const late = s.round >= 7
  const w = (a: AugDef) => {
    const base = a.rarity === 1 ? (late ? 3 : 5) : a.rarity === 2 ? 4 : late ? 2.2 : 1.2
    return s.pity > 0 && a.rarity === 1 ? base * 0.1 : base // 역전의 기회: 실버 거의 안 나옴
  }
  const out: AugDef[] = []
  // 한 칸은 지금 빌드에 맞는 것 (공명 상대 / 주력 특성) → 운보다 계획
  const fits = pool.filter(a => formsRes(s, a.id) || a.fit?.some(t => top.slice(0, 2).includes(t)))
  if (fits.length) out.push(pickW(s.rng, fits, w))
  while (out.length < 3) {
    const rest = pool.filter(a => !out.includes(a))
    if (!rest.length) break
    out.push(pickW(s.rng, rest, w))
  }
  s.augChoices = shuffle(s.rng, out.map(a => a.id))
}

export function rerollAugs(s: RunState) {
  if (s.augRerolls <= 0 || s.queue[0] !== 'augment') return
  s.augRerolls--
  rollAugs(s)
}

const ctx = (s: RunState): PickCtx => ({
  gold: n => { s.gold += n },
  addUnit: (t, star) => addUnit(s, t, star),
  addItem: () => { s.items.push(pick(s.rng, ITEMS).id) },
  bestUnitTpl: () => [...s.units].sort((a, b) => UNIT[b.tpl].cost - UNIT[a.tpl].cost || b.star - a.star)[0]?.tpl ?? null,
})

// 반환: 이번에 새로 켜진 공명 id
export function pickAug(s: RunState, id: string): string[] {
  if (s.queue[0] !== 'augment' || !s.augChoices.includes(id)) return []
  const before = activeRes(s).map(r => r.id)
  s.augments.push(id)
  s.pity = 0
  s.augChoices = []
  AUG[id].onPick?.(ctx(s))
  const fresh = activeRes(s).map(r => r.id).filter(r => !before.includes(r))
  s.newRes.push(...fresh)
  finishPick(s)
  return fresh
}

// ── 전리품
function rollRewards(s: RunState, rare: boolean) {
  const kinds: Reward['kind'][] = ['unit', 'gold', 'item', 'train']
  if ((rare || rand(s.rng) < 0.3) && slotsOf(s) < 12) kinds.push('slot')
  const top = topTraits(s).slice(0, 2)
  const tier = Math.min(3, 1 + Math.floor(s.round / 4))
  s.rewardChoices = shuffle(s.rng, kinds).slice(0, 3).map((k): Reward => {
    switch (k) {
      case 'unit': {
        const pool = shopPool(s).filter(t => t.cost === tier || t.cost === tier - 1)
        const fit = pool.filter(t => t.traits.some(x => top.includes(x)))
        return { kind: 'unit', tpl: pick(s.rng, fit.length && rand(s.rng) < 0.7 ? fit : pool).id, star: rare ? 2 : 1 }
      }
      case 'gold': return { kind: 'gold', n: (4 + Math.ceil(s.round * 0.7)) * (rare ? 2 : 1) }
      case 'item': return { kind: 'item', ids: Array.from({ length: rare ? 2 : 1 }, () => pick(s.rng, ITEMS).id) }
      case 'train': return { kind: 'train', n: rare ? 0.2 : 0.1 }
      default: return { kind: 'slot' }
    }
  })
}

export function pickReward(s: RunState, i: number) {
  const r = s.rewardChoices[i]
  if (s.queue[0] !== 'reward' || !r) return
  if (r.kind === 'unit') addUnit(s, r.tpl, r.star)
  else if (r.kind === 'gold') s.gold += r.n
  else if (r.kind === 'item') s.items.push(...r.ids)
  else if (r.kind === 'train') for (const u of boardOf(s)) u.bonus += r.n
  else s.bonusSlots++
  s.rewardChoices = []
  finishPick(s)
}
