const pptxgen = require('pptxgenjs');
const path = require('path');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'HackRadar';
pptx.subject = 'HackRadar 3-minute product pitch';
pptx.title = 'HackRadar';
pptx.company = 'HackRadar';
pptx.lang = 'ja-JP';
pptx.theme = {
  headFontFace: 'Aptos Display',
  bodyFontFace: 'Aptos',
  lang: 'ja-JP',
};
pptx.defineLayout({ name: 'CUSTOM_WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'CUSTOM_WIDE';

const W = 13.333;
const H = 7.5;
const C = {
  ink: '16202A',
  muted: '66717D',
  line: 'DDE3E8',
  pale: 'F5F8FA',
  white: 'FFFFFF',
  teal: '147D78',
  tealLight: 'DDF3F0',
  coral: 'EF806E',
  coralLight: 'FCE7E3',
  gold: 'E9B64B',
};
const logo = path.resolve(__dirname, '../../HackRadar_logo.svg');

function text(slide, value, x, y, w, h, opts = {}) {
  slide.addText(value, {
    x, y, w, h,
    margin: 0,
    fontFace: opts.fontFace || 'Aptos',
    fontSize: opts.fontSize || 18,
    color: opts.color || C.ink,
    bold: !!opts.bold,
    breakLine: false,
    fit: 'shrink',
    valign: opts.valign || 'mid',
    align: opts.align || 'left',
    paraSpaceAfterPt: opts.paraSpaceAfterPt || 0,
    italic: !!opts.italic,
    bullet: opts.bullet,
  });
}

function rect(slide, x, y, w, h, fill, line = fill, radius = false) {
  slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: line, width: line === fill ? 0 : 1 },
    radius,
  });
}

function line(slide, x1, y1, x2, y2, color = C.line, width = 1.2, dash = 'solid') {
  slide.addShape(pptx.ShapeType.line, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color, width, dashType: dash, beginArrowType: 'none', endArrowType: 'none' },
  });
}

function circle(slide, x, y, d, fill, lineColor = fill) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x, y, w: d, h: d,
    fill: { color: fill },
    line: { color: lineColor, width: lineColor === fill ? 0 : 1 },
  });
}

function header(slide, kicker, title, number) {
  text(slide, kicker.toUpperCase(), 0.72, 0.42, 4.8, 0.25, { fontSize: 11, bold: true, color: C.teal });
  text(slide, title, 0.72, 0.78, 11.2, 0.62, { fontSize: 31, bold: true, color: C.ink });
  line(slide, 0.72, 1.58, 12.62, 1.58, C.line, 1);
  text(slide, String(number).padStart(2, '0'), 12.08, 0.48, 0.54, 0.24, { fontSize: 11, bold: true, color: C.muted, align: 'right' });
}

function footer(slide, label = 'HackRadar') {
  line(slide, 0.72, 7.12, 12.62, 7.12, C.line, 0.8);
  text(slide, label, 0.72, 7.2, 2.1, 0.18, { fontSize: 9, bold: true, color: C.muted });
}

function numberCircle(slide, n, x, y, fill = C.ink) {
  circle(slide, x, y, 0.42, fill);
  text(slide, String(n), x, y + 0.01, 0.42, 0.34, { fontSize: 14, bold: true, color: C.white, align: 'center' });
}

function addBar(slide, label, value, max, x, y, w, color, note) {
  text(slide, label, x, y, 1.75, 0.22, { fontSize: 14, bold: true });
  rect(slide, x + 1.85, y + 0.04, w, 0.18, C.line);
  rect(slide, x + 1.85, y + 0.04, Math.max(0.12, w * value / max), 0.18, color);
  text(slide, String(value), x + 1.85 + w + 0.16, y - 0.02, 0.45, 0.28, { fontSize: 15, bold: true, color });
  if (note) text(slide, note, x + 1.85, y + 0.29, w + 0.5, 0.18, { fontSize: 10, color: C.muted });
}

// 1. Opening
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  s.addImage({ path: logo, x: 0.78, y: 0.54, w: 1.5, h: 0.48 });
  text(s, 'みなさんは、ハッカソン中に\n「他のチームはどこまで進んでいるんだろう」\nと思った経験はありませんか？', 0.78, 1.72, 7.2, 2.1, { fontSize: 29, bold: true, color: C.ink, valign: 'top' });
  text(s, '見えない進捗を、見える前進へ。', 0.82, 4.42, 5.4, 0.48, { fontSize: 22, bold: true, color: C.teal });
  text(s, 'ハッカソン開発のための進捗ダッシュボード', 0.82, 5.04, 5.7, 0.3, { fontSize: 16, color: C.muted });
  circle(s, 9.45, 1.34, 2.55, C.pale, C.line);
  circle(s, 9.84, 1.73, 1.77, C.white, C.teal);
  circle(s, 10.37, 2.26, 0.71, C.teal);
  line(s, 10.72, 2.61, 12.15, 1.46, C.coral, 3);
  line(s, 10.72, 2.61, 11.84, 3.73, C.teal, 1.6);
  text(s, '</>', 10.35, 2.38, 0.76, 0.24, { fontSize: 14, bold: true, color: C.white, align: 'center' });
  text(s, 'HackRadar', 9.3, 4.4, 2.9, 0.34, { fontSize: 21, bold: true, align: 'center' });
  text(s, '3分で、使い方と価値を紹介します', 8.9, 4.86, 3.7, 0.26, { fontSize: 13, color: C.muted, align: 'center' });
  footer(s, 'HackRadar | 3-minute pitch');
}

// 2. Problem
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  header(s, '01 / 課題', 'ハッカソン中、進捗は見えにくい。', 2);
  text(s, '開発している本人にはわかる。でも、チーム全体では見えない。', 0.72, 1.92, 8.4, 0.34, { fontSize: 19, color: C.muted });
  circle(s, 0.92, 2.72, 2.0, C.coralLight, C.coral);
  text(s, '?', 0.92, 2.85, 2.0, 1.3, { fontSize: 65, bold: true, color: C.coral, align: 'center' });
  text(s, 'いま、どこまで\n進んでいる？', 1.13, 4.92, 1.58, 0.72, { fontSize: 17, bold: true, align: 'center' });
  const items = [
    ['進捗が個人の感覚に頼る', '誰がどこまで作ったのか、毎回聞かないとわからない'],
    ['比較する材料がない', '遅れているのか、順調なのか判断しにくい'],
    ['相談が分散する', '開発の状況と相談の履歴が別々の場所に残る'],
  ];
  items.forEach((item, i) => {
    const y = 2.45 + i * 1.15;
    line(s, 4.05, y + 0.37, 4.58, y + 0.37, C.coral, 2);
    text(s, item[0], 4.82, y, 3.7, 0.3, { fontSize: 21, bold: true });
    text(s, item[1], 4.82, y + 0.39, 6.6, 0.3, { fontSize: 15, color: C.muted });
  });
  footer(s);
}

// 3. Idea
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  header(s, '02 / 発想', 'だから、開発の流れにそのまま入る。', 3);
  text(s, '新しい作業を増やすのではなく、すでにあるGitHubの動きを使います。', 0.72, 1.92, 10.4, 0.3, { fontSize: 18, color: C.muted });
  const steps = [
    ['01', '登録', 'チーム名と\nリポジトリを登録'],
    ['02', 'プッシュ', 'いつも通り\nGitHubへpush'],
    ['03', '可視化', '進捗とスコアを\n自動で更新'],
    ['04', '相談', '必要なときに\nチーム・メンターへ'],
  ];
  steps.forEach((st, i) => {
    const x = 0.88 + i * 3.08;
    numberCircle(s, i + 1, x, 3.05, i === 1 ? C.coral : C.teal);
    text(s, st[0], x + 0.58, 3.05, 0.4, 0.25, { fontSize: 11, bold: true, color: C.muted });
    text(s, st[1], x, 3.78, 2.15, 0.34, { fontSize: 22, bold: true });
    text(s, st[2], x, 4.34, 2.35, 0.7, { fontSize: 16, color: C.muted, valign: 'top' });
    if (i < 3) {
      line(s, x + 2.28, 3.27, x + 2.83, 3.27, C.line, 2);
      s.addShape(pptx.ShapeType.chevron, { x: x + 2.74, y: 3.12, w: 0.24, h: 0.3, fill: { color: C.line }, line: { color: C.line, width: 0 } });
    }
  });
  text(s, 'HackRadarは「開発の途中で使う」ためのアプリです。', 0.88, 6.06, 7.5, 0.36, { fontSize: 21, bold: true, color: C.teal });
  footer(s);
}

// 4. Webhook mechanism
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  header(s, '03 / 仕組み', 'GitHubのプッシュが、チームの動きになる。', 4);
  text(s, 'コミットを手入力する必要はありません。Webhookが変化を受け取ります。', 0.72, 1.92, 10.4, 0.3, { fontSize: 18, color: C.muted });
  // connectors first
  line(s, 3.35, 3.25, 4.55, 3.25, C.line, 2);
  line(s, 7.12, 3.25, 8.3, 3.25, C.line, 2);
  line(s, 10.85, 3.25, 11.75, 3.25, C.line, 2);
  [4.45, 8.2, 11.65].forEach((x) => s.addShape(pptx.ShapeType.chevron, { x, y: 3.09, w: 0.25, h: 0.3, fill: { color: C.line }, line: { color: C.line, width: 0 } }));
  const nodes = [
    [0.86, 'GitHub', 'push', C.ink, 'feat: add chat'],
    [4.55, 'Webhook', '受信', C.coral, '署名を検証'],
    [8.3, 'Supabase', '記録', C.teal, '活動・スコア'],
    [11.1, '画面', '更新', C.ink, 'グラフに反映'],
  ];
  nodes.forEach(([x, title, sub, color, note]) => {
    circle(s, x, 2.55, 0.9, color);
    text(s, title, x - 0.15, 3.78, 1.5, 0.28, { fontSize: 19, bold: true, align: 'center' });
    text(s, sub, x - 0.15, 4.18, 1.5, 0.24, { fontSize: 13, bold: true, color });
    text(s, note, x - 0.55, 4.65, 2.3, 0.3, { fontSize: 13, color: C.muted, align: 'center' });
  });
  text(s, '「pushした」=「チームの進捗が更新された」', 0.92, 5.93, 8.2, 0.38, { fontSize: 23, bold: true, color: C.teal });
  footer(s);
}

// 5. Dashboard
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  header(s, '04 / ダッシュボード', '見るべきものが、数字とグラフで揃う。', 5);
  text(s, 'チーム名は参加者が自由に決められます。サンプルの3チームを比較します。', 0.72, 1.92, 10.5, 0.3, { fontSize: 18, color: C.muted });
  text(s, 'コミット数', 1.0, 2.72, 2.0, 0.3, { fontSize: 20, bold: true });
  text(s, '直近の活動を一目で比較', 8.75, 2.72, 3.0, 0.26, { fontSize: 14, color: C.muted, align: 'right' });
  addBar(s, 'Orbit', 14, 16, 1.0, 3.32, 5.1, C.teal, 'いちばん動いている');
  addBar(s, 'Loop', 10, 16, 1.0, 4.35, 5.1, C.coral, '少し停滞している');
  addBar(s, 'Nova', 7, 16, 1.0, 5.38, 5.1, C.gold, 'これから伸びる');
  line(s, 7.2, 2.65, 7.2, 6.1, C.line, 1);
  text(s, '数字があると、声をかける理由が生まれる。', 7.82, 3.35, 4.15, 0.72, { fontSize: 24, bold: true, valign: 'top' });
  text(s, '「Loop、今日は詰まってる？」\n「Orbitの進め方を聞いてみよう」', 7.82, 4.48, 4.35, 0.75, { fontSize: 18, color: C.muted, valign: 'top' });
  rect(s, 7.82, 5.72, 4.25, 0.56, C.tealLight, C.teal, true);
  text(s, '進捗を、次のコミュニケーションへ', 8.03, 5.85, 3.85, 0.24, { fontSize: 15, bold: true, color: C.teal, align: 'center' });
  footer(s);
}

// 6. Chat
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  header(s, '05 / コミュニケーション', '開発しながら、相談まで進められる。', 6);
  text(s, '状況を見て終わりではなく、そのままチームチャットやメンター相談につなげます。', 0.72, 1.92, 11.0, 0.3, { fontSize: 18, color: C.muted });
  text(s, 'チームチャット', 0.92, 2.72, 2.8, 0.3, { fontSize: 20, bold: true });
  rect(s, 0.92, 3.22, 5.25, 2.72, C.pale, C.line, true);
  rect(s, 1.25, 3.66, 3.68, 0.66, C.white, C.line, true);
  text(s, 'ログインまわり、ここまでできました！', 1.48, 3.85, 3.15, 0.23, { fontSize: 14 });
  rect(s, 2.05, 4.63, 3.78, 0.66, C.tealLight, C.teal, true);
  text(s, 'じゃあ次は、READMEを整えよう', 2.28, 4.82, 3.28, 0.23, { fontSize: 14, bold: true, color: C.teal });
  text(s, '進捗の数字を見ながら、次の作業を決める', 1.25, 5.46, 4.55, 0.22, { fontSize: 13, color: C.muted, align: 'center' });
  text(s, 'メンター相談', 7.0, 2.72, 2.8, 0.3, { fontSize: 20, bold: true });
  line(s, 6.62, 3.14, 6.62, 5.93, C.line, 1);
  text(s, '相談', 7.0, 3.47, 0.85, 0.2, { fontSize: 12, bold: true, color: C.coral });
  text(s, '「初めての認証実装で、\n次に何を確認すればいいですか？」', 7.0, 3.82, 4.65, 0.7, { fontSize: 19, bold: true, valign: 'top' });
  text(s, '回答', 7.0, 4.92, 0.85, 0.2, { fontSize: 12, bold: true, color: C.teal });
  text(s, '「まずはコールバックURLと、\n失敗時の表示を確認しましょう」', 7.0, 5.27, 4.65, 0.7, { fontSize: 18, color: C.muted, valign: 'top' });
  footer(s);
}

// 7. Development journey
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  header(s, '06 / 使い方', 'HackRadarは、開発の途中で使うアプリです。', 7);
  text(s, '完成したものを眺めるデモではなく、作っている最中の判断を助けます。', 0.72, 1.92, 10.9, 0.3, { fontSize: 18, color: C.muted });
  line(s, 1.1, 4.15, 12.08, 4.15, C.ink, 2.2);
  const stages = [
    ['開始', 'チームをつくる', C.ink],
    ['実装', 'pushが増える', C.teal],
    ['比較', '停滞に気づく', C.coral],
    ['相談', '次の手を決める', C.gold],
    ['前進', 'またpushする', C.teal],
  ];
  stages.forEach((st, i) => {
    const x = 1.0 + i * 2.78;
    circle(s, x, 3.77, 0.76, st[2]);
    text(s, String(i + 1), x, 3.98, 0.76, 0.2, { fontSize: 15, bold: true, color: C.white, align: 'center' });
    text(s, st[0], x - 0.35, 2.96, 1.45, 0.25, { fontSize: 15, bold: true, color: st[2], align: 'center' });
    text(s, st[1], x - 0.55, 4.82, 1.85, 0.52, { fontSize: 16, bold: true, align: 'center', valign: 'top' });
  });
  text(s, '使うタイミングが、開発の中にある。', 1.0, 6.0, 6.5, 0.36, { fontSize: 23, bold: true, color: C.teal });
  footer(s);
}

// 8. Demo scenario
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  header(s, '07 / 実演', '実際の操作は、登録して、進めて、確かめる。', 8);
  text(s, '動画では、1つのチームがHackRadarを使い始める流れを見せます。', 0.72, 1.92, 10.5, 0.3, { fontSize: 18, color: C.muted });
  const demo = [
    ['01', 'チーム登録', 'チーム名とGitHub\nリポジトリを入力'],
    ['02', 'メンバー参加', '招待リンクから\nチームに参加'],
    ['03', '開発を進める', 'GitHubへpushして\n活動を記録'],
    ['04', '状況を確認', 'グラフとチャットで\n次の作業を決める'],
  ];
  demo.forEach((d, i) => {
    const x = 0.92 + i * 3.05;
    numberCircle(s, i + 1, x, 3.0, i === 2 ? C.coral : C.teal);
    text(s, d[1], x, 3.74, 2.15, 0.3, { fontSize: 19, bold: true });
    text(s, d[2], x, 4.28, 2.35, 0.6, { fontSize: 16, color: C.muted, valign: 'top' });
    if (i < 3) line(s, x + 2.25, 3.25, x + 2.8, 3.25, C.line, 2);
  });
  rect(s, 0.92, 5.86, 11.0, 0.58, C.coralLight, C.coral, true);
  text(s, 'ここで大事なのは、開発を止めずに進捗が残ることです。', 1.25, 6.02, 10.35, 0.25, { fontSize: 17, bold: true, color: C.coral, align: 'center' });
  footer(s);
}

// 9. Technology
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  header(s, '08 / 技術', '短期間でも成立する、シンプルな技術構成。', 9);
  text(s, '既存の開発フローを活かし、必要な部分だけをつないでいます。', 0.72, 1.92, 10.3, 0.3, { fontSize: 18, color: C.muted });
  // connectors first
  line(s, 2.8, 3.3, 4.06, 3.3, C.line, 2);
  line(s, 6.35, 3.3, 7.58, 3.3, C.line, 2);
  line(s, 9.9, 3.3, 11.14, 3.3, C.line, 2);
  const tech = [
    [0.84, 'GitHub', 'OAuth / API / Webhooks', C.ink],
    [4.1, 'Next.js', 'React / TypeScript', C.coral],
    [7.62, 'Supabase', 'PostgreSQL / Realtime', C.teal],
    [11.16, '画面', 'Dashboard / Chat', C.ink],
  ];
  tech.forEach(([x, title, sub, color]) => {
    rect(s, x, 2.62, 1.66, 1.36, C.pale, color, true);
    text(s, title, x, 2.9, 1.66, 0.29, { fontSize: 20, bold: true, align: 'center', color });
    text(s, sub, x + 0.12, 3.43, 1.42, 0.3, { fontSize: 11, color: C.muted, align: 'center' });
  });
  text(s, 'Production', 0.88, 5.18, 1.2, 0.22, { fontSize: 13, bold: true, color: C.teal });
  text(s, 'Vercel上のNext.js Route Handlers', 2.08, 5.18, 4.2, 0.22, { fontSize: 16, bold: true });
  text(s, 'Local bridge', 7.0, 5.18, 1.45, 0.22, { fontSize: 13, bold: true, color: C.coral });
  text(s, 'Express 5 webhook server', 8.55, 5.18, 3.2, 0.22, { fontSize: 16, bold: true });
  text(s, 'TypeScript / Next.js 14 / React 18 / Node.js / Express 5 / Supabase / Vercel', 0.88, 6.02, 10.8, 0.26, { fontSize: 14, color: C.muted });
  footer(s);
}

// 10. Close
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  s.addImage({ path: logo, x: 0.78, y: 0.56, w: 1.5, h: 0.48 });
  text(s, '見えない停滞を、\n次の一手に変える。', 0.82, 1.72, 7.2, 1.55, { fontSize: 39, bold: true, color: C.ink, valign: 'top' });
  text(s, 'HackRadarは、ハッカソンの開発中に\n「いま何が起きているか」を見えるようにします。', 0.84, 3.72, 6.6, 0.86, { fontSize: 21, color: C.muted, valign: 'top' });
  line(s, 8.6, 1.72, 8.6, 5.83, C.line, 1.2);
  text(s, '今日、持ち帰ってほしいこと', 9.05, 2.02, 3.35, 0.3, { fontSize: 18, bold: true, color: C.teal });
  ['GitHubの活動を自動で可視化する', 'チームとメンターの相談をつなぐ', '開発の途中で使うから、次の一手が早くなる'].forEach((v, i) => {
    numberCircle(s, i + 1, 9.05, 2.78 + i * 0.83, i === 1 ? C.coral : C.teal);
    text(s, v, 9.67, 2.84 + i * 0.83, 2.8, 0.42, { fontSize: 16, bold: i === 2, valign: 'top' });
  });
  text(s, 'ありがとうございました', 0.84, 6.35, 3.8, 0.3, { fontSize: 17, bold: true, color: C.teal });
  footer(s, 'HackRadar | Thank you');
}

pptx.writeFile({ fileName: path.resolve(__dirname, '../../HackRadar_3min_presentation.pptx') });

