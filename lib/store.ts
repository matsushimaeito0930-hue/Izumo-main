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
  eventMembers: EventMember[];
  events: HackEvent[];
  event: HackEvent | null;
};

type EventMember = {
  event_id: string;
  user_id: string;
  role: UserRole;
  specialty: string | null;
};

type StateViewer = {
  githubUsername: string;
  role: UserRole;
};

const MEMORY_STORE_VERSION = "multi-event-v2";

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
    eventMembers: [],
    events: [],
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
  contributorActivities: Activity[] = activities,
  viewer?: StateViewer
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
    .map((post) => {
      const author = usersById.get(post.user_id);
      const authorGithub = author?.github_username ?? null;
      const { user_id: _privateUserId, ...publicPost } = post;
      void _privateUserId;

      return {
        ...publicPost,
        author_name: post.is_anonymous ? "匿名" : author?.display_name ?? "匿名",
        author_github: post.is_anonymous ? null : authorGithub,
        team_name: teamsById.get(post.team_id)?.name ?? "不明なチーム",
        can_accept: Boolean(
          viewer?.role === "admin" ||
            (viewer?.githubUsername &&
              authorGithub &&
              viewer.githubUsername.toLowerCase() === authorGithub.toLowerCase())
        ),
        replies: (repliesByPost.get(post.id) ?? []).sort((a, b) => {
          // 採用された回答を先頭に、それ以外は古い順。
          if (a.is_accepted !== b.is_accepted) return a.is_accepted ? -1 : 1;
          return Date.parse(a.created_at) - Date.parse(b.created_at);
        })
      };
    })
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

  // チーム相談は運営・メンター以外に別チームの本文を渡さない。
  // UIで非表示にするだけでは /api/state のJSONから読めてしまう。
  const viewerTeamIds = new Set(
    memberViews
      .filter(
        (member) =>
          member.github_username.toLowerCase() === viewer?.githubUsername.toLowerCase()
      )
      .map((member) => member.team_id)
  );
  const visibleMessages = messages.filter((message) => {
    if (!viewer || viewer.role === "admin" || viewer.role === "mentor") return true;
    if (message.team_id === null) return true;
    return viewer.role === "participant" && viewerTeamIds.has(message.team_id);
  });

  return {
    teams: teams.map(normalizeTeam).sort((a, b) => b.score - a.score),
    activities: activityViews,
    helpPosts: helpPostViews,
    members: memberViews,
    contributors: buildContributors(
      contributorActivities.filter((activity) => teamsById.has(activity.team_id)),
      memberViews
    ),
    messages: visibleMessages
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

export async function getSupabaseHackVerseState(
  eventId?: string | null,
  viewer?: StateViewer
): Promise<HackVerseState> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const teamsQuery = supabase
    .from("teams")
    .select("id,event_id,name,github_repo,score,commit_count,house_level,created_at");
  if (eventId) teamsQuery.eq("event_id", eventId);

  const teamsResult = await teamsQuery;
  if (teamsResult.error) throw teamsResult.error;

  const teams = ((teamsResult.data ?? []) as Team[]).map(normalizeTeam);
  const teamIds = teams.map((team) => team.id);
  const emptyResult = Promise.resolve({ data: [], error: null });

  const activitiesQuery = supabase
    .from("activities")
    .select(ACTIVITY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(30);
  const helpPostsQuery = supabase
    .from("help_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  const messagesQuery = supabase
    .from("chat_messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(80);
  const teamMembersQuery = supabase.from("team_members").select("*");
  const contributorQuery = supabase
    .from("activities")
    .select("id,team_id,type,score_delta,actor_login,actor_avatar_url,metadata,created_at")
    .not("actor_login", "is", null)
    .order("created_at", { ascending: false })
    .limit(3000);

  if (eventId && teamIds.length > 0) {
    activitiesQuery.in("team_id", teamIds);
    helpPostsQuery.in("team_id", teamIds);
    teamMembersQuery.in("team_id", teamIds);
    contributorQuery.in("team_id", teamIds);
  }
  if (eventId) messagesQuery.eq("event_id", eventId);

  const [
    usersResult,
    activitiesResult,
    helpPostsResult,
    messagesResult,
    teamMembersResult,
    contributorResult
  ] = await Promise.all([
    supabase.from("users").select("*"),
    eventId && teamIds.length === 0 ? emptyResult : activitiesQuery,
    eventId && teamIds.length === 0 ? emptyResult : helpPostsQuery,
    messagesQuery,
    eventId && teamIds.length === 0 ? emptyResult : teamMembersQuery,
    eventId && teamIds.length === 0 ? emptyResult : contributorQuery
  ]);

  const helpPostIds = ((helpPostsResult.data ?? []) as HelpPost[]).map((post) => post.id);
  const helpRepliesResult =
    eventId && helpPostIds.length === 0
      ? await emptyResult
      : await (() => {
          const query = supabase
            .from("help_replies")
            .select("*")
            .order("created_at", { ascending: true })
            .limit(200);
          if (eventId) query.in("help_post_id", helpPostIds);
          return query;
        })();

  const readError =
    usersResult.error ??
    helpPostsResult.error ??
    messagesResult.error ??
    teamMembersResult.error ??
    helpRepliesResult.error ??
    contributorResult.error;
  if (readError) throw readError;

  // schema.sql の適用前でも、実行者の列が無いだけで画面が真っ白にならないようにする。
  let activities: { data: unknown[] | null; error: { message?: string } | null } =
    activitiesResult;
  if (activities.error && isMissingActorColumn(activities.error)) {
    const legacyQuery = supabase
      .from("activities")
      .select(LEGACY_ACTIVITY_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(30);
    if (eventId) legacyQuery.in("team_id", teamIds);
    activities = await legacyQuery;
  }

  if (activities.error) throw activities.error;

  return withViews(
    (usersResult.data ?? seedUsers) as User[],
    teams,
    (activities.data ?? seedActivities) as Activity[],
    (helpPostsResult.data ?? seedHelpPosts) as HelpPost[],
    (helpRepliesResult.data ?? seedHelpReplies) as HelpReply[],
    ((messagesResult.data ?? seedChatMessages) as ChatMessage[]).filter(
      (message) => !eventId || message.event_id === eventId
    ),
    (teamMembersResult.data ?? []) as TeamMember[],
    (contributorResult.data ?? []) as Activity[],
    viewer
  );
}

export async function getHackVerseState(
  eventId?: string | null,
  viewer?: StateViewer
): Promise<HackVerseState> {
  if (isSupabaseConfigured()) {
    // 本番DBの失敗を空のメモリデータで隠さず、利用者と監視に障害を知らせる。
    return getSupabaseHackVerseState(eventId, viewer);
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
    store.teamMembers,
    store.activities,
    viewer
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
    .ilike("github_repo", githubRepo)
    .limit(2);

  if (error) {
    throw error;
  }

  return data?.length === 1 ? (data[0] as Team) : null;
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
  const commitDelta =
    input.type === "push" &&
    typeof metadata.commitCount === "number" &&
    Number.isFinite(metadata.commitCount)
      ? Math.max(0, Math.floor(metadata.commitCount))
      : 0;

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      let team: Team | null = null;

      if (input.teamId) {
        const { data, error } = await supabase
          .from("teams")
          .select("*")
          .eq("id", input.teamId)
          .maybeSingle();
        if (error) throw error;
        team = data as Team | null;
        if (!team) return null;
      }

      if (!team && input.githubRepo) {
        team = await findSupabaseTeam(input.githubRepo);

        // 登録されていないリポジトリからの通知は、他チームに混ぜず捨てる。
        if (!team) return null;
      }

      if (!team) return null;

      team = normalizeTeam(team);
      if (
        input.githubRepo &&
        team.github_repo?.toLowerCase() !== input.githubRepo.toLowerCase()
      ) {
        return null;
      }
      // チームを特定してから、そのチームが属するイベントの配点を読む。
      const scoreConfig = await getScoreConfig(team.event_id);
      const scoreDelta = scoreConfig[input.type];

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

      const { data: atomicActivity, error: atomicError } = await supabase
        .rpc("record_activity_atomic", {
          p_id: activity.id,
          p_team_id: activity.team_id,
          p_type: activity.type,
          p_message: activity.message,
          p_score_delta: activity.score_delta,
          p_commit_delta: commitDelta,
          p_actor_login: activity.actor_login,
          p_actor_avatar_url: activity.actor_avatar_url,
          p_metadata: activity.metadata,
          p_created_at: activity.created_at
        })
        .maybeSingle();

      if (atomicError) throw atomicError;
      if (!atomicActivity) throw new Error("Atomic activity recording returned no row");
      return {
        ...(atomicActivity as Activity),
        team_name: team.name
      };
    }
  }

  const store = getMemoryStore();
  let team = input.teamId
    ? store.teams.find((candidate) => candidate.id === input.teamId)
    : undefined;

  if (input.teamId && !team) return null;

  if (!team && input.githubRepo) {
    const matchingTeams = store.teams.filter(
      (candidate) => candidate.github_repo?.toLowerCase() === input.githubRepo?.toLowerCase()
    );
    team = matchingTeams.length === 1 ? matchingTeams[0] : undefined;
    // Supabase側と同じく、未登録リポジトリの通知は捨てる。
    if (!team) return null;
  }

  if (!team) return null;

  const scoreConfig = await getScoreConfig(team.event_id);
  const scoreDelta = scoreConfig[input.type];

  const duplicateActivity = store.activities.find((activity) => {
    const activityMetadata = activity.metadata ?? {};
    return (
      (input.githubDeliveryId &&
        activity.team_id === team?.id &&
        activityMetadata.githubDeliveryId === input.githubDeliveryId) ||
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

/** 同じリポジトリを使う複数イベントへ、1回のGitHub通知をそれぞれ記録する。 */
export async function recordRepositoryActivity(input: {
  type: ActivityType;
  githubRepo: string;
  fallbackTeamName?: string;
  githubDeliveryId?: string;
  actorLogin?: string;
  actorAvatarUrl?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ActivityView[]> {
  const githubRepo = input.githubRepo.trim();
  if (!githubRepo) return [];

  let teamIds: string[];
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("teams")
      .select("id")
      .ilike("github_repo", githubRepo);
    if (error) throw error;
    teamIds = (data ?? []).map((team) => team.id as string);
  } else {
    teamIds = getMemoryStore().teams
      .filter((team) => team.github_repo?.toLowerCase() === githubRepo.toLowerCase())
      .map((team) => team.id);
  }

  const recorded = await Promise.all(
    teamIds.map((teamId) => recordActivity({ ...input, githubRepo, teamId }))
  );
  return recorded.filter((activity): activity is ActivityView => activity !== null);
}

/**
 * GitHubログインした運営もDMの宛先にできるよう、最初にDM画面を開いた時点で
 * 公開プロフィールだけを users に同期する。既存メンターの specialty は上書きしない。
 */
export async function syncDirectMessageProfile(input: {
  eventId: string;
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
      const { data: user, error } = await supabase
        .from("users")
        .upsert(
          {
            github_username: githubUsername,
            display_name: input.displayName.trim() || githubUsername,
            avatar_url: input.avatarUrl,
            role: input.role
          },
          { onConflict: "github_username" }
        )
        .select("id")
        .single();
      if (error || !user) throw error ?? new Error("プロフィールを保存できませんでした。");

      const { error: membershipError } = await supabase.from("event_members").upsert(
        {
          event_id: input.eventId,
          user_id: user.id,
          role: input.role,
          specialty: null
        },
        { onConflict: "event_id,user_id" }
      );
      if (membershipError) throw membershipError;
      return;
    }
  }

  const store = getMemoryStore();
  let existing = store.users.find(
    (user) => user.github_username.toLowerCase() === githubUsername.toLowerCase()
  );
  if (existing) {
    existing.display_name = input.displayName.trim() || githubUsername;
    existing.avatar_url = input.avatarUrl;
    existing.role = input.role;
  } else {
    existing = {
      id: randomUUID(),
      github_username: githubUsername,
      display_name: input.displayName.trim() || githubUsername,
      avatar_url: input.avatarUrl,
      role: input.role,
      specialty: null,
      created_at: new Date().toISOString()
    };
    store.users.push(existing);
  }

  const membership = store.eventMembers.find(
    (member) => member.event_id === input.eventId && member.user_id === existing.id
  );
  if (membership) {
    membership.role = input.role;
  } else {
    store.eventMembers.push({
      event_id: input.eventId,
      user_id: existing.id,
      role: input.role,
      specialty: null
    });
  }
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
  eventId: string;
  viewerLogin: string;
  viewerRole: UserRole;
}): Promise<DirectMessageContact[]> {
  const allowedRoles = dmRecipientRoles(input.viewerRole);
  if (allowedRoles.length === 0) return [];

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: memberRows, error: membershipError } = await supabase
        .from("event_members")
        .select("user_id,role,specialty")
        .eq("event_id", input.eventId)
        .in("role", allowedRoles)
      if (membershipError) throw membershipError;
      const memberships = (memberRows ?? []) as Pick<
        EventMember,
        "user_id" | "role" | "specialty"
      >[];
      if (memberships.length === 0) return [];

      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id,github_username,display_name,avatar_url")
        .in("id", memberships.map((member) => member.user_id))
        .order("display_name", { ascending: true });
      if (usersError) throw usersError;
      const membershipByUser = new Map(
        memberships.map((membership) => [membership.user_id, membership])
      );
      return ((users ?? []) as Array<
        Pick<User, "id" | "github_username" | "display_name" | "avatar_url">
      >)
        .filter(
          (user) => user.github_username.toLowerCase() !== input.viewerLogin.toLowerCase()
        )
        .flatMap((user) => {
          const membership = membershipByUser.get(user.id);
          return membership
            ? [
                {
                  github_username: user.github_username,
                  display_name: user.display_name,
                  avatar_url: user.avatar_url,
                  role: membership.role,
                  specialty: membership.specialty
                }
              ]
            : [];
        });
    }
  }

  const store = getMemoryStore();
  const membershipByUser = new Map(
    store.eventMembers
      .filter(
        (member) => member.event_id === input.eventId && allowedRoles.includes(member.role)
      )
      .map((member) => [member.user_id, member])
  );
  return store.users
    .filter(
      (user) =>
        membershipByUser.has(user.id) &&
        user.github_username.toLowerCase() !== input.viewerLogin.toLowerCase()
    )
    .map((user) => {
      const membership = membershipByUser.get(user.id) as EventMember;
      return {
        ...toDirectMessageContact(user),
        role: membership.role,
        specialty: membership.specialty
      };
    })
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
      const messages = (data ?? []) as DirectMessage[];
      const attachmentPaths = messages
        .map((message) => message.attachment_path)
        .filter((path): path is string => Boolean(path));

      if (attachmentPaths.length === 0) return messages;

      const { data: signedUrls, error: signedUrlError } = await supabase.storage
        .from("direct-message-attachments")
        .createSignedUrls(attachmentPaths, 60 * 60);
      if (signedUrlError) throw signedUrlError;

      const urlByPath = new Map(
        (signedUrls ?? []).map((item) => [item.path, item.signedUrl])
      );
      return messages.map((message) => ({
        ...message,
        attachment_url: message.attachment_path
          ? urlByPath.get(message.attachment_path) ?? null
          : null
      }));
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
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
}): Promise<DirectMessage> {
  const senderLogin = input.senderLogin.trim();
  const recipientLogin = input.recipientLogin.trim();
  const body = input.body.trim();
  const attachmentPath = input.attachmentPath?.trim() || null;
  const attachmentName = input.attachmentName?.trim() || null;
  const attachmentMimeType = input.attachmentMimeType?.trim() || null;
  const attachmentSize = input.attachmentSize ?? null;
  const eventId = input.eventId ?? (await getEvent())?.id ?? "memory-event";

  if (!senderLogin || !recipientLogin || senderLogin.toLowerCase() === recipientLogin.toLowerCase()) {
    throw new Error("DMの相手を選択してください。");
  }
  if ((!body && !attachmentPath) || body.length > 1000) {
    throw new Error("メッセージか画像を入力してください。本文は1000文字までです。");
  }
  if (attachmentPath && (!attachmentName || !attachmentMimeType || !attachmentSize)) {
    throw new Error("画像の情報が不完全です。もう一度選択してください。");
  }

  const allowedRoles = dmRecipientRoles(input.senderRole);
  if (allowedRoles.length === 0) {
    throw new Error("この役割ではDMを利用できません。");
  }

  let recipient: Pick<User, "id" | "github_username"> | undefined;
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("id,github_username")
        .ilike("github_username", recipientLogin)
        .maybeSingle();
      if (error) throw error;
      recipient = data as Pick<User, "id" | "github_username"> | null ?? undefined;

      if (!recipient) {
        throw new Error("この相手にはDMを送れません。");
      }
      const { data: recipientMembership, error: membershipError } = await supabase
        .from("event_members")
        .select("role")
        .eq("event_id", eventId)
        .eq("user_id", recipient.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!recipientMembership || !allowedRoles.includes(recipientMembership.role as UserRole)) {
        throw new Error("このイベントの相手にはDMを送れません。");
      }

      const message: DirectMessage = {
        id: randomUUID(),
        event_id: eventId,
        sender_login: senderLogin,
        recipient_login: recipient.github_username,
        sender_name: input.senderName.trim() || senderLogin,
        sender_role: input.senderRole,
        body,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
        attachment_mime_type: attachmentMimeType,
        attachment_size: attachmentSize,
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
  const recipientMembership = recipient
    ? store.eventMembers.find(
        (member) => member.event_id === eventId && member.user_id === recipient?.id
      )
    : undefined;
  if (!recipient || !recipientMembership || !allowedRoles.includes(recipientMembership.role)) {
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
    attachment_path: attachmentPath,
    attachment_name: attachmentName,
    attachment_mime_type: attachmentMimeType,
    attachment_size: attachmentSize,
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
      if (error || !data) throw error ?? new Error("メッセージを保存できませんでした。");
      return data as ChatMessage;
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
  const title = input.title.trim();
  const body = input.body.trim();
  const category = input.category.trim();
  if (!title || title.length > 100) {
    throw new Error("タイトルは1〜100文字で入力してください。");
  }
  if (!body || body.length > 2000) {
    throw new Error("質問の詳細は1〜2000文字で入力してください。");
  }
  if (!category || category.length > 50) {
    throw new Error("カテゴリは1〜50文字で入力してください。");
  }

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
        title,
        body,
        category,
        is_anonymous: input.anonymous === true,
        status,
        created_at: new Date().toISOString()
      };

      const { error: insertError } = await supabase.from("help_posts").insert(post);
      if (insertError) throw insertError;
      const { user_id: _privateUserId, ...publicPost } = post;
      void _privateUserId;
      return {
        ...publicPost,
        author_name: input.anonymous ? "匿名" : author?.display_name ?? input.authorName ?? "参加者",
        author_github: input.anonymous
          ? null
          : author?.github_username ?? input.authorGithub ?? null,
        team_name: selectedTeam.name,
        replies: [],
        can_accept: true
      };
    }
  }

  const store = getMemoryStore();
  const team = store.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new Error("選択されたチームが見つかりません。");

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
    title,
    body,
    category,
    is_anonymous: input.anonymous === true,
    status,
    created_at: new Date().toISOString()
  };

  store.helpPosts.unshift(post);

  const { user_id: _privateUserId, ...publicPost } = post;
  void _privateUserId;

  return {
    ...publicPost,
    author_name: input.anonymous ? "匿名" : user.display_name,
    author_github: input.anonymous ? null : user.github_username,
    team_name: team.name,
    replies: [],
    can_accept: true
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

/** 掲示板の投稿者を、API内の権限チェックだけに使う。公開レスポンスには含めない。 */
export async function getHelpPostById(
  id: string,
  eventId?: string
): Promise<{ id: string; author_github: string | null; event_id: string } | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: post, error: postError } = await supabase
        .from("help_posts")
        .select("id,user_id,team_id")
        .eq("id", id)
        .maybeSingle();
      if (postError) throw postError;
      if (!post) return null;

      const [teamResult, userResult] = await Promise.all([
        supabase.from("teams").select("event_id").eq("id", post.team_id).maybeSingle(),
        supabase.from("users").select("github_username").eq("id", post.user_id).maybeSingle()
      ]);
      if (teamResult.error || userResult.error) {
        throw teamResult.error ?? userResult.error;
      }

      const postEventId = (teamResult.data as { event_id?: string } | null)?.event_id;
      if (!postEventId || (eventId && postEventId !== eventId)) return null;

      return {
        id: post.id as string,
        author_github:
          (userResult.data as { github_username?: string } | null)?.github_username ?? null,
        event_id: postEventId
      };
    }
  }

  const store = getMemoryStore();
  const post = store.helpPosts.find((candidate) => candidate.id === id);
  if (!post) return null;
  const team = store.teams.find((candidate) => candidate.id === post.team_id);
  if (!team || (eventId && team.event_id !== eventId)) return null;
  const user = store.users.find((candidate) => candidate.id === post.user_id);
  return {
    id: post.id,
    author_github: user?.github_username ?? null,
    event_id: team.event_id
  };
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

/** 指定イベント、または最後に作成したイベント。 */
export async function getEvent(eventId?: string | null): Promise<HackEvent | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const query = supabase.from("events").select("*");
      const { data, error } = eventId
        ? await query.eq("id", eventId).maybeSingle()
        : await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data as HackEvent | null) ?? null;
    }
  }

  const store = getMemoryStore();
  return eventId
    ? store.events.find((event) => event.id === eventId) ?? null
    : store.event ?? store.events.at(-1) ?? null;
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

  return getMemoryStore().events.find(
    (event) => event.join_code.toUpperCase() === joinCode
  ) ?? null;
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
      const { data: ownerUser, error: ownerError } = await supabase
        .from("users")
        .upsert(
          {
            github_username: owner,
            display_name: owner,
            role: "admin"
          },
          { onConflict: "github_username" }
        )
        .select("id")
        .single();
      if (ownerError || !ownerUser) {
        throw ownerError ?? new Error("主催者情報を保存できませんでした。");
      }
      const { error: membershipError } = await supabase.from("event_members").upsert(
        {
          event_id: data.id,
          user_id: ownerUser.id,
          role: "admin",
          specialty: null
        },
        { onConflict: "event_id,user_id" }
      );
      if (membershipError) throw membershipError;
      return data as HackEvent;
    }
  }

  const store = getMemoryStore();
  store.event = event;
  store.events.push(event);
  let ownerUser = store.users.find(
    (user) => user.github_username.toLowerCase() === owner.toLowerCase()
  );
  if (!ownerUser) {
    ownerUser = {
      id: randomUUID(),
      github_username: owner,
      display_name: owner,
      avatar_url: null,
      role: "admin",
      specialty: null,
      created_at: new Date().toISOString()
    };
    store.users.push(ownerUser);
  }
  store.eventMembers.push({
    event_id: event.id,
    user_id: ownerUser.id,
    role: "admin",
    specialty: null
  });
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
  return getMemoryStore().events
    .filter((event) => event.owner_github_username.toLowerCase() === owner.toLowerCase())
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** ログイン中の人が切り替えられるイベントと、そのイベントでの役割。 */
export type JoinedEvent = HackEvent & {
  role: UserRole;
  teamId?: string;
  teamName?: string;
  teamGithubRepo?: string | null;
};

export async function getEventMemberRole(input: {
  eventId: string;
  githubUsername: string;
}): Promise<UserRole | null> {
  const login = input.githubUsername.trim();
  if (!login) return null;
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .ilike("github_username", login)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) return null;
      const { data: member, error: memberError } = await supabase
        .from("event_members")
        .select("role")
        .eq("event_id", input.eventId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (memberError) throw memberError;
      return (member?.role as UserRole | undefined) ?? null;
    }
  }
  const store = getMemoryStore();
  const user = store.users.find(
    (candidate) => candidate.github_username.toLowerCase() === login.toLowerCase()
  );
  if (!user) return null;
  return store.eventMembers.find(
    (member) => member.event_id === input.eventId && member.user_id === user.id
  )?.role ?? null;
}

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
        .ilike("github_username", login)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) return [];

      const { data: memberships, error: membershipError } = await supabase
        .from("event_members")
        .select("event_id,role")
        .eq("user_id", user.id);
      if (membershipError) throw membershipError;
      const eventIds = [...new Set((memberships ?? []).map((membership) => membership.event_id))];
      if (eventIds.length === 0) return [];

      const [eventsResult, teamMembershipsResult] = await Promise.all([
        supabase.from("events").select("*").in("id", eventIds).order("created_at", { ascending: false }),
        supabase.from("team_members").select("team_id").eq("user_id", user.id)
      ]);
      if (eventsResult.error || teamMembershipsResult.error) {
        throw eventsResult.error ?? teamMembershipsResult.error;
      }
      const teamIds = (teamMembershipsResult.data ?? []).map((member) => member.team_id);
      const teamsResult = teamIds.length
        ? await supabase.from("teams").select("id,event_id,name,github_repo").in("id", teamIds)
        : { data: [], error: null };
      if (teamsResult.error) throw teamsResult.error;

      const roleByEvent = new Map((memberships ?? []).map((member) => [member.event_id, member.role as UserRole]));
      const teamByEvent = new Map((teamsResult.data ?? []).map((team) => [team.event_id, team]));
      return (eventsResult.data ?? []).flatMap((event) => {
        const role = roleByEvent.get(event.id);
        if (!role) return [];
        const team = teamByEvent.get(event.id);
        if (role === "participant" && !team) return [];
        return [{
          ...(event as HackEvent),
          role,
          teamId: team?.id,
          teamName: team?.name,
          teamGithubRepo: team?.github_repo
        }];
      });
    }
  }

  const store = getMemoryStore();
  const user = store.users.find(
    (candidate) => candidate.github_username.toLowerCase() === login.toLowerCase()
  );
  if (!user) return [];
  return store.eventMembers.flatMap((membership) => {
    if (membership.user_id !== user.id) return [];
    const event = store.events.find((candidate) => candidate.id === membership.event_id);
    if (!event) return [];
    const team = store.teams.find(
      (candidate) =>
        candidate.event_id === membership.event_id &&
        store.teamMembers.some(
          (member) => member.user_id === user.id && member.team_id === candidate.id
        )
    );
    if (membership.role === "participant" && !team) return [];
    return [{
      ...event,
      role: membership.role,
      teamId: team?.id,
      teamName: team?.name,
      teamGithubRepo: team?.github_repo
    }];
  }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/**
 * 参加者本人が、終了したイベントから退出する。
 *
 * チームのスコア・活動・質問などイベント共有の記録は消さない。本人の所属だけを外し、
 * 次に参加する場合は運営から渡された部屋番号で入り直す。
 */
export async function leaveEventAsParticipant(input: {
  eventId: string;
  githubUsername: string;
}): Promise<void> {
  const eventId = input.eventId.trim();
  const githubUsername = input.githubUsername.trim();
  if (!eventId || !githubUsername) {
    throw new Error("退出するイベントを選択してください。");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .ilike("github_username", githubUsername)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) throw new Error("この参加者は見つかりません。");

      const { data: eventMember, error: eventMemberError } = await supabase
        .from("event_members")
        .select("role")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (eventMemberError) throw eventMemberError;
      if (eventMember?.role !== "participant") {
        throw new Error("参加者として参加しているイベントだけ退出できます。");
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);
      if (membershipsError) throw membershipsError;

      const teamIds = [...new Set((memberships ?? []).map((membership) => membership.team_id))];
      if (teamIds.length > 0) {
        const { data: eventTeams, error: eventTeamsError } = await supabase
          .from("teams")
          .select("id")
          .eq("event_id", eventId)
          .in("id", teamIds);
        if (eventTeamsError) throw eventTeamsError;
        const eventTeamIds = (eventTeams ?? []).map((team) => team.id);
        if (eventTeamIds.length > 0) {
          const { error: removeTeamMembershipError } = await supabase
            .from("team_members")
            .delete()
            .eq("user_id", user.id)
            .in("team_id", eventTeamIds);
          if (removeTeamMembershipError) throw removeTeamMembershipError;
        }
      }

      const { error: removeEventMembershipError } = await supabase
        .from("event_members")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", user.id);
      if (removeEventMembershipError) throw removeEventMembershipError;
      return;
    }
  }

  const store = getMemoryStore();
  const user = store.users.find(
    (candidate) => candidate.github_username.toLowerCase() === githubUsername.toLowerCase()
  );
  if (!user) throw new Error("この参加者は見つかりません。");
  const eventMember = store.eventMembers.find(
    (member) => member.event_id === eventId && member.user_id === user.id
  );
  if (eventMember?.role !== "participant") {
    throw new Error("参加者として参加しているイベントだけ退出できます。");
  }

  const eventTeamIds = new Set(
    store.teams.filter((team) => team.event_id === eventId).map((team) => team.id)
  );
  store.teamMembers = store.teamMembers.filter(
    (member) => member.user_id !== user.id || !eventTeamIds.has(member.team_id)
  );
  store.eventMembers = store.eventMembers.filter(
    (member) => !(member.event_id === eventId && member.user_id === user.id)
  );
}

function resetMemoryEventData(store: MemoryStore, eventId: string) {
  const teamIds = new Set(
    store.teams.filter((team) => team.event_id === eventId).map((team) => team.id)
  );
  const postIds = new Set(
    store.helpPosts.filter((post) => teamIds.has(post.team_id)).map((post) => post.id)
  );
  store.teams = store.teams.filter((team) => !teamIds.has(team.id));
  store.teamMembers = store.teamMembers.filter((member) => !teamIds.has(member.team_id));
  store.teamInvites = store.teamInvites.filter((invite) => !teamIds.has(invite.team_id));
  store.activities = store.activities.filter((activity) => !teamIds.has(activity.team_id));
  store.helpPosts = store.helpPosts.filter((post) => !postIds.has(post.id));
  store.helpReplies = store.helpReplies.filter((reply) => !postIds.has(reply.help_post_id));
  store.messages = store.messages.filter((message) => message.event_id !== eventId);
  store.directMessages = store.directMessages.filter((message) => message.event_id !== eventId);
  store.eventMembers = store.eventMembers.filter((member) => member.event_id !== eventId);
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

/** イベント名を保存する。既存のチームと進捗、配点は保持する。 */
export async function saveEvent(input: {
  name: string;
  ownerGithubUsername?: string;
  eventId?: string;
}): Promise<HackEvent> {
  const name = input.name.trim();
  if (!name) throw new Error("イベント名を入力してください。");

  const existing = await getEvent(input.eventId);
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
        if (error || !data) throw error ?? new Error("イベントを更新できませんでした。");
        return data as HackEvent;
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
        if (error || !data) throw error ?? new Error("イベントを作成できませんでした。");
        return data as HackEvent;
      }
    }
  }

  const store = getMemoryStore();
  const savedEvent: HackEvent = {
    id: existing?.id ?? randomUUID(),
    name,
    join_code: joinCode,
    owner_github_username:
      existing?.owner_github_username ?? input.ownerGithubUsername?.trim() ?? "test-owner",
    score_config: existing?.score_config,
    created_at: existing?.created_at ?? new Date().toISOString()
  };
  const existingIndex = store.events.findIndex((event) => event.id === savedEvent.id);
  if (existingIndex >= 0) store.events[existingIndex] = savedEvent;
  else store.events.push(savedEvent);
  store.event = savedEvent;
  return savedEvent;
}

/**
 * いま有効な配点。
 *
 * イベントに設定があればそれを、無ければ既定値を返す。
 * 保存されている値が壊れていても normalizeScoreConfig が既定値で埋める。
 */
export async function getScoreConfig(eventId?: string): Promise<ScoreConfig> {
  const event = await getEvent(eventId);
  if (!event?.score_config) return { ...DEFAULT_SCORE_BY_ACTIVITY };
  return normalizeScoreConfig(event.score_config);
}

/**
 * 記録済みの活動を、いまの配点で計算し直してチームの合計に反映する。
 *
 * 途中で配点を変えると、変更前と変更後の活動が混ざって順位の意味が壊れる。
 * それを避けるため、変更時は必ず過去分もそろえる。
 */
export async function recalculateScores(config: ScoreConfig, eventId: string): Promise<{
  updatedActivities: number;
  updatedTeams: number;
}> {
  const totals = new Map<string, { score: number; commits: number }>();
  let updatedActivities = 0;
  const targetEventId = eventId ?? (await getEvent())?.id;
  if (!targetEventId) throw new Error("再計算するイベントを選択してください。");

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
      const { data: teamRows, error: teamsError } = await supabase
        .from("teams")
        .select("id")
        .eq("event_id", eventId);
      if (teamsError) throw teamsError;

      const teamIds = ((teamRows ?? []) as { id: string }[]).map((team) => team.id);
      if (teamIds.length === 0) {
        return { updatedActivities: 0, updatedTeams: 0 };
      }

      const { data, error } = await supabase
        .from("activities")
        .select("id,team_id,type,score_delta,metadata")
        .in("team_id", teamIds)
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
  const eventTeamIds = new Set(
    store.teams.filter((team) => team.event_id === eventId).map((team) => team.id)
  );

  for (const activity of store.activities.filter((item) => eventTeamIds.has(item.team_id))) {
    const nextDelta = applyActivity(activity);
    if (nextDelta !== activity.score_delta) {
      activity.score_delta = nextDelta;
      updatedActivities += 1;
    }
  }

  const eventTeams = store.teams.filter((team) => team.event_id === eventId);
  for (const team of eventTeams) {
    const bucket = totals.get(team.id) ?? { score: 0, commits: 0 };
    team.score = bucket.score;
    team.commit_count = bucket.commits;
    team.house_level = getHouseLevel(bucket.score);
  }

  return { updatedActivities, updatedTeams: eventTeams.length };
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
  const eventIndex = store.events.findIndex((candidate) => candidate.id === event.id);
  if (eventIndex >= 0) store.events[eventIndex] = { ...store.events[eventIndex], score_config: config };
  if (store.event?.id === event.id) store.event = { ...store.event, score_config: config };

  const result = await recalculateScores(config, event.id);
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
  resetMemoryEventData(store, event.id);
  store.events = store.events.filter((candidate) => candidate.id !== event.id);
  store.event = store.events.at(-1) ?? null;
}

/** 参加コードの照合。イベント未設定ならコード無しで通す（ローカルデモ用）。 */
export async function verifyJoinCode(code: string | undefined): Promise<boolean> {
  const event = await getEvent();
  if (!event) return true;
  return (code ?? "").trim().toUpperCase() === event.join_code.toUpperCase();
}

/** イベント参加コードまたはチーム招待コードを検証する。 */
export async function verifyMentorInviteCode(code: string | undefined): Promise<boolean> {
  return Boolean(code && (await getEventIdForAccessCode(code)));
}

export async function getEventIdForAccessCode(code: string): Promise<string | undefined> {
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
  const eventId = await getEventIdForAccessCode(code);
  if (!eventId) throw new Error("このコードのイベントが見つかりません。");

  // 別イベントでの運営ロールを引き継がない。主催者本人が同じイベントへ
  // メンター用コードで入り直した場合だけ、そのイベントの運営を維持する。
  const role: UserRole = await isEventOwner({
    eventId,
    githubUsername
  }) ? "admin" : "mentor";

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

      const { error: membershipError } = await supabase.from("event_members").upsert(
        {
          event_id: eventId,
          user_id: data.id,
          role,
          specialty
        },
        { onConflict: "event_id,user_id" }
      );
      if (membershipError) throw membershipError;

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

  const membership = store.eventMembers.find(
    (member) => member.event_id === eventId && member.user_id === user.id
  );
  if (membership) {
    membership.role = role;
    membership.specialty = specialty;
  } else {
    store.eventMembers.push({
      event_id: eventId,
      user_id: user.id,
      role,
      specialty
    });
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
      const { data: target, error: targetError } = await supabase
        .from("teams")
        .select("id,event_id")
        .eq("id", input.teamId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) throw new Error("チームが見つかりません。");

      const { data: taken } = await supabase
        .from("teams")
        .select("id")
        .ilike("github_repo", githubRepo)
        .eq("event_id", target.event_id)
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
  const team = store.teams.find((candidate) => candidate.id === input.teamId);
  if (!team) throw new Error("チームが見つかりません。");

  const taken = store.teams.find(
    (candidate) =>
      candidate.event_id === team.event_id &&
      candidate.github_repo?.toLowerCase() === githubRepo.toLowerCase() &&
      candidate.id !== input.teamId
  );
  if (taken) throw new Error("そのリポジトリは別のチームが使っています。");

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
      const { data: target, error: targetError } = await supabase
        .from("teams")
        .select("id,event_id")
        .eq("id", input.teamId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) throw new Error("チームが見つかりません。");

      const { data: duplicateName } = await supabase
        .from("teams")
        .select("id")
        .ilike("name", name)
        .eq("event_id", target.event_id)
        .neq("id", input.teamId)
        .maybeSingle();
      if (duplicateName) throw new Error("同じ名前のチームがすでにあります。");

      if (githubRepo) {
        const { data: duplicateRepo } = await supabase
          .from("teams")
          .select("id")
          .ilike("github_repo", githubRepo)
          .eq("event_id", target.event_id)
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
      candidate.event_id === team.event_id &&
      candidate.id !== input.teamId &&
      candidate.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicateName) throw new Error("同じ名前のチームがすでにあります。");

  const duplicateRepo = githubRepo
      ? store.teams.find(
        (candidate) =>
          candidate.event_id === team.event_id &&
          candidate.id !== input.teamId &&
          candidate.github_repo?.toLowerCase() === githubRepo.toLowerCase()
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
  expectedEventId?: string;
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
      if (input.expectedEventId && (team as Team).event_id !== input.expectedEventId) {
        throw new Error("この部屋番号は、入力したイベントのものではありません。");
      }

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

      const { error: eventMemberError } = await supabase.from("event_members").upsert(
        {
          event_id: (team as Team).event_id,
          user_id: user.id,
          role,
          specialty: null
        },
        { onConflict: "event_id,user_id" }
      );
      if (eventMemberError) throw eventMemberError;

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
  if (input.expectedEventId && team.event_id !== input.expectedEventId) {
    throw new Error("この部屋番号は、入力したイベントのものではありません。");
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

  const eventMember = store.eventMembers.find(
    (member) => member.event_id === team.event_id && member.user_id === user.id
  );
  if (eventMember) {
    eventMember.role = role;
  } else {
    store.eventMembers.push({
      event_id: team.event_id,
      user_id: user.id,
      role,
      specialty: null
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
  const role = input.role ?? "participant";

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
            role
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

      const { error: eventMemberError } = await supabase.from("event_members").upsert(
        {
          event_id: team.event_id,
          user_id: user.id,
          role,
          specialty: null
        },
        { onConflict: "event_id,user_id" }
      );
      if (eventMemberError) throw eventMemberError;

      return {
        role,
        displayName,
        githubUsername,
        eventId: team.event_id,
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

  const eventMember = store.eventMembers.find(
    (member) => member.event_id === team.event_id && member.user_id === user.id
  );
  if (eventMember) {
    eventMember.role = role;
  } else {
    store.eventMembers.push({
      event_id: team.event_id,
      user_id: user.id,
      role,
      specialty: null
    });
  }

  return {
    role,
    displayName,
    githubUsername,
    eventId: team.event_id,
    teamId: team.id,
    teamName: team.name
  };
}
