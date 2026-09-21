import { describe, expect, it } from "vitest";
import { detectFrameworksFromManifests } from "@/lib/github-tech-stack";

describe("framework detection", () => {
  it("detects JavaScript frameworks and services from package.json", () => {
    expect(
      detectFrameworksFromManifests({
        "package.json": JSON.stringify({
          dependencies: {
            next: "16.0.0",
            react: "19.0.0",
            "@supabase/supabase-js": "2.0.0"
          },
          devDependencies: { tailwindcss: "3.0.0" }
        })
      })
    ).toEqual(["Next.js", "React", "Supabase", "Tailwind CSS"]);
  });

  it("detects ecosystems from non-JavaScript manifest files", () => {
    expect(
      detectFrameworksFromManifests({
        "requirements.txt": "fastapi==0.1\nuvicorn==0.1",
        "pom.xml": "<artifactId>spring-boot-starter-web</artifactId>",
        "go.mod": "require github.com/gin-gonic/gin v1.0.0"
      })
    ).toEqual(["FastAPI", "Gin", "Spring Boot"]);
  });
});
