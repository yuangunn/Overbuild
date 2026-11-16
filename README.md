# 오버빌드 (Overbuild)

싱글플레이 오토배틀러 로그라이트. 15라운드 동안 유닛·증강체·시너지를 쌓아 사기 조합을 완성하고 최종 보스를 쓸어버린다.

## 플레이

- **브라우저에서 바로**: https://yuangunn.github.io/Overbuild/
- **설치 없이 내려받아서**: [Releases](https://github.com/yuangunn/Overbuild/releases)에서 `Overbuild-*.zip`을 받아 압축을 풀고 `index.html`을 더블클릭한다. 인터넷 연결이 필요 없다.

최신 Chrome·Edge를 권장한다(macOS Chrome에서 확인). 이모지는 Windows 10 글꼴(Emoji 12)에 있는 것만 쓴다. 화면은 1280×600 이상을 권장한다.
서버·로그인 없음. 진행 상황은 그 브라우저의 localStorage(`overbuild:*`)에 저장되므로, 컴퓨터·브라우저를 바꾸면 처음부터 시작한다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 헤드리스 검증 (메커니즘 · 사기 빌드 · 봇 300판 완주)
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
  meta.ts            영구 성장(별조각·해금)과 저장
  data/units.ts      아군 유닛과 스킬
  data/traits.ts     시너지 6종
  data/augments.ts   증강체와 공명(증강체 2개 조합 효과)
  data/items.ts      아이템
  data/enemies.ts    적·웨이브·난이도 곡선(enemyMult)
src/ui/
  app.ts             화면·입력 (상태 → HTML 문자열)
  arena.ts           캔버스 전투 연출
scripts/sim.ts       헤드리스 검증
```

## 콘텐츠 추가

- 유닛: `data/units.ts`의 `UNITS`에 객체 하나. `skill(b, f)`에서 `b.damage`·`b.summon`·`b.inRadius` 등을 쓴다.
- 증강체: `data/augments.ts`의 `AUGMENTS`에 객체 하나. 전투 효과는 `mod`(훅), 획득 즉시 효과는 `onPick`.
- 공명: `RESONANCES`에 `pair` 두 개를 적고, 해당 증강체 훅에서 `has('res_…')`로 분기.
- 난이도: `data/enemies.ts`의 `enemyMult` 한 줄과 보스 수치. 바꾼 뒤 `npm test`의 봇 클리어율·라운드별 결과를 본다.

## 출처

- 캐릭터 도트: [DawnLike 16x16 Universal Rogue-like tileset v1.81](https://opengameart.org/content/dawnlike-16x16-universal-rogue-like-tileset-v181) — DragonDePlatino, CC-BY 4.0. 팔레트: DawnBringer. 원본 라이선스 문서는 `public/sprites/dawnlike/README.txt`.
  - 작가 요청에 따라 Platino 스프라이트가 게임 안 어딘가에 숨어 있다.
- 유닛·적과 스프라이트 대응표는 `src/ui/sprites.ts`의 `SPR`. 새 유닛은 여기에 `[시트, 열, 행]` 한 줄을 더한다 (없으면 이모지로 그린다).
