import pptxgen from "pptxgenjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pptx = new pptxgen();
pptx.defineLayout({ name: "HACKRADAR", width: 13.333, height: 7.5 });
pptx.layout = "HACKRADAR";
pptx.author = "HackRadar";
pptx.company = "HackRadar";
pptx.subject = "HackRadar app overview";
pptx.title = "HackRadar | 開発の現在地を見える化するダッシュボード";
pptx.lang = "ja-JP";
pptx.theme = { headFontFace: "Aptos Display", bodyFontFace: "Yu Gothic", lang: "ja-JP" };
pptx.writeOptions = { compression: true };

const W = 13.333;
const H = 7.5;
const C = {
  bg: "F8FAFC",
  paper: "FFFFFF",
  panel: "F1F5F8",
  panelStrong: "E8F1F3",
  ink: "10202D",
  muted: "5A6A78",
  dim: "8A99A5",
  line: "D7E1E7",
  cyan: "16B8B4",
  coral: "F06455",
  yellow: "D8A620",
  violet: "8064D6",
  navy: "213A4D",
};
const FONT = "Yu Gothic";
const DISPLAY = "Aptos Display";

function text(slide, value, x, y, w, h, opts = {}) {
  slide.addText(value, {
    x, y, w, h,
    fontFace: opts.fontFace ?? FONT,
    fontSize: opts.fontSize ?? 16,
    color: opts.color ?? C.ink,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    margin: opts.margin ?? 0,
    breakLine: false,
    fit: "shrink",
    valign: opts.valign ?? "mid",
    align: opts.align ?? "left",
    paraSpaceAfterPt: opts.paraSpaceAfterPt,
    charSpacing: opts.charSpacing,
    transparency: opts.transparency,
  });
}

function rect(slide, x, y, w, h, fill, lineColor = fill, radius = false, transparency = 0) {
  slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
    x, y, w, h,
    rectRadius: radius ? 0.08 : undefined,
    fill: { color: fill, transparency },
    line: { color: lineColor, transparency: lineColor === fill ? 100 : 0, width: lineColor === fill ? 0 : 1 },
  });
}

function line(slide, x, y, w, h, color = C.line, width = 1, arrow = false, dash = "solid") {
  slide.addShape(pptx.ShapeType.line, {
    x, y, w, h,
    line: { color, width, dash, endArrowType: arrow ? "triangle" : "none" },
  });
}

function circle(slide, x, y, d, fill, lineColor = fill, transparency = 0) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x, y, w: d, h: d,
    fill: { color: fill, transparency },
    line: { color: lineColor, transparency: lineColor === fill ? 100 : 0, width: lineColor === fill ? 0 : 1 },
  });
}

function rule(slide, y, x = 0.65, w = 12.0, color = C.line, width = 1) {
  line(slide, x, y, w, 0, color, width);
}

function addNotes(slide, sources) {
  slide.addNotes(`[Sources]\n- ${sources.join("\n- ")}\n[/Sources]`);
}

function header(slide, number, section) {
  slide.background = { color: C.bg };
  for (let i = 0; i < 12; i += 1) line(slide, 0.65 + i * 1.0, 0.65, 0, 6.2, C.line, 0.25);
  for (let i = 0; i < 7; i += 1) line(slide, 0.65, 0.65 + i * 1.0, 12.0, 0, C.line, 0.25);
  text(slide, "HACKRADAR", 0.65, 0.26, 1.7, 0.22, { fontFace: DISPLAY, fontSize: 10, bold: true, color: C.cyan, charSpacing: 1.4 });
  text(slide, section.toUpperCase(), 9.7, 0.26, 2.95, 0.22, { fontFace: DISPLAY, fontSize: 9, bold: true, color: C.dim, align: "right", charSpacing: 1.0 });
  rule(slide, 6.98, 0.65, 12.0, C.line, 0.8);
  text(slide, String(number).padStart(2, "0"), 0.65, 7.08, 0.34, 0.18, { fontFace: DISPLAY, fontSize: 9, color: C.dim, bold: true });
  text(slide, "Team development dashboard", 9.7, 7.08, 2.95, 0.18, { fontFace: DISPLAY, fontSize: 9, color: C.dim, align: "right" });
}

function sectionTitle(slide, kicker, headline, sub = "") {
  text(slide, kicker.toUpperCase(), 0.65, 0.98, 3.0, 0.24, { fontFace: DISPLAY, fontSize: 11, bold: true, color: C.coral, charSpacing: 1.1 });
  text(slide, headline, 0.65, 1.28, 11.5, 0.76, { fontFace: DISPLAY, fontSize: 31, bold: true, color: C.ink });
  if (sub) text(slide, sub, 0.67, 2.08, 11.0, 0.35, { fontSize: 16, color: C.muted });
}

function metric(slide, value, label, x, y, color) {
  text(slide, value, x, y, 1.25, 0.42, { fontFace: DISPLAY, fontSize: 25, bold: true, color });
  text(slide, label, x, y + 0.46, 1.75, 0.25, { fontSize: 11, color: C.muted });
}

function card(slide, x, y, w, h, fill = C.paper) {
  rect(slide, x, y, w, h, fill, C.line, true);
}

// 1. What is HackRadar?
{
  const slide = pptx.addSlide();
  slide.background = { color: C.bg };
  for (let i = 0; i < 12; i += 1) line(slide, 0.65 + i * 1.0, 0.65, 0, 6.2, C.line, 0.25);
  for (let i = 0; i < 7; i += 1) line(slide, 0.65, 0.65 + i * 1.0, 12.0, 0, C.line, 0.25);
  text(slide, "TEAM DEVELOPMENT DASHBOARD", 0.78, 0.72, 4.8, 0.25, { fontFace: DISPLAY, fontSize: 11, bold: true, color: C.cyan, charSpacing: 1.0 });
  text(slide, "HackRadar", 0.75, 1.42, 6.5, 0.74, { fontFace: DISPLAY, fontSize: 50, bold: true, color: C.ink });
  text(slide, "チームの開発状況を、\nGitHubの活動から見える化する", 0.79, 2.35, 6.3, 1.08, { fontSize: 28, bold: true, color: C.ink, valign: "top" });
  text(slide, "誰が、どれくらい進んでいるか。\nその現在地をひとつの画面で把握するダッシュボードです。", 0.81, 3.72, 5.9, 0.62, { fontSize: 16, color: C.muted, valign: "top" });
  text(slide, "GITHUB  /  WEBHOOK  /  SUPABASE  /  DASHBOARD", 0.81, 5.62, 6.5, 0.26, { fontFace: DISPLAY, fontSize: 10, color: C.dim, charSpacing: 0.45 });
  rule(slide, 6.98, 0.65, 12.0, C.line, 0.8);
  text(slide, "01", 0.65, 7.08, 0.34, 0.18, { fontFace: DISPLAY, fontSize: 9, color: C.dim, bold: true });
  text(slide, "Team development dashboard", 9.7, 7.08, 2.95, 0.18, { fontFace: DISPLAY, fontSize: 9, color: C.dim, align: "right" });

  // Editable dashboard preview.
  card(slide, 8.05, 1.22, 4.3, 4.85, C.paper);
  text(slide, "TEAM MOMENTUM", 8.35, 1.55, 2.2, 0.2, { fontFace: DISPLAY, fontSize: 10, bold: true, color: C.cyan, charSpacing: 0.8 });
  text(slide, "チームの現在地", 8.35, 1.86, 2.8, 0.28, { fontSize: 19, bold: true, color: C.ink });
  const previewBars = [["A", 0.82, C.coral], ["B", 0.63, C.cyan], ["C", 0.46, C.violet]];
  previewBars.forEach(([label, value, color], i) => {
    const y = 2.55 + i * 0.62;
    circle(slide, 8.36, y - 0.02, 0.26, color);
    text(slide, label, 8.36, y + 0.04, 0.26, 0.11, { fontFace: DISPLAY, fontSize: 8, bold: true, color: C.paper, align: "center" });
    rect(slide, 8.82, y, 2.65, 0.2, C.panel);
    rect(slide, 8.82, y, 2.65 * value, 0.2, color);
  });
  rule(slide, 4.62, 8.35, 3.7, C.line, 1);
  text(slide, "RECENT ACTIVITY", 8.35, 4.9, 2.1, 0.18, { fontFace: DISPLAY, fontSize: 10, bold: true, color: C.coral, charSpacing: 0.7 });
  [["NOW", "Team A が push", C.coral], ["2m", "Team B が更新", C.cyan]].forEach(([time, label, color], i) => {
    const y = 5.28 + i * 0.36;
    circle(slide, 8.38, y + 0.02, 0.1, color);
    text(slide, time, 8.62, y, 0.42, 0.16, { fontFace: DISPLAY, fontSize: 9, bold: true, color });
    text(slide, label, 9.24, y, 2.4, 0.16, { fontSize: 11, color: C.muted });
  });
  addNotes(slide, ["Product implementation in the HackRadar repository.", "Production GitHub webhook flow verified on 2026-08-04."]);
}

// 2. Problem
{
  const slide = pptx.addSlide();
  header(slide, 2, "the problem");
  sectionTitle(slide, "01 / 課題", "ハッカソンのチーム開発は、進み具合が見えにくい", "作業が個人の中に閉じると、チーム全体の判断が遅れてしまいます。");
  text(slide, "開発している本人には見えていても、\nチームには見えていない。", 0.68, 3.03, 5.25, 0.82, { fontSize: 23, bold: true, color: C.ink, valign: "top" });
  const issues = [
    ["01", "進捗がわからない", "誰が何を進めているのか、毎回聞かないとわからない", C.coral],
    ["02", "止まりに気づけない", "困っているチームに声をかけるタイミングを逃してしまう", C.yellow],
    ["03", "判断材料が少ない", "感覚や自己申告だけでは、優先順位を決めにくい", C.cyan],
  ];
  issues.forEach(([num, head, body, accent], i) => {
    const y = 2.86 + i * 1.13;
    line(slide, 6.25, y + 0.12, 0.36, 0, accent, 3);
    text(slide, num, 6.82, y, 0.42, 0.2, { fontFace: DISPLAY, fontSize: 11, color: accent, bold: true });
    text(slide, head, 7.38, y - 0.02, 3.4, 0.28, { fontSize: 18, bold: true, color: C.ink });
    text(slide, body, 7.38, y + 0.34, 4.65, 0.28, { fontSize: 13, color: C.muted });
  });
  text(slide, "見えない進捗は、チームの次の行動を遅らせる。", 6.25, 6.25, 5.7, 0.3, { fontSize: 14, color: C.coral, bold: true });
  addNotes(slide, ["Problem framing based on the HackRadar product brief and project feedback."]);
}

// 3. What it does
{
  const slide = pptx.addSlide();
  header(slide, 3, "how it works");
  sectionTitle(slide, "02 / 仕組み", "GitHubの活動を、チームの現在地に変える", "開発者はいつものGitHubを使うだけ。HackRadarが活動を受け取り、画面に反映します。");
  line(slide, 2.74, 3.52, 0.82, 0, C.cyan, 1.8, true);
  line(slide, 5.43, 3.52, 0.82, 0, C.cyan, 1.8, true);
  line(slide, 8.12, 3.52, 0.82, 0, C.cyan, 1.8, true);
  const nodes = [
    ["01", "GitHub", "いつものpush", C.coral],
    ["02", "Webhook", "活動を受け取る", C.cyan],
    ["03", "Supabase", "活動を保存する", C.violet],
    ["04", "Dashboard", "チームで見る", C.yellow],
  ];
  nodes.forEach(([num, head, body, accent], i) => {
    const x = 0.78 + i * 2.69;
    card(slide, x, 2.62, 1.94, 1.8, C.paper);
    circle(slide, x + 0.2, 2.86, 0.42, accent);
    text(slide, num, x + 0.2, 2.96, 0.42, 0.13, { fontFace: DISPLAY, fontSize: 9, bold: true, color: C.paper, align: "center" });
    text(slide, head, x + 0.2, 3.53, 1.54, 0.28, { fontSize: 19, bold: true, color: C.ink });
    text(slide, body, x + 0.2, 3.93, 1.55, 0.22, { fontSize: 11, color: C.muted });
  });
  text(slide, "入力を増やさず、チームの共通認識を増やす。", 0.8, 5.25, 5.8, 0.36, { fontSize: 23, bold: true, color: C.ink });
  metric(slide, "1", "push = 1 activity", 7.18, 5.12, C.cyan);
  metric(slide, "5", "score / commit", 9.02, 5.12, C.coral);
  metric(slide, "∞", "チームを一覧", 10.87, 5.12, C.yellow);
  addNotes(slide, ["Architecture implemented in app/api/github/webhook, lib/github.ts, lib/store.ts, and Supabase schema.", "GitHub webhook signature and production delivery were verified on 2026-08-04."]);
}

// 4. Dashboard
{
  const slide = pptx.addSlide();
  header(slide, 4, "the dashboard");
  sectionTitle(slide, "03 / 画面", "チームの現在地を、数字とタイムラインで見る", "比較するためではなく、次に声をかける相手と、次に進めることを見つけるための画面です。");
  text(slide, "TEAM MOMENTUM", 0.78, 2.68, 2.0, 0.22, { fontFace: DISPLAY, fontSize: 11, color: C.cyan, bold: true, charSpacing: 0.8 });
  const bars = [["Team A", 14, C.coral], ["Team B", 11, C.cyan], ["Team C", 8, C.violet], ["Team D", 5, C.yellow]];
  bars.forEach(([name, value, color], i) => {
    const y = 3.16 + i * 0.57;
    text(slide, name, 0.78, y - 0.02, 1.0, 0.2, { fontSize: 13, color: C.muted });
    rect(slide, 1.95, y, 3.6, 0.22, C.panel);
    rect(slide, 1.95, y, 3.6 * (value / 14), 0.22, color);
    text(slide, String(value), 5.72, y - 0.03, 0.38, 0.22, { fontFace: DISPLAY, fontSize: 13, color: C.ink, bold: true, align: "right" });
  });
  text(slide, "commit count / 表示イメージ", 0.78, 5.65, 2.5, 0.2, { fontSize: 10, color: C.dim });
  line(slide, 6.45, 2.72, 0, 3.1, C.line, 1);
  text(slide, "ACTIVITY STREAM", 7.0, 2.68, 2.2, 0.22, { fontFace: DISPLAY, fontSize: 11, color: C.coral, bold: true, charSpacing: 0.8 });
  const events = [["NOW", "Team A が1件のcommitをpush", C.coral], ["2m", "Team C がPRを更新", C.cyan], ["7m", "Team B がレビューを完了", C.violet]];
  events.forEach(([time, body, color], i) => {
    const y = 3.22 + i * 0.8;
    circle(slide, 7.02, y + 0.02, 0.16, color);
    if (i < events.length - 1) line(slide, 7.1, y + 0.2, 0, 0.58, C.line, 1);
    text(slide, time, 7.42, y - 0.01, 0.45, 0.2, { fontFace: DISPLAY, fontSize: 11, color, bold: true });
    text(slide, body, 8.08, y - 0.04, 4.1, 0.28, { fontSize: 14, color: C.ink });
  });
  card(slide, 7.0, 5.83, 5.18, 0.56, C.panel);
  text(slide, "変化が見えたら、チームチャットやメンターへつなげる。", 7.25, 5.98, 4.7, 0.22, { fontSize: 13, color: C.ink, bold: true });
  addNotes(slide, ["Dashboard UI and API state from the HackRadar implementation.", "Bar values are illustrative display values, not a public benchmark."]);
}

// 5. Usage
{
  const slide = pptx.addSlide();
  header(slide, 5, "the experience");
  sectionTitle(slide, "04 / 使い方", "使い方は、ログインして開発するだけ", "HackRadarのために新しい運用を覚える必要はありません。GitHubの活動が、そのままチームの情報になります。");
  const steps = [
    ["01", "チームを選ぶ", "チーム名を入力して、\nGitHubでログイン", C.coral],
    ["02", "いつも通り開発", "コードを書いて、\nいつも通りpush", C.cyan],
    ["03", "チームで確認", "Dashboard・チャットで\n次のアクションを決める", C.yellow],
  ];
  steps.forEach(([num, head, body, accent], i) => {
    const x = 0.78 + i * 2.53;
    circle(slide, x, 2.96, 0.54, accent);
    text(slide, num, x, 3.11, 0.54, 0.14, { fontFace: DISPLAY, fontSize: 10, bold: true, color: C.paper, align: "center" });
    text(slide, head, x, 3.78, 1.95, 0.3, { fontSize: 21, bold: true, color: C.ink });
    text(slide, body, x, 4.26, 2.1, 0.55, { fontSize: 15, color: C.muted, valign: "top" });
    if (i < steps.length - 1) line(slide, x + 0.72, 3.23, 1.48, 0, C.line, 1.5, true);
  });
  card(slide, 8.65, 2.68, 3.52, 2.96, C.paper);
  text(slide, "CONNECTED", 8.95, 2.98, 1.65, 0.2, { fontFace: DISPLAY, fontSize: 10, color: C.coral, bold: true, charSpacing: 0.8 });
  text(slide, "Team A", 8.95, 3.54, 1.5, 0.32, { fontFace: DISPLAY, fontSize: 25, bold: true, color: C.ink });
  text(slide, "+5", 10.92, 3.48, 0.78, 0.42, { fontFace: DISPLAY, fontSize: 28, bold: true, color: C.coral, align: "right" });
  rule(slide, 4.12, 8.95, 2.92, C.line, 1);
  text(slide, "1 commit", 8.95, 4.42, 1.3, 0.22, { fontSize: 14, color: C.muted });
  text(slide, "just now", 10.65, 4.42, 1.2, 0.22, { fontFace: DISPLAY, fontSize: 12, color: C.cyan, align: "right" });
  text(slide, "commitが、チームの\n活動として反映される", 8.95, 5.0, 2.85, 0.5, { fontSize: 17, bold: true, color: C.ink, valign: "top" });
  text(slide, "チームチャット / メンターチャット", 0.8, 6.22, 6.9, 0.26, { fontSize: 14, color: C.cyan, bold: true });
  addNotes(slide, ["GitHub OAuth onboarding and production webhook-to-dashboard flow verified in the deployed MVP.", "Team chat and mentor chat are part of the current product direction."]);
}

// 6. Value
{
  const slide = pptx.addSlide();
  header(slide, 6, "the value");
  sectionTitle(slide, "05 / 価値", "見えない進捗を、チームの行動につなげる", "HackRadarは、開発の現在地を共有し、必要な声かけや相談を早くするためのMVPです。");
  const outcomes = [
    ["気づける", "チームの現在地を\n同じ画面で把握する", C.cyan],
    ["動ける", "止まりかけたチームへ\n早く声をかける", C.coral],
    ["相談できる", "チャットやメンターへ\n自然につながる", C.yellow],
  ];
  outcomes.forEach(([head, body, accent], i) => {
    const x = 0.8 + i * 3.96;
    line(slide, x, 3.02, 2.96, 0, accent, 3);
    text(slide, head, x, 3.28, 2.8, 0.36, { fontSize: 25, bold: true, color: C.ink });
    text(slide, body, x, 3.86, 2.95, 0.64, { fontSize: 17, color: C.muted, valign: "top" });
  });
  text(slide, "NEXT", 0.8, 5.43, 0.85, 0.22, { fontFace: DISPLAY, fontSize: 11, bold: true, color: C.violet, charSpacing: 1.0 });
  text(slide, "リアルタイム在席 / PR・Issueの可視化 / メンター相談の強化", 1.78, 5.39, 8.8, 0.28, { fontSize: 15, color: C.ink });
  text(slide, "開発の現在地を、チームの共通画面に。", 0.8, 6.24, 9.6, 0.3, { fontSize: 20, bold: true, color: C.cyan });
  text(slide, "HackRadar", 10.0, 5.86, 2.15, 0.5, { fontFace: DISPLAY, fontSize: 25, bold: true, color: C.ink, align: "right" });
  addNotes(slide, ["Conclusion based on the implemented MVP scope and verified production workflow.", "Future items are product directions, not completed features."]);
}

const outDir = fileURLToPath(new URL("./", import.meta.url));
await fs.mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, "HackRadar_app_overview_white.pptx");
await pptx.writeFile({ fileName: outFile });
console.log(`Wrote ${outFile}`);
