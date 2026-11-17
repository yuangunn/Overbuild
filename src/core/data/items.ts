import type { Fighter, Mod } from '../battle.ts'

// from: 조합 아이템의 재료 두 개 (기본 아이템엔 없음)
export interface ItemDef { id: string; name: string; emoji: string; desc: string; apply: (f: Fighter) => void; from?: [string, string] }

const rune: Mod = {
  id: 'rune',
  onAttack(b, f, t) {
    if (b.r() >= 0.3) return
    b.count('rune', t)
    b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.2, color: '#ff7043', style: 'fire' })
    for (const e of b.inRadius(t.x, t.y, 1.2, t.side)) b.damage(f, e, f.atk * 1.2, { kind: 'proc' })
  },
}

// 메아리 증강체와 곱해진다: 원본 → 메아리 + 반지 → 반지의 메아리 = 4회
const ring: Mod = {
  id: 'ring',
  onCast(b, f, info) {
    if (info.ring || info.echo) return
    b.later(0.2, () => { if (!f.alive) return; b.count('ring', f); b.recast(f, { ...info, ring: true }) })
  },
}

export const ITEMS: ItemDef[] = [
  { id: 'sword', name: '거인의 대검', emoji: '⚔️', desc: '공격력 +40%', apply: f => { f.atk *= 1.4 } },
  { id: 'feather', name: '바람 깃털', emoji: '🌬️', desc: '공격 속도 +35%', apply: f => { f.asBonus += 0.35 } },
  { id: 'helm', name: '강철 투구', emoji: '⛑️', desc: '체력 +45%, 방어력 +20', apply: f => { f.maxHp *= 1.45; f.armor += 20 } },
  { id: 'crystal', name: '마나 수정', emoji: '💎', desc: '마나 50%로 시작, 마나 획득 +25%', apply: f => { f.mana += f.maxMana * 0.5; f.manaGain += 0.25 } },
  { id: 'dice', name: '암살자의 주사위', emoji: '🎲', desc: '치명타 확률 +25%, 치명타 피해 +30%', apply: f => { f.crit += 0.25; f.critDmg += 0.3 } },
  { id: 'fang', name: '흡혈 송곳니', emoji: '🦷', desc: '흡혈 30%', apply: f => { f.lifesteal += 0.3 } },
  { id: 'charm', name: '수호 부적', emoji: '📿', desc: '전투 시작 시 최대 체력 40% 보호막', apply: f => { f.shield += f.maxHp * 0.4 } },
  { id: 'rune', name: '폭발 룬', emoji: '🧨', desc: '기본 공격 시 30% 확률로 주변 폭발 (공격력 120%)', apply: f => { f.own.push(rune) } },
  { id: 'ring', name: '쌍둥이 반지', emoji: '💍', desc: '이 유닛의 스킬이 한 번 더 발동한다', apply: f => { f.own.push(ring) } },
]

// ── 조합 아이템 (TFT처럼 한 유닛에 재료 두 개가 모이면 자동으로 합쳐져 한 칸만 쓴다)
// 재료 둘의 효과를 모두 갖고 고유 효과가 하나 더 붙는다.
const B = Object.fromEntries(ITEMS.map(i => [i.id, i.apply]))
const recast = (n: number): Mod => ({
  id: 'ring',
  onCast(b, f, info) {
    if (info.ring || info.echo) return
    for (let i = 1; i <= n; i++) b.later(0.2 * i, () => { if (!f.alive) return; b.count('ring', f); b.recast(f, { ...info, ring: true }) })
  },
})
const foeSide = (f: Fighter) => (1 - f.side) as 0 | 1

export const COMBOS: ItemDef[] = [
  {
    id: 'execblade', name: '처형자의 검', emoji: '🗡️', from: ['sword', 'dice'],
    desc: '공격력 +40%, 치명타 확률 +25%, 치명타 피해 +30%. 치명타가 대상 최대 체력 4%를 더 깎는다.',
    apply: f => { B.sword(f); B.dice(f); f.own.push({ id: 'execblade', onCrit(b, src, t, _d, info) { if (info.kind !== 'proc') b.damage(src, t, t.maxHp * 0.04, { kind: 'proc', noMult: true }) } }) },
  },
  {
    id: 'stormrune', name: '폭풍 룬', emoji: '🌩️', from: ['feather', 'rune'],
    desc: '공격 속도 +35%. 기본 공격마다 주변이 폭발한다 (공격력 120%).',
    apply: f => {
      B.feather(f)
      f.own.push({
        id: 'rune',
        onAttack(b, f, t) {
          b.count('rune', t)
          b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.2, color: '#ff7043', style: 'fire' })
          for (const e of b.inRadius(t.x, t.y, 1.2, t.side)) b.damage(f, e, f.atk * 1.2, { kind: 'proc' })
        },
      })
    },
  },
  {
    id: 'bastion', name: '불굴의 성채', emoji: '🏰', from: ['helm', 'charm'],
    desc: '체력 +45%, 방어력 +20, 시작 보호막 40%. 보호막이 처음 다 깨지면 최대 체력 40% 보호막을 다시 얻는다.',
    apply: f => {
      B.helm(f); B.charm(f)
      f.own.push({ id: 'bastion', onDamaged(b, f) { if (!f.st.bastion && f.shield <= 0 && f.alive) { f.st.bastion = 1; f.shield += f.maxHp * 0.4; b.label(f, '성채!', '#7fb4ff') } } })
    },
  },
  {
    id: 'infinity', name: '무한의 고리', emoji: '♾️', from: ['crystal', 'ring'],
    desc: '마나 50%로 시작, 마나 획득 +25%. 스킬이 두 번 더 발동한다.',
    apply: f => { B.crystal(f); f.own.push(recast(2)) },
  },
  {
    id: 'bloodthirst', name: '피의 갈증', emoji: '🩸', from: ['fang', 'sword'],
    desc: '공격력 +40%, 흡혈 30%. 체력이 가득 차면 넘친 회복이 보호막이 된다 (최대 체력 60%까지).',
    apply: f => { B.sword(f); B.fang(f); f.overheal = true },
  },
  {
    id: 'luckyring', name: '행운의 반지', emoji: '🍀', from: ['dice', 'ring'],
    desc: '치명타 확률 +25%, 치명타 피해 +30%. 스킬도 치명타가 터지고, 한 번 더 발동한다.',
    apply: f => { B.dice(f); f.skillCrit = true; f.own.push(recast(1)) },
  },
  {
    id: 'oath', name: '생명의 서약', emoji: '💗', from: ['charm', 'fang'],
    desc: '시작 보호막 40%, 흡혈 30%. 쓰러지면 주변 아군이 각자 최대 체력 40%를 회복한다.',
    apply: f => {
      B.charm(f); B.fang(f)
      f.own.push({
        id: 'oath',
        onDeath(b, d) {
          b.emit({ k: 'ring', x: d.x, y: d.y, r: 2.5, color: '#ff9ecb', style: 'holy' })
          for (const a of b.inRadius(d.x, d.y, 2.5, d.side)) b.heal(a, a.maxHp * 0.4)
        },
      })
    },
  },
  {
    id: 'arcburst', name: '마력 폭발', emoji: '💥', from: ['rune', 'crystal'],
    desc: '마나 50%로 시작, 마나 획득 +25%. 스킬을 쓸 때마다 대상 주변이 크게 폭발한다 (공격력 250%).',
    apply: f => {
      B.crystal(f)
      f.own.push({
        id: 'arcburst',
        onCast(b, f) {
          const t = f.target?.alive ? f.target : b.nearest(f.x, f.y, foeSide(f))
          if (!t) return
          b.count('arcburst', f)
          b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.5, color: '#c9b6ff', style: 'spirit' })
          for (const e of b.inRadius(t.x, t.y, 1.5, t.side)) b.damage(f, e, f.atk * 2.5, { kind: 'proc' })
        },
      })
    },
  },
  {
    id: 'titan', name: '거인의 결의', emoji: '🗿', from: ['helm', 'sword'],
    desc: '공격력 +40%, 체력 +45%, 방어력 +20. 피해를 받을 때마다 피해량 +1% (50번까지).',
    apply: f => { B.sword(f); B.helm(f); f.own.push({ id: 'titan', onDamaged(_b, f) { if ((f.st.titan ?? 0) < 50) { f.st.titan = (f.st.titan ?? 0) + 1; f.dmgMult += 0.01 } } }) },
  },
  {
    id: 'quickdraw', name: '신속의 화살', emoji: '🏹', from: ['feather', 'dice'],
    desc: '공격 속도 +35%, 치명타 확률 +25%, 치명타 피해 +30%. 치명타마다 공격 속도 +4% (15번까지).',
    apply: f => { B.feather(f); B.dice(f); f.own.push({ id: 'quickdraw', onCrit(_b, f, _t, _d, info) { if (info.kind !== 'proc' && (f.st.qd ?? 0) < 15) { f.st.qd = (f.st.qd ?? 0) + 1; f.asBonus += 0.04 } } }) },
  },
]

export const ITEM: Record<string, ItemDef> = Object.fromEntries([...ITEMS, ...COMBOS].map(i => [i.id, i]))
export const recipeOf = (a: string, b: string) => COMBOS.find(c => (c.from![0] === a && c.from![1] === b) || (c.from![0] === b && c.from![1] === a))

// 재료가 모이면 합친다 (앞에서부터, 이미 합친 아이템은 재료가 아니다)
export function combine(items: string[]): string[] {
  const out = [...items]
  for (let again = true; again;) {
    again = false
    for (let i = 0; i < out.length && !again; i++) for (let j = i + 1; j < out.length && !again; j++) {
      const c = recipeOf(out[i], out[j])
      if (c) { out.splice(j, 1); out.splice(i, 1, c.id); again = true }
    }
  }
  return out
}
