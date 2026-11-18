// 적 유닛과 라운드별 웨이브. 난이도 곡선은 enemyMult 하나로 조절한다.
import type { Battle, Fighter, Mod, Side } from '../battle.ts'
import { SKELETON, jiangshiOwn, type UnitTpl } from './units.ts'
import { pick, pickW, rand, shuffle, type Rng } from '../rng.ts'

const foe = (f: Fighter) => (1 - f.side) as Side
// 폭발: 주변 r 안의 양쪽 진영 모두에게 피해 (자폭 고블린은 제 편도 휘말린다)
function blast(b: Battle, f: Fighter, r: number, dmg: number, sides: Side[], color: string) {
  b.emit({ k: 'ring', x: f.x, y: f.y, r, color, style: 'fire' })
  b.emit({ k: 'shake', v: 4 })
  for (const side of sides) for (const e of b.inRadius(f.x, f.y, r, side)) if (e !== f) b.damage(f, e, dmg, { kind: 'proc', noMult: true })
}

const E = (o: Omit<UnitTpl, 'cost' | 'traits' | 'skillName' | 'skillDesc'> & Partial<UnitTpl>): UnitTpl =>
  ({ cost: 0, traits: [], skillName: '', skillDesc: '', ...o })

export const ENEMIES: Record<string, UnitTpl> = {
  slime: E({ id: 'slime', name: '슬라임', emoji: '🟢', hp: 420, atk: 34, as: 0.7, range: 1, armor: 5, mana: 0 }),
  goblin: E({ id: 'goblin', name: '고블린', emoji: '👺', hp: 360, atk: 40, as: 0.95, range: 1, armor: 5, mana: 0 }),
  thrower: E({ id: 'thrower', name: '고블린 투척수', emoji: '💣', hp: 300, atk: 42, as: 0.7, range: 3, armor: 0, mana: 0 }),
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
    id: 'troll', name: '트롤 족장', emoji: '🦍', size: 0.95, hp: 3200, atk: 115, as: 0.7, range: 1, armor: 40, mana: 80,
    skillName: '대지 분쇄', skillDesc: '주변 적에게 공격력 220% 피해, 1초 기절.',
    skill(b, f) {
      for (const e of b.inRadius(f.x, f.y, 2, foe(f))) { b.damage(f, e, f.atk * 2.2, { kind: 'skill' }); e.stunT = Math.max(e.stunT, 1) }
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 2, color: '#a1887f', style: 'earth' })
      b.emit({ k: 'shake', v: 6 })
    },
  }),
  scorpion: E({
    id: 'scorpion', name: '심연 전갈', emoji: '🦂', size: 0.95, hp: 3300, atk: 98, as: 0.8, range: 1, armor: 50, mana: 60,
    skillName: '독침', skillDesc: '대상에게 공격력 300% 피해, 주변 적 둔화.',
    skill(b, f) {
      const t = f.target
      if (!t?.alive) return
      b.damage(f, t, f.atk * 3, { kind: 'skill' })
      for (const e of b.inRadius(t.x, t.y, 2, foe(f))) e.slowT = 3
      b.emit({ k: 'ring', x: t.x, y: t.y, r: 2, color: '#b2ff59', style: 'poison' })
    },
  }),
  // ── 기믹 적
  kingslime: E({
    id: 'kingslime', name: '왕슬라임', emoji: '🟠', size: 0.88, hp: 560, atk: 36, as: 0.7, range: 1, armor: 5, mana: 0,
    skillName: '분열', skillDesc: '쓰러지면 체력·공격력 45%인 꼬마 슬라임 둘로 나뉜다.',
    own: () => [{
      id: 'split',
      onDeath(b, f) {
        for (const dy of [-0.45, 0.45]) b.summon(f.side, ENEMIES.slimelet, f.x, f.y + dy, { maxHp: f.maxHp * 0.45, atk: f.atk * 0.45 })
        b.label(f, '분열!', '#6daa2c')
      },
    }],
  }),
  slimelet: E({ id: 'slimelet', name: '꼬마 슬라임', emoji: '🟢', size: 0.55, hp: 200, atk: 18, as: 0.9, range: 1, armor: 0, mana: 0 }),
  bomber: E({
    id: 'bomber', name: '자폭 고블린', emoji: '🧨', hp: 260, atk: 55, as: 1, range: 1, armor: 0, mana: 0, speed: 2.6,
    skillName: '자폭', skillDesc: '붙자마자 터져 주변(아군·적 모두)에게 공격력 350% 피해. 쓰러져도 터진다.',
    own: () => [{
      id: 'bomb',
      onAttack(b, f) { b.kill(f, null) },
      onDeath(b, f) { b.label(f, '펑!', '#ff7a2e'); blast(b, f, 1.5, f.atk * 3.5, [0, 1], '#ff7a2e') },
    }],
  }),
  treasure: E({
    id: 'treasure', name: '보물 고블린', emoji: '💰', hp: 360, atk: 0, as: 0.5, range: 1, armor: 0, mana: 0, speed: 1.5, flee: 10,
    skillName: '도주', skillDesc: '싸우지 않고 도망치다 10초 뒤 사라진다. 잡으면 골드를 쏟는다.',
    own: () => [{ id: 'treasure', onDeath(b, f) { b.count('treasure', f); b.banner('보물 고블린 처치!', '#dad45e') } }],
  }),
  priest: E({
    id: 'priest', name: '강령 사제', emoji: '🧟', hp: 480, atk: 40, as: 0.7, range: 3, armor: 10, mana: 70, startMana: 35,
    skillName: '해골 부르기', skillDesc: '해골 졸개 2기를 부른다.',
    skill(b, f) {
      for (const dy of [-0.6, 0.6]) b.summon(f.side, SKELETON, f.x - 0.9, f.y + dy, { maxHp: f.maxHp * 0.5, atk: f.atk * 0.8 })
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 1, color: '#6dc2ca', style: 'spirit' })
    },
  }),
  wraith: E({
    id: 'wraith', name: '망령 기사', emoji: '⚔️', hp: 640, atk: 55, as: 0.75, range: 1, armor: 25, mana: 0,
    skillName: '불사', skillDesc: '처음 쓰러지면 체력 50%로 되살아난다.',
    own: () => [{
      id: 'undying',
      onLethal(b, f) {
        if (f.st.rev) return false
        f.st.rev = 1
        f.hp = f.maxHp * 0.5
        b.label(f, '되살아남!', '#6dc2ca')
        return true
      },
    }],
  }),
  // ── 동방에서 흘러든 요괴
  dokkaebi: E({
    id: 'dokkaebi', name: '도깨비', emoji: '👹', hp: 540, atk: 45, as: 0.75, range: 1, armor: 20, mana: 0,
    skillName: '도깨비불', skillDesc: '쓰러지면 도깨비불 둘이 튀어나와 달려든다 (닿으면 터짐).',
    own: () => [{
      id: 'wisps',
      onDeath(b, f) {
        for (const dy of [-0.45, 0.45]) b.summon(f.side, ENEMIES.wisp, f.x, f.y + dy, { maxHp: f.maxHp * 0.25, atk: f.atk * 0.6 })
        b.label(f, '도깨비불!', '#d27d2c')
      },
    }],
  }),
  wisp: E({
    id: 'wisp', name: '도깨비불', emoji: '🔥', size: 0.55, hp: 170, atk: 40, as: 1, range: 1, armor: 0, mana: 0, speed: 2.8,
    skillName: '불씨', skillDesc: '닿으면 터져 주변 적에게 공격력 150% 피해.',
    own: () => [{
      id: 'wispbomb',
      onAttack(b, f) { b.kill(f, null) },
      onDeath(b, f) { blast(b, f, 1.1, f.atk * 1.5, [foe(f)], '#d27d2c') },
    }],
  }),
  clubber: E({
    id: 'clubber', name: '방망이 도깨비', emoji: '👺', hp: 420, atk: 46, as: 0.7, range: 3, armor: 10, mana: 80, startMana: 20,
    skillName: '뚝딱', skillDesc: '방망이를 두드려 모든 아군에게 공격력 180% 보호막.',
    skill(b, f) {
      for (const a of b.alive(f.side)) a.shield += f.atk * 1.8
      b.label(f, '뚝딱!', '#dad45e')
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.5, color: '#dad45e', style: 'shield' })
    },
  }),
  lantern: E({
    id: 'lantern', name: '등롱 요괴', emoji: '🏮', hp: 440, atk: 42, as: 0.7, range: 3, armor: 10, mana: 70,
    skillName: '도깨비 등불', skillDesc: '대상 주변에 불을 뿌려 공격력 140% 피해, 1.5초 동안 화상 (그 피해의 30%).',
    skill(b, f) {
      const t = f.target?.alive ? f.target : b.nearest(f.x, f.y, foe(f))
      if (!t) return
      for (const e of b.inRadius(t.x, t.y, 1, foe(f))) {
        const d = b.damage(f, e, f.atk * 1.4, { kind: 'skill' })
        for (const s of [0.5, 1, 1.5]) b.later(s, () => b.damage(f, e, d * 0.1, { kind: 'proc', noMult: true }))
      }
      b.emit({ k: 'ring', x: t.x, y: t.y, r: 1, color: '#d27d2c', style: 'fire' })
    },
  }),
  jiangshi: E({
    id: 'jiangshi', name: '강시', emoji: '🧟', hp: 820, atk: 50, as: 0.6, range: 1, armor: 35, mana: 0, speed: 1.2,
    skillName: '흡기', skillDesc: '때린 대상의 체력을 빨아들이고 둔화시킨다.',
    own: jiangshiOwn,
  }),
  // ── 정예 (라운드마다 둘 중 하나, 원정 시작 때 정해져 미리 보인다)
  goblinking: E({
    id: 'goblinking', name: '고블린 왕', emoji: '👑', size: 0.95, hp: 2900, atk: 80, as: 0.8, range: 1, armor: 30, mana: 70, startMana: 20,
    skillName: '징집', skillDesc: '고블린 2기를 부르고, 모든 적 공격 속도 +40% (4초).',
    skill(b, f) {
      const g = ENEMIES.goblin
      for (const dy of [-0.7, 0.7]) b.summon(f.side, g, f.x + 0.6, f.y + dy, { maxHp: g.hp * f.st.mult, atk: g.atk * f.st.mult })
      for (const a of b.alive(f.side)) a.buffs.push({ t: 4, as: 0.4 })
      b.banner('고블린 왕의 징집!', '#6daa2c')
      b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.6, color: '#6daa2c', style: 'roar' })
    },
  }),
  lich: E({
    id: 'lich', name: '리치', emoji: '☠️', size: 0.95, hp: 3400, atk: 95, as: 0.7, range: 3, armor: 30, mana: 80, startMana: 30,
    skillName: '망자 소생', skillDesc: '쓰러진 적 2명을 체력 60%로 되살린다. 되살릴 적이 없으면 대상 주변에 공격력 220% 피해와 둔화.',
    skill(b, f) {
      const dead = b.fighters.filter(x => x.side === f.side && !x.alive && !x.boss && !x.summoned && !x.tpl.flee).slice(-2)
      for (const x of dead) {
        x.alive = true
        x.hp = x.maxHp * 0.6
        x.stunT = 0
        x.cd = 0.5
        b.emit({ k: 'spawn', uid: x.uid })
        x.st.raised = 1
        b.label(x, '소생!', '#6dc2ca')
      }
      if (dead.length) { b.banner('리치가 망자를 일으킨다!', '#6dc2ca'); return }
      const t = f.target?.alive ? f.target : b.nearest(f.x, f.y, foe(f))
      if (!t) return
      for (const e of b.inRadius(t.x, t.y, 1.8, foe(f))) { b.damage(f, e, f.atk * 2.2, { kind: 'skill' }); e.slowT = 2 }
      b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.8, color: '#6dc2ca', style: 'ice' })
    },
  }),
  gumiho: E({
    id: 'gumiho', name: '구미호', emoji: '🦊', size: 0.95, hp: 2600, atk: 84, as: 0.85, range: 2, armor: 25, mana: 80, dodge: 0.3,
    skillName: '여우불', skillDesc: '무작위 적 넷에게 여우불을 날려 공격력 150% 피해. 기본 공격 30%를 피하고, 체력 60%·30%에서 꼬리 분신 둘을 부른다.',
    skill(b, f) {
      const es = b.alive(foe(f))
      for (let i = 0; i < 4 && es.length; i++) {
        const t = es[Math.floor(b.r() * es.length)]
        b.emit({ k: 'shot', x1: f.x, y1: f.y, x2: t.x, y2: t.y, color: '#6dc2ca', style: 'spirit' })
        b.damage(f, t, f.atk * 1.5, { kind: 'skill' })
      }
      b.banner('구미호의 여우불!', '#6dc2ca')
    },
    own: () => [{
      id: 'tails',
      onDamaged(b, f) {
        const ph = f.st.phase ?? 0
        const th = [0.6, 0.3][ph]
        if (th === undefined || f.hp >= f.maxHp * th) return
        f.st.phase = ph + 1
        b.banner('구미호가 꼬리를 나눈다!', '#6dc2ca')
        for (const dy of [-0.8, 0.8]) b.summon(f.side, ENEMIES.foxclone, f.x - 0.5, f.y + dy, { maxHp: f.maxHp * 0.2, atk: f.atk * 0.4 })
      },
    }],
  }),
  foxclone: E({ id: 'foxclone', name: '꼬리 분신', emoji: '🦊', size: 0.6, hp: 600, atk: 40, as: 0.9, range: 1, armor: 10, mana: 0, dodge: 0.3 }),
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

export interface Spawn { tpl: string; cell: number; mult: number; star?: number; aff?: string; armor?: number }
export interface Wave { label: string; kind: 'normal' | 'elite' | 'boss'; spawns: Spawn[]; hint?: string }

// ── 정예 접두사 (Risk of Rain 2의 정예 속성처럼, 이름 앞에 붙고 오라 색으로 보인다)
interface Affix { id: string; name: string; color: string; desc: string; apply: (f: Fighter) => void }
const affMod = (m: Mod) => (f: Fighter) => { f.own.push(m) }
export const AFFIXES: Affix[] = [
  {
    id: 'fire', name: '화염', color: '#ff7a2e', desc: '때린 대상을 1.5초 동안 불태운다 (그 피해의 45%).',
    apply: affMod({
      id: 'fire',
      onHit(b, f, t, dealt, info) {
        if (info.kind === 'proc') return
        for (const d of [0.5, 1, 1.5]) b.later(d, () => b.damage(f, t, dealt * 0.15, { kind: 'proc', noMult: true }))
      },
    }),
  },
  {
    id: 'frost', name: '서리', color: '#8fe3ff', desc: '때린 대상을 둔화시키고, 쓰러지면 주변 아군을 1.2초 얼린다.',
    apply: affMod({
      id: 'frost',
      onHit(_b, _f, t, _d, info) { if (info.kind !== 'proc') t.slowT = Math.max(t.slowT, 1.5) },
      onDeath(b, f) {
        for (const e of b.inRadius(f.x, f.y, 1.6, foe(f))) e.stunT = Math.max(e.stunT, 1.2)
        b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.6, color: '#8fe3ff', style: 'ice' })
      },
    }),
  },
  {
    id: 'volt', name: '과부하', color: '#6dc2ca', desc: '체력 50% 보호막. 쓰러지면 폭발해 주변 아군에게 최대 체력 25% 피해.',
    apply: f => {
      f.shield += f.maxHp * 0.5
      f.own.push({ id: 'volt', onDeath(b, d) { blast(b, d, 1.6, d.maxHp * 0.25, [foe(d)], '#6dc2ca') } })
    },
  },
  { id: 'giant', name: '거대', color: '#dad45e', desc: '체력 2배, 공격력 +20%, 몸집이 커진다.', apply: f => { f.maxHp *= 2; f.atk *= 1.2; f.size = Math.max(f.size, 0.92) } },
]
export const AFFIX: Record<string, Affix> = Object.fromEntries(AFFIXES.map(a => [a.id, a]))
export function applyAffix(f: Fighter, id: string) {
  const a = AFFIX[id]
  if (!a) return
  a.apply(f)
  f.name = `${a.name} ${f.name}`
  f.glow = a.color
}

// ponytail: 난이도 곡선은 이 한 줄. scripts/levels.ts 라운드별 통계를 보고 조절.
// 무한 원정(16R~)은 15R 배율에서 n라운드 뒤 ×1.3ⁿ × 1.01^(n²): 오르는 폭도 커진다 (Balatro 엔드리스처럼 결국 따라잡힌다)
// 갈림길 보물 방: 그 라운드 편성에서 둘만 남기고 보물 고블린 셋
export function treasureWave(r: number, rng: Rng): Wave {
  const keep = makeWave(r, rng, {}).spawns.filter(sp => sp.tpl !== 'treasure').slice(0, 2)
  const free = [8, 9, 10, 11, 4, 5, 6, 7].filter(c => !keep.some(sp => sp.cell === c))
  const gob = free.slice(0, 3).map(cell => ({ tpl: 'treasure', cell, mult: enemyMult(r) }))
  return { label: '보물 창고', kind: 'normal', spawns: [...keep, ...gob], hint: '보물 고블린 셋 — 도망치기 전에 잡을수록 골드' }
}

// 무한 원정 방어력: 최대 체력 비례 효과(시체 폭발·처형 연쇄)도 결국 막히게 모든 피해를 줄인다
export const ENDLESS_ARMOR = 30
const quad = (r: number) => 1 + 0.35 * (r - 1) + 0.045 * (r - 1) ** 2
export const enemyMult = (r: number) => (r <= 15 ? quad(r) : quad(15) * 1.3 ** (r - 15) * 1.01 ** ((r - 15) ** 2))

export const ZONE = ['고블린 숲', '망자의 폐허', '심연의 문']
const COUNT = [2, 3, 3, 4, 0, 4, 5, 5, 6, 0, 6, 7, 7, 8, 0]
// 정예 라운드: 원정을 시작할 때 둘 중 하나로 정해 미리 보여 준다 (Slay the Spire 지도의 보스 표시처럼)
export const ELITES: Record<number, string[]> = { 5: ['troll', 'goblinking'], 10: ['scorpion', 'lich', 'gumiho'], 15: ['boss'] }
const ESCORT: Record<string, string[]> = {
  troll: ['goblin', 'goblin', 'thrower'], goblinking: ['goblin', 'thrower', 'thrower'],
  scorpion: ['orc', 'spider', 'skelarcher'], lich: ['wraith', 'skelarcher', 'skelarcher'], gumiho: ['dokkaebi', 'lantern', 'clubber'], boss: ['demon', 'demon', 'shaman'],
}
export const pickElites = (rng: Rng): Record<number, string> => ({ 5: pick(rng, ELITES[5]), 10: pick(rng, ELITES[10]), 15: 'boss' })
// 무한 원정: 20·30·40… 정예(넷 중 하나), 25·35·45… 최종 보스 재등장
export const endlessElites = (rng: Rng): Record<number, string> =>
  Object.fromEntries(Array.from({ length: 17 }, (_, i) => 20 + i * 5).map(r => [r, r % 10 === 5 ? 'boss' : pick(rng, [...ELITES[5], ...ELITES[10]])]))

// 구역별 편성: n = 이번 라운드 적 수. 각 편성은 기믹 하나를 가진다 (Slay the Spire의 구역별 조우 목록처럼).
interface Encounter { name: string; from: number; hint?: string; affixes?: number; make: (n: number, rng: Rng) => string[] }
const fill = (n: number, head: string[], rest: string[], rng: Rng) => [...head, ...Array.from({ length: Math.max(0, n - head.length) }, () => pick(rng, rest))].slice(0, n)
const ENCOUNTERS: Encounter[][] = [
  [
    { name: '고블린 약탈대', from: 1, make: (n, rng) => fill(n, ['thrower'], ['goblin', 'goblin', 'slime'], rng) },
    { name: '슬라임 둥지', from: 1, hint: '왕슬라임은 쓰러지면 둘로 나뉨', make: (n, rng) => fill(n, ['kingslime'], ['slime', 'kingslime', 'thrower'], rng) },
    { name: '도깨비 장난', from: 3, hint: '도깨비는 쓰러지면 도깨비불 둘이 튀어나와 터짐', make: (n, rng) => fill(n, ['dokkaebi'], ['goblin', 'dokkaebi', 'thrower'], rng) },
    { name: '자폭 부대', from: 3, hint: '자폭 고블린은 붙으면 터짐 — 멀리서 잡으면 적이 휘말림', make: (n, rng) => fill(n, ['bomber', 'goblin'], ['bomber', 'goblin', 'thrower'], rng) },
  ],
  [
    { name: '해골 궁수대', from: 6, make: (n, rng) => fill(n, ['orc', 'skelarcher', 'skelarcher'], ['orc', 'skelarcher', 'goblin'], rng) },
    { name: '강령 의식', from: 6, hint: '강령 사제가 해골을 계속 부름 — 먼저 노리기', make: (n, rng) => fill(n, ['priest', 'wraith'], ['priest', 'skelarcher', 'orc'], rng) },
    { name: '박쥐 떼', from: 7, hint: '박쥐가 후열로 날아듦', make: (n, rng) => fill(n, ['orc', 'shaman'], ['bat', 'bat', 'skelarcher'], rng) },
    { name: '강시 행렬', from: 7, hint: '강시는 때린 대상의 체력을 빨아들이고 둔화시킴', make: (n, rng) => fill(n, ['jiangshi', 'jiangshi', 'lantern'], ['jiangshi', 'skelarcher', 'lantern'], rng) },
    { name: '망령 기사단', from: 8, hint: '망령 기사는 한 번 되살아남', make: (n, rng) => fill(n, ['wraith', 'wraith', 'shaman'], ['wraith', 'skelarcher', 'priest'], rng) },
  ],
  [
    { name: '악마 군단', from: 11, affixes: 1, make: (n, rng) => fill(n, ['demon', 'demon', 'shaman'], ['demon', 'skelarcher', 'orc'], rng) },
    { name: '독거미 둥지', from: 11, affixes: 1, hint: '거미줄에 걸리면 2초 기절', make: (n, rng) => fill(n, ['orc', 'spider', 'spider'], ['spider', 'skelarcher', 'bat'], rng) },
    { name: '사령 군단', from: 12, affixes: 1, hint: '사제·기사가 망자를 계속 세움', make: (n, rng) => fill(n, ['priest', 'wraith', 'demon'], ['wraith', 'priest', 'skelarcher', 'demon'], rng) },
    { name: '백귀야행', from: 12, affixes: 1, hint: '동방 요괴 행렬 — 도깨비불·화상·보호막', make: (n, rng) => fill(n, ['dokkaebi', 'clubber', 'lantern'], ['dokkaebi', 'jiangshi', 'lantern', 'clubber'], rng) },
    { name: '심연 균열', from: 13, affixes: 2, hint: '접두사 정예 둘', make: (n, rng) => fill(n, ['demon', 'spider'], ['orc', 'demon', 'spider', 'bat', 'skelarcher', 'shaman', 'bomber'], rng) },
  ],
]
const TREASURE = 0.22

export function makeWave(r: number, rng: Rng, elites: Record<number, string> = { 5: 'troll', 10: 'scorpion', 15: 'boss' }): Wave {
  const m = enemyMult(r)
  const used = new Set<number>()
  // 적 칸: col 0 = 전열, 2 = 후열
  const S = (tpl: string, col = ENEMIES[tpl].range >= 3 || ENEMIES[tpl].flee ? 2 : 0): Spawn => {
    for (const c of [col, 1, 2 - col]) {
      for (const row of shuffle(rng, [0, 1, 2, 3])) {
        const cell = c * 4 + row
        if (!used.has(cell)) { used.add(cell); return { tpl, cell, mult: m, ...(r > 15 && { armor: ENDLESS_ARMOR * (r - 15) }) } }
      }
    }
    return { tpl, cell: 0, mult: m }
  }
  const endless = Math.max(0, r - 15) // 무한 원정 라운드 수
  const boss = elites[r] ?? (r === 15 ? 'boss' : undefined)
  if (boss) {
    const kind = boss === 'boss' ? 'boss' : 'elite'
    const spawns = [S(boss, 1), ...ESCORT[boss].map(t => S(t))]
    if (endless) for (const sp of spawns) sp.aff = pick(rng, AFFIXES).id
    return { label: `${kind === 'boss' ? '최종 보스' : '정예'} · ${ENEMIES[boss].name}`, kind, spawns, hint: `${ENEMIES[boss].skillName}: ${ENEMIES[boss].skillDesc}` }
  }
  const z = r < 5 ? 0 : r < 10 ? 1 : 2
  const enc = pickW(rng, ENCOUNTERS[z].filter(e => r >= e.from), () => 1)
  const spawns = enc.make(endless ? Math.min(12, 8 + Math.floor(endless / 3)) : COUNT[r - 1], rng).map(t => S(t))
  // 무한 원정은 접두사가 3라운드마다 하나씩 더 붙는다
  for (const sp of shuffle(rng, [...spawns]).slice(0, (enc.affixes ?? 0) + Math.ceil(endless / 3))) sp.aff = pick(rng, AFFIXES).id
  const hints = enc.hint ? [enc.hint] : []
  if (r >= 2 && rand(rng) < TREASURE) { spawns.push(S('treasure')); hints.push('보물 고블린: 10초 안에 잡으면 골드') }
  return { label: `${ZONE[z]} · ${enc.name}`, kind: 'normal', spawns, hint: hints.join(' · ') || undefined }
}
