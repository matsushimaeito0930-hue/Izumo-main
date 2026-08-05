import { Nav } from "@/components/nav";
import { getAuthStatus } from "@/lib/session";
import { getEvent } from "@/lib/store";

export async function Shell({ children }: { children: React.ReactNode }) {
  const { isConfigured, identity } = getAuthStatus();

  // 参加コードは運営にしか渡さない。参加者のHTMLには一切含めない。
  const joinCode =
    identity?.role === "admin" ? ((await getEvent())?.join_code ?? null) : null;

  return (
    <main className="min-h-screen bg-paper">
      <Nav
        authConfigured={isConfigured}
        joinCode={joinCode}
        viewer={
          identity
            ? {
                login: identity.login,
                displayName: identity.displayName,
                avatarUrl: identity.avatarUrl,
                role: identity.role
              }
            : null
        }
      />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
    </main>
  );
}
