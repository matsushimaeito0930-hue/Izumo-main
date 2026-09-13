# HackRadar 実装引き継ぎ（2026-09-13）

## 現在地

- `main`に、イベント単位の所属・権限・得点・質問・DM・WakaTime集計の分離を実装。
- Webhookの活動追加、重複排除、チーム加点をPostgreSQLの`record_activity_atomic`に一本化。旧DBでの非原子的なフォールバックは削除。
- ブラウザのSupabase権限から本文・招待コード・個人情報への直接アクセスを外し、Realtimeは`app_change_signal`のみ購読。
- 既存DB向けの移行SQLは`supabase/migrations/20260913_event_isolation_and_webhook_atomic.sql`。新規DBは`supabase/schema.sql`。
- ユーザーは既存Supabase DBの移行SQLが成功したと報告。`cf3e086`をGitHubへpushし、Vercel ProductionとGitHub Actionsの成功を確認済み。
- 公開URLで`/`が200、未ログインの`/api/state`と`/api/wakatime/summary`が401であることを確認。外部サービスの実アカウントを使った通し試験は**未実施**。

## 通過したローカル検証

- `npm.cmd test`: 17ファイル・60件成功。
- `npm.cmd run verify:flow`: 65件成功。
- `npm.cmd run verify:core`: 67件成功。
- `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run build`: 成功。
- `npm.cmd audit --audit-level=low`: 脆弱性0件。
- `next start -p 3101`で`/`、`/dashboard`、`/api/state`、`/api/wakatime/summary`がHTTP 200（環境変数のないローカルメモリモード）。

## 次に必要なこと

1. Supabase SQL Editorで`record_activity_atomic`と`app_change_signal`、`event_members`の移行結果を確認する。SQLの実行成功はユーザー報告のみで、DB内容の読み取り検証は未実施。
2. 本番でGitHubログイン、複数イベント切替、部屋番号参加、質問・DMの分離、GitHub Webhookの5種の活動と重複配信を通しで確認する。
3. WakaTimeを実アカウント2人以上で連携し、個人時間・チーム合計・別イベント参加時の集計を確認する。
4. 失敗した実環境テストがあれば修正して再検証する。公式スコアを預けるハッカソンへの導入判定はその後に行う。

## Claudeへの引き継ぎ時

この文書、`docs/hackathon-readiness-audit-2026-09-12.md`、`DEPLOY.md`、最新のGit履歴を渡す。APIキー・OAuth secret・`.env.local`は渡さない。Claudeによるコードレビューはまだ一度も実行していない。Claude Code CLIが認証切れなら、ユーザー本人が`claude auth login`を実行する。リポジトリ内容をAnthropicへ送るレビューは、ユーザーの明示的な了承を得てから行う。
