// 전투 재생: Battle을 고정 스텝으로 돌리며 캔버스에 그린다. 게임 규칙은 모르고 Fx 이벤트만 해석한다.
// 연출 층: 배경(구역별) → 잔해 → 유닛(동작·오라) → 파티클 → 궤적 → 숫자·글자 → 배너·컷인 → 화면 효과
import { W, H, STEP, type Battle, type Fx, type FxStyle, type Fighter } from '../core/battle.ts'
import { drawSprite, flipFor } from './sprites.ts'

export interface Player { skip(): void; stop(): void }
export interface ResInfo { id: string; name: string; emoji: string; ids: string[]; a: string; b: string }
export interface PlayOpts { zone: number; res: ResInfo[] }

const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
const TAU = Math.PI * 2
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const STREAK = ['트리플 킬!', '쿼드라 킬!', '몰살!']
const easeOutBack = (p: number) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2

export const fmt = (v: number) =>
  v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(Math.round(v))

// 구역: 0 숲 · 1 폐허 · 2 심연 · 3 보스
const ZONES = [
  { top: '#18301f', bot: '#0a140d', pool: '#4f8a4a', speck: '#2b4a2c', crack: '', amb: 'firefly' },
  { top: '#1c2230', bot: '#0b0e15', pool: '#6a7690', speck: '#2a3140', crack: '#3a4458', amb: 'ash' },
  { top: '#1f1230', bot: '#0a0610', pool: '#7a3fb8', speck: '#2c1a40', crack: '#b04dff', amb: 'ember' },
  { top: '#2e0f18', bot: '#0b0406', pool: '#b8324c', speck: '#3a1018', crack: '#ff4d3c', amb: 'ember' },
] as const

// 색 이름은 Fx의 color를 그대로 쓰되, 스타일마다 파티클 모양이 다르다
const STYLE_COLORS: Partial<Record<FxStyle, string[]>> = {
  fire: ['#ffd166', '#ff9d3c', '#ff5d3c'], ice: ['#ffffff', '#bdf3ff', '#7fd8ff'], earth: ['#c9a36b', '#8d6e4c', '#5d4630'],
  blade: ['#ff9bd0', '#ff6fae'], roar: ['#ffe0a3', '#ffb74d'], holy: ['#d6ffe0', '#7dffa0'], spirit: ['#d6fff6', '#7fffd4'],
  poison: ['#d4ff7a', '#8bd84a'], dark: ['#ff8aa0', '#b8324c', '#7a2fb8'], shock: ['#ffffff', '#fff59d'], shield: ['#e3efff', '#7fb4ff'],
}

interface Part { x: number; y: number; vx: number; vy: number; t: number; life: number; size: number; color: string; kind: 'dot' | 'spark' | 'shard' | 'square' | 'smoke' | 'wisp'; g: number; add: boolean; rot: number; vr: number }
interface Trace { fx: Fx | { k: 'slash' | 'pillar' | 'ghost'; x: number; y: number; color: string; emoji?: string; id?: string; flip?: boolean; r?: number }; t: number; life: number; j: number }
interface Num { uid: number; x: number; y: number; v: number; crit: boolean; color: string; t: number; life: number; j: number; heal: boolean }
interface Anim { lx: number; ly: number; lt: number; kx: number; ky: number; kt: number; hitT: number; castT: number; spawnT: number; hpLag: number }
interface Corpse { x: number; y: number; id: string; emoji: string; size: number; side: number; summoned: boolean; t: number; spin: number }
interface Banner { text: string; color: string; t: number; life: number; big: boolean }
interface CutIn { res: ResInfo; t: number }
interface Amb { x: number; y: number; vx: number; vy: number; ph: number }

export function playBattle(cv: HTMLCanvasElement, b: Battle, speed: () => number, onEnd: () => void, onFrame?: () => void, opts: PlayOpts = { zone: 0, res: [] }): Player {
  const ctx = cv.getContext('2d')!
  const zone = ZONES[Math.max(0, Math.min(3, opts.zone))]
  b.keepFx = true

  let parts: Part[] = []
  let traces: Trace[] = []
  let nums: Num[] = []
  let corpses: Corpse[] = []
  let banners: Banner[] = []
  let cutins: CutIn[] = []
  const anims = new Map<number, Anim>()
  const combo = new Map<number, Num>()
  const resShown = new Set<string>()
  const enemyDeaths: number[] = []
  let streakShown = 0
  let lastEnemyDeath = { x: W * 0.75, y: H / 2 }

  let shake = 0, acc = 0, endT = 0, raf = 0, stopped = false, clock = 0
  let freeze = 0 // 히트스톱(실제 초)
  let slow = 1, slowT = 0 // 슬로모션 배율과 남은 실제 시간
  let flashA = 0, flashC = '#ffffff'
  const cam = { z: 1, x: W / 2, y: H / 2, tz: 1, tx: W / 2, ty: H / 2, hold: 0 }
  let ended = false
  const rare = b.fighters.filter(f => f.side === 1 && !f.boss)
  const platino = rare.length && Math.random() < 0.004 ? rare[Math.floor(Math.random() * rare.length)].uid : -1
  let last = performance.now()

  const amb: Amb[] = Array.from({ length: 34 }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.1, 0.1), vy: rnd(-0.1, 0.1), ph: rnd(0, TAU) }))
  let bg: HTMLCanvasElement | null = null
  let bgKey = ''

  const anim = (uid: number) => {
    let a = anims.get(uid)
    if (!a) { a = { lx: 0, ly: 0, lt: 0, kx: 0, ky: 0, kt: 0, hitT: 9, castT: 9, spawnT: 9, hpLag: 1 }; anims.set(uid, a) }
    return a
  }
  const byUid = (uid: number) => b.fighters.find(f => f.uid === uid)

  const burst = (x: number, y: number, n: number, colors: string[], o: Partial<Part> & { speed?: number } = {}) => {
    const sp = o.speed ?? 2.2
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(0.3, 1) * sp
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.35, 0.7), size: rnd(0.03, 0.07), color: colors[i % colors.length], kind: 'spark', g: 0, add: true, rot: rnd(0, TAU), vr: rnd(-8, 8), ...o })
    }
  }
  const slowmo = (k: number, dur: number) => { if (k < slow || slowT <= 0) { slow = k; slowT = dur } }
  const zoomTo = (x: number, y: number, z: number, hold: number) => { cam.tx = x; cam.ty = y; cam.tz = z; cam.hold = hold }
  const flash = (a: number, c = '#ffffff') => { if (a > flashA) { flashA = a; flashC = c } }
  const banner = (text: string, color: string, big = false) => {
    banners.push({ text, color, t: 0, life: big ? 1.8 : 1.4, big })
    if (banners.length > 3) banners.shift()
  }

  // ── 이벤트 해석
  const ingest = () => {
    for (const e of b.fx) {
      switch (e.k) {
        case 'shake': shake = Math.min(16, shake + e.v); break
        case 'atk': {
          const f = byUid(e.uid)
          if (!f) break
          const a = anim(e.uid), d = Math.hypot(e.tx - f.x, e.ty - f.y) || 1
          a.lx = ((e.tx - f.x) / d) * (e.ranged ? -0.35 : 1)
          a.ly = ((e.ty - f.y) / d) * (e.ranged ? -0.35 : 1)
          a.lt = e.ranged ? 0.12 : 0.2
          break
        }
        case 'hit': {
          const a = anim(e.uid)
          if (a.hitT > 0.25 || e.crit) a.hitT = 0 // 섬광·찌그러짐은 0.25초에 한 번 (연타에도 몸이 보이게)
          if (e.sx !== undefined && e.sy !== undefined) {
            const d = Math.hypot(e.x - e.sx, e.y - e.sy) || 1
            a.kx = (e.x - e.sx) / d; a.ky = (e.y - e.sy) / d; a.kt = Math.min(0.2, 0.08 + e.pct)
          }
          const tgt = byUid(e.uid)
          if (tgt?.summoned && e.side === 0) { burst(e.x, e.y, 1, ['#ffb0b0'], { speed: 1.2, life: 0.2 }); break }
          const sparkCol = e.side === 0 ? ['#ffb0b0', '#ff6b6b'] : e.crit ? ['#fff3b0', '#ffd23f', '#ff9d3c'] : e.kind === 'proc' ? ['#c9fbff', '#7fe8ff'] : ['#ffffff', '#ffe9a8']
          burst(e.x, e.y, e.crit ? 9 : 3, sparkCol, { speed: e.crit ? 3.2 : 1.8, life: 0.3 })
          if (e.crit && e.side === 1 && e.pct > 0.3) { freeze = Math.max(freeze, 0.06); shake = Math.min(16, shake + 3) }
          const color = e.side === 0 ? '#ff9a9a' : e.crit ? '#ffd23f' : e.kind === 'skill' ? '#d8b4ff' : e.kind === 'proc' ? '#8ff0ff' : '#ffffff'
          const c = combo.get(e.uid)
          if (c && c.t < 0.25 && !c.heal) {
            c.v += e.v; c.crit ||= e.crit; c.x = e.x; c.y = e.y; c.t = Math.min(c.t, 0.1)
            if (c.crit) c.color = '#ffd23f'
            break
          }
          const n: Num = { uid: e.uid, x: e.x, y: e.y, v: e.v, crit: e.crit, color, t: 0, life: 0.85, j: rnd(-0.25, 0.25), heal: false }
          combo.set(e.uid, n)
          nums.push(n)
          break
        }
        case 'heal': {
          if (byUid(e.uid)?.summoned) break
          const n = nums.find(o => o.uid === e.uid && o.heal && o.t < 0.4)
          if (n) { n.v += e.v; n.t = Math.min(n.t, 0.15); break }
          nums.push({ uid: e.uid, x: e.x, y: e.y, v: e.v, crit: false, color: '#7dffa0', t: 0, life: 0.8, j: rnd(-0.2, 0.2), heal: true })
          for (let i = 0; i < 4; i++) parts.push({ x: e.x + rnd(-0.25, 0.25), y: e.y + rnd(-0.1, 0.2), vx: 0, vy: -rnd(0.4, 0.9), t: 0, life: 0.6, size: 0.05, color: '#7dffa0', kind: 'dot', g: 0, add: true, rot: 0, vr: 0 })
          break
        }
        case 'cast': {
          const a = anim(e.uid)
          a.castT = 0
          break
        }
        case 'spawn': {
          anim(e.uid).spawnT = 0
          const f = byUid(e.uid)
          if (f) burst(f.x, f.y + f.size * 0.3, 10, f.tpl.id === 'spirit' ? ['#d6fff6', '#7fffd4'] : ['#cfc7ff', '#8f7dff', '#5b4a8a'], { speed: 1.4, vy: -0.6, kind: 'wisp' })
          break
        }
        case 'tele': {
          const f = byUid(e.uid)
          burst(e.x1, e.y1, 12, ['#4a3b66', '#7a5fa8', '#2a2140'], { kind: 'smoke', add: false, speed: 1, size: 0.12, life: 0.6 })
          if (f) {
            burst(f.x, f.y, 12, ['#4a3b66', '#7a5fa8', '#2a2140'], { kind: 'smoke', add: false, speed: 1, size: 0.12, life: 0.6 })
            traces.push({ fx: { k: 'line', x1: e.x1, y1: e.y1, x2: f.x, y2: f.y, color: '#b48cff' }, t: 0, life: 0.18, j: Math.random() })
          }
          break
        }
        case 'death': {
          corpses.push({ x: e.x, y: e.y, id: e.tpl, emoji: e.emoji, size: e.size, side: e.side, summoned: e.summoned, t: 0, spin: rnd(-1, 1) })
          const col = e.side === 1 ? ['#ffb3bb', '#ff5d6c', '#7a2333'] : ['#c9f3ff', '#4fd1ff', '#1d4a66']
          burst(e.x, e.y, e.boss ? 60 : 14, col, { speed: e.boss ? 5 : 2.6, kind: 'shard', add: false, g: 3, life: 0.7 })
          if (e.summoned && e.side === 0) burst(e.x, e.y, 6, ['#d6fff6', '#7fffd4'], { kind: 'wisp', vy: -0.8, speed: 0.6 })
          if (e.side === 1) {
            lastEnemyDeath = { x: e.x, y: e.y }
            enemyDeaths.push(b.t)
            while (enemyDeaths.length && b.t - enemyDeaths[0] > 0.6) enemyDeaths.shift()
            const n = enemyDeaths.length
            const lv = Math.min(5, n)
            if (lv >= 3 && lv > streakShown) {
              streakShown = lv
              banners = banners.filter(v => !STREAK.includes(v.text))
              banner(STREAK[lv - 3], lv >= 5 ? '#ff7a45' : '#ffd166', lv >= 5)
            }
            if (n < 2) streakShown = 0
          }
          if (e.boss) {
            freeze = 0.14; slowmo(0.2, 1.6); zoomTo(e.x, e.y, 1.35, 1.6); flash(0.5); shake = 16
            banners = []
            banner('심연의 군주 처치!', '#ffd166', true)
            for (let i = 0; i < 4; i++) traces.push({ fx: { k: 'ring', x: e.x, y: e.y, r: 2 + i * 1.5, color: i % 2 ? '#ffd166' : '#ff4d6d', style: 'dark' }, t: -i * 0.08, life: 0.7, j: 0 })
          }
          break
        }
        case 'ring': {
          traces.push({ fx: e, t: 0, life: e.style === 'roar' || e.style === 'dark' ? 0.6 : 0.45, j: Math.random() })
          ringParticles(e.x, e.y, e.r, e.style)
          if (e.style === 'roar') for (let i = 1; i < 3; i++) traces.push({ fx: e, t: -i * 0.1, life: 0.5, j: 0 })
          break
        }
        case 'shot':
          traces.push({ fx: e, t: 0, life: e.style === 'snipe' ? 0.22 : e.style === 'fire' ? 0.22 : 0.15, j: Math.random() })
          if (e.style === 'snipe') { burst(e.x2, e.y2, 10, ['#ffffff', '#fff176'], { speed: 3 }); shake = Math.min(16, shake + 2) }
          break
        case 'line':
          traces.push({ fx: e, t: 0, life: 0.28, j: Math.random() })
          burst(e.x2, e.y2, 4, [e.color, '#ffffff'], { speed: 2.4, life: 0.25 })
          break
        case 'text':
          traces.push({ fx: e, t: 0, life: 1.0, j: 0 })
          break
        case 'banner':
          banner(e.text, e.color, true)
          if (e.color === '#ff4d6d') { flash(0.2, '#ff4d6d'); shake = Math.min(16, shake + 6) }
          break
        case 'aug':
          augFx(e.id, e.x, e.y, e.uid)
          break
      }
    }
    b.fx.length = 0
    if (parts.length > 900) parts.splice(0, parts.length - 900)
    if (traces.length > 400) traces.splice(0, traces.length - 400)
    if (nums.length > 160) nums.splice(0, nums.length - 160)
  }

  const ringParticles = (x: number, y: number, r: number, style?: FxStyle) => {
    if (!style || r > 4) return
    const cols = STYLE_COLORS[style] ?? ['#ffffff']
    const n = Math.round(8 + r * 8)
    switch (style) {
      case 'fire': burst(x, y, n, cols, { kind: 'dot', speed: 2.4 * r, vy: -0.6, size: 0.07, life: 0.55 }); flash(0.025, '#ff9d3c'); break
      case 'ice': burst(x, y, n, cols, { kind: 'shard', add: true, speed: 2.6 * r, life: 0.5 }); break
      case 'earth':
        burst(x, y, n, cols, { kind: 'square', add: false, speed: 2.2 * r, g: 6, vy: -2, size: 0.06, life: 0.7 })
        burst(x, y + 0.2, 8, ['#5d4630', '#3d2f22'], { kind: 'smoke', add: false, speed: 0.8, size: 0.16, life: 0.8 })
        break
      case 'blade': burst(x, y, 6, cols, { kind: 'shard', speed: 2.6 * r, life: 0.3 }); break
      case 'holy': case 'spirit': burst(x, y, n, cols, { kind: 'wisp', speed: 0.6, vy: -0.9, life: 0.8 }); break
      case 'poison': burst(x, y, n, cols, { kind: 'dot', speed: 1.4 * r, vy: -0.4, life: 0.8 }); break
      case 'shock': burst(x, y, n, cols, { speed: 3.4 * r, life: 0.35 }); flash(0.06); break
      case 'shield': burst(x, y, 10, cols, { kind: 'wisp', speed: 0.8, vy: -0.5 }); break
    }
  }

  // 증강체 고유 연출: 무엇이 터졌는지 화면에서 읽히게
  const augFx = (id: string, x: number, y: number, uid: number) => {
    const f = byUid(uid)
    switch (id) {
      case 'chain': burst(x, y, 6, ['#fff7c2', '#ffe066', '#ffb703'], { speed: 3 }); break
      case 'echo': case 'ring': if (f) traces.push({ fx: { k: 'ghost', x, y, color: id === 'echo' ? '#c9a8ff' : '#ffd166', emoji: f.emoji, id: sprId(f), flip: flipFor(sprId(f), f.side), r: f.size }, t: 0, life: 0.5, j: 0 }); break
      case 'soulpact': burst(x, y, 10, ['#e8fffb', '#7fffd4', '#3fd1b0'], { kind: 'wisp', vy: -1.2, speed: 0.6, life: 0.9 }); break
      case 'laststand':
        traces.push({ fx: { k: 'ring', x, y, r: 1.4, color: '#ffd54a', style: 'shock' }, t: 0, life: 0.5, j: 0 })
        burst(x, y, 16, ['#fff3b0', '#ffd54a'], { speed: 2.4 }); shake = Math.min(16, shake + 3)
        break
      case 'manasurge': burst(x, y, 8, ['#bfe1ff', '#5aa9ff'], { kind: 'wisp', vy: -0.8, speed: 0.6 }); break
      case 'executioner':
        traces.push({ fx: { k: 'slash', x, y, color: '#ff4d4d' }, t: 0, life: 0.35, j: Math.random() })
        burst(x, y, 14, ['#ffd0d0', '#ff4d4d', '#8a0f1a'], { kind: 'shard', speed: 3.4 }); freeze = Math.max(freeze, 0.05); shake = Math.min(16, shake + 5)
        break
      case 'martyr': burst(x, y, 10, ['#fff5d6', '#ffd166'], { kind: 'wisp', vy: -1, speed: 0.5, life: 1 }); break
      case 'smite': traces.push({ fx: { k: 'pillar', x, y, color: '#fff59d' }, t: 0, life: 0.35, j: Math.random() }); shake = Math.min(16, shake + 4); break
      case 'splitsoul': case 'undead': burst(x, y, 14, id === 'undead' ? ['#c9fff2', '#62e0c8'] : ['#e3d1ff', '#9a6bff'], { kind: 'wisp', vy: -1, speed: 0.9, life: 0.9 }); break
      case 'rebirth': burst(x, y, 40, ['#fff3b0', '#ffb74d', '#ff5d3c'], { kind: 'dot', speed: 4, vy: -1 }); flash(0.25, '#ff9d3c'); slowmo(0.4, 0.5); break
      case 'corpse': shake = Math.min(16, shake + 2); break
      case 'res_bomb': flash(0.08, '#7fffd4'); break
    }
    const r = opts.res.find(o => !resShown.has(o.id) && o.ids.includes(id))
    if (r) { resShown.add(r.id); cutins.push({ res: r, t: 0 }); slowmo(0.35, 0.7); flash(0.14, '#fff3b0') }
  }

  // ── 시간
  const frame = (now: number) => {
    if (stopped) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (slowT > 0) { slowT -= dt; if (slowT <= 0) slow = 1 }
    let simDt = dt * speed() * slow
    if (freeze > 0) { freeze -= dt; simDt = 0 }
    acc += simDt
    for (let n = 0; acc >= STEP && !b.done && n < 800; n++) { b.step(STEP); acc -= STEP; ingest() }
    if (acc > 1) acc = 0
    if (b.done && !ended) {
      ended = true
      if (b.win) { banner('승리!', '#7dffa0', true); slowmo(0.3, 0.9); zoomTo(lastEnemyDeath.x, lastEnemyDeath.y, 1.18, 1.2) }
      else banner('패배…', '#ff6b6b', true)
    }
    const vdt = dt * Math.min(2, speed()) * (freeze > 0 ? 0.15 : slow)
    clock += vdt
    draw(dt, vdt)
    onFrame?.()
    if (b.done && (endT += dt) > (b.win ? 1.7 : 1.3)) { stopped = true; onEnd(); return }
    raf = requestAnimationFrame(frame)
  }

  // ── 그리기
  const draw = (dt: number, vdt: number) => {
    const dpr = devicePixelRatio || 1
    const cw = cv.clientWidth, ch = cv.clientHeight
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr)
      cv.height = Math.round(ch * dpr)
    }
    const s = cw / W
    // 카메라
    if (cam.hold > 0) cam.hold -= dt
    else { cam.tz = 1; cam.tx = W / 2; cam.ty = H / 2 }
    const k = Math.min(1, dt * 6)
    cam.z += (cam.tz - cam.z) * k; cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k
    // 배경은 사방 15%만 더 깔려 있다 → 화면 가장자리가 그 안에 머물게
    const hw = W / (2 * cam.z), hh = H / (2 * cam.z)
    cam.x = Math.max(hw - W * 0.14, Math.min(W * 1.14 - hw, cam.x))
    cam.y = Math.max(hh - H * 0.14, Math.min(H * 1.14 - hh, cam.y))
    shake *= Math.pow(0.02, dt)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)
    ctx.translate(cw / 2 + (Math.random() - 0.5) * shake, ch / 2 + (Math.random() - 0.5) * shake)
    ctx.scale(cam.z, cam.z)
    ctx.translate(-cam.x * s, -cam.y * s)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    background(cw, ch, s)
    ambient(vdt, s)
    corpses = corpses.filter(c => (c.t += vdt) < 0.55)
    for (const c of corpses) corpse(c, s)
    for (const f of b.fighters.filter(f => f.alive).sort((a, c) => a.y - c.y)) unit(f, s, vdt)
    traces = traces.filter(t => (t.t += vdt) < t.life)
    for (const t of traces) if (t.t >= 0) trace(t, s)
    parts = parts.filter(p => (p.t += vdt) < p.life)
    drawParts(vdt, s)
    nums = nums.filter(n => (n.t += vdt) < n.life)
    for (const n of nums) num(n, s)

    // 화면 고정 층
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    timewarpTint(cw, ch)
    vignette(cw, ch)
    banners = banners.filter(v => (v.t += dt) < v.life)
    banners.forEach((v, i) => drawBanner(v, cw, ch, i))
    cutins = cutins.filter(c => (c.t += dt) < 1.5)
    for (const c of cutins.slice(0, 1)) cutIn(c, cw, ch)
    if (flashA > 0.01) { ctx.globalAlpha = flashA; ctx.fillStyle = flashC; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; flashA *= Math.pow(0.0005, dt) }
  }

  const background = (cw: number, ch: number, s: number) => {
    const key = `${cw}x${ch}`
    if (key !== bgKey) { bg = renderBg(cw, ch, s); bgKey = key }
    // 줌으로 가장자리가 비지 않게 화면보다 넓게 깐다
    ctx.drawImage(bg!, -cw * 0.15, -ch * 0.15, cw * 1.3, ch * 1.3)
    if (zone.crack && opts.zone >= 2) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(clock * (opts.zone === 3 ? 3 : 1.5))
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(W / 2 * s, H * 0.6 * s, 0, W / 2 * s, H * 0.6 * s, W * 0.5 * s)
      g.addColorStop(0, zone.crack + '33'); g.addColorStop(1, '#00000000')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W * s, H * s)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
  }

  const renderBg = (cw: number, ch: number, s: number) => {
    const c = document.createElement('canvas')
    const w = Math.round(cw * 1.3), h = Math.round(ch * 1.3)
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    const ox = cw * 0.15, oy = ch * 0.15
    const lg = g.createLinearGradient(0, 0, 0, h)
    lg.addColorStop(0, zone.top); lg.addColorStop(1, zone.bot)
    g.fillStyle = lg; g.fillRect(0, 0, w, h)
    const rg = g.createRadialGradient(w / 2, h * 0.58, 0, w / 2, h * 0.58, w * 0.45)
    rg.addColorStop(0, zone.pool + '40'); rg.addColorStop(1, '#00000000')
    g.fillStyle = rg; g.fillRect(0, 0, w, h)
    // 바닥 얼룩 (구역마다 같은 모양이 나오게 고정 난수)
    let seed = 17 + opts.zone * 31
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 160; i++) {
      g.globalAlpha = 0.25 + r() * 0.35
      g.fillStyle = zone.speck
      g.beginPath(); g.ellipse(r() * w, r() * h, 4 + r() * 26, 2 + r() * 10, 0, 0, TAU); g.fill()
    }
    g.globalAlpha = 1
    if (opts.zone === 0) { // 풀
      g.strokeStyle = '#3f6b3c'; g.lineWidth = 1.5
      for (let i = 0; i < 220; i++) { const x = r() * w, y = r() * h; g.globalAlpha = 0.35 + r() * 0.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6); g.stroke() }
    } else if (zone.crack) { // 균열
      g.strokeStyle = zone.crack; g.lineWidth = opts.zone >= 2 ? 1.6 : 1
      for (let i = 0; i < 14; i++) {
        let x = r() * w, y = r() * h
        g.globalAlpha = opts.zone >= 2 ? 0.55 : 0.4
        g.beginPath(); g.moveTo(x, y)
        for (let j = 0; j < 6; j++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 30; g.lineTo(x, y) }
        g.stroke()
      }
    }
    g.globalAlpha = 1
    // 아군·적 진영 칸
    for (const side of [0, 1]) {
      g.strokeStyle = side ? '#ff5d6c22' : '#4fd1ff22'
      g.lineWidth = 1
      for (let c2 = 0; c2 < 3; c2++) for (let row = 0; row < 4; row++) {
        const x = (side ? 6.3 + c2 : 0.7 + c2) * s + ox, y = (0.5 + row) * s + oy
        g.strokeRect(x - s * 0.44, y - s * 0.44, s * 0.88, s * 0.88)
      }
    }
    return c
  }

  const ambient = (vdt: number, s: number) => {
    ctx.globalCompositeOperation = zone.amb === 'ash' ? 'source-over' : 'lighter'
    for (const a of amb) {
      if (zone.amb === 'firefly') { a.vx += rnd(-0.3, 0.3) * vdt; a.vy += rnd(-0.3, 0.3) * vdt; a.vx *= 0.98; a.vy *= 0.98 }
      else if (zone.amb === 'ash') { a.vy = 0.18; a.vx = Math.sin(clock + a.ph) * 0.1 }
      else { a.vy = -0.22; a.vx = Math.sin(clock * 0.7 + a.ph) * 0.08 }
      a.x += a.vx * vdt; a.y += a.vy * vdt
      if (a.y < -0.2) a.y = H + 0.2
      if (a.y > H + 0.2) a.y = -0.2
      if (a.x < -0.2) a.x = W + 0.2
      if (a.x > W + 0.2) a.x = -0.2
      const tw = 0.5 + 0.5 * Math.sin(clock * 3 + a.ph)
      ctx.globalAlpha = zone.amb === 'ash' ? 0.35 : 0.25 + tw * 0.55
      ctx.fillStyle = zone.amb === 'firefly' ? '#d8ff8a' : zone.amb === 'ash' ? '#9aa3b5' : opts.zone === 3 ? '#ff7a45' : '#c77dff'
      ctx.beginPath(); ctx.arc(a.x * s, a.y * s, zone.amb === 'ash' ? 1.4 : 1.8 + tw, 0, TAU); ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  const traitColor = (f: Fighter) => {
    const t = f.traits[0]
    return t === 'guard' ? '#5b9bff' : t === 'arcane' ? '#b07cff' : t === 'hunter' ? '#5fd068' : t === 'shadow' ? '#ff6fae' : t === 'undead' ? '#62e0c8' : '#ff9f43'
  }

  // 도트가 고르게 보이도록 16px 정수배로 키운다
  const pixSize = (R: number, k = 2.5) => Math.max(32, Math.round((R * k) / 16) * 16)
  const sprId = (f: Fighter) => (f.uid === platino ? 'platino' : f.tpl.id)
  const frameOf = (uid: number) => Math.floor(clock * 2.2 + uid * 0.37) % 2
  const teamColor = (f: Fighter) => (f.boss ? '#ffcc4d' : f.side ? '#ff5d6c' : f.summoned ? '#7fffd4' : ['#4fd1ff', '#dfe7f2', '#ffcc4d'][f.star - 1])

  const unit = (f: Fighter, s: number, vdt: number) => {
    const a = anim(f.uid)
    a.lt = Math.max(0, a.lt - vdt); a.kt = Math.max(0, a.kt - vdt)
    a.hitT += vdt; a.castT += vdt; a.spawnT += vdt
    const ratio = f.hp / f.maxHp
    a.hpLag = a.hpLag > ratio ? Math.max(ratio, a.hpLag - Math.max(0.15, (a.hpLag - ratio) * 2.5) * vdt) : ratio

    const R = f.size * 0.5 * s * (f.summoned ? 0.8 : 1)
    const size = pixSize(R, f.boss ? 2.3 : 2.0)
    const baseX = f.x * s, baseY = f.y * s + size * 0.5 // 발밑: 스프라이트가 칸 가운데에 오게
    let X = baseX, feet = baseY
    if (a.lt > 0) {
      const p = 1 - a.lt / 0.2, kk = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65
      X += a.lx * kk * R * 0.55; feet += a.ly * kk * R * 0.55
    }
    if (a.kt > 0) { const kk = a.kt / 0.2; X += a.kx * kk * R * 0.3; feet += a.ky * kk * R * 0.3 }
    let sx = 1, sy = 1 + Math.sin(clock * 3 + f.uid) * 0.025
    if (a.spawnT < 0.35) { const p = a.spawnT / 0.35; const k2 = Math.max(0.05, easeOutBack(p)); sx *= k2; sy *= k2 }
    if (a.hitT < 0.1) { const kk = 1 - a.hitT / 0.1; sx *= 1 + 0.14 * kk; sy *= 1 - 0.12 * kk }
    if (a.castT < 0.3) { const kk = 1 - a.castT / 0.3; sx *= 1 - 0.06 * kk; sy *= 1 + 0.2 * kk }
    const cy = feet - size * 0.45 // 몸 가운데 (오라 중심)
    const col = teamColor(f)

    // 그림자 + 발밑 받침 (팀·별 색)
    ctx.fillStyle = '#000a'
    ctx.beginPath(); ctx.ellipse(baseX, baseY, R * 0.85, R * 0.27, 0, 0, TAU); ctx.fill()
    if (!f.summoned || f.tpl.id === 'shade') {
      ctx.globalAlpha = 0.9
      ctx.fillStyle = col + '26'
      ctx.strokeStyle = col
      ctx.lineWidth = f.star >= 2 && f.side === 0 ? 3 : 2
      ctx.beginPath(); ctx.ellipse(baseX, baseY, R * 0.78, R * 0.25, 0, 0, TAU); ctx.fill(); ctx.stroke()
      ctx.globalAlpha = 1
    }

    // 오라 (가산 합성)
    const stealth = f.invulnT > 0 && !f.st.ls && f.traits.includes('shadow')
    ctx.globalCompositeOperation = 'lighter'
    const aura = (color: string, k2: number, r2 = 1.25) => {
      const g = ctx.createRadialGradient(X, cy, R * 0.4, X, cy, R * r2 * 1.5)
      g.addColorStop(0, color + Math.round(0x90 * clamp01(k2)).toString(16).padStart(2, '0'))
      g.addColorStop(1, color + '00')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(X, cy, R * r2 * 1.5, 0, TAU); ctx.fill()
    }
    if (f.side === 0 && !f.summoned && b.counts.lonehero) aura('#ffcc4d', 0.55 + 0.2 * Math.sin(clock * 2))
    if (f.asBonus > 0.6) {
      const k2 = clamp01((f.asBonus - 0.6) / 3)
      aura('#ff4d2e', 0.35 + 0.5 * k2 * (0.8 + 0.2 * Math.sin(clock * 20 + f.uid)), 1.1 + k2 * 0.4)
      if (Math.random() < k2 * vdt * 30) parts.push({ x: f.x + rnd(-0.25, 0.25), y: f.y + rnd(-0.3, 0.2), vx: rnd(-0.2, 0.2), vy: -rnd(0.8, 1.6), t: 0, life: 0.4, size: 0.05, color: '#ff7a45', kind: 'dot', g: 0, add: true, rot: 0, vr: 0 })
    }
    if (f.invulnT > 0 && f.st.ls) { const hb = 0.6 + 0.4 * Math.abs(Math.sin(clock * 9)); aura('#ffd54a', hb, 1.3); sx *= 1 + 0.06 * hb; sy *= 1 + 0.06 * hb }
    if (a.castT < 0.35) aura(traitColor(f), 1 - a.castT / 0.35, 1.4)
    if (f.boss) aura('#ff2d55', 0.4 + 0.2 * Math.sin(clock * 4), 1.15)
    if (f.tpl.id === 'spirit' || f.tpl.id === 'shade') aura(f.tpl.id === 'spirit' ? '#7fffd4' : '#d18cff', 0.5, 0.9)
    ctx.globalCompositeOperation = 'source-over'

    // 본체: 도트 스프라이트 (아군은 오른쪽을 보게 뒤집음)
    const id = sprId(f), fr = frameOf(f.uid), flip = flipFor(id, f.side)
    ctx.save()
    ctx.translate(X, feet + (f.tpl.id === 'spirit' ? Math.sin(clock * 4 + f.uid) * R * 0.12 : 0))
    ctx.scale(sx, sy)
    ctx.globalAlpha = stealth ? 0.45 : f.tpl.id === 'spirit' || f.tpl.id === 'shade' ? 0.78 : 1
    if (!drawSprite(ctx, id, fr, size, flip)) {
      ctx.font = `${Math.round(R * 1.2)}px ${EMOJI}`
      ctx.fillText(f.emoji, 0, -R)
    }
    if (a.hitT < 0.09) { ctx.globalAlpha = (1 - a.hitT / 0.09) * (f.boss ? 0.4 : 0.8); drawSprite(ctx, id, fr, size, flip, '#ffffff') }
    if (f.slowT > 0) { ctx.globalAlpha = 0.4; drawSprite(ctx, id, fr, size, flip, '#8fe3ff') }
    if (stealth) { ctx.globalAlpha = 0.35; drawSprite(ctx, id, fr, size, flip, '#9a6bff') }
    ctx.restore()

    // 머리 위: 별 · 체력 · 마나
    const top = Math.max(10, feet - size * 0.92)
    if (f.stunT > 0) {
      ctx.font = `${Math.round(R * 0.38)}px ${EMOJI}`
      for (let i = 0; i < 3; i++) { const ang = clock * 5 + (i * TAU) / 3; ctx.fillText('⭐', X + Math.cos(ang) * R * 0.6, top - R * 0.15 + Math.sin(ang) * R * 0.18) }
    }
    if (f.boss) return
    const bw = R * (f.summoned ? 1.3 : 1.8), bx = X - bw / 2, bh = Math.max(4, R * 0.12), by = top - bh - 4
    if (f.summoned && f.hp >= f.maxHp) return
    const tot = Math.max(f.maxHp, f.hp + f.shield)
    ctx.fillStyle = '#000b'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2)
    ctx.fillStyle = '#ffffffcc'; ctx.fillRect(bx, by, (bw * a.hpLag * f.maxHp) / tot, bh)
    ctx.fillStyle = f.side ? '#ff5d6c' : f.summoned ? '#7fffd4' : '#4ade80'
    ctx.fillRect(bx, by, (bw * f.hp) / tot, bh)
    if (f.shield > 0) { ctx.fillStyle = '#cfe3ff'; ctx.fillRect(bx + (bw * f.hp) / tot, by, (bw * f.shield) / tot, bh) }
    if (f.maxMana > 0) {
      ctx.fillStyle = '#000b'; ctx.fillRect(bx - 1, by + bh + 1, bw + 2, 4)
      ctx.fillStyle = f.mana >= f.maxMana * 0.95 ? '#bfe1ff' : '#5aa9ff'
      ctx.fillRect(bx, by + bh + 2, bw * Math.min(1, f.mana / f.maxMana), 2)
    }
    if (f.side === 0 && !f.summoned) {
      // 별은 체력바 왼쪽 (맨 윗줄에서도 잘리지 않게)
      ctx.font = `bold ${Math.round(Math.max(10, R * 0.3))}px sans-serif`
      ctx.fillStyle = ['#d49a6a', '#dfe7f2', '#ffcc4d'][f.star - 1]
      ctx.strokeStyle = '#000a'; ctx.lineWidth = 3
      ctx.textAlign = 'right'
      const st = '★'.repeat(f.star)
      ctx.strokeText(st, bx - 3, by + bh / 2); ctx.fillText(st, bx - 3, by + bh / 2)
      ctx.textAlign = 'center'
    }
  }

  const corpse = (c: Corpse, s: number) => {
    const p = c.t / 0.55, R = c.size * 0.5 * s * (c.summoned ? 0.8 : 1), size = pixSize(R, c.size > 1 ? 2.3 : 2.0)
    ctx.save()
    ctx.translate(c.x * s, c.y * s + size * 0.5 - (c.summoned ? p * R : 0))
    ctx.rotate(c.spin * p * 1.1)
    ctx.scale(1 - p * 0.3, 1 - p * 0.3)
    ctx.globalAlpha = 1 - p
    const flip = flipFor(c.id, c.side)
    if (!drawSprite(ctx, c.id, 0, size, flip, p < 0.2 ? '#ffffff' : undefined)) {
      ctx.font = `${Math.round(R * 1.1)}px ${EMOJI}`
      ctx.fillText(c.emoji, 0, -R)
    }
    ctx.restore()
  }

  const drawParts = (vdt: number, s: number) => {
    for (const p of parts) {
      p.vy += p.g * vdt
      p.x += p.vx * vdt; p.y += p.vy * vdt
      p.rot += p.vr * vdt
      if (p.kind !== 'wisp') { p.vx *= Math.pow(0.12, vdt); if (!p.g) p.vy *= Math.pow(0.12, vdt) }
      const q = p.t / p.life
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'
      ctx.globalAlpha = (1 - q) * (p.kind === 'smoke' ? 0.6 : 1)
      ctx.fillStyle = p.color
      ctx.strokeStyle = p.color
      const X = p.x * s, Y = p.y * s, S = p.size * s * (p.kind === 'smoke' ? 1 + q * 1.5 : 1 - q * 0.5)
      switch (p.kind) {
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy) * s * 0.03 + 1
          ctx.lineWidth = Math.max(1, S * 0.5)
          ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - p.vx * sp, Y - p.vy * sp); ctx.stroke()
          break
        }
        case 'shard':
          ctx.save(); ctx.translate(X, Y); ctx.rotate(p.rot)
          ctx.beginPath(); ctx.moveTo(0, -S); ctx.lineTo(S * 0.45, 0); ctx.lineTo(0, S); ctx.lineTo(-S * 0.45, 0); ctx.closePath(); ctx.fill()
          ctx.restore()
          break
        case 'square': ctx.save(); ctx.translate(X, Y); ctx.rotate(p.rot); ctx.fillRect(-S / 2, -S / 2, S, S); ctx.restore(); break
        case 'wisp': ctx.beginPath(); ctx.arc(X + Math.sin(p.t * 9 + p.rot) * S, Y, S * 0.6, 0, TAU); ctx.fill(); break
        default: ctx.beginPath(); ctx.arc(X, Y, S * 0.6, 0, TAU); ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  const trace = (t: Trace, s: number) => {
    const p = t.t / t.life, e = t.fx
    ctx.globalAlpha = 1
    switch (e.k) {
      case 'shot': {
        if (e.style === 'snipe') {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = 1 - p
          ctx.strokeStyle = e.color; ctx.lineWidth = 6 * (1 - p); ctx.beginPath(); ctx.moveTo(e.x1 * s, e.y1 * s); ctx.lineTo(e.x2 * s, e.y2 * s); ctx.stroke()
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * (1 - p); ctx.stroke()
          ctx.globalCompositeOperation = 'source-over'
          break
        }
        const q = Math.min(1, p * 1.25), tail = e.style === 'fire' ? 0.35 : 0.22
        const hx = (e.x1 + (e.x2 - e.x1) * q) * s, hy = (e.y1 + (e.y2 - e.y1) * q) * s
        const qx = (e.x1 + (e.x2 - e.x1) * Math.max(0, q - tail)) * s, qy = (e.y1 + (e.y2 - e.y1) * Math.max(0, q - tail)) * s
        ctx.globalCompositeOperation = 'lighter'
        const g = ctx.createLinearGradient(qx, qy, hx, hy)
        g.addColorStop(0, e.color + '00'); g.addColorStop(1, e.color)
        ctx.strokeStyle = g; ctx.lineWidth = e.style === 'fire' ? 7 : 3; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(hx, hy); ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.arc(hx, hy, e.style === 'fire' ? 5 : 2.5, 0, TAU); ctx.fill()
        if (e.style === 'fire' && q < 1) parts.push({ x: hx / s, y: hy / s, vx: rnd(-0.3, 0.3), vy: rnd(-0.6, -0.1), t: 0, life: 0.3, size: 0.06, color: '#ff9d3c', kind: 'dot', g: 0, add: true, rot: 0, vr: 0 })
        ctx.lineCap = 'butt'
        ctx.globalCompositeOperation = 'source-over'
        break
      }
      case 'line': {
        // 번개: 매 프레임 다시 꺾어 그려 지직거리게
        ctx.globalCompositeOperation = 'lighter'
        const pts: [number, number][] = [[e.x1 * s, e.y1 * s]]
        const dx = (e.x2 - e.x1) * s, dy = (e.y2 - e.y1) * s, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len
        for (let i = 1; i < 7; i++) { const k2 = i / 7, off = (Math.random() - 0.5) * Math.min(18, len * 0.15); pts.push([e.x1 * s + dx * k2 + nx * off, e.y1 * s + dy * k2 + ny * off]) }
        pts.push([e.x2 * s, e.y2 * s])
        for (const [w, col, al] of [[7, e.color, 0.35], [2.2, '#ffffff', 1]] as const) {
          ctx.globalAlpha = (1 - p) * al; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'
          ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
        }
        ctx.globalCompositeOperation = 'source-over'
        break
      }
      case 'ring': {
        const er = 1 - (1 - clamp01(p)) ** 3
        const r = e.r * s * (0.25 + 0.75 * er)
        ctx.globalCompositeOperation = 'lighter'
        const fill = ctx.createRadialGradient(e.x * s, e.y * s, r * 0.2, e.x * s, e.y * s, r)
        const alpha = e.style === 'dark' ? 0x55 : e.style === 'ice' || e.style === 'fire' ? 0x50 : 0x30
        fill.addColorStop(0, e.color + '00'); fill.addColorStop(0.8, e.color + Math.round(alpha * (1 - p)).toString(16).padStart(2, '0')); fill.addColorStop(1, e.color + '00')
        ctx.fillStyle = fill
        ctx.beginPath(); ctx.arc(e.x * s, e.y * s, r, 0, TAU); ctx.fill()
        ctx.globalAlpha = 1 - p
        ctx.strokeStyle = e.color; ctx.lineWidth = e.style === 'dark' ? 6 : e.style === 'roar' ? 4 : 2.5
        ctx.beginPath(); ctx.arc(e.x * s, e.y * s, r, 0, TAU); ctx.stroke()
        if (e.style === 'blade') {
          ctx.lineWidth = 3; ctx.strokeStyle = '#ffd6ec'
          for (let i = 0; i < 3; i++) { const a0 = t.j * TAU + p * 9 + (i * TAU) / 3; ctx.beginPath(); ctx.arc(e.x * s, e.y * s, e.r * s * 0.8, a0, a0 + 0.9); ctx.stroke() }
        }
        if (e.style === 'shield') {
          ctx.lineWidth = 2; ctx.strokeStyle = '#cfe3ff'
          ctx.beginPath()
          for (let i = 0; i <= 6; i++) { const a0 = (i * TAU) / 6 + Math.PI / 6; const x = e.x * s + Math.cos(a0) * r * 0.55, y = e.y * s + Math.sin(a0) * r * 0.55; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
          ctx.stroke()
        }
        ctx.globalCompositeOperation = 'source-over'
        break
      }
      case 'slash': {
        const len = s * 1.1, q = Math.min(1, p * 3)
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 1 - p
        ctx.strokeStyle = e.color; ctx.lineWidth = 9 * (1 - p); ctx.lineCap = 'round'
        const x0 = e.x * s - len / 2, y0 = e.y * s - len / 2
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + len * q, y0 + len * q); ctx.stroke()
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * (1 - p); ctx.stroke()
        ctx.lineCap = 'butt'
        ctx.globalCompositeOperation = 'source-over'
        break
      }
      case 'pillar': {
        ctx.globalCompositeOperation = 'lighter'
        const w = s * 0.5 * (1 - p)
        const g = ctx.createLinearGradient(e.x * s - w, 0, e.x * s + w, 0)
        g.addColorStop(0, e.color + '00'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, e.color + '00')
        ctx.globalAlpha = 1 - p
        ctx.fillStyle = g
        ctx.fillRect(e.x * s - w, -s, w * 2, e.y * s + s)
        ctx.globalCompositeOperation = 'source-over'
        break
      }
      case 'ghost': {
        const R = (e.r ?? 0.72) * 0.5 * s
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = (1 - p) * 0.8
        const gs = pixSize(R, 2.0)
        ctx.translate(e.x * s, e.y * s + gs * 0.5)
        ctx.scale(1 + p * 0.7, 1 + p * 0.7)
        if (!e.id || !drawSprite(ctx, e.id, 0, gs, !!e.flip, e.color)) {
          ctx.font = `${Math.round(R * 1.1)}px ${EMOJI}`
          ctx.fillText(e.emoji ?? '', 0, -R)
        }
        ctx.restore()
        break
      }
      case 'text': {
        const a = p < 0.75 ? 1 : (1 - p) / 0.25
        txt(e.text, e.x * s, Math.max(14, e.y * s - p * 16), `800 ${Math.round(Math.max(12, s * 0.15))}px sans-serif`, e.color, a, 3)
        break
      }
    }
    ctx.globalAlpha = 1
  }

  const num = (n: Num, s: number) => {
    const p = n.t / n.life
    const pop = n.t < 0.12 ? 1 + (1 - n.t / 0.12) * (n.crit ? 0.9 : 0.4) : 1
    const base = n.heal ? 12 : n.crit ? 21 : 14
    const mag = 1 + Math.min(1, Math.max(0, Math.log10(n.v / 1000)) * 0.4)
    const size = Math.round(base * mag * pop * Math.max(0.8, s / 110))
    const jitter = n.crit && n.v >= 10000 ? (Math.random() - 0.5) * 3 : 0
    txt(fmt(n.v) + (n.crit ? '!' : '') , n.x * s + n.j * s + jitter, Math.max(16, n.y * s - s * 0.42 - p * s * 0.35), `900 ${size}px sans-serif`, n.heal ? '#7dffa0' : n.color, 1 - p * p, n.crit ? 4.5 : 3.5, n.crit ? '#7a3300' : '#000')
  }

  const txt = (t: string, x: number, y: number, font: string, color: string, alpha: number, stroke = 3.5, strokeColor = '#000') => {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    ctx.font = font
    ctx.lineWidth = stroke
    ctx.lineJoin = 'round'
    ctx.strokeStyle = strokeColor
    ctx.strokeText(t, x, y)
    ctx.fillStyle = color
    ctx.fillText(t, x, y)
    ctx.globalAlpha = 1
  }

  const timewarpTint = (cw: number, ch: number) => {
    if (!b.counts.timewarp || b.t > 3.5) return
    ctx.globalAlpha = 0.18 * (1 - b.t / 3.5)
    ctx.fillStyle = '#7fb4ff'
    ctx.fillRect(0, 0, cw, ch)
    ctx.globalAlpha = 1
  }

  const vignette = (cw: number, ch: number) => {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.7)
    const boss = opts.zone === 3 ? 0.35 + 0.15 * Math.sin(clock * 3) : 0
    g.addColorStop(0, '#00000000')
    g.addColorStop(1, boss ? `rgba(90,0,20,${0.55 + boss * 0.4})` : 'rgba(0,0,0,0.55)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, cw, ch)
  }

  const drawBanner = (v: Banner, cw: number, ch: number, i: number) => {
    const p = v.t / v.life
    const a = p < 0.1 ? p / 0.1 : p > 0.75 ? (1 - p) / 0.25 : 1
    const punch = 1 + Math.max(0, 1 - p * 7) * 0.5
    const size = Math.round(Math.min(v.big ? 52 : 38, cw / (v.big ? 15 : 20)) * punch)
    ctx.save()
    ctx.shadowBlur = 30; ctx.shadowColor = v.color
    txt(v.text, cw / 2, ch * 0.2 + i * size * 1.1, `900 ${size}px sans-serif`, v.color, a, 6)
    ctx.restore()
  }

  // 공명 컷인: 두 증강체 아이콘이 가운데서 부딪쳐 공명 이름이 터진다
  const cutIn = (c: CutIn, cw: number, ch: number) => {
    const t = c.t, p = t / 1.5
    const a = t < 0.15 ? t / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1
    const bandH = ch * 0.34, y = ch * 0.5
    ctx.save()
    ctx.globalAlpha = a
    const g = ctx.createLinearGradient(0, y - bandH / 2, 0, y + bandH / 2)
    g.addColorStop(0, '#00000000'); g.addColorStop(0.2, '#0b0614e6'); g.addColorStop(0.8, '#0b0614e6'); g.addColorStop(1, '#00000000')
    ctx.fillStyle = g
    ctx.fillRect(0, y - bandH / 2, cw, bandH)
    // 빛줄기
    ctx.globalCompositeOperation = 'lighter'
    const sw = clamp01((t - 0.3) / 0.8) * cw * 1.6 - cw * 0.3
    const lg = ctx.createLinearGradient(sw - cw * 0.25, y - bandH / 2, sw + cw * 0.25, y + bandH / 2)
    lg.addColorStop(0, '#ffe06600'); lg.addColorStop(0.5, '#ffe0663a'); lg.addColorStop(1, '#ffe06600')
    ctx.fillStyle = lg
    ctx.fillRect(0, y - bandH / 2, cw, bandH)
    ctx.globalCompositeOperation = 'source-over'
    const meet = clamp01(t / 0.35)
    const iconSize = Math.round(bandH * 0.32)
    ctx.font = `${iconSize}px ${EMOJI}`
    if (meet < 1) {
      ctx.fillText(c.res.a, cw * (0.2 + 0.28 * meet), y - bandH * 0.05)
      ctx.fillText(c.res.b, cw * (0.8 - 0.28 * meet), y - bandH * 0.05)
    } else {
      const k2 = clamp01((t - 0.35) / 0.25)
      ctx.font = `${Math.round(iconSize * (1 + (1 - k2) * 0.6))}px ${EMOJI}`
      ctx.fillText(c.res.emoji, cw / 2, y - bandH * 0.08)
      txt(`공명 · ${c.res.name}`, cw / 2, y + bandH * 0.3, `900 ${Math.round(bandH * 0.16)}px sans-serif`, '#fff3b0', k2, 6, '#5a3a00')
    }
    ctx.restore()
  }

  // 시작 신호
  banner('전투 개시!', '#cfe3ff')
  raf = requestAnimationFrame(frame)
  return {
    skip() {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(raf)
      b.keepFx = false
      while (!b.done) b.step(STEP)
      onEnd()
    },
    stop() { stopped = true; cancelAnimationFrame(raf) },
  }
}
