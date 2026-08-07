const MIGRATION_HINT =
  "Supabaseのメンター用更新がまだ適用されていません。Supabase SQL Editorで supabase/mentor-migration.sql を1回実行してから、もう一度お試しください。";

/** Supabaseの低レベルエラーを、登録画面で次に取る行動が分かる文に変換する。 */
export function getMentorJoinErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("specialty") ||
    normalized.includes("users_role_check") ||
    normalized.includes("author_role_check") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the")
  ) {
    return MIGRATION_HINT;
  }

  if (
    normalized.includes("invite code") ||
    normalized.includes("招待") ||
    normalized.includes("team_invites")
  ) {
    return "招待コードが見つかりません。イベント名を更新した場合は、運営から最新のコードを発行してもらってください。";
  }

  return "メンター登録に失敗しました。入力内容と招待コードを確認して、もう一度お試しください。";
}

