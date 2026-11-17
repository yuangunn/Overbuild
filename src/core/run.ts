// 한 판(런)의 진행 상태. 전부 JSON 직렬화 가능 → localStorage에 그대로 저장.
import { UNIT, UNITS, type TraitId, type UnitTpl } from './data/units.ts'
import { AUG, AUGMENTS, RESONANCES, type AugDef, type PickCtx, type ResDef } from './data/augments.ts'
import { COMBOS, ITEM, ITEMS, combine } from './data/items.ts'
import { EVENT, EVENTS, type EvCtx } from './data/events.ts'
import { TRAITS, TRAIT_IDS } from './data/traits.ts'
import { ENEMIES, applyAffix, endlessElites, enemyMult, makeWave, pickElites, treasureWave, type Wave } from './data/enemies.ts'
import { Battle, STEP, type Mod, type Side } from './battle.ts'
import { mkRng, pick, pickW, rand, shuffle, type Rng } from './rng.ts'
import { CMD, COMMANDERS } from './data/commanders.ts'
import { AFFIXES } from './data/enemies.ts'
import { HEAT, HEAT_RULE } from './data/heat.ts'
import { EVOS, type EvoDef } from './data/evolutions.ts'

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

// 갈림길 (Slay the Spire 지도·Hades 문처럼 다음 방을 고른다). 고정 라운드(1·정예·보스)는 고르지 않는다.
export type DoorKind = 'fight' | 'elite' | 'treasure' | 'shop' | 'rest' | 'event'
export type Bonus = { k: 'gold'; n: number } | { k: 'item' } | { k: 'xp'; n: number } | { k: 'reroll'; n: number }
export interface Door { kind: DoorKind; bonus?: Bonus; event?: string }
export interface Offer { kind: 'item' | 'aug'; id: string; price: number; sold?: boolean }
export const PEACE: DoorKind[] = ['shop', 'rest', 'event'] // 전투 없는 방

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
  wrng?: Rng // 세계 난수 (v0.3 저장분엔 없음 → rng)
  arng?: Rng // 증강체 난수
  seed?: number
  daily?: string // 일일 도전 날짜 (YYYY-MM-DD)
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
  queue: ('commander' | 'augment' | 'goldaug' | 'reward' | 'path' | 'room')[] // goldaug = 정예 조우 보상 (골드 등급만)
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
  paths?: Door[] // 고를 문
  room?: Door // 지금 라운드의 방 (없으면 일반 전투)
  offers?: Offer[] // 떠돌이 상인 진열
  curse?: string // 사건 '버려진 병영': 다음 전투 적 전원 접두사
  augOnly?: number // 사건이 연 증강체 선택: 이 등급만
  promise?: string // 공명술사: 약속한 공명 id (그 짝 중 아직 없는 쪽이 증강체 선택에 반드시 나온다)
  newRes: string[]
  notes: string[] // UI가 꺼내서 토스트로 보여준다
}

const has = (s: RunState, id: string) => s.augments.includes(id)
const W = (s: RunState) => s.wrng ?? s.rng
const A = (s: RunState) => s.arng ?? s.rng

// ── 시드: 32비트 수 ↔ 7글자 코드 (Crockford base32, 헷갈리는 I·L·O·U 없음)
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const randomSeed = () => Math.floor(Math.random() * 2 ** 32) >>> 0
export function seedCode(n: number) {
  let c = ''
  for (let i = 0; i < 7; i++) { c = B32[n % 32] + c; n = Math.floor(n / 32) }
  return c.slice(0, 4) + '-' + c.slice(4)
}
export function parseSeed(code: string): number | null {
  const c = code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  if (!c || c.length > 7) return null
  let n = 0
  for (const ch of c) { const v = B32.indexOf(ch); if (v < 0) return null; n = n * 32 + v }
  return n < 2 ** 32 ? n : null
}

// ── 일일 도전 (Slay the Spire 일일 등반처럼): 날짜로 시드·사령관·위험도 규칙 둘이 정해지고, 영구 해금 없이 시작한다
export function dailySeed(date: string) {
  let h = 2166136261
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
export function dailyRules(date: string) {
  const w = mkRng(dailySeed(date) ^ 0x51ed27)
  const rules = shuffle(w, HEAT.filter(h => h.id !== 'timer').map(h => h.id)).slice(0, 2)
  return { heat: Object.fromEntries(rules.map(id => [id, 1])) as Record<string, number>, cmd: pick(w, COMMANDERS).id }
}
export function newDaily(date: string): RunState {
  const { heat, cmd } = dailyRules(date)
  const s = newRun({ unlocked: [], heat }, dailySeed(date))
  s.daily = date
  s.cmdChoices = [cmd]
  return s
}
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
    for (const sp of shuffle(W(s), plain).slice(0, s.round >= 11 ? 2 : 1)) sp.aff = pick(W(s), AFFIXES).id
  }
  if (heatRank(s, 'boss') && w.kind !== 'normal') w.spawns[0].mult *= 1.4
  if (s.curse && w.spawns.length) { for (const sp of w.spawns) sp.aff = s.curse; s.curse = undefined }
  return w
}
const nextWave = (s: RunState) => decorate(s, makeWave(s.round, W(s), s.elites))

// 방 → 이번 라운드 편성
export const ELITE_ROOM = 2.4
const ROOM_NAME: Record<DoorKind, string> = { fight: '전투', elite: '정예 조우', treasure: '보물 창고', shop: '떠돌이 상인', rest: '휴식처', event: '사건' }
function roomWave(s: RunState, d: Door): Wave {
  if (d.kind === 'treasure') return decorate(s, treasureWave(s.round, W(s)))
  if (PEACE.includes(d.kind)) return { label: d.kind === 'event' ? `사건 · ${EVENT[d.event!]?.name ?? '?'}` : ROOM_NAME[d.kind], kind: 'normal', spawns: [] }
  const w = nextWave(s)
  if (d.kind === 'elite' && w.kind === 'normal') {
    // 정예 조우: 적 전원 ×2.4, 둘에 접두사. 이기면 골드 증강체 하나를 더 고른다 (전리품은 일반 등급)
    for (const sp of w.spawns) sp.mult *= ELITE_ROOM
    for (const sp of shuffle(W(s), w.spawns.filter(x => !x.aff && x.tpl !== 'treasure')).slice(0, 2)) sp.aff = pick(W(s), AFFIXES).id
    Object.assign(w, { kind: 'elite', label: '정예 조우 · ' + w.label.split(' · ').pop(), hint: '정예 조우: 이기면 증강체를 하나 더 고른다' + (w.hint ? ' · ' + w.hint : '') })
  }
  return w
}
export const boardOf = (s: RunState) => s.units.filter(u => u.pos !== null)
export const benchOf = (s: RunState) => s.units.filter(u => u.pos === null)
export const slotsOf = (s: RunState) => Math.min(12, levelOf(s.xp).lv + 2 + s.bonusSlots)
// 유닛·적·나만의 영웅을 한 이름으로 찾는다 (영웅은 heroes.ts가 UNIT에 등록)
export const tplOf = (id: string): UnitTpl | undefined => UNIT[id] ?? ENEMIES[id]
// ★3 진화: ★3 + 짝 아이템 (그 아이템이 재료인 조합 아이템도 된다)
export const hasItem = (items: string[], id: string) => items.some(i => i === id || ITEM[i]?.from?.includes(id))
export const evoOf = (u: Pick<OwnedUnit, 'tpl' | 'star' | 'items'>): EvoDef | undefined => {
  const e = EVOS[u.tpl]
  return e && u.star >= 3 && hasItem(u.items, e.item) ? e : undefined
}
const evoNote = (s: RunState, u: OwnedUnit, was: boolean) => { const e = evoOf(u); if (e && !was) s.notes.push(`진화! ${UNIT[u.tpl].name} — ${e.name}`) }
export const sellValue = (u: OwnedUnit) => UNIT[u.tpl].cost * 3 ** (u.star - 1)
export const shopPool = (s: RunState) => UNITS.filter(t => !t.locked || s.unlocked.includes('u_' + t.id))
export const activeRes = (s: RunState): ResDef[] => RESONANCES.filter(r => r.pair.every(p => has(s, p)))

// 칸 번호 → 좌표. 플레이어 col 0 = 후열(왼쪽), 적 col 0 = 전열.
export const cellXY = (cell: number, side: Side) => {
  const c = Math.floor(cell / ROWS)
  return { x: side === 0 ? 0.7 + c : 6.3 + c, y: 0.5 + (cell % ROWS) }
}

export function newRun(meta: { unlocked: string[]; heat?: Record<string, number> }, seed = randomSeed()): RunState {
  const u = meta.unlocked
  const heat = { ...(meta.heat ?? {}) }
  const lives = Math.max(1, 3 + (u.includes('life') ? 1 : 0) - (heat.lives ? 1 : 0))
  seed >>>= 0
  // 난수 흐름 셋 (Slay the Spire처럼): 상점·전리품 / 세계(편성·문·사건·사령관) / 증강체.
  // 상점을 몇 번 돌리든 같은 시드면 같은 적·같은 문이 나온다.
  const rng = mkRng(seed), wrng = mkRng(seed ^ 0x9e3779b9), arng = mkRng(seed ^ 0x85ebca6b)
  const elites = pickElites(wrng)
  const s: RunState = {
    rng, wrng, arng, seed, round: 1, lives, maxLives: lives, gold: 6 + (u.includes('gold') ? 3 : 0), elites, heat,
    units: [], nextId: 1, xp: 0, shop: [], shopSize: (u.includes('shop6') ? 6 : 5) - (heat.shop ? 1 : 0), wave: makeWave(1, wrng, elites),
    augments: [], items: [], queue: [], augChoices: [], rewardChoices: [],
    augRerolls: 1 + (u.includes('augroll') ? 1 : 0), freeRerolls: 0, bonusSlots: 0, pity: 0, after: false,
    unlocked: [...u], stats: { won: 0, elite: 0, bestHit: 0, fresh: 0 }, over: null, last: null, newRes: [], notes: [],
  }
  s.cmdChoices = shuffle(wrng, COMMANDERS.map(c => c.id)).slice(0, 3)
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
    s.promise = pick(W(s), RESONANCES.filter(x => x.pair.every(open))).id
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
      const was = !!evoOf(keep)
      keep.star++
      keep.bonus = Math.max(keep.bonus, ...rest.map(r => r.bonus))
      for (const r of rest) {
        for (const it of r.items) {
          const next = combine([...keep.items, it])
          if (next.length <= 3) keep.items = next
          else s.items.push(it)
        }
        s.units.splice(s.units.indexOf(r), 1)
      }
      s.notes.push(`★ ${UNIT[keep.tpl].name} ★${keep.star} 승급!`)
      evoNote(s, keep, was)
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
  const next = combine([...u.items, s.items[idx]])
  if (next.length > 3) return '아이템은 유닛당 3개까지'
  const made = next.find(i => !u.items.includes(i) && ITEM[i].from)
  const was = !!evoOf(u)
  s.items.splice(idx, 1)
  u.items = next
  if (made) s.notes.push(`조합! ${ITEM[made].name}`)
  evoNote(s, u, was)
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
    const base = tplOf(u.tpl)!, e = evoOf(u)
    const t = e ? { ...base, skillName: e.name, skillDesc: e.desc, skill: e.skill, own: e.own ? () => [...(base.own?.() ?? []), ...e.own!()] : base.own } : base
    const f = b.add(t, u.star, 0, x, y, 1 + u.bonus)
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
  if (s.endless) b.limit = Math.min(b.limit || 60, 60) // 무한 원정은 다 쓰러뜨려야 이긴다 (시간 끝 체력 비교 없음)
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
    counts: { ...b.counts }, maxHit: b.maxHit, growth: 0, loot: (b.counts.treasure ?? 0) * (4 + s.round),
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
  if (win && s.room?.kind === 'elite') queueAug(s, 'goldaug') // 정예 조우 보상
  if (win && s.room?.bonus) giveBonus(s, s.room.bonus)
  if (win) { s.queue.push('reward'); rollRewards(s, kind !== 'normal' && s.room?.kind !== 'elite') }
  queuePath(s)
  if (!s.queue.length) advance(s)
  return sum
}

function giveBonus(s: RunState, b: Bonus) {
  if (b.k === 'gold') s.gold += b.n
  else if (b.k === 'item') s.items.push(pick(s.rng, ITEMS).id)
  else if (b.k === 'xp') s.xp += b.n
  else s.freeRerolls += b.n
  s.notes.push(`갈림길 보너스: ${bonusText(b)}`)
}
export const bonusText = (b: Bonus) => (b.k === 'gold' ? `골드 +${b.n}` : b.k === 'item' ? '아이템 +1' : b.k === 'xp' ? `경험치 +${b.n}` : `무료 새로고침 +${b.n}`)

// ── 갈림길
const eliteAt = (s: RunState, r: number) => (s.elites ?? { 5: 'troll', 10: 'scorpion', 15: 'boss' })[r]
const nextRound = (s: RunState) => (s.last?.win === false && s.round === MAX_ROUND ? s.round : s.round + 1)
export const isFixed = (s: RunState, r: number) => r <= 1 || r === MAX_ROUND || !!eliteAt(s, r)

function queuePath(s: RunState) {
  s.room = undefined
  const r = nextRound(s)
  if (s.sandbox || isFixed(s, r)) return
  const w: [DoorKind, number][] = [['fight', 3], ['treasure', 1], ['event', 1.6]]
  if (r >= 3) w.push(['elite', 1], ['shop', 1])
  if (r >= 4) w.push(['rest', s.lives < s.maxLives ? 1.6 : 0.8])
  const kinds: DoorKind[] = []
  while (kinds.length < 3) kinds.push(pickW(W(s), w.filter(([k]) => !kinds.includes(k)), x => x[1])[0])
  if (!kinds.some(k => k === 'fight' || k === 'elite' || k === 'treasure')) kinds[2] = 'fight' // 싸울 문은 늘 하나 이상
  s.paths = kinds.map((k): Door => {
    if (k === 'fight') return { kind: k, bonus: pick(W(s), [{ k: 'gold', n: 3 + Math.ceil(r * 0.5) }, { k: 'item' }, { k: 'xp', n: 4 }, { k: 'reroll', n: 3 }] as Bonus[]) }
    if (k === 'event') return { kind: k, event: pick(W(s), EVENTS).id }
    return { kind: k }
  })
  s.queue.push('path')
}

export function pickPath(s: RunState, i: number) {
  const d = s.paths?.[i]
  if (s.queue[0] !== 'path' || !d) return
  s.room = d
  s.paths = []
  finishPick(s)
}

// 전투 없는 방에서 '다음으로'
export function leaveRoom(s: RunState) {
  if (s.queue.length || s.wave.spawns.length || s.over || s.sandbox) return
  s.after = true
  s.last = null
  queuePath(s)
  if (!s.queue.length) advance(s)
}

// ── 떠돌이 상인: 기본 아이템 둘, 조합 아이템 하나, 증강체 하나
function rollOffers(s: RunState) {
  const aug = AUGMENTS.filter(a => a.rarity < 3 && !has(s, a.id) && !a.crest && (!a.locked || s.unlocked.includes('a_' + a.id)))
  s.offers = [
    ...shuffle(W(s), [...ITEMS]).slice(0, 2).map((it): Offer => ({ kind: 'item', id: it.id, price: 4 })),
    { kind: 'item', id: pick(W(s), COMBOS).id, price: 10 },
    ...(aug.length ? [{ kind: 'aug', id: pick(W(s), aug).id, price: 12 } as Offer] : []),
  ]
}

export function buyOffer(s: RunState, i: number): string | null {
  const o = s.offers?.[i]
  if (!o || o.sold || s.queue[0] !== 'room') return null
  if (s.gold < o.price) return '골드가 부족합니다'
  s.gold -= o.price
  o.sold = true
  if (o.kind === 'item') s.items.push(o.id)
  else {
    const before = activeRes(s).map(r => r.id)
    s.augments.push(o.id)
    AUG[o.id].onPick?.(ctx(s))
    s.newRes.push(...activeRes(s).map(r => r.id).filter(r => !before.includes(r)))
  }
  return null
}

// ── 휴식처: 셋 중 하나
export const REST = [
  { id: 'life', name: '쉬어 간다', desc: '생명 +1' },
  { id: 'train', name: '단련한다', desc: '배치된 유닛 전원 영구 +15%' },
  { id: 'study', name: '전략을 짠다', desc: '지휘 경험치 +8' },
] as const

export function rest(s: RunState, id: string): string | null {
  if (s.queue[0] !== 'room' || s.room?.kind !== 'rest') return null
  if (id === 'life') { if (s.lives >= s.maxLives) return '생명이 가득합니다'; s.lives++ }
  else if (id === 'train') for (const u of boardOf(s)) u.bonus += 0.15
  else s.xp += 8
  s.queue.shift()
  return null
}

// ── 사건
const evCtx = (s: RunState): EvCtx => ({
  s,
  addUnit: (t, star) => addUnit(s, t, star),
  addItem: id => { const it = id === 'combo' ? pick(s.rng, COMBOS) : id ? ITEM[id] : pick(s.rng, ITEMS); s.items.push(it.id); return it.name },
  augment: rarity => { s.augOnly = rarity; rollAugs(s); if (s.augChoices.length) s.queue.splice(1, 0, 'augment'); else s.augOnly = undefined },
  topTpl: cost => { const top = topTraits(s); const pool = shopPool(s).filter(t => !cost || t.cost === cost); return (pool.find(t => t.traits.some(x => top[0] === x)) ?? pick(s.rng, pool)).id },
  best: () => [...boardOf(s)].sort((a, b) => UNIT[b.tpl].cost * 3 ** b.star - UNIT[a.tpl].cost * 3 ** a.star)[0],
  rand: () => rand(s.rng),
})
export const eventCan = (s: RunState, i: number) => EVENT[s.room?.event ?? '']?.choices[i]?.can?.(evCtx(s)) ?? null

export function eventPick(s: RunState, i: number): string | null {
  const c = EVENT[s.room?.event ?? '']?.choices[i]
  if (s.queue[0] !== 'room' || !c) return null
  const no = eventCan(s, i)
  if (no) return no
  s.notes.push(c.apply(evCtx(s)))
  s.queue.shift()
  return null
}

export function leaveShop(s: RunState) { if (s.queue[0] === 'room' && s.room?.kind === 'shop') s.queue.shift() }

// 무한 원정은 16·19·22…에도 증강체
export const isAugRound = (r: number) => AUG_ROUNDS.includes(r) || (r > MAX_ROUND && (r - MAX_ROUND) % 3 === 1)
// 고를 증강체가 남아 있을 때만 (무한 원정에서 다 모으면 건너뜀)
export const isAugQ = (q: RunState['queue'][number] | undefined) => q === 'augment' || q === 'goldaug'
function queueAug(s: RunState, kind: 'augment' | 'goldaug' = 'augment') {
  s.queue.push(kind)
  if (s.queue.length > 1) return // 앞 선택을 마치면 finishPick이 굴린다
  rollAugs(s)
  if (!s.augChoices.length) s.queue.pop()
}

// 15R 클리어 뒤 계속 (Balatro 엔드리스): 보스 전리품을 받고 16R로
export function goEndless(s: RunState) {
  if (s.over !== 'win' || s.endless || s.sandbox) return
  s.endless = { won: s.stats.won, elite: s.stats.elite, fresh: s.stats.fresh }
  s.elites = { ...(s.elites ?? {}), ...endlessElites(W(s)) }
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
  s.freeRerolls = Math.max(s.freeRerolls, has(s, 'midas') ? 1 : 0) // 갈림길 보너스로 받은 무료 새로고침은 남긴다
  const room = s.room ?? { kind: 'fight' }
  s.wave = roomWave(s, room)
  if (PEACE.includes(room.kind)) { s.queue.push('room'); if (room.kind === 'shop') rollOffers(s) }
  rollShop(s)
}

function finishPick(s: RunState) {
  s.queue.shift()
  // 증강체가 연달아 있으면 (증강체 라운드 + 정예 조우) 차례가 왔을 때 굴린다
  while (isAugQ(s.queue[0]) && !s.augChoices.length) { rollAugs(s); if (s.augChoices.length) break; s.queue.shift() }
  if (!s.queue.length && s.after) advance(s)
}

// ── 증강체
const formsRes = (s: RunState, id: string) => RESONANCES.some(r => r.pair.includes(id) && r.pair.some(p => p !== id && has(s, p)))

export function rollAugs(s: RunState) {
  const top = topTraits(s)
  const all = AUGMENTS.filter(a => !has(s, a.id) && (!a.locked || s.unlocked.includes('a_' + a.id)) && (!a.crest || top.includes(a.crest)))
  const only = s.queue[0] === 'goldaug' ? 2 : s.augOnly
  const pool = only && all.some(a => a.rarity === only) ? all.filter(a => a.rarity === only) : all
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
  if (fits.length) out.push(pickW(A(s), fits, w))
  while (out.length < n) {
    const rest = pool.filter(a => !out.includes(a))
    if (!rest.length) break
    out.push(pickW(A(s), rest, w))
  }
  s.augChoices = shuffle(A(s), out.map(a => a.id))
}

export function rerollAugs(s: RunState) {
  if (s.augRerolls <= 0 || !isAugQ(s.queue[0])) return
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
  if (!isAugQ(s.queue[0]) || !s.augChoices.includes(id)) return []
  const before = activeRes(s).map(r => r.id)
  s.augments.push(id)
  s.pity = 0
  s.augChoices = []
  s.augOnly = undefined
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
