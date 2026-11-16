// 증강체와 공명. 증강체 = 전투 훅(mod) 또는 획득 즉시 효과(onPick).
// 공명 = 증강체 두 개를 함께 가질 때 켜지는 숨은 효과. 각 증강체 훅이 has('res_*')로 분기한다.
import type { Battle, Fighter, FxStyle, Mod, Side } from '../battle.ts'
import { SPIRIT, type TraitId } from './units.ts'
import { TRAITS, TRAIT_IDS } from './traits.ts'

export interface PickCtx {
  gold(n: number): void
  addUnit(tpl: string, star: number): void
  addItem(): void
  bestUnitTpl(): string | null
}

export interface AugDef {
  id: string
  name: string
  emoji: string
  rarity: 1 | 2 | 3 // 실버·골드·프리즘
  desc: string
  fit?: TraitId[] // 이 특성 빌드에 어울림 (제안 편향용)
  locked?: boolean
  crest?: TraitId
  mod?: (has: (id: string) => boolean) => Mod
  onPick?: (c: PickCtx) => void
}

export interface ResDef { id: string; name: string; emoji: string; pair: [string, string]; desc: string }

const foeOf = (side: Side) => (1 - side) as Side

function boom(b: Battle, x: number, y: number, victims: Side, dmg: number, src: Fighter | null, color: string, style: FxStyle) {
  b.emit({ k: 'ring', x, y, r: 1.7, color, style })
  b.emit({ k: 'shake', v: 3 })
  for (const e of b.inRadius(x, y, 1.7, victims)) b.damage(src, e, dmg, { kind: 'proc', noMult: true })
}

export const AUGMENTS: AugDef[] = [
  {
    id: 'echo', name: '메아리', emoji: '🔁', rarity: 3, fit: ['arcane'],
    desc: '모든 스킬이 잠시 뒤 한 번 더 발동한다.',
    mod: () => ({
      id: 'echo',
      onCast(b, f, info) {
        if (info.echo) return
        b.later(0.35, () => { if (!f.alive) return; b.count('echo', f); b.recast(f, { ...info, echo: true }) })
      },
    }),
  },
  {
    id: 'chain', name: '연쇄 치명', emoji: '⛓️', rarity: 2, fit: ['shadow', 'hunter'],
    desc: '치명타가 근처 적 2명에게 60% 피해로 튕긴다 (주변에 적이 없으면 같은 대상에게). 튕긴 피해도 치명타가 될 수 있다 (3단계까지).',
    mod: has => {
      const deep = has('res_storm')
      const maxD = deep ? 5 : 3
      const ratio = deep ? 0.8 : 0.6
      return {
        id: 'chain',
        onCrit(b, src, t, _d, info) {
          const d = info.depth ?? 0
          if (d >= maxD) return
          b.count('chain', t)
          // 주변에 적이 없으면 같은 대상에게 두 번 꽂힌다 → 보스 단일 대상에도 통한다
          const next = b.nearestN(t.x, t.y, t.side, 2, 2.6, t)
          if (!next.length && t.alive) next.push(t, t)
          for (const e of next) {
            b.emit({ k: 'line', x1: t.x, y1: t.y, x2: e.x, y2: e.y, color: '#ffe066' })
            b.damage(src, e, (info.raw ?? src.atk) * ratio, { kind: 'proc', canCrit: true, noMult: true, depth: d + 1 })
          }
        },
      }
    },
  },
  {
    id: 'soulpact', name: '영혼 계약', emoji: '👻', rarity: 3, fit: ['undead'],
    desc: '아군이 쓰러지면 그 자리에 능력치 60%의 원혼(망령 특성)이 나타난다.',
    mod: has => ({
      id: 'soulpact',
      onAllyDeath(b, dead) {
        if (dead.gen >= (has('res_march') ? 3 : 1)) return
        const s = b.summon(dead.side, SPIRIT, dead.x, dead.y, {
          maxHp: dead.maxHp * 0.6, atk: dead.atk * 0.6, as: dead.as, range: dead.range, crit: dead.crit, critDmg: dead.critDmg,
        })
        if (!s) return
        s.gen = dead.gen + 1
        b.count('soulpact', s)
      },
    }),
  },
  {
    id: 'frenzy', name: '광란', emoji: '😤', rarity: 2, fit: ['beast', 'hunter'],
    desc: '기본 공격마다 공격 속도 +7%. 한도 없음.',
    mod: has => ({
      id: 'frenzy',
      onAttack(b, f) {
        f.asBonus += 0.07
        if (has('res_bloodfrenzy')) f.lifesteal += 0.01
        b.count('frenzy')
      },
    }),
  },
  {
    id: 'laststand', name: '최후의 저항', emoji: '💢', rarity: 2, fit: ['guard', 'beast'],
    desc: '유닛이 처음으로 체력 30% 아래로 떨어지면 4초간 무적이 되고 피해가 3배가 된다.',
    mod: has => {
      const titan = has('res_titan')
      const th = titan ? 0.5 : 0.3
      const dur = titan ? 6 : 4
      const fire = (b: Battle, f: Fighter) => {
        f.st.ls = 1
        f.invulnT = dur
        f.buffs.push({ t: dur, dmg: 2 })
        b.count('laststand', f)
        b.label(f, '최후의 저항!', '#ff6b6b')
        if (titan) b.later(dur, () => b.heal(f, f.maxHp * 0.5))
      }
      return {
        id: 'laststand',
        onDamaged(b, f) { if (!f.st.ls && f.alive && f.hp > 0 && f.hp < f.maxHp * th) fire(b, f) },
        onLethal(b, f) {
          if (f.st.ls) return false
          f.hp = 1
          fire(b, f)
          return true
        },
      }
    },
  },
  {
    id: 'manasurge', name: '마나 폭주', emoji: '💧', rarity: 2, fit: ['arcane'],
    desc: '전투 시작 시 모든 아군의 마나가 가득 찬다. 스킬을 쓴 뒤 마나 30%가 남는다.',
    mod: has => ({
      id: 'manasurge',
      onStart(b, side) {
        for (const f of b.alive(side)) {
          f.mana = Math.max(f.mana, f.maxMana)
          if (has('res_infinite')) f.spell += 0.3
        }
      },
      onCast(b, f, info) {
        if (info.echo || info.ring) return
        f.mana = Math.max(f.mana, f.maxMana * (has('res_infinite') ? 0.6 : 0.3))
        b.count('manasurge', f)
      },
    }),
  },
  {
    id: 'vamp', name: '피의 계약', emoji: '🩸', rarity: 1, fit: ['beast'],
    desc: '모든 아군 흡혈 25%. 체력이 가득 차면 넘친 회복량이 보호막이 된다.',
    mod: () => ({ id: 'vamp', onStart(b, side) { for (const f of b.alive(side)) { f.lifesteal += 0.25; f.overheal = true } } }),
  },
  {
    id: 'giant', name: '거인화', emoji: '🗻', rarity: 1, fit: ['guard'],
    desc: '모든 아군 최대 체력 +100%, 공격 속도 -15%.',
    mod: () => ({
      id: 'giant',
      onStart(b, side) { for (const f of b.alive(side)) { f.maxHp *= 2; f.as *= 0.85; f.size = Math.max(f.size, 0.86) } },
    }),
  },
  {
    id: 'executioner', name: '처형인', emoji: '🪓', rarity: 2, fit: ['shadow', 'hunter'],
    desc: '체력이 15% 이하인 적을 때리면 즉시 처형한다. 처형하면 마나 +25.',
    mod: has => {
      const th = has('res_execution') ? 0.25 : 0.15
      return {
        id: 'executioner',
        onHit(b, src, t) {
          if (!t.alive || t.hp <= 0 || t.hp >= t.maxHp * th) return
          t.st.executed = 1
          b.count('executioner', t)
          b.label(t, '처형!', '#ff4d4d')
          b.kill(t, src)
          src.mana += 25
        },
      }
    },
  },
  {
    id: 'corpse', name: '시체 폭발', emoji: '💥', rarity: 2,
    desc: '적이 쓰러지면 폭발해 주변 적에게 그 적 최대 체력 30% 피해를 준다.',
    mod: has => ({
      id: 'corpse',
      onEnemyDeath(b, dead, killer) {
        const pct = dead.st.executed && has('res_execution') ? 0.6 : 0.3
        b.count('corpse', dead)
        boom(b, dead.x, dead.y, dead.side, dead.maxHp * pct, killer, '#ff8a3d', 'fire')
      },
      onAllyDeath(b, dead) {
        if (!has('res_bomb') || dead.tpl.id !== 'spirit') return
        b.count('res_bomb', dead)
        boom(b, dead.x, dead.y, foeOf(dead.side), dead.maxHp * 0.8, dead, '#9fffe0', 'spirit')
      },
    }),
  },
  {
    id: 'lonehero', name: '고독한 영웅', emoji: '🦸', rarity: 2,
    desc: '비어 있는 배치 칸 1개당 모든 아군의 피해·체력 +40%.',
    mod: has => ({
      id: 'lonehero',
      onStart(b, side) {
        const units = b.alive(side).filter(f => !f.summoned)
        const empty = Math.max(0, b.slots - units.length)
        if (!empty) return
        const m = 1 + empty * (has('res_legend') ? 0.6 : 0.4)
        for (const f of units) {
          f.maxHp *= m
          f.dmgMult *= m
          f.size = Math.min(1.05, f.size * (1 + empty * 0.06))
        }
        b.count('lonehero')
      },
    }),
  },
  {
    id: 'growth', name: '성장의 씨앗', emoji: '🌱', rarity: 1,
    desc: '전투에서 이길 때마다 배치된 모든 유닛의 공격력·체력이 영구히 +8%.',
  },
  {
    id: 'midas', name: '황금 손', emoji: '🪙', rarity: 1,
    desc: '즉시 15골드. 매 라운드 수입 +2, 상점 새로고침 1번 무료.',
    onPick: c => c.gold(15),
  },
  {
    id: 'multishot', name: '다중 사격', emoji: '🎆', rarity: 2, fit: ['hunter'],
    desc: '원거리 유닛의 기본 공격이 주변 적 2명을 추가로 맞힌다 (60% 피해).',
    mod: has => {
      const shotgun = has('res_shotgun')
      return {
        id: 'multishot',
        onAttack(b, f, t) {
          if (f.range < 2) return
          b.count('multishot')
          for (const e of b.nearestN(t.x, t.y, t.side, shotgun ? 4 : 2, 2.5, t)) {
            b.emit({ k: 'shot', x1: f.x, y1: f.y, x2: e.x, y2: e.y, color: '#ffd166' })
            b.damage(f, e, f.atk * 0.6, { kind: 'proc', canCrit: shotgun })
          }
        },
      }
    },
  },
  {
    id: 'overload', name: '과부하', emoji: '💠', rarity: 2, fit: ['arcane', 'shadow'],
    desc: '스킬에도 치명타가 터진다. 모든 아군 치명타 확률 +15%.',
    mod: () => ({ id: 'overload', onStart(b, side) { for (const f of b.alive(side)) { f.skillCrit = true; f.crit += 0.15 } } }),
  },
  {
    id: 'martyr', name: '순교자의 맹세', emoji: '🕯️', rarity: 1, fit: ['undead'],
    desc: '아군이 쓰러질 때마다 남은 아군이 최대 체력 15%를 회복하고 피해 +15% (누적).',
    mod: () => ({
      id: 'martyr',
      onAllyDeath(b, dead) {
        b.count('martyr', dead)
        for (const f of b.alive(dead.side)) { b.heal(f, f.maxHp * 0.15); f.dmgMult += 0.15 }
      },
    }),
  },
  {
    id: 'duplicate', name: '거울 복제', emoji: '🪞', rarity: 2,
    desc: '보유한 가장 비싼 유닛의 ★1 복제본 2개를 즉시 얻는다 (승급에 바로 쓰인다).',
    onPick: c => {
      const t = c.bestUnitTpl()
      if (t) { c.addUnit(t, 1); c.addUnit(t, 1) }
    },
  },
  {
    id: 'armory', name: '무기고', emoji: '🧰', rarity: 1,
    desc: '무작위 아이템 3개를 즉시 얻는다.',
    onPick: c => { c.addItem(); c.addItem(); c.addItem() },
  },
  // ── 해금 증강체
  {
    id: 'smite', name: '천벌', emoji: '🌩️', rarity: 2, locked: true, fit: ['beast', 'hunter'],
    desc: '아군의 기본 공격 10번째마다 대상에게 낙뢰: 공격력 600% 피해 + 주변 300% (치명 가능).',
    mod: has => {
      const every = has('res_thunder') ? 5 : 10
      return {
        id: 'smite',
        onAttack(b, f, t) {
          f.st.smite = (f.st.smite ?? 0) + 1
          if (f.st.smite % every) return
          b.count('smite', t)
          b.emit({ k: 'line', x1: t.x, y1: 0, x2: t.x, y2: t.y, color: '#fff59d' })
          b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.2, color: '#fff59d', style: 'shock' })
          for (const e of b.inRadius(t.x, t.y, 1.2, t.side)) b.damage(f, e, f.atk * (e === t ? 6 : 3), { kind: 'proc', canCrit: true })
        },
      }
    },
  },
  {
    id: 'timewarp', name: '시간 정지', emoji: '⏳', rarity: 3, locked: true,
    desc: '전투 시작 후 3.5초간 모든 적이 멈춘다 (보스 2초). 아군 공격 속도 +25%.',
    mod: () => ({
      id: 'timewarp',
      onStart(b, side) {
        for (const e of b.alive(foeOf(side))) e.stunT = e.boss ? 2 : 3.5
        for (const f of b.alive(side)) f.asBonus += 0.25
        b.count('timewarp')
        b.banner('시간 정지!', '#9ad0ff')
      },
    }),
  },
  {
    id: 'splitsoul', name: '영혼 분열', emoji: '🌗', rarity: 3, locked: true,
    desc: '전투 시작 시 가장 강한 아군의 분신(능력치 70%, 스킬 포함)이 나타난다.',
    mod: () => ({
      id: 'splitsoul',
      onStart(b, side) {
        const list = b.alive(side).filter(f => !f.summoned)
        if (!list.length) return
        const best = list.reduce((a, f) => (f.atk * f.maxHp > a.atk * a.maxHp ? f : a))
        const c = b.summon(side, best.tpl, best.x, best.y + 0.7, {
          maxHp: best.maxHp * 0.7, atk: best.atk * 0.7, as: best.as, range: best.range, crit: best.crit, critDmg: best.critDmg,
        })
        if (!c) return
        c.star = best.star
        c.spell = best.spell
        c.manaGain = best.manaGain
        c.asBonus = best.asBonus
        c.own.push(...best.own)
        b.count('splitsoul', c)
        b.banner(`${best.name} 분열!`, '#d1b3ff')
      },
    }),
  },
  // ── 특성 문장: 해당 특성 +1, 효과 2배 (run.synergies가 처리)
  ...TRAIT_IDS.map((t): AugDef => ({
    id: 'crest_' + t, name: `${TRAITS[t].name}의 문장`, emoji: TRAITS[t].emoji, rarity: 2, crest: t, fit: [t],
    desc: `${TRAITS[t].name} 특성 개수 +1, ${TRAITS[t].name} 시너지 효과 2배.`,
  })),
]

export const AUG: Record<string, AugDef> = Object.fromEntries(AUGMENTS.map(a => [a.id, a]))

export const RESONANCES: ResDef[] = [
  { id: 'res_infinite', name: '무한 회로', emoji: '♾️', pair: ['echo', 'manasurge'], desc: '스킬을 쓴 뒤 마나 60%가 남고, 스킬 피해 +30%.' },
  { id: 'res_storm', name: '연쇄 폭풍', emoji: '🌪️', pair: ['chain', 'overload'], desc: '치명타 튕김이 5단계까지 이어지고 튕김 피해가 80%로 오른다.' },
  { id: 'res_bomb', name: '망자의 폭탄', emoji: '💣', pair: ['soulpact', 'corpse'], desc: '원혼이 소멸할 때 폭발해 주변 적에게 원혼 최대 체력 80% 피해.' },
  { id: 'res_bloodfrenzy', name: '피의 광란', emoji: '🧛', pair: ['frenzy', 'vamp'], desc: '기본 공격마다 흡혈 +1% 누적.' },
  { id: 'res_titan', name: '불굴의 거인', emoji: '🏔️', pair: ['laststand', 'giant'], desc: '최후의 저항이 체력 50%에서 발동, 6초 지속, 끝나면 체력 50% 회복.' },
  { id: 'res_execution', name: '공개 처형', emoji: '⚰️', pair: ['executioner', 'corpse'], desc: '처형 기준 25%. 처형된 적의 시체 폭발 피해 2배.' },
  { id: 'res_shotgun', name: '산탄 연쇄', emoji: '🎇', pair: ['multishot', 'chain'], desc: '추가 화살 4발, 추가 화살도 치명타가 터진다 (연쇄 치명과 이어짐).' },
  { id: 'res_legend', name: '전설의 영웅', emoji: '👑', pair: ['lonehero', 'growth'], desc: '성장 효과 2배 (+16%), 빈 칸당 보너스 +60%.' },
  { id: 'res_march', name: '끝없는 행진', emoji: '🪦', pair: ['soulpact', 'martyr'], desc: '원혼도 쓰러지면 원혼을 남긴다 (최대 3세대).' },
  { id: 'res_thunder', name: '뇌신 강림', emoji: '⛈️', pair: ['smite', 'frenzy'], desc: '낙뢰가 5번째 공격마다 떨어진다.' },
]
