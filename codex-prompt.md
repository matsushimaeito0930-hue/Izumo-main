# Codexに渡すプロンプト

以下をそのままコピーして貼ってください。

---

あなたはこのリポジトリ（HackVerse）の開発を引き継ぎます。日本語で応答してください。

## プロジェクト概要

ハッカソン運営向けのリアルタイムダッシュボード。GitHubにpushすると、Webhook経由でチームのスコアとランキングが自動更新される。詰まったら質問掲示板に書けば、参加者なら誰でも回答できる。

- Next.js 14 App Router / TypeScript / Tailwind CSS
- Supabase Postgres + Realtime（未設定時はメモリ上のシードデータで動作）
- GitHub Webhooks（署名検証あり）
- GitHub OAuth（自前実装、httpOnly cookie + HMAC署名）

詳しい仕様は `README.md`、デザイン方針は `design.md`、デプロイ手順は `DEPLOY.md` にある。**着手前に3つとも読むこと。**

## 直近で行われた変更

- 3Dメタバース（Plaza）を廃止し、コードごと削除
- UIを白ベージュ基調のライトテーマ + Soft UI に全面刷新
- UI文言をすべて日本語化
- GitHub OAuthログインを実装（`lib/github-auth.ts`、`app/api/auth/**`）
- GitHubログイン後に登録済みのチーム名を選んで参加する導線を実装（招待コードAPIは互換用に維持）
- 相談ボードを質問掲示板に作り替え（回答 + ベストアンサー採用、`help_replies` テーブル追加）
- メンター相談をチームごとのスレッドに変更、チーム内チャットは廃止
- 画面を2つ（`/dashboard`、`/help`）に集約し、`/home` と `/ranking` を削除

## 最優先タスク

**1. `npm run build` を通す**

変更を加えたら本番ビルドまで通し、型エラーやビルドエラーが出たら修正すること。

```bash
npm install
npm run verify:core   # 依存パッケージ無しで動く37項目の検証
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm run test` は `tests/github.test.ts`、`tests/house.test.ts`、`tests/github-auth.test.ts` を実行する。

**2. ローカルで実地確認する**

`.env.local` を用意して `npm run dev` で起動し、以下を実際に動かして確認する。

- GitHubログインの往復（OAuth Appを作り、コールバックを `http://localhost:3000/api/auth/github/callback` に設定）
- Webhookの受信（ngrokで公開し、実際にpushして200が返り画面が更新されるか）
- 質問掲示板の投稿・回答・ベストアンサー採用
- メンター相談の送受信

うまくいかない場合の切り分け表は `README.md` の「動いているか確かめる」にある。

**3. デプロイする**

`DEPLOY.md` の手順に従う。Supabaseの設定は本番では必須。

## 守ってほしい方針

**画面を増やさない。** 初参加者が「どこを見ればいいか」で迷わないよう、意図的に2画面に絞ってある。機能を足すときは既存の画面に収める。

**削除した機能を戻さない。** チーム内チャット、開発ステージ表示（`house_level` のUI）、自チーム専用ページ、ランキング専用ページ、3Dシーンは、情報の重複と選択肢の増加を理由に意図的に削除した。`house_level` のDB列とロジックは互換のため残っているが、UIには出さない。

**デザイントークンを増やさない。** 影は `shadow-soft` / `shadow-card` / `shadow-inset` / `shadow-pressed` の4種類のみ。色は `paper` / `surface` / `sand` / `line` / `ink` / `muted` / `pulse` / `hot` / `sun` / `field`。詳細と使い分けは `design.md` に書いてある。

**影だけで状態を伝えない。** 押せるものには必ず境界線か塗りを併用する。Soft UIはニューモーフィズムの折衷版で、可読性を落とさないことが前提。

**UI文言は日本語。** GitHub用語（push、PR、Issue）とコードは原語のまま。

**なりすまし防止の設計を壊さない。** チーム参加・メンター登録・チャット・掲示板の投稿では、表示名とGitHubユーザー名をリクエストボディからではなく、cookieの本人情報（`getCurrentIdentity()`）から取得している。ここをクライアント申告に戻さないこと。

## 既知の制限（直すかどうかは相談してから）

- スコア更新が read-modify-write なので、同時イベントで加算が落ちうる
- Supabase未設定だと本番環境では記録が永続化されない（メモリのみ）
- 「通知」はフィードが更新されて1回光るだけ。トースト通知や未読バッジは無い

## 環境についての注意

このプロジェクトが `C:\Users\...\OneDrive\Desktop\` 配下にある場合、`node_modules` がOneDriveの同期対象になり、ビルドが極端に遅くなる。`C:\dev\` などOneDriveの外へ移動することを推奨する（移動する場合は先にエディタとdevサーバーを終了しておくこと）。

## 進め方

作業前に何をするか短く宣言し、終わったら実行したコマンドと結果を報告してください。判断に迷う設計上の選択が出たら、勝手に決めずに聞いてください。
