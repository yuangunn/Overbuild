// 아군 유닛 데이터. 새 유닛 = 이 배열에 객체 하나 추가.
import type { Battle, Fighter, Mod, Side } from '../battle.ts'

export type TraitId = 'guard' | 'arcane' | 'hunter' | 'shadow' | 'undead' | 'beast'

export interface UnitTpl {
  id: string
  name: string
  emoji: string
  cost: number // 상점 가격 = 등급 (적·소환수는 0)
  traits: TraitId[]
  hp: number
  atk: number
  as: number // 초당 공격
  range: number // 칸
  armor: number
  mana: number // 0이면 스킬 없음
  startMana?: number
  crit?: number
  speed?: number
  size?: number
  boss?: boolean
  locked?: boolean // 영구 성장으로 해금
  skillName: string
  skillDesc: string
  skill?: (b: Battle, f: Fighter) => void
  own?: () => Mod[] // 고유 패시브
}

const foe = (f: Fighter) => (1 - f.side) as Side
const aim = (b: Battle, f: Fighter) => (f.target?.alive ? f.target : b.nearest(f.x, f.y, foe(f)))
const fwd = (f: Fighter) => (f.side === 0 ? 1 : -1)

const summonTpl = (id: string, name: string, emoji: string, traits: TraitId[]): UnitTpl =>
  ({ id, name, emoji, cost: 0, traits, hp: 1, atk: 1, as: 0.8, range: 1, armor: 15, mana: 0, skillName: '', skillDesc: '' })

export const SKELETON = summonTpl('skeleton', '해골 졸개', '🦴', ['undead'])
export const SPIRIT = summonTpl('spirit', '원혼', '👻', ['undead'])
export const SHADE = summonTpl('shade', '그림자 분신', '👥', ['shadow'])

export const UNITS: UnitTpl[] = [
  // ── 1골드
  {
    id: 'shieldbearer', name: '방패병', emoji: '🛡️', cost: 1, traits: ['guard', 'beast'],
    hp: 700, atk: 45, as: 0.7, range: 1, armor: 35, mana: 80, startMana: 20,
    skillName: '방벽', skillDesc: '최대 체력 45% 보호막을 얻고 주변 적을 도발한다.',
    skill(b, f) {
      f.shield += f.maxHp * 0.45
      for (const e of b.inRadius(f.x, f.y, 2.5, foe(f))) { e.target = f; e.retarget = 2.5 }
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 2.5, color: '#7fb4ff', style: 'shield' })
    },
  },
  {
    id: 'apprentice', name: '불꽃 견습생', emoji: '🧙', cost: 1, traits: ['arcane', 'hunter'],
    hp: 450, atk: 45, as: 0.7, range: 3, armor: 10, mana: 60,
    skillName: '화염구', skillDesc: '대상에게 공격력 300%, 주변 적에게 120% 피해.',
    skill(b, f) {
      const t = aim(b, f)
      if (!t) return
      b.emit({ k: 'shot', x1: f.x, y1: f.y, x2: t.x, y2: t.y, color: '#ff9d3c', style: 'fire' })
      for (const e of b.inRadius(t.x, t.y, 1.2, foe(f))) b.damage(f, e, f.atk * (e === t ? 3 : 1.2), { kind: 'skill' })
      b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.2, color: '#ff9d3c', style: 'fire' })
    },
  },
  {
    id: 'ranger', name: '숲 사냥꾼', emoji: '🏹', cost: 1, traits: ['hunter', 'beast'],
    hp: 480, atk: 48, as: 0.8, range: 4, armor: 10, mana: 70,
    skillName: '속사', skillDesc: '4초 동안 공격 속도 +120%.',
    skill(_b, f) { f.buffs.push({ t: 4, as: 1.2 }) },
  },
  {
    id: 'cutthroat', name: '그림자 칼잡이', emoji: '🗡️', cost: 1, traits: ['shadow', 'undead'],
    hp: 520, atk: 55, as: 0.8, range: 1, armor: 15, mana: 50, crit: 0.2,
    skillName: '급소 찌르기', skillDesc: '대상에게 공격력 220% 확정 치명타.',
    skill(b, f) { const t = aim(b, f); if (t) b.damage(f, t, f.atk * 2.2, { kind: 'skill', force: true }) },
  },
  {
    id: 'skeleton_w', name: '해골 병사', emoji: '💀', cost: 1, traits: ['guard', 'undead'],
    hp: 650, atk: 42, as: 0.7, range: 1, armor: 30, mana: 70,
    skillName: '뼈 갑옷', skillDesc: '체력 30% 회복, 4초간 방어력 +60.',
    skill(b, f) { b.heal(f, f.maxHp * 0.3); f.buffs.push({ t: 4, armor: 60 }); b.emit({ k: 'ring', x: f.x, y: f.y, r: 0.8, color: '#9dffb0', style: 'holy' }) },
  },
  // ── 2골드
  {
    id: 'wolf', name: '그림자 늑대', emoji: '🐺', cost: 2, traits: ['beast', 'shadow'],
    hp: 620, atk: 60, as: 0.85, range: 1, armor: 20, mana: 60, crit: 0.15,
    skillName: '사냥 본능', skillDesc: '체력 비율이 가장 낮은 적에게 도약해 공격력 260% 피해 (치명 가능).',
    skill(b, f) {
      const t = b.lowest(foe(f))
      if (!t) return
      b.teleport(f, t.x - fwd(f) * 0.6, t.y)
      f.target = t
      f.retarget = 3
      b.damage(f, t, f.atk * 2.6, { kind: 'skill', canCrit: true })
    },
  },
  {
    id: 'frostwitch', name: '서리 마녀', emoji: '❄️', cost: 2, traits: ['arcane', 'undead'],
    hp: 520, atk: 50, as: 0.7, range: 3, armor: 15, mana: 75,
    skillName: '눈보라', skillDesc: '대상 주변 적에게 공격력 220% 피해, 2.5초 둔화.',
    skill(b, f) {
      const t = aim(b, f)
      if (!t) return
      for (const e of b.inRadius(t.x, t.y, 1.6, foe(f))) { b.damage(f, e, f.atk * 2.2, { kind: 'skill' }); e.slowT = 2.5 }
      b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.6, color: '#8fe3ff', style: 'ice' })
    },
  },
  {
    id: 'sniper', name: '저격수', emoji: '🎯', cost: 2, traits: ['hunter', 'shadow'],
    hp: 480, atk: 70, as: 0.65, range: 6, armor: 10, mana: 70, crit: 0.15,
    skillName: '저격', skillDesc: '체력 비율이 가장 낮은 적에게 공격력 450% 피해 (치명 가능).',
    skill(b, f) {
      const t = b.lowest(foe(f))
      if (!t) return
      b.emit({ k: 'shot', x1: f.x, y1: f.y, x2: t.x, y2: t.y, color: '#fff176', style: 'snipe' })
      b.damage(f, t, f.atk * 4.5, { kind: 'skill', canCrit: true })
    },
  },
  {
    id: 'golem', name: '룬 골렘', emoji: '🗿', cost: 2, traits: ['guard', 'arcane'],
    hp: 900, atk: 50, as: 0.6, range: 1, armor: 45, mana: 90, startMana: 30,
    skillName: '대지 강타', skillDesc: '주변 적에게 공격력 180% 피해, 1.5초 기절.',
    skill(b, f) {
      for (const e of b.inRadius(f.x, f.y, 1.5, foe(f))) { b.damage(f, e, f.atk * 1.8, { kind: 'skill' }); e.stunT = Math.max(e.stunT, 1.5) }
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.5, color: '#c9a36b', style: 'earth' })
      b.emit({ k: 'shake', v: 4 })
    },
  },
  // ── 3골드
  {
    id: 'necromancer', name: '강령술사', emoji: '🧟', cost: 3, traits: ['undead', 'arcane'],
    hp: 650, atk: 60, as: 0.7, range: 3, armor: 15, mana: 80, startMana: 20,
    skillName: '해골 소환', skillDesc: '해골 졸개 (1+★)기를 소환한다.',
    skill(b, f) {
      for (let i = 0; i <= f.star; i++) {
        b.summon(f.side, SKELETON, f.x + fwd(f) * 0.9, f.y + (i - f.star / 2) * 0.6, { maxHp: f.maxHp * 0.45, atk: f.atk * 0.55 })
      }
    },
  },
  {
    id: 'bear', name: '곰 전사', emoji: '🐻', cost: 3, traits: ['beast', 'guard'],
    hp: 1100, atk: 75, as: 0.75, range: 1, armor: 40, mana: 90,
    skillName: '포효', skillDesc: '주변 적에게 공격력 200% 피해, 아군 전체 공격 속도 +35% (4초).',
    skill(b, f) {
      for (const e of b.inRadius(f.x, f.y, 1.6, foe(f))) b.damage(f, e, f.atk * 2, { kind: 'skill' })
      for (const a of b.alive(f.side)) a.buffs.push({ t: 4, as: 0.35 })
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.6, color: '#ffb74d', style: 'roar' })
      b.emit({ k: 'shake', v: 5 })
    },
  },
  {
    id: 'stormcaller', name: '폭풍 마도사', emoji: '⚡', cost: 3, traits: ['arcane', 'hunter'],
    hp: 600, atk: 70, as: 0.75, range: 4, armor: 15, mana: 80,
    skillName: '연쇄 번개', skillDesc: '번개가 적 사이를 (4+★)번 튕기며 공격력 220% 피해.',
    skill(b, f) {
      let cur = aim(b, f)
      const hit = new Set<Fighter>()
      let px = f.x, py = f.y, dmg = f.atk * 2.2
      for (let i = 0; i < 4 + f.star && cur; i++) {
        hit.add(cur)
        b.emit({ k: 'line', x1: px, y1: py, x2: cur.x, y2: cur.y, color: '#9be7ff' })
        b.damage(f, cur, dmg, { kind: 'skill' })
        px = cur.x; py = cur.y; dmg *= 0.9
        cur = b.nearest(px, py, foe(f), e => !hit.has(e), 3)
      }
    },
  },
  {
    id: 'bladedancer', name: '칼날 춤꾼', emoji: '🌀', cost: 3, traits: ['shadow', 'beast'],
    hp: 800, atk: 80, as: 0.85, range: 1, armor: 25, mana: 70, crit: 0.2,
    skillName: '칼날 폭풍', skillDesc: '2초간 주변 적에게 8번 공격력 75% 피해 (치명 가능).',
    skill(b, f) {
      for (let k = 0; k < 8; k++) {
        b.later(k * 0.25, () => {
          if (!f.alive) return
          for (const e of b.inRadius(f.x, f.y, 1.4, foe(f))) b.damage(f, e, f.atk * 0.75, { kind: 'skill', canCrit: true })
          b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.4, color: '#ff6fae', style: 'blade' })
        })
      }
    },
  },
  // ── 해금 유닛
  {
    id: 'phoenix', name: '불사조', emoji: '🔥', cost: 3, traits: ['arcane', 'undead'], locked: true,
    hp: 700, atk: 70, as: 0.7, range: 3, armor: 20, mana: 90,
    skillName: '화염 폭풍', skillDesc: '모든 적에게 공격력 130% 피해. 처음 쓰러지면 체력을 모두 회복하며 되살아나 폭발한다.',
    skill(b, f) {
      for (const e of b.alive(foe(f))) {
        b.emit({ k: 'ring', x: e.x, y: e.y, r: 0.7, color: '#ff7043', style: 'fire' })
        b.damage(f, e, f.atk * 1.3, { kind: 'skill' })
      }
      b.emit({ k: 'shake', v: 4 })
    },
    own: () => [{
      id: 'rebirth',
      onLethal(b, f) {
        if (f.st.reborn) return false
        f.st.reborn = 1
        f.hp = f.maxHp
        b.count('rebirth', f)
        b.banner('불사조 부활!', '#ffb74d')
        for (const e of b.inRadius(f.x, f.y, 2, foe(f))) b.damage(f, e, f.atk * 3, { kind: 'skill' })
        b.emit({ k: 'ring', x: f.x, y: f.y, r: 2, color: '#ff7043', style: 'fire' })
        return true
      },
    }],
  },
  {
    id: 'dragonknight', name: '용기사', emoji: '🐲', cost: 3, traits: ['guard', 'beast'], locked: true,
    hp: 1200, atk: 80, as: 0.7, range: 1, armor: 45, mana: 100,
    skillName: '용의 숨결', skillDesc: '앞쪽 넓은 범위에 공격력 260% 피해, 자신에게 체력 30% 보호막.',
    skill(b, f) {
      const cx = f.x + fwd(f) * 1.2
      for (const e of b.inRadius(cx, f.y, 1.8, foe(f))) b.damage(f, e, f.atk * 2.6, { kind: 'skill' })
      f.shield += f.maxHp * 0.3
      b.emit({ k: 'ring', x: cx, y: f.y, r: 1.8, color: '#ff8a3d', style: 'fire' })
    },
  },
  {
    id: 'shadowlord', name: '그림자 군주', emoji: '👤', cost: 3, traits: ['shadow', 'undead'], locked: true,
    hp: 750, atk: 85, as: 0.8, range: 1, armor: 20, mana: 80, crit: 0.25,
    skillName: '분신술', skillDesc: '자신의 능력치 50%를 가진 그림자 분신 2기를 소환한다.',
    skill(b, f) {
      for (let i = 0; i < 2; i++) {
        b.summon(f.side, SHADE, f.x, f.y + (i ? 0.6 : -0.6), { maxHp: f.maxHp * 0.5, atk: f.atk * 0.5, as: f.as, crit: f.crit, critDmg: f.critDmg })
      }
    },
  },
]

export const UNIT: Record<string, UnitTpl> = Object.fromEntries(UNITS.map(u => [u.id, u]))
