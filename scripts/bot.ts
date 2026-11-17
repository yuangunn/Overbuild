// 봇 플레이어: scripts/sim.ts(완주 검증)와 scripts/levels.ts(라운드별 통계)가 같이 쓴다.
import * as R from '../src/core/run.ts'
import { UNIT } from '../src/core/data/units.ts'
import { AUG, RESONANCES } from '../src/core/data/augments.ts'

export const val = (u: R.OwnedUnit) => UNIT[u.tpl].cost * 3 ** (u.star - 1)

export function botTurn(s: R.RunState, smart: boolean) {
  const top = R.synergies(s).slice(0, 2).map(x => x.id)
  // 지휘 레벨: 3라운드부터 골드 12 넘게 남으면 경험치를 산다 (배치 칸이 다 찬 경우만)
  // 무작위 봇은 골드 10 넘으면 한 번만
  if (smart) while (s.round >= 3 && s.gold >= 12 && R.boardOf(s).length >= R.slotsOf(s) && !R.buyXp(s)) { /* 산다 */ }
  else if (!smart && s.gold >= 10) R.buyXp(s)
  if (smart && s.cmd === 'recruiter' && s.round >= 2 && s.gold >= 6) R.useCmd(s)
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

export function botPick(s: R.RunState, smart: boolean) {
  while (s.queue.length && !s.over) {
    if (s.queue[0] === 'commander') R.pickCmd(s, s.cmdChoices![0]) // 섞여 나오므로 사령관별 통계가 고르게 쌓인다
    else if (s.queue[0] === 'augment') {
      const c = s.augChoices
      const score = (id: string) => (RESONANCES.some(r => r.pair.includes(id) && r.pair.every(p => p === id || s.augments.includes(p))) ? 10 : 0) + AUG[id].rarity
      R.pickAug(s, smart ? [...c].sort((a, b) => score(b) - score(a))[0] : c[0])
    } else {
      const i = s.rewardChoices.findIndex(r => r.kind === 'unit' || r.kind === 'train')
      R.pickReward(s, smart ? Math.max(0, i) : 0)
    }
  }
}

export function bot(seed: number, smart: boolean, unlocked: string[] = []) {
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

