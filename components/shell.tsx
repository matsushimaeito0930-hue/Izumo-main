import { Nav } from "@/components/nav";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto max-w-7xl px-5 py-6">{children}</div>
    </main>
  );
}
