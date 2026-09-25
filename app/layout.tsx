import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const themeInitializer = `try {
  if (localStorage.getItem("hackradar-theme") === "navy") {
    document.documentElement.dataset.theme = "navy";
  }
} catch {}`;

export const metadata: Metadata = {
  title: "HackRadar | チーム開発ダッシュボード",
  description:
    "GitHubの活動をリアルタイムに可視化し、チームの進捗・ランキング・相談を1画面にまとめるダッシュボード。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
