import { PlazaClient } from "@/components/plaza-client";
import { Nav } from "@/components/nav";
import { getHackVerseState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PlazaPage() {
  const state = await getHackVerseState();

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="px-4 py-4">
        <PlazaClient initialState={state} />
      </div>
    </main>
  );
}
