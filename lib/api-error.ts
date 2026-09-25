import { NextResponse } from "next/server";

/**
 * APIの失敗を、画面に出して意味のある日本語にして返す。
 *
 * Supabaseのエラーは Error のインスタンスではなく
 * `{ message, details, hint, code }` の素のオブジェクトで返る。
 * `error instanceof Error` だけで判定すると理由が丸ごと捨てられ、
 * 「〜できませんでした」しか出ない。原因の切り分けができなくなるので、
 * ここで取り出してコードごとに次の一手を添える。
 */

const LATEST_MIGRATION = "supabase/migrations/20260918_direct_message_attachments.sql";

/** DBのエラーコードと、利用者が次にやるべきこと。 */
const DB_HINTS: Record<string, string> = {
  "42P01": `必要な表がまだありません。Supabaseで supabase/schema.sql を実行してください。`,
  "42703": `DBの項目が足りません。Supabaseで ${LATEST_MIGRATION} を実行してください。`,
  PGRST204: `DBの項目が足りません。Supabaseで ${LATEST_MIGRATION} を実行してください。`,
  "42501":
    "DBへの書き込みが拒否されました。SUPABASE_SERVICE_ROLE_KEYが正しいか確認してください。",
  "23503": "紐づく相手がDBに見つかりません。ログアウトして入り直してください。",
  "23505": "同じ内容がすでに登録されています。",
  "23514": `内容がDBの条件に合いません。${LATEST_MIGRATION} が未実行の可能性があります。`,
  "22P02": "IDの形式が不正です。ログアウトして入り直してください。",
  PGRST116: "対象が1件に定まりませんでした。重複した登録がないか確認してください。"
};

export function describeError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return { message: error.message, code: undefined as string | undefined };
  }

  if (error && typeof error === "object") {
    const source = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [source.message, source.details, source.hint]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" / ");

    if (parts) {
      return {
        message: parts,
        code: typeof source.code === "string" ? source.code : undefined
      };
    }
  }

  return { message: fallback, code: undefined as string | undefined };
}

/** 失敗を400で返す。ログにも残すので、画面を見られない環境でも後から追える。 */
export function apiFailure(scope: string, error: unknown, fallback: string) {
  const { message, code } = describeError(error, fallback);
  const hint = code ? DB_HINTS[code] : undefined;

  // Storageのバケット未作成はコードが付かないことがあるので、本文からも拾う。
  const bucketMissing =
    /bucket/i.test(message) && /not found|does not exist/i.test(message);

  const resolved = hint
    ? `${hint}（${code}: ${message}）`
    : bucketMissing
      ? `画像の保存先がまだありません。Supabaseで ${LATEST_MIGRATION} を実行してください。（${message}）`
      : message;

  console.error(`[${scope}]`, code ?? "-", message, error);

  return NextResponse.json({ error: resolved, code }, { status: 400 });
}
