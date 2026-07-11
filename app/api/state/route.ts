import { NextResponse } from "next/server";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getHackVerseState();
  return NextResponse.json(state);
}
