// 나만의 영웅: 외형·특성·능력치를 정하고, 스킬과 패시브는 게임에 있는 것을 골라 조합한다
// (Totally Accurate Battle Simulator 유닛 제작기처럼 기존 부품을 섞는 방식).
// 샌드박스 전용: UNIT 사전에만 등록하고 상점·보상이 쓰는 UNITS 배열에는 넣지 않는다.
import type { Fighter, Mod, Side } from './battle.ts'
import { UNIT, UNITS, type TraitId, type UnitTpl } from './data/units.ts'
import { ENEMIES } from './data/enemies.ts'
import { TRAIT_IDS } from './data/traits.ts'

export interface HeroDef {
  id: string
  name: string
  spr: [sheet: string, col: number, row: number]
  traits: TraitId[]
  hp: number
  atk: number
  as: number
  range: number
  armor: number
  crit: number
  mana: number
  size: number
  skill: string // 스킬을 빌려 올 유닛 id ('' = 없음)
  passive: string
}

// [최소, 최대, 간격] — 편집 화면 슬라이더와 저장분 검사가 같이 쓴다
export const LIMITS = {
  hp: [100, 9000, 50], atk: [5, 600, 5], as: [0.2, 3, 0.05], range: [1, 6, 1],
  armor: [0, 150, 5], crit: [0, 1, 0.05], mana: [20, 200, 10], size: [0.55, 1.1, 0.05],
} as const satisfies Record<string, readonly [number, number, number]>
export type Stat = keyof typeof LIMITS

const foe = (f: Fighter) => (1 - f.side) as Side

// 스킬 출처: 스킬이 있는 아군·적 유닛 전부
export const SKILL_SRC: UnitTpl[] = [...UNITS, ...Object.values(ENEMIES)].filter(t => t.skill && !t.custom)
const DESC: Record<string, string> = { boss: '모든 적에게 최대 체력 18% + 공격력 50% 피해.' } // 보스 설명의 격노 부분은 패시브로 따로
export const skillDesc = (t: UnitTpl) => DESC[t.id] ?? t.skillDesc

export const PASSIVES: Record<string, { name: string; desc: string; mods?: () => Mod[] }> = {
  none: { name: '없음', desc: '' },
  rebirth: { name: '불사조의 부활', desc: '처음 쓰러지면 체력을 모두 회복하며 되살아나 주변에 폭발.', mods: UNIT.phoenix.own },
  undying: { name: '불사', desc: '처음 쓰러지면 체력 50%로 되살아난다.', mods: ENEMIES.wraith.own },
  phase: { name: '격노', desc: '체력 66%·33%에서 공격 속도 +35%, 악마 병사 2기를 부른다.', mods: ENEMIES.boss.own },
  split: {
    name: '분열', desc: '쓰러지면 체력·공격력 50%인 분신 둘로 나뉜다 (분신은 다시 나뉘지 않음).',
    mods: () => [{
      id: 'split',
      onDeath(b, f) {
        if (f.summoned) return
        for (const dy of [-0.5, 0.5]) b.summon(f.side, f.tpl, f.x, f.y + dy, { maxHp: f.maxHp * 0.5, atk: f.atk * 0.5, as: f.as, range: f.range, crit: f.crit, critDmg: f.critDmg })
        b.label(f, '분열!', '#6daa2c')
      },
    }],
  },
  bomb: {
    name: '최후의 폭발', desc: '쓰러지면 폭발해 주변 적에게 공격력 400% 피해.',
    mods: () => [{
      id: 'bomb',
      onDeath(b, f) {
        b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.8, color: '#ff7a2e', style: 'fire' })
        b.emit({ k: 'shake', v: 5 })
        for (const e of b.inRadius(f.x, f.y, 1.8, foe(f))) b.damage(f, e, f.atk * 4, { kind: 'proc' })
      },
    }],
  },
  thorns: {
    name: '가시 갑옷', desc: '받은 피해 30%를 때린 적에게 돌려준다.',
    mods: () => [{ id: 'thorns', onDamaged(b, f, src, dealt) { if (src?.alive && src.side !== f.side) b.damage(f, src, dealt * 0.3, { kind: 'proc', noMult: true }) } }],
  },
  frenzy: { name: '광폭', desc: '기본 공격마다 공격 속도 +6% (한도 없음).', mods: () => [{ id: 'frenzy', onAttack(_b, f) { f.asBonus += 0.06 } }] },
  vamp: { name: '흡혈', desc: '준 피해 30%만큼 회복.', mods: () => [{ id: 'vamp', onHit(b, f, _t, dealt) { b.heal(f, dealt * 0.3) } }] },
  execute: {
    name: '처형', desc: '체력 15% 이하인 적을 때리면 즉시 처형.',
    mods: () => [{ id: 'execute', onHit(b, f, t) { if (t.alive && t.hp > 0 && t.hp < t.maxHp * 0.15) { b.label(t, '처형!', '#ff4d4d'); b.kill(t, f) } } }],
  },
}

export function newHero(): HeroDef {
  return {
    id: 'h_' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), name: '새 영웅', spr: ['Humanoid', 6, 4], traits: ['shadow'],
    hp: 800, atk: 70, as: 0.8, range: 1, armor: 25, crit: 0.15, mana: 70, size: 0.72, skill: 'bladedancer', passive: 'none',
  }
}

// 저장분(localStorage)은 손댈 수 있으니 범위·목록을 다시 맞춘다
export function cleanHero(h: Partial<HeroDef>): HeroDef | null {
  if (typeof h?.id !== 'string' || !h.id.startsWith('h_')) return null
  const d = newHero()
  const num = (k: Stat) => {
    const [lo, hi] = LIMITS[k]
    const v = Number(h[k])
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d[k]
  }
  const spr = Array.isArray(h.spr) && typeof h.spr[0] === 'string' ? [h.spr[0], h.spr[1] | 0, h.spr[2] | 0] as HeroDef['spr'] : d.spr
  return {
    id: h.id, name: String(h.name ?? '').replace(/[<>&"'`]/g, '').slice(0, 12) || d.name, spr, // 이름은 화면 HTML에 그대로 들어간다
    traits: (Array.isArray(h.traits) ? h.traits : []).filter((t): t is TraitId => TRAIT_IDS.includes(t as TraitId)).slice(0, 2),
    hp: num('hp'), atk: num('atk'), as: num('as'), range: num('range'), armor: num('armor'), crit: num('crit'), mana: num('mana'), size: num('size'),
    skill: SKILL_SRC.some(t => t.id === h.skill) ? h.skill! : '',
    passive: h.passive && PASSIVES[h.passive] ? h.passive : 'none',
  }
}

export function heroTpl(h: HeroDef): UnitTpl {
  const src = SKILL_SRC.find(t => t.id === h.skill)
  return {
    id: h.id, name: h.name, emoji: '⭐', cost: 3, custom: true, traits: [...h.traits],
    hp: h.hp, atk: h.atk, as: h.as, range: h.range, armor: h.armor, crit: h.crit, size: h.size,
    mana: src ? h.mana : 0, skillName: src?.skillName ?? '', skillDesc: src ? skillDesc(src) : '', skill: src?.skill,
    own: () => PASSIVES[h.passive]?.mods?.() ?? [],
  }
}

// UNIT 사전에 등록 (지운 영웅은 빠진다). 상점은 UNITS 배열을 쓰므로 원정에는 나오지 않는다.
export function registerHeroes(list: HeroDef[]) {
  for (const id of Object.keys(UNIT)) if (UNIT[id].custom && !list.some(h => h.id === id)) delete UNIT[id]
  for (const h of list) UNIT[h.id] = heroTpl(h)
}

// 전투력 근사: 유효 체력 × 초당 기본 공격 피해. 스킬·패시브는 빠진다.
export const powerOf = (t: Pick<UnitTpl, 'hp' | 'atk' | 'as' | 'armor' | 'crit'>) => t.hp * (1 + t.armor / 100) * t.atk * t.as * (1 + (t.crit ?? 0.1) * 0.5)
const avgPower = (cost: number) => { const a = UNITS.filter(t => t.cost === cost && !t.locked); return a.reduce((s, t) => s + powerOf(t), 0) / a.length }
export function powerGrade(t: Parameters<typeof powerOf>[0]): { x: number; grade: string } {
  const x = powerOf(t) / avgPower(3)
  const grade = x < avgPower(1) / avgPower(3) * 1.2 ? '1골드급' : x < avgPower(2) / avgPower(3) * 1.2 ? '2골드급' : x < 1.4 ? '3골드급' : x < 4 ? '★2급' : x < 15 ? '★3급' : x < 60 ? '사기' : '보스급'
  return { x, grade }
}
