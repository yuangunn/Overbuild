// 화면: 상태(run/meta)를 HTML 문자열로 그리고, 클릭·드래그를 core 함수 호출로 바꾼다.
import '../style.css'
import { STAR_MULT, W, H, type Battle } from '../core/battle.ts'
import { UNIT, UNITS, type TraitId, type UnitTpl } from '../core/data/units.ts'
import { ENEMIES, AFFIX, AFFIXES, ELITES, enemyMult } from '../core/data/enemies.ts'
import { TRAITS, TRAIT_IDS } from '../core/data/traits.ts'
import { AUG, AUGMENTS, RESONANCES } from '../core/data/augments.ts'
import { ITEM, ITEMS } from '../core/data/items.ts'
import { LIMITS, PASSIVES, SKILL_SRC, cleanHero, newHero, powerGrade, registerHeroes, skillDesc, type HeroDef, type Stat } from '../core/heroes.ts'
import * as R from '../core/run.ts'
import * as M from '../core/meta.ts'
import { playBattle, fmt, drawFloor, type Player } from './arena.ts'
import { SPR, SHEET_NAMES, sprHTML, sprAt, cellsOf, isSheet, iconHTML, floorImg, CREDITS, type Sheet } from './sprites.ts'
import { version } from '../../package.json'

type Screen = 'title' | 'run' | 'meta' | 'codex' | 'heroes'

let meta = M.loadMeta()
let run: R.RunState | null = (r => r && R.fixRun(r))(M.loadRun())
let screen: Screen = 'title'
let battle: Battle | null = null
let player: Player | null = null
let sel: { unit?: number; item?: number } = {}
let drag: { unit?: number; item?: number } | null = null
let showSummary = false
let earned = 0

// 샌드박스: run 자리에 샌드박스 상태를 넣어 원정 화면·드래그·툴팁을 그대로 쓰고, 원정 상태는 exp에 맡겨 둔다
let exp: R.RunState | null = null
let sand: R.RunState | null = null
type Brush = { k: 'unit' | 'item'; id: string } | { k: 'erase' } | null
let brush: Brush = null
let bStar = 1, bAff = ''
let palTab: 'ally' | 'foe' | 'hero' | 'item' = 'ally'

// 나만의 영웅 (고칠 때마다 바로 저장)
let heroes = M.loadHeroes()
let editing: string | null = heroes[0]?.id ?? null
let sheet: Sheet = 'Humanoid'
let delArm = ''
function syncHeroes() {
  registerHeroes(heroes)
  for (const h of heroes) if (isSheet(h.spr[0])) SPR[h.id] = [h.spr[0], h.spr[1], h.spr[2]]
}
syncHeroes()
const saveHeroes = () => { syncHeroes(); M.saveHeroes(heroes) }
const curHero = () => heroes.find(h => h.id === editing)
const openSheet = () => { const s0 = curHero()?.spr[0]; if (s0 && isSheet(s0)) sheet = s0 } // 고른 영웅의 외형 시트를 연다
const save = () => { if (run) run.sandbox ? M.saveSand(run) : M.saveRun(run) }

const $app = document.getElementById('app')!
const $tip = document.getElementById('tip')!
const $toasts = document.getElementById('toasts')!

const RARITY = ['', '실버', '골드', '프리즘']
const stars = (n: number) => '★'.repeat(n)
// 도트 아이콘 (없으면 이모지)
const ic = (id: string, sz = 16, emoji = '') => iconHTML(id, 's' + sz) || (emoji ? `<span class="em">${emoji}</span>` : '')
const augIc = (id: string, sz = 16) => ic(id, sz, AUG[id]?.emoji ?? RESONANCES.find(r => r.id === id)?.emoji)
const unlockIc = (id: string, sz = 32) => id.startsWith('u_') ? sprHTML(id.slice(2), '', '', 0) : augIc(id.startsWith('a_') ? id.slice(2) : id, sz)
const traitChip = (id: keyof typeof TRAITS) => `<span class="chip" style="--c:${TRAITS[id].color}">${ic(id)}${TRAITS[id].name}</span>`
const traitChips = (t: UnitTpl) => t.traits.map(traitChip).join('')
const COUNT_NAMES: Record<string, string> = { treasure: `${sprHTML('treasure', '💰', 'mini', 1)}보물 고블린 처치`, escaped: `${sprHTML('treasure', '💰', 'mini', 1)}보물 고블린 도망`, rebirth: `${sprHTML('phoenix', '🔥', 'mini')}불사조 부활`, ring: `${ic('ring')}쌍둥이 반지`, rune: `${ic('rune')}폭발 룬`, undead: `${ic('undead')}망령 부활`, res_bomb: `${ic('res_bomb')}망자의 폭탄` }
const countName = (k: string) => COUNT_NAMES[k] ?? (AUG[k] ? `${augIc(k)}${AUG[k].name}` : k)
const PARADE = ['shieldbearer', 'ranger', 'apprentice', 'cutthroat', 'wolf', 'frostwitch', 'golem', 'necromancer']

// ───────────────────────── 렌더
function render() {
  hideTip()
  $app.innerHTML = screen === 'title' ? titleScreen() : screen === 'meta' ? metaScreen() : screen === 'codex' ? codexScreen() : screen === 'heroes' ? heroesScreen() : run ? runScreen(run) : ''
  paintFloor()
}

// 준비 화면 전장 바닥: 전투 화면과 같은 타일 (캔버스 크기는 화면 픽셀에 맞춘다)
function paintFloor() {
  const cv = $app.querySelector<HTMLCanvasElement>('canvas.floor')
  if (!cv || !run) return
  const dpr = devicePixelRatio || 1
  cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr)
  drawFloor(cv.getContext('2d')!, zoneOf(run), 0, 0, cv.width, cv.height)
}
floorImg.addEventListener('load', () => paintFloor())
addEventListener('resize', () => paintFloor())

function titleScreen() {
  const cont = run && !run.over
  return `<div class="title-screen">
    <div class="logo">OVER<b>BUILD</b></div>
    <div class="parade">${PARADE.map(id => sprHTML(id, '', '', 0)).join('')}<span style="width:40px"></span>${['goblin', 'orc', 'boss'].map(id => sprHTML(id, '', '', 1)).join('')}</div>
    <p class="tag">작은 선택이 쌓여, 사기 조합이 완성되는 순간.</p>
    <div class="menu">
      <button class="primary big" data-act="new">${ic('wave', 32)} 새 원정</button>
      ${cont ? `<button class="big" data-act="resume">▶ 이어하기 · ${run!.round}라운드</button>` : ''}
      <div class="row">
        <button data-act="meta">${ic('shard')} 영구 성장 <b class="gold">${meta.shards}</b></button>
        <button data-act="codex">${ic('codex')} 공명 도감 ${meta.found.length}/${RESONANCES.length}</button>
        <button data-act="sandbox">${ic('train')} 샌드박스</button>
        <button data-act="heroes">${sprHTML('bladedancer', '', 'mini', 0)} 나만의 영웅 ${heroes.length}</button>
      </div>
    </div>
    <div class="howto">
      <div><b>${ic('coin')}모집·배치</b>상점에서 사서 끌어다 놓으세요.<br>같은 유닛 3개면 ★ 승급.</div>
      <div><b>${ic('overload')}증강체</b>규칙을 바꾸는 힘. 두 개가 맞물리면<br><em>공명</em>이 터집니다.</div>
      <div><b>${ic('boss')}15라운드</b>5·10 정예, 15 최종 보스.<br>생명 ${3 + (meta.unlocked.includes('life') ? 1 : 0)}개, 져도 계속 갑니다.</div>
    </div>
    <p class="dim">최고 ${meta.best}라운드 · 클리어 ${meta.wins}회 · 원정 ${meta.runs}회</p>
    <p class="credits">v${version} · ${CREDITS}</p>
  </div>`
}

function metaScreen() {
  return `<div class="page">
    <header class="page-head"><button class="ghost" data-act="title">← 뒤로</button><h2>영구 성장</h2><div class="pill gold">${ic('shard')}<b>${meta.shards}</b> 별조각</div></header>
    <p class="dim">원정이 끝나면 이긴 전투·정예·클리어·새 공명만큼 별조각을 받습니다. 해금은 다음 원정부터 적용됩니다.</p>
    <div class="unlocks">${M.UNLOCKS.map(u => {
      const own = meta.unlocked.includes(u.id)
      return `<div class="unlock ${own ? 'own' : ''}">
        ${unlockIc(u.id, 48)}<div class="body"><b>${u.name}</b><span class="dim">${u.desc}</span></div>
        ${own ? '<span class="done">해금됨</span>' : `<button data-act="unlock" data-id="${u.id}" ${meta.shards < u.cost ? 'disabled' : ''}>${ic('shard')}${u.cost}</button>`}
      </div>`
    }).join('')}</div>
  </div>`
}

function codexScreen() {
  return `<div class="page">
    <header class="page-head"><button class="ghost" data-act="title">← 뒤로</button><h2>공명 도감</h2><div class="pill">${meta.found.length}/${RESONANCES.length}</div></header>
    <p class="dim">두 증강체를 함께 가지면 숨은 효과가 깨어납니다. 짝은 공개, 효과는 찾아야 보입니다.</p>
    <div class="codex">${RESONANCES.map(r => {
      const f = meta.found.includes(r.id)
      return `<div class="res-card ${f ? 'found' : ''}">
        <div class="pair">${r.pair.map(p => `<span>${augIc(p)}${AUG[p].name}</span>`).join('<i>+</i>')}</div>
        <div class="res-name">${f ? `${augIc(r.id, 32)}${r.name}` : '？？？'}</div>
        <p>${f ? r.desc : '아직 발견하지 못했습니다.'}</p>
      </div>`
    }).join('')}</div>
  </div>`
}

function runScreen(s: R.RunState) {
  const board = R.boardOf(s), bench = R.benchOf(s), slots = R.slotsOf(s)
  const syn = R.synergies(s), res = R.activeRes(s)
  const selU = sel.unit != null ? s.units.find(u => u.id === sel.unit) : undefined
  const sb = !!s.sandbox
  return `<div class="run ${battle ? 'fighting' : ''} ${sb ? 'sandbox' : ''}">
    <header class="top">
      <div class="brand">OVER<b>BUILD</b></div>
      ${sb ? sandTop(s) : `<div class="pill">라운드 <b>${s.round}</b>/${R.MAX_ROUND}</div>
      <div class="pill wave ${s.wave.kind}">${ic(s.wave.kind === 'normal' ? 'wave' : s.wave.kind)} ${s.wave.label}</div>
      ${nextElite(s)}
      <div class="pill lives" title="생명">${ic('heart').repeat(Math.max(0, s.lives))}${ic('heart0').repeat(Math.max(0, s.maxLives - s.lives))}</div>
      <div class="pill gold" title="골드">${ic('coin')}<b>${s.gold}</b></div>
      <div class="pill ${board.length < slots ? 'warn' : ''}" title="배치">${sprHTML('shieldbearer', '', 'mini', 0)}${board.length}/${slots}</div>`}
      <div class="sp"></div>
      ${sb ? `<button class="ghost" data-act="heroes" ${battle ? 'disabled' : ''}>나만의 영웅</button>` : ''}
      <button class="ghost" data-act="title" ${battle ? 'disabled' : ''}>메뉴</button>
    </header>
    <div class="mid">
      <aside class="panel">
        <h3>시너지</h3>
        ${syn.length ? syn.map(synRow).join('') : '<p class="dim small">유닛을 배치하면 시너지가 켜집니다. 같은 특성 2명·4명.</p>'}
      </aside>
      <section class="center">
        <div class="hud" id="hud">${battle ? '' : sb ? sandHud() : `<span class="dim">다음 적 · ${s.wave.spawns.length}명</span>${s.wave.hint ? `<span class="gimmick" title="${s.wave.hint}">${ic('elite')}<span>${s.wave.hint}</span></span>` : ''}`}</div>
        <div class="arena z${zoneOf(s)}" id="arena">${battle ? '<canvas id="cv"></canvas>' : '<canvas class="floor"></canvas>' + arenaCells(s)}</div>
        <div class="ctrl">
          <div class="speed">${[1, 2, 4].map(v => `<button data-act="speed" data-v="${v}" class="${meta.speed === v ? 'on' : ''}">${v}x</button>`).join('')}</div>
          ${battle ? '<button class="big" data-act="skip">⏭ 결과 바로 보기</button>'
            : `<button class="big fight" data-act="fight" ${board.length && s.wave.spawns.length ? '' : 'disabled'}>${ic('wave', 32)} 전투 시작 <kbd>Space</kbd></button>`}
          <div class="hint dim small">${battle || sb ? '' : board.length < slots ? `빈 칸 ${slots - board.length}개 — 대기석 유닛을 끌어다 놓으세요` : '오른쪽은 이번 적입니다 (마우스를 올려 보기)'}</div>
        </div>
      </section>
      ${sb ? sandRight(s, res) : `<aside class="panel">
        <h3>증강체 <span class="dim">${s.augments.length}</span></h3>
        ${s.augments.length ? s.augments.map(id => `<div class="aug-row r${AUG[id].rarity}" data-tip="a:${id}">${augIc(id)}${AUG[id].name}</div>`).join('')
          : '<p class="dim small">1라운드가 끝나면 첫 증강체를 고릅니다.</p>'}
        ${res.length ? `<h3>공명</h3>${res.map(r => `<div class="aug-row res" data-tip="r:${r.id}">${augIc(r.id)}${r.name}</div>`).join('')}` : ''}
        <h3>아이템 <span class="dim small">유닛에 끌어 놓기</span></h3>
        <div class="items">${s.items.length ? s.items.map((it, i) => `<span class="item ${sel.item === i ? 'sel' : ''}" data-item="${i}" data-act="item" data-i="${i}" data-tip="i:${it}">${ic(it, 32, ITEM[it].emoji)}</span>`).join('') : '<span class="dim small">없음</span>'}</div>
      </aside>`}
    </div>
    ${sb ? sandBottom() : `<footer class="bottom">
      <div class="bench" data-drop="bench">
        <div class="lbl">대기석 <span class="dim">${bench.length}/${R.BENCH}</span></div>
        <div class="slots">${Array.from({ length: R.BENCH }, (_, i) => `<div class="bslot">${bench[i] ? token(bench[i]) : ''}</div>`).join('')}</div>
      </div>
      <div class="shop" data-drop="sell">
        <div class="lbl">상점 ${selU ? `<button class="sell" data-act="sell">${UNIT[selU.tpl].name} 판매 +${R.sellValue(selU)}${ic('coin')}</button>` : '<span class="dim small">유닛을 여기로 끌어오면 판매</span>'}</div>
        <div class="cards">${s.shop.map((id, i) => shopCard(s, id, i)).join('')}
          <div class="shopbtns">${xpButton(s)}
          <button class="reroll" data-act="reroll" ${s.gold < 1 && !s.freeRerolls ? 'disabled' : ''}>새로고침<span>${s.freeRerolls ? '무료' : `1${ic('coin')}`}</span><kbd>D</kbd></button></div>
        </div>
      </div>
    </footer>`}
    ${modal(s)}
  </div>`
}

// 다음 정예·보스 예고 (Slay the Spire 지도 꼭대기의 보스 표시처럼 미리 보고 준비한다)
function nextElite(s: R.RunState) {
  const r = Object.keys(ELITES).map(Number).find(x => x > s.round || (x === s.round && s.wave.kind === 'normal'))
  if (!r || r === s.round) return ''
  const id = s.elites?.[r] ?? ELITES[r][0]
  return `<div class="pill next" data-tip="x:${r}">${r}R ${r >= R.MAX_ROUND ? '보스' : '정예'} ${sprHTML(id, ENEMIES[id].emoji, 'mini', 1)}${ENEMIES[id].name}</div>`
}

// 전장 구역: 0 숲 · 1 폐허 · 2 심연 · 3 보스
const zoneOf = (s: R.RunState) => (s.wave.kind === 'boss' || s.wave.spawns.some(sp => ENEMIES[sp.tpl]?.boss) ? 3 : s.round <= 5 ? 0 : s.round <= 10 ? 1 : 2)

const pos = (x: number, y: number) => `left:${((x - 0.5) / W) * 100}%;top:${((y - 0.5) / H) * 100}%;width:${100 / W}%;height:${100 / H}%`

function arenaCells(s: R.RunState) {
  let h = '<div class="zone mine"></div><div class="zone foe"></div>'
  for (let cell = 0; cell < 12; cell++) {
    const { x, y } = R.cellXY(cell, 0)
    const u = s.units.find(o => o.pos === cell)
    h += `<div class="cell" data-drop="cell" data-cell="${cell}" style="${pos(x, y)}">${u ? token(u) : ''}</div>`
  }
  s.wave.spawns.forEach((sp, i) => {
    const { x, y } = R.cellXY(sp.cell, 1)
    const t = R.tplOf(sp.tpl)
    if (!t) return
    const glow = sp.aff ? AFFIX[sp.aff]?.color : t.flee ? '#dad45e' : ''
    h += `<div class="cell foe" data-drop="ecell" data-cell="${sp.cell}" style="${pos(x, y)}"><div class="tok enemy ${t.boss ? 'boss' : t.size && t.size > 0.9 ? 'elite' : ''} ${glow ? 'aff' : ''}" ${glow ? `style="--rc:${glow}"` : ''} data-tip="e:${i}"><i class="base"></i>${sprHTML(t.id, t.emoji, '', 1)}${sp.star && sp.star > 1 ? `<span class="st">${stars(sp.star)}</span>` : ''}</div></div>`
  })
  if (s.sandbox) for (let cell = 0; cell < 12; cell++) {
    if (s.wave.spawns.some(sp => sp.cell === cell)) continue
    const { x, y } = R.cellXY(cell, 1)
    h += `<div class="cell foe empty" data-drop="ecell" data-cell="${cell}" style="${pos(x, y)}"></div>`
  }
  return h
}

function token(u: R.OwnedUnit) {
  const t = UNIT[u.tpl]
  return `<div class="tok c${t.cost} s${u.star} ${sel.unit === u.id ? 'sel' : ''}" data-unit="${u.id}" data-tpl="${u.tpl}" data-tip="u:${u.id}">
    <i class="base"></i>${sprHTML(t.id, t.emoji, '', 0)}<span class="st">${stars(u.star)}</span>
    ${u.items.length ? `<span class="its">${u.items.map(i => ic(i, 16, ITEM[i].emoji)).join('')}</span>` : ''}</div>`
}

// 지휘 레벨: 경험치를 사서 배치 칸과 상점 확률을 앞당긴다 (TFT의 경험치 구매, F 키도 같게)
function xpButton(s: R.RunState) {
  const { lv, cur, need } = R.levelOf(s.xp)
  const max = lv >= R.MAX_LV
  return `<button class="reroll xpbuy" data-act="buyXp" data-tip="l:" ${max || s.gold < R.BUY_XP ? 'disabled' : ''}>지휘 Lv${lv}
    <i class="xpbar"><i style="width:${max ? 100 : (cur / need) * 100}%"></i></i><span>${max ? '최대' : `+${R.BUY_XP} · ${R.BUY_XP}${ic('coin')}`}</span><kbd>F</kbd></button>`
}

function shopCard(s: R.RunState, id: string | null, i: number) {
  if (!id) return '<div class="card empty"></div>'
  const t = UNIT[id]
  const own = s.units.filter(u => u.tpl === id && u.star === 1).length
  return `<div class="card c${t.cost} ${s.gold < t.cost || !R.canAdd(s, id) ? 'poor' : ''} ${own >= 2 ? 'merge' : ''}" data-act="buy" data-i="${i}" data-tip="t:${id}">
    <div class="cardspr">${sprHTML(t.id, t.emoji, '', 0)}</div><div class="nm">${t.name}</div>
    <div class="tr">${t.traits.map(x => `<span style="color:${TRAITS[x].color}">${ic(x)}${TRAITS[x].name}</span>`).join('')}</div>
    <div class="cost">${ic('coin')}${t.cost}</div>${own ? `<div class="own">${own >= 2 ? '★2 승급!' : `${own}/3`}</div>` : ''}
  </div>`
}

function synRow(sy: R.Syn) {
  const d = TRAITS[sy.id]
  return `<div class="syn t${sy.tier}" style="--c:${d.color}" data-tip="s:${sy.id}">
    ${ic(d.id)}<span class="nm">${d.name}</span>
    <span class="steps">${d.tiers.map(n => `<i class="${sy.count >= n ? 'on' : ''}">${n}</i>`).join('')}</span><b>${sy.crest ? ic('boss') : ''}${sy.count}</b>
  </div>`
}

// ───────────────────────── 모달
function modal(s: R.RunState) {
  if (battle) return ''
  if (showSummary && s.last) return summaryModal(s)
  if (s.over) return endModal(s)
  if (s.queue[0] === 'augment') return augModal(s)
  if (s.queue[0] === 'reward') return rewardModal(s)
  return ''
}

function summaryModal(s: R.RunState) {
  const sm = s.last!
  const top = Math.max(1, ...sm.dmg.map(d => d.v))
  const counts = Object.entries(sm.counts).filter(([k]) => k !== 'manasurge' || sm.counts.manasurge > 0).sort((a, b) => b[1] - a[1])
  return `<div class="modal"><div class="box summary ${sm.win ? 'win' : 'lose'}">
    <h2>${sm.win ? '승리!' : '패배…'}</h2>
    <p class="dim">${sm.label} · ${sm.time.toFixed(1)}초${sm.win || s.sandbox ? '' : ' · 생명 -1 · 다음 증강체 등급 ↑, 골드 +2'}${sm.growth ? ` · 성장 +${Math.round(sm.growth * 100)}%` : ''}</p>
    <div class="meter">${sm.dmg.slice(0, 8).map((d, i) => `<div class="mrow ${i === 0 && sm.win ? 'mvp' : ''}" style="--i:${i}"><span class="who">${i === 0 && sm.win ? ic('boss') : ''}${sprHTML(d.id, d.emoji, 'mini', 0)} ${d.name}${d.star ? ` <i>${stars(d.star)}</i>` : ''}${d.n > 1 ? ` ×${d.n}` : ''}</span>
      <div class="bar"><i style="width:${(d.v / top) * 100}%"></i></div><b>${fmt(d.v)}</b>${s.sandbox ? `<i class="tk">받음 ${fmt(d.taken)}</i>` : ''}</div>`).join('')}</div>
    ${counts.length ? `<div class="counts">${counts.map(([k, v], i) => `<span class="chip" style="--i:${i}">${countName(k)} ×${v}</span>`).join('')}</div>` : ''}
    ${sm.loot ? `<p class="gold">${ic('coin')} 보물 고블린 +${sm.loot} 골드</p>` : ''}
    <p class="dim">최대 일격 <b class="gold">${fmt(sm.maxHit)}</b></p>
    <button class="primary big" data-act="continue">${s.sandbox ? '다시 배치' : '계속'} <kbd>Space</kbd></button>
  </div></div>`
}

function augModal(s: R.RunState) {
  const pity = s.pity > 0
  return `<div class="modal"><div class="box pick">
    <h2>증강체 선택</h2>
    <p class="dim">${pity ? '역전의 기회 — 실버 등급이 거의 나오지 않습니다' : '하나를 고르세요. 빛나는 카드는 지금 가진 증강체와 공명합니다.'}</p>
    <div class="aug-cards">${s.augChoices.map(id => augCard(s, id)).join('')}</div>
    <button data-act="rerollAug" ${s.augRerolls ? '' : 'disabled'}>${ic('augroll')} 새로고침 (${s.augRerolls}회 남음)</button>
  </div></div>`
}

function augCard(s: R.RunState, id: string) {
  const a = AUG[id]
  const rel = RESONANCES.filter(r => r.pair.includes(id))
  const now = rel.filter(r => r.pair.every(p => p === id || s.augments.includes(p)))
  const later = rel.filter(r => !now.includes(r)).filter(r => {
    const other = AUG[r.pair.find(p => p !== id)!]
    return !other.locked || s.unlocked.includes('a_' + other.id)
  })
  return `<div class="aug-card r${a.rarity} ${now.length ? 'resonant' : ''}" data-act="pickAug" data-id="${id}">
    <div class="rar">${RARITY[a.rarity]}</div>
    <div class="em">${augIc(id, 64)}</div>
    <h3>${a.name}</h3>
    <p>${a.desc}</p>
    ${a.fit ? `<div class="fit">${a.fit.map(traitChip).join('')}</div>` : ''}
    ${now.map(r => `<div class="res-hit">공명 발동! ${augIc(r.id)} ${r.name}<small>${r.desc}</small></div>`).join('')}
    ${later.map(r => {
      const o = AUG[r.pair.find(p => p !== id)!]
      const known = meta.found.includes(r.id)
      return `<div class="res-hint">공명 짝: ${augIc(o.id)}${o.name} → ${known ? `${augIc(r.id)}${r.name}` : '？？？'}</div>`
    }).join('')}
  </div>`
}

function rewardModal(s: R.RunState) {
  const rare = s.last && s.last.kind !== 'normal'
  return `<div class="modal"><div class="box pick">
    <h2>${rare ? '정예 전리품' : '전리품'}</h2>
    <p class="dim">하나를 가져가세요.</p>
    <div class="aug-cards">${s.rewardChoices.map((r, i) => `<div class="aug-card rw" data-act="pickReward" data-i="${i}">${rewardBody(r)}</div>`).join('')}</div>
  </div></div>`
}

function rewardBody(r: R.Reward) {
  switch (r.kind) {
    case 'unit': {
      const t = UNIT[r.tpl]
      const full = run && r.star === 1 && !R.canAdd(run, r.tpl) || run && r.star > 1 && R.benchOf(run).length >= R.BENCH && R.boardOf(run).length >= R.slotsOf(run)
      return `<div class="rar">영입</div><div class="em">${sprHTML(t.id, t.emoji, 'big', 0)}</div><h3>${t.name} ${stars(r.star)}</h3><div class="fit">${traitChips(t)}</div><p>${t.skillName} — ${t.skillDesc}</p>${full ? `<p class="bad">대기석이 가득 차 받으면 ${t.cost * 3 ** (r.star - 1)}골드로 바뀝니다</p>` : ''}`
    }
    case 'gold': return `<div class="rar">보물</div><div class="em">${ic('gold', 64)}</div><h3>+${r.n} 골드</h3><p>상점을 더 돌리거나 비싼 유닛을 사세요.</p>`
    case 'item': return `<div class="rar">장비</div><div class="em">${r.ids.map(i => ic(i, r.ids.length > 1 ? 48 : 64, ITEM[i].emoji)).join('')}</div><h3>${r.ids.map(i => ITEM[i].name).join(' + ')}</h3><p>${r.ids.map(i => ITEM[i].desc).join('<br>')}</p>`
    case 'train': return `<div class="rar">단련</div><div class="em">${ic('train', 64)}</div><h3>전원 +${Math.round(r.n * 100)}%</h3><p>지금 배치된 모든 유닛의 공격력·체력이 영구히 올라갑니다.</p>`
    case 'slot': return `<div class="rar">지휘력</div><div class="em">${ic('slot', 64)}</div><h3>배치 칸 +1</h3><p>이번 원정 내내 한 명 더 내보낼 수 있습니다.</p>`
  }
}

function endModal(s: R.RunState) {
  const win = s.over === 'win'
  const next = M.UNLOCKS.filter(u => !meta.unlocked.includes(u.id) && meta.shards >= u.cost)
  return `<div class="modal"><div class="box end ${win ? 'win' : 'lose'}">
    <h1>${win ? '원정 성공!' : '원정 실패'}</h1>
    <p>${win ? '심연의 군주가 쓰러졌습니다.' : `${s.round}라운드에서 쓰러졌습니다.`}</p>
    <div class="endstats"><span>승리 <b>${s.stats.won}</b></span><span>정예 <b>${s.stats.elite}</b></span><span>최대 일격 <b>${fmt(s.stats.bestHit)}</b></span></div>
    <div class="aug-line">${s.augments.map(id => `<span data-tip="a:${id}">${augIc(id, 32)}</span>`).join('')}${R.activeRes(s).map(r => `<span class="res" data-tip="r:${r.id}">${augIc(r.id, 32)}</span>`).join('')}</div>
    <div class="shards">${ic('shard', 32)} +${earned} 별조각 <span class="dim">(보유 ${meta.shards})</span></div>
    ${next.length ? `<p class="gold">지금 해금할 수 있는 것 ${next.length}개 · ${next.slice(0, 3).map(u => u.name).join(', ')}${next.length > 3 ? ' …' : ''}</p>` : ''}
    <div class="row"><button class="primary big" data-act="new">한 판 더!</button><button data-act="meta">${ic('shard')} 영구 성장</button><button data-act="title">타이틀</button></div>
  </div></div>`
}

// ───────────────────────── 툴팁
function unitTip(t: UnitTpl, star: number, extra = '') {
  const m = STAR_MULT[star - 1]
  return `<div class="tip-h">${sprHTML(t.id, t.emoji, 'tipspr', 0)} <b>${t.name}</b> <span class="gold">${stars(star)}</span> <span class="dim">${t.custom ? '나만의 영웅' : t.cost + '골드'}</span></div>
    <div>${traitChips(t)}</div>
    <div class="stats">체력 ${fmt(t.hp * m)} · 공격 ${fmt(t.atk * m)} · 공속 ${t.as}/초 · 사거리 ${t.range}</div>
    <div><b class="skill">${t.skillName}</b> <span class="dim">마나 ${t.mana}</span><br>${t.skillDesc}</div>${extra}`
}

function tipHTML(key: string): string {
  const k = key[0], v = key.slice(2)
  if (k === 'u' && run) {
    const u = run.units.find(o => o.id === +v)
    if (!u) return ''
    const its = u.items.map(i => `<div class="tip-h">${ic(i)}${ITEM[i].name} <span class="dim">${ITEM[i].desc}</span></div>`).join('')
    return unitTip(UNIT[u.tpl], u.star, `${u.bonus ? `<div class="good">성장 +${Math.round(u.bonus * 100)}%</div>` : ''}${its}<div class="dim small">${run.sandbox ? '끌어서 옮기기 · 아래 칸으로 끌면 빠짐' : `판매 ${R.sellValue(u)}골드 · 클릭해서 선택`}</div>`)
  }
  if (k === 't') return unitTip(UNIT[v], 1, `<div class="dim small">${run && !R.canAdd(run, v) ? '<span class="bad">자리가 없습니다 — 대기석 유닛을 상점으로 끌어 판매</span>' : '클릭해서 구매'}</div>`)
  if (k === 'n') {
    const t = R.tplOf(v)
    if (!t) return ''
    if (UNIT[v]) return unitTip(t, bStar, '<div class="dim small">고른 뒤 칸을 누르면 배치</div>')
    return `<div class="tip-h">${sprHTML(t.id, t.emoji, 'tipspr', 1)} <b>${t.name}</b></div><div class="stats">체력 ${fmt(t.hp)} · 공격 ${fmt(t.atk)} · 사거리 ${t.range} <span class="dim">(1라운드 기준, 적 강도만큼 커짐)</span></div>${t.skillName ? `<div><b class="skill">${t.skillName}</b><br>${t.skillDesc}</div>` : ''}`
  }
  if (k === 'x') {
    const id = run?.elites?.[+v] ?? ELITES[+v]?.[0]
    const t = id ? ENEMIES[id] : undefined
    return t ? `<div class="tip-h">${sprHTML(t.id, t.emoji, 'tipspr', 1)} <b>${v}라운드 · ${t.name}</b></div><div><b class="skill">${t.skillName}</b><br>${t.skillDesc}</div><div class="dim small">원정을 시작할 때 정해집니다. 미리 대비하세요.</div>` : ''
  }
  if (k === 'e' && run) {
    const sp = run.wave.spawns[+v]
    if (!sp) return ''
    const t = R.tplOf(sp.tpl)
    if (!t) return ''
    const a = sp.aff ? AFFIX[sp.aff] : undefined
    const m = sp.mult * STAR_MULT[(sp.star ?? 1) - 1]
    return `<div class="tip-h">${sprHTML(t.id, t.emoji, 'tipspr', 1)} <b>${a ? `<span style="color:${a.color}">${a.name}</span> ` : ''}${t.name}</b>${sp.star && sp.star > 1 ? ` <span class="gold">${stars(sp.star)}</span>` : ''}</div>
      <div class="stats">체력 ${fmt(t.hp * m)} · 공격 ${fmt(t.atk * m)} · 사거리 ${t.range}</div>${t.skillName ? `<div><b class="skill">${t.skillName}</b><br>${t.skillDesc}</div>` : ''}${a ? `<div><b style="color:${a.color}">${a.name}</b> ${a.desc}</div>` : ''}`
  }
  if (k === 'a') {
    const a = AUG[v]
    const rel = RESONANCES.filter(r => r.pair.includes(v))
    return `<div class="tip-h">${augIc(v, 32)} <b>${a.name}</b> <span class="rar r${a.rarity}">${RARITY[a.rarity]}</span></div><div>${a.desc}</div>
      ${rel.map(r => { const o = AUG[r.pair.find(p => p !== v)!]; return `<div class="dim tip-h">공명 짝: ${augIc(o.id)}${o.name}</div>` }).join('')}`
  }
  if (k === 'r') { const r = RESONANCES.find(x => x.id === v)!; return `<div class="tip-h">${augIc(r.id, 32)} <b>${r.name}</b> <span class="gold">공명</span></div><div>${r.desc}</div><div class="dim tip-h">${r.pair.map(p => augIc(p) + AUG[p].name).join(' + ')}</div>` }
  if (k === 's') {
    const d = TRAITS[v as keyof typeof TRAITS]
    const sy = run ? R.synergies(run).find(x => x.id === v) : undefined
    const who = Object.values(UNIT).filter(t => t.traits.includes(d.id) && !t.custom && (!t.locked || run?.unlocked.includes('u_' + t.id)))
    return `<div class="tip-h">${ic(d.id, 32)} <b>${d.name}</b>${sy?.crest ? ' <span class="gold">문장: 효과 2배</span>' : ''}</div>
      ${d.tiers.map((n, i) => `<div class="${sy && sy.tier > i ? 'good' : 'dim'}">(${n}) ${d.desc[i]}</div>`).join('')}
      <div class="small who-list">${who.map(t => sprHTML(t.id, t.emoji, 'mini', 0) + t.name).join(' ')}</div>`
  }
  if (k === 'l' && run) {
    const { lv } = R.levelOf(run.xp)
    const row = (l: number) => `<tr class="${l === lv ? 'good' : 'dim'}"><td>Lv${l}</td><td>${l + 2}칸</td>${R.ODDS[l - 1].map(p => `<td>${p}%</td>`).join('')}</tr>`
    return `<div class="tip-h">${ic('slot', 32)} <b>지휘 레벨 ${lv}</b> <span class="dim">경험치 ${run.xp}</span></div>
      <div>라운드마다 경험치 ${R.XP_PER_ROUND}. ${R.BUY_XP}골드로 ${R.BUY_XP}를 더 사면 배치 칸이 늘고 비싼 유닛이 잘 나옵니다.</div>
      <table class="odds"><tr class="dim"><td></td><td>배치</td><td>1골드</td><td>2골드</td><td>3골드</td></tr>${Array.from({ length: R.MAX_LV }, (_, i) => row(i + 1)).join('')}</table>`
  }
  if (k === 'i') { const it = ITEM[v]; return `<div class="tip-h">${ic(v, 32, it.emoji)} <b>${it.name}</b></div><div>${it.desc}</div>` }
  return ''
}

function hideTip() { $tip.style.display = 'none' }

document.addEventListener('mouseover', e => {
  if (drag) return
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]')
  const html = el ? tipHTML(el.dataset.tip!) : ''
  if (!el || !html) return hideTip()
  $tip.innerHTML = html
  $tip.style.display = 'block'
  const r = el.getBoundingClientRect()
  const tw = $tip.offsetWidth, th = $tip.offsetHeight
  let y = r.top - th - 10
  if (y < 8) y = r.bottom + 10
  $tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px'
  $tip.style.top = Math.min(innerHeight - th - 8, y) + 'px'
})

// ───────────────────────── 토스트
function toast(msg: string, big = false) {
  const el = document.createElement('div')
  el.className = 'toast' + (big ? ' big' : '')
  el.innerHTML = msg
  $toasts.append(el)
  setTimeout(() => el.remove(), big ? 3600 : 2400)
}

// ───────────────────────── 흐름
function startNew() {
  player?.stop()
  battle = null
  run = R.newRun(meta)
  sel = {}
  showSummary = false
  screen = 'run'
}

function startBattle() {
  if (!run || battle || run.over || run.queue.length || !R.boardOf(run).length) return
  if (run.sandbox && !run.wave.spawns.length) return toast('적을 한 명 이상 놓으세요')
  save()
  battle = R.buildBattle(run)
  sel = {}
  render()
  const hud = $app.querySelector<HTMLElement>('#hud')!
  const b = battle
  const res = R.activeRes(run).map(r => ({ id: r.id, name: r.name, emoji: r.emoji, ids: [...r.pair, r.id], a: AUG[r.pair[0]].emoji, b: AUG[r.pair[1]].emoji }))
  player = playBattle($app.querySelector<HTMLCanvasElement>('#cv')!, b, () => meta.speed, finishBattle, () => {
    const ot = b.overtime
    const boss = b.fighters.find(f => f.boss && f.alive)
    hud.innerHTML = `<span class="${ot > 1 ? 'hot' : 'dim'}">⏱ ${b.t.toFixed(1)}초${ot > 1 ? ` · 격노 ×${ot.toFixed(1)}` : ''}</span>`
      + (boss ? `<span class="bossbar"><i style="width:${(boss.hp / boss.maxHp) * 100}%"></i><em>${boss.name} ${fmt(boss.hp)}</em></span>` : '')
  }, { zone: zoneOf(run), res })
}

function finishBattle() {
  if (!run || !battle) return
  if (run.sandbox) run.last = R.summarize(run, battle)
  else R.endBattle(run, battle)
  battle = null
  player = null
  showSummary = true
  if (run.over) earned = M.settle(meta, run)
  else save()
  render()
}

function after() {
  const before = snapshot()
  if (run) {
    for (const n of run.notes.splice(0)) toast(n)
    if (!run.over && !battle) save()
  }
  render()
  if (before) animateDiff(before)
}

// ── 준비 화면 연출: 다시 그리기 전후 DOM을 비교해 승급·등장·시너지 상승을 움직임으로 보여 준다
interface Snap { units: Map<number, { r: DOMRect; star: number; em: string; html: string }>; syn: Map<string, number> }
const starOf = (el: Element) => +(el.className.match(/\bs(\d)\b/)?.[1] ?? 1)

function snapshot(): Snap | null {
  if (!$app.querySelector('.run') || battle) return null
  const units = new Map<number, { r: DOMRect; star: number; em: string; html: string }>()
  $app.querySelectorAll<HTMLElement>('.run [data-unit]').forEach(el => units.set(+el.dataset.unit!, { r: el.getBoundingClientRect(), star: starOf(el), em: el.dataset.tpl ?? '', html: el.querySelector('.spr, .em')?.outerHTML ?? '' }))
  const syn = new Map<string, number>()
  $app.querySelectorAll<HTMLElement>('.syn').forEach(el => syn.set(el.dataset.tip!, +(el.className.match(/\bt(\d)\b/)?.[1] ?? 0)))
  return { units, syn }
}

function animateDiff(before: Snap) {
  if (!$app.querySelector('.run') || battle) return
  const now = new Map<number, HTMLElement>()
  $app.querySelectorAll<HTMLElement>('.run [data-unit]').forEach(el => now.set(+el.dataset.unit!, el))
  const gone = [...before.units].filter(([id]) => !now.has(id)).map(([, v]) => v)
  for (const [id, el] of now) {
    const old = before.units.get(id)
    const em = el.dataset.tpl ?? ''
    const fed = gone.filter(g => g.em === em && g.star < starOf(el))
    if ((old && starOf(el) > old.star) || (!old && fed.length)) {
      const to = el.getBoundingClientRect()
      for (const g of fed) flyGhost(g.html, g.r, to)
      el.classList.add('merged')
    } else if (!old) el.classList.add('appear')
  }
  $app.querySelectorAll<HTMLElement>('.syn').forEach(el => {
    const t = +(el.className.match(/\bt(\d)\b/)?.[1] ?? 0)
    if (t > (before.syn.get(el.dataset.tip!) ?? 0)) el.classList.add('up')
  })
}

function flyGhost(html: string, from: DOMRect, to: DOMRect) {
  const g = document.createElement('div')
  g.className = 'fly-ghost'
  g.innerHTML = html
  Object.assign(g.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' })
  document.body.append(g)
  g.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${to.left + to.width / 2 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 2}px) scale(.4)`, opacity: 0.2 },
  ], { duration: 320, easing: 'cubic-bezier(.5,0,.9,.6)' }).onfinish = () => g.remove()
}

// 카드 고르기: 고른 카드가 커지며 빛나고 나머지는 가라앉은 뒤 적용
let picking = false
function choose(el: HTMLElement, apply: () => void) {
  if (picking) return
  picking = true
  el.classList.add('chosen')
  el.parentElement?.querySelectorAll('.aug-card').forEach(c => c !== el && c.classList.add('dismiss'))
  setTimeout(() => { picking = false; apply(); after() }, 430)
}

function swapWith(a: number, b: number): string | null {
  if (!run || a === b) return null
  const ua = run.units.find(u => u.id === a), ub = run.units.find(u => u.id === b)
  if (!ua || !ub) return null
  if (ub.pos !== null) return R.move(run, a, ub.pos)
  if (ua.pos !== null) return R.move(run, b, ua.pos)
  return null
}

function act(name: string, el?: HTMLElement) {
  const d = el?.dataset ?? {}
  const s = run
  switch (name) {
    case 'new': leaveSandbox(); startNew(); break
    case 'resume': screen = 'run'; break
    case 'title': if (battle) return; leaveSandbox(); screen = 'title'; break
    case 'sandbox': enterSandbox(); break
    case 'heroes': if (battle) return; leaveSandbox(); screen = 'heroes'; openSheet(); break
    // 나만의 영웅
    case 'hNew': { const h = newHero(); heroes.push(h); editing = h.id; saveHeroes() } break
    case 'hEdit': editing = d.id!; delArm = ''; openSheet(); break
    case 'hDup': { const h = curHero(); if (h) { const c = cleanHero({ ...h, id: newHero().id, name: h.name.slice(0, 10) + ' 2' })!; heroes.push(c); editing = c.id; saveHeroes() } } break
    case 'hDel':
      if (delArm && delArm === editing) { heroes = heroes.filter(h => h.id !== editing); editing = heroes[0]?.id ?? null; delArm = ''; saveHeroes() }
      else delArm = editing ?? ''
      break
    case 'hTrait': { const h = curHero(), t = d.id as TraitId; if (h) { h.traits = h.traits.includes(t) ? h.traits.filter(x => x !== t) : [...h.traits, t].slice(-2); saveHeroes() } } break
    case 'hSheet': if (isSheet(d.id!)) sheet = d.id; break
    case 'hSpr': { const h = curHero(); if (h) { h.spr = [sheet, +d.c!, +d.r!]; saveHeroes() } } break
    case 'hUse': { const h = curHero(); enterSandbox(); if (h) { brush = { k: 'unit', id: h.id }; palTab = 'hero' } } break
    // 샌드박스
    case 'sRound': if (run?.sandbox && !battle) R.sandRound(run, run.round + +d.v!); break
    case 'sWave': if (run?.sandbox && !battle) R.sandWave(run, run.round); break
    case 'sTab': palTab = d.v as typeof palTab; break
    case 'sStar': bStar = +d.v!; break
    case 'sAff': bAff = d.v ?? ''; break
    case 'sErase': brush = brush?.k === 'erase' ? null : { k: 'erase' }; break
    case 'sBrush': { const k = d.k as 'unit' | 'item'; brush = brush && 'id' in brush && brush.k === k && brush.id === d.id ? null : { k, id: d.id! } } break
    case 'sClear': if (run?.sandbox && !battle) { if (d.v === '1') run.wave.spawns = []; else run.units = [] } break
    case 'sAug': if (run?.sandbox && !battle) R.sandAug(run, d.id!); break
    case 'sAugClear': if (run?.sandbox && !battle) run.augments = []; break
    case 'meta': screen = 'meta'; break
    case 'codex': screen = 'codex'; break
    case 'unlock': { const e = M.buyUnlock(meta, d.id!); toast(e ?? '해금! 다음 원정부터 적용됩니다') } break
    case 'speed':
      meta.speed = +d.v!
      M.saveMeta(meta)
      if (battle) { $app.querySelectorAll('[data-act=speed]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.v === d.v)); return }
      break
    case 'skip': player?.skip(); return
    case 'fight': startBattle(); return
    case 'continue': showSummary = false; break
    default: {
      if (!s || battle) return
      if (name === 'buy') { const e = R.buy(s, +d.i!); if (e) toast(e) }
      else if (name === 'reroll') { const e = R.reroll(s); if (e) toast(e) }
      else if (name === 'buyXp') { const e = R.buyXp(s); if (e) toast(e) }
      else if (name === 'sell' && sel.unit != null) { toast(`+${R.sell(s, sel.unit)} 골드`); sel = {} }
      else if (name === 'item') sel = sel.item === +d.i! ? {} : { item: +d.i! }
      else if (name === 'rerollAug') R.rerollAugs(s)
      else if (name === 'pickAug') return choose(el!, () => celebrate(R.pickAug(s, d.id!)))
      else if (name === 'pickReward') return choose(el!, () => R.pickReward(s, +d.i!))
    }
  }
  after()
}

function celebrate(fresh: string[]) {
  if (!run) return
  for (const id of fresh) {
    const r = RESONANCES.find(x => x.id === id)!
    const isNew = !meta.found.includes(id)
    if (isNew) { meta.found.push(id); run.stats.fresh++; M.saveMeta(meta) }
    resCut(r, isNew)
  }
}

// 공명 컷인: 두 증강체가 가운데서 부딪쳐 공명이 깨어난다 (클릭하면 닫힘)
function resCut(r: (typeof RESONANCES)[number], isNew: boolean) {
  const el = document.createElement('div')
  el.className = 'res-cut'
  el.innerHTML = `<div class="band"><span class="ia">${augIc(r.pair[0], 64)}</span><span class="ib">${augIc(r.pair[1], 64)}</span>
    <span class="ir">${augIc(r.id, 64)}</span><div class="rt"><small>${isNew ? '새 공명 발견' : '공명 발동'}</small><b>${r.name}</b><p>${r.desc}</p></div></div>`
  el.onclick = () => el.remove()
  document.body.append(el)
  setTimeout(() => el.remove(), 3400)
}

// ───────────────────────── 입력
$app.addEventListener('click', e => {
  if (swallowClick) return
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-unit],[data-drop]')
  if (!el) return
  if (el.dataset.act) return act(el.dataset.act, el)
  if (!run || battle || modal(run)) return
  if (run.sandbox && brush) { const c = el.closest<HTMLElement>('.cell'); if (c) return sandClick(c) }
  let err: string | null = null
  if (el.dataset.unit) {
    const id = +el.dataset.unit
    if (sel.item != null) { err = R.equip(run, sel.item, id); sel = {} }
    else if (sel.unit != null && sel.unit !== id) { err = swapWith(sel.unit, id); sel = {} }
    else sel = sel.unit === id ? {} : { unit: id }
  } else if (sel.unit != null && el.dataset.drop === 'cell') { err = R.move(run, sel.unit, +el.dataset.cell!); sel = {} }
  else if (sel.unit != null && el.dataset.drop === 'bench') { err = R.move(run, sel.unit, null); sel = {} }
  else return
  if (err) toast(err)
  after()
})

// 포인터 드래그 (마우스·터치 공통). 6px 넘게 움직이면 드래그, 아니면 클릭으로 처리.
let press: { x: number; y: number; el: HTMLElement } | null = null
let ghost: HTMLElement | null = null
let swallowClick = false

$app.addEventListener('pointerdown', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-unit],[data-item]')
  if (!el || !run || battle || e.button !== 0) return
  press = { x: e.clientX, y: e.clientY, el }
})
addEventListener('pointermove', e => {
  if (!press) return
  if (!drag) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return
    const d = press.el.dataset
    drag = d.unit ? { unit: +d.unit } : { item: +d.item! }
    ghost = press.el.cloneNode(true) as HTMLElement
    const r = press.el.getBoundingClientRect()
    Object.assign(ghost.style, { position: 'fixed', width: r.width + 'px', height: r.height + 'px', pointerEvents: 'none', zIndex: '100', opacity: '.85', margin: '0' })
    ghost.classList.add('drag-ghost')
    document.body.append(ghost)
    hideTip()
    $app.classList.add(drag.unit != null ? 'drag-unit' : 'drag-item')
  }
  ghost!.style.left = e.clientX - ghost!.offsetWidth / 2 + 'px'
  ghost!.style.top = e.clientY - ghost!.offsetHeight / 2 + 'px'
})
addEventListener('pointerup', e => {
  const d = drag
  press = null
  drag = null
  ghost?.remove()
  ghost = null
  $app.classList.remove('drag-unit', 'drag-item')
  if (!d || !run) return
  swallowClick = true
  setTimeout(() => { swallowClick = false })
  const t = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  const tok = t?.closest<HTMLElement>('[data-unit]'), zone = t?.closest<HTMLElement>('[data-drop]')
  let err: string | null = null
  if (d.item != null) { if (tok) err = R.equip(run, d.item, +tok.dataset.unit!) }
  else if (d.unit != null) {
    if (zone?.dataset.drop === 'sell') toast(`+${R.sell(run, d.unit)} 골드`)
    else if (tok) err = swapWith(d.unit, +tok.dataset.unit!)
    else if (zone?.dataset.drop === 'cell') err = R.move(run, d.unit, +zone.dataset.cell!)
    else if (zone?.dataset.drop === 'bench') err = R.move(run, d.unit, null)
  }
  sel = {}
  if (err) toast(err)
  after()
})

addEventListener('keydown', e => {
  if (screen !== 'run' || !run || battle) return
  if (e.code === 'Space') {
    e.preventDefault()
    if (showSummary) act('continue')
    else if (!modal(run)) act('fight')
  } else if (e.code === 'KeyD' && !modal(run) && !run.sandbox) act('reroll')
  else if (e.code === 'KeyF' && !modal(run) && !run.sandbox) act('buyXp')
  else if (e.code === 'Escape') { sel = {}; brush = null; render() }
})

// ───────────────────────── 샌드박스 (Bloons TD 6 샌드박스·TABS 배치처럼: 돈·목숨 없이 양쪽을 마음대로)
function enterSandbox() {
  if (battle) return
  if (!run?.sandbox) exp = run
  const s = sand ?? M.loadSand() ?? R.newSandbox()
  // 지운 영웅·없어진 적은 걸러 낸다 (저장분은 손댈 수 있다)
  s.units = s.units.filter(u => UNIT[u.tpl] && u.pos !== null)
  s.wave.spawns = s.wave.spawns.filter(sp => R.tplOf(sp.tpl))
  s.augments = s.augments.filter(a => AUG[a])
  s.queue = []
  s.over = null
  run = s
  sel = {}
  showSummary = false
  screen = 'run'
}

function leaveSandbox() {
  if (!run?.sandbox) return
  sand = run
  M.saveSand(run)
  run = exp
  exp = null
  brush = null
  showSummary = false
}

const sandTop = (s: R.RunState) => `<div class="pill sandpill">${ic('train')} 샌드박스</div>
  <div class="pill" title="적 배율·배치 칸 기준 라운드">적 강도
    <button class="ghost tiny" data-act="sRound" data-v="-1" ${battle ? 'disabled' : ''}>◀</button><b>${s.round}R</b><span class="dim">×${enemyMult(s.round).toFixed(1)}</span>
    <button class="ghost tiny" data-act="sRound" data-v="1" ${battle ? 'disabled' : ''}>▶</button></div>
  <button class="ghost" data-act="sWave" ${battle ? 'disabled' : ''}>${s.round}라운드 적 불러오기</button>
  <div class="pill">아군 ${R.boardOf(s).length} · 적 ${s.wave.spawns.length}</div>`

function sandHud() {
  const b = brush
  const msg = !b ? '아래에서 유닛·아이템을 고르고 칸을 누르세요 · 아군은 끌어서 옮기고, 아래 칸으로 끌면 빠집니다'
    : b.k === 'erase' ? '지우개: 누른 유닛의 아이템 → 유닛 순서로 지웁니다'
    : b.k === 'item' ? `${ITEM[b.id].name}: 아군 유닛을 누르면 장착 (3개까지)`
    : `${R.tplOf(b.id)?.name ?? ''} ${stars(bStar)}: ${UNIT[b.id] ? '양쪽 아무 칸에나' : '적 진영(오른쪽) 칸에'} 놓습니다`
  return `<span class="${b ? 'gimmick' : 'dim'}">${msg}</span>`
}

function sandRight(s: R.RunState, res: ReturnType<typeof R.activeRes>) {
  return `<aside class="panel sand-augs">
    <h3>증강체 <span class="dim">눌러서 켜고 끄기</span></h3>
    <div class="aug-grid">${AUGMENTS.map(a => `<span class="aug-row r${a.rarity} ${s.augments.includes(a.id) ? 'on' : 'off'}" data-act="sAug" data-id="${a.id}" data-tip="a:${a.id}">${augIc(a.id)}<span>${a.name}</span></span>`).join('')}</div>
    ${res.length ? `<h3>공명</h3>${res.map(r => `<div class="aug-row res" data-tip="r:${r.id}">${augIc(r.id)}${r.name}</div>`).join('')}` : ''}
    ${s.augments.length ? '<button class="ghost" data-act="sAugClear">모두 끄기</button>' : ''}
  </aside>`
}

const palCard = (k: 'unit' | 'item', id: string, art: string, name: string, tip: string) =>
  `<div class="pcard ${brush && 'id' in brush && brush.k === k && brush.id === id ? 'on' : ''}" data-act="sBrush" data-k="${k}" data-id="${id}" data-tip="${tip}">${art}<span>${name}</span></div>`

function sandBottom() {
  const tabs: [typeof palTab, string][] = [['ally', '아군 유닛'], ['foe', '적'], ['hero', `나만의 영웅 ${heroes.length}`], ['item', '아이템']]
  const units = palTab === 'ally' ? UNITS : palTab === 'hero' ? heroes.map(h => UNIT[h.id]).filter(Boolean) : palTab === 'foe' ? Object.values(ENEMIES) : []
  const cards = palTab === 'item' ? ITEMS.map(i => palCard('item', i.id, ic(i.id, 32, i.emoji), i.name, 'i:' + i.id))
    : units.map(t => palCard('unit', t.id, sprHTML(t.id, t.emoji, '', palTab === 'foe' ? 1 : 0), t.name, 'n:' + t.id))
  return `<footer class="bottom sand">
    <div class="palette" data-drop="sell">
      <div class="lbl">
        ${tabs.map(([k, n]) => `<button class="ghost ${palTab === k ? 'on' : ''}" data-act="sTab" data-v="${k}">${n}</button>`).join('')}
        <span class="sp"></span>
        <span class="dim">별</span>${[1, 2, 3].map(n => `<button class="ghost ${bStar === n ? 'on' : ''}" data-act="sStar" data-v="${n}">${stars(n)}</button>`).join('')}
        <span class="dim">적 접두사</span>${[['', '없음'], ...AFFIXES.map(a => [a.id, a.name])].map(([id, n]) => `<button class="ghost ${bAff === id ? 'on' : ''}" data-act="sAff" data-v="${id}" ${id ? `style="color:${AFFIX[id].color}"` : ''}>${n}</button>`).join('')}
        <button class="ghost ${brush?.k === 'erase' ? 'on' : ''}" data-act="sErase">지우개</button>
        <button class="ghost" data-act="sClear" data-v="0">아군 비우기</button><button class="ghost" data-act="sClear" data-v="1">적 비우기</button>
      </div>
      <div class="pal-grid">${cards.join('') || (palTab === 'hero' ? '<p class="dim">아직 영웅이 없습니다. <button data-act="heroes">영웅 만들기</button></p>' : '')}</div>
    </div>
  </footer>`
}

function sandClick(c: HTMLElement) {
  const s = run!, side = c.classList.contains('foe') ? 1 : 0, cell = +c.dataset.cell!
  const b = brush
  let err = ''
  if (b?.k === 'erase') R.sandErase(s, side, cell)
  else if (b?.k === 'item') {
    const u = side === 0 ? s.units.find(x => x.pos === cell) : undefined
    if (!u) err = '아이템은 아군 유닛에게만 줄 수 있습니다'
    else if (u.items.length >= 3) err = '아이템은 유닛당 3개까지 (지우개로 비우기)'
    else u.items.push(b.id)
  } else if (b?.k === 'unit') {
    if (side === 1) R.sandEnemy(s, b.id, cell, bStar, bAff)
    else if (UNIT[b.id]) R.sandAlly(s, b.id, cell, bStar)
    else err = '적 유닛은 오른쪽(적 진영)에만 놓을 수 있습니다'
  }
  if (err) toast(err)
  after()
}

// ───────────────────────── 나만의 영웅 (TABS 유닛 제작기처럼 외형·능력치를 정하고 스킬·패시브는 게임 속 것을 조합)
const STATS: [Stat, string, (v: number) => string][] = [
  ['hp', '체력', v => String(v)], ['atk', '공격력', v => String(v)], ['as', '공격 속도', v => v.toFixed(2) + '/초'], ['range', '사거리', v => v + '칸'],
  ['armor', '방어력', v => String(v)], ['crit', '치명타', v => Math.round(v * 100) + '%'], ['mana', '스킬 마나', v => String(v)], ['size', '몸집', v => v.toFixed(2)],
]

function heroesScreen() {
  const h = curHero()
  return `<div class="page heroes">
    <header class="page-head"><button class="ghost" data-act="title">← 뒤로</button><h2>나만의 영웅</h2>
      <div class="pill gold">샌드박스 전용</div><button data-act="sandbox">${ic('train')} 샌드박스로</button></header>
    <div class="hero-wrap">
      <aside class="panel hero-list">
        <button class="primary" data-act="hNew">+ 새 영웅</button>
        ${heroes.map(x => `<div class="hero-item ${x.id === editing ? 'on' : ''}" data-act="hEdit" data-id="${x.id}">${sprHTML(x.id, '⭐', 'tipspr', 0)}<b>${x.name}</b><span class="dim">${powerGrade(UNIT[x.id]).grade}</span></div>`).join('') || '<p class="dim small">아직 없습니다.</p>'}
      </aside>
      ${h ? heroEditor(h) : `<section class="panel hero-empty"><h3>영웅을 만들어 보세요</h3>
        <p>외형 ${Object.keys(SHEET_NAMES).reduce((n, k) => n + cellsOf(k as Sheet).length, 0)}종 중 하나를 고르고, 특성 2개와 능력치 8개를 정한 뒤, 게임 속 스킬 ${SKILL_SRC.length}종과 패시브 ${Object.keys(PASSIVES).length - 1}종을 섞습니다.</p>
        <p class="dim">만든 영웅은 샌드박스에서만 쓸 수 있습니다. 원정 상점·보상에는 나오지 않습니다.</p></section>`}
    </div>
  </div>`
}

function heroEditor(h: HeroDef) {
  const opt = (v: string, label: string, cur: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`
  const sk = (list: UnitTpl[]) => list.map(t => opt(t.id, `${t.skillName} — ${t.name}`, h.skill)).join('')
  return `<section class="panel hero-edit">
    <div id="hero-prev">${heroPrev(h)}</div>
    <div class="hero-form">
      <label class="fld"><span>이름</span><input type="text" data-hf="name" maxlength="12" value="${h.name}"></label>
      <div class="fld"><span>특성 <i class="dim">2개까지</i></span><div>${TRAIT_IDS.map(t => `<span class="chip tbtn ${h.traits.includes(t) ? 'on' : ''}" style="--c:${TRAITS[t].color}" data-act="hTrait" data-id="${t}" data-tip="s:${t}">${ic(t)}${TRAITS[t].name}</span>`).join('')}</div></div>
      ${STATS.map(([k, label, f]) => { const [lo, hi, st] = LIMITS[k]; return `<label class="fld"><span>${label}</span><input type="range" data-hf="${k}" min="${lo}" max="${hi}" step="${st}" value="${h[k]}"><b id="hv-${k}">${f(h[k])}</b></label>` }).join('')}
      <label class="fld full"><span>스킬</span><select data-hf="skill">${opt('', '없음', h.skill)}<optgroup label="아군 유닛">${sk(SKILL_SRC.filter(t => UNIT[t.id]))}</optgroup><optgroup label="적">${sk(SKILL_SRC.filter(t => ENEMIES[t.id]))}</optgroup></select></label>
      <label class="fld full"><span>패시브</span><select data-hf="passive">${Object.entries(PASSIVES).map(([k, p]) => opt(k, p.name + (p.desc ? ' — ' + p.desc : ''), h.passive)).join('')}</select></label>
    </div>
    <div class="row">
      <button class="primary" data-act="hUse">${ic('train')} 샌드박스에서 쓰기</button>
      <button data-act="hDup">복제</button>
      <button class="${delArm === h.id ? 'danger' : ''}" data-act="hDel">${delArm === h.id ? '한 번 더 누르면 삭제' : '삭제'}</button>
    </div>
  </section>
  <section class="panel hero-spr">
    <h3>외형 <span class="dim">DawnLike</span></h3>
    <div class="tabs">${(Object.keys(SHEET_NAMES) as Sheet[]).map(k => `<button class="ghost ${sheet === k ? 'on' : ''}" data-act="hSheet" data-id="${k}">${SHEET_NAMES[k]}</button>`).join('')}</div>
    <div class="spr-grid">${cellsOf(sheet).map(([c, r]) => `<span class="pick ${h.spr[0] === sheet && h.spr[1] === c && h.spr[2] === r ? 'on' : ''}" data-act="hSpr" data-c="${c}" data-r="${r}">${sprAt(sheet, c, r)}</span>`).join('')}</div>
  </section>`
}

function heroPrev(h: HeroDef) {
  const t = UNIT[h.id], g = powerGrade(t), src = SKILL_SRC.find(x => x.id === h.skill), p = PASSIVES[h.passive]
  return `<div class="hp-art">${sprHTML(h.id, '⭐', 'huge', 0)}</div>
    <div class="hp-body"><h3>${h.name}</h3>
      <div>${traitChips(t) || '<span class="dim">특성 없음</span>'}</div>
      <div class="stats">체력 ${fmt(h.hp)} · 공격 ${fmt(h.atk)} · 공속 ${h.as.toFixed(2)} · 사거리 ${h.range} · 방어 ${h.armor} · 치명 ${Math.round(h.crit * 100)}%</div>
      <div class="grade">전투력 <b>${g.grade}</b> <span class="dim">3골드 유닛 평균의 ${g.x < 10 ? g.x.toFixed(1) : Math.round(g.x)}배 (★1, 기본 공격 기준)</span></div>
      <div>${src ? `<b class="skill">${src.skillName}</b> <span class="dim">마나 ${h.mana} · ${src.name}의 스킬</span><br>${skillDesc(src)}` : '<span class="dim">스킬 없음 (기본 공격만)</span>'}</div>
      ${h.passive !== 'none' ? `<div><b class="gold">${p.name}</b> ${p.desc}</div>` : ''}
    </div>`
}

// 입력 중에는 전체를 다시 그리지 않는다 (이름 칸 초점·슬라이더 끌기가 끊기지 않게)
$app.addEventListener('input', e => {
  const el = (e.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement>('[data-hf]')
  const h = curHero()
  if (!el || !h || screen !== 'heroes') return
  const k = el.dataset.hf as keyof HeroDef
  const next = cleanHero({ ...h, [k]: k === 'name' || k === 'skill' || k === 'passive' ? el.value : +el.value })
  if (!next) return
  Object.assign(h, next)
  saveHeroes()
  $app.querySelector('#hero-prev')!.innerHTML = heroPrev(h)
  const st = STATS.find(x => x[0] === k)
  if (st) $app.querySelector('#hv-' + k)!.textContent = st[2](h[st[0]])
  const item = $app.querySelector('.hero-item.on')
  if (item) item.innerHTML = `${sprHTML(h.id, '⭐', 'tipspr', 0)}<b>${h.name}</b><span class="dim">${powerGrade(UNIT[h.id]).grade}</span>`
})

// 다른 컴퓨터에서 터진 오류를 화면에 남겨 제보할 수 있게 한다
addEventListener('error', e => toast(`⚠️ 오류 (v${version}): ${e.message}`, true))
addEventListener('unhandledrejection', e => toast(`⚠️ 오류 (v${version}): ${e.reason}`, true))

render()
