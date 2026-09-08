import { randomUUID } from "node:crypto";
import {
  ACTIVITY_LABELS,
  DEFAULT_SCORE_BY_ACTIVITY,
  normalizeScoreConfig
} from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { getHouseLevel } from "@/lib/house";
import {
  seedActivities,
  seedChatMessages,
  seedHelpPosts,
  seedHelpReplies,
  seedTeamInvites,
  seedTeamMembers,
  seedTeams,
  seedUsers
} from "@/lib/seed";
import { createServerSupabaseClient } from "@/lib/supabase";
import type {
  Activity,
  ActivityType,
  ActivityView,
  AppSession,
  ChatChannel,
  ChatMessage,
  ContributorView,
  DirectMessage,
  DirectMessageContact,
  HackVerseState,
  ScoreConfig,
  HelpPost,
  HelpPostView,
  HackEvent,
  HelpReply,
  HelpStatus,
  Team,
  TeamInvite,
  TeamInviteView,
  TeamMember,
  TeamMemberView,
  User,
  UserRole
} from "@/lib/types";

type MemoryStore = {
  users: User[];
  teams: Team[];
  activities: Activity[];
  helpPosts: HelpPost[];
  helpReplies: HelpReply[];
  messages: ChatMessage[];
  directMessages: DirectMessage[];
  teamMembers: TeamMember[];
  teamInvites: TeamInvite[];
  event: HackEvent | null;
};

const MEMORY_STORE_VERSION = "empty-teams-v1";

function normalizeTeam(team: Team): Team {
  return {
    ...team,
    commit_count: team.commit_count ?? 0
  };
}

declare global {
  var hackVerseMemoryStore: MemoryStore | undefined;
  var hackVerseMemoryStoreVersion: string | undefined;
}

function cloneStore(): MemoryStore {
  return {
    users: structuredClone(seedUsers),
    teams: structuredClone(seedTeams),
    activities: structuredClone(seedActivities),
    messages: structuredClone(seedChatMessages),
    directMessages: [],
    helpPosts: structuredClone(seedHelpPosts),
    helpReplies: structuredClone(seedHelpReplies),
    teamMembers: structuredClone(seedTeamMembers),
    teamInvites: structuredClone(seedTeamInvites),
    event: null
  };
}

function getMemoryStore(): MemoryStore {
  if (globalThis.hackVerseMemoryStoreVersion !== MEMORY_STORE_VERSION) {
    globalThis.hackVerseMemoryStore = cloneStore();
    globalThis.hackVerseMemoryStoreVersion = MEMORY_STORE_VERSION;
  }

  globalThis.hackVerseMemoryStore ??= cloneStore();
  return globalThis.hackVerseMemoryStore;
}

/**
 * チーム内の誰がどれだけ動いたかを集計する。
 *
 * 実行者はGitHubのアカウント名で入ってくるので、チームのメンバー一覧と
 * 突き合わせて表示名に直す。突き合わない場合（メンバー登録していない人の
 * pushなど）はアカウント名をそのまま出す。
 */
function buildContributors(
  activities: Activity[],
  members: TeamMemberView[]
): ContributorView[] {
  const memberByLogin = new Map(
    members.map((member) => [member.github_username.toLowerCase(), member])
  );
  const byKey = new Map<string, ContributorView>();

  for (const activity of activities) {
    const login = activity.actor_login?.trim();
    if (!login) continue;

    const key = `${activity.team_id}::${login.toLowerCase()}`;
    const member = memberByLogin.get(login.toLowerCase());
    const commits =
      activity.type === "push" && typeof activity.metadata?.commitCount === "number"
        ? activity.metadata.commitCount
        : 0;

    const current = byKey.get(key);
    if (current) {
      current.score += activity.score_delta;
      current.activity_count += 1;
      current.commit_count += commits;
      if (Date.parse(activity.created_at) > Date.parse(current.last_active_at)) {
        current.last_active_at = activity.created_at;
      }
      continue;
    }

    byKey.set(key, {
      team_id: activity.team_id,
      github_username: login,
      display_name: member?.display_name ?? login,
      avatar_url: member?.avatar_url ?? activity.actor_avatar_url ?? null,
      score: activity.score_delta,
      activity_count: 1,
      commit_count: commits,
      last_active_at: activity.created_at
    });
  }

  return [...byKey.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.activity_count - a.activity_count;
  });
}

function withViews(
  users: User[],
  teams: Team[],
  activities: Activity[],
  helpPosts: HelpPost[],
  helpReplies: HelpReply[],
  messages: ChatMessage[],
  teamMembers: TeamMember[] = [],
  /** 集計用。フィードは直近だけを出すので、集計には別の全件を渡す。 */
  contributorActivities: Activity[] = activities
): HackVerseState {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const usersById = new Map(users.map((user) => [user.id, user]));

  const activityViews: ActivityView[] = activities
    .filter((activity) => teamsById.has(activity.team_id))
    .map((activity) => ({
      ...activity,
      team_name: teamsById.get(activity.team_id)?.name ?? "Unknown Team"
    }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const repliesByPost = new Map<string, HelpReply[]>();
  for (const reply of helpReplies) {
    const bucket = repliesByPost.get(reply.help_post_id) ?? [];
    bucket.push(reply);
    repliesByPost.set(reply.help_post_id, bucket);
  }

  const helpPostViews: HelpPostView[] = helpPosts
    .filter((post) => teamsById.has(post.team_id))
    .map((post) => ({
      ...post,
      author_name: post.is_anonymous
        ? "匿名"
        : usersById.get(post.user_id)?.display_name ?? "匿名",
      author_github: usersById.get(post.user_id)?.github_username ?? null,
      team_name: teamsById.get(post.team_id)?.name ?? "不明なチーム",
      replies: (repliesByPost.get(post.id) ?? []).sort((a, b) => {
        // 採用された回答を先頭に、それ以外は古い順。
        if (a.is_accepted !== b.is_accepted) return a.is_accepted ? -1 : 1;
        return Date.parse(a.created_at) - Date.parse(b.created_at);
      })
    }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  // 誰がどのチームに入っているか。GitHubユーザー名が分かる人だけ載せる。
  const memberViews: TeamMemberView[] = teamMembers
    .map((member) => {
      if (!teamsById.has(member.team_id)) return null;
      const user = usersById.get(member.user_id);
      if (!user) return null;
      return {
        team_id: member.team_id,
        github_username: user.github_username,
        display_name: user.display_name,
        avatar_url: user.avatar_url
      };
    })
    .filter((member): member is TeamMemberView => member !== null)
    .sort((a, b) => a.github_username.localeCompare(b.github_username));

  return {
    teams: teams.map(normalizeTeam).sort((a, b) => b.score - a.score),
    activities: activityViews,
    helpPosts: helpPostViews,
    members: memberViews,
    contributors: buildContributors(
      contributorActivities.filter((activity) => teamsById.has(activity.team_id)),
      memberViews
    ),
    messages: messages
      .slice()
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    updatedAt: new Date().toISOString()
  };
}

const ACTIVITY_COLUMNS =
  "id,team_id,type,message,score_delta,actor_login,actor_avatar_url,metadata,created_at";
/** actor_login を足す前のDBでも読めるようにしておく列。 */
const LEGACY_ACTIVITY_COLUMNS = "id,team_id,type,message,score_delta,metadata,created_at";

/**
 * schema.sql をまだ流していないDBかどうかを、エラーの内容から判定する。
 *
 * デプロイとDB更新の順番が前後しても、画面が黙って空になるのを避けるため。
 */
function isMissingActorColumn(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return message.includes("actor_login") || message.includes("actor_avatar_url");
}

export async function getSupabaseHackVerseState(eventId?: string | null): Promise<HackVerseState> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const teamsQuery = supabase
    .from("teams")
    .select("id,event_id,name,github_repo,score,commit_count,house_level,created_at");
  if (eventId) teamsQuery.eq("event_id", eventId);

  const [
    usersResult,
    teamsResult,
    activitiesResult,
    helpPostsResult,
    helpRepliesResult,
    messagesResult,
    teamMembersResult,
    contributorResult
  ] =
    await Promise.all([
      supabase.from("users").select("*"),
      teamsQuery,
      supabase
        .from("activities")
        .select(ACTIVITY_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("help_posts").select("*").order("created_at", { ascending: false }).limit(30),
      supabase
        .from("help_replies")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200),
      supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(80),
      supabase.from("team_members").select("*"),
      // 貢献の集計は全期間が要るので、フィードとは別に軽い列だけを取る。
      supabase
        .from("activities")
        .select("id,team_id,type,score_delta,actor_login,actor_avatar_url,metadata,created_at")
        .not("actor_login", "is", null)
        .order("created_at", { ascending: false })
        .limit(3000)
    ]);

  // schema.sql の適用前でも、実行者の列が無いだけで画面が真っ白にならないようにする。
  let activities: { data: unknown[] | null; error: { message?: string } | null } =
    activitiesResult;
  if (activities.error && isMissingActorColumn(activities.error)) {
    activities = await supabase
      .from("activities")
      .select(LEGACY_ACTIVITY_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(30);
  }

  if (teamsResult.error || activities.error) {
    throw teamsResult.error ?? activities.error;
  }

  return withViews(
    (usersResult.data ?? seedUsers) as User[],
    ((teamsResult.data ?? seedTeams) as Team[]).map(normalizeTeam),
    (activities.data ?? seedActivities) as Activity[],
    (helpPostsResult.data ?? seedHelpPosts) as HelpPost[],
    (helpRepliesResult.error
      ? []
      : (helpRepliesResult.data ?? seedHelpReplies)) as HelpReply[],
    (messagesResult.error
      ? []
      : ((messagesResult.data ?? seedChatMessages) as ChatMessage[])).filter(
      (message) => !eventId || message.event_id === eventId
    ),
    (teamMembersResult.error ? [] : (teamMembersResult.data ?? [])) as TeamMember[],
    (contributorResult.error ? [] : (contributorResult.data ?? [])) as Activity[]
  );
}

export async function getHackVerseState(eventId?: string | null): Promise<HackVerseState> {
  if (isSupabaseConfigured()) {
    try {
      return await getSupabaseHackVerseState(eventId);
    } catch {
      // Keep local development usable when Supabase is unavailable.
    }
  }

  const store = getMemoryStore();
  const teams = eventId ? store.teams.filter((team) => team.event_id === eventId) : store.teams;
  return withViews(
    store.users,
    teams,
    store.activities,
    store.helpPosts,
    store.helpReplies,
    store.messages.filter((message) => !eventId || message.event_id === eventId),
    store.teamMembers
  );
}

/**
 * 文の主語。実行者が分かればその人、分からなければチーム名にする。
 * 「誰がやったか」を先頭に出すことで、フィードを流し見しても動きが追える。
 */
function activitySubject(teamName: string, actorLogin: string | null): string {
  return actorLogin?.trim() || teamName;
}

function makeActivityMessage(
  teamName: string,
  type: ActivityType,
  metadata: Record<string, unknown>
): string {
  if (type === "push") {
    const commitCount =
      typeof metadata.commitCount === "number" ? metadata.commitCount : 1;
    return `${teamName} が ${commitCount} 件のコミットをプッシュしました`;
  }

  if (
    (type === "pull_request_opened" || type === "pull_request_merged") &&
    typeof metadata.number === "number"
  ) {
    const verb = type === "pull_request_opened" ? "を作成" : "をマージ";
    return `${teamName} が PR #${metadata.number} ${verb}しました`;
  }

  if (type === "issue_closed" && typeof metadata.number === "number") {
    return `${teamName} が Issue #${metadata.number} をクローズしました`;
  }

  return `${teamName} ${ACTIVITY_LABELS[type]}`;
}

async function findOrCreateSupabaseTeam(
  githubRepo: string,
  fallbackName: string,
  eventId?: string
) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data: existingTeam, error: selectError } = await supabase
    .from("teams")
    .select("*")
    .eq("github_repo", githubRepo)
    .eq("event_id", eventId ?? (await getEvent())?.id ?? "")
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existingTeam) {
    return existingTeam as Team;
  }

  const newTeam: Team = {
    id: randomUUID(),
    event_id: eventId ?? (await getEvent())?.id ?? "memory-event",
    name: fallbackName,
    github_repo: githubRepo,
    score: 0,
    commit_count: 0,
    house_level: 1,
    created_at: new Date().toISOString()
  };

  const { data, error: insertError } = await supabase
    .from("teams")
    .insert(newTeam)
    .select("*")
    .single();

  if (insertError) {
    throw insertError;
  }

  return (data as Team | null) ?? newTeam;
}

async function findSupabaseTeam(githubRepo: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("github_repo", githubRepo)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Team | null) ?? null;
}

function findOrCreateMemoryTeam(githubRepo: string, fallbackName: string, eventId?: string): Team {
  const store = getMemoryStore();
  const currentEventId = eventId ?? store.event?.id ?? "memory-event";
  const existingTeam = store.teams.find(
    (team) => team.github_repo === githubRepo && team.event_id === currentEventId
  );
  if (existingTeam) {
    return existingTeam;
  }

  const newTeam: Team = {
    id: randomUUID(),
    event_id: currentEventId,
    name: fallbackName,
    github_repo: githubRepo,
    score: 0,
    commit_count: 0,
    house_level: 1,
    created_at: new Date().toISOString()
  };

  store.teams.push(newTeam);
  return newTeam;
}

/**
 * 活動を1件記録する。
 *
 * リポジトリ名が渡されたのにどのチームとも一致しない場合は `null` を返して何もしない。
 * 以前は「先頭のチーム」に紐づけていたため、どのチームにも登録されていないリポジトリの
 * プッシュが無関係なチームのスコアに加算されてしまっていた。
 */
export async function recordActivity(input: {
  type: ActivityType;
  teamId?: string;
  githubRepo?: string;
  fallbackTeamName?: string;
  githubDeliveryId?: string;
  actorLogin?: string;
  actorAvatarUrl?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ActivityView | null> {
  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    ...(input.githubDeliveryId ? { githubDeliveryId: input.githubDeliveryId } : {})
  };
  const actorLogin = input.actorLogin?.trim() || null;
  const actorAvatarUrl = input.actorAvatarUrl ?? null;
  // 配点はイベントごとに変えられる。読めなければ既定値で動かす。
  const scoreConfig = await getScoreConfig();
  const scoreDelta = scoreConfig[input.type];
  const commitDelta =
    input.type === "push" && typeof metadata.commitCount === "number"
      ? metadata.commitCount
      : 0;

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      let team: Team | null = null;

      if (input.teamId) {
        const { data } = await supabase
          .from("teams")
          .select("*")
          .eq("id", input.teamId)
          .maybeSingle();
        team = data as Team | null;
      }

      if (!team && input.githubRepo) {
        team = await findSupabaseTeam(input.githubRepo);

        // 登録されていないリポジトリからの通知は、他チームに混ぜず捨てる。
        if (!team) return null;
      }

      if (!team) {
        const { data } = await supabase.from("teams").select("*").limit(1).maybeSingle();
        team = data as Team | null;
      }

      if (!team) return null;

      team = normalizeTeam(team);

      const deliveryId = input.githubDeliveryId;
      const commitSha = typeof metadata.commitSha === "string" ? metadata.commitSha : undefined;
      const duplicateQueries = [];

      if (deliveryId) {
        duplicateQueries.push(
          supabase
            .from("activities")
            .select("*")
            .contains("metadata", { githubDeliveryId: deliveryId })
            .maybeSingle()
        );
      }

      if (commitSha) {
        duplicateQueries.push(
          supabase
            .from("activities")
            .select("*")
            .contains("metadata", { commitSha })
            .eq("team_id", team.id)
            .maybeSingle()
        );
      }

      for (const duplicateQuery of duplicateQueries) {
        const { data: existingActivity, error: duplicateError } = await duplicateQuery;
        if (duplicateError) {
          throw duplicateError;
        }

        if (existingActivity) {
          return {
            ...(existingActivity as Activity),
            team_name: team.name
          };
        }
      }

      const nextScore = team.score + scoreDelta;
      const nextCommitCount = team.commit_count + commitDelta;
      const nextLevel = getHouseLevel(nextScore);
      const message = makeActivityMessage(
        activitySubject(team.name, actorLogin),
        input.type,
        metadata
      );
      const activity: Activity = {
        id: randomUUID(),
        team_id: team.id,
        type: input.type,
        message,
        score_delta: scoreDelta,
        actor_login: actorLogin,
        actor_avatar_url: actorAvatarUrl,
        metadata,
        created_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from("teams")
        .update({
          score: nextScore,
          commit_count: nextCommitCount,
          house_level: nextLevel
        })
        .eq("id", team.id);

      if (updateError) {
        throw updateError;
      }

      let { data: insertedActivity, error: activityError } = await supabase
        .from("activities")
        .insert(activity)
        .select("*")
        .single();

      // 実行者の列がまだ無いDBでも、記録そのものは落とさない。
      if (activityError && isMissingActorColumn(activityError)) {
        const { actor_login, actor_avatar_url, ...legacy } = activity;
        void actor_login;
        void actor_avatar_url;
        ({ data: insertedActivity, error: activityError } = await supabase
          .from("activities")
          .insert(legacy)
          .select("*")
          .single());
      }

      if (activityError) {
        throw activityError;
      }

      return {
        ...(insertedActivity as Activity),
        team_name: team.name
      };
    }
  }

  const store = getMemoryStore();
  let team = input.teamId
    ? store.teams.find((candidate) => candidate.id === input.teamId)
    : undefined;

  if (!team && input.githubRepo) {
    team = store.teams.find((candidate) => candidate.github_repo === input.githubRepo);
    // Supabase側と同じく、未登録リポジトリの通知は捨てる。
    if (!team) return null;
  }

  team ??= store.teams[0];

  if (!team) return null;

  const duplicateActivity = store.activities.find((activity) => {
    const activityMetadata = activity.metadata ?? {};
    return (
      (input.githubDeliveryId && activityMetadata.githubDeliveryId === input.githubDeliveryId) ||
      (typeof metadata.commitSha === "string" &&
        activityMetadata.commitSha === metadata.commitSha &&
        activity.team_id === team?.id)
    );
  });

  if (duplicateActivity) {
    return {
      ...duplicateActivity,
      team_name: team.name
    };
  }

  team.commit_count ??= 0;
  team.score += scoreDelta;
  team.commit_count += commitDelta;
  team.house_level = getHouseLevel(team.score);

  const activity: Activity = {
    id: randomUUID(),
    team_id: team.id,
    type: input.type,
    message: makeActivityMessage(
      activitySubject(team.name, actorLogin),
      input.type,
      metadata
    ),
    score_delta: scoreDelta,
    actor_login: actorLogin,
    actor_avatar_url: actorAvatarUrl,
    metadata,
    created_at: new Date().toISOString()
  };

  store.activities.unshift(activity);

  return {
    ...activity,
    team_name: team.name
  };
}

/**
 * GitHubログインした運営もDMの宛先にできるよう、最初にDM画面を開いた時点で
 * 公開プロフィールだけを users に同期する。既存メンターの specialty は上書きしない。
 */
export async function syncDirectMessageProfile(input: {
  githubUsername: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
}): Promise<void> {
  const githubUsername = input.githubUsername.trim();
  if (!githubUsername) return;

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from("users").upsert(
        {
          github_username: githubUsername,
          display_name: input.displayName.trim() || githubUsername,
          avatar_url: input.avatarUrl,
          role: input.role
        },
        { onConflict: "github_username" }
      );
      if (error) throw error;
      return;
    }
  }

  const store = getMemoryStore();
  const existing = store.users.find(
    (user) => user.github_username.toLowerCase() === githubUsername.toLowerCase()
  );
  if (existing) {
    existing.display_name = input.displayName.trim() || githubUsername;
    existing.avatar_url = input.avatarUrl;
    existing.role = input.role;
    return;
  }

  store.users.push({
    id: randomUUID(),
    github_username: githubUsername,
    display_name: input.displayName.trim() || githubUsername,
    avatar_url: input.avatarUrl,
    role: input.role,
    specialty: null,
    created_at: new Date().toISOString()
  });
}

function dmRecipientRoles(role: UserRole): UserRole[] {
  if (role === "participant") return ["mentor", "admin"];
  if (role === "mentor") return ["participant", "admin"];
  if (role === "admin") return ["participant", "mentor"];
  return [];
}

function toDirectMessageContact(user: User): DirectMessageContact {
  return {
    github_username: user.github_username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    role: user.role,
    specialty: user.specialty ?? null
  };
}

/** 役割に応じて、DMを開始できる相手だけを返す。 */
export async function getDirectMessageContacts(input: {
  viewerLogin: string;
  viewerRole: UserRole;
}): Promise<DirectMessageContact[]> {
  const allowedRoles = dmRecipientRoles(input.viewerRole);
  if (allowedRoles.length === 0) return [];

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("github_username,display_name,avatar_url,role,specialty")
        .in("role", allowedRoles)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as DirectMessageContact[]).filter(
        (user) => user.github_username.toLowerCase() !== input.viewerLogin.toLowerCase()
      );
    }
  }

  return getMemoryStore()
    .users.filter(
      (user) =>
        allowedRoles.includes(user.role) &&
        user.github_username.toLowerCase() !== input.viewerLogin.toLowerCase()
    )
    .map(toDirectMessageContact)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

/** 当事者本人のDMだけを取得する。 */
export async function getDirectMessages(
  viewerLogin: string,
  eventId?: string
): Promise<DirectMessage[]> {
  const normalizedLogin = viewerLogin.trim();
  if (!normalizedLogin) return [];

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`sender_login.ilike.${normalizedLogin},recipient_login.ilike.${normalizedLogin}`)
        .eq("event_id", eventId ?? "")
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as DirectMessage[];
    }
  }

  return getMemoryStore()
    .directMessages.filter(
      (message) =>
        (!eventId || message.event_id === eventId) &&
        (message.sender_login.toLowerCase() === normalizedLogin.toLowerCase() ||
          message.recipient_login.toLowerCase() === normalizedLogin.toLowerCase())
    )
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** メンター・運営・参加者の間でだけ、1対1のDMを送信する。 */
export async function createDirectMessage(input: {
  eventId?: string;
  senderLogin: string;
  senderName: string;
  senderRole: UserRole;
  recipientLogin: string;
  body: string;
}): Promise<DirectMessage> {
  const senderLogin = input.senderLogin.trim();
  const recipientLogin = input.recipientLogin.trim();
  const body = input.body.trim();
  const eventId = input.eventId ?? (await getEvent())?.id ?? "memory-event";

  if (!senderLogin || !recipientLogin || senderLogin.toLowerCase() === recipientLogin.toLowerCase()) {
    throw new Error("DMの相手を選択してください。");
  }
  if (!body || body.length > 1000) {
    throw new Error("メッセージは1〜1000文字で入力してください。");
  }

  const allowedRoles = dmRecipientRoles(input.senderRole);
  if (allowedRoles.length === 0) {
    throw new Error("この役割ではDMを利用できません。");
  }

  let recipient: Pick<User, "github_username" | "role"> | undefined;
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("github_username,role")
        .ilike("github_username", recipientLogin)
        .maybeSingle();
      if (error) throw error;
      recipient = data as Pick<User, "github_username" | "role"> | null ?? undefined;

      if (!recipient || !allowedRoles.includes(recipient.role)) {
        throw new Error("この相手にはDMを送れません。");
      }

      const message: DirectMessage = {
        id: randomUUID(),
        event_id: eventId,
        sender_login: senderLogin,
        recipient_login: recipient.github_username,
        sender_name: input.senderName.trim() || senderLogin,
        sender_role: input.senderRole,
        body,
        created_at: new Date().toISOString()
      };
      const { data: saved, error: insertError } = await supabase
        .from("direct_messages")
        .insert(message)
        .select("*")
        .single();
      if (insertError || !saved) throw insertError ?? new Error("DMを保存できませんでした。");
      return saved as DirectMessage;
    }
  }

  const store = getMemoryStore();
  recipient = store.users.find(
    (user) => user.github_username.toLowerCase() === recipientLogin.toLowerCase()
  );
  if (!recipient || !allowedRoles.includes(recipient.role)) {
    throw new Error("この相手にはDMを送れません。");
  }

  const message: DirectMessage = {
    id: randomUUID(),
    event_id: eventId,
    sender_login: senderLogin,
    recipient_login: recipient.github_username,
    sender_name: input.senderName.trim() || senderLogin,
    sender_role: input.senderRole,
    body,
    created_at: new Date().toISOString()
  };
  store.directMessages.push(message);
  return message;
}

export async function createChatMessage(input: {
  channel: ChatChannel;
  eventId?: string;
  teamId?: string;
  authorName: string;
  authorRole: ChatMessage["author_role"];
  body: string;
}): Promise<ChatMessage> {
  const body = input.body.trim();
  const authorName = input.authorName.trim() || "HackRadar user";
  const eventId = input.eventId ?? (await getEvent())?.id ?? "memory-event";

  if (!body || body.length > 500) {
    throw new Error("メッセージは1〜500文字で入力してください。");
  }

  // 運営への相談はチームごとのスレッドなので、必ずチームが要る。
  if (input.channel === "staff" && input.teamId === undefined) {
    // A null team_id is reserved for operator-wide announcements.
  } else if (!input.teamId) {
    throw new Error("チームを選択してください。");
  }

  const message: ChatMessage = {
    id: randomUUID(),
    channel: input.channel,
    event_id: eventId,
    team_id: input.teamId ?? null,
    author_name: authorName,
    author_role: input.authorRole,
    body,
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("chat_messages")
        .insert(message)
        .select("*")
        .single();

      if (!error && data) {
        return data as ChatMessage;
      }
    }
  }

  const store = getMemoryStore();
  store.messages.push(message);
  return message;
}

export async function createHelpPost(input: {
  teamId: string;
  title: string;
  body: string;
  category: string;
  status?: HelpStatus;
  authorName?: string;
  authorGithub?: string;
  anonymous?: boolean;
}): Promise<HelpPostView> {
  const status = input.status ?? "open";

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: team } = await supabase
        .from("teams")
        .select("*")
        .eq("id", input.teamId)
        .single();

      const selectedTeam = team as Team | null;

      if (!selectedTeam) {
        throw new Error("選択されたチームが見つかりません。");
      }

      // ログイン済みならその本人を、そうでなければ既存の参加者を投稿者にする。
      let author: User | null = null;
      if (input.authorGithub) {
        const { data, error: authorError } = await supabase
          .from("users")
          .upsert(
            {
              github_username: input.authorGithub,
              display_name: input.authorName ?? input.authorGithub
            },
            { onConflict: "github_username" }
          )
          .select("*")
          .single();
        if (authorError || !data) {
          throw authorError ?? new Error("質問者の情報を保存できませんでした。");
        }
        author = data as User | null;
      } else {
        const { data, error: authorError } = await supabase
          .from("users")
          .select("*")
          .eq("role", "participant")
          .limit(1)
          .single();
        if (authorError || !data) {
          throw authorError ?? new Error("質問者の情報を取得できませんでした。");
        }
        author = data as User | null;
      }

      const post: HelpPost = {
        id: randomUUID(),
        user_id: author?.id ?? "unknown-user",
        team_id: selectedTeam.id,
        title: input.title,
        body: input.body,
        category: input.category,
        is_anonymous: input.anonymous === true,
        status,
        created_at: new Date().toISOString()
      };

      const { error: insertError } = await supabase.from("help_posts").insert(post);
      if (insertError) throw insertError;
      return {
        ...post,
        author_name: input.anonymous ? "匿名" : author?.display_name ?? input.authorName ?? "参加者",
        author_github: author?.github_username ?? input.authorGithub ?? null,
        team_name: selectedTeam.name,
        replies: []
      };
    }
  }

  const store = getMemoryStore();
  const team = store.teams.find((candidate) => candidate.id === input.teamId) ?? store.teams[0];

  let user = input.authorGithub
    ? store.users.find((candidate) => candidate.github_username === input.authorGithub)
    : undefined;

  if (!user && input.authorGithub) {
    user = {
      id: randomUUID(),
      github_username: input.authorGithub,
      display_name: input.authorName ?? input.authorGithub,
      avatar_url: null,
      role: "participant",
      created_at: new Date().toISOString()
    };
    store.users.push(user);
  }

  user ??=
    store.users.find((candidate) => candidate.role === "participant") ?? store.users[0];

  const post: HelpPost = {
    id: randomUUID(),
    user_id: user.id,
    team_id: team.id,
    title: input.title,
    body: input.body,
    category: input.category,
    is_anonymous: input.anonymous === true,
    status,
    created_at: new Date().toISOString()
  };

  store.helpPosts.unshift(post);

  return {
    ...post,
    author_name: input.anonymous ? "匿名" : user.display_name,
    author_github: user.github_username,
    team_name: team.name,
    replies: []
  };
}

/** 掲示板への回答。参加している人なら誰でも投稿できる。 */
export async function createHelpReply(input: {
  helpPostId: string;
  authorName: string;
  authorGithub?: string;
  authorRole?: HelpReply["author_role"];
  body: string;
}): Promise<HelpReply> {
  const body = input.body.trim();

  if (!body || body.length > 1000) {
    throw new Error("回答は1〜1000文字で入力してください。");
  }

  const reply: HelpReply = {
    id: randomUUID(),
    help_post_id: input.helpPostId,
    author_name: input.authorName.trim() || "匿名",
    author_github: input.authorGithub?.trim() || null,
    author_role: input.authorRole ?? "participant",
    body,
    is_accepted: false,
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("help_replies")
        .insert(reply)
        .select("*")
        .single();

      if (!error && data) {
        // 最初の回答が付いた時点で「対応中」に進める。
        await supabase
          .from("help_posts")
          .update({ status: "helping" })
          .eq("id", input.helpPostId)
          .eq("status", "open");

        return data as HelpReply;
      }
    }
  }

  const store = getMemoryStore();
  store.helpReplies.push(reply);

  const post = store.helpPosts.find((candidate) => candidate.id === input.helpPostId);
  if (post && post.status === "open") {
    post.status = "helping";
  }

  return reply;
}

/**
 * ベストアンサーを採用する。質問が解決済みになり、他の回答の採用は外れる。
 * 採用できるのは質問者本人と運営のみ。
 */
export async function acceptHelpReply(input: {
  helpPostId: string;
  replyId: string;
}): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      await supabase
        .from("help_replies")
        .update({ is_accepted: false })
        .eq("help_post_id", input.helpPostId);

      const { error } = await supabase
        .from("help_replies")
        .update({ is_accepted: true })
        .eq("id", input.replyId);

      if (!error) {
        await supabase
          .from("help_posts")
          .update({ status: "solved" })
          .eq("id", input.helpPostId);
        return;
      }
    }
  }

  const store = getMemoryStore();
  let found = false;

  for (const reply of store.helpReplies) {
    if (reply.help_post_id !== input.helpPostId) continue;
    reply.is_accepted = reply.id === input.replyId;
    if (reply.is_accepted) found = true;
  }

  if (!found) {
    throw new Error("採用する回答が見つかりません。");
  }

  const post = store.helpPosts.find((candidate) => candidate.id === input.helpPostId);
  if (post) {
    post.status = "solved";
  }
}

/** 掲示板の投稿を1件取得する。権限チェック用。 */
export async function getHelpPostById(id: string): Promise<HelpPostView | null> {
  const state = await getHackVerseState();
  return state.helpPosts.find((post) => post.id === id) ?? null;
}

function makeJoinCode(): string {
  // 読み上げやすいよう、紛らわしい文字（0/O/1/I）を除いた8桁。
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = randomUUID().replace(/-/g, "");
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[parseInt(raw.slice(index * 2, index * 2 + 2), 16) % alphabet.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 開催中のイベント（1件のみ運用）。未設定なら null。 */
export async function getEvent(eventId?: string | null): Promise<HackEvent | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const query = supabase.from("events").select("*");
      const { data } = eventId
        ? await query.eq("id", eventId).maybeSingle()
        : await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data) return data as HackEvent;
    }
  }

  const event = getMemoryStore().event;
  return !eventId || event?.id === eventId ? event : null;
}

export async function getEventByJoinCode(code: string | undefined): Promise<HackEvent | null> {
  const joinCode = code?.trim().toUpperCase();
  if (!joinCode) return null;

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .ilike("join_code", joinCode)
        .maybeSingle();
      if (error) throw error;
      return (data as HackEvent | null) ?? null;
    }
  }

  const event = getMemoryStore().event;
  return event?.join_code.toUpperCase() === joinCode ? event : null;
}

/** GitHubログインした人が、自分だけが管理できるイベントを作成する。 */
export async function createEvent(input: {
  name: string;
  ownerGithubUsername: string;
}): Promise<HackEvent> {
  const name = input.name.trim();
  const owner = input.ownerGithubUsername.trim();
  if (!name || !owner) throw new Error("イベント名と主催者を確認してください。");

  const event: HackEvent = {
    id: randomUUID(),
    name,
    join_code: makeJoinCode(),
    owner_github_username: owner,
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from("events").insert(event).select("*").single();
      if (error || !data) throw error ?? new Error("イベントを作成できませんでした。");
      return data as HackEvent;
    }
  }

  getMemoryStore().event = event;
  return event;
}

export async function isEventOwner(input: {
  eventId: string | undefined;
  githubUsername: string | undefined;
}): Promise<boolean> {
  if (!input.eventId || !input.githubUsername) return false;
  const event = await getEvent(input.eventId);
  return Boolean(
    event && event.owner_github_username.toLowerCase() === input.githubUsername.toLowerCase()
  );
}

export async function getEventsOwnedBy(githubUsername: string | undefined): Promise<HackEvent[]> {
  const owner = githubUsername?.trim();
  if (!owner) return [];
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .ilike("owner_github_username", owner)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HackEvent[];
    }
  }
  const event = getMemoryStore().event;
  return event?.owner_github_username.toLowerCase() === owner.toLowerCase() ? [event] : [];
}

/** 参加者が切り替えられる、所属チームを持つイベント。 */
export type JoinedEvent = HackEvent & {
  teamId: string;
  teamName: string;
};

export async function getMembershipInEvent(input: {
  eventId: string;
  githubUsername: string;
}): Promise<{ teamId: string; teamName: string } | null> {
  const login = input.githubUsername.trim();
  if (!login) return null;

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("github_username", login)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) return null;

      const { data: memberships, error: membershipError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);
      if (membershipError) throw membershipError;
      const teamIds = [...new Set((memberships ?? []).map((membership) => membership.team_id))];
      if (teamIds.length === 0) return null;

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id,name")
        .eq("event_id", input.eventId)
        .in("id", teamIds)
        .maybeSingle();
      if (teamError) throw teamError;
      return team ? { teamId: team.id, teamName: team.name } : null;
    }
  }

  const store = getMemoryStore();
  const user = store.users.find((candidate) => candidate.github_username === login);
  if (!user) return null;
  const team = store.teams.find(
    (candidate) =>
      candidate.event_id === input.eventId &&
      store.teamMembers.some(
        (membership) => membership.team_id === candidate.id && membership.user_id === user.id
      )
  );
  return team ? { teamId: team.id, teamName: team.name } : null;
}

export async function getEventsJoinedBy(githubUsername: string | undefined): Promise<JoinedEvent[]> {
  const login = githubUsername?.trim();
  if (!login) return [];

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("github_username", login)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) return [];

      const { data: memberships, error: membershipError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);
      if (membershipError) throw membershipError;
      const teamIds = [...new Set((memberships ?? []).map((membership) => membership.team_id))];
      if (teamIds.length === 0) return [];

      const { data: teams, error: teamError } = await supabase
        .from("teams")
        .select("id,event_id,name")
        .in("id", teamIds);
      if (teamError) throw teamError;
      const eventIds = [...new Set((teams ?? []).map((team) => team.event_id))];
      if (eventIds.length === 0) return [];

      const { data: events, error: eventError } = await supabase
        .from("events")
        .select("*")
        .in("id", eventIds)
        .order("created_at", { ascending: false });
      if (eventError) throw eventError;
      const teamsByEvent = new Map((teams ?? []).map((team) => [team.event_id, team]));
      return (events ?? []).flatMap((event) => {
        const team = teamsByEvent.get(event.id);
        return team ? [{ ...(event as HackEvent), teamId: team.id, teamName: team.name }] : [];
      });
    }
  }

  const store = getMemoryStore();
  const user = store.users.find((candidate) => candidate.github_username === login);
  if (!user) return [];
  const teamIds = new Set(
    store.teamMembers
      .filter((membership) => membership.user_id === user.id)
      .map((membership) => membership.team_id)
  );
  const activeEvent = store.event;
  return store.teams.flatMap((team) => {
    if (!teamIds.has(team.id) || activeEvent?.id !== team.event_id) return [];
    return [{ ...activeEvent, teamId: team.id, teamName: team.name }];
  });
}

function resetMemoryEventData(store: MemoryStore) {
  store.teams = [];
  store.teamMembers = [];
  store.teamInvites = [];
  store.activities = [];
  store.helpPosts = [];
  store.helpReplies = [];
  store.messages = [];
}

async function resetSupabaseEventData(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  eventId: string
) {
  // teamsの削除は外部キーのcascadeで、チームに紐づく履歴もまとめて初期化する。
  const { error } = await supabase
    .from("teams")
    .delete()
    .eq("event_id", eventId);
  if (error) throw error;
}

/** イベント名を保存する。名前を変更したときはチームと進捗を新イベント用に初期化する。 */
export async function saveEvent(input: {
  name: string;
  ownerGithubUsername?: string;
  eventId?: string;
}): Promise<HackEvent> {
  const name = input.name.trim();
  if (!name) throw new Error("イベント名を入力してください。");

  const existing = await getEvent(input.eventId);
  const shouldReset = false;
  const joinCode = existing?.join_code ?? makeJoinCode();

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      if (existing) {
        const { data, error } = await supabase
          .from("events")
          .update({ name, join_code: joinCode })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (!error && data) {
          return data as HackEvent;
        }
      } else {
        const event: HackEvent = {
          id: randomUUID(),
          name,
          join_code: makeJoinCode(),
          owner_github_username: input.ownerGithubUsername?.trim() || "test-owner",
          created_at: new Date().toISOString()
        };
        const { data, error } = await supabase
          .from("events")
          .insert(event)
          .select("*")
          .single();
        if (!error && data) return data as HackEvent;
      }
    }
  }

  const store = getMemoryStore();
  if (shouldReset) resetMemoryEventData(store);
  store.event = {
    id: existing?.id ?? randomUUID(),
    name,
    join_code: joinCode,
    owner_github_username:
      existing?.owner_github_username ?? input.ownerGithubUsername?.trim() ?? "test-owner",
    created_at: existing?.created_at ?? new Date().toISOString()
  };
  return store.event;
}

/**
 * いま有効な配点。
 *
 * イベントに設定があればそれを、無ければ既定値を返す。
 * 保存されている値が壊れていても normalizeScoreConfig が既定値で埋める。
 */
export async function getScoreConfig(eventId?: string): Promise<ScoreConfig> {
  try {
    const event = await getEvent(eventId);
    if (!event?.score_config) return { ...DEFAULT_SCORE_BY_ACTIVITY };
    return normalizeScoreConfig(event.score_config);
  } catch {
    // 設定が読めないだけで記録を止めたくない。
    return { ...DEFAULT_SCORE_BY_ACTIVITY };
  }
}

/**
 * 記録済みの活動を、いまの配点で計算し直してチームの合計に反映する。
 *
 * 途中で配点を変えると、変更前と変更後の活動が混ざって順位の意味が壊れる。
 * それを避けるため、変更時は必ず過去分もそろえる。
 */
export async function recalculateScores(config: ScoreConfig): Promise<{
  updatedActivities: number;
  updatedTeams: number;
}> {
  const totals = new Map<string, { score: number; commits: number }>();
  let updatedActivities = 0;

  const applyActivity = (activity: Activity) => {
    const nextDelta = config[activity.type] ?? 0;
    const commits =
      activity.type === "push" && typeof activity.metadata?.commitCount === "number"
        ? activity.metadata.commitCount
        : 0;

    const bucket = totals.get(activity.team_id) ?? { score: 0, commits: 0 };
    bucket.score += nextDelta;
    bucket.commits += commits;
    totals.set(activity.team_id, bucket);

    return nextDelta;
  };

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("activities")
        .select("id,team_id,type,score_delta,metadata")
        .limit(10000);
      if (error) throw error;

      const activities = (data ?? []) as Activity[];
      const changed: { id: string; score_delta: number }[] = [];

      for (const activity of activities) {
        const nextDelta = applyActivity(activity);
        if (nextDelta !== activity.score_delta) {
          changed.push({ id: activity.id, score_delta: nextDelta });
        }
      }

      // 点数が変わった行だけを書き戻す。
      for (const row of changed) {
        const { error: updateError } = await supabase
          .from("activities")
          .update({ score_delta: row.score_delta })
          .eq("id", row.id);
        if (updateError) throw updateError;
      }
      updatedActivities = changed.length;

      const { data: teamRows, error: teamsError } = await supabase
        .from("teams")
        .select("id");
      if (teamsError) throw teamsError;

      for (const team of (teamRows ?? []) as { id: string }[]) {
        const bucket = totals.get(team.id) ?? { score: 0, commits: 0 };
        const { error: updateError } = await supabase
          .from("teams")
          .update({
            score: bucket.score,
            commit_count: bucket.commits,
            house_level: getHouseLevel(bucket.score)
          })
          .eq("id", team.id);
        if (updateError) throw updateError;
      }

      return { updatedActivities, updatedTeams: (teamRows ?? []).length };
    }
  }

  const store = getMemoryStore();
  for (const activity of store.activities) {
    const nextDelta = applyActivity(activity);
    if (nextDelta !== activity.score_delta) {
      activity.score_delta = nextDelta;
      updatedActivities += 1;
    }
  }

  for (const team of store.teams) {
    const bucket = totals.get(team.id) ?? { score: 0, commits: 0 };
    team.score = bucket.score;
    team.commit_count = bucket.commits;
    team.house_level = getHouseLevel(bucket.score);
  }

  return { updatedActivities, updatedTeams: store.teams.length };
}

/** 配点を保存し、過去の記録も同じ配点でそろえる。 */
export async function saveScoreConfig(input: unknown, eventId?: string): Promise<{
  config: ScoreConfig;
  updatedActivities: number;
  updatedTeams: number;
}> {
  const config = normalizeScoreConfig(input);
  const event = await getEvent(eventId);

  if (!event) {
    throw new Error("先にイベントを作成してください。");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from("events")
        .update({ score_config: config })
        .eq("id", event.id);
      if (error) {
        if ((error.message ?? "").includes("score_config")) {
          throw new Error(
            "配点を保存する列がまだありません。Supabaseで supabase/schema.sql を実行してください。"
          );
        }
        throw error;
      }
    }
  }

  const store = getMemoryStore();
  if (store.event) {
    store.event = { ...store.event, score_config: config };
  }

  const result = await recalculateScores(config);
  return { config, ...result };
}

/**
 * イベントを丸ごと消す。
 *
 * ハッカソンが終わったあと、次の準備の前に片付けるための操作。
 * チーム・所属・部屋番号・活動履歴・質問・チャットが全部消えて、
 * 招待コードも無効になる。取り返しがつかないので、呼び出し側で
 * イベント名の入力を求めてから実行すること。
 */
export async function deleteEvent(eventId?: string): Promise<void> {
  const event = await getEvent(eventId);
  if (!event) {
    throw new Error("削除するイベントがありません。");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      // 先にチームを消す。所属・部屋番号・活動履歴はcascadeで一緒に消える。
      await resetSupabaseEventData(supabase, event.id);

      const { error } = await supabase.from("events").delete().eq("id", event.id);
      if (error) throw error;

      // チームに紐づかない記録（お知らせ、メンター登録）も残さない。
      return;
    }
  }

  const store = getMemoryStore();
  resetMemoryEventData(store);
  store.users = store.users.filter((user) => user.role === "admin");
  store.event = null;
}

/** 参加コードの照合。イベント未設定ならコード無しで通す（ローカルデモ用）。 */
export async function verifyJoinCode(code: string | undefined): Promise<boolean> {
  const event = await getEvent();
  if (!event) return true;
  return (code ?? "").trim().toUpperCase() === event.join_code.toUpperCase();
}

/** イベント参加コードまたはチーム招待コードを検証する。 */
export async function verifyMentorInviteCode(code: string | undefined): Promise<boolean> {
  if (await getEventByJoinCode(code)) return true;

  const normalized = (code ?? "").trim().toUpperCase();
  if (!normalized) return false;

  const invites = await getTeamInvites();
  return invites.some((invite) => invite.code.toUpperCase() === normalized);
}

async function getEventIdForMentorCode(code: string): Promise<string | undefined> {
  const event = await getEventByJoinCode(code);
  if (event) return event.id;

  const normalized = code.trim().toUpperCase();
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: invite } = await supabase
        .from("team_invites")
        .select("team_id")
        .eq("code", normalized)
        .maybeSingle();
      if (!invite) return undefined;
      const { data: team } = await supabase
        .from("teams")
        .select("event_id")
        .eq("id", invite.team_id)
        .maybeSingle();
      return (team as { event_id?: string } | null)?.event_id;
    }
  }

  const invite = getMemoryStore().teamInvites.find((item) => item.code === normalized);
  return invite
    ? getMemoryStore().teams.find((team) => team.id === invite.team_id)?.event_id
    : undefined;
}

/** 運営が配った招待コードでメンターとして登録する。メンターはチームに所属しない。 */
export async function joinMentorByCode(input: {
  code: string;
  displayName: string;
  specialty: string;
  githubUsername?: string;
  role?: UserRole;
}): Promise<AppSession> {
  const code = input.code.trim().toUpperCase();
  const displayName = input.displayName.trim();
  const specialty = input.specialty.trim();
  const githubUsername =
    input.githubUsername?.trim() || `mentor-${randomUUID().slice(0, 8)}`;

  if (!code || !displayName || !specialty) {
    throw new Error("招待コード、名前、得意なことを入力してください。");
  }

  if (!(await verifyMentorInviteCode(code))) {
    throw new Error(
      "招待コードが違います。イベント参加コードまたはチーム招待コードを確認してください。"
    );
  }
  const eventId = await getEventIdForMentorCode(code);
  if (!eventId) throw new Error("このコードのイベントが見つかりません。");

  const role: UserRole = input.role === "admin" ? "admin" : "mentor";

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("users")
        .upsert(
          {
            github_username: githubUsername,
            display_name: displayName,
            role,
            specialty
          },
          { onConflict: "github_username" }
        )
        .select("*")
        .single();

      if (error) throw error;

      return {
        role,
        displayName: data.display_name,
        githubUsername: data.github_username,
        eventId,
        specialty,
        inviteCode: code
      };
    }
  }

  const store = getMemoryStore();
  let user = store.users.find(
    (candidate) => candidate.github_username === githubUsername
  );

  if (!user) {
    user = {
      id: randomUUID(),
      github_username: githubUsername,
      display_name: displayName,
      avatar_url: null,
      role,
      specialty,
      created_at: new Date().toISOString()
    };
    store.users.push(user);
  } else {
    user.display_name = displayName;
    user.role = role;
    user.specialty = specialty;
  }

  return {
    role,
    displayName,
    githubUsername,
    eventId,
    specialty,
    inviteCode: code
  };
}

/** 運営がチーム名だけ登録する。リポジトリは参加者があとから紐づける。 */
export async function createTeamByName(input: { name: string; eventId?: string }): Promise<Team> {
  const name = input.name.trim();
  const eventId = input.eventId ?? (await getEvent())?.id;
  if (!eventId) throw new Error("イベントを選択してください。");
  if (!name) throw new Error("チーム名を入力してください。");

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: existing } = await supabase
        .from("teams")
        .select("*")
        .eq("name", name)
        .eq("event_id", eventId)
        .maybeSingle();
      if (existing) throw new Error("同じ名前のチームがすでにあります。");

      const team: Team = {
        id: randomUUID(),
        event_id: eventId,
        name,
        github_repo: null,
        score: 0,
        commit_count: 0,
        house_level: 1,
        created_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from("teams").insert(team).select("*").single();
      if (error) throw error;
      return normalizeTeam(data as Team);
    }
  }

  const store = getMemoryStore();
  if (store.teams.some((team) => team.event_id === eventId && team.name === name)) {
    throw new Error("同じ名前のチームがすでにあります。");
  }

  const team: Team = {
    id: randomUUID(),
    event_id: eventId,
    name,
    github_repo: null,
    score: 0,
    commit_count: 0,
    house_level: 1,
    created_at: new Date().toISOString()
  };
  store.teams.push(team);
  return team;
}

/** チームにGitHubリポジトリを紐づける。既に他チームが使っていれば拒否する。 */
export async function setTeamRepo(input: {
  teamId: string;
  githubRepo: string;
}): Promise<Team> {
  const githubRepo = input.githubRepo.trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(githubRepo)) {
    throw new Error("リポジトリは owner/repository の形式で指定してください。");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: taken } = await supabase
        .from("teams")
        .select("id")
        .eq("github_repo", githubRepo)
        .maybeSingle();
      if (taken && (taken as { id: string }).id !== input.teamId) {
        throw new Error("そのリポジトリは別のチームが使っています。");
      }

      const { data, error } = await supabase
        .from("teams")
        .update({ github_repo: githubRepo })
        .eq("id", input.teamId)
        .select("*")
        .single();
      if (error) throw error;
      return normalizeTeam(data as Team);
    }
  }

  const store = getMemoryStore();
  const taken = store.teams.find(
    (team) => team.github_repo === githubRepo && team.id !== input.teamId
  );
  if (taken) throw new Error("そのリポジトリは別のチームが使っています。");

  const team = store.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new Error("チームが見つかりません。");

  team.github_repo = githubRepo;
  return team;
}

/** 運営が登録済みチームの名前とリポジトリを編集する。 */
export async function updateTeam(input: {
  teamId: string;
  name: string;
  githubRepo?: string | null;
}): Promise<Team> {
  const name = input.name.trim();
  const githubRepo = input.githubRepo?.trim() || null;

  if (!name) throw new Error("チーム名を入力してください。");
  if (githubRepo && !/^[^/\s]+\/[^/\s]+$/.test(githubRepo)) {
    throw new Error("リポジトリは owner/repository の形式で指定してください。");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: duplicateName } = await supabase
        .from("teams")
        .select("id")
        .ilike("name", name)
        .neq("id", input.teamId)
        .maybeSingle();
      if (duplicateName) throw new Error("同じ名前のチームがすでにあります。");

      if (githubRepo) {
        const { data: duplicateRepo } = await supabase
          .from("teams")
          .select("id")
          .eq("github_repo", githubRepo)
          .neq("id", input.teamId)
          .maybeSingle();
        if (duplicateRepo) throw new Error("そのリポジトリは別のチームが使っています。");
      }

      const { data, error } = await supabase
        .from("teams")
        .update({ name, github_repo: githubRepo })
        .eq("id", input.teamId)
        .select("*")
        .single();
      if (error) throw error;
      return normalizeTeam(data as Team);
    }
  }

  const store = getMemoryStore();
  const team = store.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new Error("チームが見つかりません。");

  const duplicateName = store.teams.find(
    (candidate) =>
      candidate.id !== input.teamId && candidate.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicateName) throw new Error("同じ名前のチームがすでにあります。");

  const duplicateRepo = githubRepo
    ? store.teams.find(
        (candidate) => candidate.id !== input.teamId && candidate.github_repo === githubRepo
      )
    : undefined;
  if (duplicateRepo) throw new Error("そのリポジトリは別のチームが使っています。");

  team.name = name;
  team.github_repo = githubRepo;
  return team;
}

function makeInviteCode(teamName: string): string {
  const compactName = teamName
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
  return `${compactName || "TEAM"}-${suffix}`;
}

function inviteViews(teams: Team[], invites: TeamInvite[]): TeamInviteView[] {
  const teamsById = new Map(teams.map((team) => [team.id, normalizeTeam(team)]));

  return invites
    .flatMap((invite) => {
      const team = teamsById.get(invite.team_id);
      if (!team) return [];
      return [{
        ...invite,
        team_name: team.name,
        github_repo: team.github_repo
      }];
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function getTeamInvites(eventId?: string | null): Promise<TeamInviteView[]> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const teamsQuery = supabase.from("teams").select("*");
      if (eventId) teamsQuery.eq("event_id", eventId);
      const [teamsResult, invitesResult] = await Promise.all([
        teamsQuery,
        supabase
          .from("team_invites")
          .select("*")
          .order("created_at", { ascending: false })
      ]);

      if (!teamsResult.error && !invitesResult.error) {
        return inviteViews(
          ((teamsResult.data ?? []) as Team[]).map(normalizeTeam),
          (invitesResult.data ?? []) as TeamInvite[]
        );
      }
    }
  }

  const store = getMemoryStore();
  return inviteViews(
    eventId ? store.teams.filter((team) => team.event_id === eventId) : store.teams,
    store.teamInvites
  );
}

export async function getTeamById(teamId: string): Promise<Team | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from("teams").select("*").eq("id", teamId).maybeSingle();
      if (error) throw error;
      return (data as Team | null) ?? null;
    }
  }
  return getMemoryStore().teams.find((team) => team.id === teamId) ?? null;
}

export async function createTeamInvite(input: {
  teamName: string;
  githubRepo: string;
  invitedBy: string;
  eventId?: string;
}): Promise<TeamInviteView> {
  const teamName = input.teamName.trim();
  const githubRepo = input.githubRepo.trim();
  const invitedBy = input.invitedBy.trim() || "HackRadar Admin";

  if (!teamName || !githubRepo) {
    throw new Error("Team name and GitHub repository are required.");
  }

  if (isSupabaseConfigured()) {
    const team = await findOrCreateSupabaseTeam(githubRepo, teamName, input.eventId);
    if (team) {
      return createTeamInviteForTeam({ teamId: team.id, invitedBy });
    }
  }

  const team = findOrCreateMemoryTeam(githubRepo, teamName, input.eventId);
  return createTeamInviteForTeam({ teamId: team.id, invitedBy });
}

/** 既に登録されているチームに、部屋番号として使う招待コードを発行する。 */
export async function createTeamInviteForTeam(input: {
  teamId: string;
  invitedBy: string;
}): Promise<TeamInviteView> {
  const invitedBy = input.invitedBy.trim() || "HackRadar Admin";

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", input.teamId)
        .single();

      if (teamError) throw teamError;

      const normalizedTeam = normalizeTeam(team as Team);
      const invite: Omit<TeamInvite, "id" | "created_at"> = {
        code: makeInviteCode(normalizedTeam.name),
        team_id: normalizedTeam.id,
        invited_by: invitedBy
      };
      const { data, error } = await supabase
        .from("team_invites")
        .insert(invite)
        .select("*")
        .single();

      if (error) throw error;

      return {
        ...(data as TeamInvite),
        team_name: normalizedTeam.name,
        github_repo: normalizedTeam.github_repo
      };
    }
  }

  const store = getMemoryStore();
  const team = store.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new Error("チームが見つかりません。");

  const invite: TeamInvite = {
    id: randomUUID(),
    code: makeInviteCode(team.name),
    team_id: team.id,
    invited_by: invitedBy,
    created_at: new Date().toISOString()
  };

  store.teamInvites.unshift(invite);

  return {
    ...invite,
    team_name: team.name,
    github_repo: team.github_repo
  };
}

/** GitHubユーザーが指定チームのメンバーかをサーバー側で確認する。 */
export async function isTeamMember(input: {
  githubUsername?: string;
  teamId: string;
}): Promise<boolean> {
  const githubUsername = input.githubUsername?.trim();
  if (!githubUsername) return false;

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("github_username", githubUsername)
        .maybeSingle();

      if (userError) throw userError;
      if (!user) return false;

      const { data: membership, error: memberError } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", input.teamId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberError) throw memberError;
      return Boolean(membership);
    }
  }

  const store = getMemoryStore();
  const user = store.users.find(
    (candidate) => candidate.github_username === githubUsername
  );
  return Boolean(
    user &&
      store.teamMembers.some(
        (member) => member.team_id === input.teamId && member.user_id === user.id
      )
  );
}

/**
 * 運営がメンバーをチームから外す。
 *
 * 部屋番号を間違えて入る事故は必ず起きる。これが無いと、直すには
 * イベント全体をリセットするしかなく、他チームのスコアまで消える。
 *
 * 活動履歴（activities）はチームに紐づくので消さない。
 * 「誰がやったか」は残るが、点数はチームのものという扱いを保つ。
 */
export async function removeTeamMember(input: {
  teamId: string;
  githubUsername: string;
}): Promise<void> {
  const githubUsername = input.githubUsername.trim();
  if (!githubUsername) {
    throw new Error("外すメンバーを指定してください。");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("github_username", githubUsername)
        .maybeSingle();

      if (userError) throw userError;
      if (!user) throw new Error("このアカウントは登録されていません。");

      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", input.teamId)
        .eq("user_id", user.id);

      if (error) throw error;
      return;
    }
  }

  const store = getMemoryStore();
  const user = store.users.find(
    (candidate) => candidate.github_username === githubUsername
  );
  if (!user) throw new Error("このアカウントは登録されていません。");

  store.teamMembers = store.teamMembers.filter(
    (member) => !(member.team_id === input.teamId && member.user_id === user.id)
  );
}

/** 運営がメンバーを別のチームへ移す。外してから入れるので、二重所属にならない。 */
export async function moveTeamMember(input: {
  githubUsername: string;
  fromTeamId: string;
  toTeamId: string;
}): Promise<void> {
  if (input.fromTeamId === input.toTeamId) {
    throw new Error("移動先が同じチームです。");
  }

  await removeTeamMember({
    teamId: input.fromTeamId,
    githubUsername: input.githubUsername
  });

  const githubUsername = input.githubUsername.trim();

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id")
        .eq("id", input.toTeamId)
        .maybeSingle();

      if (teamError) throw teamError;
      if (!team) throw new Error("移動先のチームが見つかりません。");

      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("github_username", githubUsername)
        .maybeSingle();

      if (userError) throw userError;
      if (!user) throw new Error("このアカウントは登録されていません。");

      const { error } = await supabase
        .from("team_members")
        .upsert(
          { team_id: input.toTeamId, user_id: user.id },
          { onConflict: "team_id,user_id" }
        );

      if (error) throw error;
      return;
    }
  }

  const store = getMemoryStore();
  const team = store.teams.find((candidate) => candidate.id === input.toTeamId);
  if (!team) throw new Error("移動先のチームが見つかりません。");

  const user = store.users.find(
    (candidate) => candidate.github_username === githubUsername
  );
  if (!user) throw new Error("このアカウントは登録されていません。");

  const alreadyThere = store.teamMembers.some(
    (member) => member.team_id === input.toTeamId && member.user_id === user.id
  );
  if (!alreadyThere) {
    store.teamMembers.push({
      id: randomUUID(),
      team_id: input.toTeamId,
      user_id: user.id
    });
  }
}

/**
 * 運営がチームを削除する。
 *
 * 誤って作ったチームを、イベント全体のリセット無しに消せるようにする。
 * 所属・招待コード・活動履歴も一緒に消えるので、スコアが動いたあとは
 * 呼び出し側で確認を取ること。
 */
export async function deleteTeam(teamId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      // team_members / team_invites / activities は外部キーのcascadeで消える。
      const { error } = await supabase.from("teams").delete().eq("id", teamId);
      if (error) throw error;
      return;
    }
  }

  const store = getMemoryStore();
  store.teams = store.teams.filter((team) => team.id !== teamId);
  store.teamMembers = store.teamMembers.filter((member) => member.team_id !== teamId);
  store.teamInvites = store.teamInvites.filter((invite) => invite.team_id !== teamId);
  store.activities = store.activities.filter((activity) => activity.team_id !== teamId);
  store.helpPosts = store.helpPosts.filter((post) => post.team_id !== teamId);
  store.messages = store.messages.filter((message) => message.team_id !== teamId);
}

export async function joinTeamWithInvite(input: {
  code: string;
  displayName: string;
  githubUsername?: string;
  role?: UserRole;
}): Promise<AppSession> {
  const code = input.code.trim().toUpperCase();
  const displayName = input.displayName.trim();
  const githubUsername =
    input.githubUsername?.trim() || `guest-${randomUUID().slice(0, 8)}`;

  if (!code || !displayName) {
    throw new Error("招待コードと名前を入力してください。");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: invite, error: inviteError } = await supabase
        .from("team_invites")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (inviteError) throw inviteError;
      if (!invite) throw new Error("招待コードが見つかりません。運営から配られたコードを確認してください。");

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", invite.team_id)
        .single();

      if (teamError) throw teamError;

      const role = input.role ?? "participant";
      const { data: existingUser, error: existingUserError } = await supabase
        .from("users")
        .select("id")
        .eq("github_username", githubUsername)
        .maybeSingle();

      if (existingUserError) throw existingUserError;

      if (existingUser) {
        const { data: existingMemberships, error: membershipError } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", existingUser.id);

        if (membershipError) throw membershipError;
        const memberTeamIds = [...new Set((existingMemberships ?? []).map((membership) => membership.team_id))];
        let belongsToAnotherTeam = false;

        if (memberTeamIds.length > 0) {
          const { data: teamsInThisEvent, error: eventTeamError } = await supabase
            .from("teams")
            .select("id")
            .eq("event_id", (team as Team).event_id)
            .in("id", memberTeamIds);
          if (eventTeamError) throw eventTeamError;
          belongsToAnotherTeam = (teamsInThisEvent ?? []).some(
            (memberTeam) => memberTeam.id !== team.id
          );
        }

        if (belongsToAnotherTeam) {
          throw new Error(
            "このイベントではすでに別のチームに所属しています。別のハッカソンには同時に参加できます。チームを変えたい場合は、運営に移動をお願いしてください。"
          );
        }
      }

      const { data: user, error: userError } = await supabase
        .from("users")
        .upsert(
          {
            github_username: githubUsername,
            display_name: displayName,
            role
          },
          { onConflict: "github_username" }
        )
        .select("*")
        .single();

      if (userError) throw userError;

      const { error: memberError } = await supabase.from("team_members").upsert(
        {
          team_id: invite.team_id,
          user_id: user.id
        },
        { onConflict: "team_id,user_id" }
      );

      if (memberError) throw memberError;

      return {
        role,
        displayName,
        githubUsername,
        eventId: (team as Team).event_id,
        teamId: team.id,
        teamName: team.name,
        inviteCode: code
      };
    }
  }

  const store = getMemoryStore();
  const invite = store.teamInvites.find((candidate) => candidate.code === code);
  if (!invite) {
    throw new Error("招待コードが見つかりません。運営から配られたコードを確認してください。");
  }

  const team = store.teams.find((candidate) => candidate.id === invite.team_id);
  if (!team) {
    throw new Error("このコードに対応するチームが見つかりません。運営に確認してください。");
  }

  const role = input.role ?? "participant";
  let user = store.users.find(
    (candidate) => candidate.github_username === githubUsername
  );

  if (user) {
    const userId = user.id;
    const belongsToAnotherTeam = store.teamMembers.some((member) => {
      if (member.user_id !== userId || member.team_id === team.id) return false;
      return store.teams.some(
        (memberTeam) => memberTeam.id === member.team_id && memberTeam.event_id === team.event_id
      );
    });

    if (belongsToAnotherTeam) {
      throw new Error(
        "このイベントではすでに別のチームに所属しています。別のハッカソンには同時に参加できます。チームを変えたい場合は、運営に移動をお願いしてください。"
      );
    }
  }

  if (!user) {
    user = {
      id: randomUUID(),
      github_username: githubUsername,
      display_name: displayName,
      avatar_url: null,
      role,
      created_at: new Date().toISOString()
    };
    store.users.push(user);
  }

  if (
    !store.teamMembers.some(
      (member) => member.team_id === team.id && member.user_id === user.id
    )
  ) {
    store.teamMembers.push({
      id: randomUUID(),
      team_id: team.id,
      user_id: user.id
    });
  }

  return {
    role,
    displayName,
    githubUsername,
    eventId: team.event_id,
    teamId: team.id,
    teamName: team.name,
    inviteCode: code
  };
}

export async function joinTeamByName(input: {
  teamName: string;
  displayName: string;
  githubUsername?: string;
  role?: UserRole;
}): Promise<AppSession> {
  const teamName = input.teamName.trim();
  const displayName = input.displayName.trim();
  const githubUsername =
    input.githubUsername?.trim() || `guest-${randomUUID().slice(0, 8)}`;

  if (!teamName || !displayName) {
    throw new Error("Team name and display name are required.");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("name", teamName)
        .maybeSingle();

      if (teamError) throw teamError;
      if (!team) throw new Error("チームが見つかりません。運営に確認してください。");

      const { data: user, error: userError } = await supabase
        .from("users")
        .upsert(
          {
            github_username: githubUsername,
            display_name: displayName,
            role: input.role ?? "participant"
          },
          { onConflict: "github_username" }
        )
        .select("*")
        .single();

      if (userError) throw userError;

      const { error: memberError } = await supabase.from("team_members").upsert(
        {
          team_id: team.id,
          user_id: user.id
        },
        { onConflict: "team_id,user_id" }
      );

      if (memberError) throw memberError;

      return {
        role: input.role ?? "participant",
        displayName,
        githubUsername,
        teamId: team.id,
        teamName: team.name
      };
    }
  }

  const store = getMemoryStore();
  const team = store.teams.find(
    (candidate) => candidate.name.trim().toLowerCase() === teamName.toLowerCase()
  );

  if (!team) {
    throw new Error("チームが見つかりません。運営に確認してください。");
  }

  let user = store.users.find(
    (candidate) => candidate.github_username === githubUsername
  );
  if (!user) {
    user = {
      id: randomUUID(),
      github_username: githubUsername,
      display_name: displayName,
      avatar_url: null,
      role: input.role ?? "participant",
      created_at: new Date().toISOString()
    };
    store.users.push(user);
  }

  if (
    !store.teamMembers.some(
      (member) => member.team_id === team.id && member.user_id === user.id
    )
  ) {
    store.teamMembers.push({
      id: randomUUID(),
      team_id: team.id,
      user_id: user.id
    });
  }

  return {
    role: input.role ?? "participant",
    displayName,
    githubUsername,
    teamId: team.id,
    teamName: team.name
  };
}
