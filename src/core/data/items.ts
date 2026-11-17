import type { Battle, Fighter, Mod } from '../battle.ts'

// from: 조합 아이템의 재료 두 개 (기본 아이템엔 없음)
// tier: 숨은 아이템. 찬란한 아이템(조합 아이템의 강화판, base = 원래 조합 아이템)·유물(조합되지 않는 고유 아이템)
export interface ItemDef { id: string; name: string; emoji: string; desc: string; apply: (f: Fighter) => void; from?: [string, string]; tier?: 'radiant' | 'relic'; base?: string }

// k: 효과 배수. 기본·조합 아이템은 1, 찬란한 아이템은 2 (TFT 찬란한 아이템처럼 수치가 두 배)
type Fx = (f: Fighter, k: number) => void
const n = (v: number) => Math.round(v * 100) / 100
const foeSide = (f: Fighter) => (1 - f.side) as 0 | 1
const own = (f: Fighter, m: Mod) => { f.own.push(m) }
// 체력 비율이 가장 낮은 다른 아군
const weakAlly = (b: Battle, f: Fighter) => b.alive(f.side).filter(a => a !== f).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]

// 폭발 (폭발 룬 계열). then: 폭발에 맞은 적마다 추가 효과
function blast(b: Battle, f: Fighter, x: number, y: number, r: number, mult: number, then?: (e: Fighter) => void) {
  b.emit({ k: 'ring', x, y, r, color: '#ff7043', style: 'fire' })
  for (const e of b.inRadius(x, y, r, foeSide(f))) { b.damage(f, e, f.atk * mult, { kind: 'proc' }); then?.(e) }
}
const boom = (p: number, mult: number, extra?: (b: Battle, f: Fighter, t: Fighter) => void): Mod => ({
  id: 'rune',
  onAttack(b, f, t) {
    if (b.r() >= p) return
    b.count('rune', t)
    blast(b, f, t.x, t.y, 1.2, mult)
    extra?.(b, f, t)
  },
})
// 메아리 증강체와 곱해진다: 원본 → 메아리 + 반지 → 반지의 메아리
const recast = (k: number): Mod => ({
  id: 'ring',
  onCast(b, f, info) {
    if (info.ring || info.echo) return
    for (let i = 1; i <= k; i++) b.later(0.2 * i, () => { if (!f.alive) return; b.count('ring', f); b.recast(f, { ...info, ring: true }) })
  },
})
// 한 번만 터지는 조건 (체력이 처음 x 아래로, 보호막이 처음 다 깨지면 …)
const once = (f: Fighter, key: string, ok: boolean) => { if (!ok || f.st[key] || !f.alive) return false; f.st[key] = 1; return true }

const BASE: Record<string, { name: string; emoji: string; text: (k: number) => string; fx: Fx }> = {
  sword: { name: '거인의 대검', emoji: '⚔️', text: k => `공격력 +${n(40 * k)}%`, fx: (f, k) => { f.atk *= 1 + 0.4 * k } },
  feather: { name: '바람 깃털', emoji: '🌬️', text: k => `공격 속도 +${n(35 * k)}%`, fx: (f, k) => { f.asBonus += 0.35 * k } },
  helm: { name: '강철 투구', emoji: '⛑️', text: k => `체력 +${n(45 * k)}%, 방어력 +${n(20 * k)}`, fx: (f, k) => { f.maxHp *= 1 + 0.45 * k; f.armor += 20 * k } },
  crystal: { name: '마나 수정', emoji: '💎', text: k => `${k >= 2 ? '마나 가득 찬 채' : `마나 ${n(50 * k)}%로`} 시작, 마나 획득 +${n(25 * k)}%`, fx: (f, k) => { f.mana += f.maxMana * Math.min(1, 0.5 * k); f.manaGain += 0.25 * k } },
  dice: { name: '암살자의 주사위', emoji: '🎲', text: k => `치명타 확률 +${n(25 * k)}%, 치명타 피해 +${n(30 * k)}%`, fx: (f, k) => { f.crit += 0.25 * k; f.critDmg += 0.3 * k } },
  fang: { name: '흡혈 송곳니', emoji: '🦷', text: k => `흡혈 ${n(30 * k)}%`, fx: (f, k) => { f.lifesteal += 0.3 * k } },
  charm: { name: '수호 부적', emoji: '📿', text: k => `전투 시작 시 최대 체력 ${n(40 * k)}% 보호막`, fx: (f, k) => { f.shield += f.maxHp * 0.4 * k } },
  rune: { name: '폭발 룬', emoji: '🧨', text: k => `기본 공격 시 ${n(Math.min(100, 30 * k))}% 확률로 주변 폭발 (공격력 120%)`, fx: (f, k) => own(f, boom(Math.min(1, 0.3 * k), 1.2)) },
  ring: { name: '쌍둥이 반지', emoji: '💍', text: k => (k > 1 ? `스킬이 ${k}번 더 발동` : '이 유닛의 스킬이 한 번 더 발동한다'), fx: (f, k) => own(f, recast(k)) },
}

export const ITEMS: ItemDef[] = Object.entries(BASE).map(([id, d]) => ({ id, name: d.name, emoji: d.emoji, desc: d.text(1), apply: f => d.fx(f, 1) }))

// ── 조합 아이템 (TFT처럼 기본 아이템 두 개면 무엇이든 합쳐져 한 칸만 쓴다: 9종 → 45종)
// 재료 둘의 효과(skip이면 그 재료는 빼고)에 고유 효과가 붙는다. 같은 재료 둘이면 그 재료 효과가 두 배.
interface Combo { id: string; name: string; emoji: string; from: [string, string]; text: (k: number) => string; fx: Fx; skip?: string; dbl?: number }
const C = (id: string, name: string, emoji: string, from: [string, string], text: Combo['text'], fx: Fx, o: Pick<Combo, 'skip' | 'dbl'> = {}): Combo => ({ id, name, emoji, from, text, fx, ...o })

const SPECS: Combo[] = [
  // 원래 있던 10종
  // 상한: 최대 체력 비례라 무한 원정의 적 체력과 함께 끝없이 커진다. 1~15R에는 걸리지 않는 값(보스 상대로도 공격력의 25배 안팎)
  C('execblade', '처형자의 검', '🗡️', ['sword', 'dice'], k => `치명타가 대상 최대 체력 ${n(4 * k)}%를 더 깎는다 (공격력의 ${30 * k}배까지).`,
    (f, k) => own(f, { id: 'execblade', onCrit(b, src, t, _d, info) { if (info.kind !== 'proc') b.damage(src, t, Math.min(t.maxHp * 0.04 * k, src.atk * 30 * k), { kind: 'proc', noMult: true }) } })),
  C('stormrune', '폭풍 룬', '🌩️', ['feather', 'rune'], k => `기본 공격마다 주변이 폭발한다 (공격력 ${n(120 * k)}%).`,
    (f, k) => own(f, boom(1, 1.2 * k)), { skip: 'rune' }),
  C('bastion', '불굴의 성채', '🏰', ['helm', 'charm'], k => `보호막이 처음 다 깨지면 최대 체력 ${n(40 * k)}% 보호막을 다시 얻는다.`,
    (f, k) => own(f, { id: 'bastion', onDamaged(b, f) { if (once(f, 'bastion', f.shield <= 0)) { f.shield += f.maxHp * 0.4 * k; b.label(f, '성채!', '#7fb4ff') } } })),
  C('infinity', '무한의 고리', '♾️', ['crystal', 'ring'], k => `스킬이 ${2 * k}번 더 발동한다.`, (f, k) => own(f, recast(2 * k)), { skip: 'ring' }),
  C('bloodthirst', '피의 갈증', '🩸', ['fang', 'sword'], () => '체력이 가득 차면 넘친 회복이 보호막이 된다 (최대 체력 60%까지).', f => { f.overheal = true }),
  C('luckyring', '행운의 반지', '🍀', ['dice', 'ring'], () => '스킬도 치명타가 터진다.', f => { f.skillCrit = true }),
  C('oath', '생명의 서약', '💗', ['charm', 'fang'], k => `쓰러지면 주변 아군이 각자 최대 체력 ${n(40 * k)}%를 회복한다.`,
    (f, k) => own(f, {
      id: 'oath',
      onDeath(b, d) {
        b.emit({ k: 'ring', x: d.x, y: d.y, r: 2.5, color: '#ff9ecb', style: 'holy' })
        for (const a of b.inRadius(d.x, d.y, 2.5, d.side)) b.heal(a, a.maxHp * 0.4 * k)
      },
    })),
  C('arcburst', '마력 폭발', '💥', ['rune', 'crystal'], k => `스킬을 쓸 때마다 대상 주변이 크게 폭발한다 (공격력 ${n(250 * k)}%).`,
    (f, k) => own(f, {
      id: 'arcburst',
      onCast(b, f) {
        const t = f.target?.alive ? f.target : b.nearest(f.x, f.y, foeSide(f))
        if (!t) return
        b.count('arcburst', f)
        b.emit({ k: 'ring', x: t.x, y: t.y, r: 1.5, color: '#c9b6ff', style: 'spirit' })
        for (const e of b.inRadius(t.x, t.y, 1.5, t.side)) b.damage(f, e, f.atk * 2.5 * k, { kind: 'proc' })
      },
    }), { skip: 'rune' }),
  C('titan', '거인의 결의', '🗿', ['helm', 'sword'], k => `피해를 받을 때마다 피해량 +${n(k)}% (50번까지).`,
    (f, k) => own(f, { id: 'titan', onDamaged(_b, f) { if ((f.st.titan ?? 0) < 50) { f.st.titan = (f.st.titan ?? 0) + 1; f.dmgMult += 0.01 * k } } })),
  C('quickdraw', '신속의 화살', '🏹', ['feather', 'dice'], k => `치명타마다 공격 속도 +${n(4 * k)}% (15번까지).`,
    (f, k) => own(f, { id: 'quickdraw', onCrit(_b, f, _t, _d, info) { if (info.kind !== 'proc' && (f.st.qd ?? 0) < 15) { f.st.qd = (f.st.qd ?? 0) + 1; f.asBonus += 0.04 * k } } })),

  // 대검
  C('twinblade', '쌍날 검', '⚔️', ['sword', 'feather'], k => `세 번째 공격마다 한 번 더 벤다 (공격력 ${n(100 * k)}%).`,
    (f, k) => own(f, { id: 'twinblade', onAttack(b, f, t) { if ((f.st.tw = (f.st.tw ?? 0) + 1) % 3 === 0) b.damage(f, t, f.atk * k, { kind: 'atk', canCrit: true }) } })),
  C('spellspear', '마력의 창', '🔱', ['sword', 'crystal'], k => `기본 공격이 마나를 ${n(5 * k)} 더 채운다.`,
    (f, k) => own(f, { id: 'spellspear', onAttack(_b, f) { if (f.maxMana > 0) f.mana += 5 * k } })),
  C('lastblade', '최후의 칼날', '🗡️', ['sword', 'charm'], k => `체력이 처음 절반 아래로 떨어지면 공격력 +${n(30 * k)}%, 최대 체력 ${n(25 * k)}% 보호막.`,
    (f, k) => own(f, { id: 'lastblade', onDamaged(b, f) { if (once(f, 'lb', f.hp < f.maxHp / 2)) { f.atk *= 1 + 0.3 * k; f.shield += f.maxHp * 0.25 * k; b.label(f, '최후의 칼날!', '#ff8a65') } } })),
  C('flameblade', '불꽃 대검', '🔥', ['sword', 'rune'], k => `기본 공격 시 ${n(Math.min(100, 30 * k))}% 확률로 주변 폭발 (공격력 120%), 맞은 적은 3초 동안 1초마다 공격력 ${n(30 * k)}% 화상.`,
    (f, k) => own(f, {
      id: 'rune',
      onAttack(b, f, t) {
        if (b.r() >= Math.min(1, 0.3 * k)) return
        b.count('rune', t)
        blast(b, f, t.x, t.y, 1.2, 1.2, e => { for (const d of [1, 2, 3]) b.later(d, () => b.damage(f, e, f.atk * 0.3 * k, { kind: 'proc' })) })
      },
    }), { skip: 'rune' }),
  C('awaken', '각성의 검', '✨', ['sword', 'ring'], k => `스킬을 쓸 때마다 공격력 +${n(8 * k)}% (10번까지).`,
    (f, k) => own(f, { id: 'awaken', onCast(_b, f) { const a0 = (f.st.aw0 ??= f.atk); if ((f.st.aw ?? 0) < 10) { f.st.aw = (f.st.aw ?? 0) + 1; f.atk += a0 * 0.08 * k } } })),

  // 깃털
  C('charger', '돌격대의 흉갑', '🛡️', ['feather', 'helm'], k => `전투 시작 후 5초 동안 공격 속도 +${n(60 * k)}%, 방어력 +${n(40 * k)}.`,
    (f, k) => { f.buffs.push({ t: 5, as: 0.6 * k, armor: 40 * k }) }),
  C('thunderdagger', '번개 단검', '⚡', ['feather', 'crystal'], k => `세 번째 공격마다 번개가 적 넷에게 튕긴다 (공격력 ${n(60 * k)}%).`,
    (f, k) => own(f, {
      id: 'thunderdagger',
      onAttack(b, f, t) {
        if ((f.st.td = (f.st.td ?? 0) + 1) % 3) return
        let px = f.x, py = f.y
        for (const e of [t, ...b.nearestN(t.x, t.y, t.side, 3, 3, t)]) {
          b.emit({ k: 'line', x1: px, y1: py, x2: e.x, y2: e.y, color: '#9be7ff' })
          b.damage(f, e, f.atk * 0.6 * k, { kind: 'proc' })
          px = e.x; py = e.y
        }
      },
    })),
  C('hunterfang', '사냥꾼의 이빨', '🐺', ['feather', 'fang'], k => `적을 처치할 때마다 체력 ${n(20 * k)}% 회복, 공격 속도 +${n(10 * k)}% (전투 동안).`,
    (f, k) => own(f, { id: 'hunterfang', onKill(b, f) { b.heal(f, f.maxHp * 0.2 * k); f.asBonus += 0.1 * k } })),
  C('brokenwing', '깨진 날개 부적', '🪶', ['feather', 'charm'], k => `보호막이 처음 다 깨지면 4초 동안 공격 속도 +${n(80 * k)}%.`,
    (f, k) => own(f, { id: 'brokenwing', onDamaged(b, f) { if (once(f, 'bw', f.shield <= 0)) { f.buffs.push({ t: 4, as: 0.8 * k }); b.label(f, '날개!', '#b6f36b') } } })),
  C('arcarrow', '마력 깃 화살', '🏹', ['feather', 'ring'], k => `스킬을 쓸 때마다 3초 동안 공격 속도 +${n(50 * k)}%.`,
    (f, k) => own(f, { id: 'arcarrow', onCast(_b, f) { f.buffs.push({ t: 3, as: 0.5 * k }) } })),

  // 투구
  C('sagehelm', '현자의 투구', '🧙', ['helm', 'crystal'], k => `스킬을 쓸 때마다 방어력 +${n(10 * k)} (10번까지).`,
    (f, k) => own(f, { id: 'sagehelm', onCast(_b, f) { if ((f.st.sg ?? 0) < 10) { f.st.sg = (f.st.sg ?? 0) + 1; f.armor += 10 * k } } })),
  C('stoneheart', '단단한 심장', '🪨', ['helm', 'dice'], k => `체력이 처음 절반 아래로 떨어지기 전까지 방어력 +${n(40 * k)}.`,
    (f, k) => { f.armor += 40 * k; own(f, { id: 'stoneheart', onDamaged(_b, f) { if (once(f, 'sh', f.hp < f.maxHp / 2)) f.armor -= 40 * k } }) }),
  C('regen', '재생의 갑옷', '💚', ['helm', 'fang'], k => `기본 공격마다 잃은 체력의 ${n(4 * k)}%를 회복한다.`,
    (f, k) => own(f, { id: 'regen', onAttack(b, f) { b.heal(f, (f.maxHp - f.hp) * 0.04 * k) } })),
  C('sunfire', '불타는 갑주', '🔥', ['helm', 'rune'], k => `2초마다 주변 적에게 각자 최대 체력 ${n(2 * k)}% 화염 피해.`,
    (f, k) => own(f, {
      id: 'sunfire',
      onBegin(b, f) {
        const tick = () => {
          if (!f.alive || b.done) return
          b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.6, color: '#ff7043', style: 'fire' })
          for (const e of b.inRadius(f.x, f.y, 1.6, foeSide(f))) b.damage(f, e, e.maxHp * 0.02 * k, { kind: 'proc', noMult: true })
          b.later(2, tick)
        }
        b.later(2.5, tick)
      },
    }), { skip: 'rune' }),
  C('quakeshield', '진동의 방패', '🛡️', ['helm', 'ring'], k => `스킬을 쓸 때마다 주변 적이 ${n(0.8 * k)}초 기절한다.`,
    (f, k) => own(f, {
      id: 'quakeshield',
      onCast(b, f) {
        b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.6, color: '#c9a36b', style: 'earth' })
        for (const e of b.inRadius(f.x, f.y, 1.6, foeSide(f))) e.stunT = Math.max(e.stunT, 0.8 * k)
      },
    })),

  // 수정
  C('sagestone', '현자의 보석', '🔮', ['crystal', 'dice'], k => `스킬 피해 +${n(35 * k)}%.`, (f, k) => { f.spell += 0.35 * k }),
  C('salvation', '구원의 수정', '💠', ['crystal', 'fang'], k => `스킬 피해의 ${n(25 * k)}%만큼 체력 비율이 가장 낮은 아군을 회복한다.`,
    (f, k) => own(f, { id: 'salvation', onHit(b, f, _t, dealt, info) { if (info.kind === 'skill') { const a = weakAlly(b, f); if (a) b.heal(a, dealt * 0.25 * k) } } })),
  C('hymn', '수호의 성가', '🎶', ['crystal', 'charm'], k => `스킬을 쓸 때마다 주변 아군에게 각자 최대 체력 ${n(12 * k)}% 보호막.`,
    (f, k) => own(f, {
      id: 'hymn',
      onCast(b, f) {
        b.emit({ k: 'ring', x: f.x, y: f.y, r: 2.2, color: '#7fb4ff', style: 'shield' })
        for (const a of b.inRadius(f.x, f.y, 2.2, f.side)) a.shield += a.maxHp * 0.12 * k
      },
    })),

  // 주사위
  C('vampdice', '흡혈귀의 주사위', '🧛', ['dice', 'fang'], k => `치명타로 준 피해의 ${n(30 * k)}%를 더 회복한다.`,
    (f, k) => own(f, { id: 'vampdice', onCrit(b, f, _t, dealt) { b.heal(f, dealt * 0.3 * k) } })),
  C('luckcharm', '행운의 방패부', '🍀', ['dice', 'charm'], k => `치명타마다 최대 체력 ${n(3 * k)}% 보호막 (최대 체력만큼까지).`,
    (f, k) => own(f, { id: 'luckcharm', onCrit(_b, f) { f.shield = Math.min(f.maxHp, f.shield + f.maxHp * 0.03 * k) } })),
  C('emberdice', '불씨 주사위', '🎆', ['dice', 'rune'], k => `기본 공격이 치명타면 반드시 폭발한다 (공격력 ${n(120 * k)}%).`,
    (f, k) => own(f, { id: 'emberdice', onCrit(b, f, t, _d, info) { if (info.kind === 'atk') { b.count('rune', t); blast(b, f, t.x, t.y, 1.2, 1.2 * k) } } })),

  // 송곳니·부적·룬
  C('bloodrune', '피의 룬', '🩸', ['fang', 'rune'], k => `기본 공격 시 ${n(Math.min(100, 30 * k))}% 확률로 주변 폭발 (공격력 120%), 그때마다 주변 아군이 최대 체력 ${n(4 * k)}% 회복.`,
    (f, k) => own(f, boom(Math.min(1, 0.3 * k), 1.2, (b, f) => { for (const a of b.inRadius(f.x, f.y, 2.2, f.side)) b.heal(a, a.maxHp * 0.04 * k) })), { skip: 'rune' }),
  C('lifering', '생명 반지', '💞', ['fang', 'ring'], k => `스킬을 쓸 때마다 체력 ${n(10 * k)}% 회복.`,
    (f, k) => own(f, { id: 'lifering', onCast(b, f) { b.heal(f, f.maxHp * 0.1 * k) } })),
  C('bombcharm', '폭약 부적', '💣', ['charm', 'rune'], k => `보호막이 처음 다 깨지면 주변이 크게 폭발한다 (공격력 ${n(300 * k)}%).`,
    (f, k) => own(f, { id: 'bombcharm', onDamaged(b, f) { if (once(f, 'bc', f.shield <= 0)) { blast(b, f, f.x, f.y, 1.8, 3 * k); b.emit({ k: 'shake', v: 5 }) } } })),
  C('guardring', '수호의 반지', '💍', ['charm', 'ring'], k => `스킬을 쓸 때마다 최대 체력 ${n(8 * k)}% 보호막.`,
    (f, k) => own(f, { id: 'guardring', onCast(_b, f) { f.shield += f.maxHp * 0.08 * k } })),
  C('manarune', '마나의 룬', '📜', ['rune', 'ring'], k => `기본 공격 시 ${n(Math.min(100, 30 * k))}% 확률로 주변 폭발 (공격력 120%), 폭발할 때마다 마나 +${n(8 * k)}.`,
    (f, k) => own(f, boom(Math.min(1, 0.3 * k), 1.2, (_b, f) => { if (f.maxMana > 0) f.mana += 8 * k })), { skip: 'rune' }),

  // 같은 재료 둘: 재료 효과 두 배 + 고유 효과
  C('bloodsword', '피에 젖은 대검', '🗡️', ['sword', 'sword'], k => `적을 처치할 때마다 공격력 +${n(10 * k)}% (전투 동안).`,
    (f, k) => own(f, { id: 'bloodsword', onKill(_b, f) { f.atk += (f.st.bs0 ??= f.atk) * 0.1 * k } })),
  C('crossbow', '쌍발 석궁', '🏹', ['feather', 'feather'], k => `기본 공격이 근처 다른 적 하나에게도 날아간다 (공격력 ${n(50 * k)}%).`,
    (f, k) => own(f, {
      id: 'crossbow',
      onAttack(b, f, t) {
        const o = b.nearest(t.x, t.y, t.side, e => e !== t, 3)
        if (!o) return
        b.emit({ k: 'shot', x1: f.x, y1: f.y, x2: o.x, y2: o.y, color: '#b6f36b' })
        b.damage(f, o, f.atk * 0.5 * k, { kind: 'proc' })
      },
    })),
  C('thornmail', '가시 갑주', '🌵', ['helm', 'helm'], k => `받은 피해의 ${n(25 * k)}%를 공격자에게 되돌린다 (0.3초마다).`,
    (f, k) => own(f, {
      id: 'thornmail',
      onDamaged(b, f, src, dealt) {
        if (!src?.alive || src.side === f.side || b.t < (f.st.th ?? 0)) return
        f.st.th = b.t + 0.3
        b.damage(f, src, dealt * 0.25 * k, { kind: 'proc', noMult: true })
      },
    })),
  C('wellspring', '끝없는 샘', '⛲', ['crystal', 'crystal'], k => `스킬을 쓰면 마나 ${n(30 * k)}%를 돌려받는다.`,
    (f, k) => own(f, { id: 'wellspring', onCast(_b, f, info) { if (!info.ring && !info.echo) f.mana += f.maxMana * 0.3 * k } })),
  C('fatedice', '운명의 패', '🃏', ['dice', 'dice'], k => `치명타 확률이 100%를 넘으면 넘친 1%마다 치명타 피해 +${n(k)}%.`,
    (f, k) => own(f, { id: 'fatedice', onBegin(_b, f) { if (f.crit > 1) { f.critDmg += (f.crit - 1) * k; f.crit = 1 } } })),
  C('hungryfang', '굶주린 송곳니', '🦷', ['fang', 'fang'], k => `체력이 처음 40% 아래로 떨어지면 4초 동안 흡혈 +${n(100 * k)}%.`,
    (f, k) => own(f, { id: 'hungryfang', onDamaged(b, f) { if (once(f, 'hf', f.hp < f.maxHp * 0.4)) { f.lifesteal += k; b.label(f, '굶주림!', '#ff5252'); b.later(4, () => { f.lifesteal -= k }) } } })),
  C('angelcharm', '수호천사의 부적', '😇', ['charm', 'charm'], k => `전투 시작 시 주변 아군도 각자 최대 체력 ${n(20 * k)}% 보호막.`,
    (f, k) => own(f, { id: 'angelcharm', onBegin(b, f) { for (const a of b.inRadius(f.x, f.y, 2.5, f.side)) if (a !== f) a.shield += a.maxHp * 0.2 * k } })),
  C('chainbomb', '연쇄 폭약', '🧨', ['rune', 'rune'], () => '폭발로 쓰러진 적 자리에서 다시 폭발한다 (3번까지 이어진다).',
    (f, k) => {
      const chain = (b: Battle, f: Fighter, x: number, y: number, depth: number) =>
        blast(b, f, x, y, 1.2, 1.2, e => { if (!e.alive && depth < 3) b.later(0.15, () => { if (f.alive) chain(b, f, e.x, e.y, depth + 1) }) })
      own(f, { id: 'rune', onAttack(b, f, t) { if (b.r() >= Math.min(1, 0.6 * k)) return; b.count('rune', t); chain(b, f, t.x, t.y, 0) } })
    }, { skip: 'rune' }),
  C('bondring', '연대의 반지', '🤝', ['ring', 'ring'], k => `스킬을 쓰면 가장 가까운 아군 ${k}명도 스킬을 한 번 쓴다.`,
    (f, k) => own(f, {
      id: 'bondring',
      onCast(b, f, info) {
        if (info.ring || info.echo) return
        for (const a of b.nearestN(f.x, f.y, f.side, k, 9, f).filter(a => a.tpl.skill && !a.summoned)) b.later(0.3, () => b.recast(a, { ring: true }))
      },
    }), { dbl: 1 }),
]

// 같은 재료 둘은 재료 효과 두 배 (쌍둥이 반지 둘만 한 번: 무한의 고리와 겹치지 않게)
const parts = (c: Combo, k: number): [string, number][] =>
  c.from[0] === c.from[1] ? [[c.from[0], k * (c.dbl ?? 2)]] : c.from.filter(x => x !== c.skip).map(x => [x, k])
const comboDesc = (c: Combo, k: number) => `${parts(c, k).map(([x, m]) => BASE[x].text(m)).join(', ')}. ${c.text(k)}`
const comboFx = (c: Combo, k: number) => (f: Fighter) => { for (const [x, m] of parts(c, k)) BASE[x].fx(f, m); c.fx(f, k) }

export const COMBOS: ItemDef[] = SPECS.map(c => ({ id: c.id, name: c.name, emoji: c.emoji, from: c.from, desc: comboDesc(c, 1), apply: comboFx(c, 1) }))
// 찬란한 아이템: 조합 아이템의 모든 수치 두 배 (재료도 그대로라 ★3 진화 짝으로도 쓰인다)
export const RADIANTS: ItemDef[] = SPECS.map(c => ({ id: 'rad_' + c.id, name: '찬란한 ' + c.name, emoji: c.emoji, from: c.from, tier: 'radiant', base: c.id, desc: comboDesc(c, 2), apply: comboFx(c, 2) }))

// ── 유물 (TFT 유물처럼 조합되지 않는 고유 아이템. 보물 창고를 완벽히 털거나 고대의 대장간에서 얻는다)
const R = (id: string, name: string, emoji: string, desc: string, apply: (f: Fighter) => void): ItemDef => ({ id, name, emoji, desc, apply, tier: 'relic' })
export const RELICS: ItemDef[] = [
  R('lantern', '정지의 등불', '🏮', '체력이 처음 40% 아래로 떨어지면 2.5초 동안 무적이 되고 마나가 가득 찬다.',
    f => own(f, { id: 'lantern', onDamaged(b, f) { if (once(f, 'ln', f.hp < f.maxHp * 0.4)) { f.invulnT = 2.5; f.mana = f.maxMana; b.label(f, '시간 정지!', '#ffd54a') } } })),
  R('cloak', '분열의 외투', '🧥', '쓰러지면 능력치 50%인 분신 둘로 갈라진다.',
    f => own(f, {
      id: 'cloak',
      onDeath(b, d) {
        for (const dy of [-0.35, 0.35]) b.summon(d.side, d.tpl, d.x, d.y + dy, { maxHp: d.maxHp * 0.5, atk: d.atk * 0.5, as: d.as, range: d.range, crit: d.crit, critDmg: d.critDmg })
        b.emit({ k: 'ring', x: d.x, y: d.y, r: 1, color: '#c9b6ff', style: 'dark' })
      },
    })),
  R('gloves', '떠돌이 장인의 장갑', '🧤', '전투마다 무작위 조합 아이템 둘의 효과를 얻는다. 무엇이 나올지는 매번 바뀐다.',
    f => own(f, {
      id: 'gloves',
      onBegin(b, f) {
        const pool = [...COMBOS]
        const got = [0, 1].map(() => pool.splice(Math.floor(b.r() * pool.length), 1)[0])
        for (const c of got) c.apply(f) // 새로 붙은 훅의 onBegin은 start()가 이어서 부른다
        b.later(0.6, () => b.label(f, got.map(c => c.name).join(' · '), '#dad45e'))
      },
    })),
  R('prism', '일곱 빛의 결정', '🌈', '대검·깃털·투구·수정·주사위·송곳니·부적의 효과를 각각 40%씩 얻는다.',
    f => { for (const x of ['sword', 'feather', 'helm', 'crystal', 'dice', 'fang', 'charm']) BASE[x].fx(f, 0.4) }),
  R('cursed', '저주받은 대검', '☠️', '공격력 +150%. 대신 기본 공격마다 최대 체력 3%를 잃는다 (체력 1 아래로는 떨어지지 않는다).',
    f => { f.atk *= 2.5; own(f, { id: 'cursed', onAttack(_b, f) { f.hp = Math.max(1, f.hp - f.maxHp * 0.03) } }) }),
  R('angel', '천사의 깃펜', '🪶', '처음 쓰러질 때 2초 동안 무적으로 버틴 뒤 체력 60%로 일어난다.',
    f => own(f, {
      id: 'angel',
      onLethal(b, f) {
        if (f.st.angel) return false
        f.st.angel = 1
        f.invulnT = 2
        f.stunT = 2
        b.label(f, '천사의 가호', '#fff6a6')
        b.later(2, () => { if (f.alive) { b.heal(f, f.maxHp * 0.6); b.emit({ k: 'ring', x: f.x, y: f.y, r: 1.2, color: '#fff6a6', style: 'holy' }) } })
        return true
      },
    })),
  R('scope', '매의 눈 망원경', '🔭', '사거리 +2칸. 기본 공격 피해가 대상과 1칸 떨어질 때마다 +10%.',
    f => { f.range += 2; own(f, { id: 'scope', onHit(b, f, t, dealt, info) { if (info.kind === 'atk') b.damage(f, t, dealt * 0.1 * Math.hypot(t.x - f.x, t.y - f.y), { kind: 'proc', noMult: true }) } }) }),
  R('bigpotion', '거인의 물약', '🧪', '몸집이 커지고 체력 +120%. 기본 공격이 주변 적에게도 50% 피해를 준다.',
    f => {
      f.size *= 1.3
      f.maxHp *= 2.2
      own(f, { id: 'bigpotion', onAttack(b, f, t) { for (const e of b.inRadius(t.x, t.y, 1, t.side)) if (e !== t) b.damage(f, e, f.atk * 0.5, { kind: 'proc' }) } })
    }),
  R('bloodvial', '흡혈귀의 혈청', '🍷', '흡혈 40%. 흡혈로 회복하는 만큼 체력 비율이 가장 낮은 아군도 회복한다.',
    f => { f.lifesteal += 0.4; own(f, { id: 'bloodvial', onHit(b, f, _t, dealt) { const a = weakAlly(b, f); if (a) b.heal(a, dealt * f.lifesteal) } }) }),
  R('spring', '가속 태엽', '⚙️', '스킬을 쓸 때마다 다음 스킬에 필요한 마나 -15% (원래의 40%까지).',
    f => own(f, { id: 'spring', onCast(_b, f, info) { if (info.ring || info.echo) return; const m0 = (f.st.mm0 ??= f.maxMana); f.maxMana = Math.max(m0 * 0.4, f.maxMana * 0.85) } })),
  R('crown', '황금 왕관', '👑', '이 유닛을 배치한 채 전투에서 이기면 골드 +3.', () => {}),
  R('trident', '결투자의 삼지창', '🔱', '전투가 시작되면 체력이 가장 높은 적에게 뛰어들고, 그 적에게 주는 피해 +60%.',
    f => own(f, {
      id: 'trident',
      onBegin(b, f) {
        const t = b.alive(foeSide(f)).sort((x, y) => y.maxHp - x.maxHp)[0]
        if (!t) return
        f.st.duel = t.uid
        b.later(0.6, () => { if (!f.alive || !t.alive) return; b.teleport(f, t.x - (f.side === 0 ? 0.6 : -0.6), t.y); f.target = t; f.retarget = 99 })
      },
      onHit(b, f, t, dealt, info) { if (info.kind !== 'proc' && t.uid === f.st.duel) b.damage(f, t, dealt * 0.6, { kind: 'proc', noMult: true }) },
    })),
]

export const HIDDEN: ItemDef[] = [...RELICS, ...RADIANTS]
export const ITEM: Record<string, ItemDef> = Object.fromEntries([...ITEMS, ...COMBOS, ...HIDDEN].map(i => [i.id, i]))
export const isBase = (id: string) => id in BASE
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
