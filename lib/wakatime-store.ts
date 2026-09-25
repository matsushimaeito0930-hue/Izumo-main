import { createServerSupabaseClient } from "@/lib/supabase";
import { getHackVerseState, getMembershipInEvent } from "@/lib/store";
import {
  fetchWakaTimeDailySeconds,
  fetchWakaTimeSeconds,
  refreshWakaTimeToken,
  type WakaTimeTokens
} from "@/lib/wakatime";

type WakaTimeConnectionRow = {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};

type MemberRow = {
  id: string;
  github_username: string;
  display_name: string;
};

export type WakaTimeMemberSummary = {
  githubUsername: string;
  displayName: string;
  seconds: number;
  connected: boolean;
  unavailable: boolean;
};

export type WakaTimeDashboardSummary = {
  connected: boolean;
  teamId: string | null;
  teamTotalSeconds: number;
  totalMembers: number;
  connectedMembers: number;
  startDate: string;
  endDate: string;
  members: WakaTimeMemberSummary[];
  dailyTotals?: WakaTimeDailyTotal[];
};

export type WakaTimeDailyTotal = {
  date: string;
  seconds: number;
};

export type WakaTimeLeaderboardTeam = {
  teamId: string;
  teamName: string;
  seconds: number;
  totalMembers: number;
  connectedMembers: number;
};

const leaderboardCache = new Map<
  string,
  { expiresAt: number; value: { startDate: string; endDate: string; teams: WakaTimeLeaderboardTeam[] } }
>();

function tokyoDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function tokyoDateDaysAgo(days: number): string {
  return tokyoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

function laterDate(left: string, right: string): string {
  return left > right ? left : right;
}

function datesInclusive(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function findUserByGitHubLogin(githubLogin: string): Promise<MemberRow | null> {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("users")
    .select("id,github_username,display_name")
    .ilike("github_username", githubLogin)
    .maybeSingle();

  if (error) throw error;
  return (data as MemberRow | null) ?? null;
}

export async function saveWakaTimeConnection(
  githubLogin: string,
  tokens: WakaTimeTokens
): Promise<void> {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await findUserByGitHubLogin(githubLogin);
  if (!user) {
    throw new Error("Join a team before connecting WakaTime.");
  }

  const { error } = await supabase.from("wakatime_connections").upsert(
    {
      user_id: user.id,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
}

export async function removeWakaTimeConnection(githubLogin: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await findUserByGitHubLogin(githubLogin);
  if (!user) return;

  const { error } = await supabase.from("wakatime_connections").delete().eq("user_id", user.id);
  if (error) throw error;
}

async function saveRefreshedTokens(userId: string, tokens: WakaTimeTokens): Promise<void> {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase
    .from("wakatime_connections")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);

  if (error) throw error;
}

async function secondsForConnection(
  connection: WakaTimeConnectionRow,
  startDate: string,
  endDate: string
): Promise<{ seconds: number; unavailable: boolean }> {
  let tokens: WakaTimeTokens = {
    accessToken: connection.access_token,
    refreshToken: connection.refresh_token,
    expiresAt: connection.expires_at
  };

  try {
    if (
      tokens.expiresAt &&
      Date.parse(tokens.expiresAt) <= Date.now() + 60_000 &&
      tokens.refreshToken
    ) {
      tokens = await refreshWakaTimeToken(tokens.refreshToken);
      await saveRefreshedTokens(connection.user_id, tokens);
    }

    return {
      seconds: await fetchWakaTimeSeconds({
        accessToken: tokens.accessToken,
        start: startDate,
        end: endDate
      }),
      unavailable: false
    };
  } catch (error) {
    if (error instanceof Error && error.name === "WakaTimeUnauthorizedError" && tokens.refreshToken) {
      try {
        const refreshed = await refreshWakaTimeToken(tokens.refreshToken);
        await saveRefreshedTokens(connection.user_id, refreshed);
        return {
          seconds: await fetchWakaTimeSeconds({
            accessToken: refreshed.accessToken,
            start: startDate,
            end: endDate
          }),
          unavailable: false
        };
      } catch {
        return { seconds: 0, unavailable: true };
      }
    }

    return { seconds: 0, unavailable: true };
  }
}

async function dailySecondsForConnection(
  connection: WakaTimeConnectionRow,
  startDate: string,
  endDate: string
): Promise<{ days: WakaTimeDailyTotal[]; unavailable: boolean }> {
  let tokens: WakaTimeTokens = {
    accessToken: connection.access_token,
    refreshToken: connection.refresh_token,
    expiresAt: connection.expires_at
  };

  async function fetchDays() {
    return fetchWakaTimeDailySeconds({ accessToken: tokens.accessToken, start: startDate, end: endDate });
  }

  try {
    if (tokens.expiresAt && Date.parse(tokens.expiresAt) <= Date.now() + 60_000 && tokens.refreshToken) {
      tokens = await refreshWakaTimeToken(tokens.refreshToken);
      await saveRefreshedTokens(connection.user_id, tokens);
    }
    return { days: await fetchDays(), unavailable: false };
  } catch (error) {
    if (error instanceof Error && error.name === "WakaTimeUnauthorizedError" && tokens.refreshToken) {
      try {
        tokens = await refreshWakaTimeToken(tokens.refreshToken);
        await saveRefreshedTokens(connection.user_id, tokens);
        return { days: await fetchDays(), unavailable: false };
      } catch {
        // 詳細グラフが取得できなくても、通常の合計表示は維持する。
      }
    }
    return { days: [], unavailable: true };
  }
}

async function mapWithConcurrency<Input, Output>(
  inputs: Input[],
  limit: number,
  mapper: (input: Input) => Promise<Output>
): Promise<Output[]> {
  const results = new Array<Output>(inputs.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(inputs[currentIndex]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
  return results;
}

/**
 * イベント全体の開発時間ランキング。個人の時間は返さず、同一イベント内のチーム合計だけを返す。
 * WakaTimeへのリクエスト数を抑えるため、短時間だけイベント単位でキャッシュする。
 */
export async function getWakaTimeEventLeaderboard({
  eventId,
  eventStartedAt,
  forceRefresh = false
}: {
  eventId: string;
  eventStartedAt: string | null;
  forceRefresh?: boolean;
}): Promise<{ startDate: string; endDate: string; teams: WakaTimeLeaderboardTeam[] }> {
  const cached = leaderboardCache.get(eventId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const endDate = tokyoDate(new Date());
  const startDate = eventStartedAt ? tokyoDate(new Date(eventStartedAt)) : endDate;
  const state = await getHackVerseState(eventId);
  const teams = state.teams;
  const teamIds = teams.map((team) => team.id);
  if (teamIds.length === 0) return { startDate, endDate, teams: [] };

  const { data: membershipRows, error: membershipsError } = await supabase
    .from("team_members")
    .select("team_id,user_id")
    .in("team_id", teamIds);
  if (membershipsError) throw membershipsError;

  const memberships = (membershipRows ?? []) as Array<{ team_id: string; user_id: string }>;
  const userIds = [...new Set(memberships.map((member) => member.user_id))];
  const connectionsResult = userIds.length
    ? await supabase
        .from("wakatime_connections")
        .select("user_id,access_token,refresh_token,expires_at")
        .in("user_id", userIds)
    : { data: [], error: null };
  if (connectionsResult.error) throw connectionsResult.error;

  const connections = new Map(
    ((connectionsResult.data ?? []) as WakaTimeConnectionRow[]).map((connection) => [connection.user_id, connection])
  );
  const results = await mapWithConcurrency(userIds, 3, async (userId) => {
    const connection = connections.get(userId);
    if (!connection) return { userId, seconds: 0, connected: false };
    const result = await secondsForConnection(connection, startDate, endDate);
    return { userId, seconds: result.seconds, connected: !result.unavailable };
  });
  const resultByUserId = new Map(results.map((result) => [result.userId, result]));

  const value = {
    startDate,
    endDate,
    teams: teams
      .map((team) => {
        const members = memberships.filter((membership) => membership.team_id === team.id);
        const totals = members.map((member) => resultByUserId.get(member.user_id));
        return {
          teamId: team.id,
          teamName: team.name,
          seconds: totals.reduce((total, member) => total + (member?.seconds ?? 0), 0),
          totalMembers: members.length,
          connectedMembers: totals.filter((member) => member?.connected).length
        };
      })
      .sort((left, right) => right.seconds - left.seconds || left.teamName.localeCompare(right.teamName))
  };
  leaderboardCache.set(eventId, { expiresAt: Date.now() + 5 * 60 * 1000, value });
  return value;
}

export async function getWakaTimeDashboardSummary({
  githubLogin,
  eventId,
  eventStartedAt,
  includeDaily = false
}: {
  githubLogin: string;
  eventId: string;
  eventStartedAt: string | null;
  includeDaily?: boolean;
}): Promise<WakaTimeDashboardSummary> {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const viewer = await findUserByGitHubLogin(githubLogin);
  const endDate = tokyoDate(new Date());
  const startDate = eventStartedAt ? tokyoDate(new Date(eventStartedAt)) : endDate;
  const dailyStartDate = laterDate(startDate, tokyoDateDaysAgo(6));

  if (!viewer) {
    return {
      connected: false,
      teamId: null,
      teamTotalSeconds: 0,
      totalMembers: 0,
      connectedMembers: 0,
      startDate,
      endDate,
      members: [],
      ...(includeDaily ? { dailyTotals: [] } : {})
    };
  }

  // 同じ利用者が複数イベントのチームに所属できるため、現在のイベントで必ず絞る。
  const viewerMembership = await getMembershipInEvent({
    eventId,
    githubUsername: githubLogin
  });
  const teamId = viewerMembership?.teamId ?? null;

  const { data: viewerConnection, error: viewerConnectionError } = await supabase
    .from("wakatime_connections")
    .select("user_id")
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (viewerConnectionError) throw viewerConnectionError;

  if (!teamId) {
    return {
      connected: Boolean(viewerConnection),
      teamId: null,
      teamTotalSeconds: 0,
      totalMembers: 0,
      connectedMembers: 0,
      startDate,
      endDate,
      members: [],
      ...(includeDaily ? { dailyTotals: [] } : {})
    };
  }

  const { data: memberships, error: membersError } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId);
  if (membersError) throw membersError;

  const userIds = (memberships ?? []).map((member) => member.user_id as string);
  if (userIds.length === 0) {
    return {
      connected: Boolean(viewerConnection),
      teamId,
      teamTotalSeconds: 0,
      totalMembers: 0,
      connectedMembers: 0,
      startDate,
      endDate,
      members: [],
      ...(includeDaily ? { dailyTotals: [] } : {})
    };
  }

  const [usersResult, connectionsResult] = await Promise.all([
    supabase.from("users").select("id,github_username,display_name").in("id", userIds),
    supabase
      .from("wakatime_connections")
      .select("user_id,access_token,refresh_token,expires_at")
      .in("user_id", userIds)
  ]);
  if (usersResult.error || connectionsResult.error) {
    throw usersResult.error ?? connectionsResult.error;
  }

  const connections = new Map(
    ((connectionsResult.data ?? []) as WakaTimeConnectionRow[]).map((connection) => [
      connection.user_id,
      connection
    ])
  );

  const memberResults = await Promise.all(
    ((usersResult.data ?? []) as MemberRow[]).map(async (member) => {
      const connection = connections.get(member.id);
      if (!connection) {
        return {
          githubUsername: member.github_username,
          displayName: member.display_name,
          seconds: 0,
          connected: false,
          unavailable: false,
          days: [] as WakaTimeDailyTotal[]
        };
      }

      const result = await secondsForConnection(connection, startDate, endDate);
      const daily = includeDaily
        ? await dailySecondsForConnection(connection, dailyStartDate, endDate)
        : { days: [], unavailable: false };
      return {
        githubUsername: member.github_username,
        displayName: member.display_name,
        seconds: result.seconds,
        connected: true,
        // 詳細グラフだけの一時エラーで、通常の連携状態を「再連携が必要」にしない。
        unavailable: result.unavailable,
        days: daily.days
      };
    })
  );

  const members = memberResults.map((member) => ({
    githubUsername: member.githubUsername,
    displayName: member.displayName,
    seconds: member.seconds,
    connected: member.connected,
    unavailable: member.unavailable
  }));
  const dailyTotals = includeDaily
    ? datesInclusive(dailyStartDate, endDate).map((date) => ({
        date,
        seconds: memberResults.reduce(
          (total, member) => total + (member.days.find((day) => day.date === date)?.seconds ?? 0),
          0
        )
      }))
    : undefined;

  return {
    connected: Boolean(viewerConnection),
    teamId,
    teamTotalSeconds: members.reduce((total, member) => total + member.seconds, 0),
    totalMembers: members.length,
    connectedMembers: members.filter((member) => member.connected).length,
    startDate,
    endDate,
    members: members.sort((a, b) => b.seconds - a.seconds),
    ...(dailyTotals ? { dailyTotals } : {})
  };
}
