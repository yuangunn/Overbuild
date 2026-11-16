import type { Fighter, Mod } from '../battle.ts'

export interface ItemDef { id: string; name: string; emoji: string; desc: string; apply: (f: Fighter) => void }

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

export const ITEM: Record<string, ItemDef> = Object.fromEntries(ITEMS.map(i => [i.id, i]))
