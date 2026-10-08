# Security Review: usage-band（2026-10-08・公開前）

判定: PASS
配布BLOCKER: 0件

## 対象と脅威モデル
- 対象: git 管理の15ファイル全部（hooks 3本・hooks.json・manifest 2本・test 2本・tools 1本・README/AGENTS/tsconfig/.gitattributes/.gitignore・docs-band.png）
- 配布形態: GitHub リポジトリを marketplace として `/plugin install`。利用者の Claude Code の中で、利用者の権限で動く
- 守るもの: 利用者の認証情報・設定・端末／作者（kimura）の個人情報
- 主な入口: Claude Code 本体が渡す数字（session.usage・session.measure・get_usage の答え）、帯のボタン、ターミナルのつまみ（ui.message）
- 未確認範囲: なし（外部ネットワーク・利用者入力の文字列を扱う経路が無い）

## Findings
### NOTE 子プロセスの失敗理由（stderr 先頭200字）を一時フォルダのログに1行残す
- 証拠: `hooks/register.ts`（fetchUsage の log）
- 影響: 自分の端末の自分の一時フォルダだけ。上書き1行で溜まらない
### NOTE（直した）枠の名前を SVG にそのまま入れていた
- 証拠: `hooks/statusline.ts` の `short()`。出どころは Claude Code 本体の get_usage の答えで、外部の人は書けない。念のため `<>&"` を除くようにした
### NOTE（直した）AGENTS.md に第三者の X アカウント名
- 公開前に「X のリプから」に言い換えた

## 確認したチェック
- 秘密情報: token・API キー・個人パス・メールアドレスなし（`git grep`）。コミットは noreply アドレス。PNG にテキスト/EXIF チャンクなし
- コマンド実行: `$.process.run` は固定の引数配列で `claude` を起動するだけ。利用者・外部の文字列は混ざらない。timeout 60秒
- 設定の変更: `$.config.set('ultracode')` は帯のボタンを押した時だけ。失敗はトーストで見せる
- 保存: `$.store` は使用率と時刻だけ（プラグイン専用の保存場所）
- 外部送信・ネットワーク: なし。依存パッケージなし（lockfile 不要）
- ui.message: `effort-slider` の数値だけを受け取り、範囲外は無視
- 対象外（該当なし）: 認証・CORS・CSRF・Webhook・ファイル読み込み・AI 出力の流用

## ゲート結論
- BLOCKER: なし（反証にかける候補なし）
- 配布条件: なし
- 次の工程: public 化と告知は kimura の明示待ち
