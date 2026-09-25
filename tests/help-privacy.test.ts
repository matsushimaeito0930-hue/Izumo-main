import { describe, expect, it } from "vitest";
import { createEvent, createHelpPost, createTeamByName, getHackVerseState } from "@/lib/store";

describe("help board privacy", () => {
  it("never exposes an anonymous author's GitHub login or internal user id", async () => {
    const event = await createEvent({
      name: "Anonymous help event",
      ownerGithubUsername: "privacy-admin"
    });
    const team = await createTeamByName({ name: "Privacy team", eventId: event.id });
    const created = await createHelpPost({
      teamId: team.id,
      title: " Secret question ",
      body: " Please keep my identity private. ",
      category: "その他",
      authorName: "Hidden Author",
      authorGithub: "hidden-author",
      anonymous: true
    });

    expect(created.author_name).toBe("匿名");
    expect(created.author_github).toBeNull();
    expect("user_id" in created).toBe(false);

    const publicState = await getHackVerseState(event.id, {
      githubUsername: "someone-else",
      role: "participant"
    });
    const publicPost = publicState.helpPosts.find((post) => post.id === created.id);
    expect(publicPost).toMatchObject({
      author_name: "匿名",
      author_github: null,
      can_accept: false,
      title: "Secret question",
      body: "Please keep my identity private."
    });
    expect(publicPost && "user_id" in publicPost).toBe(false);

    const authorState = await getHackVerseState(event.id, {
      githubUsername: "HIDDEN-AUTHOR",
      role: "participant"
    });
    expect(authorState.helpPosts.find((post) => post.id === created.id)?.can_accept).toBe(true);

    const adminState = await getHackVerseState(event.id, {
      githubUsername: "privacy-admin",
      role: "admin"
    });
    expect(adminState.helpPosts.find((post) => post.id === created.id)?.can_accept).toBe(true);
  });
});
