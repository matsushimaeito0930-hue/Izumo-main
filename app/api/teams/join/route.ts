import { NextResponse } from "next/server";
import {
  isGitHubAuthConfigured,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  serializeIdentity,
  type GitHubIdentity
} from "@/lib/github-auth";
import { ensureRepoWebhook, type WebhookSetupResult } from "@/lib/github-webhook-setup";
import { getCurrentIdentity } from "@/lib/session";
import {
  getEventByJoinCode,
  joinTeamWithInvite,
  setTeamRepo,
  verifyJoinCode
} from "@/lib/store";

export const dynamic = "force-dynamic";

function setEventSession(
  response: NextResponse,
  identity: GitHubIdentity | null,
  eventId: string | undefined,
  role: "participant" | "mentor" | "admin" | "judge"
) {
  if (!identity || !eventId) return response;
  response.cookies.set(
    SESSION_COOKIE,
    serializeIdentity({ ...identity, role, eventId }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE
    }
  );
  return response;
}

export async function POST(request: Request) {
  const identity = getCurrentIdentity();

  // 審査員は閲覧専用。画面を書き換えて送っても通さない。
  if (identity?.role === "judge") {
    return NextResponse.json(
      { error: "審査員は閲覧のみです。投稿はできません。" },
      { status: 403 }
    );
  }

  if (isGitHubAuthConfigured() && !identity) {
    return NextResponse.json(
      { error: "GitHubでログインしてからチームに参加してください。" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    /** イベントの招待コード。どのハッカソンかを決める。 */
    eventCode?: string;
    /** チームの部屋番号。そのイベントの中のどのチームかを決める。 */
    joinCode?: string;
    displayName?: string;
    githubRepo?: string;
  };

  const displayName = identity?.displayName ?? body.displayName?.trim();
  const githubUsername = identity?.login;

  if (!body.joinCode?.trim() || !displayName) {
    return NextResponse.json(
      { error: "部屋番号と表示名を入力してください。" },
      { status: 400 }
    );
  }

  const event = await getEventByJoinCode(body.eventCode);
  const roomCode = body.joinCode.trim().toUpperCase();
  const eventCode = body.eventCode?.trim().toUpperCase() ?? "";

  // 招待コードでイベントを特定する。将来ハッカソンを複数動かしたときに、
  // 部屋番号だけでは別イベントの部屋に入れてしまうため、ここで先に絞る。
  if (body.eventCode?.trim() && !event) {
    return NextResponse.json(
      { error: "イベント参加コードが違います。主催者から配られたコードを確認してください。" },
      { status: 403 }
    );
  }

  if (event) {
    if (!eventCode) {
      return NextResponse.json(
        { error: "招待コードを入力してください。運営から配られたイベントのコードです。" },
        { status: 400 }
      );
    }

    if (!(await verifyJoinCode(eventCode))) {
      return NextResponse.json(
        { error: "招待コードが違います。運営から配られたコードを確認してください。" },
        { status: 403 }
      );
    }
  }

  // 2つの欄を取り違えたときは、その場で気づけるようにする。
  if (event?.join_code && roomCode === event.join_code.toUpperCase()) {
    return NextResponse.json(
      {
        error:
          "部屋番号の欄に招待コードが入っています。部屋番号は、運営から配られたチームごとのコードです。"
      },
      { status: 400 }
    );
  }

  try {
    const session = await joinTeamWithInvite({
      code: body.joinCode,
      displayName,
      githubUsername,
      // 招待から入るイベントでは、以前の主催者ロールを引き継がない。
      role: "participant"
    });

    // リポジトリは任意。指定があればこの場で紐づけ、Webhookも自動登録する。
    let webhook: WebhookSetupResult | null = null;

    if (body.githubRepo?.trim() && session.teamId) {
      try {
        await setTeamRepo({ teamId: session.teamId, githubRepo: body.githubRepo });
        webhook = await ensureRepoWebhook({
          accessToken: identity?.accessToken,
          scopes: identity?.scopes,
          githubRepo: body.githubRepo,
          requestUrl: request.url
        });
      } catch (repoError) {
        // 参加自体は成立させ、リポジトリはあとから設定してもらう。
        const response = NextResponse.json({
          session: {
            ...session,
            role: "participant"
          },
          repoWarning:
            repoError instanceof Error
              ? repoError.message
              : "リポジトリを設定できませんでした。"
        });
        return setEventSession(
          response,
          identity,
          session.eventId,
          "participant"
        );
      }
    }

    const response = NextResponse.json({
      session: {
        ...session,
        role: "participant"
      },
      webhook
    });
    return setEventSession(
      response,
      identity,
      session.eventId,
      "participant"
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "チームに参加できませんでした。" },
      { status: 400 }
    );
  }
}
