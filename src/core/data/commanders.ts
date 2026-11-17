// 시작 사령관: 원정마다 셋 중 하나를 골라 출발한다 (Hearthstone 전장의 영웅 고르기처럼 판마다 출발점이 달라진다).
// 효과는 증강체 황금 손(midas)처럼 run.ts가 id로 확인해 처리한다.
export interface CmdDef { id: string; name: string; desc: string; active?: { cost: number; label: string } }

export const COMMANDERS: CmdDef[] = [
  { id: 'merchant', name: '금화 상인', desc: '라운드가 시작될 때 가진 골드 10마다 1골드 이자 (최대 3).' },
  { id: 'seer', name: '예언자', desc: '증강체 선택지가 4장이고, 새로고침이 1회 더 있다.' },
  { id: 'smith', name: '대장장이', desc: '아이템 2개를 들고 출발하고, 4라운드마다 아이템을 하나 더 받는다.' },
  { id: 'lord', name: '군주', desc: '배치 칸 +1. 대신 생명이 하나 적다.' },
  { id: 'twin', name: '쌍둥이 술사', desc: '1골드 유닛을 사면 같은 유닛을 하나 더 받는다. 2골드 유닛은 절반 확률로.' },
  { id: 'drill', name: '교관', desc: '전투에서 이길 때마다 배치된 유닛이 영구히 +2% 강해진다.' },
  { id: 'resonator', name: '공명술사', desc: '공명 하나를 약속받는다. 첫 증강체 선택에 그 짝 하나가 반드시 나오고, 고르면 다음 선택에 나머지 짝이 반드시 나온다.' },
  { id: 'recruiter', name: '징병관', desc: '라운드마다 한 번, 1골드로 상점을 주력 특성 유닛으로만 새로 채운다.', active: { cost: 1, label: '징병' } },
]

export const CMD: Record<string, CmdDef> = Object.fromEntries(COMMANDERS.map(c => [c.id, c]))
