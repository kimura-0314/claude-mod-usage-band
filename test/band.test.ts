// 入力欄の上の帯に ctx・5h・7d が出るか（ターミナル・デスクトップの両方）
import { test, expect } from 'claude-code/testing'

test('使用量の帯', { timeoutMs: 30000 }, async ($, on) => {
  const v = (value: unknown) => async () => ({ value })
  const now = Date.UTC(2026, 9, 2, 18, 0)
  on('clock.now', v(now))
  on('session.usage', v({ context: { percent: 20 }, rateLimits: [
    { kind: 'five_hour', percentUsed: 17, resetsAt: '2026-10-02T22:00:00.000Z' },
    { kind: 'seven_day', percentUsed: 56, resetsAt: '2026-10-08T00:00:00.000Z' },
  ] }))
  // get_usage の子プロセスは呼ばせない（子の印を立てておく）
  on('env.get', async ($: any, e: any) => ({ value: e.name === 'USAGE_BAND_CHILD' ? '1' : undefined }) as any)
  on('session.measure', async ($: any, e: any) => ({ changed: e.changed ?? [] }) as any)
  on('ui.render', async ($: any, e: any) => $.ui.resolve(e).Text({ children: ['base'] }))
  for (const ev of ['ui.open', 'session.id', 'store.get', 'store.set', 'store.delete', 'fs.read', 'fs.write', 'process.run'] as const) on(ev as any, v(undefined))
  // 数字は session.measure で届く。%が動いていない（changed に無い）時でも、まだ持っていなければ受け取る
  await $.session.measure({ context: { percent: 20 }, changed: [], rateLimits: [
    { kind: 'five_hour', percentUsed: 17, resetsAt: '2026-10-02T22:00:00.000Z' },
    { kind: 'seven_day', percentUsed: 56, resetsAt: '2026-10-08T00:00:00.000Z' },
  ] } as any)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props: {} } as any)
    // ターミナルは文字、デスクトップは絵（alt に「5h 17%」）
    const texts = [...await ui.findAll({ type: 'Text' }), ...await ui.findAll({ type: 'Svg' })].map((t: any) => JSON.stringify(t.props?.alt ?? t.props?.children ?? t.text ?? t))
    expect(texts.join(' ')).toMatch(/17%/)
    expect(texts.join(' ')).toMatch(/56%/)
    await ui.unmount()
  }
})
