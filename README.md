# 오버빌드 (Overbuild)

싱글플레이 오토배틀러 로그라이트. 15라운드 동안 유닛·증강체·시너지를 쌓아 사기 조합을 완성하고 최종 보스를 쓸어버린다.

## 플레이

- **브라우저에서 바로**: https://yuangunn.github.io/Overbuild/
- **설치 없이 내려받아서**: [Releases](https://github.com/yuangunn/Overbuild/releases)에서 `Overbuild-*.zip`을 받아 압축을 풀고 `index.html`을 더블클릭한다. 인터넷 연결이 필요 없다.

최신 Chrome·Edge를 권장한다(macOS Chrome에서 확인). 이모지는 Windows 10 글꼴(Emoji 12)에 있는 것만 쓴다. 화면은 1280×600 이상을 권장한다.
서버·로그인 없음. 진행 상황은 그 브라우저의 localStorage(`overbuild:*`)에 저장되므로, 컴퓨터·브라우저를 바꾸면 처음부터 시작한다.

## 모드

- **원정**: 15라운드. 구역마다 기믹이 있는 편성(왕슬라임 분열·자폭 고블린·강령 사제·망령 기사·접두사 정예 등 16종)이 나오고, 5·10라운드 정예는 후보 둘 중 하나가 원정 시작 때 정해져 화면 위에 미리 보인다. 2라운드부터 일반 전투에 22% 확률로 보물 고블린이 섞인다(10초 안에 잡으면 골드).
- **샌드박스**: 골드·생명 없이 아군·적을 아무 칸에나 놓고 별·아이템·증강체·적 접두사·적 강도(1~15라운드 배율)를 바꿔 가며 싸움을 시험한다. 결과 화면에 유닛별 준 피해·받은 피해가 나온다. 배치는 `overbuild:sandbox:v1`에 남는다.
- **나만의 영웅**: 외형(DawnLike 캐릭터 536종)·특성 2개·능력치 8개를 정하고, 게임 속 스킬과 패시브를 골라 조합한다. 샌드박스에서만 쓸 수 있고 원정 상점·보상에는 나오지 않는다. `overbuild:heroes:v1`에 저장된다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 헤드리스 검증 (메커니즘 · 기믹 · 샌드박스·영웅 · 사기 빌드 · 봇 300판 완주)
node scripts/levels.ts 1000   # 레벨 통계: 봇 3종 × N판의 라운드별 승률·전투 시간·남은 체력·편성별 승률·보물 고블린 포획률
npm run build    # dist/ — JS·CSS를 index.html에 넣어 file:// 로도 실행된다 (scripts/inline.js)
```

`main`에 푸시하면 `.github/workflows/pages.yml`이 테스트·빌드 후 GitHub Pages에 배포한다.

## 조작

- 상점 카드 클릭 = 구매 (빈 칸이 있으면 자동 배치)
- 유닛 끌기 = 이동·교체, 상점으로 끌기 = 판매 (클릭으로 선택 후 칸 클릭도 가능)
- 아이템을 유닛에 끌어 놓기 = 장착 (유닛당 3개)
- `Space` 전투 시작 / 결과 넘기기, `D` 상점 새로고침, `Esc` 선택 해제

## 구조

```
src/core/            게임 규칙 (DOM 없음, node로 바로 실행 가능)
  battle.ts          전투 시뮬레이션. 효과는 전부 Mod 훅(onAttack·onCrit·onCast·onAllyDeath…)으로 끼어든다
  run.ts             한 판의 진행: 상점·승급·배치·시너지 계산·라운드·보상
  meta.ts            영구 성장(별조각·해금)과 저장 (원정·샌드박스·영웅)
  heroes.ts          나만의 영웅: 스킬·패시브 조합, 저장분 정리(cleanHero), UNIT 등록
  data/units.ts      아군 유닛과 스킬
  data/traits.ts     시너지 6종
  data/augments.ts   증강체와 공명(증강체 2개 조합 효과)
  data/items.ts      아이템
  data/enemies.ts    적·정예 접두사(AFFIXES)·구역별 편성(ENCOUNTERS)·정예 후보(ELITES)·난이도 곡선(enemyMult)
src/ui/
  app.ts             화면·입력 (상태 → HTML 문자열)
  arena.ts           캔버스 전투 연출
scripts/sim.ts       헤드리스 검증
scripts/levels.ts    라운드별 레벨 통계 (scripts/bot.ts의 봇으로 원정을 돌린다)
```

## 콘텐츠 추가

- 유닛: `data/units.ts`의 `UNITS`에 객체 하나. `skill(b, f)`에서 `b.damage`·`b.summon`·`b.inRadius` 등을 쓴다.
- 증강체: `data/augments.ts`의 `AUGMENTS`에 객체 하나. 전투 효과는 `mod`(훅), 획득 즉시 효과는 `onPick`.
- 공명: `RESONANCES`에 `pair` 두 개를 적고, 해당 증강체 훅에서 `has('res_…')`로 분기.
- 편성: `data/enemies.ts`의 `ENCOUNTERS`에 `{ name, from, hint, make }` 한 줄. 적 고유 기믹은 `own()` 훅(`onDeath`·`onLethal`·`onAttack`)으로, 정예 접두사는 `AFFIXES`, 정예 후보는 `ELITES`.
- 난이도: `data/enemies.ts`의 `enemyMult` 한 줄과 정예·보스 수치. 바꾼 뒤 `node scripts/levels.ts 1000`으로 라운드별·편성별 승률을 본다.
- 영웅 패시브: `heroes.ts`의 `PASSIVES`에 Mod를 돌려주는 함수 하나. 스킬은 스킬이 있는 유닛·적이면 자동으로 목록에 들어간다.

## 출처

- 캐릭터·아이콘·바닥 도트: [DawnLike 16x16 Universal Rogue-like tileset v1.81](https://opengameart.org/content/dawnlike-16x16-universal-rogue-like-tileset-v181) — DragonDePlatino, CC-BY 4.0. 팔레트: DawnBringer. 원본 라이선스 문서는 `public/sprites/dawnlike/README.txt`.
  - UI 패널 테두리(`src/assets/ui/p*`)는 DawnLike `GUI0.png`의 패널을 12px 9분할로 잘라 2배 키운 것, 버튼(`b*`)은 같은 팔레트로 만든 것.
  - 작가 요청에 따라 Platino 스프라이트가 게임 안 어딘가에 숨어 있다.
- 글꼴: [갈무리](https://github.com/quiple/galmuri) (Galmuri11) — quiple, SIL OFL 1.1. 자주 쓰는 한글 2,350자와 게임에 쓰인 글자로 줄여서 넣었다(`src/assets/fonts`). 라이선스 문서는 `public/fonts/OFL.txt`.
- 유닛·적과 스프라이트 대응표는 `src/ui/sprites.ts`의 `SPR`. 새 유닛은 여기에 `[시트, 열, 행]` 한 줄을 더한다 (없으면 이모지로 그린다).
- 아이템·증강체·특성·공명 아이콘은 같은 파일의 `ICON` (DawnLike 아이템 시트). 없으면 이모지로 그린다.
