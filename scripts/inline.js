// vite build 결과의 JS·CSS를 index.html 안에 넣는다.
// 브라우저는 file:// 에서 <script type="module" src> 를 막으므로, 압축을 풀고 index.html 을 더블클릭해도 돌아가게 하려면 인라인이어야 한다.
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'

const dir = new URL('../dist/', import.meta.url)
let html = readFileSync(new URL('index.html', dir), 'utf8')
const assets = readdirSync(new URL('assets/', dir))
const used = new Set()
const read = (p) => { const f = p.replace(/^\.\//, ''); used.add(f.replace('assets/', '')); return readFileSync(new URL(f, dir), 'utf8') }

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) =>
  `<script type="module">${read(src).replaceAll('</script', '<\\/script')}</script>`)
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href) => `<style>${read(href)}</style>`)

const left = assets.filter(a => !used.has(a))
if (!used.size || left.length || /src="\.\/assets|href="\.\/assets/.test(html)) throw new Error(`인라인 못 한 파일: ${left.join(', ') || html.match(/"\.\/assets[^"]*"/)?.[0]}`)
writeFileSync(new URL('index.html', dir), html)
rmSync(new URL('assets/', dir), { recursive: true })
console.log(`인라인 완료: ${[...used].join(', ')} → dist/index.html ${(html.length / 1024).toFixed(0)}KB`)
