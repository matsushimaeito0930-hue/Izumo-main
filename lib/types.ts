export type ActivityType =
  | "push"
  | "pull_request_opened"
  | "pull_request_merged"
  | "issue_closed"
  | "review";

export type HelpStatus = "open" | "helping" | "solved";

/** 相談チャットは「チーム ↔ 運営」の1本だけ。 */
export type ChatChannel = "staff";

/**
 * 参加者・メンター・運営・審査員で、ダッシュボード上の権限と表示を分ける。
 * 審査員は閲覧専用で、開発状況とお知らせだけを見る。
 */
export type UserRole = "participant" | "mentor" | "admin" | "judge";

export type User = {
  id: string;
  github_username: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  specialty?: string | null;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  /** 参加者があとから紐づけるため、未設定（null）を許す。 */
  github_repo: string | null;
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

/** ハッカソン1回分。参加コードはこのイベント全体で共通。 */
export type HackEvent = {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
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

export type ChatMessage = {
  id: string;
  channel: ChatChannel;
  team_id: string | null;
  author_name: string;
  author_role: UserRole;
  body: string;
  created_at: string;
};

/** 掲示板の回答。参加している人なら誰でも投稿できる。 */
export type HelpReply = {
  id: string;
  help_post_id: string;
  author_name: string;
  author_github: string | null;
  author_role: UserRole;
  body: string;
  is_accepted: boolean;
  created_at: string;
};

export type HelpPostView = HelpPost & {
  author_name: string;
  author_github: string | null;
  team_name: string;
  replies: HelpReply[];
};

/** チームに誰が入っているか。同じ部屋番号で複数人が参加するため一覧で見せる。 */
export type TeamMemberView = {
  team_id: string;
  github_username: string;
  display_name: string;
  avatar_url: string | null;
};

export type ActivityView = Activity & {
  team_name: string;
};

export type HackVerseState = {
  teams: Team[];
  activities: ActivityView[];
  helpPosts: HelpPostView[];
  members: TeamMemberView[];
  messages: ChatMessage[];
  updatedAt: string;
};

export type TeamInviteView = TeamInvite & {
  team_name: string;
  github_repo: string | null;
};

export type DemoEventInput = {
  teamId?: string;
  type: ActivityType;
};
