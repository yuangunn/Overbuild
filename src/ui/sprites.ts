// 캐릭터 도트: DawnLike 16x16 (DragonDePlatino, CC-BY 4.0 · 팔레트 DawnBringer) — public/sprites/dawnlike/
// 시트마다 0·1 두 장이 2프레임 애니메이션이다. 사람형·언데드·정령·악마는 오른쪽, 짐승류는 왼쪽을 본다.
type Sheet = 'Humanoid' | 'Undead' | 'Demon' | 'Dog' | 'Pest' | 'Quadraped' | 'Elemental' | 'Avian' | 'Slime' | 'Reptile'

const SHEET_H: Record<Sheet, number> = { Humanoid: 432, Undead: 160, Demon: 144, Dog: 112, Pest: 176, Quadraped: 192, Elemental: 176, Avian: 208, Slime: 80, Reptile: 248 }
const SHEET_W = 128

// 템플릿 id → [시트, 열, 행]
export const SPR: Record<string, [Sheet, number, number]> = {
  // 아군
  shieldbearer: ['Humanoid', 3, 4], apprentice: ['Humanoid', 3, 10], ranger: ['Humanoid', 1, 5], cutthroat: ['Humanoid', 5, 2],
  skeleton_w: ['Undead', 4, 2], wolf: ['Dog', 1, 4], frostwitch: ['Undead', 2, 6], sniper: ['Humanoid', 4, 5],
  golem: ['Elemental', 2, 1], necromancer: ['Undead', 7, 2], bear: ['Quadraped', 3, 1], stormcaller: ['Humanoid', 2, 16],
  bladedancer: ['Humanoid', 4, 7], phoenix: ['Avian', 3, 2], dragonknight: ['Reptile', 3, 3], shadowlord: ['Undead', 2, 5],
  // 소환수
  skeleton: ['Undead', 0, 2], spirit: ['Undead', 1, 4], shade: ['Undead', 1, 8],
  // 적
  slime: ['Slime', 0, 3], goblin: ['Humanoid', 4, 8], thrower: ['Humanoid', 1, 2], orc: ['Humanoid', 0, 7], bat: ['Avian', 2, 11],
  shaman: ['Reptile', 0, 7], skelarcher: ['Undead', 5, 2], demon: ['Demon', 1, 1], spider: ['Pest', 2, 2], troll: ['Humanoid', 0, 0],
  scorpion: ['Pest', 4, 2], boss: ['Demon', 6, 2],
  // 작가 요청: 이 스프라이트를 게임 어딘가에 숨겨 둘 것
  platino: ['Reptile', 3, 12],
}

const url = (s: Sheet, f: number) => `${import.meta.env.BASE_URL}sprites/dawnlike/${s}${f}.png`

// ── 캔버스용
const imgs = new Map<string, HTMLImageElement>()
for (const s of Object.keys(SHEET_H) as Sheet[]) for (const f of [0, 1]) {
  const im = new Image()
  im.src = url(s, f)
  imgs.set(s + f, im)
}

const tintCache = new Map<string, HTMLCanvasElement>()

function source(id: string, frame: number): [HTMLImageElement | HTMLCanvasElement, number, number] | null {
  const m = SPR[id]
  if (!m) return null
  const im = imgs.get(m[0] + frame)
  if (!im?.complete || !im.naturalWidth) return null
  return [im, m[1] * 16, m[2] * 16]
}

// 한 가지 색으로 칠한 실루엣 (피격 섬광·잔상·둔화용)
function tinted(id: string, frame: number, color: string): HTMLCanvasElement | null {
  const key = `${id}:${frame}:${color}`
  const hit = tintCache.get(key)
  if (hit) return hit
  const src = source(id, frame)
  if (!src) return null
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d')!
  g.drawImage(src[0], src[1], src[2], 16, 16, 0, 0, 16, 16)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, 16, 16)
  tintCache.set(key, c)
  return c
}

export const hasSprite = (id: string) => !!SPR[id]

const RIGHT: Sheet[] = ['Humanoid', 'Undead', 'Elemental', 'Demon', 'Slime']
// 아군(0)은 오른쪽, 적(1)은 왼쪽을 보도록 뒤집을지
export const flipFor = (id: string, side: number) => {
  const m = SPR[id]
  const right = !m || RIGHT.includes(m[0])
  return side === 0 ? !right : right
}

// 발밑 가운데 (0,0) 기준으로 그린다. 호출 쪽에서 translate/scale을 걸어 둔다.
export function drawSprite(ctx: CanvasRenderingContext2D, id: string, frame: number, size: number, flip: boolean, tint?: string): boolean {
  const t = tint ? tinted(id, frame, tint) : null
  const src = tint ? (t ? ([t, 0, 0] as const) : null) : source(id, frame)
  if (!src) return false
  ctx.save()
  ctx.imageSmoothingEnabled = false
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(src[0], src[1], src[2], 16, 16, -size / 2, -size, size, size)
  ctx.restore()
  return true
}

// ── DOM용: 요소 크기에 맞춰 늘어나는 배경 스프라이트 (2프레임은 CSS 애니메이션)
export function sprHTML(id: string, fallback: string, cls = '', side = 0): string {
  const flip = flipFor(id, side)
  const m = SPR[id]
  if (!m) return `<span class="em ${cls}">${fallback}</span>`
  const [s, c, r] = m
  const h = SHEET_H[s]
  const bx = ((c * 16) / (SHEET_W - 16)) * 100, by = ((r * 16) / (h - 16)) * 100
  return `<span class="spr ${cls}${flip ? ' flip' : ''}" style="--s0:url(${url(s, 0)});--s1:url(${url(s, 1)});background-size:${(SHEET_W / 16) * 100}% ${(h / 16) * 100}%;background-position:${bx}% ${by}%"></span>`
}

export const CREDITS = '캐릭터 도트: DawnLike by DragonDePlatino (CC-BY 4.0) · 팔레트: DawnBringer'
