import { Nav } from "@/components/nav";
import { getAuthStatus } from "@/lib/session";

export function Shell({ children }: { children: React.ReactNode }) {
  const { isConfigured, identity } = getAuthStatus();

  return (
    <main className="min-h-screen bg-paper">
      <Nav
        authConfigured={isConfigured}
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
