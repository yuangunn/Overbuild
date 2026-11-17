// ★3 진화: ★3 유닛이 정해진 아이템(또는 그 아이템이 재료인 조합 아이템)을 들면 스킬이 바뀐다
// (Vampire Survivors에서 최대 레벨 무기 + 짝 아이템이면 진화하는 것처럼).
import type { Battle, Fighter, Mod, Side } from '../battle.ts'
import { SHADE, SKELETON } from './units.ts'

export interface EvoDef { item: string; name: string; desc: string; skill: (b: Battle, f: Fighter) => void; own?: () => Mod[] }

const foe = (f: Fighter) => (1 - f.side) as Side
const aim = (b: Battle, f: Fighter) => (f.target?.alive ? f.target : b.nearest(f.x, f.y, foe(f)))
const fwd = (f: Fighter) => (f.side === 0 ? 1 : -1)

function fireball(b: Battle, f: Fighter, t: Fighter) {
  b.emit({ k: 'shot', x1: f.x, y1: f.y, x2: t.x, y2: t.y, color: '#ff9d3c', style: 'fire' })
  for (const e of b.inRadius(t.x, t.y, 1.2, foe(f))) b.damage(f, e, f.atk * (e === t ? 3 : 1.2), { kind: 'skill' })
  b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.2, color: '#ff9d3c', style: 'fire' })
}

export const EVOS: Record<string, EvoDef> = {
  shieldbearer: {
    item: 'helm', name: '철벽 요새', desc: '자신은 최대 체력 70%, 아군 전체는 각자 30% 보호막. 넓게 도발한다.',
    skill(b, f) {
      f.shield += f.maxHp * 0.7
      for (const a of b.alive(f.side)) if (a !== f) a.shield += a.maxHp * 0.3
      for (const e of b.inRadius(f.x, f.y, 3.5, foe(f))) { e.target = f; e.retarget = 3 }
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 3.5, color: '#7fb4ff', style: 'shield' })
    },
  },
  apprentice: {
    item: 'rune', name: '유성우', desc: '서로 다른 적 셋에게 화염구 (대상 300%, 주변 120%).',
    skill(b, f) {
      const first = aim(b, f)
      if (!first) return
      const ts = [first, ...b.nearestN(first.x, first.y, foe(f), 2, 9, first)]
      ts.forEach((t, i) => b.later(i * 0.15, () => { if (f.alive && t.alive) fireball(b, f, t) }))
    },
  },
  ranger: {
    item: 'feather', name: '화살 폭풍', desc: '6초 동안 공격 속도 +200%, 기본 공격마다 근처 다른 적에게 60% 화살.',
    skill(b, f) { f.buffs.push({ t: 6, as: 2 }); f.st.storm = b.t + 6 },
    own: () => [{
      id: 'arrowstorm',
      onAttack(b, f, t) {
        if (!(b.t < (f.st.storm ?? 0))) return
        const o = b.nearest(t.x, t.y, t.side, e => e !== t, 2.5)
        if (!o) return
        b.emit({ k: 'shot', x1: f.x, y1: f.y, x2: o.x, y2: o.y, color: '#b6f36b' })
        b.damage(f, o, f.atk * 0.6, { kind: 'proc' })
      },
    }],
  },
  cutthroat: {
    item: 'dice', name: '암살', desc: '대상에게 공격력 300% 확정 치명타. 처치하면 마나가 다시 가득 찬다.',
    skill(b, f) {
      const t = aim(b, f)
      if (!t) return
      b.damage(f, t, f.atk * 3, { kind: 'skill', force: true })
      if (!t.alive && (f.st.chain = (f.st.chain ?? 0) + 1) <= 6) { f.mana = f.maxMana; b.label(f, '연쇄 암살!', '#ff6fae') }
    },
  },
  skeleton_w: {
    item: 'charm', name: '불멸의 뼈', desc: '체력 50% 회복, 6초간 방어력 +100. 주변 아군도 체력 20% 회복.',
    skill(b, f) {
      b.heal(f, f.maxHp * 0.5)
      f.buffs.push({ t: 6, armor: 100 })
      for (const a of b.inRadius(f.x, f.y, 2, f.side)) if (a !== f) b.heal(a, a.maxHp * 0.2)
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 2, color: '#9dffb0', style: 'holy' })
    },
  },
  wolf: {
    item: 'fang', name: '피의 사냥', desc: '가장 약한 적에게 도약해 공격력 260% (치명 가능). 처치하면 다음 적에게 다시 도약 (3번까지).',
    skill(b, f) {
      for (let i = 0; i < 3; i++) {
        const t = b.lowest(foe(f))
        if (!t || !f.alive) return
        b.teleport(f, t.x - fwd(f) * 0.6, t.y)
        f.target = t
        f.retarget = 3
        b.damage(f, t, f.atk * 2.6, { kind: 'skill', canCrit: true })
        if (t.alive) return
      }
    },
  },
  frostwitch: {
    item: 'crystal', name: '절대 영도', desc: '대상 주변 넓게 공격력 220% 피해, 2초 빙결.',
    skill(b, f) {
      const t = aim(b, f)
      if (!t) return
      for (const e of b.inRadius(t.x, t.y, 2.4, foe(f))) { b.damage(f, e, f.atk * 2.2, { kind: 'skill' }); e.stunT = Math.max(e.stunT, 2) }
      b.emit({ k: 'ring', x: t.x, y: t.y, r: 2.4, color: '#8fe3ff', style: 'ice' })
    },
  },
  sniper: {
    item: 'sword', name: '삼연 저격', desc: '체력 비율이 가장 낮은 적에게 공격력 450% 저격을 세 번 (치명 가능).',
    skill(b, f) {
      for (let i = 0; i < 3; i++) b.later(i * 0.25, () => {
        const t = b.lowest(foe(f))
        if (!t || !f.alive) return
        b.emit({ k: 'shot', x1: f.x, y1: f.y, x2: t.x, y2: t.y, color: '#fff176', style: 'snipe' })
        b.damage(f, t, f.atk * 4.5, { kind: 'skill', canCrit: true })
      })
    },
  },
  golem: {
    item: 'helm', name: '대지 분쇄', desc: '넓은 범위에 공격력 300% 피해, 2.5초 기절. 자신은 체력 40% 보호막.',
    skill(b, f) {
      for (const e of b.inRadius(f.x, f.y, 2.2, foe(f))) { b.damage(f, e, f.atk * 3, { kind: 'skill' }); e.stunT = Math.max(e.stunT, 2.5) }
      f.shield += f.maxHp * 0.4
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 2.2, color: '#c9a36b', style: 'earth' })
      b.emit({ k: 'shake', v: 6 })
    },
  },
  necromancer: {
    item: 'ring', name: '망자의 군단', desc: '능력치 70%인 해골 졸개 (3+★)기를 소환한다.',
    skill(b, f) {
      for (let i = 0; i < 3 + f.star; i++) b.summon(f.side, SKELETON, f.x + fwd(f) * 0.9, f.y + (i - (2 + f.star) / 2) * 0.45, { maxHp: f.maxHp * 0.7, atk: f.atk * 0.7 })
    },
  },
  bear: {
    item: 'fang', name: '광포한 포효', desc: '주변 적에게 공격력 260% 피해, 아군 전체 공격 속도 +60%·피해 +25% (6초).',
    skill(b, f) {
      for (const e of b.inRadius(f.x, f.y, 1.8, foe(f))) b.damage(f, e, f.atk * 2.6, { kind: 'skill' })
      for (const a of b.alive(f.side)) a.buffs.push({ t: 6, as: 0.6, dmg: 0.25 })
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.8, color: '#ffb74d', style: 'roar' })
      b.emit({ k: 'shake', v: 6 })
    },
  },
  stormcaller: {
    item: 'rune', name: '뇌신의 심판', desc: '번개가 적 사이를 (8+★)번 튕기며 매번 공격력 220% 피해 (줄지 않음).',
    skill(b, f) {
      let cur = aim(b, f)
      let px = f.x, py = f.y
      let last: Fighter | null = null
      for (let i = 0; i < 8 + f.star && cur; i++) {
        b.emit({ k: 'line', x1: px, y1: py, x2: cur.x, y2: cur.y, color: '#9be7ff' })
        b.damage(f, cur, f.atk * 2.2, { kind: 'skill' })
        px = cur.x; py = cur.y; last = cur
        cur = b.nearest(px, py, foe(f), e => e !== last, 4) ?? (last.alive ? last : null)
      }
    },
  },
  bladedancer: {
    item: 'dice', name: '천 개의 칼날', desc: '3초간 넓게 16번 공격력 75% 피해 (치명 가능).',
    skill(b, f) {
      for (let k = 0; k < 16; k++) b.later(k * 0.19, () => {
        if (!f.alive) return
        for (const e of b.inRadius(f.x, f.y, 1.8, foe(f))) b.damage(f, e, f.atk * 0.75, { kind: 'skill', canCrit: true })
        b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.8, color: '#ff6fae', style: 'blade' })
      })
    },
  },
  phoenix: {
    item: 'charm', name: '영원의 불꽃', desc: '모든 적에게 공격력 200% 피해, 3초 동안 공격력 30%씩 세 번 불태운다.',
    skill(b, f) {
      for (const e of b.alive(foe(f))) {
        b.emit({ k: 'ring', x: e.x, y: e.y, r: 0.8, color: '#ff7043', style: 'fire' })
        b.damage(f, e, f.atk * 2, { kind: 'skill' })
        for (const d of [1, 2, 3]) b.later(d, () => b.damage(f, e, f.atk * 0.3, { kind: 'proc' }))
      }
      b.emit({ k: 'shake', v: 5 })
    },
  },
  dragonknight: {
    item: 'sword', name: '용왕의 분노', desc: '앞쪽 가로 한 줄 전체에 공격력 350% 피해, 자신에게 체력 50% 보호막.',
    skill(b, f) {
      for (const e of b.alive(foe(f))) if (Math.abs(e.y - f.y) < 1.3 && (e.x - f.x) * fwd(f) > -0.5) b.damage(f, e, f.atk * 3.5, { kind: 'skill' })
      f.shield += f.maxHp * 0.5
      for (let i = 1; i <= 4; i++) b.emit({ k: 'ring', x: f.x + fwd(f) * i * 1.6, y: f.y, r: 1.3, color: '#ff8a3d', style: 'fire' })
      b.emit({ k: 'shake', v: 6 })
    },
  },
  shadowlord: {
    item: 'ring', name: '그림자 군단', desc: '자신의 능력치 70%를 가진 그림자 분신 4기를 소환한다.',
    skill(b, f) {
      for (let i = 0; i < 4; i++) b.summon(f.side, SHADE, f.x, f.y + (i - 1.5) * 0.5, { maxHp: f.maxHp * 0.7, atk: f.atk * 0.7, as: f.as, crit: f.crit, critDmg: f.critDmg })
    },
  },
}
