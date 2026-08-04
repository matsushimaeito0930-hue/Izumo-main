import type {
  Activity,
  ChatMessage,
  HelpPost,
  HelpReply,
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
    id: "mentor-frontend",
    github_username: "frontend-mentor",
    display_name: "フロントエンドメンター",
    avatar_url: null,
    role: "mentor",
    created_at: minutesAgo(140)
  },
  {
    id: "mentor-backend",
    github_username: "backend-mentor",
    display_name: "バックエンドメンター",
    avatar_url: null,
    role: "mentor",
    created_at: minutesAgo(130)
  }
];

export const seedTeams: Team[] = [];

export const seedActivities: Activity[] = [];

export const seedHelpPosts: HelpPost[] = [];

export const seedHelpReplies: HelpReply[] = [];

export const seedMentors: Mentor[] = [
  {
    id: "mentor-row-frontend",
    user_id: "mentor-frontend",
    specialty: "Next.js / React",
    availability: "available"
  },
  {
    id: "mentor-row-backend",
    user_id: "mentor-backend",
    specialty: "Express / Supabase",
    availability: "busy"
  }
];

export const seedChatMessages: ChatMessage[] = [];

export const seedTeamMembers: TeamMember[] = [];

export const seedTeamInvites: TeamInvite[] = [];
