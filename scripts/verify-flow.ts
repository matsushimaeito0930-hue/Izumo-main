/**
 * 運営から集計までの流れを、GitHubもSupabaseも使わずに通しで動かす。
 *
 *   npm run verify:flow
 *
 * lib/store.ts はSupabase未設定だとメモリ上のストアで動くので、
 * そこへGitHubと同じ形のWebhookペイロードを流し込んで結果を確かめる。
 * GitHubアカウントが1つしか無くても、複数人での動きを再現できる。
 *
 * ここで見ているのは中身の計算だけで、画面の見た目やSupabaseとの
 * やり取りは含まない。本番の確認は実際のデプロイ先で行う。
 */
import { createHmac } from "node:crypto";
import { parseGitHubWebhook, verifyGitHubSignature } from "@/lib/github";
import {
  createTeamByName,
  createTeamInviteForTeam,
  getEvent,
  getHackVerseState,
  getScoreConfig,
  joinMentorByCode,
  joinTeamWithInvite,
  recordActivity,
  saveEvent,
  saveScoreConfig,
  setTeamRepo,
  verifyJoinCode,
  verifyMentorInviteCode
} from "@/lib/store";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  OK   ${name}`);
  } else {
    fail++;
    console.log(`  NG   ${name}\n         期待: ${e}\n         実際: ${a}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const SECRET = "test-webhook-secret";

/** GitHubがやっているのと同じ手順で署名を付けて、Webhookの入口を通す。 */
async function deliver(
  eventName: string,
  payload: Record<string, unknown>,
  deliveryId: string
) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

  if (!verifyGitHubSignature({ body, signature, secret: SECRET })) {
    throw new Error("署名の検証に失敗しました");
  }

  const parsed = parseGitHubWebhook(eventName, JSON.parse(body));
  if (!parsed) return null;

  return recordActivity({ ...parsed, githubDeliveryId: deliveryId });
}

const pushPayload = (repo: string, login: string, commits: number, sha: string) => ({
  repository: { full_name: repo, name: repo.split("/")[1] },
  commits: Array.from({ length: commits }, (_, i) => ({ id: `${sha}-${i}` })),
  after: sha,
  sender: { login, avatar_url: `https://avatars.example/${login}.png` }
});

// ---------------------------------------------------------------- 運営の準備
section("[1] 運営がイベントとチームを作る");

const event = await saveEvent({ name: "テスト運用ハッカソン" });
check("イベント名", event.name, "テスト運用ハッカソン");
check("招待コードの形", /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(event.join_code), true);

const teamA = await createTeamByName({ name: "Team Alpha" });
const teamB = await createTeamByName({ name: "Team Bravo" });
const inviteA = await createTeamInviteForTeam({ teamId: teamA.id, invitedBy: "運営" });
const inviteB = await createTeamInviteForTeam({ teamId: teamB.id, invitedBy: "運営" });
check("部屋番号がチームごとに違う", inviteA.code !== inviteB.code, true);

check("正しい招待コードは通る", await verifyJoinCode(event.join_code), true);
check("違う招待コードは弾く", await verifyJoinCode("XXXX-YYYY"), false);
check("部屋番号でもメンターは入れる", await verifyMentorInviteCode(inviteA.code), true);
check("でたらめな部屋番号は弾く", await verifyMentorInviteCode("ZZZZ-0000"), false);

// ---------------------------------------------------------------- 参加者
section("[2] 参加者が部屋番号で入り、リポジトリを結ぶ");

const hanako = await joinTeamWithInvite({
  code: inviteA.code,
  githubUsername: "hanako",
  displayName: "花子",
  role: "participant"
});
check("入ったチーム", hanako.teamName, "Team Alpha");

const taro = await joinTeamWithInvite({
  code: inviteA.code,
  githubUsername: "taro",
  displayName: "太郎",
  role: "participant"
});
check("同じ部屋番号で2人目も入れる", taro.teamName, "Team Alpha");

const jiro = await joinTeamWithInvite({
  code: inviteB.code,
  githubUsername: "jiro",
  displayName: "次郎",
  role: "participant"
});
check("別チームにも入れる", jiro.teamName, "Team Bravo");

let crossTeam = "許してしまった";
try {
  await joinTeamWithInvite({
    code: inviteB.code,
    githubUsername: "hanako",
    displayName: "花子",
    role: "participant"
  });
} catch (error) {
  crossTeam = error instanceof Error ? "拒否した" : "拒否した";
}
check("同じ人が別チームに掛け持ちできない", crossTeam, "拒否した");

await setTeamRepo({ teamId: teamA.id, githubRepo: "hanako/alpha-app" });
await setTeamRepo({ teamId: teamB.id, githubRepo: "jiro/bravo-app" });

// ---------------------------------------------------------------- Webhook
section("[3] GitHubからの通知を受け取る");

const first = await deliver("push", pushPayload("hanako/alpha-app", "hanako", 3, "sha1"), "d1");
check("記録された", Boolean(first), true);
check("実行者", first?.actor_login, "hanako");
check("チーム", first?.team_name, "Team Alpha");
check("点数（push 1点 × 1回）", first?.score_delta, 1);
check("文の主語が実行者", first?.message.startsWith("hanako "), true);

const duplicate = await deliver(
  "push",
  pushPayload("hanako/alpha-app", "hanako", 3, "sha1"),
  "d1"
);
check("同じ配信は二重計上しない", duplicate?.id, first?.id);

const stranger = await deliver(
  "push",
  pushPayload("someone/unrelated-repo", "stranger", 5, "sha9"),
  "d2"
);
check("未登録リポジトリは捨てる", stranger, null);

await deliver("push", pushPayload("hanako/alpha-app", "taro", 2, "sha2"), "d3");
await deliver(
  "pull_request",
  {
    action: "opened",
    repository: { full_name: "hanako/alpha-app", name: "alpha-app" },
    pull_request: { number: 1, title: "ログイン画面", user: { login: "taro" } },
    sender: { login: "taro" }
  },
  "d4"
);
await deliver(
  "pull_request",
  {
    action: "closed",
    repository: { full_name: "hanako/alpha-app", name: "alpha-app" },
    pull_request: { number: 1, merged: true, title: "ログイン画面" },
    sender: { login: "hanako" }
  },
  "d5"
);
await deliver(
  "pull_request",
  {
    action: "closed",
    repository: { full_name: "hanako/alpha-app", name: "alpha-app" },
    pull_request: { number: 2, merged: false, title: "中断した実験" },
    sender: { login: "hanako" }
  },
  "d6"
);
await deliver("push", pushPayload("jiro/bravo-app", "jiro", 1, "sha3"), "d7");

// ---------------------------------------------------------------- 集計
section("[4] スコアとメンバー別の集計");

const state = await getHackVerseState();
const alpha = state.teams.find((team) => team.name === "Team Alpha");
const bravo = state.teams.find((team) => team.name === "Team Bravo");

// push 1 + push 1 + PR作成 10 + PRマージ 20 = 32
check("Team Alpha のスコア", alpha?.score, 32);
check("Team Alpha のコミット数", alpha?.commit_count, 5);
check("Team Bravo のスコア", bravo?.score, 1);
check("マージしていないPRは0点", state.activities.filter((a) => a.type === "pull_request_merged").length, 1);
check("順位はスコア順", state.teams[0]?.name, "Team Alpha");

const alphaContributors = state.contributors.filter((c) => c.team_id === alpha?.id);
const hanakoRow = alphaContributors.find((c) => c.github_username === "hanako");
const taroRow = alphaContributors.find((c) => c.github_username === "taro");

check("Team Alpha の貢献者は2人", alphaContributors.length, 2);
check("花子の点数（push1 + マージ20）", hanakoRow?.score, 21);
check("太郎の点数（push1 + PR作成10）", taroRow?.score, 11);
check("花子の表示名はメンバー登録から", hanakoRow?.display_name, "花子");
check("花子のコミット数", hanakoRow?.commit_count, 3);
check("太郎のコミット数", taroRow?.commit_count, 2);
check("点数の高い順に並ぶ", alphaContributors[0]?.github_username, "hanako");
check("他チームの人は混ざらない", alphaContributors.some((c) => c.github_username === "jiro"), false);

const contributorTotal = alphaContributors.reduce((sum, c) => sum + c.score, 0);
check("貢献の合計とチームのスコアが一致", contributorTotal, alpha?.score);

// ---------------------------------------------------------------- 配点変更
section("[5] 配点を変えて再計算する");

check("初期の配点は既定値", (await getScoreConfig()).push, 1);

const saved = await saveScoreConfig({
  push: 5,
  pull_request_opened: 10,
  pull_request_merged: 50,
  issue_closed: 8,
  review: 10
});
check("保存された配点", saved.config.push, 5);
check("再計算したチーム数", saved.updatedTeams, 2);

const after = await getHackVerseState();
const alphaAfter = after.teams.find((team) => team.name === "Team Alpha");
const bravoAfter = after.teams.find((team) => team.name === "Team Bravo");

// push 5 + push 5 + PR作成 10 + PRマージ 50 = 70
check("Team Alpha が新配点になった", alphaAfter?.score, 70);
check("Team Bravo も新配点になった", bravoAfter?.score, 5);
check("コミット数は変わらない", alphaAfter?.commit_count, 5);

const hanakoAfter = after.contributors.find(
  (c) => c.github_username === "hanako" && c.team_id === alphaAfter?.id
);
check("メンバー別も追随する（push5 + マージ50）", hanakoAfter?.score, 55);

const rejected = await saveScoreConfig({ push: -3, pull_request_merged: 99999 });
check("負の値は既定値に戻る", rejected.config.push, 1);
check("上限超えも既定値に戻る", rejected.config.pull_request_merged, 20);

const restored = await getHackVerseState();
check(
  "既定値に戻したらスコアも元に戻る",
  restored.teams.find((team) => team.name === "Team Alpha")?.score,
  32
);

// ---------------------------------------------------------------- 役割の兼任
section("[6] 運営が他の役割で入っても運営のまま");

const adminAsParticipant = await joinTeamWithInvite({
  code: inviteB.code,
  githubUsername: "organizer",
  displayName: "運営の人",
  role: "admin"
});
check("運営がチームに入っても運営のまま", adminAsParticipant.role, "admin");

const adminAsMentor = await joinMentorByCode({
  code: (await getEvent())!.join_code,
  displayName: "運営の人",
  specialty: "なんでも",
  githubUsername: "organizer",
  role: "admin"
});
check("運営がメンター登録しても運営のまま", adminAsMentor.role, "admin");

const plainMentor = await joinMentorByCode({
  code: (await getEvent())!.join_code,
  displayName: "先生",
  specialty: "フロントエンド",
  githubUsername: "sensei",
  role: "participant"
});
check("普通の人はメンターになる", plainMentor.role, "mentor");

// ---------------------------------------------------------------- 新規イベント
section("[7] 次のイベントを作ると持ち越さない");

const before = (await getEvent())?.join_code;
const nextEvent = await saveEvent({ name: "第2回テストハッカソン" });
check("招待コードが変わる", nextEvent.join_code !== before, true);

const cleared = await getHackVerseState();
check("チームは引き継がない", cleared.teams.length, 0);
check("活動履歴も引き継がない", cleared.activities.length, 0);
check("配点はイベントに紐づく", (await getScoreConfig()).push, 1);

console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗\n`);
process.exit(fail === 0 ? 0 : 1);
