// 入力欄の上の使用量メーター（ctx・5h・7d・モデル別の週枠・effort）
// デスクトップは AbovePrompt の帯に Svg の絵で描く（$.ui.status はデスクトップに出ない）。ターミナルは文字の棒
// 色は「窓の経過に対して使いすぎていないか」で決める。棒の上の縦線が今の経過位置
type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Meter = { key: string; label: string; used?: number; elapsed?: number; pct: string; reset?: string }

const HOUR = 3_600_000
// 窓の長さは kind の頭で決まる（seven_day_xxx のようなモデル別の枠も同じ長さ）
const windowOf = (kind: string) =>
  kind.startsWith('five_hour') ? { ms: 5 * HOUR, withDate: false, head: '5h' }
  : kind.startsWith('seven_day') ? { ms: 7 * 24 * HOUR, withDate: true, head: '7d' }
  : undefined
const ORDER = (kind: string) => (kind === 'five_hour' ? 0 : kind === 'seven_day' ? 1 : 2)

// seven_day → 7d ／ seven_day_fable → 7d Fable ／ 知らない枠は kind をそのまま
export function labelOf(kind: string) {
  const w = windowOf(kind)
  if (!w) return kind === 'spend_limit' ? '$' : kind
  const rest = kind.replace(/^(five_hour|seven_day)_?/, '')
  return rest ? `${w.head} ${rest.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}` : w.head
}

// 色は参考（@kirillvserditov の進捗バー Mod）に寄せた：順調＝紫、ペース速め＝琥珀、危ない＝赤
const COLOR = { ok: '#8b7cf6', warn: '#e0a030', bad: '#e5534b', track: 'rgba(128,128,128,0.16)', tick: 'rgba(128,128,128,0.45)', marker: '#9aa0a6' }
// 2枠を1行に並べるので、棒は半分の長さ
const BAR = { width: 230, height: 18 }

export function jst(ms: number, withDate: boolean) {
  const d = new Date(ms + 9 * HOUR)
  const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  return withDate ? `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hm}` : hm
}

const clamp = (p: number) => Math.min(Math.max(p, 0), 100)

// リセットまでの残り（2h40m ／ 1d7h ／ 35m）。時刻より「あとどれだけ」が一目で分かる（@thegenioo の帯を参考・2026-10-03）
export function left(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60
  return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${String(mm).padStart(2, '0')}m` : `${mm}m`
}

export function meters(context: { percent?: number } | null, limits: readonly Limit[], now: number): Meter[] {
  const out: Meter[] = [{ key: 'ctx', label: 'ctx', used: context?.percent, pct: context?.percent === undefined ? '—' : `${Math.round(context.percent)}%` }]
  // 5h・7d は数字が届く前から枠だけ出す。モデル別の週枠（7d Fable など）は get_usage が返した時だけ並ぶ
  const kinds = new Set(['five_hour', 'seven_day', ...limits.map(l => l.kind)])
  for (const kind of [...kinds].sort((a, b) => ORDER(a) - ORDER(b))) {
    const w = windowOf(kind)
    const l = limits.find(x => x.kind === kind)
    const base = { key: kind, label: labelOf(kind) }
    if (!l) { out.push({ ...base, pct: '—' }); continue }
    const reset = l.resetsAt ? Date.parse(l.resetsAt) : undefined
    // 前回の読み取りの後に窓が切り替わっていたら 0 から
    if (reset !== undefined && reset <= now) { out.push({ ...base, used: 0, elapsed: 0, pct: '0%' }); continue }
    const elapsed = w && reset !== undefined ? clamp(100 - ((reset - now) / w.ms) * 100) : undefined
    out.push({ ...base, used: l.percentUsed, elapsed, pct: `${Math.round(l.percentUsed)}%`, reset: reset ? left(reset - now) : undefined })
  }
  return out
}

function tone(used: number, elapsed?: number): keyof typeof COLOR {
  if (used >= 90) return 'bad'
  if (elapsed === undefined) return used >= 80 ? 'bad' : used >= 50 ? 'warn' : 'ok'
  const margin = elapsed - used
  if (margin < -15) return 'bad'
  if (margin < 10 && used >= 10) return 'warn'
  return 'ok'
}

function textBar(m: Meter) {
  const n = Math.round((clamp(m.used ?? 0) / 100) * 8)
  return '▰'.repeat(n) + '▱'.repeat(8 - n)
}

export const EFFORT_LABELS = ['低', '中', '高', '超', '最大', 'Ultracode']

// デスクトップ用の effort スライダーの絵（アプリ本体の切り替えに寄せた：灰色の溝・点の目盛り・白い丸つまみ）。
// デスクトップは掴んで動かす部品（Client）の読み込みを止めるので、動かすのは横の ◀ ▶ で行う
export function effortSlider(index: number, isOverride: boolean, n = EFFORT_LABELS.length) {
  const w = 300, h = 22, pad = 11, y = h / 2
  const step = (w - pad * 2) / (n - 1)
  const x = (i: number) => pad + i * step
  const accent = isOverride ? COLOR.ok : 'rgba(139,124,246,0.6)'
  const p = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect x="0" y="${y - 7}" width="${w}" height="14" rx="7" fill="rgba(128,128,128,0.18)"/>`,
    `<rect x="0" y="${y - 7}" width="${x(index) + 7}" height="14" rx="7" fill="${accent}"/>`,
  ]
  for (let i = 0; i < n; i++) if (i !== index) p.push(`<circle cx="${x(i).toFixed(1)}" cy="${y}" r="1.8" fill="${i < index ? '#ffffff' : 'rgba(128,128,128,0.6)'}"/>`)
  p.push(`<circle cx="${x(index).toFixed(1)}" cy="${y}" r="9" fill="#ffffff" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>`)
  p.push('</svg>')
  return p.join('')
}


// 1枠＝1枚の絵。見出し・細い棒・%・残り時間の位置を絵の中で固定し、折り返しと幅のばらつきを無くす
// 1枠ごとに細い枠線で囲む。PAD は枠の内側の余白
// 2行に収める＝1行目 ctx・5h・7d、2行目 モデル別の週枠（7d Fable など）・effort。3枠で1行なので幅は 240
const CELL = { width: 240, height: 28, labelW: 46, numW: 34, resetW: 44 }
const PAD = 10
const frame = (w: number, h: number) => `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" fill="rgba(128,128,128,0.04)" stroke="rgba(128,128,128,0.32)" stroke-width="1"/>`
const FONT = "ui-sans-serif,system-ui,'Segoe UI','Yu Gothic UI',sans-serif"
const INK = '#6b6f78'
// 7d Fable は枠に入らないので FABLE だけ
// 枠の名前は本体の答えから来るので、SVG に入れる前に < > & をつぶす
const short = (label: string) => (/^7d \w/i.test(label) ? label.slice(3) : label).toUpperCase().replace(/[<>&"]/g, '')
export function meterSvg(m: Meter) {
  const { width: w, height: h, labelW, numW, resetW } = CELL
  const L = PAD, R = w - PAD
  const x0 = L + labelW, x1 = R - numW - resetW - 6
  const y = h / 2, bh = 6
  const used = clamp(m.used ?? 0)
  const color = COLOR[m.used === undefined ? 'ok' : tone(used, m.elapsed)]
  const fill = Math.round(((x1 - x0) * used) / 100)
  const p = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    frame(w, h),
    `<text x="${L}" y="${y}" dominant-baseline="central" font-family="${FONT}" font-size="10.5" font-weight="600" letter-spacing="0.4" fill="${INK}">${short(m.label)}</text>`,
    `<rect x="${x0}" y="${y - bh / 2}" width="${x1 - x0}" height="${bh}" rx="${bh / 2}" fill="${COLOR.track}"/>`,
  ]
  if (fill > 0) p.push(`<rect x="${x0}" y="${y - bh / 2}" width="${Math.max(fill, bh)}" height="${bh}" rx="${bh / 2}" fill="${color}"/>`)
  if (m.elapsed !== undefined) p.push(`<rect x="${(x0 + ((x1 - x0) * m.elapsed) / 100 - 1).toFixed(1)}" y="${y - 6}" width="2" height="12" rx="1" fill="${INK}" opacity="0.55"/>`)
  p.push(`<text x="${x1 + 6 + numW}" y="${y}" text-anchor="end" dominant-baseline="central" font-family="${FONT}" font-size="11.5" font-weight="650" fill="${m.used === undefined ? INK : color}" style="font-variant-numeric:tabular-nums">${m.pct}</text>`)
  if (m.reset) p.push(`<text x="${R}" y="${y}" text-anchor="end" dominant-baseline="central" font-family="${FONT}" font-size="10.5" fill="${INK}" opacity="0.8" style="font-variant-numeric:tabular-nums">${m.reset}</text>`)
  p.push('</svg>')
  return p.join('')
}

// effort の枠も同じ幅・同じ見出し位置で描く（溝・点の目盛り・白い丸つまみ・右に段の名前）
export function effortSvg(index: number, isOverride: boolean, n = EFFORT_LABELS.length) {
  const { width: w, height: h, labelW } = CELL
  const L = PAD, R = w - PAD
  // 段名は「Ultracode」まで入るよう右に 62 空ける
  const x0 = L + labelW, x1 = R - 62, y = h / 2, bh = 6, knob = 6
  const at = (i: number) => x0 + knob + ((x1 - x0 - knob * 2) * i) / (n - 1)
  const accent = isOverride ? COLOR.ok : 'rgba(139,124,246,0.6)'
  const p = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    frame(w, h),
    `<text x="${L}" y="${y}" dominant-baseline="central" font-family="${FONT}" font-size="10.5" font-weight="600" letter-spacing="0.4" fill="${INK}">EFFORT</text>`,
    `<rect x="${x0}" y="${y - bh / 2}" width="${x1 - x0}" height="${bh}" rx="${bh / 2}" fill="${COLOR.track}"/>`,
    `<rect x="${x0}" y="${y - bh / 2}" width="${(at(index) - x0).toFixed(1)}" height="${bh}" rx="${bh / 2}" fill="${accent}"/>`,
  ]
  for (let i = 0; i < n; i++) if (i !== index) p.push(`<circle cx="${at(i).toFixed(1)}" cy="${y}" r="1.5" fill="${i < index ? '#ffffff' : INK}" opacity="${i < index ? 1 : 0.5}"/>`)
  p.push(`<circle cx="${at(index).toFixed(1)}" cy="${y}" r="${knob}" fill="#ffffff" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>`)
  p.push(`<text x="${R}" y="${y}" text-anchor="end" dominant-baseline="central" font-family="${FONT}" font-size="11.5" font-weight="650" fill="${isOverride ? COLOR.ok : INK}">${EFFORT_LABELS[index] ?? ''}</text>`)
  p.push('</svg>')
  return p.join('')
}

// 1行＝見出し（固定幅）＋棒＋右の添え字。見出しの幅をそろえて棒の左端を一直線にする
function row(el: any, key: string, label: string, graphic: any, tail: any[]) {
  return el.Box({
    key,
    flexDirection: 'row',
    columnGap: 2,
    alignItems: 'center',
    children: [el.Box({ width: 9, children: [el.Text({ bold: true, children: [label] })] }), graphic, ...tail],
  })
}

// 描画用の要素表（$.ui.resolve の戻り）を受け取って帯を組む。ctx・各枠・effort を同じ形の行で縦に並べる
export function band(el: any, surface: string, ms: Meter[], effort?: { index: number; isOverride: boolean; controls: any[]; slider?: any }) {
  const rows: any[] = []
  if (surface === 'desktop') {
    const cell = (key: string, source: string, alt: string) =>
      el.Box({ key, flexShrink: 0, children: [el.Svg({ source, alt, width: CELL.width, height: CELL.height })] })
    // 1行目＝ctx・5h・7d、2行目＝残りの枠（7d Fable）と effort。どの枠も同じ幅で縮ませない＝列がそろう
    const cells = ms.map(m => cell(`meter-${m.key}`, meterSvg(m), `${m.label} ${m.pct}`))
    // 横のペインを開いて幅が足りない時は枠ごと次の行へ回す（右端が切れないように）
    rows.push(el.Box({ key: 'row-1', flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, rowGap: 1, children: cells.slice(0, 3) }))
    const rest = cells.slice(3)
    if (effort) rest.push(cell('effort-cell', effortSvg(effort.index, effort.isOverride), `effort ${EFFORT_LABELS[effort.index] ?? ''}`), ...effort.controls)
    if (rest.length) rows.push(el.Box({ key: 'row-2', flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, rowGap: 1, alignItems: 'center', children: rest }))
  } else {
    for (const m of ms) rows.push(row(el, `meter-${m.key}`, m.label, el.Text({ dimColor: true, children: [`${textBar(m)} ${m.pct}`] }), [el.Text({ dimColor: true, children: [m.reset ? `残り ${m.reset}` : ''] })]))
    if (effort) rows.push(row(el, 'meter-effort', 'effort', effort.slider ?? el.Text({ children: [EFFORT_LABELS[effort.index] ?? '—'] }), effort.controls))
  }
  // 背景は塗らない（灰色の枠はアプリ側のもの）
  return el.Box({ flexDirection: 'column', rowGap: 1, children: rows })
}

// Claude Code 本体に使用量を聞いた答え（control_request get_usage・/usage と同じ中身）から枠を取り出す。
// モデル別の週枠（Fable など）はここにしか無い。モデルは呼ばれないので課金なし
export function parseGetUsage(stdout: string): Limit[] {
  const line = stdout.split('\n').find(l => l.includes('"control_response"'))
  if (!line) return []
  const res = JSON.parse(line)?.response?.response
  const out: Limit[] = []
  for (const l of res?.rate_limits?.limits ?? res?.limits ?? []) {
    const kind = l.kind === 'session' ? 'five_hour'
      : l.kind === 'weekly_all' ? 'seven_day'
      : l.kind === 'weekly_scoped' && l.scope?.model?.display_name ? `seven_day_${String(l.scope.model.display_name).toLowerCase()}`
      : undefined
    if (kind && typeof l.percent === 'number') out.push({ kind, percentUsed: l.percent, resetsAt: l.resets_at ?? undefined })
  }
  return out
}

// 新しく届いた枠で同じ名前のものだけ差し替える（毎ターンの数字は 5h・7d だけなので、Fable 枠を消さない）
export function mergeLimits(old: readonly Limit[], fresh: readonly Limit[]): Limit[] {
  const kinds = new Set(fresh.map(l => l.kind))
  return [...old.filter(l => !kinds.has(l.kind)), ...fresh]
}
