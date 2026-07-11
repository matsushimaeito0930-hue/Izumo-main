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
        void: "#080914",
        panel: "#101322",
        pulse: "#33f2d1",
        hot: "#ff4f8b",
        sun: "#ffd166",
        field: "#6ee7b7"
      },
      boxShadow: {
        neon: "0 0 28px rgba(51, 242, 209, 0.24)",
        hot: "0 0 28px rgba(255, 79, 139, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
