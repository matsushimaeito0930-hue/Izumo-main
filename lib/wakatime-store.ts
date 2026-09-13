import { createServerSupabaseClient } from "@/lib/supabase";
import { getMembershipInEvent } from "@/lib/store";
import {
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
};

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

export async function getWakaTimeDashboardSummary({
  githubLogin,
  eventId,
  eventStartedAt
}: {
  githubLogin: string;
  eventId: string;
  eventStartedAt: string | null;
}): Promise<WakaTimeDashboardSummary> {
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const viewer = await findUserByGitHubLogin(githubLogin);
  const endDate = tokyoDate(new Date());
  const startDate = eventStartedAt ? tokyoDate(new Date(eventStartedAt)) : endDate;

  if (!viewer) {
    return {
      connected: false,
      teamId: null,
      teamTotalSeconds: 0,
      totalMembers: 0,
      connectedMembers: 0,
      startDate,
      endDate,
      members: []
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
      members: []
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
      members: []
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

  const members = await Promise.all(
    ((usersResult.data ?? []) as MemberRow[]).map(async (member) => {
      const connection = connections.get(member.id);
      if (!connection) {
        return {
          githubUsername: member.github_username,
          displayName: member.display_name,
          seconds: 0,
          connected: false,
          unavailable: false
        };
      }

      const result = await secondsForConnection(connection, startDate, endDate);
      return {
        githubUsername: member.github_username,
        displayName: member.display_name,
        seconds: result.seconds,
        connected: true,
        unavailable: result.unavailable
      };
    })
  );

  return {
    connected: Boolean(viewerConnection),
    teamId,
    teamTotalSeconds: members.reduce((total, member) => total + member.seconds, 0),
    totalMembers: members.length,
    connectedMembers: members.filter((member) => member.connected).length,
    startDate,
    endDate,
    members: members.sort((a, b) => b.seconds - a.seconds)
  };
}
