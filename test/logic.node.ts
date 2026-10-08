// 数字の組み立て（純粋関数）。node --test --experimental-strip-types test/logic.node.ts（claude plugin test とは別に走らせる）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { meters, parseGetUsage, mergeLimits, left, labelOf } from '../hooks/statusline.ts'

test('get_usage の答えから 5h・7d・モデル別の週枠を取り出す', () => {
  const res = { type: 'control_response', response: { response: { rate_limits: { limits: [
    { kind: 'session', percent: 12, resets_at: '2026-10-08T05:00:00Z' },
    { kind: 'weekly_all', percent: 40 },
    { kind: 'weekly_scoped', percent: 7, scope: { model: { display_name: 'Fable' } } },
  ] } } } }
  const got = parseGetUsage(`noise\n${JSON.stringify(res)}\n`)
  assert.deepEqual(got.map(l => [l.kind, l.percentUsed]), [['five_hour', 12], ['seven_day', 40], ['seven_day_fable', 7]])
  assert.equal(labelOf('seven_day_fable'), '7d Fable')
})

test('数字が届く前は 5h・7d の枠だけ「—」で並ぶ', () => {
  const ms = meters(null, [], 0)
  assert.deepEqual(ms.map(m => [m.key, m.pct]), [['ctx', '—'], ['five_hour', '—'], ['seven_day', '—']])
})

test('リセット時刻を過ぎた枠は 0% に戻る・残り時間の書き方', () => {
  const now = Date.UTC(2026, 9, 8, 0, 0)
  const ms = meters({ percent: 30 }, [{ kind: 'five_hour', percentUsed: 80, resetsAt: '2026-10-07T23:00:00Z' }], now)
  assert.equal(ms.find(m => m.key === 'five_hour')?.pct, '0%')
  assert.equal(left(3 * 3600_000), '3h00m')
  assert.equal(left((5 * 24 + 10) * 3600_000), '5d10h')
})

test('毎ターンの 5h・7d で、モデル別の週枠を消さない', () => {
  const merged = mergeLimits([{ kind: 'seven_day_fable', percentUsed: 5 }, { kind: 'five_hour', percentUsed: 1 }], [{ kind: 'five_hour', percentUsed: 2 }])
  assert.deepEqual(merged.map(l => [l.kind, l.percentUsed]), [['seven_day_fable', 5], ['five_hour', 2]])
})
