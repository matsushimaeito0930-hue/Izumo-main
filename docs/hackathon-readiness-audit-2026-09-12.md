# HackRadar ハッカソン導入前監査

- 実施日: 2026-09-12
- 対象ソース: `main` / `6043f14 change: rebalance default activity scores`
- 対象本番: `https://hackverse-mvp.vercel.app`
- 方針: 本番データを変更しない読み取り検証、無効署名による拒否確認、ローカル自動テスト

## 2026-09-13 再監査結果

修正前に検出したP0/P1はコードとスキーマ上で解消し、ローカルの全品質ゲートを通過した。

| 検証 | 現在の結果 |
| --- | --- |
| Vitest | 17ファイル・60/60成功 |
| コア検証 | 67/67成功 |
| 運用フロー | 65/65成功 |
| TypeScript / ESLint | 成功（警告なし） |
| Next.js本番ビルド | 成功 |
| `npm audit` | 0件 |

主な解消内容:

- 状態API、質問、チャット、DM、WakaTime、配点を選択中イベントへ限定
- 匿名質問から投稿者IDとGitHub名を除去
- Supabaseのブラウザ権限から個人情報・招待コード・本文テーブルを除去し、更新通知専用テーブルへ切り替え
- Webhookの加点・重複排除・活動追加をDBトランザクション化
- 同一リポジトリを別イベントで再利用可能にし、各イベントの配点で個別集計
- イベント単位の役割とDM候補を`event_members`で分離
- Next.js 16.3.5 / React 19.3へ更新

現在の判定は、**技育博の展示・説明はGO、小規模ハッカソンは本番スキーマ適用と実サービスの通しリハーサル後にGO**。
WakaTimeの実アカウント複数人連携と、GitHubの実Webhookによる5種類の活動は外部サービスを使うため、
本番環境での最終E2Eがまだ必要である。以下は修正前の監査記録として残す。

## 修正前の結論（履歴）

| 利用目的 | 判定 | 理由 |
| --- | --- | --- |
| 技育博などでの説明・デモ | GO | 主要画面は応答し、単一イベントの基本フローとGitHub集計ロジックは動く |
| 少人数・単一イベントのリハーサル | 条件付きGO | ダミーデータ、手動バックアップ、障害時の手集計を用意すること |
| 実ハッカソンの公式スコア・公式運営 | NO-GO | 複数イベント混線、公開APIの情報露出、WakaTimeの複数所属不具合がある |

機能は多く実装されているが、現状は「デモ可能なベータ版」であり「運営が結果を預けられる本番版」ではない。

## 実施結果

### ローカル品質ゲート

| 検証 | 結果 |
| --- | --- |
| `npm test` | 46/46 成功 |
| `npm run typecheck` | 成功 |
| `npm run lint` | 成功 |
| `npm run build` | 成功 |
| `npm run verify:flow` | 65/65 成功 |
| `npm run verify:core` | 64成功 / 3失敗 |

`verify:core` の3件は旧 `ADMIN_GITHUB_LOGINS` allowlistを期待するテストで、現在のイベント所有者方式と一致していない。直ちに本番障害を示すものではないが、CIをリリース判定に使えない状態である。

### 本番スモークテスト

| 対象 | 結果 |
| --- | --- |
| `/`, `/dashboard`, `/help` | HTTP 200 |
| GitHub OAuth開始 | GitHubへ307。client ID、callback、state cookieあり |
| 無効署名のGitHub Webhook | HTTP 401。署名検証は有効 |
| WakaTime summary（未ログイン） | HTTP 401。OAuth設定自体は本番に存在 |
| 管理スコアAPI（未ログイン） | HTTP 401 |
| 個人DM API（未ログイン） | HTTP 401 |
| `/api/state`（未ログイン） | HTTP 200。複数イベントのデータを返すため問題 |

GitHub側のWebhook設定は active で、対象イベントは `push`, `pull_request`, `issues`, `pull_request_review`。直近配信履歴はGitHubの保持期間外で空だった。

## ポイント検証

最新版の既定値は次の通り。

| GitHub活動 | 既定ポイント |
| --- | ---: |
| push | 1 |
| PR作成 | 2 |
| PRマージ | 3 |
| Issueクローズ | 2 |
| レビュー送信 | 2 |

- 自動テストでは5種類すべての解析・加点が成功した。
- pushはコミット数に関係なく1回のpushイベントで1点。コミット件数は別カウンターに加算される。
- PRは「作成2点」と、後日マージした場合の「マージ3点」が別活動なので、ライフサイクル合計は5点になる。
- 本番ではpush 23件が1点ずつ保存され、PR作成4件・PRマージ2件もGitHubの実履歴と件数が一致した。
- ただし本番の該当イベントには旧配点（PR作成10点・PRマージ20点）が保存されている。最新版の既定値へ自動では切り替わっていない。
- 本番リポジトリにはIssueとレビューの実履歴がないため、この2種類は本番E2E未確認。ローカル解析テストのみ成功。

## リリースを止める問題

### P0: イベントごとのポイントが混線する

`recordActivity` はチームを特定する前に `getScoreConfig()` をイベントIDなしで呼ぶ。そのため最新イベントの配点が別イベントの活動にも使われる。

2イベントのインメモリ再現では、イベントAのpush=1、イベントBのpush=9と設定後、Aへのpushも9点になった。

さらに配点変更時の `recalculateScores` は全イベントのactivitiesとteamsを対象に再計算する。1イベントの配点変更が他イベントの履歴と合計点を書き換える。

### P0: 同じGitHubリポジトリを複数イベントで扱えない

- DBの `teams.github_repo` が全体でuniqueで、イベント単位のuniqueではない。
- Webhook受信時もrepositoryだけで `.maybeSingle()` しており、イベントを指定していない。

同一リポジトリの再利用はDB登録で失敗する。制約だけ外すと今度はWebhookが複数行エラーになるため、Webhookが対象イベントを確定できる設計が必要。

### P0: 未ログインで複数イベントの状態が取得できる

`/api/state` は未ログインでも200を返し、チーム名、リポジトリ、点数、参加GitHub名、活動、掲示板、お知らせを複数イベント分返した。

またschemaはanonに `users`, `teams`, `events`, `activities`, `help_posts`, `team_invites`, `chat_messages` のselect権限を与えている。特に招待コードテーブルをanonに公開する設計は本番不可。

匿名掲示板も表示名だけを「匿名」にしており、返却データには `user_id` と `author_github` が残るため、API利用者からは投稿者を特定できる。

### P0: WakaTimeは複数イベント所属者で失敗する

OAuth URL、`read_summaries` scope、state検証、callback、token refresh、チーム合計ロジックは実装されている。本番のOAuth設定も存在する。

ただしsummary取得は利用者の `team_members` をイベントで絞らず `.maybeSingle()` する。本番公開状態では同じGitHubユーザーが5チームに所属しているため、この利用者では複数行エラーとなりsummary APIが503になる可能性が高い。

さらにsummary APIがセッションの `eventId` ではなく最新イベントの開始日を使うため、期間も別イベントになる。現テストは認可URLなど3件だけで、実token交換、複数所属、実WakaTime API、チーム合計は未検証。

したがって現状の結論は「WakaTimeの接続画面と設定はあるが、実運用できることは確認できず、複数イベントではコード上不具合がある」。

### P1: Webhook加点が原子的でない

現在はチーム点数を読み、JavaScriptで `現在点 + 加点` を計算してupdateし、その後activityをinsertする。重なったWebhookでは更新の取りこぼしが起こり得る。またdelivery IDの重複確認とinsertも1トランザクションではなく、DB unique制約もない。

### P1: 本番依存関係に既知脆弱性

`npm audit --omit=dev` は4件（moderate 1 / high 2 / critical 1）。直接依存のNext.jsは14.2.35で、既知のDoS・情報露出・RCE系advisoryの対象に含まれる。VercelがLinuxであればWindows限定RCEは直接該当しないが、AVIF Image Optimizationのcriticalを含むため更新が必要。

## 導入前の必須合格条件

1. `/api/state` をログイン必須かつevent scope必須にし、Supabase anon権限から招待コードと個人情報を外す。
2. `recordActivity` と `recalculateScores` を必ずteamの `event_id` で絞る。
3. 同じrepoを複数イベントでどう識別するか決め、DB制約とWebhook解決方法を揃える。
4. WakaTime summaryを `identity.eventId` とそのイベントのteamで取得し、実アカウント2名以上で接続・再接続・合計・解除をE2E確認する。
5. score加算とactivity insertをDB関数/transactionで原子的にし、delivery IDに一意性を持たせる。
6. Next.jsなど本番依存関係を安全な版へ更新し、auditを再判定する。
7. `verify:core` を現仕様へ更新して全件成功させる。
8. テスト用イベントでpush、PR作成、PRマージ、Issueクローズ、レビューを各1回実行し、イベント別配点・二重配信・同時配信を本番相当DBで確認する。
9. 障害時の手集計、CSV等のバックアップ、Webhook失敗監視、復旧手順を用意する。

## 修正前の最終判定（履歴）

現段階で企業担当者に「コンセプトと動作デモ」を見せるのは問題ない。一方、順位や作業時間を公式記録として扱う実ハッカソンには出さない。上記P0をすべて直し、テストイベントを1回通した時点で「小規模本番の候補」に上げる。
