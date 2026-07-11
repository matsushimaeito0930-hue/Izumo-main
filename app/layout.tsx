import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackVerse",
  description: "A realtime online lobby for hackathon teams."
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
