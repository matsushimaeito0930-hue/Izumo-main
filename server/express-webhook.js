const crypto = require("node:crypto");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const SCORE_BY_ACTIVITY = {
  push: 5,
  pull_request_opened: 10,
  pull_request_merged: 20,
  issue_closed: 8,
  review: 10
};

function getHouseLevel(score) {
  if (score >= 600) return 4;
  if (score >= 300) return 3;
  if (score >= 100) return 2;
  return 1;
}

function verifyGitHubSignature({ body, signature, secret }) {
  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function repoInfo(repository) {
  const githubRepo = repository?.full_name ?? "unknown/repository";
  const fallbackTeamName =
    repository?.name
      ?.split("-")
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ") ?? githubRepo;

  return { githubRepo, fallbackTeamName };
}

function parseGitHubWebhook(eventName, payload) {
  if (eventName === "push") {
    const commitCount = payload.commits?.length ?? 0;
    if (commitCount <= 0) return null;

    return {
      type: "push",
      ...repoInfo(payload.repository),
      metadata: { commitCount }
    };
  }

  if (eventName === "pull_request") {
    const info = repoInfo(payload.repository);

    if (payload.action === "opened") {
      return {
        type: "pull_request_opened",
        ...info,
        metadata: { number: payload.pull_request?.number ?? payload.number }
      };
    }

    if (payload.action === "closed" && payload.pull_request?.merged) {
      return {
        type: "pull_request_merged",
        ...info,
        metadata: { number: payload.pull_request?.number ?? payload.number }
      };
    }
  }

  if (eventName === "issues" && payload.action === "closed") {
    return {
      type: "issue_closed",
      ...repoInfo(payload.repository),
      metadata: { number: payload.issue?.number }
    };
  }

  if (eventName === "pull_request_review" && payload.action === "submitted") {
    return {
      type: "review",
      ...repoInfo(payload.repository),
      metadata: { number: payload.pull_request?.number }
    };
  }

  return null;
}

function makeActivityMessage(teamName, type, metadata) {
  if (type === "push") {
    const count = typeof metadata.commitCount === "number" ? metadata.commitCount : 1;
    return `${teamName} が ${count} 件のコミットをプッシュしました`;
  }

  if (type === "pull_request_opened") {
    return `${teamName} が PR #${metadata.number ?? "?"} を作成しました`;
  }

  if (type === "pull_request_merged") {
    return `${teamName} が PR #${metadata.number ?? "?"} をマージしました`;
  }

  if (type === "issue_closed") {
    return `${teamName} が Issue #${metadata.number ?? "?"} をクローズしました`;
  }

  return `${teamName} がプルリクエストをレビューしました`;
}

function createSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the Express webhook server."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

async function findOrCreateTeam(supabase, githubRepo, fallbackTeamName) {
  const { data: existingTeam, error: selectError } = await supabase
    .from("teams")
    .select("*")
    .eq("github_repo", githubRepo)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existingTeam) return existingTeam;

  const newTeam = {
    name: fallbackTeamName,
    github_repo: githubRepo,
    score: 0,
    commit_count: 0,
    house_level: 1
  };

  const { data, error } = await supabase
    .from("teams")
    .insert(newTeam)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function recordActivity(supabase, parsed) {
  const team = await findOrCreateTeam(
    supabase,
    parsed.githubRepo,
    parsed.fallbackTeamName
  );
  const scoreDelta = SCORE_BY_ACTIVITY[parsed.type];
  const commitDelta =
    parsed.type === "push" && typeof parsed.metadata.commitCount === "number"
      ? parsed.metadata.commitCount
      : 0;
  const nextScore = team.score + scoreDelta;
  const nextCommitCount = (team.commit_count ?? 0) + commitDelta;
  const nextHouseLevel = getHouseLevel(nextScore);
  const message = makeActivityMessage(team.name, parsed.type, parsed.metadata);
  const activity = {
    team_id: team.id,
    type: parsed.type,
    message,
    score_delta: scoreDelta,
    metadata: parsed.metadata
  };

  const { error: updateError } = await supabase
    .from("teams")
    .update({
      score: nextScore,
      commit_count: nextCommitCount,
      house_level: nextHouseLevel
    })
    .eq("id", team.id);

  if (updateError) throw updateError;

  const { data, error: insertError } = await supabase
    .from("activities")
    .insert(activity)
    .select("*")
    .single();

  if (insertError) throw insertError;

  return {
    ...data,
    team_name: team.name,
    team_score: nextScore,
    team_commit_count: nextCommitCount,
    team_house_level: nextHouseLevel
  };
}

function createApp() {
  const app = express();

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "hackverse-express-webhook" });
  });

  app.post(
    "/api/github/webhook",
    express.raw({ type: "application/json", limit: "2mb" }),
    async (request, response) => {
      try {
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!secret) {
          response.status(500).json({ error: "GITHUB_WEBHOOK_SECRET is not configured." });
          return;
        }

        const rawBody = request.body.toString("utf8");
        const signature = request.header("x-hub-signature-256") ?? null;
        const isValid = verifyGitHubSignature({ body: rawBody, signature, secret });

        if (!isValid) {
          response.status(401).json({ error: "Invalid signature." });
          return;
        }

        const eventName = request.header("x-github-event") ?? "";
        const payload = JSON.parse(rawBody);
        const parsed = parseGitHubWebhook(eventName, payload);

        if (!parsed) {
          response.json({ ok: true, ignored: true, eventName });
          return;
        }

        const supabase = createSupabase();
        const activity = await recordActivity(supabase, parsed);

        response.json({ ok: true, eventName, activity });
      } catch (error) {
        console.error(error);
        response.status(500).json({
          error: error instanceof Error ? error.message : "Webhook failed."
        });
      }
    }
  );

  return app;
}

if (require.main === module) {
  const port = Number(process.env.EXPRESS_PORT ?? 4000);
  createApp().listen(port, () => {
    console.log(`HackVerse Express webhook server listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createApp,
  parseGitHubWebhook,
  verifyGitHubSignature
};
