import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["server/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  globalIgnores([
    ".next/**",
    ".next-video/**",
    ".tmp/**",
    ".agents/**",
    "coverage/**",
    "out/**",
    "build/**",
    "next-env.d.ts"
  ])
]);
