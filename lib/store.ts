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
  HackVerseState,
  HelpPost,
  HelpPostView,
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
  mentors: Mentor[];
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
    helpPosts: structuredClone(seedHelpPosts),
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
