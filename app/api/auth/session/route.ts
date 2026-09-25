import { NextResponse } from "next/server";
import { getAuthStatus } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const { isConfigured, identity } = await getAuthStatus();

  return NextResponse.json({
    isConfigured,
    user: identity
      ? {
          login: identity.login,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
          role: identity.role
        }
      : null
  });
}
