import { NextResponse } from "next/server";
import { getHackVerseState } from "@/lib/store";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("debug") === "storage") {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ configured: false });
    }

    const [activitiesResult, teamResult, allActivitiesResult, allTeamsResult, compactActivitiesResult] = await Promise.all([
      supabase.from("activities").select("id", { count: "exact", head: true }),
      supabase
        .from("teams")
        .select("id,name,github_repo,commit_count,score")
        .eq("github_repo", "matsushimaeito0930-hue/Izumo-main")
        .maybeSingle(),
      supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("teams").select("*"),
      supabase
        .from("activities")
        .select("id,team_id,type,message,score_delta,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(30)
    ]);

    return NextResponse.json({
      configured: true,
      activityCount: activitiesResult.count ?? 0,
      activityError: activitiesResult.error?.message ?? null,
      team: teamResult.data,
      teamError: teamResult.error?.message ?? null,
      allActivitiesCount: allActivitiesResult.data?.length ?? 0,
      allActivitiesError: allActivitiesResult.error?.message ?? null,
      allTeamsCount: allTeamsResult.data?.length ?? 0,
      allTeamsError: allTeamsResult.error?.message ?? null,
      compactActivitiesCount: compactActivitiesResult.data?.length ?? 0,
      compactActivitiesError: compactActivitiesResult.error?.message ?? null
    });
  }

  const state = await getHackVerseState();
  return NextResponse.json(state);
}
