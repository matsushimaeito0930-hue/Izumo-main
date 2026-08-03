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
        paper: "#faf7f1",
        paper2: "#f2ece1",
        surface: "#fffdfa",
        sand: "#f7f3ea",
        line: "#e6dfd2",
        lineStrong: "#d6cdbb",
        ink: "#23201c",
        ink2: "#4a443c",
        muted: "#7a7266",
        pulse: "#0f8b7e",
        hot: "#c05575",
        sun: "#b5771a",
        field: "#2e7d5b"
      },
      boxShadow: {
        // Soft UI: 右下に影、左上にハイライト。境界線は残すのでコントラストは落とさない。
        soft: "3px 3px 8px rgba(160, 148, 128, 0.16), -2px -2px 6px rgba(255, 255, 255, 0.85)",
        card: "4px 4px 12px rgba(160, 148, 128, 0.18), -3px -3px 9px rgba(255, 255, 255, 0.9)",
        lift: "6px 6px 18px rgba(160, 148, 128, 0.22), -4px -4px 12px rgba(255, 255, 255, 0.95)",
        // 溝。プログレスバーの下地や入力欄に使う。
        inset:
          "inset 2px 2px 4px rgba(160, 148, 128, 0.22), inset -1px -1px 3px rgba(255, 255, 255, 0.75)",
        // 押し込み。ボタンの :active 用。
        pressed: "inset 3px 3px 6px rgba(160, 148, 128, 0.32)",
        btn: "3px 3px 8px rgba(160, 148, 128, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
