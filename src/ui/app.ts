// 화면: 상태(run/meta)를 HTML 문자열로 그리고, 클릭·드래그를 core 함수 호출로 바꾼다.
import '../style.css'
import { STAR_MULT, W, H, type Battle } from '../core/battle.ts'
import { UNIT, type UnitTpl } from '../core/data/units.ts'
import { ENEMIES } from '../core/data/enemies.ts'
import { TRAITS } from '../core/data/traits.ts'
import { AUG, RESONANCES } from '../core/data/augments.ts'
import { ITEM } from '../core/data/items.ts'
import * as R from '../core/run.ts'
import * as M from '../core/meta.ts'
import { playBattle, fmt, type Player } from './arena.ts'
import { sprHTML, CREDITS } from './sprites.ts'

type Screen = 'title' | 'run' | 'meta' | 'codex'

let meta = M.loadMeta()
let run: R.RunState | null = M.loadRun()
let screen: Screen = 'title'
let battle: Battle | null = null
let player: Player | null = null
let sel: { unit?: number; item?: number } = {}
let drag: { unit?: number; item?: number } | null = null
let showSummary = false
let earned = 0

const $app = document.getElementById('app')!
const $tip = document.getElementById('tip')!
const $toasts = document.getElementById('toasts')!

const RARITY = ['', '실버', '골드', '프리즘']
const stars = (n: number) => '★'.repeat(n)
const traitChips = (t: UnitTpl) => t.traits.map(id => `<span class="chip" style="--c:${TRAITS[id].color}">${TRAITS[id].emoji} ${TRAITS[id].name}</span>`).join('')
const COUNT_NAMES: Record<string, string> = { rebirth: '🔥 불사조 부활', ring: '💍 쌍둥이 반지', rune: '🧨 폭발 룬', undead: '💀 망령 부활', res_bomb: '💣 망자의 폭탄' }
const countName = (k: string) => COUNT_NAMES[k] ?? (AUG[k] ? `${AUG[k].emoji} ${AUG[k].name}` : k)

// ───────────────────────── 렌더
function render() {
  hideTip()
  $app.innerHTML = screen === 'title' ? titleScreen() : screen === 'meta' ? metaScreen() : screen === 'codex' ? codexScreen() : run ? runScreen(run) : ''
}

function titleScreen() {
  const cont = run && !run.over
  return `<div class="title-screen">
    <div class="logo">OVER<b>BUILD</b></div>
    <p class="tag">작은 선택이 쌓여, 사기 조합이 완성되는 순간.</p>
    <div class="menu">
      <button class="primary big" data-act="new">⚔️ 새 원정</button>
      ${cont ? `<button class="big" data-act="resume">▶ 이어하기 · ${run!.round}라운드</button>` : ''}
      <div class="row">
        <button data-act="meta">✦ 영구 성장 <b class="gold">${meta.shards}</b></button>
        <button data-act="codex">📖 공명 도감 ${meta.found.length}/${RESONANCES.length}</button>
      </div>
    </div>
    <div class="howto">
      <div><b>🛒 모집·배치</b>상점에서 사서 끌어다 놓으세요.<br>같은 유닛 3개면 ★ 승급.</div>
      <div><b>💠 증강체</b>규칙을 바꾸는 힘. 두 개가 맞물리면<br><em>공명</em>이 터집니다.</div>
      <div><b>👑 15라운드</b>5·10 정예, 15 최종 보스.<br>생명 ${3 + (meta.unlocked.includes('life') ? 1 : 0)}개, 져도 계속 갑니다.</div>
    </div>
    <p class="dim">최고 ${meta.best}라운드 · 클리어 ${meta.wins}회 · 원정 ${meta.runs}회</p>
    <p class="credits">${CREDITS}</p>
  </div>`
}

function metaScreen() {
  return `<div class="page">
    <header class="page-head"><button class="ghost" data-act="title">← 뒤로</button><h2>영구 성장</h2><div class="pill gold">✦ ${meta.shards} 별조각</div></header>
    <p class="dim">원정이 끝나면 이긴 전투·정예·클리어·새 공명만큼 별조각을 받습니다. 해금은 다음 원정부터 적용됩니다.</p>
    <div class="unlocks">${M.UNLOCKS.map(u => {
      const own = meta.unlocked.includes(u.id)
      return `<div class="unlock ${own ? 'own' : ''}">
        <div class="em">${u.emoji}</div><div class="body"><b>${u.name}</b><span class="dim">${u.desc}</span></div>
        ${own ? '<span class="done">해금됨</span>' : `<button data-act="unlock" data-id="${u.id}" ${meta.shards < u.cost ? 'disabled' : ''}>✦ ${u.cost}</button>`}
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
        <div class="pair">${r.pair.map(p => `<span>${AUG[p].emoji} ${AUG[p].name}</span>`).join('<i>+</i>')}</div>
        <div class="res-name">${f ? `${r.emoji} ${r.name}` : '？？？'}</div>
        <p>${f ? r.desc : '아직 발견하지 못했습니다.'}</p>
      </div>`
    }).join('')}</div>
  </div>`
}

function runScreen(s: R.RunState) {
  const board = R.boardOf(s), bench = R.benchOf(s), slots = R.slotsOf(s)
  const syn = R.synergies(s), res = R.activeRes(s)
  const selU = sel.unit != null ? s.units.find(u => u.id === sel.unit) : undefined
  return `<div class="run ${battle ? 'fighting' : ''}">
    <header class="top">
      <div class="brand">OVER<b>BUILD</b></div>
      <div class="pill">라운드 <b>${s.round}</b>/${R.MAX_ROUND}</div>
      <div class="pill wave ${s.wave.kind}">${s.wave.kind === 'normal' ? '⚔️' : s.wave.kind === 'elite' ? '💀' : '👑'} ${s.wave.label}</div>
      <div class="pill lives" title="생명">${'❤️'.repeat(Math.max(0, s.lives))}${'🖤'.repeat(Math.max(0, s.maxLives - s.lives))}</div>
      <div class="pill gold">🪙 <b>${s.gold}</b></div>
      <div class="pill ${board.length < slots ? 'warn' : ''}">👥 ${board.length}/${slots}</div>
      <div class="sp"></div>
      <button class="ghost" data-act="title" ${battle ? 'disabled' : ''}>메뉴</button>
    </header>
    <div class="mid">
      <aside class="panel">
        <h3>시너지</h3>
        ${syn.length ? syn.map(synRow).join('') : '<p class="dim small">유닛을 배치하면 시너지가 켜집니다. 같은 특성 2명·4명.</p>'}
      </aside>
      <section class="center">
        <div class="hud" id="hud">${battle ? '' : `<span class="dim">다음 적 · ${s.wave.label} · ${s.wave.spawns.length}명</span>`}</div>
        <div class="arena z${zoneOf(s)}" id="arena">${battle ? '<canvas id="cv"></canvas>' : arenaCells(s)}</div>
        <div class="ctrl">
          <div class="speed">${[1, 2, 4].map(v => `<button data-act="speed" data-v="${v}" class="${meta.speed === v ? 'on' : ''}">${v}x</button>`).join('')}</div>
          ${battle ? '<button class="big" data-act="skip">⏭ 결과 바로 보기</button>'
            : `<button class="primary big fight" data-act="fight" ${board.length ? '' : 'disabled'}>⚔️ 전투 시작 <kbd>Space</kbd></button>`}
          <div class="hint dim small">${battle ? '' : board.length < slots ? `빈 칸 ${slots - board.length}개 — 대기석 유닛을 끌어다 놓으세요` : '오른쪽은 이번 적입니다 (마우스를 올려 보기)'}</div>
        </div>
      </section>
      <aside class="panel">
        <h3>증강체 <span class="dim">${s.augments.length}</span></h3>
        ${s.augments.length ? s.augments.map(id => `<div class="aug-row r${AUG[id].rarity}" data-tip="a:${id}"><span>${AUG[id].emoji}</span>${AUG[id].name}</div>`).join('')
          : '<p class="dim small">1라운드가 끝나면 첫 증강체를 고릅니다.</p>'}
        ${res.length ? `<h3>공명</h3>${res.map(r => `<div class="aug-row res" data-tip="r:${r.id}"><span>${r.emoji}</span>${r.name}</div>`).join('')}` : ''}
        <h3>아이템 <span class="dim small">유닛에 끌어 놓기</span></h3>
        <div class="items">${s.items.length ? s.items.map((it, i) => `<span class="item ${sel.item === i ? 'sel' : ''}" data-item="${i}" data-act="item" data-i="${i}" data-tip="i:${it}">${ITEM[it].emoji}</span>`).join('') : '<span class="dim small">없음</span>'}</div>
      </aside>
    </div>
    <footer class="bottom">
      <div class="bench" data-drop="bench">
        <div class="lbl">대기석 <span class="dim">${bench.length}/${R.BENCH}</span></div>
        <div class="slots">${Array.from({ length: R.BENCH }, (_, i) => `<div class="bslot">${bench[i] ? token(bench[i]) : ''}</div>`).join('')}</div>
      </div>
      <div class="shop" data-drop="sell">
        <div class="lbl">상점 ${selU ? `<button class="sell" data-act="sell">💰 ${UNIT[selU.tpl].name} 판매 +${R.sellValue(selU)}</button>` : '<span class="dim small">유닛을 여기로 끌어오면 판매</span>'}</div>
        <div class="cards">${s.shop.map((id, i) => shopCard(s, id, i)).join('')}
          <button class="reroll" data-act="reroll" ${s.gold < 1 && !s.freeRerolls ? 'disabled' : ''}>🔄<span>${s.freeRerolls ? '무료' : '1🪙'}</span><kbd>D</kbd></button>
        </div>
      </div>
    </footer>
    ${modal(s)}
  </div>`
}

// 전장 구역: 0 숲 · 1 폐허 · 2 심연 · 3 보스
const zoneOf = (s: R.RunState) => (s.wave.kind === 'boss' ? 3 : s.round <= 5 ? 0 : s.round <= 10 ? 1 : 2)

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
    const t = ENEMIES[sp.tpl]
    h += `<div class="cell foe" style="${pos(x, y)}"><div class="tok enemy ${t.boss ? 'boss' : t.size ? 'elite' : ''}" data-tip="e:${i}"><i class="base"></i>${sprHTML(t.id, t.emoji, '', 1)}</div></div>`
  })
  return h
}

function token(u: R.OwnedUnit) {
  const t = UNIT[u.tpl]
  return `<div class="tok c${t.cost} s${u.star} ${sel.unit === u.id ? 'sel' : ''}" data-unit="${u.id}" data-tpl="${u.tpl}" data-tip="u:${u.id}">
    <i class="base"></i>${sprHTML(t.id, t.emoji, '', 0)}<span class="st">${stars(u.star)}</span>
    ${u.items.length ? `<span class="its">${u.items.map(i => ITEM[i].emoji).join('')}</span>` : ''}</div>`
}

function shopCard(s: R.RunState, id: string | null, i: number) {
  if (!id) return '<div class="card empty"></div>'
  const t = UNIT[id]
  const own = s.units.filter(u => u.tpl === id && u.star === 1).length
  return `<div class="card c${t.cost} ${s.gold < t.cost ? 'poor' : ''} ${own >= 2 ? 'merge' : ''}" data-act="buy" data-i="${i}" data-tip="t:${id}">
    <div class="cardspr">${sprHTML(t.id, t.emoji, '', 0)}</div><div class="nm">${t.name}</div>
    <div class="tr">${t.traits.map(x => `<span style="color:${TRAITS[x].color}">${TRAITS[x].emoji}${TRAITS[x].name}</span>`).join(' ')}</div>
    <div class="cost">🪙${t.cost}</div>${own ? `<div class="own">${own >= 2 ? '★2 승급!' : `${own}/3`}</div>` : ''}
  </div>`
}

function synRow(sy: R.Syn) {
  const d = TRAITS[sy.id]
  return `<div class="syn t${sy.tier}" style="--c:${d.color}" data-tip="s:${sy.id}">
    <span class="ico">${d.emoji}</span><span class="nm">${d.name}</span>
    <span class="steps">${d.tiers.map(n => `<i class="${sy.count >= n ? 'on' : ''}">${n}</i>`).join('')}</span><b>${sy.crest ? '👑' : ''}${sy.count}</b>
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
    <p class="dim">${sm.label} · ${sm.time.toFixed(1)}초${sm.win ? '' : ' · 생명 -1 · 다음 증강체 등급 ↑, 골드 +2'}${sm.growth ? ` · 🌱 성장 +${Math.round(sm.growth * 100)}%` : ''}</p>
    <div class="meter">${sm.dmg.slice(0, 8).map((d, i) => `<div class="mrow ${i === 0 && sm.win ? 'mvp' : ''}" style="--i:${i}"><span class="who">${i === 0 && sm.win ? '👑 ' : ''}${sprHTML(d.id, d.emoji, 'mini', 0)} ${d.name}${d.star ? ` <i>${stars(d.star)}</i>` : ''}${d.n > 1 ? ` ×${d.n}` : ''}</span>
      <div class="bar"><i style="width:${(d.v / top) * 100}%"></i></div><b>${fmt(d.v)}</b></div>`).join('')}</div>
    ${counts.length ? `<div class="counts">${counts.map(([k, v], i) => `<span class="chip" style="--i:${i}">${countName(k)} ×${v}</span>`).join('')}</div>` : ''}
    <p class="dim">최대 일격 <b class="gold">${fmt(sm.maxHit)}</b></p>
    <button class="primary big" data-act="continue">계속 <kbd>Space</kbd></button>
  </div></div>`
}

function augModal(s: R.RunState) {
  const pity = s.pity > 0
  return `<div class="modal"><div class="box pick">
    <h2>증강체 선택</h2>
    <p class="dim">${pity ? '🔥 역전의 기회 — 실버 등급이 거의 나오지 않습니다' : '하나를 고르세요. 빛나는 카드는 지금 가진 증강체와 공명합니다.'}</p>
    <div class="aug-cards">${s.augChoices.map(id => augCard(s, id)).join('')}</div>
    <button data-act="rerollAug" ${s.augRerolls ? '' : 'disabled'}>🎲 새로고침 (${s.augRerolls}회 남음)</button>
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
    <div class="em">${a.emoji}</div>
    <h3>${a.name}</h3>
    <p>${a.desc}</p>
    ${a.fit ? `<div class="fit">${a.fit.map(t => `<span class="chip" style="--c:${TRAITS[t].color}">${TRAITS[t].emoji} ${TRAITS[t].name}</span>`).join('')}</div>` : ''}
    ${now.map(r => `<div class="res-hit">✨ 공명 발동! ${r.emoji} ${r.name}<small>${r.desc}</small></div>`).join('')}
    ${later.map(r => {
      const o = AUG[r.pair.find(p => p !== id)!]
      const known = meta.found.includes(r.id)
      return `<div class="res-hint">공명 짝: ${o.emoji} ${o.name} → ${known ? `${r.emoji} ${r.name}` : '？？？'}</div>`
    }).join('')}
  </div>`
}

function rewardModal(s: R.RunState) {
  const rare = s.last && s.last.kind !== 'normal'
  return `<div class="modal"><div class="box pick">
    <h2>${rare ? '👑 정예 전리품' : '전리품'}</h2>
    <p class="dim">하나를 가져가세요.</p>
    <div class="aug-cards">${s.rewardChoices.map((r, i) => `<div class="aug-card rw" data-act="pickReward" data-i="${i}">${rewardBody(r)}</div>`).join('')}</div>
  </div></div>`
}

function rewardBody(r: R.Reward) {
  switch (r.kind) {
    case 'unit': {
      const t = UNIT[r.tpl]
      return `<div class="rar">영입</div><div class="em">${sprHTML(t.id, t.emoji, 'big', 0)}</div><h3>${t.name} ${stars(r.star)}</h3><div class="fit">${traitChips(t)}</div><p>${t.skillName} — ${t.skillDesc}</p>`
    }
    case 'gold': return `<div class="rar">보물</div><div class="em">💰</div><h3>+${r.n} 골드</h3><p>상점을 더 돌리거나 비싼 유닛을 사세요.</p>`
    case 'item': return `<div class="rar">장비</div><div class="em">${r.ids.map(i => ITEM[i].emoji).join('')}</div><h3>${r.ids.map(i => ITEM[i].name).join(' + ')}</h3><p>${r.ids.map(i => ITEM[i].desc).join('<br>')}</p>`
    case 'train': return `<div class="rar">단련</div><div class="em">🏋️</div><h3>전원 +${Math.round(r.n * 100)}%</h3><p>지금 배치된 모든 유닛의 공격력·체력이 영구히 올라갑니다.</p>`
    case 'slot': return `<div class="rar">지휘력</div><div class="em">➕</div><h3>배치 칸 +1</h3><p>이번 원정 내내 한 명 더 내보낼 수 있습니다.</p>`
  }
}

function endModal(s: R.RunState) {
  const win = s.over === 'win'
  const next = M.UNLOCKS.filter(u => !meta.unlocked.includes(u.id) && meta.shards >= u.cost)
  return `<div class="modal"><div class="box end ${win ? 'win' : 'lose'}">
    <h1>${win ? '🏆 원정 성공!' : '💀 원정 실패'}</h1>
    <p>${win ? '심연의 군주가 쓰러졌습니다.' : `${s.round}라운드에서 쓰러졌습니다.`}</p>
    <div class="endstats"><span>승리 <b>${s.stats.won}</b></span><span>정예 <b>${s.stats.elite}</b></span><span>최대 일격 <b>${fmt(s.stats.bestHit)}</b></span></div>
    <div class="aug-line">${s.augments.map(id => `<span data-tip="a:${id}">${AUG[id].emoji}</span>`).join('')}${R.activeRes(s).map(r => `<span class="res" data-tip="r:${r.id}">${r.emoji}</span>`).join('')}</div>
    <div class="shards">✦ +${earned} 별조각 <span class="dim">(보유 ${meta.shards})</span></div>
    ${next.length ? `<p class="gold">지금 해금할 수 있는 것 ${next.length}개 · ${next.slice(0, 3).map(u => u.emoji + ' ' + u.name).join(', ')}${next.length > 3 ? ' …' : ''}</p>` : ''}
    <div class="row"><button class="primary big" data-act="new">한 판 더!</button><button data-act="meta">✦ 영구 성장</button><button data-act="title">타이틀</button></div>
  </div></div>`
}

// ───────────────────────── 툴팁
function unitTip(t: UnitTpl, star: number, extra = '') {
  const m = STAR_MULT[star - 1]
  return `<div class="tip-h">${sprHTML(t.id, t.emoji, 'tipspr', 0)} <b>${t.name}</b> <span class="gold">${stars(star)}</span> <span class="dim">${t.cost}골드</span></div>
    <div>${traitChips(t)}</div>
    <div class="stats">❤️ ${fmt(t.hp * m)} · ⚔️ ${fmt(t.atk * m)} · 🌀 ${t.as}/초 · 🎯 ${t.range}칸</div>
    <div><b class="skill">${t.skillName}</b> <span class="dim">마나 ${t.mana}</span><br>${t.skillDesc}</div>${extra}`
}

function tipHTML(key: string): string {
  const k = key[0], v = key.slice(2)
  if (k === 'u' && run) {
    const u = run.units.find(o => o.id === +v)
    if (!u) return ''
    const its = u.items.map(i => `<div>${ITEM[i].emoji} ${ITEM[i].name} <span class="dim">${ITEM[i].desc}</span></div>`).join('')
    return unitTip(UNIT[u.tpl], u.star, `${u.bonus ? `<div class="good">🌱 성장 +${Math.round(u.bonus * 100)}%</div>` : ''}${its}<div class="dim small">판매 ${R.sellValue(u)}골드 · 클릭해서 선택</div>`)
  }
  if (k === 't') return unitTip(UNIT[v], 1, '<div class="dim small">클릭해서 구매</div>')
  if (k === 'e' && run) {
    const sp = run.wave.spawns[+v]
    if (!sp) return ''
    const t = ENEMIES[sp.tpl]
    return `<div class="tip-h">${sprHTML(t.id, t.emoji, 'tipspr', 1)} <b>${t.name}</b></div><div class="stats">❤️ ${fmt(t.hp * sp.mult)} · ⚔️ ${fmt(t.atk * sp.mult)} · 🎯 ${t.range}칸</div>${t.skillName ? `<div><b class="skill">${t.skillName}</b><br>${t.skillDesc}</div>` : ''}`
  }
  if (k === 'a') {
    const a = AUG[v]
    const rel = RESONANCES.filter(r => r.pair.includes(v))
    return `<div class="tip-h">${a.emoji} <b>${a.name}</b> <span class="rar r${a.rarity}">${RARITY[a.rarity]}</span></div><div>${a.desc}</div>
      ${rel.map(r => { const o = AUG[r.pair.find(p => p !== v)!]; return `<div class="dim small">공명 짝: ${o.emoji} ${o.name}</div>` }).join('')}`
  }
  if (k === 'r') { const r = RESONANCES.find(x => x.id === v)!; return `<div class="tip-h">${r.emoji} <b>${r.name}</b> <span class="gold">공명</span></div><div>${r.desc}</div><div class="dim small">${r.pair.map(p => AUG[p].emoji + ' ' + AUG[p].name).join(' + ')}</div>` }
  if (k === 's') {
    const d = TRAITS[v as keyof typeof TRAITS]
    const sy = run ? R.synergies(run).find(x => x.id === v) : undefined
    const who = Object.values(UNIT).filter(t => t.traits.includes(d.id) && (!t.locked || run?.unlocked.includes('u_' + t.id)))
    return `<div class="tip-h">${d.emoji} <b>${d.name}</b>${sy?.crest ? ' <span class="gold">👑 문장: 효과 2배</span>' : ''}</div>
      ${d.tiers.map((n, i) => `<div class="${sy && sy.tier > i ? 'good' : 'dim'}">(${n}) ${d.desc[i]}</div>`).join('')}
      <div class="small who-list">${who.map(t => sprHTML(t.id, t.emoji, 'mini', 0) + t.name).join(' ')}</div>`
  }
  if (k === 'i') { const it = ITEM[v]; return `<div class="tip-h">${it.emoji} <b>${it.name}</b></div><div>${it.desc}</div>` }
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
  M.saveRun(run)
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
  R.endBattle(run, battle)
  battle = null
  player = null
  showSummary = true
  if (run.over) earned = M.settle(meta, run)
  else M.saveRun(run)
  render()
}

function after() {
  const before = snapshot()
  if (run) {
    for (const n of run.notes.splice(0)) toast(n)
    if (!run.over && !battle) M.saveRun(run)
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
    case 'new': startNew(); break
    case 'resume': screen = 'run'; break
    case 'title': if (battle) return; screen = 'title'; break
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
  el.innerHTML = `<div class="band"><span class="ia">${AUG[r.pair[0]].emoji}</span><span class="ib">${AUG[r.pair[1]].emoji}</span>
    <span class="ir">${r.emoji}</span><div class="rt"><small>${isNew ? '✨ 새 공명 발견' : '✨ 공명 발동'}</small><b>${r.name}</b><p>${r.desc}</p></div></div>`
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
  } else if (e.code === 'KeyD' && !modal(run)) act('reroll')
  else if (e.code === 'Escape') { sel = {}; render() }
})

render()
