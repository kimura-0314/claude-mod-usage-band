// ㉒ 使用量の帯を、アプリを開き直さずに見るための試し描き。statusline.ts をそのまま使って HTML を書き出す
// 使い方: node --experimental-strip-types tools/preview-band.mjs → preview/band.html をブラウザで開く
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const m = await import(new URL('../hooks/statusline.ts', import.meta.url))

const now = Date.now()
const at = h => new Date(now + h * 3600_000).toISOString()
const cases = [
  ['ふだん', { percent: 15 }, [['five_hour', 18, 3], ['seven_day', 50, 130], ['seven_day_fable', 0, 130]], 1, false],
  ['使いすぎ気味', { percent: 72 }, [['five_hour', 88, 1], ['seven_day', 91, 20], ['seven_day_fable', 40, 20]], 5, true],
  ['開いた直後（数字なし）', null, [], 1, false],
]

// 帯の要素表をそのまま HTML に置き換える（デスクトップの見え方に近づけた簡易版。ボタンはアプリでは本物のボタンになる）
const C = 8
const html = e => {
  if (typeof e === 'string') return e
  if (!e) return ''
  const { k, children = [], ...p } = e
  if (k === 'Svg') return p.source
  if (k === 'Text') return `<span style="${p.bold ? 'font-weight:600;' : ''}${p.dimColor ? 'opacity:.55;' : ''}">${children.map(html).join('')}</span>`
  if (k === 'Button') return `<span class="btn">${p.label}</span>`
  return `<div style="display:flex;flex-direction:${p.flexDirection || 'row'};gap:${(p.columnGap || 0) * C}px ${(p.columnGap || 0) * C}px;row-gap:${(p.rowGap || 0) * 6}px;align-items:${p.alignItems || 'stretch'};${p.flexShrink === 0 ? 'flex-shrink:0;' : ''}line-height:1.6">${children.map(html).join('')}</div>`
}
const el = new Proxy({}, { get: (_, k) => p => ({ k, ...p }) })

const block = (theme) => cases.map(([name, ctx, ls, effort, override]) => {
  const ms = m.meters(ctx, ls.map(([kind, pct, h]) => ({ kind, percentUsed: pct, resetsAt: at(h) })), now)
  const controls = [el.Box({ flexDirection: 'row', columnGap: 1, children: [el.Button({ label: '◀' }), el.Button({ label: '▶' })] }), el.Text({ dimColor: true, children: [override ? 'アプリ設定に戻す' : 'アプリ設定'] })]
  return `<p class="cap">${name}</p><div class="band">${html(m.band(el, 'desktop', ms, { index: effort, isOverride: override, controls }))}</div><div class="input">返信を入力…</div>`
}).join('')

const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>使用量の帯 試し描き</title>
<style>
body{margin:0;font:13px system-ui,'Segoe UI','Yu Gothic UI',sans-serif;min-height:100vh}
section{padding:24px}
.light{background:#faf9f5;color:#1f1e1d}.dark{background:#1f1f1e;color:#e8e6e1}
.band{width:max-content;min-width:760px;padding:10px 14px;border-radius:14px;background:rgba(128,128,128,.12)}
.input{max-width:820px;margin:8px 0 24px;padding:12px 14px;border-radius:14px;border:1px solid rgba(128,128,128,.3);opacity:.6}
.cap{margin:0 0 6px;font-size:12px;opacity:.6}.btn{opacity:.6;cursor:default}
h1{font-size:14px;margin:0 0 16px;opacity:.7}
</style>
<section class="light"><h1>明るい画面</h1>${block()}</section><section class="dark"><h1>暗い画面</h1>${block()}</section></html>`
const out = fileURLToPath(new URL('../preview/band.html', import.meta.url))
writeFileSync(out, page)
console.log(out)
