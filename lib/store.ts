import { randomUUID } from "node:crypto";
import { ACTIVITY_LABELS, SCORE_BY_ACTIVITY } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { getHouseLevel } from "@/lib/house";
import {
  seedActivities,
  seedChatMessages,
  seedHelpPosts,
  seedHelpReplies,
  seedMentors,
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
  HelpReply,
  HelpStatus,
  Mentor,
  MentorProfile,
  Team,
  TeamInvite,
  TeamInviteView,
  TeamMember,
  User
} from "@/lib/types";

type MemoryStore = {
  users: User[];
  teams: Team[];
  activities: Activity[];
  helpPosts: HelpPost[];
  helpReplies: HelpReply[];
  mentors: Mentor[];
  messages: ChatMessage[];
  teamMembers: TeamMember[];
  teamInvites: TeamInvite[];
};

function normalizeTeam(team: Team): Team {
  return {
    ...team,
    commit_count: team.commit_count ?? 0
  };
}

declare global {
  var hackVerseMemoryStore: MemoryStore | undefined;
}

function cloneStore(): MemoryStore {
  return {
    users: structuredClone(seedUsers),
    teams: structuredClone(seedTeams),
    activities: structuredClone(seedActivities),
    messages: structuredClone(seedChatMessages),
    helpPosts: structuredClone(seedHelpPosts),
    helpReplies: structuredClone(seedHelpReplies),
    mentors: structuredClone(seedMentors),
    teamMembers: structuredClone(seedTeamMembers),
    teamInvites: structuredClone(seedTeamInvites)
  };
}

function getMemoryStore(): MemoryStore {
  globalThis.hackVerseMemoryStore ??= cloneStore();
  return globalThis.hackVerseMemoryStore;
}

function withViews(
  users: User[],
  teams: Team[],
  activities: Activity[],
  helpPosts: HelpPost[],
  helpReplies: HelpReply[],
  mentors: Mentor[],
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

  const mentorProfiles: MentorProfile[] = mentors.map((mentor) => {
    const user = usersById.get(mentor.user_id);
    return {
      ...mentor,
      display_name: user?.display_name ?? "Mentor",
      github_username: user?.github_username ?? "mentor"
    };
  });

  return {
    teams: teams.map(normalizeTeam).sort((a, b) => b.score - a.score),
    activities: activityViews,
    helpPosts: helpPostViews,
    mentors: mentorProfiles,
    messages: messages
      .slice()
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    updatedAt: new Date().toISOString()
  };
}

export async function getHackVerseState(): Promise<HackVerseState> {
  if (!isSupabaseConfigured()) {
    const store = getMemoryStore();
    return withViews(
      store.users,
      store.teams,
      store.activities,
      store.helpPosts,
      store.helpReplies,
      store.mentors,
      store.messages
    );
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    const store = getMemoryStore();
    return withViews(
      store.users,
      store.teams,
      store.activities,
      store.helpPosts,
      store.helpReplies,
      store.mentors,
      store.messages
    );
  }

  const [
    usersResult,
    teamsResult,
    activitiesResult,
    helpPostsResult,
    helpRepliesResult,
    mentorsResult,
    messagesResult
  ] =
    await Promise.all([
      supabase.from("users").select("*"),
      supabase.from("teams").select("*"),
      supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("help_posts").select("*").order("created_at", { ascending: false }).limit(30),
      supabase
        .from("help_replies")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200),
      supabase.from("mentors").select("*"),
      supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(80)
    ]);

  if (teamsResult.error || activitiesResult.error) {
    const store = getMemoryStore();
    return withViews(
      store.users,
      store.teams,
      store.activities,
      store.helpPosts,
      store.helpReplies,
      store.mentors,
      store.messages
    );
  }

  return withViews(
    (usersResult.data ?? seedUsers) as User[],
    ((teamsResult.data ?? seedTeams) as Team[]).map(normalizeTeam),
    (activitiesResult.data ?? seedActivities) as Activity[],
    (helpPostsResult.data ?? seedHelpPosts) as HelpPost[],
    (helpRepliesResult.error
      ? getMemoryStore().helpReplies
      : (helpRepliesResult.data ?? seedHelpReplies)) as HelpReply[],
    (mentorsResult.data ?? seedMentors) as Mentor[],
    (messagesResult.error
      ? getMemoryStore().messages
      : (messagesResult.data ?? seedChatMessages)) as ChatMessage[]
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
  metadata?: Record<string, unknown>;
}): Promise<ActivityView> {
  const metadata = input.metadata ?? {};
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
        team = await findOrCreateSupabaseTeam(
          input.githubRepo,
          input.fallbackTeamName ?? input.githubRepo
        );
      }

      if (!team) {
        const { data } = await supabase.from("teams").select("*").limit(1).single();
        team = data as Team | null;
      }

      if (!team) {
        throw new Error("No team is available for this activity.");
      }

      team = normalizeTeam(team);
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
      ? findOrCreateMemoryTeam(
          input.githubRepo,
          input.fallbackTeamName ?? input.githubRepo
        )
      : store.teams[0]);

  if (!team) {
    team = findOrCreateMemoryTeam("demo/team-a", "Team A");
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
  const authorName = input.authorName.trim() || "HackVerse user";

  if (!body || body.length > 500) {
    throw new Error("メッセージは1〜500文字で入力してください。");
  }

  // メンター相談もチームごとのスレッドにするため、どちらのチャンネルでもチームが要る。
  if (!input.teamId) {
    throw new Error("チームを選択してください。");
  }

  const message: ChatMessage = {
    id: randomUUID(),
    channel: input.channel,
    team_id: input.teamId,
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
 * 採用できるのは質問者本人・メンター・運営のみ。
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
  const invitedBy = input.invitedBy.trim() || "HackVerse Admin";

  if (!teamName || !githubRepo) {
    throw new Error("Team name and GitHub repository are required.");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const team = normalizeTeam(
        (await findOrCreateSupabaseTeam(githubRepo, teamName)) as Team
      );
      const invite: Omit<TeamInvite, "id" | "created_at"> = {
        code: makeInviteCode(teamName),
        team_id: team.id,
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
        team_name: team.name,
        github_repo: team.github_repo
      };
    }
  }

  const store = getMemoryStore();
  const team = findOrCreateMemoryTeam(githubRepo, teamName);
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

export async function joinTeamWithInvite(input: {
  code: string;
  displayName: string;
  githubUsername?: string;
}): Promise<AppSession> {
  const code = input.code.trim().toUpperCase();
  const displayName = input.displayName.trim();
  const githubUsername =
    input.githubUsername?.trim() || `guest-${randomUUID().slice(0, 8)}`;

  if (!code || !displayName) {
    throw new Error("Invite code and display name are required.");
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
      if (!invite) throw new Error("Invite code was not found.");

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", invite.team_id)
        .single();

      if (teamError) throw teamError;

      const { data: user, error: userError } = await supabase
        .from("users")
        .upsert(
          {
            github_username: githubUsername,
            display_name: displayName,
            role: "participant"
          },
          { onConflict: "github_username" }
        )
        .select("*")
        .single();

      if (userError) throw userError;

      await supabase.from("team_members").upsert(
        {
          team_id: invite.team_id,
          user_id: user.id
        },
        { onConflict: "team_id,user_id" }
      );

      return {
        role: "participant",
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
    throw new Error("Invite code was not found.");
  }

  const team = store.teams.find((candidate) => candidate.id === invite.team_id);
  if (!team) {
    throw new Error("Invited team was not found.");
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
      role: "participant",
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
    role: "participant",
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
      if (!team) throw new Error("Team name was not found.");

      const { data: user, error: userError } = await supabase
        .from("users")
        .upsert(
          {
            github_username: githubUsername,
            display_name: displayName,
            role: "participant"
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
        role: "participant",
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
    throw new Error("Team name was not found.");
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
      role: "participant",
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
    role: "participant",
    displayName,
    githubUsername,
    teamId: team.id,
    teamName: team.name
  };
}

export async function createMentorSession(input: {
  displayName: string;
  githubUsername?: string;
  specialty: string;
}): Promise<AppSession> {
  const displayName = input.displayName.trim();
  const specialty = input.specialty.trim();
  const githubUsername =
    input.githubUsername?.trim() || `mentor-${randomUUID().slice(0, 8)}`;

  if (!displayName || !specialty) {
    throw new Error("Display name and specialty are required.");
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .upsert(
          {
            github_username: githubUsername,
            display_name: displayName,
            role: "mentor"
          },
          { onConflict: "github_username" }
        )
        .select("*")
        .single();

      if (userError) throw userError;

      await supabase.from("mentors").upsert(
        {
          user_id: user.id,
          specialty,
          availability: "available"
        },
        { onConflict: "user_id" }
      );
    }
  } else {
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
        role: "mentor",
        created_at: new Date().toISOString()
      };
      store.users.push(user);
    }

    const existingMentor = store.mentors.find(
      (mentor) => mentor.user_id === user.id
    );
    if (existingMentor) {
      existingMentor.specialty = specialty;
      existingMentor.availability = "available";
    } else {
      store.mentors.push({
        id: randomUUID(),
        user_id: user.id,
        specialty,
        availability: "available"
      });
    }
  }

  return {
    role: "mentor",
    displayName,
    githubUsername,
    specialty
  };
}
