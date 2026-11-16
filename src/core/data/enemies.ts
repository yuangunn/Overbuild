// 적 유닛과 라운드별 웨이브. 난이도 곡선은 enemyMult 하나로 조절한다.
import type { Fighter, Side } from '../battle.ts'
import type { UnitTpl } from './units.ts'
import { pick, shuffle, type Rng } from '../rng.ts'

const foe = (f: Fighter) => (1 - f.side) as Side
const E = (o: Omit<UnitTpl, 'cost' | 'traits' | 'skillName' | 'skillDesc'> & Partial<UnitTpl>): UnitTpl =>
  ({ cost: 0, traits: [], skillName: '', skillDesc: '', ...o })

export const ENEMIES: Record<string, UnitTpl> = {
  slime: E({ id: 'slime', name: '슬라임', emoji: '🟢', hp: 420, atk: 34, as: 0.7, range: 1, armor: 5, mana: 0 }),
  goblin: E({ id: 'goblin', name: '고블린', emoji: '👺', hp: 360, atk: 40, as: 0.95, range: 1, armor: 5, mana: 0 }),
  thrower: E({ id: 'thrower', name: '고블린 투척수', emoji: '🪃', hp: 300, atk: 42, as: 0.7, range: 3, armor: 0, mana: 0 }),
  orc: E({
    id: 'orc', name: '오크 전사', emoji: '👹', hp: 800, atk: 55, as: 0.65, range: 1, armor: 30, mana: 80,
    skillName: '강타', skillDesc: '대상에게 공격력 250% 피해, 1.2초 기절.',
    skill(b, f) {
      const t = f.target
      if (!t?.alive) return
      b.damage(f, t, f.atk * 2.5, { kind: 'skill' })
      t.stunT = Math.max(t.stunT, 1.2)
    },
  }),
  bat: E({
    id: 'bat', name: '박쥐', emoji: '🦇', hp: 340, atk: 45, as: 1.0, range: 1, armor: 5, mana: 100, startMana: 100,
    skillName: '급습', skillDesc: '적 후열로 날아간다.',
    skill(b, f) {
      const t = b.backline(foe(f))
      if (!t) return
      b.teleport(f, Math.max(0.3, t.x - 0.7), t.y)
      f.target = t
      f.retarget = 3
    },
  }),
  shaman: E({
    id: 'shaman', name: '도마뱀 주술사', emoji: '🦎', hp: 420, atk: 34, as: 0.7, range: 3, armor: 10, mana: 70,
    skillName: '치유', skillDesc: '체력 비율이 가장 낮은 아군을 공격력 500%만큼 치유.',
    skill(b, f) { const a = b.lowest(f.side); if (a) { b.heal(a, f.atk * 5); b.emit({ k: 'ring', x: a.x, y: a.y, r: 0.8, color: '#9dffb0', style: 'holy' }) } },
  }),
  skelarcher: E({ id: 'skelarcher', name: '해골 궁수', emoji: '☠️', hp: 420, atk: 50, as: 0.75, range: 4, armor: 10, mana: 0 }),
  demon: E({
    id: 'demon', name: '악마 병사', emoji: '👿', hp: 950, atk: 70, as: 0.75, range: 1, armor: 35, mana: 70,
    skillName: '지옥불', skillDesc: '주변 적에게 공격력 200% 피해.',
    skill(b, f) {
      for (const e of b.inRadius(f.x, f.y, 1.5, foe(f))) b.damage(f, e, f.atk * 2, { kind: 'skill' })
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.5, color: '#ff5252', style: 'fire' })
    },
  }),
  spider: E({
    id: 'spider', name: '독거미', emoji: '🕷️', hp: 650, atk: 55, as: 0.75, range: 3, armor: 15, mana: 60,
    skillName: '거미줄', skillDesc: '대상에게 공격력 150% 피해, 2초 기절.',
    skill(b, f) {
      const t = f.target
      if (!t?.alive) return
      b.damage(f, t, f.atk * 1.5, { kind: 'skill' })
      t.stunT = Math.max(t.stunT, 2)
    },
  }),
  troll: E({
    id: 'troll', name: '트롤 족장', emoji: '🧌', size: 0.95, hp: 3800, atk: 110, as: 0.7, range: 1, armor: 40, mana: 80,
    skillName: '대지 분쇄', skillDesc: '주변 적에게 공격력 220% 피해, 1초 기절.',
    skill(b, f) {
      for (const e of b.inRadius(f.x, f.y, 2, foe(f))) { b.damage(f, e, f.atk * 2.2, { kind: 'skill' }); e.stunT = Math.max(e.stunT, 1) }
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 2, color: '#a1887f', style: 'earth' })
      b.emit({ k: 'shake', v: 6 })
    },
  }),
  scorpion: E({
    id: 'scorpion', name: '심연 전갈', emoji: '🦂', size: 0.95, hp: 3800, atk: 115, as: 0.8, range: 1, armor: 50, mana: 60,
    skillName: '독침', skillDesc: '대상에게 공격력 300% 피해, 주변 적 둔화.',
    skill(b, f) {
      const t = f.target
      if (!t?.alive) return
      b.damage(f, t, f.atk * 3, { kind: 'skill' })
      for (const e of b.inRadius(t.x, t.y, 2, foe(f))) e.slowT = 3
      b.emit({ k: 'ring', x: t.x, y: t.y, r: 2, color: '#b2ff59', style: 'poison' })
    },
  }),
  boss: E({
    id: 'boss', name: '심연의 군주', emoji: '😈', boss: true, hp: 8500, atk: 120, as: 0.7, range: 1.5, armor: 60, mana: 60,
    skillName: '멸망의 파동', skillDesc: '모든 적에게 최대 체력 18% + 공격력 50% 피해. 체력 66%·33%에서 격노하며 악마를 부른다.',
    skill(b, f) {
      for (const e of b.alive(foe(f))) b.damage(f, e, e.maxHp * 0.18 + f.atk * 0.5, { kind: 'skill' })
      b.banner('멸망의 파동', '#ff4d6d')
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 9, color: '#ff4d6d', style: 'dark' })
      b.emit({ k: 'shake', v: 10 })
    },
    own: () => [{
      id: 'phase',
      onDamaged(b, f) {
        const ph = f.st.phase ?? 0
        const th = [0.66, 0.33][ph]
        if (th === undefined || f.hp >= f.maxHp * th) return
        f.st.phase = ph + 1
        f.asBonus += 0.35
        b.banner('심연의 군주가 격노한다!', '#ff4d6d')
        const d = ENEMIES.demon
        for (let i = 0; i < 2; i++) b.summon(f.side, d, f.x - 0.8, f.y + (i ? 0.8 : -0.8), { maxHp: d.hp * f.st.mult, atk: d.atk * f.st.mult })
      },
    }],
  }),
}

export interface Spawn { tpl: string; cell: number; mult: number }
export interface Wave { label: string; kind: 'normal' | 'elite' | 'boss'; spawns: Spawn[] }

// ponytail: 난이도 곡선은 이 한 줄. scripts/sim.ts 결과 보고 조절.
export const enemyMult = (r: number) => 1 + 0.3 * (r - 1) + 0.03 * (r - 1) ** 2

const POOLS = [['slime', 'goblin', 'thrower'], ['goblin', 'orc', 'bat', 'shaman', 'skelarcher'], ['orc', 'demon', 'spider', 'bat', 'skelarcher', 'shaman']]
const ZONE = ['고블린 숲', '망자의 폐허', '심연의 문']
const COUNT = [2, 3, 3, 4, 0, 4, 5, 5, 6, 0, 6, 7, 7, 8, 0]

export function makeWave(r: number, rng: Rng): Wave {
  const m = enemyMult(r)
  const used = new Set<number>()
  // 적 칸: col 0 = 전열, 2 = 후열
  const S = (tpl: string, col = ENEMIES[tpl].range >= 3 ? 2 : 0): Spawn => {
    for (const c of [col, 1, 2 - col]) {
      for (const row of shuffle(rng, [0, 1, 2, 3])) {
        const cell = c * 4 + row
        if (!used.has(cell)) { used.add(cell); return { tpl, cell, mult: m } }
      }
    }
    return { tpl, cell: 0, mult: m }
  }
  if (r >= 15) return { label: '최종 보스 · 심연의 군주', kind: 'boss', spawns: [S('boss', 1), S('demon'), S('demon'), S('shaman')] }
  if (r === 5) return { label: '정예 · 트롤 족장', kind: 'elite', spawns: [S('troll'), S('goblin'), S('goblin'), S('thrower')] }
  if (r === 10) return { label: '정예 · 심연 전갈', kind: 'elite', spawns: [S('scorpion'), S('orc'), S('spider'), S('skelarcher')] }
  const z = r < 5 ? 0 : r < 10 ? 1 : 2
  return { label: ZONE[z], kind: 'normal', spawns: Array.from({ length: COUNT[r - 1] }, () => S(pick(rng, POOLS[z]))) }
}
