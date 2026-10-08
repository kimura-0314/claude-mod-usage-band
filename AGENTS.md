# AGENTS.md
Claude Code の Mod（Function Hooks）プラグイン `usage-band`。kimura-assist の ㉒ 使用量メーターだけを、他の人が入れられる雛形として切り出したもの（2026-10-08・X の「雛形の公開、見たいです」というリプから）。

- `hooks/statusline.ts`＝純粋関数（meters・meterSvg・effortSvg・band・parseGetUsage・mergeLimits）。kimura-assist の同名ファイルと中身はほぼ同じ（コメントの個人的な経緯を外し、7d Fable の空枠を出さないようにした）
- `hooks/register.ts`＝session.start／prompt.submit／session.measure／ui.render(AbovePrompt)／turn.step／ui.message の6本。kimura-assist から外したもの＝crab-stage の描き直し停止（crab-stage-busy）・やることボタン・%TEMP% への設定/枠のダンプ
- モデル別の週枠は `claude -p` に get_usage を聞く。子では `USAGE_BAND_CHILD` を立てて止める（kimura-assist の子は `KIMURA_ASSIST_USAGE_CHILD`。env は親に重ねる形なので、両方入れても孫は2つとも立って止まる＝無限には増えない）
- 🔴 kimura の環境では kimura-assist ㉒ と同時に有効にすると帯が2本になる。手元で試す時は `claude --plugin-dir <このフォルダ>` のセッションだけにするか、㉒を止める
- 確認＝`claude plugin validate <フォルダ>`／`claude plugin test <フォルダ>`（test/band.test.ts）／`node --test --experimental-strip-types test/logic.node.ts`／`npx -p typescript tsc -p . --noEmit`（型は一度読み込まれた後に `.claude-plugin/types/` へエンジンが書く・git には入れない）
- 見た目＝`node --experimental-strip-types tools/preview-band.mjs` → `preview/band.html`。README の `docs-band.png` はこれをヘッドレス Chrome で撮ったもの
- `$` を受け取る関数は `$: EngineInterface` で型を付ける。`$.env.get` の引数は文字列リテラルでないと読み込みで落ちる
- 🚫 public 化・X 告知・note 公開は kimura の明示（「public にして」「投稿して」）まで撃たない
