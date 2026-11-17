// 위험도: 원하는 규칙만 골라 원정을 어렵게 하고, 고른 만큼 별조각을 더 받는다 (Hades 형벌 계약처럼).
// 효과는 run.ts·battle.ts가 id로 확인해 처리한다. 단계(rank)가 있는 규칙은 단계마다 위험도가 더해진다.
export interface HeatRule { id: string; name: string; max: number; cost: number; desc: (rank: number) => string }

export const HEAT: HeatRule[] = [
  { id: 'tough', name: '단단한 적', max: 3, cost: 1, desc: n => `적 체력·공격력 +${10 * Math.max(1, n)}%` },
  { id: 'affix', name: '정예의 행진', max: 1, cost: 2, desc: () => '6라운드부터 일반 편성에 접두사 정예 1명, 11라운드부터 2명이 더 붙는다' },
  { id: 'boss', name: '극한의 정예', max: 1, cost: 2, desc: () => '정예·최종 보스 체력·공격력 +40%' },
  { id: 'lives', name: '줄어든 생명', max: 1, cost: 2, desc: () => '생명 -1' },
  { id: 'shop', name: '빈약한 상점', max: 1, cost: 1, desc: () => '상점 칸 -1, 새로고침 2골드' },
  { id: 'income', name: '인색한 수입', max: 2, cost: 1, desc: n => `라운드 수입 -${Math.max(1, n)}골드` },
  { id: 'drought', name: '증강체 가뭄', max: 1, cost: 2, desc: () => '증강체 선택지 -1장' },
  { id: 'timer', name: '제한 시간', max: 1, cost: 2, desc: () => '전투가 35초 안에 끝나지 않으면 패배' },
]

export const HEAT_RULE: Record<string, HeatRule> = Object.fromEntries(HEAT.map(h => [h.id, h]))
export const heatOf = (sel: Record<string, number> = {}) => HEAT.reduce((n, h) => n + h.cost * Math.min(h.max, sel[h.id] ?? 0), 0)
export const shardMult = (heat: number) => 1 + heat * 0.1
