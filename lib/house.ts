import { HOUSE_LEVELS } from "@/lib/constants";

export function getHouseLevel(score: number): number {
  return HOUSE_LEVELS.reduce((current, level) => {
    return score >= level.minScore ? level.level : current;
  }, 1);
}

export function getNextHouseLevel(score: number) {
  return HOUSE_LEVELS.find((level) => level.minScore > score) ?? null;
}

export function getPointsToNextLevel(score: number): number {
  const nextLevel = getNextHouseLevel(score);
  return nextLevel ? nextLevel.minScore - score : 0;
}
