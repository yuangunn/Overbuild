// 한 판(런)의 진행 상태. 전부 JSON 직렬화 가능 → localStorage에 그대로 저장.
import { UNIT, UNITS, type TraitId, type UnitTpl } from './data/units.ts'
import { AUG, AUGMENTS, RESONANCES, type AugDef, type PickCtx, type ResDef } from './data/augments.ts'
import { ITEM, ITEMS } from './data/items.ts'
import { TRAITS, TRAIT_IDS } from './data/traits.ts'
import { ENEMIES, applyAffix, endlessElites, enemyMult, makeWave, pickElites, type Wave } from './data/enemies.ts'
import { Battle, STEP, type Mod, type Side } from './battle.ts'
import { mkRng, pick, pickW, rand, shuffle, type Rng } from './rng.ts'
import { CMD, COMMANDERS } from './data/commanders.ts'
import { AFFIXES } from './data/enemies.ts'
import { HEAT_RULE } from './data/heat.ts'

export const MAX_ROUND = 15
export const AUG_ROUNDS = [1, 4, 7, 10, 13]
export const BENCH = 8
export const ROWS = 4
// 지휘 레벨 (TFT의 경험치 구매): 라운드마다 경험치 2, 4골드로 4를 더 산다. 레벨 + 2 = 배치 칸.
// 자동 경험치만으로는 라운드별 칸 3·4·4·5·5·6·6·6·7·7·7·8… 그대로이고, 사면 칸과 상점 확률을 앞당긴다.
export const XP_STEP = [2, 4, 4, 6, 6, 20, 32] // Lv1→2 … Lv7→8 에 필요한 경험치
export const MAX_LV = XP_STEP.length + 1
export const BUY_XP = 4
export const XP_PER_ROUND = 2
export function levelOf(xp: number): { lv: number; cur: number; need: number } {
  let lv = 1
  for (const n of XP_STEP) { if (xp < n) return { lv, cur: xp, need: n }; xp -= n; lv++ }
  return { lv, cur: 0, need: 0 }
}
const natXp = (round: number) => XP_PER_ROUND * (round - 1)

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
  dmg: { id: string; name: string; emoji: string; star: number; v: number; taken: number; n: number }[]
  counts: Record<string, number>
  maxHit: number
  growth: number
  loot: number // 보물 고블린 골드
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
  queue: ('commander' | 'augment' | 'reward')[]
  augChoices: string[]
  rewardChoices: Reward[]
  augRerolls: number
  freeRerolls: number
  bonusSlots: number
  pity: number // 패배 누적 → 다음 증강체 등급 상승
  after: boolean // 지금 고르는 게 전투 뒤 보상인지 (다 고르면 다음 라운드)
  unlocked: string[]
  xp: number // 지휘 경험치 누적
  stats: { won: number; elite: number; bestHit: number; fresh: number }
  over: null | 'win' | 'lose'
  last: Summary | null
  elites?: Record<number, string> // 라운드 → 정예·보스 (v0.2 저장분엔 없음 → 기본값)
  endless?: { won: number; elite: number; fresh: number } // 무한 원정: 15R 클리어 때 통계 (그 뒤 몫만 정산)
  sandbox?: boolean
  cmd?: string // 시작 사령관 (v0.3 저장분엔 없음 → 없이 진행)
  cmdChoices?: string[]
  cmdUsed?: boolean // 능력형 사령관: 이번 라운드에 썼는지
  heat?: Record<string, number> // 위험도 규칙 id → 단계
  promise?: string // 공명술사: 약속한 공명 id (그 짝 중 아직 없는 쪽이 증강체 선택에 반드시 나온다)
  newRes: string[]
  notes: string[] // UI가 꺼내서 토스트로 보여준다
}

const has = (s: RunState, id: string) => s.augments.includes(id)
const isCmd = (s: RunState, id: string) => s.cmd === id
export const heatRank = (s: RunState, id: string) => Math.min(HEAT_RULE[id]?.max ?? 0, s.heat?.[id] ?? 0)
// 위험도 '단단한 적': 전투를 만들 때 적 전체에 곱한다 (편성 배율은 그대로 두고 화면도 이 값을 곱해 보여 준다)
export const heatMult = (s: RunState) => 1 + 0.1 * heatRank(s, 'tough')
export const rerollCost = (s: RunState) => (heatRank(s, 'shop') ? 2 : 1)

// 위험도를 편성에 입힌다: 일반 편성 접두사 추가, 정예·보스 강화
function decorate(s: RunState, w: Wave): Wave {
  if (s.sandbox) return w
  if (heatRank(s, 'affix') && w.kind === 'normal' && s.round >= 6) {
    const plain = w.spawns.filter(sp => !sp.aff && sp.tpl !== 'treasure')
    for (const sp of shuffle(s.rng, plain).slice(0, s.round >= 11 ? 2 : 1)) sp.aff = pick(s.rng, AFFIXES).id
  }
  if (heatRank(s, 'boss') && w.kind !== 'normal') w.spawns[0].mult *= 1.4
  return w
}
const nextWave = (s: RunState) => decorate(s, makeWave(s.round, s.rng, s.elites))
export const boardOf = (s: RunState) => s.units.filter(u => u.pos !== null)
export const benchOf = (s: RunState) => s.units.filter(u => u.pos === null)
export const slotsOf = (s: RunState) => Math.min(12, levelOf(s.xp).lv + 2 + s.bonusSlots)
// 유닛·적·나만의 영웅을 한 이름으로 찾는다 (영웅은 heroes.ts가 UNIT에 등록)
export const tplOf = (id: string): UnitTpl | undefined => UNIT[id] ?? ENEMIES[id]
export const sellValue = (u: OwnedUnit) => UNIT[u.tpl].cost * 3 ** (u.star - 1)
export const shopPool = (s: RunState) => UNITS.filter(t => !t.locked || s.unlocked.includes('u_' + t.id))
export const activeRes = (s: RunState): ResDef[] => RESONANCES.filter(r => r.pair.every(p => has(s, p)))

// 칸 번호 → 좌표. 플레이어 col 0 = 후열(왼쪽), 적 col 0 = 전열.
export const cellXY = (cell: number, side: Side) => {
  const c = Math.floor(cell / ROWS)
  return { x: side === 0 ? 0.7 + c : 6.3 + c, y: 0.5 + (cell % ROWS) }
}

export function newRun(meta: { unlocked: string[]; heat?: Record<string, number> }, seed = Date.now()): RunState {
  const u = meta.unlocked
  const heat = { ...(meta.heat ?? {}) }
  const lives = Math.max(1, 3 + (u.includes('life') ? 1 : 0) - (heat.lives ? 1 : 0))
  const rng = mkRng(seed)
  const elites = pickElites(rng)
  const s: RunState = {
    rng, round: 1, lives, maxLives: lives, gold: 6 + (u.includes('gold') ? 3 : 0), elites, heat,
    units: [], nextId: 1, xp: 0, shop: [], shopSize: (u.includes('shop6') ? 6 : 5) - (heat.shop ? 1 : 0), wave: makeWave(1, rng, elites),
    augments: [], items: [], queue: [], augChoices: [], rewardChoices: [],
    augRerolls: 1 + (u.includes('augroll') ? 1 : 0), freeRerolls: 0, bonusSlots: 0, pity: 0, after: false,
    unlocked: [...u], stats: { won: 0, elite: 0, bestHit: 0, fresh: 0 }, over: null, last: null, newRes: [], notes: [],
  }
  s.cmdChoices = shuffle(rng, COMMANDERS.map(c => c.id)).slice(0, 3)
  s.queue.push('commander')
  rollShop(s)
  if (u.includes('startaug')) s.queue.push('augment') // 사령관을 고른 뒤 굴린다 (예언자·공명술사)
  return s
}

export function pickCmd(s: RunState, id: string) {
  if (s.queue[0] !== 'commander' || !s.cmdChoices?.includes(id)) return
  s.cmd = id
  s.cmdChoices = []
  if (id === 'seer') s.augRerolls++
  if (id === 'smith') for (let i = 0; i < 2; i++) s.items.push(pick(s.rng, ITEMS).id)
  if (id === 'lord') { s.bonusSlots++; s.lives--; s.maxLives-- }
  if (id === 'resonator') {
    const open = (a: string) => !AUG[a].locked || s.unlocked.includes('a_' + a)
    s.promise = pick(s.rng, RESONANCES.filter(x => x.pair.every(open))).id
  }
  s.queue.shift()
  if (s.queue[0] as string === 'augment') { rollAugs(s); if (!s.augChoices.length) s.queue.shift() }
}

// 능력형 사령관 (Hearthstone 전장의 영웅 능력처럼 라운드마다 한 번, 골드를 내고 쓴다)
export function useCmd(s: RunState): string | null {
  const a = s.cmd ? CMD[s.cmd]?.active : undefined
  if (!a || s.queue.length) return null
  if (s.cmdUsed) return '이번 라운드에 이미 썼습니다'
  if (s.gold < a.cost) return '골드가 부족합니다'
  const top = topTraits(s)[0]
  if (!top) return '먼저 유닛을 모으세요'
  s.gold -= a.cost
  s.cmdUsed = true
  rollShop(s, t => t.traits.includes(top))
  return null
}

// 예전 저장분에 없는 값 채우기
export function fixRun(s: RunState): RunState {
  s.xp ??= natXp(s.round)
  return s
}

// ── 상점 (비용 1·2·3 확률, 지휘 레벨별)
export const ODDS = [[75, 25, 0], [75, 25, 0], [50, 40, 10], [40, 40, 20], [30, 40, 30], [22, 40, 38], [15, 35, 50], [10, 30, 60]]

export function buyXp(s: RunState): string | null {
  if (levelOf(s.xp).lv >= MAX_LV) return '지휘 레벨이 최대입니다'
  if (s.gold < BUY_XP) return '골드가 부족합니다'
  const before = levelOf(s.xp).lv
  s.gold -= BUY_XP
  s.xp += BUY_XP
  const lv = levelOf(s.xp).lv
  if (lv > before) s.notes.push(`지휘 레벨 ${lv} — 배치 칸 ${slotsOf(s)}`)
  return null
}

export function rollShop(s: RunState, only?: (t: UnitTpl) => boolean) {
  const odds = ODDS[levelOf(s.xp).lv - 1]
  const pool = shopPool(s).filter(t => !only || only(t))
  s.shop = Array.from({ length: s.shopSize }, () => {
    const tier = pickW(s.rng, [1, 2, 3], t => odds[t - 1])
    const at = pool.filter(x => x.cost === tier)
    return pick(s.rng, at.length ? at : pool).id
  })
}

export function reroll(s: RunState): string | null {
  if (s.freeRerolls > 0) s.freeRerolls--
  else if (s.gold >= rerollCost(s)) s.gold -= rerollCost(s)
  else return '골드가 부족합니다'
  rollShop(s)
  return null
}

const wouldMerge = (s: RunState, tpl: string) => s.units.filter(u => u.tpl === tpl && u.star === 1).length >= 2
export const canAdd = (s: RunState, tpl: string) =>
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
  if (isCmd(s, 'twin') && (t.cost === 1 || (t.cost === 2 && rand(s.rng) < 0.5))) {
    if (canAdd(s, id)) addUnit(s, id, 1)
    else s.notes.push('자리가 없어 쌍둥이를 받지 못했습니다')
  }
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
      s.notes.push(`★ ${UNIT[keep.tpl].name} ★${keep.star} 승급!`)
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
  // 샌드박스는 칸 제한 없이 놓되, 고독한 영웅의 빈 칸 계산은 그 라운드의 칸 수 기준
  const slots = s.sandbox ? Math.max(boardOf(s).length, levelOf(natXp(s.round)).lv + 2) : slotsOf(s)
  const b = new Battle([mods, []], Math.floor(rand(s.rng) * 2 ** 31), slots)
  for (const u of boardOf(s)) {
    const { x, y } = cellXY(u.pos!, 0)
    const f = b.add(tplOf(u.tpl)!, u.star, 0, x, y, 1 + u.bonus)
    f.owner = u.id
    for (const it of u.items) ITEM[it].apply(f)
  }
  for (const sp of s.wave.spawns) {
    const { x, y } = cellXY(sp.cell, 1)
    const t = tplOf(sp.tpl)
    if (!t) continue
    const f = b.add(t, sp.star ?? 1, 1, x, y, sp.mult * heatMult(s))
    if (sp.aff) applyAffix(f, sp.aff)
    if (sp.armor) f.armor += sp.armor
  }
  if (heatRank(s, 'timer')) b.limit = 35
  b.start()
  return b
}

// 전투 결과 집계만 (런 상태는 안 바꾼다 → 샌드박스도 쓴다)
export function summarize(s: RunState, b: Battle): Summary {
  for (let g = 0; !b.done && g < 60 * 80; g++) b.step(STEP)
  const agg = new Map<string, Summary['dmg'][number]>()
  for (const f of b.fighters) {
    if (f.side !== 0) continue
    const key = f.owner !== null ? 'u' + f.owner : f.tpl.id
    const e = agg.get(key) ?? { id: f.tpl.id, name: f.name, emoji: f.emoji, star: f.owner !== null ? f.star : 0, v: 0, taken: 0, n: 0 }
    e.v += f.dealt
    e.taken += f.taken
    e.n++
    agg.set(key, e)
  }
  return {
    win: b.win, label: s.wave.label, kind: s.wave.kind, time: b.t, dmg: [...agg.values()].sort((a, c) => c.v - a.v),
    counts: { ...b.counts }, maxHit: b.maxHit, growth: 0, loot: b.counts.treasure ? 4 + s.round : 0,
  }
}

export function endBattle(s: RunState, b: Battle): Summary {
  const sum = summarize(s, b)
  const { win, kind } = sum
  s.gold += sum.loot
  s.stats.bestHit = Math.max(s.stats.bestHit, b.maxHit)
  if (win) {
    s.stats.won++
    if (kind !== 'normal') s.stats.elite++
    if (has(s, 'growth')) sum.growth = activeRes(s).some(r => r.id === 'res_legend') ? 0.16 : 0.08
    if (isCmd(s, 'drill')) sum.growth += 0.02
    if (sum.growth) for (const u of boardOf(s)) u.bonus += sum.growth
  } else {
    s.lives--
    s.pity++
  }
  s.last = sum
  if (win && s.round === MAX_ROUND && !s.endless) s.over = 'win'
  else if (s.lives <= 0) s.over = 'lose'
  if (s.over) return sum
  s.after = true
  if (isAugRound(s.round) || (!win && kind === 'boss')) queueAug(s)
  if (win) { s.queue.push('reward'); rollRewards(s, kind !== 'normal') }
  if (!s.queue.length) advance(s)
  return sum
}

// 무한 원정은 16·19·22…에도 증강체
export const isAugRound = (r: number) => AUG_ROUNDS.includes(r) || (r > MAX_ROUND && (r - MAX_ROUND) % 3 === 1)
// 고를 증강체가 남아 있을 때만 (무한 원정에서 다 모으면 건너뜀)
function queueAug(s: RunState) {
  rollAugs(s)
  if (s.augChoices.length) s.queue.push('augment')
}

// 15R 클리어 뒤 계속 (Balatro 엔드리스): 보스 전리품을 받고 16R로
export function goEndless(s: RunState) {
  if (s.over !== 'win' || s.endless || s.sandbox) return
  s.endless = { won: s.stats.won, elite: s.stats.elite, fresh: s.stats.fresh }
  s.elites = { ...(s.elites ?? {}), ...endlessElites(s.rng) }
  s.over = null
  s.after = true
  s.queue.push('reward')
  rollRewards(s, true)
}

export const income = (s: RunState, won: boolean) => 5 + Math.floor(s.round / 3) + (won ? 1 : 2) + (has(s, 'midas') ? 2 : 0) - heatRank(s, 'income')

function advance(s: RunState) {
  s.after = false
  const won = s.last?.win ?? true
  if (won || s.round !== MAX_ROUND) s.round++ // 15R 보스에게 지면 재도전
  s.xp += XP_PER_ROUND
  const interest = isCmd(s, 'merchant') ? Math.min(3, Math.floor(s.gold / 10)) : 0 // TFT 이자처럼 수입 전 골드 기준
  s.gold += income(s, won) + interest
  if (interest) s.notes.push(`금화 상인: 이자 +${interest} 골드`)
  if (isCmd(s, 'smith') && s.round % 4 === 0) { const it = pick(s.rng, ITEMS); s.items.push(it.id); s.notes.push(`대장장이: ${it.name}`) }
  s.cmdUsed = false
  s.freeRerolls = has(s, 'midas') ? 1 : 0
  s.wave = nextWave(s)
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
  const n = (isCmd(s, 'seer') ? 4 : 3) - heatRank(s, 'drought')
  const pair = s.promise ? RESONANCES.find(r => r.id === s.promise)?.pair : undefined
  const promised = pair ? pool.find(a => pair.includes(a.id)) : undefined
  if (promised) out.push(promised)
  // 한 칸은 지금 빌드에 맞는 것 (공명 상대 / 주력 특성) → 운보다 계획
  const fits = pool.filter(a => !out.includes(a) && (formsRes(s, a.id) || a.fit?.some(t => top.slice(0, 2).includes(t))))
  if (fits.length) out.push(pickW(s.rng, fits, w))
  while (out.length < n) {
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
  // 공명술사: 약속한 짝을 고르면 다음에 나머지 짝, 다른 걸 고르거나 공명이 켜지면 끝
  const pp = RESONANCES.find(r => r.id === s.promise)?.pair
  if (!pp?.includes(id) || pp.every(p => has(s, p))) s.promise = undefined
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

// ── 샌드박스: 골드·생명 없이 양쪽 진영을 마음대로 놓고 시험한다 (Bloons TD 6 샌드박스, TABS 전투 배치처럼).
// 같은 RunState를 쓰되 sandbox = true. 합체(mergeAll)는 거치지 않고, 보상·라운드 진행도 없다.
export function newSandbox(): RunState {
  const s = newRun({ unlocked: [] }, Date.now())
  Object.assign(s, { sandbox: true, round: 10, gold: 0, shop: [], bonusSlots: 12, augRerolls: 0, queue: [], cmdChoices: [] })
  s.wave = { label: '샌드박스', kind: 'normal', spawns: [] }
  return s
}

const sandMult = (s: RunState, tpl: string) => (ENEMIES[tpl] ? enemyMult(s.round) : 1)

// 적 강도 = 그 라운드의 적 배율 (아군 유닛·영웅을 적 쪽에 놓으면 배율 없이 별만)
export function sandRound(s: RunState, r: number) {
  s.round = Math.max(1, Math.min(MAX_ROUND, r))
  for (const sp of s.wave.spawns) sp.mult = sandMult(s, sp.tpl)
}

export function sandAlly(s: RunState, tpl: string, cell: number, star: number) {
  if (!UNIT[tpl]) return
  s.units = s.units.filter(u => u.pos !== cell)
  s.units.push({ id: s.nextId++, tpl, star, items: [], pos: cell, bonus: 0 })
}

export function sandEnemy(s: RunState, tpl: string, cell: number, star: number, aff?: string) {
  if (!tplOf(tpl)) return
  s.wave.spawns = s.wave.spawns.filter(sp => sp.cell !== cell)
  s.wave.spawns.push({ tpl, cell, mult: sandMult(s, tpl), star, aff: ENEMIES[tpl] && aff ? aff : undefined })
}

// 지우개: 아이템이 있으면 아이템부터, 다음엔 유닛
export function sandErase(s: RunState, side: Side, cell: number) {
  if (side === 1) { s.wave.spawns = s.wave.spawns.filter(sp => sp.cell !== cell); return }
  const u = s.units.find(x => x.pos === cell)
  if (u?.items.length) u.items = []
  else s.units = s.units.filter(x => x.pos !== cell)
}

export function sandWave(s: RunState, r: number, elite?: string) {
  const elites = { ...(s.elites ?? {}), ...(elite ? { [r]: elite } : {}) }
  sandRound(s, r)
  s.wave = makeWave(r, s.rng, elites)
}

export function sandAug(s: RunState, id: string) {
  s.augments = has(s, id) ? s.augments.filter(a => a !== id) : [...s.augments, id]
}
