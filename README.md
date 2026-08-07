# HackRadar

HackRadar は、短期間のハッカソン向けのリアルタイムチーム開発ダッシュボードです。
GitHubにプッシュすると、チームの進み具合とランキングが自動で更新されます。
詰まったら質問掲示板に書けば、参加している人なら誰でも答えられます。

コンセプト: **開発の動きを、ひと目で。**

## Claude向け実装引き継ぎ

この節は、次にClaudeなどのAIエージェントが実装を引き継ぐときの現状メモです。

### プロダクトの現在地

- 正式名称は **HackRadar**。以前の `HackVerse` 表記や、3Dメタバース / Plaza画面は廃止済み。
- 現在の主役は、ハッカソン中の開発状況を比較・共有するダッシュボードと、質問・運営相談機能。
- UIは白・ベージュ系のライトテーマ。暗いネオンや自由移動の3D画面を追加しない。
- GitHubの活動をチーム単位で集計し、コミット数、スコア、ランキング、最新アクティビティを表示する。
- 短期間のハッカソンで使うMVPのため、イベントは1つだけ登録して運用する前提。

### 現在実装されている機能

1. GitHub OAuthログイン
   - `GITHUB_CLIENT_ID` と `GITHUB_CLIENT_SECRET` がある場合に有効。
   - GitHubユーザー名を `ADMIN_GITHUB_LOGINS` と照合して運営 / 参加者を判定する。
   - セッションは `hackverse-auth` というhttpOnly CookieにHS256 JWTで保存する。有効期限は12時間。
2. イベントとチームの登録
   - 運営がイベント名を登録・更新できる。
   - イベント名を別名に変更すると、全体コードが変わり、チーム、招待コード、リポジトリ、活動履歴、質問、チャットを新イベント用にリセットする。
   - 運営がチームを追加すると、その場でチーム専用の部屋番号（`team_invites.code`）を発行する。
   - 既存チームに部屋番号がない場合は、運営画面のチーム一覧から発行できる。
   - チーム名とGitHubリポジトリは運営が編集できる。
3. 部屋番号によるチーム固定
   - 参加者はチーム名を選択しない。運営から受け取ったチーム専用部屋番号だけで参加する。
   - `/api/teams/join` はチーム名を信用せず、`joinTeamWithInvite` で部屋番号からチームを解決する。
   - 同じGitHubアカウントの参加者が別チームへ追加参加することを拒否する。
   - 本番の参加者はGitHubログインが必要。認証なしの手入力フローはローカルデモ用。
4. GitHubリポジトリ連携とWebhook
   - 参加時またはダッシュボードから `owner/repository` を設定できる。
   - GitHub APIでリポジトリ一覧を取得し、選択時にWebhookを自動登録する。
   - 自動登録に失敗した場合は、画面に手動設定の案内を表示する。
   - `push`, `pull_request`, `issues`, `pull_request_review` を受信し、対応する活動を保存する。
   - `push` のコミット数を `teams.commit_count` に加算し、スコアとランキングを更新する。
   - `x-hub-signature-256` を `GITHUB_WEBHOOK_SECRET` で検証する。
5. ダッシュボード `/dashboard`
   - 自分のチームの進捗カード、全チームの棒グラフ / 開発状況、アクティビティ、ランキングを表示する。
   - Supabase Realtimeを使い、接続できない場合はポーリングへフォールバックする。
   - 運営は全チームの状況とリポジトリ設定状況を確認できる。
6. 質問・運営相談 `/help`
   - 質問掲示板、回答、ベストアンサー、解決状態を扱う。
   - 参加者は自分のチームにだけ質問・運営相談を投稿できる。
   - API側でも `team_members` を確認するため、画面の選択欄を書き換えて別チームIDを送っても拒否される。
   - メンターはチームを横断して質問に回答できる。
   - 運営はチーム相談ではなく、お知らせチャットだけ投稿できる。
7. メンター登録
   - 「メンターとして登録」から招待コード、名前、得意なことを入力する。
   - `/api/mentors/join` が処理し、メンターはチームに所属しない。
   - イベント全体コードまたはチーム招待コードをメンター用コードとして利用できる。
8. 運営の参加
   - 運営も参加者フォームからチームの部屋番号でチームに参加できる。
   - ただしダッシュボード上は運営権限が優先され、全体状況を表示する。
   - 運営の `/help` はお知らせチャット専用。

### 利用フロー

#### 共通の入口

`/` を開くと、最初に「参加者 / メンター / 運営」の3つのカードが出ます。
立場を選ぶと、その立場の入口だけが表示されます。3つの入口を1画面に並べると
初参加の人がどれを触ればいいか分からなくなるため、選んでから見せる形にしています。

ログインが要るかどうかは立場ごとに違います。

| 立場 | GitHubログイン | 理由 |
| --- | --- | --- |
| 参加者 | 必要 | リポジトリの選択とWebhookの自動登録に使う |
| メンター | 不要 | リポジトリを持たず、できるのは質問への回答のみ |
| 運営 | 必要 | イベントのリセットなど破壊的操作ができるため本人確認する |

メンターはGitHubログインなしでも、名乗った名前がサーバー側でJWT cookieに焼き込まれます。
以後の投稿はそのcookieの値が使われるため、他人になりすました投稿はできません。
ただし**全体コードを知っている人は誰でもメンターになれる**点は運用で担保してください。

#### 運営

1. GitHubでログインする。
2. `/` の運営セクションでイベント名を保存する。
3. チーム名を追加し、表示された部屋番号を各チームへ共有する。
4. 参加者が自分のGitHubリポジトリを登録する。
5. GitHubのWebhook Recent Deliveriesで、`push` が200になっていることを確認する。
6. `/dashboard` で全チームの開発状況を確認する。

#### 参加者

1. GitHubでログインする。
2. 最初の画面で「参加者」を選ぶ。
3. 自分のチーム専用部屋番号を入力する。チーム名は選ばない。
4. 自分のリポジトリを選ぶ。後から `/dashboard` で設定してもよい。
5. GitHubへpushして、ダッシュボードのコミット数とアクティビティを確認する。
6. 困ったら `/help` で質問または自分のチームの運営相談を投稿する。

#### メンター

1. 最初の画面で「メンター」を選ぶ（GitHubログインは不要）。
2. 運営から渡された全体コード、名前、得意なことを入力する。
3. `/dashboard` で全体を見て、`/help` で質問に回答する。

### チーム所属の認可ルール

チームIDはクライアントから送信されるため、サーバー側で必ず所属を確認する。

- `/api/teams/join`: 部屋番号から解決したチーム以外を指定できない。
- `/api/chat`: 参加者は自分の所属チームの相談だけ投稿できる。
- `/api/help`: 参加者は自分の所属チームにだけ質問できる。
- `/api/teams/repo`: 参加者は自分の所属チームのリポジトリだけ設定できる。
- `/api/admin/event`, `/api/admin/invites`, `/api/admin/teams/[id]`: 本番では運営ロールだけが操作できる。
- `/api/demo/event`: 本番で認証が有効な場合は運営だけが実行できる。

画面の選択肢を隠すだけでは不十分なので、今後もチームに紐づく新しいAPIを追加する場合は、
`lib/store.ts` の `isTeamMember` を使ったサーバー側認可を追加する。

### 主要な実装ファイル

| ファイル | 役割 |
| --- | --- |
| `components/onboarding-client.tsx` | ログイン後の参加者・メンター・運営の入口、チーム登録、部屋番号発行 |
| `components/dashboard-client.tsx` | ダッシュボードと権限ごとの表示切り替え |
| `components/help-composer.tsx` | 質問投稿。参加者はチームを固定表示、メンターだけ横断選択 |
| `components/staff-chat.tsx` | チームごとの運営相談と運営のお知らせチャット |
| `lib/store.ts` | Supabase / メモリフォールバックを吸収するデータアクセス層 |
| `lib/github-auth.ts` | GitHub OAuth、ロール判定、JWT署名・検証 |
| `lib/github-webhook-setup.ts` | GitHub APIによるWebhook自動登録 |
| `app/api/github/webhook/route.ts` | Next.js側のWebhook受信・署名検証・活動記録 |
| `server/express-webhook.js` | 任意で使えるExpress版Webhookサーバー |
| `supabase/schema.sql` | SupabaseのテーブルとRealtime設定 |
| `tests/team-join.test.ts` | 部屋番号参加と複数チーム参加拒否 |
| `tests/event-reset.test.ts` | イベント名変更時のリセットとコード更新 |

### 主要API

| Method | Path | 用途 |
| --- | --- | --- |
| `POST` | `/api/teams/join` | 部屋番号でチーム参加、任意のリポジトリ設定 |
| `POST` | `/api/invites/join` | 部屋番号でチーム参加する別入口 |
| `POST` | `/api/mentors/join` | メンター登録 |
| `POST` | `/api/admin/event` | イベント保存、チーム追加 |
| `GET/POST` | `/api/admin/invites` | 運営だけが部屋番号を取得・発行 |
| `PATCH` | `/api/admin/teams/[id]` | チーム名・リポジトリ編集 |
| `POST` | `/api/github/webhook` | GitHubイベント受信 |
| `POST` | `/api/help` | 質問投稿 |
| `POST` | `/api/help/replies` | 質問への回答 |
| `POST` | `/api/chat` | チーム相談 / 運営お知らせ |
| `GET` | `/api/state` | ダッシュボード状態取得 |

### データモデル

Supabaseを使う場合の中心テーブルは次のとおり。

- `events`: 現在のイベント1件と全体コード
- `users`: GitHubユーザー、ロール、メンターの得意分野
- `teams`: チーム名、リポジトリ、スコア、コミット数
- `team_members`: GitHubユーザーとチームの所属関係
- `team_invites`: チーム専用部屋番号
- `activities`: push / PR / Issue / reviewの活動履歴
- `help_posts`, `help_replies`: 質問掲示板
- `chat_messages`: チーム相談と運営お知らせ

`NEXT_PUBLIC_SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が揃っているとSupabaseを使う。
未設定時は `lib/seed.ts` を元にしたメモリストアへフォールバックするため、ローカルデモは動くが、
本番の永続化・Webhook集計にはSupabaseが必須。

### 現在の検証状態

2026-08-07時点で以下を通過済み。

```bash
npm.cmd test -- --run   # 8 files / 35 tests passed
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

直近のチーム所属制御のコミットは `4240654 fix: lock team actions to room invites`。
`main` にpush済みで、VercelのGit連携が有効ならpushを起点に自動デプロイされる。

### 今後の変更時の注意

- チーム選択を参加者に戻さない。必ず部屋番号と`team_members`で所属を確定する。
- `SUPABASE_SERVICE_ROLE_KEY`、`GITHUB_CLIENT_SECRET`、`GITHUB_WEBHOOK_SECRET`、`AUTH_SECRET`はリポジトリへコミットしない。
- 本番では`ADMIN_GITHUB_LOGINS`を必ず設定する。GitHubログイン有効時、ここに無いユーザーは運営操作を行えない。
- イベント名変更は意図的に全データをリセットする破壊的操作なので、管理画面の文言と確認導線を維持する。
- 画面を変更した後は、最低でも`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`を実行する。

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
- GitHub OAuth + チーム専用部屋番号によるチーム参加
- プッシュ / PR作成 / PRマージ / Issue解決 / レビューを表示するアクティビティ一覧
- 活動量から算出したスコアによるランキング
- 質問掲示板（誰でも回答でき、質問者がベストアンサーを採用できる）
- チームごとの運営相談スレッドと運営のお知らせチャット
- メンター登録（招待コード、名前、得意分野）
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
| `ADMIN_GITHUB_LOGINS` に含まれる | 運営。イベント作成・チーム登録・全チームの確認・お知らせ投稿ができる | `alice,bob` |
| GitHubログイン済みでallowlistに無い | 参加者。部屋番号で1チームに参加する | — |
| メンター登録を完了したユーザー | メンター。チームを横断して質問に回答する | — |

ロールは `participant`、`mentor`、`admin` の3種類です。
メンターはチームには所属せず、質問への回答とチーム状況の確認を担当します。

`ADMIN_GITHUB_LOGINS` が空の場合、本番のGitHubログインユーザーは運営になりません。
本番では必ず運営のGitHubユーザー名を設定してください。認証を無効にしたローカルデモでは、
運営セクションを手入力で確認できます。

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
| ヘッダー / トップページ | 全体コードとチーム部屋番号のコピー | 表示なし |
| トップページ | イベント名の編集・チーム追加・部屋番号発行 | 参加フォームのみ |
| `/dashboard` | 全チームのリポジトリ設定状況 | 自分のチームを大きく表示 |
| `/help` の相談 | 全チームのスレッドを切り替え・お知らせ投稿 | 自分のチームのスレッドのみ |

参加者が入力するのはイベント全体コードではなく、運営から渡されたチーム専用の部屋番号です。
チームの所属は画面だけでなく、参加API・質問API・相談API・リポジトリ設定APIでもサーバー側で検証します。

## 参加フロー

**運営**

1. `/` を開き、GitHubでログインする
2. イベント名を入力して保存する → メンター・運営用の**全体コード**が発行される
3. チーム名を登録する → チーム専用の**部屋番号**が自動発行される
4. 各チームに対応する部屋番号を共有する
5. 必要に応じてチーム一覧から部屋番号をコピーし、GitHubリポジトリの設定状況を確認する

**参加者**

1. `/` を開き、GitHubでログインする
2. チーム専用の部屋番号を入力する。チーム名は選択しない
3. 自分のリポジトリを選ぶ（任意。「あとで設定する」でスキップ可）
4. `/dashboard` に移動する。リポジトリ未設定なら画面上部の欄からいつでも設定・変更できる

イベントは1つだけ運用する前提です。部屋番号が一致しない参加はAPI側で拒否されます。
同じGitHubアカウントが別チームへ参加することもAPI側で拒否されます。
イベント名を変更するとチームと進捗がリセットされるため、本番運用開始後は変更前に確認してください。

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

### 自動登録（既定）

参加者がリポジトリを選んだ時点で、アプリがGitHub APIを叩いてWebhookを自動登録します。
参加者側の作業は**一覧から選ぶだけ**で、Settings → Webhooks を触る必要はありません。

そのためにログイン時のスコープへ `admin:repo_hook` を含めています。
これはWebhookの読み書きだけを許す狭いスコープで、コードの読み取り権限は含みません。

運営側で必要な設定:

| 環境変数 | 用途 |
| --- | --- |
| `GITHUB_WEBHOOK_SECRET` | 署名検証に使う共通の秘密。これが未設定だと自動登録も検証も動きません |
| `APP_BASE_URL` | Webhookの宛先にするドメイン（例 `https://your-domain.example`）。未設定ならリクエストのオリジンを使います |

自動登録が働かないのは次の場合です。UI側に理由と手動手順が表示されます。

- そのリポジトリの管理者権限が無い（他人のリポジトリに招待されているだけ、など）
- `GITHUB_WEBHOOK_SECRET` が未設定
- ローカル開発（`localhost` にはGitHubから届かないため、自動登録をスキップします）
- `admin:repo_hook` を付ける前の古いセッションのままログインしている（ログインし直すと解決します）

### 手動で設定する場合

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
5. 200なのに画面が変わらない場合は、レスポンスの本文を見る
   - `{"ignored":true,"reason":"unregistered_repository"}` なら、そのリポジトリがどのチームにも
     登録されていない。`teams.github_repo` が `owner/repository` と完全一致しているか確認する

### 未登録リポジトリの扱い

どのチームにも登録されていないリポジトリからWebhookが届いた場合、**そのイベントは捨てます**。
以前は「先頭のチーム」に紐づけるフォールバックがあったため、無関係なリポジトリのプッシュが
たまたま1番目のチームのコミット数に加算されてしまっていました。

このアプリ自身のリポジトリにWebhookを付けたまま開発すると、まさにこれが起きます。

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

一般的なチーム内雑談チャットはありません。チームごとの開発相談はこのスレッドに集約し、
運営から全体へ伝える内容は「お知らせ」として別表示します。

## デモ操作

運営の `/dashboard` 右上にある「デモ」ボタンから開きます。
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
