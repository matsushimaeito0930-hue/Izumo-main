# デプロイ手順

Vercel + Supabase で公開する手順です。上から順にやれば動きます。

**Supabaseの設定は本番では必須**です（理由は最後に書いています）。既存の本番DBがある場合は、アプリを更新する前にバックアップと移行SQLの適用が必要です。

---

## 0. 事前確認（ローカル）

先にローカルでビルドが通ることを確認します。ここで落ちるならデプロイしても落ちます。

```bash
npm install
npm run verify:core
npm run typecheck
npm run test
npm run build
```

`npm run build` の最後に各ページのサイズ一覧が出れば成功です。

---

## 1. Supabaseを用意する

1. https://supabase.com でプロジェクトを作る（無料枠でよい）
2. 左メニューの **SQL Editor** を開く
3. **新規DB**なら `supabase/schema.sql` を実行する。**既存DB**なら先にバックアップを取り、`supabase/migrations/20260913_event_isolation_and_webhook_atomic.sql` を実行する。既存DBに新規用スキーマを丸ごと再実行しない
4. 既存DBで移行が失敗した場合は、SQLのトランザクションがロールバックされる。表示された不足データ（イベント所有者、チーム・過去の会話のイベントID、同一イベント内の重複リポジトリ）を確認し、推測で埋めずに修正してから再実行する
5. **Settings → API** から次の3つを控える

| 控える値 | 環境変数名 |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` キー | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` キー | `SUPABASE_SERVICE_ROLE_KEY` |

`service_role` キーはサーバー専用です。**絶対に `NEXT_PUBLIC_` を付けないでください。**

既存DBの移行後は、SQL Editorで次を確認してください。`record_activity_atomic` が1行、`app_change_signal` が1行、`event_members` に既存の所属が復元されていることが目安です。

```sql
select count(*) from pg_proc where proname = 'record_activity_atomic';
select count(*) from public.app_change_signal;
select role, count(*) from public.event_members group by role;
```

---

## 2. GitHubにpushする

DB移行が成功してから、変更対象を確認してコミット・pushします。移行前にアプリだけ公開するとWebhook記録が失敗します。

`.env.local` は `.gitignore` で除外されているので、鍵がGitHubに上がることはありません。

---

## 3. Vercelにデプロイする

1. https://vercel.com にGitHubアカウントでログイン
2. **Add New → Project** → このリポジトリを **Import**
3. Framework Preset が **Next.js** になっていることを確認（自動判定されます）
4. **Environment Variables** に下の表を入力する
5. **Deploy** を押す

初回デプロイで発行されるURL（例 `https://izumo-main.vercel.app`）を控えてください。以降これを **本番URL** と呼びます。

### 環境変数

| 変数 | 必須 | 値 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ● | 手順1の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ● | 手順1の anon キー |
| `SUPABASE_SERVICE_ROLE_KEY` | ● | 手順1の service_role キー |
| `GITHUB_CLIENT_ID` | ● | 手順4で発行 |
| `GITHUB_CLIENT_SECRET` | ● | 手順4で発行 |
| `AUTH_SECRET` | ● | `openssl rand -hex 32` で生成した値 |
| `WAKATIME_CLIENT_ID` | ○ | WakaTime OAuth AppのClient ID |
| `WAKATIME_CLIENT_SECRET` | ○ | WakaTime OAuth AppのClient Secret |
| `WAKATIME_OAUTH_CALLBACK_URL` | ○ | `本番URL/api/auth/wakatime/callback` |
| `GITHUB_OAUTH_CALLBACK_URL` | ● | `本番URL/api/auth/github/callback` |
| `APP_BASE_URL` | ✅ | Webhookの自動登録先にするドメイン（例 `https://izumo-main.vercel.app`、末尾スラッシュなし） |
| `GITHUB_WEBHOOK_SECRET` | ● | 自分で決めた長い文字列（手順5で使う） |
| `ENABLE_DEMO_MODE` | | `false`（審査でデモ操作を見せたい場合のみ `true`） |

運営の固定allowlistは不要です。GitHubログイン後にイベントを作成した本人だけが、そのイベントを管理できます。

---

## 4. GitHub OAuth Appを本番用にする

1. GitHub → Settings → Developer settings → **OAuth Apps**
2. 新規作成（または既存のものを編集）
3. **Homepage URL**: 本番URL
4. **Authorization callback URL**: `本番URL/api/auth/github/callback`
5. Client ID と、**Generate a new client secret** で発行したシークレットを、手順3の環境変数に設定する
6. 変更したら Vercel で **Redeploy** する（環境変数は再デプロイで反映されます）

ローカルと本番を両方使いたい場合は、OAuth Appを2つ作って環境ごとに使い分けるのが確実です。1つのOAuth Appには1つのコールバックURLしか登録できません。

---

## 5. GitHub Webhookを本番に向ける

チームのリポジトリごとに設定します。

1. 対象リポジトリ → Settings → **Webhooks** → Add webhook
2. **Payload URL**: `本番URL/api/github/webhook`
3. **Content type**: `application/json`
4. **Secret**: 手順3で決めた `GITHUB_WEBHOOK_SECRET` と同じ値
5. **Which events**: *Let me select individual events* を選び、次の4つにチェック
   - Pushes
   - Pull requests
   - Issues
   - Pull request reviews
6. Add webhook

登録した直後に `ping` が飛びます。**Recent Deliveries** で緑のチェックが付けば疎通OKです。

---

## 6. チームを登録する

1. 本番URLを開く
2. GitHubでログインする
3. 「このイベントを主催する」からイベントを作成する
4. 運営設定でチーム名を登録し、発行された部屋番号または招待URLを共有する

リポジトリはログイン中のアカウントの一覧から選べるので、打ち間違いは起きません。
一覧に出るのはパブリックリポジトリのみです。プライベートリポジトリを使う場合は
「一覧に無い（手入力する）」に切り替えて `owner/repository` を直接入力してください。
その場合は、Webhookの送信元と**完全一致**しているか必ず確認してください。ずれていると、200が返るのに画面が動きません。

---

## 7. 動作確認

上から順に確認してください。

- [ ] 本番URLが開ける
- [ ] 「GitHubでログイン」でGitHubに飛び、戻ってきてアバターと名前が出る
- [ ] GitHubログイン後、イベントコードとチームの部屋番号（または招待URL）で参加でき、`/dashboard` に移動する
- [ ] ダッシュボードに自分のチームが「自分のチーム」バッジ付きで出る
- [ ] リポジトリに何かpushすると、10秒以内に「みんなの動き」に増える
- [ ] スコアとランキングが動く
- [ ] `/help` で質問を投稿できる
- [ ] 別アカウントでその質問に回答でき、質問者が「これで解決した」を押すと解決済みになる
- [ ] 運営への相談にメッセージを送れる
- [ ] 同じGitHubアカウントで別イベントへ参加・切替でき、前のイベントのチーム・点数・質問が混ざらない
- [ ] WakaTimeを2人以上が連携し、個人時間とチーム合計を確認できる（連携を使う場合）

pushしても反映されない場合は、GitHub側の Recent Deliveries を見てください。

| レスポンス | 原因 |
| --- | --- |
| 401 | `GITHUB_WEBHOOK_SECRET` がGitHub側と一致していない |
| 500 | サーバー側に環境変数が設定されていない |
| 200 で `ignored: true` | 対象外のイベント |
| 200 なのに画面が変わらない | `teams.github_repo` とリポジトリ名が不一致 |

---

## なぜSupabaseが必須なのか

Supabaseを設定しない場合、アプリはメモリ上のシードデータで動きます。ローカルで動かす分には問題ありませんが、Vercelはリクエストごとに別のインスタンスが応答することがあるため、

- Webhookで受け取った記録が、次に画面を開いたときには消えている
- 人によって見えるランキングが違う

という状態になります。**本番では必ずSupabaseを設定してください。**

---

## 運用中に困ったら

**ログインできない**
OAuth Appのコールバックが `本番URL/api/auth/github/callback` と完全一致しているか確認。`https` と `http`、末尾スラッシュの有無も一致させる。

**ログインしてもすぐログアウトされる**
`AUTH_SECRET` を変更すると、既存のcookieが全部無効になります。変更した場合は再ログインが必要です。セッションの有効期限は12時間です。

**運営の画面にならない（参加コードが右上に出ない）**
トップへ戻り、「主催しているイベント」から対象イベントを開いてください。
別のGitHubアカウントで作ったイベントは管理できません。

**スコアがおかしい**
新規DBなら`supabase/schema.sql`、既存DBなら上記の移行SQLが適用されているか確認してください。Webhookの重複排除・履歴追加・加点は
DB内の1トランザクションで行われるため、同時配信でも上書きによる点数欠落を防ぎます。
