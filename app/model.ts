import POLL_HISTORY_DATA from "./poll-history.json" with { type: "json" };
export const DISTRICTS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

export const PARTIES = [
  "HDZ", "SDP", "Mozemo", "Most", "DP", "DOMiNO", "PiP", "HS", "HSP",
  "Drito", "IDS", "NPS", "Fokus", "Centar", "HSS", "HSU", "HNS", "Other",
] as const;

export type District = (typeof DISTRICTS)[number];
export type Party = (typeof PARTIES)[number];
export type Mode = "polls" | "left" | "likely" | "user";
export type BaselineKey = "weighted" | "ipsos" | "promocija";
export type VoteMap = Record<Party, number>;
export type Poll = { date: string; firm: string; n: number; und: number; v: VoteMap; imputed?: Party[]; sourceUrl?: string };
export type CoalitionGroups = { left: Party[]; hdz: Party[]; right: Party[] };
export type CoalitionLoss = Partial<Record<Party, number>>;

export type Scenario = {
  mode: Mode;
  raw: VoteMap;
  undecided: number;
  undecidedTurnout: number;
  undecidedTilt: number;
  localPersistence: number;
  diasporaHdz: number;
  minorityLeft: number;
  coalitions: CoalitionGroups;
  mergeHdzRight: boolean;
  coalitionLoss?: CoalitionLoss;
};

export type DistrictResult = {
  lists: Record<string, number>;
  sorted: [string, number][];
  winner: [string, number];
  autoTally: Record<string, number>;
  autoSeats: string[];
  lostVoteShare: number;
};

export const COLORS: Record<string, string> = {
  HDZ: "#1769c2", SDP: "#d7353f", Mozemo: "#2b9d68", Most: "#d99a13",
  DP: "#17191d", DOMiNO: "#3c4149", PiP: "#676c73", HS: "#292d33",
  HSP: "#08090b", Drito: "#5d9fc8", IDS: "#008b79", NPS: "#7850a0",
  Fokus: "#00a1bd", Centar: "#bf5794", HSS: "#78933a", HSU: "#c77f28",
  HNS: "#e4a55e", Other: "#a4a9ad",
};

const LABELS: Partial<Record<Party, string>> = {
  Mozemo: "Možemo", Drito: "Drito / Selak", Other: "Other lists",
};

const LEFT = new Set<Party>(["SDP", "Mozemo", "Centar", "NPS", "Fokus"]);
const RIGHT = new Set<Party>(["HDZ", "Most", "DP", "DOMiNO", "PiP", "HS", "HSP", "HNS", "HSS", "IDS"]);

export const BROAD_LEFT = new Set<Party>(["SDP", "Mozemo", "Centar", "NPS", "Fokus"]);

export const POLLING_THROUGH = "2026-09-06";

export const POLL_HISTORY = POLL_HISTORY_DATA as Poll[];
export const POLL_BASELINE: Poll[] = POLL_HISTORY.slice(0, 10);

export const RANGES: Record<Party, [number, number, number]> = {
  HDZ: [25, 31, 0.1], SDP: [17, 24, 0.1], Mozemo: [10, 15.5, 0.1], Most: [5, 10.5, 0.1], DP: [1, 4, 0.1], DOMiNO: [0.4, 3, 0.1], PiP: [0.3, 2, 0.1], HS: [0.3, 3, 0.1], HSP: [0, 1.5, 0.1],
  Drito: [0.5, 4, 0.1], IDS: [0.4, 2.5, 0.1], NPS: [0, 1.2, 0.1], Fokus: [0, 0.9, 0.1], Centar: [0.2, 1.8, 0.1], HSS: [0.1, 1.6, 0.1], HSU: [0.2, 3.2, 0.1], HNS: [0, 1.2, 0.1], Other: [2, 8, 0.1],
};

const NAT24: Partial<Record<Party, number>> = { HDZ: 34.42, SDP: 25.4, Mozemo: 8.96, Most: 8.02, DP: 9.56 };
const BASE24: Record<District, Partial<Record<Party, number>>> = {
  I: { HDZ: 27.65, SDP: 24.37, Mozemo: 19.87, DP: 9.29, Most: 7.43, Fokus: 3.44, Other: 7.95 },
  II: { HDZ: 35.34, SDP: 24.83, Mozemo: 8.57, DP: 11.13, Most: 9.07, Other: 11.06 },
  III: { HDZ: 27.56, SDP: 36.75, Mozemo: 6.24, DP: 5.06, NPS: 12.1, Other: 12.29 },
  IV: { HDZ: 41.81, SDP: 25.2, Mozemo: 5.49, DP: 13.07, Most: 6.04, Other: 8.39 },
  V: { HDZ: 42.78, SDP: 19.57, Mozemo: 3.6, DP: 19.57, Most: 8.48, Other: 6.0 },
  VI: { HDZ: 24.84, SDP: 23.81, Mozemo: 18.41, DP: 8.7, Most: 9.5, Fokus: 7.75, Other: 6.99 },
  VII: { HDZ: 41.31, SDP: 25.36, Mozemo: 6.93, DP: 8.64, Most: 6.61, Other: 11.15 },
  VIII: { HDZ: 21.28, SDP: 33.36, Mozemo: 10.24, Most: 5.71, IDS: 15.92, DP: 4, Other: 9.49 },
  IX: { HDZ: 39.74, SDP: 19.38, Mozemo: 4.45, DP: 10.64, Most: 12.08, Other: 13.71 },
  X: { HDZ: 37, SDP: 25.46, Mozemo: 5.27, DP: 10.83, Most: 11.46, Other: 9.98 },
};

const LOCAL_ANCHOR: Partial<Record<Party, Partial<Record<District, number>>>> = {
  IDS: { VIII: 15.92 }, NPS: { III: 3.1 }, Fokus: { I: 3.0, VI: 3.0 },
};
const SMALL_PROFILE: Partial<Record<Party, Record<District, number>>> = {
  IDS: { I: 0.25, II: 0.2, III: 0.35, IV: 0.15, V: 0.15, VI: 0.5, VII: 1, VIII: 7.1, IX: 0.35, X: 0.25 },
  NPS: { I: 0.25, II: 0.35, III: 4.2, IV: 0.25, V: 0.2, VI: 0.45, VII: 0.3, VIII: 0.3, IX: 0.2, X: 0.2 },
  Fokus: { I: 1.5, II: 0.6, III: 0.7, IV: 0.35, V: 0.3, VI: 4.8, VII: 0.6, VIII: 0.6, IX: 0.3, X: 0.25 },
};
const CUSTOM: Partial<Record<Party, Record<District, number>>> = {
  Drito: { I: 2, II: 1.7, III: 0.75, IV: 0.65, V: 0.55, VI: 1.8, VII: 0.9, VIII: 0.75, IX: 0.7, X: 1 },
  Centar: { I: 1.35, II: 1, III: 0.75, IV: 0.55, V: 0.65, VI: 1.25, VII: 1.15, VIII: 1.15, IX: 0.8, X: 2.7 },
  HSS: { I: 1.1, II: 1.25, III: 1.25, IV: 1.35, V: 1.25, VI: 1.15, VII: 1.35, VIII: 0.8, IX: 0.85, X: 0.9 },
  HSU: { I: 0.9, II: 1.05, III: 1.1, IV: 1.1, V: 1.1, VI: 0.9, VII: 1, VIII: 1.05, IX: 1, X: 1 },
  HNS: { I: 0.8, II: 4.5, III: 2.5, IV: 1.1, V: 0.7, VI: 1, VII: 0.8, VIII: 0.7, IX: 0.6, X: 0.6 },
  HSP: { I: 0.5, II: 0.8, III: 0.5, IV: 1.4, V: 1.6, VI: 0.8, VII: 1, VIII: 0.4, IX: 1.6, X: 1.4 },
  HS: { I: 0.9, II: 1.15, III: 0.7, IV: 1.35, V: 1.3, VI: 1.15, VII: 1, VIII: 0.65, IX: 1.35, X: 1.35 },
};

export const SOURCE_COLORS: Record<District, [number, number, number]> = {
  I: [255, 129, 205], II: [129, 255, 255], III: [255, 205, 129], IV: [154, 255, 129], V: [255, 129, 129],
  VI: [154, 129, 255], VII: [129, 179, 255], VIII: [230, 255, 129], IX: [129, 255, 179], X: [230, 129, 255],
};

export const DEFAULT_COALITIONS: CoalitionGroups = {
  left: [], hdz: [], right: [],
};

export const SDP_MOZEMO_COALITION: CoalitionGroups = {
  left: ["Mozemo"], hdz: [], right: [],
};

export const LIKELY_COALITIONS: CoalitionGroups = {
  left: ["Mozemo", "Centar"], hdz: ["HNS", "HSU", "HSS"], right: ["DOMiNO", "PiP", "HS", "HSP"],
};

export function label(party: string) {
  return LABELS[party as Party] ?? party;
}

export function formatList(name: string) {
  return name.split(" + ").map(label).join(" + ");
}

export function listParts(name: string) {
  return name.split(" + ") as Party[];
}

export function colorOf(name: string) {
  if (COLORS[name]) return COLORS[name];
  return COLORS[listParts(name)[0]] ?? COLORS.Other;
}

export function colorsOf(name: string) {
  return listParts(name).map((party) => COLORS[party] ?? COLORS.Other);
}

export function swatchBackground(name: string) {
  const colors = colorsOf(name);
  if (colors.length === 1) return colors[0];
  const stops = colors.map((color, index) => `${color} ${index * 10}px ${(index + 1) * 10}px`).join(", ");
  return `repeating-linear-gradient(135deg, ${stops})`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

export function pollWeights(polls: Poll[], now = new Date(`${[...polls].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? POLLING_THROUGH}T00:00:00Z`)) {
  const rows = polls.map((poll) => {
    const ageDays = Math.max(0, (now.getTime() - new Date(`${poll.date}T00:00:00Z`).getTime()) / 86_400_000);
    const recency = Math.exp(-ageDays / 60);
    const sampleWeight = Math.sqrt(poll.n);
    return { poll, ageDays, recency, sampleWeight, weight: sampleWeight * recency };
  });
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return rows.map((row) => ({ ...row, normalizedWeight: total ? row.weight / total : 0 }));
}

export function latestPoll(polls: Poll[], firm: string) {
  return [...polls].filter((poll) => poll.firm.toLowerCase() === firm.toLowerCase()).sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function baselinesFromPolls(polls: Poll[]) {
  const latestTen = [...polls].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const single = (firm: string) => {
    const poll = latestPoll(polls, firm);
    if (!poll) return null;
    return { label: `${firm} · ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${poll.date}T00:00:00Z`))}`, und: poll.und, vals: { ...poll.v }, polls: [poll] };
  };
  return { weighted: { ...weightedBaselineFromPolls(latestTen), polls: latestTen }, ipsos: single("Ipsos"), promocija: single("Promocija plus") };
}

export function weightedBaselineFromPolls(polls: Poll[], now?: Date) {
  const sums = Object.fromEntries(PARTIES.map((party) => [party, 0])) as VoteMap;
  const weights = Object.fromEntries(PARTIES.map((party) => [party, 0])) as VoteMap;
  let undecidedSum = 0;
  let undecidedWeight = 0;
  for (const { poll, weight } of pollWeights(polls, now)) {
    for (const party of PARTIES) {
      sums[party] += poll.v[party] * weight;
      weights[party] += weight;
    }
    undecidedSum += poll.und * weight;
    undecidedWeight += weight;
  }
  return {
    label: "Weighted recent polls",
    und: undecidedSum / undecidedWeight,
    vals: Object.fromEntries(PARTIES.map((party) => [party, sums[party] / weights[party]])) as VoteMap,
  };
}

export const BASELINES = {
  weighted: weightedBaselineFromPolls(POLL_BASELINE),
  ipsos: { label: "Ipsos · 26 Aug 2026", und: POLL_BASELINE[1].und, vals: { ...POLL_BASELINE[1].v } },
  promocija: { label: "Promocija plus · 6 Sep 2026", und: POLL_BASELINE[0].und, vals: { ...POLL_BASELINE[0].v } },
} satisfies Record<BaselineKey, { label: string; und: number; vals: VoteMap }>;

export function clampRaw(values: VoteMap): VoteMap {
  return Object.fromEntries(PARTIES.map((party) => {
    const [min, max] = RANGES[party];
    return [party, Math.max(min, Math.min(max, values[party]))];
  })) as VoteMap;
}

function rawPrepared(scenario: Scenario, rawOverride?: VoteMap) {
  const raw = { ...(rawOverride ?? scenario.raw) };
  const decidedPool = 100 - scenario.undecided;
  const named = PARTIES.filter((party) => party !== "Other").reduce((sum, party) => sum + raw[party], 0);
  let other = Math.max(0, raw.Other);
  let total = named + other;
  if (total < decidedPool) {
    other += decidedPool - total;
  } else if (total > decidedPool) {
    const take = Math.min(other, total - decidedPool);
    other -= take;
    total -= take;
    if (total > decidedPool) {
      const factor = decidedPool / total;
      for (const party of PARTIES) if (party !== "Other") raw[party] *= factor;
      other *= factor;
    }
  }
  raw.Other = other;
  return raw;
}

export function effectiveNational(scenario: Scenario, rawOverride?: VoteMap) {
  const raw = rawPrepared(scenario, rawOverride);
  const decidedPool = 100 - scenario.undecided;
  const undecidedVoting = scenario.undecided * scenario.undecidedTurnout / 100;
  const weights = {} as VoteMap;
  let weightSum = 0;
  for (const party of PARTIES) {
    let multiplier = 1;
    if (LEFT.has(party)) multiplier = Math.exp(scenario.undecidedTilt / 35);
    else if (RIGHT.has(party)) multiplier = Math.exp(-scenario.undecidedTilt / 35);
    weights[party] = raw[party] * multiplier;
    weightSum += weights[party];
  }
  const denominator = decidedPool + undecidedVoting;
  return Object.fromEntries(PARTIES.map((party) => [party, (raw[party] + undecidedVoting * weights[party] / weightSum) / denominator * 100])) as VoteMap;
}

function districtIndividual(district: District, scenario: Scenario, rawOverride?: VoteMap) {
  const national = effectiveNational(scenario, rawOverride);
  const output: Record<string, number> = {};
  for (const party of ["HDZ", "SDP", "Mozemo", "Most"] as Party[]) {
    const national2024 = NAT24[party] ?? 1;
    const district2024 = BASE24[district][party] ?? national2024 * 0.55;
    output[party] = national[party] * district2024 / national2024;
  }
  const dpProfile = (BASE24[district].DP ?? (NAT24.DP ?? 1) * 0.55) / (NAT24.DP ?? 1);
  output.DP = national.DP * dpProfile;
  output.DOMiNO = national.DOMiNO * dpProfile * 1.03;
  output.PiP = national.PiP * dpProfile * 0.95;
  output.HS = national.HS * (CUSTOM.HS?.[district] ?? 1);
  output.HSP = national.HSP * (CUSTOM.HSP?.[district] ?? 1);
  output.Drito = national.Drito * (CUSTOM.Drito?.[district] ?? 1);
  for (const party of ["Centar", "HSS", "HSU", "HNS"] as Party[]) output[party] = national[party] * (CUSTOM[party]?.[district] ?? 1);
  const persistence = scenario.localPersistence / 100;
  for (const party of ["IDS", "NPS", "Fokus"] as Party[]) {
    const swing = national[party] * (SMALL_PROFILE[party]?.[district] ?? 0.25);
    const oldLocal = LOCAL_ANCHOR[party]?.[district];
    output[party] = oldLocal == null ? swing : persistence * oldLocal + (1 - persistence) * swing;
  }
  output.Other = national.Other;
  const total = Object.values(output).reduce((sum, value) => sum + value, 0);
  for (const party of Object.keys(output)) output[party] = output[party] / total * 100;
  return output;
}

function joinName(parties: Party[]) {
  return parties.join(" + ");
}

export function scenarioCoalitions(scenario: Pick<Scenario, "mode" | "coalitions">): CoalitionGroups {
  if (scenario.mode === "polls") return { left: [], hdz: [], right: [] };
  if (scenario.mode === "left") return SDP_MOZEMO_COALITION;
  if (scenario.mode === "likely") return LIKELY_COALITIONS;
  return scenario.coalitions;
}

export function activeCoalitionLists(scenario: Scenario) {
  const groups = scenarioCoalitions(scenario);
  const complete = [
    { key: "left", members: ["SDP", ...groups.left] as Party[] },
    { key: "hdz", members: ["HDZ", ...groups.hdz] as Party[] },
    { key: "right", members: ["DP", ...groups.right] as Party[] },
  ];
  if (scenario.mode === "user" && scenario.mergeHdzRight) {
    return [complete[0], { key: "hdzRight", members: [...complete[1].members, ...complete[2].members] }];
  }
  return complete;
}

export function coalitionAdjustedDistrict(district: District, scenario: Scenario, rawOverride?: VoteMap) {
  const individuals = districtIndividual(district, scenario, rawOverride);
  if (scenario.mode === "polls") return { lists: individuals, lostVoteShare: 0 };
  const output: Record<string, number> = {};
  const assigned = new Set<Party>();
  let lostVoteShare = 0;
  for (const { members } of activeCoalitionLists(scenario)) {
    const parties = [...new Set(members)].filter((party) => !assigned.has(party));
    let retained = 0;
    for (const party of parties) {
      assigned.add(party);
      const requestedLoss = scenario.coalitionLoss?.[party] ?? 0;
      const lossRate = parties.length > 1 && Number.isFinite(requestedLoss) ? Math.max(0, Math.min(50, requestedLoss)) / 100 : 0;
      const lost = (individuals[party] ?? 0) * lossRate;
      lostVoteShare += lost;
      retained += (individuals[party] ?? 0) - lost;
    }
    if (retained > 0) output[joinName(parties)] = retained;
  }
  for (const [party, value] of Object.entries(individuals)) if (!assigned.has(party as Party)) output[party] = value;
  // Defecting voters abstain. Thresholds use the remaining valid vote, not the pre-loss denominator.
  const remainingVote = Object.values(output).reduce((sum, share) => sum + share, 0);
  if (lostVoteShare > 0 && remainingVote > 0) {
    for (const name of Object.keys(output)) output[name] = output[name] / remainingVote * 100;
  }
  return { lists: output, lostVoteShare };
}

export function districtLists(district: District, scenario: Scenario, rawOverride?: VoteMap) {
  return coalitionAdjustedDistrict(district, scenario, rawOverride).lists;
}

export function dHondt(shares: Record<string, number>) {
  const quotients: { quotient: number; party: string }[] = [];
  for (const [party, share] of Object.entries(shares)) {
    if (share >= 5) for (let divisor = 1; divisor <= 14; divisor += 1) quotients.push({ quotient: share / divisor, party });
  }
  quotients.sort((a, b) => b.quotient - a.quotient);
  const seats: Record<string, number> = {};
  quotients.slice(0, 14).forEach(({ party }) => { seats[party] = (seats[party] ?? 0) + 1; });
  return seats;
}

export function resultForDistrict(district: District, scenario: Scenario): DistrictResult {
  const { lists, lostVoteShare } = coalitionAdjustedDistrict(district, scenario);
  const sorted = Object.entries(lists).sort((a, b) => b[1] - a[1]);
  const autoTally = dHondt(lists);
  const autoSeats: string[] = [];
  Object.entries(autoTally).sort((a, b) => b[1] - a[1]).forEach(([party, seats]) => {
    for (let index = 0; index < seats; index += 1) autoSeats.push(party);
  });
  return { lists, sorted, winner: sorted[0], autoTally, autoSeats, lostVoteShare };
}
