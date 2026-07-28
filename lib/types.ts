export type ActivityType =
  | "push"
  | "pull_request_opened"
  | "pull_request_merged"
  | "issue_closed"
  | "review";

export type HelpStatus = "open" | "helping" | "solved";
export type MentorAvailability = "available" | "busy" | "offline";

export type UserRole = "participant" | "mentor" | "admin";

export type User = {
  id: string;
  github_username: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  github_repo: string;
  score: number;
  commit_count: number;
  house_level: number;
  created_at: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
};

export type TeamInvite = {
  id: string;
  code: string;
  team_id: string;
  invited_by: string;
  created_at: string;
};

export type AppSession = {
  role: UserRole;
  displayName: string;
  githubUsername?: string;
  teamId?: string;
  teamName?: string;
  inviteCode?: string;
  specialty?: string;
};

export type Activity = {
  id: string;
  team_id: string;
  type: ActivityType;
  message: string;
  score_delta: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type HelpPost = {
  id: string;
  user_id: string;
  team_id: string;
  title: string;
  body: string;
  category: string;
  status: HelpStatus;
  created_at: string;
};

export type Mentor = {
  id: string;
  user_id: string;
  specialty: string;
  availability: MentorAvailability;
};

export type MentorProfile = Mentor & {
  display_name: string;
  github_username: string;
};

export type HelpPostView = HelpPost & {
  author_name: string;
  team_name: string;
};

export type ActivityView = Activity & {
  team_name: string;
};

export type HackVerseState = {
  teams: Team[];
  activities: ActivityView[];
  helpPosts: HelpPostView[];
  mentors: MentorProfile[];
  updatedAt: string;
};

export type TeamInviteView = TeamInvite & {
  team_name: string;
  github_repo: string;
};

export type DemoEventInput = {
  teamId?: string;
  type: ActivityType;
};
