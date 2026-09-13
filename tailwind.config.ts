import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--color-paper-rgb) / <alpha-value>)",
        paper2: "rgb(var(--color-paper-2-rgb) / <alpha-value>)",
        surface: "rgb(var(--color-surface-rgb) / <alpha-value>)",
        sand: "rgb(var(--color-sand-rgb) / <alpha-value>)",
        line: "rgb(var(--color-line-rgb) / <alpha-value>)",
        lineStrong: "rgb(var(--color-line-strong-rgb) / <alpha-value>)",
        ink: "rgb(var(--color-ink-rgb) / <alpha-value>)",
        ink2: "rgb(var(--color-ink-2-rgb) / <alpha-value>)",
        muted: "rgb(var(--color-muted-rgb) / <alpha-value>)",
        pulse: "rgb(var(--color-pulse-rgb) / <alpha-value>)",
        hot: "rgb(var(--color-hot-rgb) / <alpha-value>)",
        sun: "rgb(var(--color-sun-rgb) / <alpha-value>)",
        field: "rgb(var(--color-field-rgb) / <alpha-value>)"
      },
      boxShadow: {
        // Soft UI: 右下に影、左上にハイライト。境界線は残すのでコントラストは落とさない。
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)",
        lift: "var(--shadow-card)",
        // 溝。プログレスバーの下地や入力欄に使う。
        inset: "var(--shadow-inset)",
        // 押し込み。ボタンの :active 用。
        pressed: "var(--shadow-pressed)",
        btn: "var(--shadow-soft)"
      }
    }
  },
  plugins: []
};

export default config;
