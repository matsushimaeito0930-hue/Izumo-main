# HackRadar

HackRadar は、短期間のハッカソン向けのリアルタイムチーム開発ダッシュボードです。
GitHubにプッシュすると、チームの進み具合とランキングが自動で更新されます。
詰まったら質問掲示板に書けば、参加している人なら誰でも答えられます。

コンセプト: **開発の動きを、ひと目で。**

初参加の人が迷わないよう、画面は**2つだけ**です。

| 画面 | やること |
| --- | --- |
| 開発状況 `/dashboard` | 誰がどれだけ進んでいるかを見る |
| 質問する `/help` | わからないことを書く・答える |

## 技術スタック

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres
- Supabase Realtime（接続できない場合はポーリングにフォールバック）
- GitHub Webhooks
- Express製のWebhookサーバー（任意）
- Vercelへのデプロイ想定

## 主な機能

- GitHubアカウントでのログイン（OAuth）
- GitHub OAuth + チーム名選択によるチーム参加
- プッシュ / PR作成 / PRマージ / Issue解決 / レビューを表示するアクティビティ一覧
- 活動量から算出したスコアによるランキング
- 質問掲示板（誰でも回答でき、質問者がベストアンサーを採用できる）
- チームごとの運営相談スレッド
- `x-hub-signature-256` によるWebhook署名検証
- 審査デモ用の擬似イベント（`ENABLE_DEMO_MODE=true` のときだけ、右上に小さく表示）

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

http://localhost:3000 を開きます。

ページ構成:

- `/` ログインと参加
- `/dashboard` 開発状況（進捗の比較・アクティビティ・ランキング）
- `/help` 質問掲示板と運営への相談

## 環境変数

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_WEBHOOK_SECRET=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
AUTH_SECRET=
ADMIN_GITHUB_LOGINS=

ENABLE_DEMO_MODE=true
EXPRESS_PORT=4000
```

Supabaseの環境変数が未設定の場合は、メモリ上のシードデータで動作するため、ローカルでもそのままデモできます。

## GitHubログインの設定

`GITHUB_CLIENT_ID` と `GITHUB_CLIENT_SECRET` が設定されているときだけ、GitHubログインが有効になります。
未設定の場合はローカルデモ用に、表示名を手入力してチーム名で参加するフローで動きます。

1. GitHubの Settings → Developer settings → OAuth Apps → New OAuth App を開く
2. Homepage URL に `http://localhost:3000`
3. Authorization callback URL に `http://localhost:3000/api/auth/github/callback`
4. 発行された Client ID と Client Secret を `.env.local` に設定する
5. `AUTH_SECRET` を生成して設定する（`openssl rand -hex 32`）

本番ではコールバックURLをデプロイ先のドメインに変更し、必要なら
`GITHUB_OAUTH_CALLBACK_URL` で明示的に固定してください。

ログイン時に要求するスコープは `read:user` のみで、リポジトリへの権限は要求しません。

リポジトリ欄は、ログインしたアカウントの**リポジトリ一覧から選択**できます。
ただし `read:user` だけで `/user/repos` が返すのは**パブリックリポジトリのみ**です。

プライベートも一覧に出したい人は、一覧の下の「**プライベートも表示する**」から
`/api/auth/github?private=1` に進み、`repo` スコープ付きで連携し直します。
`repo` はプライベートの読み書きを全部含む重い権限なので、**必要な人だけが任意で**付ける形にしています。
（GitHubのOAuth Appには「プライベートを読むだけ」のスコープが存在しないためです。）

一覧には**自分のリポジトリ**だけでなく、**共同編集者として招待されたもの**と
**所属しているOrganizationのもの**も含まれます（`affiliation=owner,collaborator,organization_member`）。
見覚えのない名前が出るのはこのためです。選択肢は所有者ごとにグループ分けして表示しています。

手入力したい場合は「一覧に無い（手入力する）」から `owner/repository` を直接入力できます。
リポジトリをパブリックに変更した場合は、再連携なしでそのまま一覧に出ます。

**ハマりやすい点**：OAuth Appに登録したコールバックURLと、ブラウザで開いているURLの
ホスト名が完全に一致している必要があります。`http://localhost:3000` で登録したなら
`http://127.0.0.1:3000` でアクセスすると弾かれます。同じURLで開いてください。

`AUTH_SECRET` を設定しない場合は `GITHUB_CLIENT_SECRET` が署名鍵として使われます。
動きはしますが、鍵は分けたほうが安全です。

### 役割の割り当て

| 環境変数 | 役割 | 例 |
| --- | --- | --- |
| `ADMIN_GITHUB_LOGINS` | 運営。イベント作成・チーム登録・相談への返信ができる | `alice,bob` |
| （ここに無い） | 参加者 | — |

役割は運営と参加者の2種類だけです。メンターというロールは廃止しました。
初参加者にとって「メンターに聞くのか、掲示板に書くのか」の判断が増えるだけだったためです。

`ADMIN_GITHUB_LOGINS` が空の場合、ログイン済みなら誰でも招待コードを作成できます。
本番では必ず設定してください。

### セッション

ログイン状態は **HS256で署名したJWT** を httpOnly cookie に入れて保持します（有効期限12時間）。
署名の検証時に `alg` を確認しているため、`alg: none` への差し替えは通りません。
外部ライブラリは使わず `node:crypto` だけで実装しています。
チーム参加や投稿では、表示名とGitHubユーザー名をクライアントの申告ではなく
このcookieの本人情報から取得するため、他人になりすました投稿ができません。

## 運営の画面と参加者の画面

同じURLですが、GitHubのログイン名が `ADMIN_GITHUB_LOGINS` にあるかどうかで中身が変わります。

| | 運営 | 参加者 |
| --- | --- | --- |
| ヘッダー右上 | 参加コードと招待URLのコピー | 表示なし |
| トップページ | イベント名の編集・チーム追加 | 参加フォームのみ |
| `/dashboard` | 全チームのリポジトリ設定状況 | 自分のチームを大きく表示 |
| `/help` の相談 | 全チームのスレッドを切り替え | 自分のチームのスレッドのみ |

参加コードは運営のHTMLにしか含めていないため、参加者側のページソースからは読めません。

## 参加フロー

**運営**

1. `/` を開き、GitHubでログインする
2. イベント名を入力して保存する → **参加コード**（例 `ABCD-2345`）が表示される
3. ヘッダー右上（またはトップページ）から**招待URLをコピー**して、Discordなど参加者のいる場所に配る
   - 招待URLは `https://<ドメイン>/?code=ABCD-2345` の形。開くと参加コードが自動で入る
   - コードだけを配って手入力してもらってもよい
4. チーム名を登録しておく（参加者はこの一覧から選ぶ）

**参加者**

1. `/` を開き、GitHubでログインする
2. 参加コードを入力し、チーム名を選ぶ
3. リポジトリを選ぶ（任意。「あとで設定する」でスキップ可）
4. `/dashboard` に移動する。リポジトリ未設定なら画面上部の欄からいつでも設定・変更できる

イベントは1つだけ運用する前提です。参加コードが一致しない参加はAPI側で拒否されます。
チームは初期登録されていないため、運営がチーム名を登録するまで参加者は参加できません。

## Supabaseのセットアップ

1. Supabaseプロジェクトを作成する
2. SQLエディタを開く
3. `supabase/schema.sql` を実行する
4. プロジェクトURLを `NEXT_PUBLIC_SUPABASE_URL` に設定する
5. anonキーを `NEXT_PUBLIC_SUPABASE_ANON_KEY` に設定する
6. service roleキーを `SUPABASE_SERVICE_ROLE_KEY` に設定する

環境変数が設定されると、ブラウザは以下のテーブルのRealtime変更を購読します。

- `activities`
- `teams`
- `help_posts`
- `help_replies`
- `chat_messages`

Realtime接続が切れてもデモが止まらないよう、低頻度の再取得も併用しています。

## GitHub Webhookの設定

GitHubのWebhookは「GitHubへプッシュしたとき」に発火します。ローカルコミットだけでは発火しません。

Webhook設定:

- Payload URL: `https://your-domain.example/api/github/webhook`
- Content type: `application/json`
- Secret: `GITHUB_WEBHOOK_SECRET` と同じ値
- Events: `push`, `pull_request`, `issues`, `pull_request_review`

処理の流れ:

1. GitHubがイベントを送信する
2. HackRadar が HMAC SHA-256 署名を検証する
3. リポジトリを `teams.github_repo` と突き合わせる
4. アクティビティを1件保存する
5. `push` の場合は `payload.commits.length` の分だけ `teams.commit_count` を加算する
6. チームのスコアを更新する
7. ページをリロードせずにUIが更新される

### 動いているか確かめる

1. GitHubのリポジトリ → Settings → Webhooks → 該当のWebhookを開く
2. **Recent Deliveries** タブを見る
3. Webhook登録直後の `ping` が緑のチェックになっていれば、URLと疎通はOK
4. 実際にpushして、`push` の配信が **200** で返っているか見る
5. 200なのに画面が変わらない場合は、`teams.github_repo` の値が `owner/repository` と完全一致しているか確認する

配信が赤い場合の見分け方:

| レスポンス | 原因 |
| --- | --- |
| 401 | `GITHUB_WEBHOOK_SECRET` がGitHub側と一致していない |
| 500 `GITHUB_WEBHOOK_SECRET is not configured` | サーバー側に環境変数が設定されていない |
| 200 `{"ignored":true}` | 対象外のイベント（対応しているのは push / PR作成 / PRマージ / Issueクローズ / レビュー） |
| 届かない | URLが公開されていない（ローカルなら ngrok が必要） |

### 制限

- **Supabaseを設定していない場合、Webhookで受けた記録はメモリ上にしか残りません。** ローカルのデモでは動きますが、Vercelなどにデプロイするとインスタンスごとに別々の記録になり、消えます。本番で使うならSupabaseの設定が必須です。
- スコアの更新は「読んで足して書く」方式です。ほぼ同時にイベントが来ると加算が1回分落ちることがあります。ハッカソンの規模なら実害は出ませんが、正確さが要るなら後でDB側の加算に変えてください。
- 画面の更新は、Supabase設定時はRealtime購読（12秒の保険ポーリング付き）、未設定時は2.2秒ごとのポーリングです。

## Express製Webhookサーバー

Next.jsのAPIルートだけでもWebhookは受信できます。Expressで受けたい場合は次を実行します。

```bash
npm run dev:webhook
```

既定では `http://127.0.0.1:4000` で起動します。

ローカルでGitHub Webhookを試す場合は ngrok で公開します。

```bash
ngrok http 4000
```

GitHubのPayload URLには次を設定します。

```text
https://xxxx.ngrok-free.app/api/github/webhook
```

## 質問掲示板

`/help` の掲示板は、**参加している人なら誰でも回答できます**。
ハッカソンでは、同じエラーを30分前に踏んだ隣のチームが一番速い回答者になることが多いためです。

流れ:

1. 「わからないこと」を投稿する（チーム・カテゴリ・タイトル・詳細）
2. 誰かが回答すると、投稿の状態が「未回答」から「回答あり」に変わる
3. 質問者が1件を「これで解決した」で採用すると、ベストアンサーとして固定され「解決済み」になる
4. 未回答 / 未解決 / すべて で絞り込めるので、答えの付いていない質問が埋もれない

ベストアンサーを採用できるのは、質問者本人と運営のみです。
回答してもスコアは増えません。スコアはGitHubの開発量の指標として保つためです。

## 運営への相談

`/help` の下部にあります。チームごとに独立したスレッドで、他チームのやり取りは混ざりません。
参加者には自分のチームの部屋だけが見え、運営はチームを切り替えて全部の相談に返信できます。

チーム内チャットは廃止しました。チームは同じ場所にいるか、すでに別のツールを使っていることが多く、
「どこに書けばいいのか」を増やすだけだったためです。

## デモ操作

`/dashboard` の右上にある「デモ」ボタンから開きます。
`ENABLE_DEMO_MODE=false` にすると完全に表示されません。

1. 対象チームを選ぶ
2. 「コミット +1」「PR作成」「PRマージ」「Issue解決」のいずれかを押す
3. アクティビティとランキングがその場で更新される

## デプロイ

手順は **[DEPLOY.md](./DEPLOY.md)** にまとめています。Supabaseの用意から、Vercelの環境変数、
GitHub OAuth Appとwebhookの本番URL切り替え、公開後の確認リストまで順番に書いてあります。

本番では `ENABLE_DEMO_MODE=false`、`ADMIN_GITHUB_LOGINS` の設定、Supabaseの設定が必須です。

Express製のWebhookサーバーを本番で使う場合は `server/express-webhook.js` をNodeホストにデプロイし、
GitHubのPayload URLをそのサーバーに向けます。

## 検証

`node_modules` を入れる前でも動く確認:

```bash
npm run verify:core
```

Webhookの署名検証・イベント解析・ログインセッションの署名・役割判定を、
依存パッケージ無し（Node標準機能のみ）で46項目チェックします。環境構築前の切り分けに使えます。

依存パッケージを入れたあとの通常の検証:

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

## デザイン

配色・タイポグラフィ・レイアウトの方針は `design.md` にまとめています。
UIは白ベージュ基調のライトテーマで、以前の3Dメタバース（Plaza）画面は廃止しました。
