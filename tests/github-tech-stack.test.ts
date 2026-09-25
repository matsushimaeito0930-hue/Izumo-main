import { describe, expect, it } from "vitest";
import { detectFrameworksFromManifests, detectTechnologiesFromManifests } from "@/lib/github-tech-stack";

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
    ).toEqual(["Next.js", "React", "Supabase (PostgreSQL)", "Tailwind CSS"]);
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

  it("classifies frontend, backend, and database technologies", () => {
    expect(
      detectTechnologiesFromManifests({
        "package.json": JSON.stringify({
          dependencies: {
            next: "16.0.0",
            express: "5.0.0",
            "@prisma/client": "6.0.0",
            pg: "8.0.0"
          }
        })
      })
    ).toEqual({
      frontend: ["Next.js"],
      backend: ["Express"],
      database: ["PostgreSQL", "Prisma (ORM)"]
    });
  });
});
