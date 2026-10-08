// usage-band: 入力欄の上に使用量メーター（ctx・5h・7d・モデル別の週枠）と effort の切り替えを出す
import type { Register, EngineInterface } from 'claude-code'
import { meters, band, parseGetUsage, mergeLimits } from './statusline.ts'

// 最新の数字を持っておき、帯を描き直させる
const usage: { context: { percent?: number } | null; limits: any[] } = { context: null, limits: [] }
// $.store に置く形（前回取れた枠と取った時刻）
type Saved = { at?: number; limits?: any[] } | undefined

// TEMP（Windows）か TMPDIR の下に、取れなかった理由だけ残す
async function logPath($: EngineInterface) {
  const tmp = ((await $.env.get('TEMP')) ?? (await $.env.get('TMPDIR')) ?? '').replaceAll(String.fromCharCode(92), '/').replace(/\/$/, '')
  return tmp ? `${tmp}/usage-band.log` : ''
}

// モデル別の週枠（Fable など）は $.session.usage() に無いので、Claude Code 本体に /usage と同じ中身を聞く（約6秒・課金なし）。
// 子の claude もこの Mod を読み込むので、子では聞かない（印の環境変数 USAGE_BAND_CHILD で止める）
let fetching = false
async function fetchUsage($: EngineInterface) {
  if (fetching || (await $.env.get('USAGE_BAND_CHILD'))) return
  // セッションを何本開いていても聞くのは1本だけ＝4分以内に誰かが取っていれば、それを使う
  const last = (await $.store.get('meter:fetched').catch(() => undefined)) as Saved
  if (typeof last?.at === 'number' && (await $.clock.now()) - last.at < 4 * 60_000 && Array.isArray(last?.limits)) {
    usage.limits = mergeLimits(usage.limits, last!.limits!)
    $.ui.invalidate('ui.render')
    return
  }
  fetching = true
  const path = await logPath($)
  const log = (msg: string) => path ? $.fs.write(path, `${new Date().toISOString().slice(0, 19)}Z ${msg}` + String.fromCharCode(10)).catch(() => {}) : undefined
  try {
    const r = await $.process.run(
      ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--settings', '{"hooks":{}}'],
      { stdin: '{"type":"control_request","request_id":"1","request":{"subtype":"get_usage"}}' + String.fromCharCode(10), env: { USAGE_BAND_CHILD: '1' }, timeoutMs: 60_000 },
    )
    const limits = parseGetUsage(r.stdout)
    if (!limits.length) await log(`exit=${r.exitCode} no limits; stderr=${r.stderr.slice(0, 200).replace(/\s+/g, ' ')}`)
    if (limits.length) {
      usage.limits = mergeLimits(usage.limits, limits)
      const at = await $.clock.now()
      await $.store.set('meter:fetched', { at, limits }).catch(() => {})
      await $.store.set('meter:limits', { at, limits: usage.limits }).catch(() => {})
      $.ui.invalidate('ui.render')
    }
  } catch (err) {
    await log(`failed: ${String(err).slice(0, 200)}`)
  } finally {
    fetching = false
  }
}

// 帯から選んだ effort。level が undefined の間はアプリの設定のまま
const EFFORTS = [['low', '低'], ['medium', '中'], ['high', '高'], ['xhigh', '超'], ['max', '最大'], ['ultra', 'Ultracode']] as const
// ultra＝effort は最大のまま、アプリの ultracode 設定を入れる。ultracode は effort の段ではなく別の設定なので、ここだけ $.config で切り替える
// last＝アプリ側の値（表示用）／sent＝本体の送信に実際に当てた段（アプリ下の表示は Mod から変えられないので、効いた証拠は帯に出す）
const effortPick: { level?: string; last?: string; ultra?: boolean; fromStep?: boolean; sent?: string } = {}
const labelOf = (level: string) => EFFORTS.find(([l]) => l === level)?.[1] ?? level
async function setUltra($: EngineInterface, on: boolean) {
  const r = await $.config.set({ key: 'ultracode', value: on }).catch((err: unknown) => ({ deny: String(err) }))
  if (r?.deny) {
    $.ui.toast(`ultracode を切り替えられなかった: ${String(r.deny).slice(0, 80)}`)
    return false
  }
  effortPick.ultra = on
  return true
}
// 段を決める（スライダーを離した時・◀ ▶ を押した時）
async function applyEffort($: EngineInterface, i: number) {
  const level = EFFORTS[i]![0]
  if (level === 'ultra') {
    if (await setUltra($, true)) effortPick.level = 'ultra'
  } else {
    if (effortPick.ultra) await setUltra($, false)
    effortPick.level = level
  }
  effortPick.sent = undefined
  $.ui.invalidate('ui.render')
}
// アプリ側の今の設定（ultracode と effort）を読む。開いた直後に決め打ちするとアプリとずれるため
async function readAppEffort($: EngineInterface) {
  const rows = await $.config.list().catch(() => [])
  const ultra = rows.find(r => r.key === 'ultracode')
  if (ultra) effortPick.ultra = ultra.value === true
  const v = String(rows.find(r => /effort/i.test(String(r.key)))?.value ?? '').toLowerCase()
  // 実際に送った値（turn.step）が届いた後はそちらを正にする。設定の行は全体の既定で、この会話の値とは限らない
  if (!effortPick.fromStep && EFFORTS.some(([level]) => level === v)) effortPick.last = v
}

let usageTimer: { cancel(): void } | undefined
let tickTimer: { cancel(): void } | undefined
async function start($: EngineInterface) {
  const u = await $.session.usage()
  usage.context = u.context
  if (u.rateLimits.length) usage.limits = mergeLimits(usage.limits, u.rateLimits)
  // 開いた直後は制限の数字がまだ届かない（最初の返事の後に来る）ので、前に見た値を先に出す（制限はアカウント単位）
  else {
    const last = (await $.store.get('meter:limits').catch(() => undefined)) as Saved
    if (Array.isArray(last?.limits)) usage.limits = last!.limits!
  }
  $.ui.invalidate('ui.render')
  void readAppEffort($).then(() => $.ui.invalidate('ui.render')).catch(() => {})
  // モデル別の週枠は開いた時と5分おきに取り直す
  void fetchUsage($).catch(() => {})
  usageTimer?.cancel()
  usageTimer = $.clock.every(5 * 60_000, () => void fetchUsage($).catch(() => {}))
  // 経過位置の縦線とリセット後の 0% は時間で動くので、何もしていない間も1分ごとに描き直す
  tickTimer?.cancel()
  tickTimer = $.clock.every(60_000, () => void refreshNumbers($).catch(() => {}))
}
// 今の ctx と 5h/7d を本体に聞き直して帯を描き直す（モデル別の週枠は fetchUsage の担当）
async function refreshNumbers($: EngineInterface) {
  const u = await $.session.usage()
  usage.context = u.context
  if (u.rateLimits.length) usage.limits = mergeLimits(usage.limits, u.rateLimits)
  $.ui.invalidate('ui.render')
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    void start($).catch(() => {})
    return next(e)
  })
  // アプリ側で effort を切り替えた時に帯が追いつくよう、送るたびに読み直す
  on('prompt.submit', async ($, e, next) => {
    void readAppEffort($).then(() => $.ui.invalidate('ui.render')).catch(() => {})
    return next(e)
  })
  // 毎ターンの後と、制限の%が動いた時に数字が届く
  on('session.measure', async ($, e, next) => {
    usage.context = e.context
    // 変わった時だけでなく、まだ1つも持っていない時も受け取る（開いた後に%が動かないと 5h/7d が空のままになる）
    const noneYet = !usage.limits.some((l) => l.kind === 'five_hour' || l.kind === 'seven_day')
    if (e.changed.includes('rateLimits') || (noneYet && e.rateLimits.length)) {
      usage.limits = mergeLimits(usage.limits, e.rateLimits)
      if (e.rateLimits.length) await $.store.set('meter:limits', { at: await $.clock.now(), limits: usage.limits }).catch(() => {})
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // アンケートが出ている間は場所を譲る
    if ((e.props as any)?.hasSurvey) return next(e)
    const ms = meters(usage.context, usage.limits, await $.clock.now())
    const el = $.ui.resolve(e) as any
    const current = effortPick.ultra ? 'ultra' : effortPick.level ?? effortPick.last ?? 'medium'
    const index = Math.max(0, EFFORTS.findIndex(([level]) => level === current))
    const isOverride = !!effortPick.level || !!effortPick.ultra
    const controls: any[] = [
      ...(isOverride
        ? [el.Text({ key: 'effort-sent', color: effortPick.sent ? '#8b7cf6' : undefined, bold: !!effortPick.sent, dimColor: !effortPick.sent, children: [effortPick.sent ? `✓ ${labelOf(effortPick.sent)}で送信中` : `次の送信から${labelOf(effortPick.level ?? 'ultra')}`] })]
        : []),
      isOverride
        ? el.Button({ key: 'effort-reset', label: `アプリ設定（${labelOf(effortPick.last ?? 'medium')}）に戻す`, plain: true, dimColor: true, onPress: async () => { effortPick.level = undefined; effortPick.sent = undefined; if (effortPick.ultra) await setUltra($, false); $.ui.invalidate('ui.render') } })
        : el.Text({ dimColor: true, children: ['アプリ設定'] }),
    ]
    // ターミナルは掴んで動かす部品（Client）。デスクトップはこの部品を読み込まないので、帯の絵＋◀ ▶
    const slider = e.surface === 'terminal'
      ? el.Client({ key: 'effort-slider', module: './effortslider.tsx', width: 78, height: 1, props: { index, isOverride, labels: EFFORTS.map(([, label]) => label) } })
      : undefined
    if (e.surface === 'desktop') controls.unshift(el.Box({ key: 'effort-steps', flexDirection: 'row', columnGap: 1, children: [
      el.Button({ key: 'effort-left', label: '◀', plain: true, dimColor: true, onPress: () => applyEffort($, Math.max(0, index - 1)) }),
      el.Button({ key: 'effort-right', label: '▶', plain: true, dimColor: true, onPress: () => applyEffort($, Math.min(EFFORTS.length - 1, index + 1)) }),
    ] }))
    const line = band(el, e.surface, ms, { index, isOverride, controls, slider })
    // 他のプラグインの帯は下に重ねる
    const rest = await next(e)
    return rest ? el.Box({ flexDirection: 'column', children: [line, rest] }) : line
  })
  // 帯で選んだ effort を本体の会話の送信にだけ当てる（サブエージェントは触らない）
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    if (effortPick.level) {
      const r = yield* next({ ...e, effort: (effortPick.level === 'ultra' ? 'max' : effortPick.level) as any })
      if (effortPick.sent !== effortPick.level) { effortPick.sent = effortPick.level; $.ui.invalidate('ui.render') }
      void refreshNumbers($).catch(() => {})
      return r
    }
    if (typeof e.effort === 'string') { effortPick.fromStep = true; if (e.effort !== effortPick.last) { effortPick.last = e.effort; $.ui.invalidate('ui.render') } }
    const r = yield* next(e)
    // session.measure はターンの終わりにしか来ないので、応答1回ごとに ctx と 5h/7d を取り直す
    void refreshNumbers($).catch(() => {})
    return r
  })
  // ターミナルのスライダー（effortslider.tsx）で離した段を受け取る
  on('ui.message', async ($, e, next) => {
    if (e.element !== 'effort-slider') return next(e)
    const i = (e.data as any)?.effortIndex
    if (typeof i === 'number' && i >= 0 && i < EFFORTS.length) await applyEffort($, i)
    return {}
  })
}
