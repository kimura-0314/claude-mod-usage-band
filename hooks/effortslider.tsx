// ㉒ effort のスライダー（帯の Client）。アプリ本体の effort 切り替え（高速〜高精度・点の目盛り・丸いつまみ）に見た目を合わせた。
// つまみを掴んで左右に動かすと段が変わり、離した所で決まる。この部品は $ を持たないので、決まった段は post で hooks 側（register.ts の ui.message）へ渡す
import type { ClientModule } from 'claude-code'

type Props = { index: number; isOverride: boolean; labels: string[] }
type State = { drag?: number; bound?: boolean }

// 掴んでいる間の段。正はこの変数で、setState は描き直しの合図にだけ使う（帯にスライダーは1つだけ）
let dragging: number | undefined

const ACCENT = '#8b7cf6'
const TRACK = '#9aa0a6'

const EffortSlider: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const n = props.labels.length
  // 両端の「高速」「高精度」と右の段名のぶんを引いた幅を、段の数で割る
  const side = 6
  const cols = Math.max(surface.columns - side * 2 - 12, n * 4)
  const seg = Math.floor(cols / n)
  const shown = dragging ?? props.index
  const at = (x: number) => Math.min(n - 1, Math.max(0, Math.floor((x - side) / seg)))

  if (!surface.state?.bound) {
    surface.onPointer(e => {
      const x = e.fine?.x ?? e.x
      if (e.type === 'down' || (e.type === 'move' && dragging !== undefined)) {
        const i = at(x)
        if (i !== dragging) { dragging = i; surface.setState({ bound: true, drag: i }) }
      } else if (e.type === 'up' && dragging !== undefined) {
        surface.post({ effortIndex: dragging })
        dragging = undefined
        surface.setState({ bound: true })
      }
    })
    surface.setState({ bound: true })
  }

  const active = props.isOverride || dragging !== undefined
  // 1段＝線の上の1点。今の段は丸いつまみ、手前は色の付いた線、先は灰色の線
  const cell = (i: number) => {
    const half = Math.max(1, Math.floor((seg - 1) / 2))
    const line = (len: number, on: boolean) => Text({ color: on ? ACCENT : TRACK, dimColor: !on, children: ['─'.repeat(len)] })
    const mark = i === shown
      ? Text({ bold: true, color: active ? ACCENT : undefined, children: ['⬤'] })
      : Text({ color: i < shown ? ACCENT : TRACK, dimColor: i > shown, children: ['•'] })
    return Box({ key: `s${i}`, width: seg, flexDirection: 'row', children: [line(half, i <= shown && i > 0), mark, line(seg - half - 1, i < shown)] })
  }

  return Box({
    flexDirection: 'row',
    alignItems: 'center',
    children: [
      Box({ width: side, children: [Text({ dimColor: true, children: ['高速'] })] }),
      ...props.labels.map((_, i) => cell(i)),
      Box({ width: side + 2, children: [Text({ dimColor: true, children: [' 高精度'] })] }),
      Text({ bold: true, color: active ? ACCENT : undefined, children: [props.labels[shown] ?? ''] }),
    ],
  })
}

export default EffortSlider
