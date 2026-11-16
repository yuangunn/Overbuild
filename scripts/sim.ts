// 헤드리스 검증: node scripts/sim.ts
// 1) 메커니즘 단언  2) 사기 빌드 vs 증강 없음 (보스전)  3) 봇 완주 통계
import { STEP, type Battle, type Fighter } from '../src/core/battle.ts'
import * as R from '../src/core/run.ts'
import { UNIT } from '../src/core/data/units.ts'
import { AUG, AUGMENTS, RESONANCES } from '../src/core/data/augments.ts'
import { ENEMIES, makeWave } from '../src/core/data/enemies.ts'
import { TRAITS } from '../src/core/data/traits.ts'
import { UNLOCKS } from '../src/core/meta.ts'

const ALL = UNLOCKS.map(u => u.id).filter(id => id !== 'startaug' && id !== 'life' && id !== 'gold' && id !== 'shop6')
let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fails++ }

ENEMIES.dummy = { id: 'dummy', name: '허수아비', emoji: '🎯', cost: 0, traits: [], hp: 400000, atk: 0, as: 0.5, range: 1, armor: 0, mana: 0, skillName: '', skillDesc: '' }
ENEMIES.brute = { id: 'brute', name: '난폭자', emoji: '👊', cost: 0, traits: [], hp: 900, atk: 90, as: 1, range: 1, armor: 10, mana: 0, skillName: '', skillDesc: '' }

type Spec = [tpl: string, star: number, items?: string[]]
function setup(round: number, board: Spec[], augs: string[] = [], seed = 1): R.RunState {
  const s = R.newRun({ unlocked: ALL }, seed)
  s.round = round
  s.wave = makeWave(round, s.rng)
  s.units = []
  s.bonusSlots = 12
  for (const [tpl, star, items = []] of board) {
    s.units.push({ id: s.nextId++, tpl, star, items: [...items], pos: R.autoCell(s, UNIT[tpl]), bonus: 0 })
  }
  s.bonusSlots = Math.max(0, board.length - R.slotsOf({ ...s, bonusSlots: 0 }))
  s.augments = [...augs]
  return s
}
const vs = (s: R.RunState, tpl: string, n: number, mult = 1) => {
  s.wave = { label: 'test', kind: 'normal', spawns: Array.from({ length: n }, (_, i) => ({ tpl, cell: (i % 3) * 4 + Math.floor(i / 3), mult })) }
  return s
}
function run(s: R.RunState, maxT = 60): Battle {
  const b = R.buildBattle(s)
  while (!b.done && b.t < maxT) b.step(STEP)
  return b
}
const mine = (b: Battle) => b.fighters.filter(f => f.side === 0)
const of = (b: Battle, tpl: string) => mine(b).find(f => f.tpl.id === tpl)!

// ───────────────────────── 1. 메커니즘
console.log('\n[1] 메커니즘')
{
  const s = R.newRun({ unlocked: [] }, 7)
  for (let i = 0; i < 3; i++) R.addUnit(s, 'wolf', 1)
  ok(s.units.length === 1 && s.units[0].star === 2, '같은 유닛 3개 → ★2')
  for (let i = 0; i < 6; i++) R.addUnit(s, 'wolf', 1)
  ok(s.units.length === 1 && s.units[0].star === 3, '9개 → ★3')
}
{
  const base = run(vs(setup(5, [['apprentice', 2]]), 'dummy', 1), 12)
  const echo = run(vs(setup(5, [['apprentice', 2]], ['echo']), 'dummy', 1), 12)
  const both = run(vs(setup(5, [['apprentice', 2, ['ring']]], ['echo']), 'dummy', 1), 12)
  const c0 = of(base, 'apprentice').st.casts, c1 = of(echo, 'apprentice').st.casts, c2 = of(both, 'apprentice').st.casts
  const orig2 = c2 - (both.counts.echo ?? 0) - (both.counts.ring ?? 0)
  ok(c1 >= c0 * 2 - 1, `메아리: 스킬 ${c0}회 → ${c1}회`)
  ok(c2 >= orig2 * 4 - 3, `메아리+쌍둥이 반지 중첩: 원본 ${orig2}회 → 총 ${c2}회 (4배)`)
}
{
  const team: Spec[] = [['cutthroat', 2, ['dice']], ['wolf', 2], ['sniper', 2, ['dice']], ['bladedancer', 2]]
  const a = run(vs(setup(8, team, ['chain'], 3), 'brute', 9, 3), 20)
  const b2 = run(vs(setup(8, team, ['chain', 'overload'], 3), 'brute', 9, 3), 20)
  ok((a.counts.chain ?? 0) > 0, `연쇄 치명 발동 ${a.counts.chain}회`)
  ok((b2.counts.chain ?? 0) > (a.counts.chain ?? 0), `연쇄 폭풍 공명(+과부하) 튕김 ${a.counts.chain} → ${b2.counts.chain}회`)
}
{
  const team: Spec[] = [['skeleton_w', 1], ['cutthroat', 1], ['shieldbearer', 1], ['apprentice', 1]]
  const a = run(vs(setup(8, team, ['soulpact'], 2), 'brute', 6, 2.5))
  const b2 = run(vs(setup(8, team, ['soulpact', 'martyr'], 2), 'brute', 6, 2.5))
  const maxGen = (b: Battle) => Math.max(...mine(b).map(f => f.gen))
  ok((a.counts.soulpact ?? 0) > 0 && maxGen(a) === 1, `영혼 계약: 원혼 ${a.counts.soulpact}기, 최대 1세대`)
  ok(maxGen(b2) >= 2, `끝없는 행진 공명: 원혼이 ${maxGen(b2)}세대까지 이어짐`)
}
{
  const b = run(vs(setup(8, [['ranger', 2]], ['frenzy']), 'dummy', 1), 10)
  ok(of(b, 'ranger').asBonus > 0.8, `광란: 10초 뒤 공속 보너스 +${Math.round(of(b, 'ranger').asBonus * 100)}%`)
}
{
  const b = run(vs(setup(8, [['shieldbearer', 1]], ['laststand']), 'brute', 3, 2))
  ok((b.counts.laststand ?? 0) > 0, '최후의 저항 발동')
}
{
  const s = setup(8, [['apprentice', 1], ['golem', 1], ['bear', 1]], ['giant', 'vamp', 'overload', 'lonehero'])
  const b = R.buildBattle(vs(s, 'dummy', 1))
  const f = of(b, 'bear')
  const raw = UNIT.bear.hp
  ok(f.maxHp > raw * 2 * 1.5, `거인화+고독한 영웅: 곰 체력 ${raw} → ${Math.round(f.maxHp)}`)
  ok(f.lifesteal >= 0.25 && f.overheal && f.skillCrit && f.crit >= 0.25, '피의 계약·과부하 능력치 적용')
}
{
  const team: Spec[] = [['sniper', 2], ['ranger', 2], ['apprentice', 2], ['stormcaller', 2]]
  const b = run(vs(setup(8, team, ['executioner', 'corpse', 'multishot'], 4), 'brute', 9, 2))
  ok((b.counts.executioner ?? 0) > 0 && (b.counts.corpse ?? 0) > 0 && (b.counts.multishot ?? 0) > 0,
    `처형 ${b.counts.executioner} · 시체 폭발 ${b.counts.corpse} · 다중 사격 ${b.counts.multishot}`)
}
{
  const s = setup(8, [['apprentice', 1], ['frostwitch', 1]], ['echo', 'manasurge'])
  ok(R.activeRes(s).some(r => r.id === 'res_infinite'), '공명 판정: 메아리+마나 폭주 → 무한 회로')
  const b = R.buildBattle(vs(s, 'dummy', 1))
  ok(of(b, 'apprentice').spell >= 1.3, '무한 회로: 스킬 피해 +30% 적용')
}
{
  // 모든 전투형 증강체가 실제로 무언가를 바꾸는지 (발동 수 또는 능력치)
  const team: Spec[] = [['shieldbearer', 2], ['cutthroat', 2, ['dice']], ['ranger', 2], ['frostwitch', 2], ['necromancer', 2], ['sniper', 2]]
  const statOnly: Record<string, (f: Fighter) => boolean> = {
    vamp: f => f.lifesteal >= 0.25, giant: f => f.maxHp > UNIT[f.tpl.id].hp * 1.8 * 1.9, overload: f => f.skillCrit,
  }
  const silent: string[] = []
  for (const a of AUGMENTS) {
    if (!a.mod) continue
    const b = run(vs(setup(9, team, [a.id], 5), 'brute', 8, 2.5), 30)
    const moved = (b.counts[a.id] ?? 0) > 0 || mine(b).some(f => statOnly[a.id]?.(f))
    if (!moved) silent.push(a.id)
  }
  ok(silent.length === 0, `전투형 증강체 ${AUGMENTS.filter(a => a.mod).length}종 전부 발동 확인${silent.length ? ' — 안 됨: ' + silent : ''}`)
}
{
  // 특성 문장: 개수 +1, 효과 2배
  const s = setup(8, [['cutthroat', 1], ['wolf', 1]], ['crest_shadow'])
  const sy = R.synergies(s).find(x => x.id === 'shadow')!
  ok(sy.count === 3 && sy.x === 2, '그림자의 문장: 개수 2 → 3, 효과 2배')
}

// ───────────────────────── 2. 사기 빌드 (15라운드 보스)
console.log('\n[2] 사기 빌드 — 15라운드 보스, 시드 20개')
interface Build { name: string; team: Spec[]; augs: string[]; bonus?: number }
const BUILDS: Build[] = [
  {
    name: '무한 주문 (비전+메아리+마나 폭주)', augs: ['echo', 'manasurge', 'overload', 'crest_arcane'],
    team: [['apprentice', 2], ['frostwitch', 2], ['golem', 2], ['necromancer', 2, ['crystal']], ['stormcaller', 2, ['ring']], ['shieldbearer', 2], ['skeleton_w', 2], ['ranger', 2]],
  },
  {
    name: '연쇄 치명 (그림자+연쇄+산탄)', augs: ['chain', 'overload', 'multishot', 'executioner'],
    team: [['cutthroat', 2], ['wolf', 2], ['sniper', 2, ['dice']], ['bladedancer', 2, ['dice']], ['ranger', 2], ['golem', 2], ['stormcaller', 2], ['shieldbearer', 2, ['helm']]],
  },
  {
    name: '망자의 군단 (망령+영혼 계약+시체 폭발)', augs: ['soulpact', 'martyr', 'corpse', 'crest_undead'],
    team: [['cutthroat', 2], ['skeleton_w', 2], ['frostwitch', 2], ['necromancer', 2], ['golem', 2], ['shieldbearer', 2], ['bear', 2], ['apprentice', 2]],
  },
  {
    name: '피의 광란 (야수+광란+흡혈)', augs: ['frenzy', 'vamp', 'laststand', 'crest_beast'],
    team: [['shieldbearer', 2], ['ranger', 2], ['wolf', 2], ['bear', 2], ['bladedancer', 2, ['sword']], ['golem', 2], ['skeleton_w', 2], ['sniper', 2]],
  },
  {
    name: '고독한 영웅 (칼날 춤꾼 ★3 혼자)', augs: ['lonehero', 'growth', 'giant'], bonus: 1.6,
    team: [['bladedancer', 3, ['sword', 'fang', 'dice']]],
  },
]
for (const bd of BUILDS) {
  const res = (augs: string[]) => {
    let w = 0, t = 0
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup(15, bd.team, augs, seed)
      for (const u of s.units) u.bonus = augs.length ? (bd.bonus ?? 0) : 0
      const b = run(s)
      if (b.win) { w++; t += b.t }
    }
    return { w, t: w ? t / w : 0 }
  }
  const on = res(bd.augs), off = res([])
  console.log(`  ${bd.name}\n     증강 있음: ${on.w}/20 승, 평균 ${on.t.toFixed(1)}초  |  증강 없음: ${off.w}/20 승${off.w ? `, ${off.t.toFixed(1)}초` : ''}`)
  ok(on.w >= 15 && on.w - off.w >= 10, `${bd.name.split(' (')[0]}: 증강체가 보스전 판도를 뒤집는다 (있으면 75%+ 승, 없을 때보다 10승 이상)`)
}

// ───────────────────────── 3. 봇 완주
console.log('\n[3] 봇 완주 통계')
const val = (u: R.OwnedUnit) => UNIT[u.tpl].cost * 3 ** (u.star - 1)

function botTurn(s: R.RunState, smart: boolean) {
  const top = R.synergies(s).slice(0, 2).map(x => x.id)
  // 구매: 겹치는 유닛 / 주력 특성 / 빈자리
  for (let pass = 0; pass < 6; pass++) {
    s.shop.forEach((id, i) => {
      if (!id) return
      const t = UNIT[id]
      const dup = s.units.some(u => u.tpl === id && u.star < 3)
      const fit = t.traits.some(x => top.includes(x))
      const room = R.boardOf(s).length < R.slotsOf(s)
      if ((dup || fit || room || !smart) && s.gold >= t.cost + (s.round > 2 ? 1 : 0)) R.buy(s, i)
    })
    if (s.gold < 5 || s.round < 3) break
    R.reroll(s)
  }
  // 대기석 → 보드 (빈칸 또는 더 약한 유닛과 교체)
  for (const u of [...R.benchOf(s)].sort((a, b) => val(b) - val(a))) {
    const cell = R.autoCell(s, UNIT[u.tpl])
    if (R.boardOf(s).length < R.slotsOf(s) && cell !== null) { R.move(s, u.id, cell); continue }
    const weak = R.boardOf(s).sort((a, b) => val(a) - val(b))[0]
    if (weak && val(weak) < val(u)) R.move(s, u.id, weak.pos)
  }
  // 아이템은 가장 비싼 유닛부터
  while (s.items.length) {
    const t = R.boardOf(s).filter(u => u.items.length < 3).sort((a, b) => val(b) - val(a))[0]
    if (!t) break
    R.equip(s, 0, t.id)
  }
  while (R.benchOf(s).length > 6) R.sell(s, R.benchOf(s).sort((a, b) => val(a) - val(b))[0].id)
}

function botPick(s: R.RunState, smart: boolean) {
  while (s.queue.length && !s.over) {
    if (s.queue[0] === 'augment') {
      const c = s.augChoices
      const score = (id: string) => (RESONANCES.some(r => r.pair.includes(id) && r.pair.every(p => p === id || s.augments.includes(p))) ? 10 : 0) + AUG[id].rarity
      R.pickAug(s, smart ? [...c].sort((a, b) => score(b) - score(a))[0] : c[0])
    } else {
      const i = s.rewardChoices.findIndex(r => r.kind === 'unit' || r.kind === 'train')
      R.pickReward(s, smart ? Math.max(0, i) : 0)
    }
  }
}

function bot(seed: number, smart: boolean, unlocked: string[] = []) {
  let s = R.newRun({ unlocked }, seed)
  const maxT: number[] = []
  for (let g = 0; g < 40 && !s.over; g++) {
    botPick(s, smart)
    if (s.over) break
    botTurn(s, smart)
    s = JSON.parse(JSON.stringify(s)) // 매 라운드 저장/불러오기 왕복
    const b = R.buildBattle(s)
    R.endBattle(s, b)
    maxT.push(b.t)
  }
  return { s, maxT: Math.max(...maxT) }
}

for (const smart of [false, true]) {
  const N = 150
  let wins = 0, rounds = 0, maxT = 0, errors = 0, augs = 0, res = 0
  const reach: Record<number, number> = {}
  for (let i = 0; i < N; i++) {
    try {
      const { s, maxT: m } = bot(1000 + i, smart)
      if (s.over === 'win') wins++
      rounds += s.round
      reach[s.round] = (reach[s.round] ?? 0) + 1
      maxT = Math.max(maxT, m)
      augs += s.augments.length
      res += R.activeRes(s).length
      if (!s.over) errors++
    } catch (e) { errors++; console.log('   에러', e) }
  }
  console.log(`  ${smart ? '공명 노리는 봇' : '무작위 봇'}: 클리어 ${wins}/${N} (${Math.round(wins / N * 100)}%), 평균 도달 ${(rounds / N).toFixed(1)}R, 평균 증강 ${(augs / N).toFixed(1)}·공명 ${(res / N).toFixed(2)}, 최장 전투 ${maxT.toFixed(1)}초`)
  console.log(`     종료 라운드 분포: ${Object.entries(reach).map(([r, n]) => `${r}R:${n}`).join(' ')}`)
  ok(errors === 0, `${smart ? '공명' : '무작위'} 봇 ${N}판 전부 끝까지 진행 (막힘·예외 없음)`)
}

console.log(fails ? `\n✗ 실패 ${fails}건` : '\n✓ 전부 통과')
if (fails) throw new Error(`${fails} failed`)
void TRAITS
