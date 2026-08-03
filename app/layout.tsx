import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackVerse | ハッカソン運営ダッシュボード",
  description:
    "GitHubの活動をリアルタイムに可視化し、チームの進捗・ランキング・相談を1画面にまとめるダッシュボード。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
