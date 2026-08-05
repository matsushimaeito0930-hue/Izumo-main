import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--no-sandbox"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:3010/help", { waitUntil: "networkidle" });
const buttons = page.getByRole("button");
console.log("buttons", await buttons.count(), await buttons.allTextContents());
console.log("inputs", await page.locator("input").count(), await page.locator("input").evaluateAll((items) => items.map((item) => item.getAttribute("placeholder"))));
console.log("textareas", await page.locator("textarea").count(), await page.locator("textarea").evaluateAll((items) => items.map((item) => item.getAttribute("placeholder"))));
await page.screenshot({ path: ".tmp/video/inspect-onboarding.png" });
await browser.close();
