// 시너지(특성). tier 1·2 = 2명·4명 달성. x = 문장 증강체가 있으면 2 (효과 2배).
import type { Fighter, Mod, Side } from '../battle.ts'
import type { TraitId } from './units.ts'

export interface TraitDef {
  id: TraitId
  name: string
  emoji: string
  color: string
  tiers: number[]
  desc: string[]
  mod: (tier: number, x: number) => Mod
}

const is = (f: Fighter, t: TraitId) => f.traits.includes(t)

export const TRAITS: Record<TraitId, TraitDef> = {
  guard: {
    id: 'guard', name: '수호', emoji: '🛡️', color: '#5b9bff', tiers: [2, 4],
    desc: ['모든 아군이 최대 체력 20% 보호막을 얻고, 수호 유닛 방어력 +25.', '보호막 45%, 수호 유닛 방어력 +60, 수호 유닛이 받은 피해 25%를 반사.'],
    mod: (tier, x) => ({
      id: 'guard',
      onStart(b, side) {
        for (const f of b.alive(side)) {
          f.shield += f.maxHp * (tier > 1 ? 0.45 : 0.2) * x
          if (is(f, 'guard')) f.armor += (tier > 1 ? 60 : 25) * x
        }
      },
      onDamaged(b, f, src, dealt) {
        if (tier > 1 && src?.alive && is(f, 'guard')) b.damage(f, src, dealt * 0.25 * x, { kind: 'proc', noMult: true })
      },
    }),
  },
  arcane: {
    id: 'arcane', name: '비전', emoji: '🔮', color: '#b07cff', tiers: [2, 4],
    desc: ['모든 아군 스킬 피해 +20%, 비전 유닛 마나 획득 +30%.', '스킬 피해 +50%, 비전 유닛 마나 획득 +60%, 비전 유닛은 마나 50%로 시작.'],
    mod: (tier, x) => ({
      id: 'arcane',
      onStart(b, side) {
        for (const f of b.alive(side)) {
          f.spell += (tier > 1 ? 0.5 : 0.2) * x
          if (!is(f, 'arcane')) continue
          f.manaGain += (tier > 1 ? 0.6 : 0.3) * x
          if (tier > 1) f.mana += f.maxMana * 0.5
        }
      },
    }),
  },
  hunter: {
    id: 'hunter', name: '사냥', emoji: '🏹', color: '#5fd068', tiers: [2, 4],
    desc: ['사냥 유닛 공격 속도 +30%.', '사냥 유닛 공격 속도 +70%, 기본 공격이 대상 옆의 적 1명을 관통 (50% 피해).'],
    mod: (tier, x) => ({
      id: 'hunter',
      onStart(b, side) { for (const f of b.alive(side)) if (is(f, 'hunter')) f.asBonus += (tier > 1 ? 0.7 : 0.3) * x },
      onAttack(b, f, t) {
        if (tier < 2 || !is(f, 'hunter') || f.range < 2) return
        const e = b.nearest(t.x, t.y, t.side, o => o !== t, 1.6)
        if (!e) return
        b.emit({ k: 'line', x1: t.x, y1: t.y, x2: e.x, y2: e.y, color: '#8dff9a' })
        b.damage(f, e, f.atk * 0.5 * x, { kind: 'proc' })
      },
    }),
  },
  shadow: {
    id: 'shadow', name: '그림자', emoji: '🗡️', color: '#ff6fae', tiers: [2, 4],
    desc: ['그림자 유닛 치명타 확률 +20%, 치명타 피해 +40%.', '치명타 확률 +40%, 치명타 피해 +90%. 근접 그림자 유닛은 시작하자마자 적 후열로 순간이동해 1.5초간 은신 (피해 무시).'],
    mod: (tier, x) => ({
      id: 'shadow',
      onStart(b, side) {
        for (const f of b.alive(side)) {
          if (!is(f, 'shadow')) continue
          f.crit += (tier > 1 ? 0.4 : 0.2) * x
          f.critDmg += (tier > 1 ? 0.9 : 0.4) * x
          if (tier < 2 || f.range >= 2) continue
          const e = b.backline((1 - side) as Side)
          if (!e) continue
          b.teleport(f, e.x + (side === 0 ? 0.7 : -0.7), e.y)
          f.target = e
          f.retarget = 2
          f.invulnT = 1.5 // 은신에서 튀어나온 직후 집중 공격에 바로 녹지 않게
        }
      },
    }),
  },
  undead: {
    id: 'undead', name: '망령', emoji: '💀', color: '#62e0c8', tiers: [2, 4],
    desc: ['아군이 쓰러질 때마다 망령 유닛 피해 +12%, 공격 속도 +8% (누적).', '수치 2배. 망령 유닛은 처음 쓰러질 때 체력 50%로 되살아난다.'],
    mod: (tier, x) => ({
      id: 'undead',
      onAllyDeath(b, dead) {
        const a = (tier > 1 ? 0.24 : 0.12) * x
        for (const f of b.alive(dead.side)) if (is(f, 'undead')) { f.dmgMult += a; f.asBonus += a * 0.66 }
      },
      onLethal(b, f) {
        if (tier < 2 || !is(f, 'undead') || f.summoned || f.st.rev) return false
        f.st.rev = 1
        f.hp = f.maxHp * Math.min(1, 0.5 * x)
        b.count('undead', f)
        b.label(f, '되살아남!', '#62e0c8')
        return true
      },
    }),
  },
  beast: {
    id: 'beast', name: '야수', emoji: '🦁', color: '#ff9f43', tiers: [2, 4],
    desc: ['야수 유닛은 기본 공격마다 공격 속도 +4% (최대 20번).', '공격마다 +7% (한도 없음), 야수 유닛 흡혈 20%.'],
    mod: (tier, x) => ({
      id: 'beast',
      onStart(b, side) { if (tier > 1) for (const f of b.alive(side)) if (is(f, 'beast')) f.lifesteal += 0.2 * x },
      onAttack(_b, f) {
        if (!is(f, 'beast')) return
        const n = f.st.beast ?? 0
        if (tier < 2 && n >= 20) return
        f.st.beast = n + 1
        f.asBonus += (tier > 1 ? 0.07 : 0.04) * x
      },
    }),
  },
}

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[]
