// 전투 시뮬레이션. UI와 무관하게 step()만 돌리면 결과가 나온다 (헤드리스 테스트 가능).
// 증강체·시너지·아이템은 모두 Mod 훅으로 끼어든다 → 새 효과는 데이터 파일에 훅만 추가하면 된다.
import type { UnitTpl, TraitId } from './data/units.ts'
import { mkRng, rand, type Rng } from './rng.ts'

export type Side = 0 | 1
export const W = 9
export const H = 4
export const STEP = 1 / 60
export const STAR_MULT = [1, 1.8, 3.24]
const MAX_T = 60
const OVERTIME_T = 30
const START_T = 0.5
const CAP = 36 // 한 진영 최대 유닛 수 (소환 폭주 상한)

export interface Buff { t: number; as?: number; dmg?: number; armor?: number }

export interface DmgInfo {
  kind: 'atk' | 'skill' | 'proc'
  canCrit?: boolean
  force?: boolean // 확정 치명
  noMult?: boolean // 공격자 배율 재적용 안 함 (튕김·폭발)
  depth?: number // 연쇄 깊이
  raw?: number // damage()가 채움: 치명·방어 적용 전 피해
}

export interface CastInfo { echo?: boolean; ring?: boolean }

export interface Mod {
  id: string
  onStart?(b: Battle, side: Side): void
  onAttack?(b: Battle, f: Fighter, t: Fighter): void
  onHit?(b: Battle, src: Fighter, t: Fighter, dealt: number, info: DmgInfo): void
  onCrit?(b: Battle, src: Fighter, t: Fighter, dealt: number, info: DmgInfo): void
  onCast?(b: Battle, f: Fighter, info: CastInfo): void
  onDamaged?(b: Battle, f: Fighter, src: Fighter | null, dealt: number): void
  onLethal?(b: Battle, f: Fighter): boolean // true면 죽음을 막는다
  onAllyDeath?(b: Battle, dead: Fighter, killer: Fighter | null): void
  onEnemyDeath?(b: Battle, dead: Fighter, killer: Fighter | null): void
}

export interface Fighter {
  uid: number
  side: Side
  tpl: UnitTpl
  star: number
  name: string
  emoji: string
  traits: TraitId[]
  x: number
  y: number
  size: number
  hp: number
  maxHp: number
  shield: number
  atk: number
  as: number
  range: number
  armor: number
  speed: number
  crit: number
  critDmg: number
  mana: number
  maxMana: number
  manaGain: number
  spell: number
  dmgMult: number
  asBonus: number
  lifesteal: number
  overheal: boolean
  skillCrit: boolean
  cd: number
  retarget: number
  target: Fighter | null
  alive: boolean
  summoned: boolean
  gen: number
  boss: boolean
  stunT: number
  slowT: number
  invulnT: number
  buffs: Buff[]
  st: Record<string, number> // 훅이 쓰는 개별 상태
  own: Mod[] // 이 유닛에만 붙는 훅 (아이템, 고유 패시브)
  dealt: number
  owner: number | null // 런의 OwnedUnit.id (피해 집계용)
}

// 연출 이벤트. 규칙에는 영향 없고 UI(arena.ts)만 읽는다.
export type FxStyle = 'fire' | 'ice' | 'earth' | 'blade' | 'roar' | 'holy' | 'spirit' | 'poison' | 'dark' | 'shock' | 'shield' | 'snipe'
export type Fx =
  | { k: 'hit'; uid: number; x: number; y: number; v: number; crit: boolean; kind: DmgInfo['kind']; side: Side; pct: number; sx?: number; sy?: number }
  | { k: 'heal'; uid: number; x: number; y: number; v: number }
  | { k: 'shot'; x1: number; y1: number; x2: number; y2: number; color: string; style?: FxStyle }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { k: 'ring'; x: number; y: number; r: number; color: string; style?: FxStyle }
  | { k: 'text'; x: number; y: number; text: string; color: string }
  | { k: 'atk'; uid: number; tx: number; ty: number; ranged: boolean }
  | { k: 'cast'; uid: number; copy: boolean }
  | { k: 'death'; uid: number; tpl: string; x: number; y: number; emoji: string; size: number; side: Side; boss: boolean; summoned: boolean }
  | { k: 'spawn'; uid: number }
  | { k: 'tele'; uid: number; x1: number; y1: number }
  | { k: 'aug'; id: string; x: number; y: number; uid: number }
  | { k: 'banner'; text: string; color: string }
  | { k: 'shake'; v: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const dist = (a: { x: number; y: number }, x: number, y: number) => Math.hypot(a.x - x, a.y - y)

export function makeFighter(tpl: UnitTpl, star: number, side: Side, x: number, y: number, mult = 1): Fighter {
  const m = STAR_MULT[star - 1] * mult
  return {
    uid: 0, side, tpl, star, name: tpl.name, emoji: tpl.emoji, traits: [...tpl.traits],
    x, y, size: tpl.boss ? 1.15 : (tpl.size ?? 0.72),
    hp: tpl.hp * m, maxHp: tpl.hp * m, shield: 0,
    atk: tpl.atk * m, as: tpl.as, range: tpl.range, armor: tpl.armor, speed: tpl.speed ?? 1.8,
    crit: tpl.crit ?? 0.1, critDmg: 1.5,
    mana: tpl.startMana ?? 0, maxMana: tpl.mana, manaGain: 1,
    spell: 1, dmgMult: 1, asBonus: 0, lifesteal: 0, overheal: false, skillCrit: false,
    cd: 0.15, retarget: 0, target: null,
    alive: true, summoned: false, gen: 0, boss: !!tpl.boss,
    stunT: 0, slowT: 0, invulnT: 0, buffs: [], st: { mult }, own: tpl.own?.() ?? [], dealt: 0, owner: null,
  }
}

export class Battle {
  t = 0
  fighters: Fighter[] = []
  fx: Fx[] = []
  keepFx = false // UI가 켠다. 헤드리스에선 매 스텝 비움
  counts: Record<string, number> = {}
  maxHit = 0
  done = false
  win = false
  readonly mods: [Mod[], Mod[]]
  readonly slots: number
  private q: { t: number; fn: () => void }[] = []
  private rng: Rng
  private uid = 1
  private seen = new Map<string, number>()

  constructor(mods: [Mod[], Mod[]], seed: number, slots = 8) {
    this.mods = mods
    this.rng = mkRng(seed)
    this.slots = slots
  }

  r() { return rand(this.rng) }
  foe(f: Fighter): Side { return (1 - f.side) as Side }

  add(tpl: UnitTpl, star: number, side: Side, x: number, y: number, mult = 1): Fighter {
    const f = makeFighter(tpl, star, side, x, y, mult)
    f.uid = this.uid++
    this.fighters.push(f)
    return f
  }

  start() {
    for (const side of [0, 1] as const) for (const m of this.mods[side]) m.onStart?.(this, side)
    for (const f of this.fighters) f.hp = f.maxHp
  }

  get overtime() { return this.t > OVERTIME_T ? 1 + (this.t - OVERTIME_T) * 0.25 : 1 }

  step(dt = STEP) {
    if (this.done) return
    if (!this.keepFx) this.fx.length = 0
    this.t += dt
    if (this.q.length) {
      const due = this.q.filter(e => (e.t -= dt) <= 0)
      if (due.length) {
        this.q = this.q.filter(e => e.t > 0)
        for (const e of due) e.fn()
      }
    }
    const n = this.t < START_T ? 0 : this.fighters.length // 시작 직후 잠깐은 배치를 보여 준다
    for (let i = 0; i < n; i++) {
      const f = this.fighters[i]
      if (f.alive) this.tick(f, dt)
    }
    this.separate()
    let a0 = false, a1 = false
    for (const f of this.fighters) if (f.alive) f.side === 0 ? (a0 = true) : (a1 = true)
    if (!a0 || !a1) { this.done = true; this.win = a0 }
    else if (this.t >= MAX_T) { this.done = true; this.win = this.hpFrac(0) > this.hpFrac(1) }
  }

  private tick(f: Fighter, dt: number) {
    if (f.buffs.length) f.buffs = f.buffs.filter(b => (b.t -= dt) > 0)
    if (f.invulnT > 0) f.invulnT -= dt
    if (f.slowT > 0) f.slowT -= dt
    if (f.stunT > 0) { f.stunT -= dt; return }
    if (f.cd > 0) f.cd -= dt
    if (f.maxMana > 0 && f.mana >= f.maxMana) { this.cast(f); return }
    if (!f.target?.alive || (f.retarget -= dt) <= 0) {
      f.target = this.nearest(f.x, f.y, this.foe(f))
      f.retarget = 0.5
    }
    const t = f.target
    if (!t) return
    const d = dist(t, f.x, f.y)
    const reach = f.range + (t.size - 0.72) * 0.5
    if (d > reach) {
      const sp = Math.min(f.speed * (f.slowT > 0 ? 0.6 : 1) * dt, d - reach + 0.01)
      f.x += ((t.x - f.x) / d) * sp
      f.y += ((t.y - f.y) / d) * sp
    } else if (f.cd <= 0) {
      this.attack(f, t)
      f.cd = 1 / this.atkSpeed(f)
    }
  }

  atkSpeed(f: Fighter) {
    let b = 1 + f.asBonus
    for (const x of f.buffs) b += x.as ?? 0
    return clamp(f.as * b * (f.slowT > 0 ? 0.5 : 1), 0.2, 10)
  }

  dmgMul(f: Fighter) {
    let m = f.dmgMult
    for (const x of f.buffs) m += x.dmg ?? 0
    return m
  }

  private attack(f: Fighter, t: Fighter) {
    this.emit({ k: 'atk', uid: f.uid, tx: t.x, ty: t.y, ranged: f.range >= 2 })
    if (f.range >= 2) this.emit({ k: 'shot', x1: f.x, y1: f.y, x2: t.x, y2: t.y, color: f.side ? '#ff8a80' : '#8be9ff' })
    this.damage(f, t, f.atk, { kind: 'atk', canCrit: true })
    if (f.maxMana > 0) f.mana += 10 * f.manaGain
    if (!f.alive) return
    for (const m of this.mods[f.side]) m.onAttack?.(this, f, t)
    for (const m of f.own) m.onAttack?.(this, f, t)
  }

  private cast(f: Fighter) {
    f.mana = 0
    this.recast(f, {})
  }

  // 스킬 발동 (메아리·반지의 재발동도 이 경로)
  recast(f: Fighter, info: CastInfo) {
    if (!f.alive || !f.tpl.skill) return
    const tag = info.echo ? '↻ ' : info.ring ? '↺ ' : ''
    this.emit({ k: 'cast', uid: f.uid, copy: !!tag })
    this.emit({ k: 'text', x: f.x, y: f.y - f.size * 0.95, text: tag + f.tpl.skillName, color: tag ? '#ffd166' : '#c9b6ff' })
    f.tpl.skill(this, f)
    f.st.casts = (f.st.casts ?? 0) + 1
    for (const m of this.mods[f.side]) m.onCast?.(this, f, info)
    for (const m of f.own) m.onCast?.(this, f, info)
  }

  damage(src: Fighter | null, t: Fighter, base: number, info: DmgInfo): number {
    if (!t.alive || !(base > 0)) return 0
    let v = base
    if (src && !info.noMult) {
      v *= this.dmgMul(src)
      if (info.kind === 'skill') v *= src.spell
    }
    info.raw = v
    let crit = false
    if (src && (info.force || ((info.canCrit || (info.kind === 'skill' && src.skillCrit)) && this.r() < src.crit))) {
      crit = true
      v *= src.critDmg
    }
    let armor = t.armor
    for (const x of t.buffs) armor += x.armor ?? 0
    v *= (this.overtime * 100) / (100 + Math.max(-50, armor))
    if (t.invulnT > 0) { this.label(t, '무적', '#ffd54a'); return 0 }
    const dealt = v
    if (t.shield > 0) {
      const a = Math.min(t.shield, v)
      t.shield -= a
      v -= a
    }
    t.hp -= v
    if (t.maxMana > 0 && !t.boss) t.mana += Math.min(10, (dealt / t.maxHp) * 70) * t.manaGain
    this.emit({ k: 'hit', uid: t.uid, x: t.x, y: t.y, v: dealt, crit, kind: info.kind, side: t.side, pct: dealt / t.maxHp, sx: src?.x, sy: src?.y })
    if (src) {
      src.dealt += dealt
      if (src.side === 0 && dealt > this.maxHit) this.maxHit = dealt
      if (src.lifesteal > 0 && src.alive) this.heal(src, dealt * src.lifesteal)
      for (const m of this.mods[src.side]) m.onHit?.(this, src, t, dealt, info)
      for (const m of src.own) m.onHit?.(this, src, t, dealt, info)
      if (crit) {
        for (const m of this.mods[src.side]) m.onCrit?.(this, src, t, dealt, info)
        for (const m of src.own) m.onCrit?.(this, src, t, dealt, info)
      }
    }
    for (const m of this.mods[t.side]) m.onDamaged?.(this, t, src, dealt)
    for (const m of t.own) m.onDamaged?.(this, t, src, dealt)
    if (t.alive && t.hp <= 0) this.kill(t, src)
    return dealt
  }

  kill(t: Fighter, src: Fighter | null) {
    if (!t.alive) return
    for (const m of [...this.mods[t.side], ...t.own]) {
      if (m.onLethal?.(this, t)) {
        if (t.hp <= 0) t.hp = 1
        return
      }
    }
    t.alive = false
    t.hp = 0
    t.shield = 0
    this.emit({ k: 'death', uid: t.uid, tpl: t.tpl.id, x: t.x, y: t.y, emoji: t.emoji, size: t.size, side: t.side, boss: t.boss, summoned: t.summoned })
    for (const m of this.mods[this.foe(t)]) m.onEnemyDeath?.(this, t, src)
    for (const m of this.mods[t.side]) m.onAllyDeath?.(this, t, src)
  }

  heal(f: Fighter, v: number) {
    if (!f.alive || !(v > 0)) return
    const room = f.maxHp - f.hp
    f.hp += Math.min(room, v)
    if (v > room && f.overheal) f.shield = Math.min(f.maxHp * 0.6, f.shield + v - room)
    if (v > f.maxHp * 0.06) this.emit({ k: 'heal', uid: f.uid, x: f.x, y: f.y, v })
  }

  summon(side: Side, tpl: UnitTpl, x: number, y: number,
    stats: Partial<Pick<Fighter, 'maxHp' | 'atk' | 'as' | 'range' | 'crit' | 'critDmg'>> = {}): Fighter | null {
    if (this.alive(side).length >= CAP) return null
    const f = this.add(tpl, 1, side, clamp(x + (this.r() - 0.5) * 0.4, 0.3, W - 0.3), clamp(y + (this.r() - 0.5) * 0.4, 0.3, H - 0.3))
    Object.assign(f, stats)
    f.hp = f.maxHp
    f.summoned = true
    f.cd = 0.3
    this.emit({ k: 'spawn', uid: f.uid })
    return f
  }

  later(t: number, fn: () => void) { this.q.push({ t, fn }) }
  // 발동 횟수 집계. at을 주면 그 자리에서 증강체 고유 연출이 나온다.
  count(id: string, at?: Fighter) {
    this.counts[id] = (this.counts[id] ?? 0) + 1
    if (at) this.emit({ k: 'aug', id, x: at.x, y: at.y, uid: at.uid })
  }

  // 순간이동 (연출용 출발 지점 기록)
  teleport(f: Fighter, x: number, y: number) {
    this.emit({ k: 'tele', uid: f.uid, x1: f.x, y1: f.y })
    f.x = x // 경계는 다음 step의 separate()가 맞춘다
    f.y = y
  }
  emit(e: Fx) { if (this.keepFx && this.fx.length < 600) this.fx.push(e) }

  // 같은 유닛 위 같은 글자는 0.6초에 한 번만
  label(f: Fighter, text: string, color: string) {
    const key = f.uid + text
    if (this.t - (this.seen.get(key) ?? -9) < 0.6) return
    this.seen.set(key, this.t)
    this.emit({ k: 'text', x: f.x, y: f.y - f.size * 0.95, text, color })
  }

  banner(text: string, color: string) {
    if (this.t - (this.seen.get(text) ?? -9) < 2) return
    this.seen.set(text, this.t)
    this.emit({ k: 'banner', text, color })
  }

  alive(side: Side) { return this.fighters.filter(f => f.alive && f.side === side) }

  nearest(x: number, y: number, side: Side, ok?: (f: Fighter) => boolean, maxR = Infinity): Fighter | null {
    let best: Fighter | null = null
    let bd = maxR
    for (const f of this.fighters) {
      if (!f.alive || f.side !== side || (ok && !ok(f))) continue
      const d = dist(f, x, y)
      if (d < bd) { bd = d; best = f }
    }
    return best
  }

  nearestN(x: number, y: number, side: Side, n: number, maxR: number, exclude?: Fighter): Fighter[] {
    return this.fighters
      .filter(f => f.alive && f.side === side && f !== exclude && dist(f, x, y) <= maxR)
      .sort((a, b) => dist(a, x, y) - dist(b, x, y))
      .slice(0, n)
  }

  inRadius(x: number, y: number, r: number, side: Side) {
    return this.fighters.filter(f => f.alive && f.side === side && dist(f, x, y) <= r + f.size * 0.3)
  }

  lowest(side: Side): Fighter | null {
    let best: Fighter | null = null
    for (const f of this.fighters) if (f.alive && f.side === side && (!best || f.hp / f.maxHp < best.hp / best.maxHp)) best = f
    return best
  }

  // side 진영의 가장 뒤쪽 유닛 (플레이어는 왼쪽, 적은 오른쪽이 후열)
  backline(side: Side): Fighter | null {
    let best: Fighter | null = null
    for (const f of this.fighters) {
      if (!f.alive || f.side !== side) continue
      if (!best || (side === 1 ? f.x > best.x : f.x < best.x)) best = f
    }
    return best
  }

  hpFrac(side: Side) {
    let hp = 0, max = 0
    for (const f of this.fighters) if (f.side === side) { max += f.maxHp; if (f.alive) hp += f.hp }
    return max ? hp / max : 0
  }

  // ponytail: O(n²) 밀어내기, 한 진영 36기 상한이라 충분. 넘치면 격자 버킷으로.
  private separate() {
    const a = this.fighters.filter(f => f.alive)
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const p = a[i], q = a[j]
        let dx = q.x - p.x, dy = q.y - p.y
        let d = Math.hypot(dx, dy)
        const min = (p.size + q.size) * 0.5
        if (d >= min) continue
        if (d < 1e-4) { dx = this.r() - 0.5; dy = this.r() - 0.5; d = Math.hypot(dx, dy) }
        const push = ((min - d) / 2) * 0.5
        p.x -= (dx / d) * push; p.y -= (dy / d) * push
        q.x += (dx / d) * push; q.y += (dy / d) * push
      }
    }
    for (const f of a) { f.x = clamp(f.x, 0.3, W - 0.3); f.y = clamp(f.y, 0.3, H - 0.3) }
  }
}
