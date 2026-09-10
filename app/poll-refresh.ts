import {
  PARTIES,
  POLLING_THROUGH,
  POLL_BASELINE,
  weightedBaselineFromPolls,
  type Party,
  type Poll,
  type VoteMap,
} from "./model";

export const POLL_SOURCE_URL = "https://en.wikipedia.org/wiki/Next_Croatian_parliamentary_election";
export const MEDIAWIKI_POLL_API_URL = "https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&page=Next_Croatian_parliamentary_election&prop=text";

const HTML_ENDPOINTS = [
  MEDIAWIKI_POLL_API_URL,
  POLL_SOURCE_URL,
  "https://en.wikipedia.org/api/rest_v1/page/html/Next_Croatian_parliamentary_election",
];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const PARTY_HEADERS: Partial<Record<Party, string[]>> = {
  HDZ: ["hdz"], SDP: ["sdp"], DP: ["dp"], DOMiNO: ["domino"], PiP: ["pip"],
  Mozemo: ["mozemo"], Most: ["most"], HS: ["hs"], Fokus: ["fokus"], IDS: ["ids"],
  NPS: ["nps"], Centar: ["centar"], HSS: ["hss"], HSU: ["hsu"], HNS: ["hns"],
  Drito: ["drito"], Other: ["others", "other"],
};

export type PollRefreshPayload = {
  status: "current" | "updated" | "revised" | "error";
  checkedAt?: string;
  sourceUrl: string;
  baselineThrough?: string;
  latestDate?: string;
  newPollCount?: number;
  revisedPollCount?: number;
  usedPollCount?: number;
  message?: string;
  freshBaseline?: { label: string; und: number; vals: VoteMap };
  polls?: Poll[];
  newPolls?: {
    date: string;
    firm: string;
    n: number;
    headline: Record<"HDZ" | "SDP" | "Mozemo" | "Most", number>;
  }[];
};

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&", apos: "'", quot: "\"", lt: "<", gt: ">", nbsp: " ", ndash: "–",
    mdash: "—", minus: "−", hellip: "…", szlig: "ß",
  };
  return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&([a-z]+);/gi, (_, hex: string, decimal: string, name: string) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return named[name.toLowerCase()] ?? " ";
  });
}

function cellText(html: string) {
  return decodeHtml(
    html
      .replace(/<(sup|style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<span\b[^>]*(?:display\s*:\s*none|sortkey)[^>]*>[\s\S]*?<\/span>/gi, "")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\[[a-z0-9]+\]/gi, " ").replace(/\s+/g, " ").trim();
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseDate(value: string) {
  const match = value.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/);
  if (!match) return null;
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function numberFrom(value: string, fallback: number) {
  const normalizedDash = value.replace(/[−–—]/g, "-").trim();
  if (!normalizedDash || normalizedDash === "-") return fallback;
  const match = normalizedDash.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function normalizeFirm(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("promocija")) return "Promocija plus";
  if (lower.includes("ipsos")) return "Ipsos";
  if (lower.includes("2x1")) return "2x1 komunikacije";
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function extractCells(row: string) {
  return Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), (match) => cellText(match[1]));
}

export function parsePollingTable(html: string) {
  const tables = Array.from(html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi), (match) => match[0]);
  const table = tables.find((candidate) => /Publication date/i.test(candidate) && /Polling firm/i.test(candidate) && /Undecided/i.test(candidate));
  if (!table) throw new Error("The Wikipedia polling table could not be located.");

  const rows = Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (match) => match[1]);
  const headerCells = rows.map(extractCells).find((cells) => cells.some((cell) => /publication date/i.test(cell)) && cells.some((cell) => /polling firm/i.test(cell)));
  if (!headerCells) throw new Error("The Wikipedia polling headers could not be read.");

  const headers = headerCells.map(normalized);
  const indexFor = (...names: string[]) => headers.findIndex((header) => names.some((name) => header === name || header.startsWith(`${name} `)));
  const dateIndex = indexFor("publication date");
  const firmIndex = indexFor("polling firm");
  const sampleIndex = indexFor("votes", "sample size", "sample");
  const undecidedIndex = indexFor("undecided");
  const partyIndices = Object.fromEntries(PARTIES.map((party) => {
    if (party === "HSP") return [party, -1];
    const names = PARTY_HEADERS[party] ?? [party.toLowerCase()];
    return [party, indexFor(...names)];
  })) as Record<Party, number>;

  if ([dateIndex, firmIndex, sampleIndex, undecidedIndex, partyIndices.HDZ, partyIndices.SDP, partyIndices.Mozemo].some((index) => index < 0)) {
    throw new Error("Wikipedia changed the polling table columns.");
  }

  const polls: Poll[] = [];
  for (const row of rows) {
    const cells = extractCells(row);
    if (cells.length < headers.length - 2) continue;
    const date = parseDate(cells[dateIndex] ?? "");
    if (!date) continue;
    const firm = normalizeFirm(cells[firmIndex] ?? "");
    const n = Math.round(numberFrom(cells[sampleIndex] ?? "", 0));
    const und = numberFrom(cells[undecidedIndex] ?? "", -1);
    const values = {} as VoteMap;
    const imputed: Party[] = [];
    for (const party of PARTIES) {
      const reported = numberFrom(cells[partyIndices[party]] ?? "", NaN);
      if (party === "HSP" || !Number.isFinite(reported)) imputed.push(party);
      values[party] = party === "HSP" ? 0.4 : Number.isFinite(reported) ? reported : 0.5;
    }
    if (!firm || n < 500 || und < 0 || und > 45 || values.HDZ < 10 || values.SDP < 8 || values.Mozemo < 2) continue;
    const rawCells = Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), (match) => match[1]);
    const link = rawCells[firmIndex]?.match(/href=["'](https?:[^"']+)["']/i)?.[1];
    polls.push({ date, firm, n, und, v: values, imputed, sourceUrl: link ? decodeHtml(link) : POLL_SOURCE_URL });
  }

  const unique = new Map<string, Poll>();
  polls.forEach((poll) => unique.set(`${poll.date}|${poll.firm}|${poll.n}`, poll));
  return Array.from(unique.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function valuesChanged(a: Poll, b: Poll) {
  if (Math.abs(a.und - b.und) > 0.05 || a.n !== b.n) return true;
  return PARTIES.some((party) => Math.abs(a.v[party] - b.v[party]) > 0.05);
}

function validSince(value: string | null) {
  return value && /^20\d{2}-\d{2}-\d{2}$/.test(value) ? value : POLLING_THROUGH;
}

export function mediaWikiHtmlFromJson(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Wikipedia returned an invalid response.");
  const parse = (value as { parse?: { text?: string | { "*"?: string } } }).parse;
  if (typeof parse?.text === "string") return parse.text;
  if (parse?.text && typeof parse.text["*"] === "string") return parse.text["*"];
  throw new Error("Wikipedia did not return the article text.");
}

export function buildPollRefreshPayload(html: string, requestedSince: string | null, checkedAt = new Date()): PollRefreshPayload {
  const since = validSince(requestedSince);
  const parsedPolls = parsePollingTable(html);
  if (parsedPolls.length < 10) throw new Error("Fewer than ten valid polls were found in Wikipedia's table.");

  const latestTen = parsedPolls.slice(0, 10);
  const newPolls = parsedPolls.filter((poll) => poll.date > since);
  const baselineByKey = new Map(POLL_BASELINE.map((poll) => [`${poll.date}|${poll.firm}`, poll]));
  const revisedPolls = since === POLLING_THROUGH ? parsedPolls.filter((poll) => {
    const baseline = baselineByKey.get(`${poll.date}|${poll.firm}`);
    return baseline ? valuesChanged(poll, baseline) : false;
  }) : [];
  const weighted = weightedBaselineFromPolls(latestTen, checkedAt);
  const status = newPolls.length > 0 ? "updated" : revisedPolls.length > 0 ? "revised" : "current";

  return {
    status,
    checkedAt: checkedAt.toISOString(),
    sourceUrl: POLL_SOURCE_URL,
    baselineThrough: since,
    latestDate: parsedPolls[0].date,
    newPollCount: newPolls.length,
    revisedPollCount: revisedPolls.length,
    usedPollCount: latestTen.length,
    polls: parsedPolls,
    freshBaseline: {
      label: `Wikipedia refresh · through ${parsedPolls[0].date}`,
      und: weighted.und,
      vals: weighted.vals,
    },
    newPolls: newPolls.slice(0, 12).map((poll) => ({
      date: poll.date,
      firm: poll.firm,
      n: poll.n,
      headline: { HDZ: poll.v.HDZ, SDP: poll.v.SDP, Mozemo: poll.v.Mozemo, Most: poll.v.Most },
    })),
  };
}

async function readEndpoint(endpoint: string) {
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      Accept: endpoint.includes("api.php") ? "application/json" : "text/html,application/xhtml+xml",
      "Api-User-Agent": "CroatiaSeatTracker/1.1 (interactive polling refresh)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}.`);
  if (endpoint.includes("api.php")) return mediaWikiHtmlFromJson(await response.json());
  return response.text();
}

export async function fetchWikipediaHtml() {
  let lastError = "Wikipedia did not return the article.";
  for (const endpoint of HTML_ENDPOINTS) {
    try {
      return await readEndpoint(endpoint);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

export async function pollRefreshResponse(request: Request) {
  try {
    const since = new URL(request.url).searchParams.get("since");
    const html = await fetchWikipediaHtml();
    return Response.json(buildPollRefreshPayload(html, since), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({
      status: "error",
      message: error instanceof Error ? error.message : "The polling refresh failed.",
      sourceUrl: POLL_SOURCE_URL,
    } satisfies PollRefreshPayload, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
