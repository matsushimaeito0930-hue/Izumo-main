import { getHouseLevel } from "@/lib/house";
import type {
  Activity,
  HelpPost,
  Mentor,
  Team,
  TeamInvite,
  TeamMember,
  User
} from "@/lib/types";

const now = new Date();
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60 * 1000).toISOString();

export const seedUsers: User[] = [
  {
    id: "user-a",
    github_username: "team-a-lead",
    display_name: "Aoi",
    avatar_url: null,
    role: "participant",
    created_at: minutesAgo(160)
  },
  {
    id: "user-b",
    github_username: "team-b-dev",
    display_name: "Ren",
    avatar_url: null,
    role: "participant",
    created_at: minutesAgo(150)
  },
  {
    id: "mentor-js",
    github_username: "js-mentor",
    display_name: "JavaScript Mentor",
    avatar_url: null,
    role: "mentor",
    created_at: minutesAgo(140)
  },
  {
    id: "mentor-ui",
    github_username: "ui-mentor",
    display_name: "UI/UX Mentor",
    avatar_url: null,
    role: "mentor",
    created_at: minutesAgo(130)
  }
];

export const seedTeams: Team[] = [
  {
    id: "team-a",
    name: "Team A",
    github_repo: "matsushimaeito0930-hue/Izumo-main",
    score: 95,
    commit_count: 3,
    house_level: getHouseLevel(95),
    created_at: minutesAgo(120)
  },
  {
    id: "team-b",
    name: "Team B",
    github_repo: "example/team-b",
    score: 220,
    commit_count: 12,
    house_level: getHouseLevel(220),
    created_at: minutesAgo(110)
  },
  {
    id: "team-c",
    name: "Team C",
    github_repo: "example/team-c",
    score: 365,
    commit_count: 18,
    house_level: getHouseLevel(365),
    created_at: minutesAgo(100)
  },
  {
    id: "team-d",
    name: "Team D",
    github_repo: "example/team-d",
    score: 54,
    commit_count: 4,
    house_level: getHouseLevel(54),
    created_at: minutesAgo(90)
  }
];

export const seedActivities: Activity[] = [
  {
    id: "activity-1",
    team_id: "team-c",
    type: "pull_request_merged",
    message: "🎉 Team C merged PR #12",
    score_delta: 20,
    metadata: { number: 12 },
    created_at: minutesAgo(4)
  },
  {
    id: "activity-2",
    team_id: "team-b",
    type: "pull_request_opened",
    message: "🚀 Team B opened PR #7",
    score_delta: 10,
    metadata: { number: 7 },
    created_at: minutesAgo(9)
  },
  {
    id: "activity-3",
    team_id: "team-a",
    type: "push",
    message: "🔥 Team A pushed 3 commits",
    score_delta: 5,
    metadata: { commitCount: 3 },
    created_at: minutesAgo(14)
  },
  {
    id: "activity-4",
    team_id: "team-d",
    type: "issue_closed",
    message: "✅ Team D closed Issue #4",
    score_delta: 8,
    metadata: { number: 4 },
    created_at: minutesAgo(20)
  }
];

export const seedHelpPosts: HelpPost[] = [
  {
    id: "help-1",
    user_id: "user-a",
    team_id: "team-a",
    title: "Firebase auth callback is stuck",
    body: "The OAuth redirect returns, but the session never appears in the client.",
    category: "Backend",
    status: "open",
    created_at: minutesAgo(26)
  },
  {
    id: "help-2",
    user_id: "user-b",
    team_id: "team-b",
    title: "Need a fast UI review",
    body: "We have the flow working and want a mentor to check if the first screen makes sense.",
    category: "UI/UX",
    status: "helping",
    created_at: minutesAgo(35)
  }
];

export const seedMentors: Mentor[] = [
  {
    id: "mentor-row-js",
    user_id: "mentor-js",
    specialty: "JavaScript / Realtime",
    availability: "available"
  },
  {
    id: "mentor-row-ui",
    user_id: "mentor-ui",
    specialty: "UI/UX / Pitch polish",
    availability: "busy"
  }
];

export const seedTeamMembers: TeamMember[] = [
  {
    id: "member-a",
    team_id: "team-a",
    user_id: "user-a"
  },
  {
    id: "member-b",
    team_id: "team-b",
    user_id: "user-b"
  }
];

export const seedTeamInvites: TeamInvite[] = [
  {
    id: "invite-team-a",
    code: "TEAM-A",
    team_id: "team-a",
    invited_by: "HackVerse Admin",
    created_at: minutesAgo(70)
  },
  {
    id: "invite-team-b",
    code: "TEAM-B",
    team_id: "team-b",
    invited_by: "HackVerse Admin",
    created_at: minutesAgo(65)
  }
];
