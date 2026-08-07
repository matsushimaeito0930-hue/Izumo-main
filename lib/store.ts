import { randomUUID } from "node:crypto";
import { ACTIVITY_LABELS, SCORE_BY_ACTIVITY } from "@/lib/constants";
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
  HackVerseState,
  HelpPost,
  HelpPostView,
  HackEvent,
  HelpReply,
  HelpStatus,
  Team,
  TeamInvite,
  TeamInviteView,
  TeamMember,
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

function withViews(
  users: User[],
  teams: Team[],
  activities: Activity[],
  helpPosts: HelpPost[],
  helpReplies: HelpReply[],
  messages: ChatMessage[]
): HackVerseState {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const usersById = new Map(users.map((user) => [user.id, user]));

  const activityViews: ActivityView[] = activities
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
    .map((post) => ({
      ...post,
      author_name: usersById.get(post.user_id)?.display_name ?? "匿名",
      author_github: usersById.get(post.user_id)?.github_username ?? null,
      team_name: teamsById.get(post.team_id)?.name ?? "不明なチーム",
      replies: (repliesByPost.get(post.id) ?? []).sort((a, b) => {
        // 採用された回答を先頭に、それ以外は古い順。
        if (a.is_accepted !== b.is_accepted) return a.is_accepted ? -1 : 1;
        return Date.parse(a.created_at) - Date.parse(b.created_at);
      })
    }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return {
    teams: teams.map(normalizeTeam).sort((a, b) => b.score - a.score),
    activities: activityViews,
    helpPosts: helpPostViews,
    messages: messages
      .slice()
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    updatedAt: new Date().toISOString()
  };
}

export async function getSupabaseHackVerseState(): Promise<HackVerseState> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const [
    usersResult,
    teamsResult,
    activitiesResult,
    helpPostsResult,
    helpRepliesResult,
    messagesResult
  ] =
    await Promise.all([
      supabase.from("users").select("*"),
      supabase
        .from("teams")
        .select("id,name,github_repo,score,commit_count,house_level,created_at"),
      supabase
        .from("activities")
        .select("id,team_id,type,message,score_delta,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("help_posts").select("*").order("created_at", { ascending: false }).limit(30),
      supabase
        .from("help_replies")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200),
      supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(80)
    ]);

  if (teamsResult.error || activitiesResult.error) {
    throw teamsResult.error ?? activitiesResult.error;
  }

  return withViews(
    (usersResult.data ?? seedUsers) as User[],
    ((teamsResult.data ?? seedTeams) as Team[]).map(normalizeTeam),
    (activitiesResult.data ?? seedActivities) as Activity[],
    (helpPostsResult.data ?? seedHelpPosts) as HelpPost[],
    (helpRepliesResult.error
      ? []
      : (helpRepliesResult.data ?? seedHelpReplies)) as HelpReply[],
    (messagesResult.error
      ? []
      : (messagesResult.data ?? seedChatMessages)) as ChatMessage[]
  );
}

export async function getHackVerseState(): Promise<HackVerseState> {
  if (isSupabaseConfigured()) {
    try {
      return await getSupabaseHackVerseState();
    } catch {
      // Keep local development usable when Supabase is unavailable.
    }
  }

  const store = getMemoryStore();
  return withViews(
    store.users,
    store.teams,
    store.activities,
    store.helpPosts,
    store.helpReplies,
    store.messages
  );
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

async function findOrCreateSupabaseTeam(githubRepo: string, fallbackName: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data: existingTeam, error: selectError } = await supabase
    .from("teams")
    .select("*")
    .eq("github_repo", githubRepo)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existingTeam) {
    return existingTeam as Team;
  }

  const newTeam: Team = {
    id: randomUUID(),
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

function findOrCreateMemoryTeam(githubRepo: string, fallbackName: string): Team {
  const store = getMemoryStore();
  const existingTeam = store.teams.find((team) => team.github_repo === githubRepo);
  if (existingTeam) {
    return existingTeam;
  }

  const newTeam: Team = {
    id: randomUUID(),
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

export async function recordActivity(input: {
  type: ActivityType;
  teamId?: string;
  githubRepo?: string;
  fallbackTeamName?: string;
  githubDeliveryId?: string;
  metadata?: Record<string, unknown>;
}): Promise<ActivityView> {
  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    ...(input.githubDeliveryId ? { githubDeliveryId: input.githubDeliveryId } : {})
  };
  const scoreDelta = SCORE_BY_ACTIVITY[input.type];
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
      }

      if (!team) {
        const { data } = await supabase.from("teams").select("*").limit(1).single();
        team = data as Team | null;
      }

      if (!team) {
        throw new Error("No team is available for this activity.");
      }

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
      const message = makeActivityMessage(team.name, input.type, metadata);
      const activity: Activity = {
        id: randomUUID(),
        team_id: team.id,
        type: input.type,
        message,
        score_delta: scoreDelta,
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

      const { data: insertedActivity, error: activityError } = await supabase
        .from("activities")
        .insert(activity)
        .select("*")
        .single();

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
  let team =
    (input.teamId
      ? store.teams.find((candidate) => candidate.id === input.teamId)
      : undefined) ??
    (input.githubRepo
      ? store.teams.find((candidate) => candidate.github_repo === input.githubRepo)
      : store.teams[0]);

  if (!team) {
    throw new Error("No team is available for this activity.");
  }

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
    message: makeActivityMessage(team.name, input.type, metadata),
    score_delta: scoreDelta,
    metadata,
    created_at: new Date().toISOString()
  };

  store.activities.unshift(activity);

  return {
    ...activity,
    team_name: team.name
  };
}

export async function createChatMessage(input: {
  channel: ChatChannel;
  teamId?: string;
  authorName: string;
  authorRole: ChatMessage["author_role"];
  body: string;
}): Promise<ChatMessage> {
  const body = input.body.trim();
  const authorName = input.authorName.trim() || "HackRadar user";

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
        const { data } = await supabase
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
        author = data as User | null;
      } else {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("role", "participant")
          .limit(1)
          .single();
        author = data as User | null;
      }

      const post: HelpPost = {
        id: randomUUID(),
        user_id: author?.id ?? "unknown-user",
        team_id: selectedTeam.id,
        title: input.title,
        body: input.body,
        category: input.category,
        status,
        created_at: new Date().toISOString()
      };

      await supabase.from("help_posts").insert(post);
      return {
        ...post,
        author_name: author?.display_name ?? input.authorName ?? "参加者",
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
    status,
    created_at: new Date().toISOString()
  };

  store.helpPosts.unshift(post);

  return {
    ...post,
    author_name: user.display_name,
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
export async function getEvent(): Promise<HackEvent | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data as HackEvent;
    }
  }

  return getMemoryStore().event;
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
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>
) {
  // teamsの削除は外部キーのcascadeで、チームに紐づく履歴もまとめて初期化する。
  const { error } = await supabase
    .from("teams")
    .delete()
    .not("id", "is", null);
  if (error) throw error;
}

/** イベント名を保存する。名前を変更したときはチームと進捗を新イベント用に初期化する。 */
export async function saveEvent(input: { name: string }): Promise<HackEvent> {
  const name = input.name.trim();
  if (!name) throw new Error("イベント名を入力してください。");

  const existing = await getEvent();
  const shouldReset = Boolean(existing && existing.name !== name);
  const joinCode = shouldReset ? makeJoinCode() : existing?.join_code ?? makeJoinCode();

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
          if (shouldReset) await resetSupabaseEventData(supabase);
          return data as HackEvent;
        }
      } else {
        const event: HackEvent = {
          id: randomUUID(),
          name,
          join_code: makeJoinCode(),
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
    created_at: existing?.created_at ?? new Date().toISOString()
  };
  return store.event;
}

/** 参加コードの照合。イベント未設定ならコード無しで通す（ローカルデモ用）。 */
export async function verifyJoinCode(code: string | undefined): Promise<boolean> {
  const event = await getEvent();
  if (!event) return true;
  return (code ?? "").trim().toUpperCase() === event.join_code.toUpperCase();
}

/** イベント参加コードまたはチーム招待コードを検証する。 */
export async function verifyMentorInviteCode(code: string | undefined): Promise<boolean> {
  if (await verifyJoinCode(code)) return true;

  const normalized = (code ?? "").trim().toUpperCase();
  if (!normalized) return false;

  const invites = await getTeamInvites();
  return invites.some((invite) => invite.code.toUpperCase() === normalized);
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
    specialty,
    inviteCode: code
  };
}

/** 運営がチーム名だけ登録する。リポジトリは参加者があとから紐づける。 */
export async function createTeamByName(input: { name: string }): Promise<Team> {
  const name = input.name.trim();
  if (!name) throw new Error("チーム名を入力してください。");

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: existing } = await supabase
        .from("teams")
        .select("*")
        .eq("name", name)
        .maybeSingle();
      if (existing) throw new Error("同じ名前のチームがすでにあります。");

      const team: Team = {
        id: randomUUID(),
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
  if (store.teams.some((team) => team.name === name)) {
    throw new Error("同じ名前のチームがすでにあります。");
  }

  const team: Team = {
    id: randomUUID(),
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
    .map((invite) => {
      const team = teamsById.get(invite.team_id);
      return {
        ...invite,
        team_name: team?.name ?? "Unknown Team",
        github_repo: team?.github_repo ?? ""
      };
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function getTeamInvites(): Promise<TeamInviteView[]> {
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const [teamsResult, invitesResult] = await Promise.all([
        supabase.from("teams").select("*"),
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
  return inviteViews(store.teams, store.teamInvites);
}

export async function createTeamInvite(input: {
  teamName: string;
  githubRepo: string;
  invitedBy: string;
}): Promise<TeamInviteView> {
  const teamName = input.teamName.trim();
  const githubRepo = input.githubRepo.trim();
  const invitedBy = input.invitedBy.trim() || "HackRadar Admin";

  if (!teamName || !githubRepo) {
    throw new Error("Team name and GitHub repository are required.");
  }

  if (isSupabaseConfigured()) {
    const team = await findOrCreateSupabaseTeam(githubRepo, teamName);
    if (team) {
      return createTeamInviteForTeam({ teamId: team.id, invitedBy });
    }
  }

  const team = findOrCreateMemoryTeam(githubRepo, teamName);
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

      if (existingUser && role !== "admin") {
        const { data: existingMemberships, error: membershipError } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", existingUser.id);

        if (membershipError) throw membershipError;
        const belongsToAnotherTeam = (existingMemberships ?? []).some(
          (membership) => membership.team_id !== team.id
        );

        if (belongsToAnotherTeam) {
          throw new Error("このGitHubアカウントはすでに別のチームに所属しています。");
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

  if (user && role !== "admin") {
    const userId = user.id;
    const belongsToAnotherTeam = store.teamMembers.some(
      (member) => member.user_id === userId && member.team_id !== team.id
    );

    if (belongsToAnotherTeam) {
      throw new Error("このGitHubアカウントはすでに別のチームに所属しています。");
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
