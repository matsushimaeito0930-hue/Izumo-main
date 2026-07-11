import { describe, expect, it } from "vitest";
import { getHouseLevel, getPointsToNextLevel } from "@/lib/house";

describe("house level scoring", () => {
  it("maps momentum score to the expected house level", () => {
    expect(getHouseLevel(0)).toBe(1);
    expect(getHouseLevel(99)).toBe(1);
    expect(getHouseLevel(100)).toBe(2);
    expect(getHouseLevel(299)).toBe(2);
    expect(getHouseLevel(300)).toBe(3);
    expect(getHouseLevel(599)).toBe(3);
    expect(getHouseLevel(600)).toBe(4);
  });

  it("returns remaining points until the next level", () => {
    expect(getPointsToNextLevel(95)).toBe(5);
    expect(getPointsToNextLevel(220)).toBe(80);
    expect(getPointsToNextLevel(600)).toBe(0);
  });
});
