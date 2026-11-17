# 오버빌드 (Overbuild)

싱글플레이 오토배틀러 로그라이트. 15라운드 동안 유닛·증강체·시너지를 쌓아 사기 조합을 완성하고 최종 보스를 쓸어버린다.

## 플레이

- **브라우저에서 바로**: https://yuangunn.github.io/Overbuild/
- **설치 없이 내려받아서**: [Releases](https://github.com/yuangunn/Overbuild/releases)에서 `Overbuild-*.zip`을 받아 압축을 풀고 `index.html`을 더블클릭한다. 인터넷 연결이 필요 없다.

최신 Chrome·Edge를 권장한다(macOS Chrome에서 확인). 이모지는 Windows 10 글꼴(Emoji 12)에 있는 것만 쓴다. 화면은 1280×600 이상을 권장한다.
서버·로그인 없음. 진행 상황은 그 브라우저의 localStorage(`overbuild:*`)에 저장되므로, 컴퓨터·브라우저를 바꾸면 처음부터 시작한다.

## 모드

- **원정**: 15라운드. 사령관 셋 중 하나를 골라 출발하고, 전투가 끝날 때마다 갈림길에서 다음 방(전투·정예 조우·보물 창고·떠돌이 상인·휴식처·사건)을 고른다. 1·5·10·15라운드는 고정이다.
  - 구역마다 기믹이 있는 편성(왕슬라임 분열·자폭 고블린·강령 사제·망령 기사·접두사 정예 등 16종)이 나온다. 5·10라운드 정예는 후보 둘 중 하나가 원정 시작 때 정해져 화면 위에 미리 보인다. 일반 전투에는 22% 확률로 보물 고블린이 섞인다.
  - 골드로 지휘 경험치를 사서 배치 칸과 상점 확률을 앞당긴다(`F`). 한 유닛에 재료 아이템 둘이 모이면 조합 아이템이 되고, ★3 유닛이 짝 아이템을 들면 스킬이 진화한다. 조합표·진화표는 도감에 있다.
  - 15라운드를 깨면 **무한 원정**으로 이어 갈 수 있다(적이 라운드마다 ×1.3 이상으로 빨라지며 커지고 방어력 +30, 60초 안에 다 쓰러뜨려야 승리, 최고 라운드 기록).
- **위험도 계약**: 규칙 8종을 골라 원정을 어렵게 하고 위험도 1마다 별조각 +10%. 설정은 다음 원정에도 남는다. 같은 화면에서 **시드**(7글자)로 출발하면 같은 사령관 후보·적·갈림길이 나온다.
- **일일 도전**: 날짜로 시드·사령관·위험도 규칙 둘이 정해지고 영구 해금 없이 시작한다. 그날 가장 좋은 결과를 남기고 결과 글을 복사할 수 있다.
- **샌드박스**: 골드·생명 없이 아군·적을 아무 칸에나 놓고 별·아이템·증강체·적 접두사·적 강도(1~15라운드 배율)를 바꿔 가며 싸움을 시험한다. 결과 화면에 유닛별 준 피해·받은 피해가 나온다. 배치는 `overbuild:sandbox:v1`에 남는다.
- **나만의 영웅**: 외형(DawnLike 캐릭터 536종)·특성 2개·능력치 8개를 정하고, 게임 속 스킬과 패시브를 골라 조합한다. 샌드박스에서만 쓸 수 있고 원정 상점·보상에는 나오지 않는다. `overbuild:heroes:v1`에 저장되고, 공유 코드(`OBH1.…` 한 줄)로 주고받는다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 헤드리스 검증 (메커니즘 · 기믹 · 지휘 레벨·무한 원정 · 사령관 · 위험도 · 조합 · 진화 · 갈림길·사건 · 시드 · 사기 빌드 · 봇 완주)
node scripts/levels.ts 1000   # 레벨 통계: 봇 3종 × N판의 라운드별 승률·전투 시간·남은 체력·고른 방·사령관별·편성별 승률, 무한 원정 도달 라운드
npm run build    # dist/ — JS·CSS를 index.html에 넣어 file:// 로도 실행된다 (scripts/inline.js)
```

`main`에 푸시하면 `.github/workflows/pages.yml`이 테스트·빌드 후 GitHub Pages에 배포한다.

## 조작

- 상점 카드 클릭 = 구매 (빈 칸이 있으면 자동 배치)
- 유닛 끌기 = 이동·교체, 상점으로 끌기 = 판매 (클릭으로 선택 후 칸 클릭도 가능)
- 아이템을 유닛에 끌어 놓기 = 장착 (유닛당 3개)
- `Space` 전투 시작 / 결과 넘기기 / 전투 없는 방에서 다음으로, `D` 상점 새로고침, `F` 지휘 경험치 구매, `Esc` 선택 해제

## 구조

```
src/core/            게임 규칙 (DOM 없음, node로 바로 실행 가능)
  battle.ts          전투 시뮬레이션. 효과는 전부 Mod 훅(onAttack·onCrit·onCast·onAllyDeath…)으로 끼어든다
  run.ts             한 판의 진행: 상점·지휘 레벨·승급·배치·시너지·라운드·보상·갈림길·방·사령관·위험도·시드(난수 흐름 셋)
  meta.ts            영구 성장(별조각·해금)·위험도 설정·일일 기록과 저장 (원정·샌드박스·영웅)
  heroes.ts          나만의 영웅: 스킬·패시브 조합, 저장분·공유 코드 정리(cleanHero), UNIT 등록
  data/units.ts      아군 유닛과 스킬
  data/traits.ts     시너지 6종
  data/augments.ts   증강체와 공명(증강체 2개 조합 효과)
  data/items.ts      아이템과 조합 아이템(COMBOS)
  data/evolutions.ts ★3 진화 (유닛별 짝 아이템과 진화 스킬)
  data/commanders.ts 시작 사령관
  data/heat.ts       위험도 규칙
  data/events.ts     사건 방
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
- 조합 아이템: `data/items.ts`의 `COMBOS`에 `from: [재료, 재료]`와 `apply`. 진화: `data/evolutions.ts`의 `EVOS`에 유닛 id로 `{ item, name, desc, skill }`.
- 사령관: `data/commanders.ts`에 한 줄 + `run.ts`에서 `isCmd(s, id)`로 효과. 위험도 규칙: `data/heat.ts` + `run.ts`의 `heatRank(s, id)`.
- 사건: `data/events.ts`의 `EVENTS`에 `{ id, name, text, choices }`. 선택지의 `can`이 이유 문자열을 돌려주면 막힌다.

## 출처

- 캐릭터·아이콘·바닥 도트: [DawnLike 16x16 Universal Rogue-like tileset v1.81](https://opengameart.org/content/dawnlike-16x16-universal-rogue-like-tileset-v181) — DragonDePlatino, CC-BY 4.0. 팔레트: DawnBringer. 원본 라이선스 문서는 `public/sprites/dawnlike/README.txt`.
  - UI 패널 테두리(`src/assets/ui/p*`)는 DawnLike `GUI0.png`의 패널을 12px 9분할로 잘라 2배 키운 것, 버튼(`b*`)은 같은 팔레트로 만든 것.
  - 작가 요청에 따라 Platino 스프라이트가 게임 안 어딘가에 숨어 있다.
- 글꼴: [갈무리](https://github.com/quiple/galmuri) (Galmuri11) — quiple, SIL OFL 1.1. 자주 쓰는 한글 2,350자와 게임에 쓰인 글자로 줄여서 넣었다(`src/assets/fonts`). 라이선스 문서는 `public/fonts/OFL.txt`.
- 유닛·적과 스프라이트 대응표는 `src/ui/sprites.ts`의 `SPR`. 새 유닛은 여기에 `[시트, 열, 행]` 한 줄을 더한다 (없으면 이모지로 그린다).
- 아이템·증강체·특성·공명 아이콘은 같은 파일의 `ICON` (DawnLike 아이템 시트). 없으면 이모지로 그린다.
