import { chromium } from "playwright-core";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.DEMO_BASE_URL ?? "http://localhost:3010";
const demoTeamName = `Team Aurora ${Date.now().toString().slice(-4)}`;
const outputDir = path.join(root, ".tmp", "video", "interactive-recording");
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  colorScheme: "light",
  recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } }
});
const page = await context.newPage();
page.setDefaultTimeout(12000);

await page.addInitScript(() => {
  const install = () => {
    if (document.querySelector("[data-demo-cursor]")) return;
    const cursor = document.createElement("div");
    cursor.dataset.demoCursor = "true";
    cursor.style.cssText = [
      "position:fixed",
      "z-index:99999",
      "width:18px",
      "height:18px",
      "border:2px solid #c05575",
      "border-radius:50%",
      "background:rgba(255,255,255,.75)",
      "box-shadow:0 2px 8px rgba(35,32,28,.2)",
      "pointer-events:none",
      "transform:translate(-50%,-50%)",
      "opacity:0",
      "transition:opacity 120ms ease"
    ].join(";");
    document.body.append(cursor);
    document.addEventListener("mousemove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
      cursor.style.opacity = "1";
    });
    document.addEventListener("mousedown", () => {
      cursor.animate(
        [
          { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
          { transform: "translate(-50%,-50%) scale(1.8)", opacity: 0 }
        ],
        { duration: 360, easing: "ease-out" }
      );
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickText(pattern) {
  const target = page.getByText(pattern).last();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Could not locate clickable text: ${pattern}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await pause(260);
  await page.mouse.down();
  await pause(80);
  await page.mouse.up();
  await pause(700);
}

async function clickRole(role, pattern) {
  const target = page.getByRole(role, { name: pattern }).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Could not locate ${role}: ${pattern}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await pause(260);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await pause(700);
}

await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
await pause(8000);

await clickRole("button", /運営の方/);
console.log("after admin open", await page.locator("input").count(), await page.locator("button").allTextContents());
const inputs = page.locator("input");
await inputs.nth(2).fill(demoTeamName);
await inputs.nth(3).fill("hackradar/demo-repository");
await pause(700);
await clickRole("button", /招待コード/);
await pause(1100);
await inputs.nth(1).fill("Demo Participant");
await clickRole("button", /チームに参加/);
await pause(1800);
if (!page.url().endsWith("/dashboard")) {
  await page.evaluate(async (teamName) => {
    await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamName, githubRepo: "hackradar/demo-repository" })
    });
    const response = await fetch("/api/teams/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamName, displayName: "Demo Participant" })
    });
    const payload = await response.json();
    if (payload.session) {
      window.localStorage.setItem("hackverse-session", JSON.stringify(payload.session));
    }
  }, demoTeamName);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
}
await pause(1800);

const demoButton = page.getByRole("button", { name: /デモ/ }).first();
await demoButton.scrollIntoViewIfNeeded();
const demoBox = await demoButton.boundingBox();
await page.mouse.move(demoBox.x + demoBox.width / 2, demoBox.y + demoBox.height / 2, { steps: 10 });
await pause(450);
await page.mouse.click(demoBox.x + demoBox.width / 2, demoBox.y + demoBox.height / 2);
await pause(700);

for (let index = 0; index < 3; index += 1) {
  const commitButton = page.getByRole("button", { name: /\+1/ }).first();
  const box = await commitButton.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await pause(250);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await pause(850);
}

await clickRole("link", /質問する/);
await page.getByRole("button", { name: /質問を投稿/ }).waitFor({ state: "visible" });
await pause(1200);
const title = page.locator("input").nth(0);
const body = page.locator("textarea").first();
await title.fill("GitHubの進捗を画面で確認したい");
await body.fill("コミットした内容をチーム全員で確認できるようにしたいです。");
await pause(700);
await clickRole("button", /質問を投稿/);
await pause(1400);

const chatInput = page.locator("input").nth(1);
await chatInput.scrollIntoViewIfNeeded();
await chatInput.fill("Webhookの反映を確認しました");
await pause(700);
await clickRole("button", /送信/);
await pause(1800);
await pause(7000);

await context.close();
await browser.close();
const videos = (await readdir(outputDir)).filter((file) => file.endsWith(".webm"));
if (videos.length === 0) throw new Error("No recorded video was created.");
console.log(path.join(outputDir, videos[0]));
