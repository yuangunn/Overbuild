// 헤드리스 검증: node scripts/sim.ts
// 1) 메커니즘 단언  2) 사기 빌드 vs 증강 없음 (보스전)  3) 봇 완주 통계
import { STEP, type Battle, type Fighter } from '../src/core/battle.ts'
import * as R from '../src/core/run.ts'
import { UNIT, UNITS } from '../src/core/data/units.ts'
import { AUG, AUGMENTS, RESONANCES } from '../src/core/data/augments.ts'
import { COMBOS, ITEMS, combine } from '../src/core/data/items.ts'
import { EVOS } from '../src/core/data/evolutions.ts'
import { ENEMIES, enemyMult, makeWave } from '../src/core/data/enemies.ts'
import { LIMITS, cleanHero, newHero, registerHeroes } from '../src/core/heroes.ts'
import { TRAITS } from '../src/core/data/traits.ts'
import * as M from '../src/core/meta.ts'
import { UNLOCKS } from '../src/core/meta.ts'
import { bot } from './bot.ts'

const ALL = UNLOCKS.map(u => u.id).filter(id => id !== 'startaug' && id !== 'life' && id !== 'gold' && id !== 'shop6')
let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fails++ }

ENEMIES.dummy = { id: 'dummy', name: '허수아비', emoji: '🎯', cost: 0, traits: [], hp: 400000, atk: 0, as: 0.5, range: 1, armor: 0, mana: 0, skillName: '', skillDesc: '' }
ENEMIES.brute = { id: 'brute', name: '난폭자', emoji: '👊', cost: 0, traits: [], hp: 900, atk: 90, as: 1, range: 1, armor: 10, mana: 0, skillName: '', skillDesc: '' }

type Spec = [tpl: string, star: number, items?: string[]]
function setup(round: number, board: Spec[], augs: string[] = [], seed = 1): R.RunState {
  const s = R.newRun({ unlocked: ALL }, seed)
  s.round = round
  s.xp = R.XP_PER_ROUND * (round - 1)
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

// ───────────────────────── 1b. 기믹 적·접두사·편성
console.log('\n[1b] 기믹')
{
  const wave = (s: R.RunState, spawns: [string, number][], aff?: string) => {
    s.wave = { label: 'test', kind: 'normal', spawns: spawns.map(([tpl, cell]) => ({ tpl, cell, mult: 3, aff })) }
    return s
  }
  const team: Spec[] = [['shieldbearer', 2], ['ranger', 2], ['sniper', 2], ['apprentice', 2]]
  const sl = run(wave(setup(6, team, [], 3), [['kingslime', 0]]))
  ok(sl.fighters.filter(f => f.tpl.id === 'slimelet').length === 2 && sl.win, '왕슬라임: 쓰러지면 꼬마 슬라임 2마리로 분열')
  const bo = run(wave(setup(6, [['shieldbearer', 1]], [], 3), [['bomber', 0], ['goblin', 1]]))
  const bomber = bo.fighters.find(f => f.tpl.id === 'bomber')!
  ok(!bomber.alive && mine(bo)[0].taken > 0 && bo.fighters.find(f => f.tpl.id === 'goblin')!.taken > 0, '자폭 고블린: 붙으면 터져 아군과 제 편 모두 피해')
  const caught = R.buildBattle(wave(setup(6, [['sniper', 2], ['ranger', 2]], [], 3), [['treasure', 8]]))
  const sum = R.summarize(setup(6, []), caught)
  const away = run(wave(setup(6, [['shieldbearer', 1]], [], 3), [['treasure', 11]]), 30)
  ok(sum.loot > 0 && (away.counts.escaped ?? 0) === 1 && away.t >= 10 && away.t < 11, `보물 고블린: 원거리 팀은 잡아 ${sum.loot}골드, 느린 근접 혼자면 10초 뒤 도망`)
  const wr = run(wave(setup(6, team, [], 3), [['wraith', 0]]))
  ok(wr.fighters.find(f => f.tpl.id === 'wraith')!.st.rev === 1 && wr.win, '망령 기사: 한 번 되살아난다')
  const li = run(wave(setup(10, team, [], 3), [['lich', 9], ['goblin', 0], ['goblin', 1]]), 40)
  ok(li.fighters.some(f => f.st.raised), '리치: 쓰러진 적을 되살린다')
  const pr = run(wave(setup(6, [['shieldbearer', 2]], [], 3), [['priest', 8]]), 15)
  ok(pr.fighters.some(f => f.side === 1 && f.tpl.id === 'skeleton'), '강령 사제: 해골 졸개를 부른다')
  const af = R.buildBattle(wave(setup(10, team, [], 3), [['orc', 0]], 'volt'))
  const orc = af.fighters.find(f => f.side === 1)!
  ok(orc.name.startsWith('과부하') && orc.glow !== '' && orc.shield > 0, '접두사: 이름·오라·능력 적용 (과부하 = 보호막)')
  let bad = 0
  const seen = new Set<string>()
  for (let seed = 1; seed <= 300; seed++) {
    const s = R.newRun({ unlocked: [] }, seed)
    for (let r = 1; r <= 15; r++) {
      const w = makeWave(r, s.rng, s.elites)
      seen.add(w.label)
      const cells = w.spawns.map(x => x.cell)
      if (w.spawns.some(x => !R.tplOf(x.tpl)) || new Set(cells).size !== cells.length || !w.spawns.length) bad++
    }
  }
  ok(bad === 0, `편성 ${seen.size}종 × 300시드: 모든 적이 실재하고 칸이 겹치지 않음`)
  const el = R.newRun({ unlocked: [] }, 11)
  ok(['troll', 'goblinking'].includes(el.elites![5]) && ['scorpion', 'lich'].includes(el.elites![10]), `정예 예고: 5R ${el.elites![5]} · 10R ${el.elites![10]}`)
}

// ───────────────────────── 1c. 샌드박스·나만의 영웅
console.log('\n[1c] 샌드박스·나만의 영웅')
{
  const h = cleanHero({ ...newHero(), id: 'h_test', name: '<i>시험', hp: 99999, atk: -5, traits: ['arcane', 'beast', 'guard'] as never, skill: 'stormcaller', passive: 'split' })!
  ok(h.name === 'i시험' && h.hp === LIMITS.hp[1] && h.atk === LIMITS.atk[0] && h.traits.length === 2, '영웅 저장분 정리: 이름 꺾쇠 제거·능력치 범위·특성 2개')
  registerHeroes([h])
  ok(!!UNIT.h_test && !UNITS.some(t => t.id === 'h_test') && !R.shopPool(R.newRun({ unlocked: ALL })).some(t => t.id === 'h_test'), '영웅은 UNIT에만 등록, 원정 상점에는 없음')
  const s = R.newSandbox()
  R.sandAlly(s, 'h_test', 9, 2)
  R.sandAlly(s, 'h_test', 9, 1) // 같은 칸은 교체
  R.sandAlly(s, 'goblin', 5, 1) // 적은 아군 쪽에 못 놓음
  R.sandEnemy(s, 'troll', 1, 1, 'giant')
  R.sandEnemy(s, 'h_test', 3, 1) // 영웅은 적 쪽에도
  R.sandRound(s, 5)
  ok(s.units.length === 1 && s.wave.spawns.length === 2 && s.wave.spawns[0].mult === enemyMult(5) && s.wave.spawns[1].mult === 1 && s.wave.spawns[0].aff === 'giant',
    '샌드박스 배치: 같은 칸 교체·적은 오른쪽만·영웅은 양쪽·적 강도는 적에게만')
  const b = R.buildBattle(s)
  const sum = R.summarize(s, b)
  const clones = b.fighters.filter(f => f.tpl.id === 'h_test' && f.summoned).length
  ok(b.fighters.some(f => f.tpl.id === 'h_test' && (f.st.casts ?? 0) > 0) && clones >= 2 && s.round === 5 && s.lives === s.maxLives,
    `영웅 전투: 빌린 스킬 발동·분열 분신 ${clones}기, 샌드박스 상태(라운드·생명)는 그대로 · ${sum.win ? '승' : '패'} ${sum.time.toFixed(1)}초`)
  registerHeroes([])
  ok(!UNIT.h_test, '지운 영웅은 UNIT에서 빠짐')
}

// ───────────────────────── 1d. 지휘 레벨·무한 원정
console.log('\n[1d] 지휘 레벨·무한 원정')
{
  const s = R.newRun({ unlocked: [] }, 3)
  const nat = Array.from({ length: 15 }, (_, i) => R.levelOf(R.XP_PER_ROUND * i).lv + 2)
  ok(nat.join() === '3,4,4,5,5,6,6,6,7,7,7,8,8,8,8', '경험치를 사지 않으면 라운드별 배치 칸은 예전과 같음')
  s.gold = 8
  R.buyXp(s); R.buyXp(s)
  ok(R.levelOf(s.xp).lv === 3 && R.slotsOf(s) === 5 && s.gold === 0 && R.buyXp(s) === '골드가 부족합니다', '4골드 두 번 → Lv3, 배치 5칸, 골드 부족이면 거절')
  const old = { ...s, xp: undefined } as unknown as R.RunState
  old.round = 9
  ok(R.fixRun(old).xp === 16 && R.slotsOf(old) === 7, '예전 저장분은 라운드로 경험치를 채움')
}
{
  const s = R.newRun({ unlocked: [] }, 11)
  s.round = 15; s.over = 'win'; s.queue = []; s.stats = { won: 14, elite: 3, bestHit: 0, fresh: 1 }
  R.goEndless(s)
  ok(!s.over && !!s.endless && s.queue[0] === 'reward' && s.elites?.[20] !== undefined && s.elites?.[25] === 'boss', '15R 클리어 → 무한 원정: 전리품 고르고 20R 정예·25R 보스 예고')
  R.pickReward(s, 0)
  ok(s.round === 16 && s.wave.kind === 'normal' && s.wave.spawns.filter(sp => sp.tpl !== 'treasure').length >= 8 && s.wave.spawns.some(sp => sp.aff) && s.wave.spawns.every(sp => sp.armor === 30),
    `16R: 일반 편성 ${s.wave.spawns.length}명, 접두사·방어력 +30`)
  ok(R.isAugRound(16) && R.isAugRound(19) && !R.isAugRound(17) && makeWave(20, s.rng, s.elites).kind === 'elite' && makeWave(25, s.rng, s.elites).kind === 'boss' && makeWave(21, s.rng, s.elites).kind === 'normal',
    '16·19R 증강체, 20R 정예, 25R 보스, 21R 일반')
  ok(enemyMult(20) > enemyMult(15) * 1.9, '16R부터 적 배율이 곱으로 오름')
  s.stats.won = 20; s.stats.elite = 4; s.round = 22; s.over = 'lose'
  const m = { ...M.loadMeta(), shards: 0, runs: 5, endless: 0 }
  const got = M.settle(m, s)
  ok(got === 6 + 2 && m.runs === 5 && m.endless === 22, `무한 원정 정산은 그 뒤 몫만 (+${got}), 원정 횟수는 그대로, 최고 22R 기록`)
}

// ───────────────────────── 1e. 시작 사령관
console.log('\n[1e] 시작 사령관')
{
  const mk = (id: string, seed = 5) => { const s = R.newRun({ unlocked: [] }, seed); s.cmdChoices = [id]; R.pickCmd(s, id); return s }
  const lord = mk('lord')
  ok(lord.cmd === 'lord' && !lord.queue.length && R.slotsOf(lord) === 4 && lord.lives === 2 && lord.maxLives === 2, '군주: 배치 칸 +1, 생명 -1')
  const twin = mk('twin')
  twin.gold = 20; twin.shop = ['wolf', 'ranger']
  R.buy(twin, 0); R.buy(twin, 1)
  twin.shop = ['necromancer']; R.buy(twin, 0)
  ok(twin.units.filter(u => u.tpl === 'ranger').length === 2 && twin.units.filter(u => u.tpl === 'wolf').length <= 2 && twin.units.filter(u => u.tpl === 'necromancer').length === 1, '쌍둥이 술사: 1골드는 하나 더, 3골드는 그대로')
  const res = mk('resonator')
  const pr = RESONANCES.find(r => r.id === res.promise)!
  res.queue = ['augment']; R.rollAugs(res)
  const first = res.augChoices.find(a => pr.pair.includes(a))!
  R.pickAug(res, first)
  res.queue = ['augment']; R.rollAugs(res)
  const second = res.augChoices.find(a => pr.pair.includes(a))!
  const fresh = R.pickAug(res, second)
  ok(!!first && !!second && fresh.includes(pr.id) && !res.promise, `공명술사: ${AUG[first].name} → ${AUG[second].name}, 공명 ${pr.name} 켜짐`)
  const seer = mk('seer')
  R.rollAugs(seer)
  ok(seer.augChoices.length === 4 && seer.augRerolls === 2, '예언자: 선택지 4장, 새로고침 2회')
  const rec = mk('recruiter')
  rec.units = [{ id: 99, tpl: 'wolf', star: 1, items: [], pos: 0, bonus: 0 }]
  rec.gold = 5
  const e1 = R.useCmd(rec), e2 = R.useCmd(rec)
  ok(!e1 && e2 === '이번 라운드에 이미 썼습니다' && rec.gold === 4 && rec.shop.every(id => UNIT[id!].traits.includes('beast')), '징병관: 1골드로 주력 특성 상점, 라운드에 한 번')
  const mer = mk('merchant')
  mer.gold = 27; mer.after = true; mer.last = { win: true } as R.Summary
  mer.queue = ['reward']; mer.rewardChoices = [{ kind: 'gold', n: 0 }]
  R.pickReward(mer, 0)
  ok(mer.round === 2 && mer.gold === 27 + R.income(mer, true) + 2, '금화 상인: 골드 27 → 수입 + 이자 2')
}

// ───────────────────────── 1f. 위험도
console.log('\n[1f] 위험도')
{
  const heat = { tough: 2, affix: 1, boss: 1, lives: 1, shop: 1, income: 2, drought: 1, timer: 1 }
  const s = R.newRun({ unlocked: [], heat }, 21)
  ok(s.lives === 2 && s.shopSize === 4 && s.shop.length === 4 && R.rerollCost(s) === 2, '줄어든 생명·빈약한 상점: 생명 2, 상점 4칸, 새로고침 2골드')
  s.queue = []
  const b = R.buildBattle(s)
  const foe = b.fighters.find(f => f.side === 1)!
  ok(Math.abs(foe.maxHp / (foe.tpl.hp * s.wave.spawns[0].mult) - 1.2) < 0.01 && b.limit === 35, '단단한 적 2단계: 적 체력 ×1.2, 제한 시간 35초')
  ok(R.income(s, true) === R.income({ ...s, heat: {} }, true) - 2, '인색한 수입 2단계: 수입 -2')
  s.queue = ['augment']; R.rollAugs(s)
  ok(s.augChoices.length === 2, '증강체 가뭄: 선택지 2장')
  // 6라운드 일반 편성은 접두사 1명 이상, 10라운드 정예는 체력 ×1.4
  s.round = 5; s.after = true; s.last = { win: true } as R.Summary; s.queue = ['reward']; s.rewardChoices = [{ kind: 'gold', n: 0 }]
  R.pickReward(s, 0)
  ok(s.round === 6 && s.wave.kind === 'normal' && s.wave.spawns.some(sp => sp.aff), '정예의 행진: 6라운드 일반 편성에 접두사')
  const plain = R.newRun({ unlocked: [] }, 21)
  s.round = 9; s.after = true; s.queue = ['reward']; s.rewardChoices = [{ kind: 'gold', n: 0 }]
  R.pickReward(s, 0)
  plain.round = 10; plain.wave = makeWave(10, plain.rng, s.elites)
  ok(s.wave.kind === 'elite' && Math.abs(s.wave.spawns[0].mult / plain.wave.spawns[0].mult - 1.4) < 0.01, '극한의 정예: 정예 배율 ×1.4')
  const m = { ...M.loadMeta(), shards: 0, heatBest: 0 }
  s.over = 'win'; s.stats = { won: 10, elite: 2, bestHit: 0, fresh: 0 }
  const got = M.settle(m, s)
  ok(got === Math.round((10 + 4 + 10) * 2.5) && m.heatBest === 15, `정산: 위험도 15 → 별조각 ×2.5 (+${got}), 클리어 최고 위험도 기록`)
  const t = R.newRun({ unlocked: [], heat: { timer: 1 } }, 3)
  vs(t, 'dummy', 1); t.units = [{ id: 1, tpl: 'shieldbearer', star: 1, items: [], pos: 9, bonus: 0 }]
  const tb = R.buildBattle(t)
  while (!tb.done) tb.step(STEP)
  ok(!tb.win && tb.t < 36, `제한 시간: 허수아비를 못 잡으면 35초에 패배 (${tb.t.toFixed(1)}초)`)
}

// ───────────────────────── 1g. 아이템 조합
console.log('\n[1g] 아이템 조합')
{
  const s = R.newRun({ unlocked: [] }, 8)
  s.queue = []
  s.units = [{ id: 1, tpl: 'wolf', star: 1, items: ['sword'], pos: 0, bonus: 0 }]
  s.items = ['feather', 'dice', 'helm', 'charm']
  R.equip(s, 1, 1) // dice → 처형자의 검
  ok(s.units[0].items.join() === 'execblade' && s.items.join() === 'feather,helm,charm' && s.notes.some(n => n.includes('처형자의 검')), '대검 + 주사위 → 처형자의 검, 한 칸만 씀')
  R.equip(s, 0, 1); R.equip(s, 0, 1); R.equip(s, 0, 1)
  ok(s.units[0].items.join() === 'execblade,feather,bastion' && !s.items.length, '조합 뒤 빈 칸에 3개 더: 깃털 + 투구·부적 → 불굴의 성채')
  ok(combine(['sword', 'feather', 'dice']).join() === 'execblade,feather' && combine(['execblade', 'sword']).length === 2, '앞에서부터 합치고, 조합 아이템은 재료가 아님')
  ok(!ITEMS.some(i => COMBOS.includes(i)) && COMBOS.every(c => c.from!.every(x => ITEMS.some(i => i.id === x))), '조합 아이템은 전리품에 나오지 않고 재료는 모두 기본 아이템')
  // ★ 승급으로 합쳐질 때도 조합
  const m = R.newRun({ unlocked: [] }, 9)
  m.units = [{ id: 1, tpl: 'ranger', star: 1, items: ['feather'], pos: 0, bonus: 0 }, { id: 2, tpl: 'ranger', star: 1, items: ['dice'], pos: null, bonus: 0 }]
  R.addUnit(m, 'ranger', 1)
  ok(m.units.length === 1 && m.units[0].items.join() === 'quickdraw', '★ 승급하며 모인 깃털 + 주사위 → 신속의 화살')
  const base = run(vs(setup(5, [['apprentice', 2]]), 'dummy', 1), 12)
  const inf = run(vs(setup(5, [['apprentice', 2, ['infinity']]]), 'dummy', 1), 12)
  const c0 = of(base, 'apprentice').st.casts, c1 = of(inf, 'apprentice').st.casts, orig = c1 - (inf.counts.ring ?? 0)
  ok(c1 === orig * 3 && orig >= c0, `무한의 고리: 원본 ${orig}회 → 총 ${c1}회 (3배)`)
  const bas = run(vs(setup(8, [['bear', 1, ['bastion']]]), 'brute', 4), 20)
  ok(of(bas, 'bear').st.bastion === 1, '불굴의 성채: 보호막이 깨지면 한 번 다시')
}

// ───────────────────────── 1h. ★3 진화
console.log('\n[1h] ★3 진화')
{
  const fired: string[] = [], better: string[] = []
  for (const [id, e] of Object.entries(EVOS)) {
    const evo = run(vs(setup(10, [[id, 3, [e.item]]]), 'brute', 6, 4), 20)
    const plain = run(vs(setup(10, [[id, 3]]), 'brute', 6, 4), 20)
    const f = of(evo, id)
    if (f.tpl.skillName === e.name && (f.st.casts ?? 0) > 0) fired.push(id)
    if (evo.fighters.filter(x => x.side === 1 && !x.alive).length >= plain.fighters.filter(x => x.side === 1 && !x.alive).length) better.push(id)
  }
  ok(fired.length === Object.keys(EVOS).length, `16종 모두 진화 스킬 발동 (${fired.length}/${Object.keys(EVOS).length})`)
  ok(better.length >= 14, `진화하면 대개 더 많이 쓰러뜨림 (${better.length}/16)`)
  const s = R.newRun({ unlocked: [] }, 4)
  s.units = [
    { id: 1, tpl: 'golem', star: 2, items: ['bastion'], pos: 0, bonus: 0 },
    { id: 2, tpl: 'golem', star: 2, items: [], pos: null, bonus: 0 },
    { id: 3, tpl: 'golem', star: 1, items: [], pos: null, bonus: 0 }, { id: 4, tpl: 'golem', star: 1, items: [], pos: null, bonus: 0 },
  ]
  R.addUnit(s, 'golem', 1)
  ok(s.units.length === 1 && s.units[0].star === 3 && !!R.evoOf(s.units[0]) && s.notes.some(n => n.includes('대지 분쇄')), '★3 승급 순간 조합 아이템(성채 ← 투구)으로 진화, 알림')
  ok(!R.evoOf({ tpl: 'golem', star: 2, items: ['helm'] }) && !R.evoOf({ tpl: 'golem', star: 3, items: ['sword'] }), '★2이거나 짝 아이템이 아니면 진화 없음')
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
