// 사건 방: 전투 사이의 선택지 사건 (Slay the Spire의 ? 방처럼 무엇을 내주고 무엇을 받을지 고른다).
// 상태 변경은 run.ts가 넘겨주는 EvCtx로만 한다.
import type { RunState } from '../run.ts'
import { AUG } from './augments.ts'
import { ITEM } from './items.ts'

export interface EvCtx {
  s: RunState
  addUnit(tpl: string, star: number): void
  addItem(id?: string): string // 없으면 무작위 기본 아이템
  augment(rarity?: number): void // 증강체 선택을 하나 더 연다 (등급 고정 가능)
  topTpl(cost?: number): string // 주력 특성에 맞는 유닛
  best(): RunState['units'][number] | undefined // 가장 강한 배치 유닛
  rand(): number
}
export interface EvChoice { label: string; desc: string; can?: (c: EvCtx) => string | null; apply: (c: EvCtx) => string }
export interface EventDef { id: string; name: string; text: string; choices: EvChoice[] }

const pass: EvChoice = { label: '지나친다', desc: '아무것도 하지 않는다.', apply: () => '그냥 지나쳤다.' }
const gold = (n: number) => (c: EvCtx) => (c.s.gold < n ? `골드 ${n}이 필요합니다` : null)

export const EVENTS: EventDef[] = [
  {
    id: 'peddler', name: '수상한 상인', text: '두건 쓴 상인이 빛나는 상자를 내민다. "값은 목숨 하나면 돼."',
    choices: [
      { label: '생명 1을 낸다', desc: '프리즘 증강체 셋 중 하나를 고른다.', can: c => (c.s.lives <= 1 ? '생명이 하나뿐입니다' : null), apply: c => { c.s.lives--; c.augment(3); return '상자가 열렸다.' } },
      pass,
    ],
  },
  {
    id: 'well', name: '저주받은 우물', text: '우물 바닥에서 무언가 반짝인다. 동전을 던지면 무엇이 올라올까.',
    choices: [
      { label: '10골드를 던진다', desc: '절반 확률로 아이템 2개. 아니면 아무것도 없다.', can: gold(10), apply: c => { c.s.gold -= 10; if (c.rand() < 0.5) { c.addItem(); c.addItem(); return '아이템 두 개가 떠올랐다!' } return '물소리만 들린다…' } },
      pass,
    ],
  },
  {
    id: 'merc', name: '떠돌이 용병', text: '갈 곳 없는 용병이 일자리를 찾는다.',
    choices: [
      { label: '고용한다', desc: '주력 특성에 맞는 2골드 유닛 ★2가 합류한다.', apply: c => { const t = c.topTpl(2); c.addUnit(t, 2); return '용병이 합류했다.' } },
      { label: '돈을 쥐여 보낸다', desc: '골드 +8.', apply: c => { c.s.gold += 8; return '용병이 고맙다며 떠났다. 골드 +8' } },
    ],
  },
  {
    id: 'mirror', name: '거울의 방', text: '거울 속 병사가 손을 내민다. 거울 밖으로 나오고 싶은 모양이다.',
    choices: [
      { label: '손을 잡는다', desc: '가장 강한 배치 유닛의 복제(★ 한 단계 낮게, 최소 ★1)를 얻는다.', can: c => (c.best() ? null : '배치된 유닛이 없습니다'), apply: c => { const u = c.best()!; c.addUnit(u.tpl, Math.max(1, u.star - 1)); return '거울 속 병사가 걸어 나왔다!' } },
      pass,
    ],
  },
  {
    id: 'gambler', name: '도박꾼의 탁자', text: '"가진 증강체 하나를 걸어 보시지. 이기면 훨씬 좋은 걸 주지."',
    choices: [
      { label: '증강체를 건다', desc: '가진 증강체 중 가장 낮은 등급 하나를 잃고, 프리즘 증강체 셋 중 하나를 고른다.', can: c => (c.s.augments.length ? null : '건 증강체가 없습니다'), apply: c => {
        const a = c.s.augments.reduce((lo, x) => (AUG[x].rarity < AUG[lo].rarity ? x : lo))
        c.s.augments.splice(c.s.augments.indexOf(a), 1)
        c.augment(3)
        return `${AUG[a].name}을(를) 잃고 패를 뒤집었다…`
      } },
      pass,
    ],
  },
  {
    id: 'drill', name: '훈련장', text: '버려진 훈련장에 허수아비가 줄지어 서 있다.',
    choices: [
      { label: '6골드로 교관을 부른다', desc: '배치된 유닛 전원 영구 +12%.', can: gold(6), apply: c => { c.s.gold -= 6; for (const u of c.s.units) if (u.pos !== null) u.bonus += 0.12; return '전원 +12%' } },
      { label: '혼자 훈련한다', desc: '가장 강한 배치 유닛 하나 영구 +30%.', can: c => (c.best() ? null : '배치된 유닛이 없습니다'), apply: c => { c.best()!.bonus += 0.3; return '한 명이 크게 강해졌다. +30%' } },
    ],
  },
  {
    id: 'barracks', name: '버려진 병영', text: '빈 침상이 많다. 병사를 더 데려갈 수 있겠지만, 냄새를 맡은 적이 몰려온다.',
    choices: [
      { label: '병영을 차지한다', desc: '배치 칸 +1 (영구). 대신 다음 전투의 적 전원이 거대 접두사.', apply: c => { c.s.bonusSlots++; c.s.curse = 'giant'; return '배치 칸 +1. 땅이 울린다…' } },
      pass,
    ],
  },
  {
    id: 'altar', name: '연금술 제단', text: '제단에 두 개의 홈이 파여 있다. 무엇을 올리든 하나로 녹아든다.',
    choices: [
      { label: '아이템 둘을 바친다', desc: '가방의 기본 아이템 두 개를 무작위 조합 아이템 하나로.', can: c => (c.s.items.filter(i => !ITEM[i].from).length >= 2 ? null : '가방에 기본 아이템이 두 개 있어야 합니다'), apply: c => {
        for (let k = 0; k < 2; k++) c.s.items.splice(c.s.items.findIndex(i => !ITEM[i].from), 1)
        return `${c.addItem('combo')}이(가) 만들어졌다!`
      } },
      pass,
    ],
  },
  {
    id: 'spring', name: '마나의 샘', text: '푸른 샘물이 조용히 빛난다.',
    choices: [
      { label: '샘물을 마신다', desc: '증강체 새로고침 +2.', apply: c => { c.s.augRerolls += 2; return '증강체 새로고침 +2' } },
      { label: '동전을 건진다', desc: '골드 +6.', apply: c => { c.s.gold += 6; return '골드 +6' } },
    ],
  },
]
export const EVENT: Record<string, EventDef> = Object.fromEntries(EVENTS.map(e => [e.id, e]))
