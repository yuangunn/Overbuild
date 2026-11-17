// 레벨 디자인 통계: node scripts/levels.ts [판 수]
// 봇 두 종류 × 해금 없음/전부 해금으로 원정을 돌려 라운드별 승률·전투 시간·여유(남은 체력)·전력비를 낸다.
import * as R from '../src/core/run.ts'
import type { Battle, Fighter, Side } from '../src/core/battle.ts'
import { UNLOCKS } from '../src/core/meta.ts'
import { botPick, botTurn } from './bot.ts'

const N = +((globalThis as { process?: { argv: string[] } }).process?.argv[2] ?? 300)
const ALL = UNLOCKS.map(u => u.id)

// 전력 = 유효 체력(보호막·방어 포함) × 초당 기본 공격 피해(치명 기대값 포함). 스킬은 빠진 근사치.
function power(b: Battle, side: Side) {
  let ehp = 0, dps = 0
  for (const f of b.fighters as Fighter[]) {
    if (f.side !== side || !f.alive) continue
    ehp += (f.maxHp + f.shield) * (1 + Math.max(0, f.armor) / 100)
    dps += f.atk * b.atkSpeed(f) * b.dmgMul(f) * (1 + Math.min(1, f.crit) * (f.critDmg - 1))
  }
  return { ehp, dps }
}

interface Row { n: number; win: number; t: number[]; margin: number[]; ot: number; ratio: number[]; gold: number[]; board: number[]; lv: number[]; star: number[]; augs: number[]; foeDmg: Record<string, number> }
const row = (): Row => ({ n: 0, win: 0, t: [], margin: [], ot: 0, ratio: [], gold: [], board: [], lv: [], star: [], augs: [], foeDmg: {} })
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }

function play(smart: boolean, unlocked: string[]) {
  const rows: Record<number, Row> = {}
  const ends: Record<string, number> = {}
  const enc: Record<string, { n: number; win: number; t: number[]; caught: number; fled: number }> = {}
  let clears = 0, lives = 0
  for (let i = 0; i < N; i++) {
    const s = R.newRun({ unlocked }, 5000 + i)
    for (let g = 0; g < 40 && !s.over; g++) {
      botPick(s, smart)
      if (s.over) break
      botTurn(s, smart)
      const r = s.round
      const x = (rows[r] ??= row())
      x.gold.push(s.gold)
      x.board.push(R.boardOf(s).length)
      x.lv.push(R.levelOf(s.xp).lv)
      x.star.push(avg(R.boardOf(s).map(u => u.star)))
      x.augs.push(s.augments.length)
      const b = R.buildBattle(s)
      const me = power(b, 0), foe = power(b, 1)
      x.ratio.push((me.ehp * me.dps) / Math.max(1, foe.ehp * foe.dps))
      const sum = R.endBattle(s, b)
      x.n++
      if (sum.win) x.win++
      x.t.push(sum.time)
      if (sum.time > 30) x.ot++
      x.margin.push(b.hpFrac(sum.win ? 0 : 1))
      for (const f of b.fighters) if (f.side === 1) x.foeDmg[f.tpl.id] = (x.foeDmg[f.tpl.id] ?? 0) + f.dealt
      const e = (enc[sum.label] ??= { n: 0, win: 0, t: [], caught: 0, fled: 0 })
      e.n++; if (sum.win) e.win++; e.t.push(sum.time)
      e.caught += sum.counts.treasure ?? 0; e.fled += sum.counts.escaped ?? 0
    }
    ends[s.over === 'win' ? 'clear' : s.round] = (ends[s.over === 'win' ? 'clear' : s.round] ?? 0) + 1
    if (s.over === 'win') { clears++; lives += s.lives }
  }
  return { rows, ends, clears, lives, enc }
}

const f1 = (v: number) => v.toFixed(1)
for (const [smart, unlocked, name] of [[false, [], '무작위 봇 · 해금 없음'], [true, [], '공명 봇 · 해금 없음'], [true, ALL, '공명 봇 · 전부 해금']] as const) {
  const { rows, ends, clears, lives, enc } = play(smart, [...unlocked])
  console.log(`\n■ ${name} — ${N}판, 클리어 ${clears} (${Math.round((clears / N) * 100)}%), 클리어 때 남은 생명 평균 ${f1(lives / Math.max(1, clears))}`)
  console.log(`  종료: ${Object.entries(ends).map(([k, v]) => `${k}:${v}`).join(' ')}`)
  console.log('  R   시도  승률   전투(평균/p90)  30초+  여유(승자 남은 체력)  전력비(중앙)  골드  배치  Lv   ★평균  증강  가장 아픈 적')
  for (const [r, x] of Object.entries(rows)) {
    const top = Object.entries(x.foeDmg).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${Math.round((v / x.n) | 0)}`).join(', ')
    console.log(`  ${r.padStart(2)}  ${String(x.n).padStart(4)}  ${String(Math.round((x.win / x.n) * 100)).padStart(3)}%   ${f1(avg(x.t)).padStart(5)} / ${f1(pct(x.t, 0.9)).padStart(5)}   ${String(Math.round((x.ot / x.n) * 100)).padStart(3)}%   ${String(Math.round(avg(x.margin) * 100)).padStart(3)}%                 ${f1(pct(x.ratio, 0.5)).padStart(6)}     ${f1(avg(x.gold)).padStart(4)}  ${f1(avg(x.board)).padStart(4)}  ${f1(avg(x.lv))}  ${avg(x.star).toFixed(2)}  ${f1(avg(x.augs))}   ${top}`)
  }
  console.log('  편성별: ' + Object.entries(enc).sort((a, b) => a[1].win / a[1].n - b[1].win / b[1].n).map(([k, e]) => `${k} ${e.n}회 ${Math.round((e.win / e.n) * 100)}% ${f1(avg(e.t))}초${e.caught + e.fled ? ` 보물 ${e.caught}/${e.caught + e.fled}` : ''}`).join(' | '))
}
