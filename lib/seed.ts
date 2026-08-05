import type {
  Activity,
  ChatMessage,
  HelpPost,
  HelpReply,
  Team,
  TeamInvite,
  TeamMember,
  User
} from "@/lib/types";

const now = new Date();
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60 * 1000).toISOString();

export const seedUsers: User[] = [];

export const seedTeams: Team[] = [];

export const seedActivities: Activity[] = [];

export const seedHelpPosts: HelpPost[] = [];

export const seedHelpReplies: HelpReply[] = [];

export const seedChatMessages: ChatMessage[] = [];

export const seedTeamMembers: TeamMember[] = [];

export const seedTeamInvites: TeamInvite[] = [];
