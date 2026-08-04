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
    id: "mentor-js",
    github_username: "js-mentor",
    display_name: "JavaScript メンター",
    avatar_url: null,
    role: "mentor",
    created_at: minutesAgo(140)
  },
  {
    id: "mentor-ui",
    github_username: "ui-mentor",
    display_name: "UI/UX メンター",
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
    id: "mentor-row-js",
    user_id: "mentor-js",
    specialty: "JavaScript / リアルタイム通信",
    availability: "available"
  },
  {
    id: "mentor-row-ui",
    user_id: "mentor-ui",
    specialty: "UI/UX / 発表資料",
    availability: "busy"
  }
];

export const seedChatMessages: ChatMessage[] = [];

export const seedTeamMembers: TeamMember[] = [];

export const seedTeamInvites: TeamInvite[] = [];
