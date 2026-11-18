// 캐릭터 도트: DawnLike 16x16 (DragonDePlatino, CC-BY 4.0 · 팔레트 DawnBringer) — public/sprites/dawnlike/
// 시트마다 0·1 두 장이 2프레임 애니메이션이다. 사람형·언데드·정령·악마는 오른쪽, 짐승류는 왼쪽을 본다.
// East = Ninja Adventure(Pixel-Boy, CC0)의 오른쪽 보는 걷기 첫 두 프레임을 DawnBringer 16색으로 바꾼 시트 — public/sprites/east/
export type Sheet = 'Humanoid' | 'Undead' | 'Demon' | 'Dog' | 'Pest' | 'Quadraped' | 'Elemental' | 'Avian' | 'Slime' | 'Reptile' | 'East'

const SHEET_H: Record<Sheet, number> = { Humanoid: 432, Undead: 160, Demon: 144, Dog: 112, Pest: 176, Quadraped: 192, Elemental: 176, Avian: 208, Slime: 80, Reptile: 248, East: 32 }
const SHEET_W = 128

// 템플릿 id → [시트, 열, 행] (나만의 영웅은 app이 실행 중에 더한다)
export const SPR: Record<string, [Sheet, number, number]> = {
  // 아군
  shieldbearer: ['Humanoid', 3, 4], apprentice: ['Humanoid', 3, 10], ranger: ['Humanoid', 1, 5], cutthroat: ['Humanoid', 5, 2],
  skeleton_w: ['Undead', 4, 2], wolf: ['Dog', 1, 4], frostwitch: ['Undead', 2, 6], sniper: ['Humanoid', 4, 5],
  golem: ['Elemental', 2, 1], necromancer: ['Undead', 7, 2], bear: ['Quadraped', 3, 1], stormcaller: ['Humanoid', 2, 16],
  bladedancer: ['Humanoid', 4, 7], phoenix: ['Avian', 3, 2], dragonknight: ['Reptile', 3, 3], shadowlord: ['Undead', 2, 5],
  monk: ['East', 0, 0], archer: ['East', 1, 0], swordsman: ['East', 2, 0], taoist: ['East', 3, 0], jiangshimaster: ['East', 4, 0],
  monkeyking: ['East', 5, 0], general: ['East', 6, 0], jiangshi_s: ['East', 7, 0],
  // 소환수
  skeleton: ['Undead', 0, 2], spirit: ['Undead', 1, 4], shade: ['Undead', 1, 8],
  // 적
  slime: ['Slime', 0, 3], goblin: ['Humanoid', 4, 8], thrower: ['Humanoid', 1, 2], orc: ['Humanoid', 0, 7], bat: ['Avian', 2, 11],
  shaman: ['Reptile', 0, 7], skelarcher: ['Undead', 5, 2], demon: ['Demon', 1, 1], spider: ['Pest', 2, 2], troll: ['Humanoid', 0, 0],
  scorpion: ['Pest', 4, 2], boss: ['Demon', 6, 2],
  dokkaebi: ['East', 0, 1], clubber: ['East', 1, 1], lantern: ['East', 2, 1], wisp: ['East', 3, 1], jiangshi: ['East', 7, 0],
  gumiho: ['East', 4, 1], foxclone: ['East', 4, 1],
  // 기믹 적·정예
  kingslime: ['Slime', 2, 3], slimelet: ['Slime', 1, 3], bomber: ['Humanoid', 1, 8], treasure: ['Humanoid', 0, 8],
  priest: ['Undead', 1, 7], wraith: ['Undead', 1, 3], goblinking: ['Humanoid', 3, 8], lich: ['Undead', 6, 2],
  // 시작 사령관
  cmd_merchant: ['Humanoid', 4, 9], cmd_seer: ['Humanoid', 0, 16], cmd_smith: ['Humanoid', 2, 12], cmd_lord: ['Humanoid', 2, 15],
  cmd_twin: ['Humanoid', 1, 18], cmd_drill: ['Humanoid', 6, 4], cmd_resonator: ['Humanoid', 2, 18], cmd_recruiter: ['Humanoid', 6, 0],
  // 작가 요청: 이 스프라이트를 게임 어딘가에 숨겨 둘 것
  platino: ['Reptile', 3, 12],
}

const url = (s: Sheet, f: number) => `${import.meta.env.BASE_URL}sprites/${s === 'East' ? 'east' : 'dawnlike'}/${s}${f}.png`

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

const RIGHT: Sheet[] = ['Humanoid', 'Undead', 'Elemental', 'Demon', 'Slime', 'East']
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
  const m = SPR[id]
  if (!m) return `<span class="em ${cls}">${fallback}</span>`
  return sprAt(m[0], m[1], m[2], cls, flipFor(id, side))
}

export function sprAt(s: Sheet, c: number, r: number, cls = '', flip = false): string {
  const h = SHEET_H[s]
  const bx = ((c * 16) / (SHEET_W - 16)) * 100, by = ((r * 16) / (h - 16)) * 100
  return `<span class="spr ${cls}${flip ? ' flip' : ''}" style="--s0:url(${url(s, 0)});--s1:url(${url(s, 1)});background-size:${(SHEET_W / 16) * 100}% ${(h / 16) * 100}%;background-position:${bx}% ${by}%"></span>`
}

// 영웅 외형 고르기: 시트마다 그림이 있는 칸 (PNG 알파에서 한 번 뽑아 둔 값, 8열·행 우선, 1 = 있음)
export const SHEET_NAMES: Record<Sheet, string> = { Humanoid: '사람', Undead: '언데드', Demon: '악마', Dog: '개', Pest: '벌레', Quadraped: '네발', Elemental: '정령', Avian: '새', Slime: '슬라임', Reptile: '파충류', East: '동방' }
const CELLS: Record<Sheet, string> = {
  Humanoid: '111111111110000011111111111111111111111011111110111111001111100011111000111110001111000011110000111100001111000011100000111000001110000011100000111000001110000011000000110000001100000011000000110000001100000010000000',
  Undead: '11111111111111111111111111110000111100001110000011100000111000001100000011000000',
  Demon: '111111111111111111111110111000001110000011000000110000001100000011000000',
  Dog: '11111100111111001110000011100000111000001110000000000000',
  Pest: '1111111111111100111111001111100011110000111100001110000011110000110000001100000011000000',
  Quadraped: '111111111111111011111100111111001111000011110000111000001110000011000000110000001100000011000000',
  Elemental: '1111111111111100111111001111100011110000111000001110000011100000111000001100000011000000',
  Avian: '11111111111111111111110011111111111111111111111111111111111111001111110011110000111100001111100011000000',
  Slime: '1111110011100000111000001110000011000000',
  Reptile: '111111111111111111111111111111001111111111111111110000001111000011100000110000001111000011100000000111001111111111111111',
  East: '1111111111111000',
}
export const cellsOf = (s: Sheet): [number, number][] => [...CELLS[s]].flatMap((b, i) => (b === '1' ? [[i % 8, Math.floor(i / 8)] as [number, number]] : []))
export const isSheet = (s: string): s is Sheet => s in SHEET_H

// ── 아이콘: DawnLike 아이템·GUI·장식 시트 (한 장짜리, 16px 칸). [시트, 열, 행]
const ISHEET: Record<string, [number, number]> = {
  Ammo: [8, 6], Amulet: [8, 3], Armor: [8, 9], Book: [8, 9], Boot: [8, 2], Chest0: [8, 3], Decor: [8, 22], Flesh: [8, 9], Food: [8, 6], GUI: [16, 19],
  Glove: [8, 1], Hat: [8, 4], Key: [8, 1], LongWep: [8, 7], MedWep: [8, 2], Money: [8, 8], Music: [8, 6], Potion: [8, 5], Ring: [8, 6], Rock: [8, 2],
  Scroll: [8, 6], Shield: [8, 1], ShortWep: [8, 5], Tool: [8, 3], Wand: [8, 7],
}
const TRAIT_ICON: Record<string, [string, number, number]> = {
  guard: ['Shield', 4, 0], arcane: ['Tool', 1, 0], hunter: ['Ammo', 0, 1], shadow: ['ShortWep', 0, 0], undead: ['Decor', 2, 17], beast: ['Flesh', 1, 3], east: ['Scroll', 4, 0],
}
export const ICON: Record<string, [string, number, number]> = {
  // 아이템
  sword: ['LongWep', 0, 1], feather: ['Tool', 4, 0], helm: ['Hat', 1, 0], crystal: ['Money', 1, 2], dice: ['ShortWep', 4, 0],
  fang: ['Amulet', 3, 1], charm: ['Amulet', 0, 0], rune: ['Scroll', 3, 1], ring: ['Ring', 2, 0],
  // 조합 아이템
  execblade: ['MedWep', 4, 0], stormrune: ['Wand', 0, 0], bastion: ['Shield', 4, 0], infinity: ['Ring', 6, 3], bloodthirst: ['LongWep', 4, 1],
  luckyring: ['Ring', 2, 1], oath: ['Amulet', 1, 2], arcburst: ['Amulet', 7, 0], titan: ['Armor', 2, 6], quickdraw: ['LongWep', 0, 0],
  twinblade: ['MedWep', 5, 0], spellspear: ['LongWep', 4, 4], lastblade: ['LongWep', 2, 1], flameblade: ['MedWep', 2, 0], awaken: ['LongWep', 1, 1],
  charger: ['Armor', 5, 6], thunderdagger: ['ShortWep', 7, 0], hunterfang: ['ShortWep', 3, 0], brokenwing: ['Amulet', 1, 1], arcarrow: ['Ammo', 3, 2],
  sagehelm: ['Hat', 1, 2], stoneheart: ['Armor', 7, 6], regen: ['Armor', 3, 0], sunfire: ['Armor', 0, 0], quakeshield: ['Shield', 3, 0],
  sagestone: ['Money', 3, 2], salvation: ['Potion', 6, 0], hymn: ['Music', 1, 3], vampdice: ['Ring', 2, 4], luckcharm: ['Shield', 1, 0], emberdice: ['Rock', 3, 0],
  bloodrune: ['Scroll', 2, 1], lifering: ['Ring', 0, 2], bombcharm: ['Amulet', 4, 0], guardring: ['Ring', 1, 1], manarune: ['Scroll', 3, 0],
  bloodsword: ['LongWep', 1, 6], crossbow: ['Ammo', 5, 1], thornmail: ['Armor', 6, 8], wellspring: ['Potion', 5, 2], fatedice: ['Money', 6, 1],
  hungryfang: ['Amulet', 3, 0], angelcharm: ['Amulet', 0, 1], chainbomb: ['Scroll', 4, 3], bondring: ['Ring', 5, 3],
  // 유물 (찬란한 아이템은 원래 조합 아이템 그림에 빛을 두른다)
  lantern: ['Music', 1, 4], cloak: ['Armor', 7, 7], gloves: ['Glove', 3, 0], prism: ['Money', 0, 2], cursed: ['LongWep', 5, 1], angel: ['Scroll', 2, 5],
  scope: ['Tool', 3, 0], bigpotion: ['Potion', 4, 2], bloodvial: ['Potion', 7, 4], spring: ['Tool', 2, 2], crown: ['Hat', 1, 3], trident: ['LongWep', 6, 0],
  gourd: ['Potion', 6, 3], seal: ['Money', 5, 4], talisman: ['Scroll', 2, 5],
  // 특성 (문장 증강체도 같은 아이콘)
  ...TRAIT_ICON, ...Object.fromEntries(Object.entries(TRAIT_ICON).map(([k, v]) => ['crest_' + k, v])),
  // 증강체
  echo: ['Music', 0, 4], chain: ['LongWep', 1, 5], soulpact: ['Scroll', 0, 0], frenzy: ['Potion', 1, 4], laststand: ['Shield', 0, 0],
  manasurge: ['Potion', 7, 0], vamp: ['Potion', 0, 0], giant: ['Rock', 2, 1], executioner: ['MedWep', 1, 1], corpse: ['Potion', 2, 3],
  lonehero: ['LongWep', 3, 1], growth: ['Food', 4, 0], midas: ['Glove', 2, 0], multishot: ['Ammo', 2, 2], overload: ['Wand', 2, 0],
  martyr: ['Decor', 2, 8], duplicate: ['Tool', 0, 0], armory: ['Chest0', 1, 0], smite: ['Wand', 1, 1], timewarp: ['GUI', 10, 4], splitsoul: ['Potion', 4, 3],
  // 공명
  res_infinite: ['Ring', 3, 0], res_storm: ['Potion', 3, 3], res_bomb: ['Potion', 0, 4], res_bloodfrenzy: ['Ring', 6, 4], res_titan: ['Armor', 6, 0],
  res_execution: ['Decor', 6, 10], res_shotgun: ['Ammo', 0, 0], res_legend: ['Hat', 2, 3], res_march: ['Decor', 0, 17], res_thunder: ['GUI', 12, 4],
  // 영구 성장
  gold: ['Money', 0, 0], augroll: ['Tool', 2, 0], shop6: ['Chest0', 0, 0], life: ['GUI', 0, 1], startaug: ['Boot', 1, 0],
  // 화면 요소
  heart: ['GUI', 0, 1], heart0: ['GUI', 4, 1], coin: ['Money', 0, 0], shard: ['Rock', 2, 0], codex: ['Book', 1, 0], wave: ['MedWep', 0, 0],
  elite: ['GUI', 11, 3], boss: ['Hat', 2, 3], train: ['Scroll', 4, 0], slot: ['Key', 0, 0],
}

const iconUrl = (s: string) => `${import.meta.env.BASE_URL}sprites/dawnlike/items/${s}.png`
const iconImgs = new Map<string, HTMLImageElement>()
for (const s of Object.keys(ISHEET)) { const im = new Image(); im.src = iconUrl(s); iconImgs.set(s, im) }

// DOM: 크기는 CSS(.ico.s16/s32/s48/s64)가 정한다. 16의 배수라 도트가 고르게 커진다
export function iconHTML(id: string, cls = 's16'): string {
  const rad = id.startsWith('rad_')
  const m = ICON[rad ? id.slice(4) : id]
  if (!m) return ''
  const [s, c, r] = m, [w, h] = ISHEET[s]
  return `<i class="ico ${cls}${rad ? ' rad' : ''}" style="background-image:url(${iconUrl(s)});--w:${w};--h:${h};--c:${c};--r:${r}"></i>`
}

// 캔버스: (x, y) 가운데에 size 크기로
export function drawIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): boolean {
  const m = ICON[id], im = m && iconImgs.get(m[0])
  if (!m || !im?.complete || !im.naturalWidth) return false
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(im, m[1] * 16, m[2] * 16, 16, 16, x - size / 2, y - size / 2, size, size)
  return true
}

// 구역 바닥 타일 (Objects/Floor.png, 7×3 묶음의 가운데 칸)
const floorImg = new Image()
floorImg.src = `${import.meta.env.BASE_URL}sprites/dawnlike/Floor.png`
export const floorReady = () => floorImg.complete && floorImg.naturalWidth > 0
export { floorImg }

export const CREDITS = '캐릭터·UI 도트: DawnLike by DragonDePlatino (CC-BY 4.0) · 동방 도트: Ninja Adventure by Pixel-Boy (CC0) · 팔레트: DawnBringer · 글꼴: 갈무리 (OFL)'
