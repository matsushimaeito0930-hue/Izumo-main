import { randomUUID } from "node:crypto";
import {
  ACTIVITY_ICONS,
  ACTIVITY_LABELS,
  SCORE_BY_ACTIVITY
} from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { getHouseLevel } from "@/lib/house";
import {
  seedActivities,
  seedHelpPosts,
  seedMentors,
  seedTeams,
  seedUsers
} from "@/lib/seed";
import { createServerSupabaseClient } from "@/lib/supabase";
import type {
  Activity,
  ActivityType,
  ActivityView,
  HackVerseState,
  HelpPost,
  HelpPostView,
  HelpStatus,
  Mentor,
  MentorProfile,
  Team,
  User
} from "@/lib/types";

type MemoryStore = {
  users: User[];
  teams: Team[];
  activities: Activity[];
  helpPosts: HelpPost[];
  mentors: Mentor[];
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
    helpPosts: structuredClone(seedHelpPosts),
    mentors: structuredClone(seedMentors)
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
  mentors: Mentor[]
): HackVerseState {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const usersById = new Map(users.map((user) => [user.id, user]));

  const activityViews: ActivityView[] = activities
    .map((activity) => ({
      ...activity,
      team_name: teamsById.get(activity.team_id)?.name ?? "Unknown Team"
    }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const helpPostViews: HelpPostView[] = helpPosts
    .map((post) => ({
      ...post,
      author_name: usersById.get(post.user_id)?.display_name ?? "Anonymous",
      team_name: teamsById.get(post.team_id)?.name ?? "Unknown Team"
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
      store.mentors
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
      store.mentors
    );
  }

  const [usersResult, teamsResult, activitiesResult, helpPostsResult, mentorsResult] =
    await Promise.all([
      supabase.from("users").select("*"),
      supabase.from("teams").select("*"),
      supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("help_posts").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("mentors").select("*")
    ]);

  if (teamsResult.error || activitiesResult.error) {
    const store = getMemoryStore();
    return withViews(
      store.users,
      store.teams,
      store.activities,
      store.helpPosts,
      store.mentors
    );
  }

  return withViews(
    (usersResult.data ?? seedUsers) as User[],
    ((teamsResult.data ?? seedTeams) as Team[]).map(normalizeTeam),
    (activitiesResult.data ?? seedActivities) as Activity[],
    (helpPostsResult.data ?? seedHelpPosts) as HelpPost[],
    (mentorsResult.data ?? seedMentors) as Mentor[]
  );
}

function makeActivityMessage(
  teamName: string,
  type: ActivityType,
  metadata: Record<string, unknown>
): string {
  const icon = ACTIVITY_ICONS[type];

  if (type === "push") {
    const commitCount =
      typeof metadata.commitCount === "number" ? metadata.commitCount : 1;
    return `${icon} ${teamName} pushed ${commitCount} commit${
      commitCount === 1 ? "" : "s"
    }`;
  }

  if (
    (type === "pull_request_opened" || type === "pull_request_merged") &&
    typeof metadata.number === "number"
  ) {
    const verb = type === "pull_request_opened" ? "opened PR" : "merged PR";
    return `${icon} ${teamName} ${verb} #${metadata.number}`;
  }

  if (type === "issue_closed" && typeof metadata.number === "number") {
    return `${icon} ${teamName} closed Issue #${metadata.number}`;
  }

  return `${icon} ${teamName} ${ACTIVITY_LABELS[type]}`;
}

async function findOrCreateSupabaseTeam(githubRepo: string, fallbackName: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data: existingTeam } = await supabase
    .from("teams")
    .select("*")
    .eq("github_repo", githubRepo)
    .maybeSingle();

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

  const { data } = await supabase.from("teams").insert(newTeam).select("*").single();
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

      await supabase
        .from("teams")
        .update({
          score: nextScore,
          commit_count: nextCommitCount,
          house_level: nextLevel
        })
        .eq("id", team.id);
      await supabase.from("activities").insert(activity);

      return {
        ...activity,
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

export async function createHelpPost(input: {
  teamId: string;
  title: string;
  body: string;
  category: string;
  status?: HelpStatus;
}): Promise<HelpPostView> {
  const status = input.status ?? "open";

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const [{ data: user }, { data: team }] = await Promise.all([
        supabase.from("users").select("*").eq("role", "participant").limit(1).single(),
        supabase.from("teams").select("*").eq("id", input.teamId).single()
      ]);

      const fallbackUser = user as User | null;
      const selectedTeam = team as Team | null;

      if (!selectedTeam) {
        throw new Error("Selected team was not found.");
      }

      const post: HelpPost = {
        id: randomUUID(),
        user_id: fallbackUser?.id ?? "unknown-user",
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
        author_name: fallbackUser?.display_name ?? "Participant",
        team_name: selectedTeam.name
      };
    }
  }

  const store = getMemoryStore();
  const team = store.teams.find((candidate) => candidate.id === input.teamId) ?? store.teams[0];
  const user =
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
    team_name: team.name
  };
}
