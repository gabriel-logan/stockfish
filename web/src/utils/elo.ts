export interface EloLevel {
  elo: number;
  label: string;
  skill: number;
}

export const ELO_LEVELS: EloLevel[] = [
  { elo: 1200, label: "1200", skill: 1 },
  { elo: 1500, label: "1500", skill: 5 },
  { elo: 1800, label: "1800", skill: 10 },
  { elo: 2200, label: "2200", skill: 15 },
  { elo: 2600, label: "2600", skill: 18 },
  { elo: 3200, label: "3200", skill: 20 },
];

export function getSkillLevel(elo: number): number {
  const found = ELO_LEVELS.find((l) => {
    return l.elo === elo;
  });

  return found?.skill ?? 10;
}
