/**
 * "@/lib/x" のようなパス別名を、リポジトリ内の .ts ファイルに解決する。
 *
 * verify:flow を Next.js のバンドラ無しで動かすためだけの仕掛け。
 * アプリ本体の動作には関係しない。
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = join(ROOT, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }

  return next(specifier, context);
}
