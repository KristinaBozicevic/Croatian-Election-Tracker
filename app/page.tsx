"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BASELINES,
  BROAD_LEFT,
  DEFAULT_COALITIONS,
  DISTRICTS,
  LIKELY_COALITIONS,
  PARTIES,
  POLLING_THROUGH,
  RANGES,
  baselinesFromPolls,
  scenarioCoalitions,
  POLL_HISTORY,
  type Poll,
  type CoalitionLoss,
  colorOf,
  dHondt,
  districtLists,
  effectiveNational,
  formatList,
  listParts,
  resultForDistrict,
  swatchBackground,
  type BaselineKey,
  type CoalitionGroups,
  type District,
  type DistrictResult,
  type Mode,
  type Party,
  type Scenario,
  type VoteMap,
} from "./model";
import { ElectionWorkspace } from "./election-workspace";
import { PollEvidence } from "./poll-evidence";
import { PortraitCredits } from "./party-portraits";
import { formatDate, formatNumber, localeOf, otherLabel, translate, type Language } from "./i18n";
import {
  buildPollRefreshPayload,
  mediaWikiHtmlFromJson,
  MEDIAWIKI_POLL_API_URL,
  POLL_SOURCE_URL,
} from "./poll-refresh";

function CroatianFlag({ language }: { language: Language }) {
  return (
    <svg className="flag-mark" viewBox="0 0 60 30" role="img" aria-label={translate(language, "Zastava Hrvatske", "Flagge Kroatiens")}>
      <rect width="60" height="10" fill="#e0313f" />
      <rect y="10" width="60" height="10" fill="#ffffff" />
      <rect y="20" width="60" height="10" fill="#1769c2" />
      <g transform="translate(24 4)">
        <path d="M0 2.8 1.8 0 4 2.4 6 0 8 2.4 10.2 0 12 2.8v3H0z" fill="#f6f6f2" stroke="#24384b" strokeWidth=".45" />
        <rect x=".5" y="1" width="2" height="2" fill="#45a6c8" />
        <rect x="2.75" y="1" width="2" height="2" fill="#e0313f" />
        <rect x="5" y="1" width="2" height="2" fill="#1769c2" />
        <rect x="7.25" y="1" width="2" height="2" fill="#d5ad35" />
        <rect x="9.5" y="1" width="2" height="2" fill="#45a6c8" />
        <defs><clipPath id="croatia-shield"><path d="M1 5h10v8.1c0 3.9-2.6 6.3-5 7.4-2.4-1.1-5-3.5-5-7.4z" /></clipPath></defs>
        <g clipPath="url(#croatia-shield)">
          {Array.from({ length: 25 }, (_, index) => {
            const row = Math.floor(index / 5);
            const column = index % 5;
            return <rect key={index} x={1 + column * 2} y={5 + row * 2.7} width="2.05" height="2.75" fill={(row + column) % 2 === 0 ? "#e0313f" : "#ffffff"} />;
          })}
        </g>
        <path d="M1 5h10v8.1c0 3.9-2.6 6.3-5 7.4-2.4-1.1-5-3.5-5-7.4z" fill="none" stroke="#24384b" strokeWidth=".65" />
      </g>
    </svg>
  );
}

type ActiveBaselineKey = BaselineKey;
type FreshBaseline = { label: string; und: number; vals: VoteMap };
type PollRefreshResponse = {
  status: "current" | "updated" | "revised" | "error";
  checkedAt?: string;
  sourceUrl: string;
  baselineThrough?: string;
  latestDate?: string;
  newPollCount?: number;
  revisedPollCount?: number;
  usedPollCount?: number;
  message?: string;
  freshBaseline?: FreshBaseline;
  polls?: Poll[];
  newPolls?: { date: string; firm: string; n: number; headline: Record<"HDZ" | "SDP" | "Mozemo" | "Most", number> }[];
};
type RefreshImpact = {
  shares: { party: Party; before: number; after: number; delta: number }[];
  seats: { name: string; before: number; after: number; delta: number }[];
  coreBefore: number;
  coreAfter: number;
  broadBefore: number;
  broadAfter: number;
};
type RefreshState = {
  phase: "idle" | "loading" | "current" | "updated" | "revised" | "error";
  result?: PollRefreshResponse;
  impact?: RefreshImpact;
};

async function jsonBody<T>(response: Response) {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("The polling service returned an unexpected response.");
  }
}

async function requestPollRefresh(since: string): Promise<PollRefreshResponse> {
  if (!window.location.hostname.endsWith(".github.io")) {
    try {
      const response = await fetch(`/api/polls?since=${encodeURIComponent(since)}`, { cache: "no-store" });
      const data = await jsonBody<PollRefreshResponse>(response);
      if (!response.ok || data.status === "error") throw new Error(data.message ?? `Polling service returned HTTP ${response.status}.`);
      return data;
    } catch {
      // Continue to the browser-safe MediaWiki endpoint below.
    }
  }

  // MediaWiki explicitly permits unauthenticated cross-origin API requests
  // with origin=*. This is also the primary refresh path on GitHub Pages.
  try {
    const response = await fetch(MEDIAWIKI_POLL_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}.`);
    const payload = await jsonBody<unknown>(response);
    const html = mediaWikiHtmlFromJson(payload);
    return buildPollRefreshPayload(html, since);
  } catch {
    throw new Error("Live Wikipedia data could not be reached. The embedded model is unchanged; please try again.");
  }
}

function automaticTally(results: Record<District, DistrictResult>, diasporaHdz: number) {
  const totals: Record<string, number> = {};
  DISTRICTS.forEach((district) => {
    results[district].autoSeats.forEach((name) => { totals[name] = (totals[name] ?? 0) + 1; });
  });
  if (diasporaHdz > 0) {
    const hdzName = Object.keys(results.I.lists).find((name) => listParts(name).includes("HDZ")) ?? "HDZ";
    totals[hdzName] = (totals[hdzName] ?? 0) + diasporaHdz;
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function governmentMath(tally: [string, number][], minorityLeft: number) {
  let core = 0;
  let broad = 0;
  tally.forEach(([name, seats]) => {
    const parts = listParts(name);
    const isCore = parts.includes("SDP") || parts.includes("Mozemo");
    if (isCore) core += seats;
    if (isCore || parts.some((party) => BROAD_LEFT.has(party))) broad += seats;
  });
  return { core, broad: broad + minorityLeft };
}

function PollRefreshPanel({ state, language, onClose }: { state: RefreshState; language: Language; onClose: () => void }) {
  if (state.phase === "idle") return null;
  const t = (hr: string, de: string, en?: string) => translate(language, hr, de, en);
  const result = state.result;
  const impact = state.impact;
  const isChange = state.phase === "updated" || state.phase === "revised";
  return (
    <div className={`refresh-panel ${state.phase}`} role="status" aria-live="polite">
      <button type="button" className="refresh-close" aria-label={t("Zatvori obavijest o anketama", "Umfragehinweis schließen")} onClick={onClose}>×</button>
      {state.phase === "loading" && (
        <div className="refresh-loading"><span /><div><strong>{t("Provjera Wikipedije", "Wikipedia wird geprüft")}</strong><p>{t("Učitavanje aktualne tablice anketa…", "Die aktuelle Umfragetabelle wird gelesen…")}</p></div></div>
      )}
      {state.phase === "error" && (
        <>
          <p className="refresh-kicker">{t("Ažuriranje nije dostupno", "Aktualisierung nicht verfügbar")}</p>
          <h3>{t("Tablicu anketa nije moguće učitati", "Die Umfragetabelle konnte nicht gelesen werden")}</h3>
          <p>{t("Wikipedia nije vratila upotrebljive podatke. Ugrađeni model nije promijenjen; pokušajte ponovno.", "Wikipedia hat keine verwendbaren Daten geliefert. Das eingebettete Modell bleibt unverändert; bitte versuchen Sie es erneut.")}</p>
        </>
      )}
      {state.phase === "current" && (
        <>
          <p className="refresh-kicker">{t("Wikipedia je provjerena", "Wikipedia wurde geprüft")}</p>
          <h3>{t("Nema novih anketa", "Keine neuen Umfragedaten")}</h3>
          <p>{t("Najnovija anketa ostaje od", "Die neueste Umfrage bleibt vom")} {result?.latestDate ? formatDate(result.latestDate, language) : t("trenutačno ugrađenog prosjeka", "aktuell eingebetteten Durchschnitt")}. {t("Vrijednosti modela nisu promijenjene.", "Die Modellwerte wurden nicht verändert.")}</p>
          <div className="refresh-current"><span>{t("Nove ankete", "Neue Umfragen")}</span><strong>0</strong><em>{t("Model je aktualan", "Modell ist aktuell")}</em></div>
        </>
      )}
      {isChange && result && impact && (
        <>
          <p className="refresh-kicker">{t("Primijenjeni su novi podaci", "Neue Daten wurden übernommen")}</p>
          <h3>{state.phase === "updated" ? t(`Dodano anketa: ${result.newPollCount ?? 0}`, `${result.newPollCount ?? 0} neue Umfrage${result.newPollCount === 1 ? "" : "n"} hinzugefügt`, `${result.newPollCount ?? 0} new poll${result.newPollCount === 1 ? "" : "s"} added`) : t("Objavljeni rezultati su izmijenjeni", "Veröffentlichte Werte wurden revidiert")}</h3>
          <p>{t("Model sada koristi deset najnovijih anketa s Wikipedije do", "Das Modell verwendet jetzt die zehn neuesten Wikipedia-Umfragen bis")} {result.latestDate ? formatDate(result.latestDate, language) : t("danas", "heute")}.</p>
          {!!result.newPolls?.length && (
            <div className="new-poll-list">
              {result.newPolls.slice(0, 3).map((poll) => <span key={`${poll.date}-${poll.firm}`}><b>{formatDate(poll.date, language)}</b>{poll.firm} · n={poll.n.toLocaleString(localeOf(language))}</span>)}
            </div>
          )}
          <div className="impact-block">
            <h4>{t("Ukupna promjena glasova", "Gesamte Stimmenveränderung")}</h4>
            <div className="share-impact">
              {impact.shares.map((change) => (
                <span key={change.party}><i style={{ background: colorOf(change.party) }} />{otherLabel(formatList(change.party), language)} <b className={change.delta >= 0 ? "up" : "down"}>{change.delta >= 0 ? "+" : ""}{formatNumber(change.delta, language, 1)}</b></span>
              ))}
            </div>
          </div>
          <div className="impact-block">
            <h4>{t("Promjena projekcije mandata", "Veränderung der Sitzprojektion")}</h4>
            {impact.seats.length ? (
              <div className="seat-impact">{impact.seats.slice(0, 6).map((change) => <span key={change.name}>{formatList(change.name)} <b className={change.delta > 0 ? "up" : "down"}>{change.delta > 0 ? "+" : ""}{change.delta}</b></span>)}</div>
            ) : <p className="no-seat-change">{t("Raspodjela mandata u izbornim jedinicama nije se promijenila.", "Die Sitzverteilung in den Wahlkreisen hat sich nicht verändert.")}</p>}
            <div className="government-impact">
              <span>{t("Jezgra SDP–Možemo", "Kern SDP–Možemo")} <b>{impact.coreBefore} → {impact.coreAfter}</b></span>
              <span>{t("Širi put do većine", "Breiter Mehrheitsweg")} <b>{impact.broadBefore} → {impact.broadAfter}</b></span>
            </div>
          </div>
        </>
      )}
      {state.phase !== "loading" && (
        <a className="refresh-source" href={result?.sourceUrl ?? "https://en.wikipedia.org/wiki/Next_Croatian_parliamentary_election"} target="_blank" rel="noreferrer">{t("Otvori izvorni članak ↗", "Quellartikel öffnen ↗")}</a>
      )}
    </div>
  );
}

function PollRange({ party, value, baselineValue, language, onChange }: { party: Party; value: number; baselineValue: number; language: Language; onChange: (value: number) => void }) {
  const [baseMin, baseMax, step] = RANGES[party];
  const min = Math.min(baseMin, baselineValue), max = Math.max(baseMax, baselineValue);
  const progress = (value - min) / (max - min) * 100;
  return (
    <label className="poll-range">
      <span className="range-name"><i style={{ background: colorOf(party) }} />{otherLabel(formatList(party), language)}<output>{formatNumber(value, language, 1)}%</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-accent": colorOf(party), "--range-fill": `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <small>{formatNumber(min, language, min < 1 ? 1 : 0)}–{formatNumber(max, language, max < 2 ? 1 : 0)}% {translate(language, "raspon scenarija", "Szenariobereich")}</small>
    </label>
  );
}

function LeverRange({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  description,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  description: string;
  onChange: (value: number) => void;
}) {
  const progress = (value - min) / (max - min) * 100;
  return (
    <label className="lever-range">
      <span>{label}<output>{display}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-fill": `${progress}%`, "--range-accent": "#1769c2" } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <small>{description}</small>
    </label>
  );
}

function raisedMozemoRaw(scenario: Scenario, target: number) {
  const raised = { ...scenario.raw };
  const delta = target - raised.Mozemo;
  raised.Mozemo = target;
  raised.Other = Math.max(0, raised.Other - delta);
  if (delta > 0 && raised.Other === 0) {
    const decidedPool = 100 - scenario.undecided;
    const total = PARTIES.reduce((sum, party) => sum + raised[party], 0);
    const over = total - decidedPool;
    if (over > 0) {
      const pool = PARTIES.filter((party) => party !== "Mozemo" && party !== "Other").reduce((sum, party) => sum + raised[party], 0);
      if (pool > 0) {
        PARTIES.forEach((party) => {
          if (party !== "Mozemo" && party !== "Other") raised[party] -= over * raised[party] / pool;
        });
      }
    }
  }
  return raised;
}

const MAJOR_PARTIES: Party[] = ["HDZ", "SDP", "Mozemo", "Most", "DP"];
const SMALLER_PARTIES = PARTIES.filter((party) => !MAJOR_PARTIES.includes(party));

export default function Home() {
  const [language, setLanguage] = useState<Language>("hr");
  const [baseline, setBaseline] = useState<ActiveBaselineKey>("weighted");
  const [polls, setPolls] = useState<Poll[]>(POLL_HISTORY);
  const [view, setView] = useState<"workspace" | "polls" | "assumptions">("workspace");
  const sources = useMemo(() => baselinesFromPolls(polls), [polls]);
  const [dataThrough, setDataThrough] = useState(POLLING_THROUGH);
  const [refreshState, setRefreshState] = useState<RefreshState>({ phase: "idle" });
  const [mode, setMode] = useState<Mode>("polls");
  const [raw, setRaw] = useState<VoteMap>(() => ({ ...BASELINES.weighted.vals }));
  const [undecided, setUndecided] = useState(BASELINES.weighted.und);
  const [undecidedTurnout, setUndecidedTurnout] = useState(85);
  const [undecidedTilt, setUndecidedTilt] = useState(0);
  const [localPersistence, setLocalPersistence] = useState(65);
  const [diasporaHdz, setDiasporaHdz] = useState(3);
  const [minorityLeft, setMinorityLeft] = useState(4);
  const [coalitions, setCoalitions] = useState<CoalitionGroups>(DEFAULT_COALITIONS);
  const [mergeHdzRight, setMergeHdzRight] = useState(false);
  const [coalitionLoss, setCoalitionLoss] = useState<CoalitionLoss>({});
  const [selected, setSelected] = useState<District>("I");
  const [manual, setManual] = useState<Partial<Record<District, string[]>>>({});
  const [manualTarget, setManualTarget] = useState("");
  const t = (hr: string, de: string, en?: string) => translate(language, hr, de, en);

  useEffect(() => {
    const saved = window.localStorage.getItem("croatia-seat-tracker-language");
    if (saved === "hr" || saved === "de" || saved === "en") setLanguage(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === "hr" ? "Hrvatski izborni model" : language === "de" ? "Kroatischer Wahlrechner" : "Croatia Election Seat Tracker";
    window.localStorage.setItem("croatia-seat-tracker-language", language);
  }, [language]);

  const scenario = useMemo<Scenario>(() => ({
    mode, raw, undecided, undecidedTurnout, undecidedTilt, localPersistence,
    diasporaHdz, minorityLeft, coalitions, mergeHdzRight, coalitionLoss,
  }), [mode, raw, undecided, undecidedTurnout, undecidedTilt, localPersistence, diasporaHdz, minorityLeft, coalitions, mergeHdzRight, coalitionLoss]);

  const national = useMemo(() => effectiveNational(scenario), [scenario]);
  const results = useMemo(() => Object.fromEntries(DISTRICTS.map((district) => [district, resultForDistrict(district, scenario)])) as Record<District, DistrictResult>, [scenario]);
  const selectedResult = results[selected];
  const selectedSeats = manual[selected] ?? selectedResult.autoSeats;
  const eligibleTargets = selectedResult.sorted.map(([name]) => name);
  const activeManualTarget = eligibleTargets.includes(manualTarget) ? manualTarget : eligibleTargets[0] ?? selectedResult.winner[0];

  const tally = useMemo(() => {
    const totals: Record<string, number> = {};
    DISTRICTS.forEach((district) => {
      const seats = manual[district] ?? results[district].autoSeats;
      seats.forEach((name) => { totals[name] = (totals[name] ?? 0) + 1; });
    });
    if (diasporaHdz > 0) {
      const hdzName = Object.keys(results.I.lists).find((name) => listParts(name).includes("HDZ")) ?? "HDZ";
      totals[hdzName] = (totals[hdzName] ?? 0) + diasporaHdz;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [diasporaHdz, manual, results]);

  const { coreLeft, broadLeft } = useMemo(() => {
    let core = 0;
    let broad = 0;
    tally.forEach(([name, seats]) => {
      const parts = listParts(name);
      const isCore = parts.includes("SDP") || parts.includes("Mozemo");
      if (isCore) core += seats;
      if (isCore || parts.some((party) => BROAD_LEFT.has(party))) broad += seats;
    });
    return { coreLeft: core, broadLeft: broad + minorityLeft };
  }, [minorityLeft, tally]);

  const coalitionComparison = useMemo(() => {
    const coreFor = (comparisonResults: Record<District, DistrictResult>) => (
      governmentMath(automaticTally(comparisonResults, 0), 0).core
    );
    const buildResults = (comparisonScenario: Scenario) => Object.fromEntries(
      DISTRICTS.map((district) => [district, resultForDistrict(district, comparisonScenario)]),
    ) as Record<District, DistrictResult>;
    const separate = coreFor(buildResults({ ...scenario, mode: "polls" }));
    const current = coreFor(results);

    if (mode === "left") {
      return { separate, current, ownGain: current - separate, opponentEffect: 0 };
    }
    if (mode === "likely") {
      const leftOnly = coreFor(buildResults({
        ...scenario,
        mode: "user",
        coalitions: { left: LIKELY_COALITIONS.left, hdz: [], right: [] },
        mergeHdzRight: false,
      }));
      return {
        separate,
        current,
        ownGain: leftOnly - separate,
        opponentEffect: current - leftOnly,
      };
    }
    return { separate, current, ownGain: 0, opponentEffect: 0 };
  }, [mode, results, scenario]);

  const leftCoalitionEffect = useMemo(() => {
    if (mode !== "user" || coalitions.left.length === 0) return null;
    const members = ["SDP", ...coalitions.left] as Party[];
    const memberSet = new Set<Party>(members);
    const separateScenario: Scenario = {
      ...scenario,
      coalitions: { ...coalitions, left: [] },
    };
    const separateResults = Object.fromEntries(
      DISTRICTS.map((district) => [district, resultForDistrict(district, separateScenario)]),
    ) as Record<District, DistrictResult>;
    const seatsForMembers = (scenarioTally: [string, number][]) => scenarioTally.reduce((sum, [name, seats]) => (
      listParts(name).some((party) => memberSet.has(party)) ? sum + seats : sum
    ), 0);
    const before = seatsForMembers(automaticTally(separateResults, 0));
    const after = seatsForMembers(automaticTally(results, 0));
    return { members, before, after, delta: after - before };
  }, [coalitions, mode, results, scenario]);

  const breakpoints = useMemo(() => DISTRICTS.map((district) => {
    const currentName = Object.keys(results[district].lists).find((name) => listParts(name).includes("Mozemo"));
    if (!currentName || listParts(currentName).length > 1) {
      return { district, joint: true, now: 0, next: null as number | null, raw: null as number | null, effective: null as number | null };
    }
    const nowSeats = results[district].autoTally[currentName] ?? 0;
    for (let target = scenario.raw.Mozemo; target <= 20; target += 0.05) {
      const raised = raisedMozemoRaw(scenario, target);
      const lists = districtLists(district, scenario, raised);
      const name = Object.keys(lists).find((listName) => listParts(listName).includes("Mozemo"));
      if (!name) continue;
      const seats = dHondt(lists)[name] ?? 0;
      if (seats > nowSeats) {
        return { district, joint: false, now: nowSeats, next: seats, raw: target, effective: effectiveNational(scenario, raised).Mozemo };
      }
    }
    return { district, joint: false, now: nowSeats, next: null, raw: null, effective: null };
  }), [results, scenario]);

  const sourceBaseline = sources[baseline] ?? sources.weighted;
  const activeBaselineLabel = baseline === "weighted"
    ? t("ponderirani prosjek", "gewichteten Durchschnitt")
    : sourceBaseline.polls[0]?.firm ?? sourceBaseline.label;
  const hasAdjustments = PARTIES.some(party => Math.abs(raw[party] - sourceBaseline.vals[party]) > 0.00001);

  const chooseBaseline = (key: ActiveBaselineKey) => {
    const next = sources[key];
    if (!next) return;
    setBaseline(key);
    setRaw({ ...next.vals });
    setUndecided(next.und);
    setManual({});
  };

  const chooseMode = (next: Mode) => {
    if (next === "user" && mode !== "user") setCoalitions(scenarioCoalitions(scenario));
    if (next !== "user") setMergeHdzRight(false);
    setMode(next);
    setManual({});
  };

  const changeRaw = (party: Party, value: number) => {
    setRaw((current) => ({ ...current, [party]: value }));
    setManual({});
  };

  const toggleCoalition = (group: keyof CoalitionGroups, party: Party) => {
    const current = scenarioCoalitions(scenario);
    const selectedParties = current[group];
    const next = selectedParties.includes(party) ? selectedParties.filter(item => item !== party) : [...selectedParties, party];
    setCoalitions({ ...current, [group]: next });
    setMode("user");
    setManual({});
  };

  const updateLoss = (members: Party[], value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(50, value)) : 0;
    setCoalitionLoss(current => ({ ...current, ...Object.fromEntries(members.map(party => [party, safe])) }));
    setManual({});
  };

  const mergeRight = (value: boolean) => {
    setCoalitions(scenarioCoalitions(scenario));
    setMode("user");
    setMergeHdzRight(value);
    setManual({});
  };

  const refreshPolls = async () => {
    setRefreshState({ phase: "loading" });
    try {
      const data = await requestPollRefresh(dataThrough);
      if (data.status === "error") {
        setRefreshState({ phase: "error", result: data });
        return;
      }
      if (data.polls?.length) setPolls(data.polls);
      if (data.latestDate) setDataThrough(data.latestDate);
      if (data.status === "current" || !data.polls?.length) {
        setRefreshState({ phase: "current", result: data });
        return;
      }

      const nextSources = baselinesFromPolls(data.polls);
      const nextFresh = nextSources[baseline] ?? nextSources.weighted;
      const nextRaw = { ...nextFresh.vals };
      const nextScenario: Scenario = { ...scenario, raw: nextRaw, undecided: nextFresh.und };
      const nextResults = Object.fromEntries(DISTRICTS.map((district) => [district, resultForDistrict(district, nextScenario)])) as Record<District, DistrictResult>;
      const beforeTally = automaticTally(results, diasporaHdz);
      const afterTally = automaticTally(nextResults, diasporaHdz);
      const beforeGovernment = governmentMath(beforeTally, minorityLeft);
      const afterGovernment = governmentMath(afterTally, minorityLeft);
      const beforeNational = effectiveNational(scenario);
      const afterNational = effectiveNational(nextScenario);
      const beforeSeats = new Map(beforeTally);
      const afterSeats = new Map(afterTally);
      const seatNames = new Set([...beforeSeats.keys(), ...afterSeats.keys()]);
      const seatChanges = Array.from(seatNames, (name) => ({
        name,
        before: beforeSeats.get(name) ?? 0,
        after: afterSeats.get(name) ?? 0,
        delta: (afterSeats.get(name) ?? 0) - (beforeSeats.get(name) ?? 0),
      })).filter((change) => change.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      const shareChanges = MAJOR_PARTIES.map((party) => ({
        party,
        before: beforeNational[party],
        after: afterNational[party],
        delta: afterNational[party] - beforeNational[party],
      })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      setRaw(nextRaw);
      setUndecided(nextFresh.und);
      setDataThrough(data.latestDate ?? dataThrough);
      setManual({});
      setRefreshState({
        phase: data.status,
        result: data,
        impact: {
          shares: shareChanges,
          seats: seatChanges,
          coreBefore: beforeGovernment.core,
          coreAfter: afterGovernment.core,
          broadBefore: beforeGovernment.broad,
          broadAfter: afterGovernment.broad,
        },
      });
    } catch (error) {
      setRefreshState({
        phase: "error",
        result: { status: "error", sourceUrl: POLL_SOURCE_URL, message: error instanceof Error ? error.message : "The polling refresh failed." },
      });
    }
  };

  const resetScenario = () => {
    setBaseline("weighted");
    setDataThrough(polls[0]?.date ?? POLLING_THROUGH);
    setMode("polls");
    setRaw({ ...sources.weighted.vals });
    setUndecided(sources.weighted.und);
    setCoalitionLoss({});
    setUndecidedTurnout(85);
    setUndecidedTilt(0);
    setLocalPersistence(65);
    setDiasporaHdz(3);
    setMinorityLeft(4);
    setCoalitions(DEFAULT_COALITIONS);
    setMergeHdzRight(false);
    setSelected("I");
    setManual({});
    setRefreshState({ phase: "idle" });
  };

  const reassignSeat = (index: number) => {
    if (!activeManualTarget) return;
    setManual((current) => {
      const seats = [...(current[selected] ?? selectedResult.autoSeats)];
      seats[index] = activeManualTarget;
      return { ...current, [selected]: seats };
    });
  };

  const resetDistrict = () => {
    setManual((current) => {
      const next = { ...current };
      delete next[selected];
      return next;
    });
  };

  const modeDescription = mode === "polls"
    ? t("Svaka lista izlazi samostalno. Ovo je osnovica za usporedbu.", "Jede Liste tritt eigenständig an. Dies ist die Vergleichsbasis.")
    : mode === "left"
      ? t("Spajaju se samo SDP i Možemo; sve ostale liste ostaju odvojene.", "Nur SDP und Možemo schließen sich zusammen; alle anderen Listen bleiben getrennt.")
      : mode === "likely"
        ? t("Istodobno se spaja više blokova: SDP + Možemo + Centar; HDZ + HNS + HSU + HSS; te DP + DOMiNO + PiP + HS + HSP. Most i IDS ostaju odvojeni.", "Mehrere Blöcke schließen sich gleichzeitig zusammen: SDP + Možemo + Centar; HDZ + HNS + HSU + HSS; sowie DP + DOMiNO + PiP + HS + HSP. Most und IDS bleiben getrennt.")
        : t("Spajaju se samo ideološki usklađene kombinacije odabrane u nastavku.", "Nur die unten ausgewählten ideologisch stimmigen Kombinationen werden zusammengeführt.");

  const coreMetricLabel = mode === "polls" ? t("SDP + Možemo ukupno", "SDP + Možemo gesamt") : t("Liste SDP-a / Možemo", "Listen von SDP / Možemo");
  const netCoalitionEffect = coalitionComparison.current - coalitionComparison.separate;
  const coreMetricDetail = mode === "polls"
    ? t("osnovica s odvojenim listama", "Basis mit getrennten Listen")
    : mode === "left"
      ? t(`${coalitionComparison.ownGain >= 0 ? "+" : ""}${coalitionComparison.ownGain} u odnosu na odvojeni nastup istih stranaka`, `${coalitionComparison.ownGain >= 0 ? "+" : ""}${coalitionComparison.ownGain} gegenüber getrenntem Antreten derselben Parteien`, `${coalitionComparison.ownGain >= 0 ? "+" : ""}${coalitionComparison.ownGain} vs the same parties running separately`)
      : mode === "likely"
        ? t(`${netCoalitionEffect >= 0 ? "+" : ""}${netCoalitionEffect} neto · spajanje ljevice ${coalitionComparison.ownGain >= 0 ? "+" : ""}${coalitionComparison.ownGain} · ostala spajanja ${coalitionComparison.opponentEffect >= 0 ? "+" : ""}${coalitionComparison.opponentEffect}`, `${netCoalitionEffect >= 0 ? "+" : ""}${netCoalitionEffect} netto · Zusammenschluss links ${coalitionComparison.ownGain >= 0 ? "+" : ""}${coalitionComparison.ownGain} · andere Zusammenschlüsse ${coalitionComparison.opponentEffect >= 0 ? "+" : ""}${coalitionComparison.opponentEffect}`, `${netCoalitionEffect >= 0 ? "+" : ""}${netCoalitionEffect} net · left merger ${coalitionComparison.ownGain >= 0 ? "+" : ""}${coalitionComparison.ownGain} · other mergers ${coalitionComparison.opponentEffect >= 0 ? "+" : ""}${coalitionComparison.opponentEffect}`)
        : leftCoalitionEffect
          ? t(`${leftCoalitionEffect.delta >= 0 ? "+" : ""}${leftCoalitionEffect.delta} zbog odabrane zajedničke liste predvođene SDP-om`, `${leftCoalitionEffect.delta >= 0 ? "+" : ""}${leftCoalitionEffect.delta} durch die ausgewählte gemeinsame SDP-Liste`, `${leftCoalitionEffect.delta >= 0 ? "+" : ""}${leftCoalitionEffect.delta} from the selected SDP-led joint list`)
          : t("prilagođena konfiguracija", "benutzerdefinierte Konfiguration");

  return (
    <main>
      <header className="site-header" id="top">
        <div className="brand-row">
          <a className="brand" href="#top"><CroatianFlag language={language} /><span>{t("Hrvatski", "Kroatischer")} <b>{t("izborni model", "Wahlrechner")}</b></span></a>
          <div className="refresh-block">
            <label className="language-selector"><span>{t("Jezik", "Sprache")}</span><select value={language} onChange={event=>setLanguage(event.target.value as Language)} aria-label={t("Odabir jezika", "Sprache auswählen")}><option value="hr">Hrvatski</option><option value="de">Deutsch</option><option value="en">English</option></select></label>
            <span className="header-meta">{t("Ankete do", "Umfragen bis")} {formatDate(dataThrough, language)}</span>
            <button type="button" className="refresh-button" onClick={refreshPolls} disabled={refreshState.phase === "loading"}>{refreshState.phase === "loading" ? t("Provjera…", "Prüfung…") : t("↻ Provjeri nove ankete", "↻ Neue Umfragen prüfen")}</button>
            <PollRefreshPanel state={refreshState} language={language} onClose={() => setRefreshState({ phase: "idle" })} />
          </div>
        </div>
        <div className="scenario-toolbar">
          <label><span>{t("Izvor anketa", "Umfragequelle")}</span><select value={baseline} onChange={event => chooseBaseline(event.target.value as ActiveBaselineKey)}>
            <option value="weighted">{t("Ponderirani prosjek · zadnjih 10 anketa", "Gewichteter Durchschnitt · letzte 10 Umfragen")}</option>
            {sources.ipsos && <option value="ipsos">{t("Najnoviji Ipsos", "Neueste Ipsos-Umfrage")}</option>}
            {sources.promocija && <option value="promocija">{t("Najnovija Promocija Plus", "Neueste Promocija-Plus-Umfrage")}</option>}
          </select></label>
          <fieldset><legend>{t("Predizborne liste", "Wahllisten vor der Wahl")}</legend><div className="segmented">
            <button type="button" aria-pressed={mode === "polls"} onClick={() => chooseMode("polls")} className={mode === "polls" ? "active" : ""}>{t("Odvojeno", "Getrennt")}</button>
            <button type="button" aria-pressed={mode === "left"} onClick={() => chooseMode("left")} className={mode === "left" ? "active" : ""}>SDP + Možemo</button>
            <button type="button" aria-pressed={mode === "likely"} onClick={() => chooseMode("likely")} className={mode === "likely" ? "active" : ""}>{t("Vjerojatni blokovi", "Wahrscheinliche Blöcke")}</button>
            <button type="button" aria-pressed={mode === "user"} onClick={() => chooseMode("user")} className={mode === "user" ? "active" : ""}>{t("Prilagođeno", "Benutzerdefiniert")}</button>
          </div></fieldset>
          <button className="reset-button" type="button" onClick={resetScenario}>{t("Poništi scenarij", "Szenario zurücksetzen")}</button>
        </div>
      </header>
      <nav className="view-navigation" aria-label={t("Prikazi izbornog modela", "Ansichten des Wahlrechners")}>{([ ["workspace", t("Mandati i koalicije", "Sitze und Koalitionen")], ["polls", t("Ankete i trendovi", "Umfragen und Trends")], ["assumptions", t("Model i prilagodbe", "Modell und Anpassungen")] ] as const).map(([key,title]) => <button type="button" key={key} aria-current={view===key?"page":undefined} className={view===key?"active":""} onClick={()=>setView(key)}>{title}</button>)}<span className="model-status">{hasAdjustments?t("Udio stranaka prilagođen", "Parteianteile angepasst"):t("Izvorni udjeli nisu promijenjeni", "Quellanteile unverändert")} · {t("prag 5%", "5-%-Hürde")}</span></nav>
      <div className="page-shell">
        {view === "workspace" && <>
          <ElectionWorkspace language={language} scenario={scenario} results={results} selected={selected} selectedSeats={selectedSeats} tally={tally} coreLeft={coreLeft} broadLeft={broadLeft} coreLabel={coreMetricLabel} onSelect={setSelected} onToggleCoalition={toggleCoalition} onMergeRight={mergeRight} onLoss={updateLoss} manual={!!manual[selected]} manualTarget={activeManualTarget} onTarget={setManualTarget} onReassign={reassignSeat} onResetDistrict={resetDistrict} />
          <div className="scenario-caption"><span>{modeDescription}</span><strong>{coreMetricDetail}</strong></div>
        </>}
        {view === "polls" && <PollEvidence language={language} polls={polls} baseline={baseline} onBaseline={chooseBaseline} raw={raw} national={national} hasAdjustments={hasAdjustments} />}
        {view === "assumptions" && <>
        <section className="scenario-section" id="scenario-lab" aria-labelledby="scenario-title">
          <div className="scenario-title-row">
            <div>
              <p className="section-kicker">{t("Laboratorij scenarija", "Szenario-Labor")}</p>
              <h2 id="scenario-title">{t("Testirajte rezultat", "Ergebnis testen")}</h2>
              <p>{t("Prilagodite neodlučne birače, regionalnu postojanost i moguće koalicije. Svaka promjena ponovno izračunava svih deset izbornih jedinica.", "Passen Sie unentschlossene Wähler, regionale Beständigkeit und mögliche Koalitionen an. Jede Änderung berechnet alle zehn Wahlkreise neu.")}</p>
            </div>
            <span>{t("Ručne promjene mandata poništavaju se pri promjeni modela.", "Manuelle Sitzänderungen werden bei einer Modelländerung zurückgesetzt.")}</span>
          </div>

          <div className="lab-grid">
            <article className="card levers-card">
              <div className="card-heading compact">
                <div><p className="section-kicker">{t("Poluge modela", "Modellregler")}</p><h2>{t("Izlaznost i posebni mandati", "Wahlbeteiligung und besondere Sitze")}</h2></div>
                <span className="baseline-chip">{formatNumber(undecided, language, 1)}% {t("neodlučnih", "unentschlossen")}</span>
              </div>
              <div className="lever-grid">
                <LeverRange
                  label={t("Neodlučni koji će glasati", "Wählende Unentschlossene")}
                  value={undecidedTurnout}
                  min={50}
                  max={100}
                  display={`${undecidedTurnout}%`}
                  description={t("Udio trenutačno neodlučnih ispitanika za koje se pretpostavlja da će glasati.", "Anteil der derzeit Unentschlossenen, von denen angenommen wird, dass sie wählen.")}
                  onChange={(value) => { setUndecidedTurnout(value); setManual({}); }}
                />
                <LeverRange
                  label={t("Ideološki nagib neodlučnih", "Ideologische Neigung der Unentschlossenen")}
                  value={undecidedTilt}
                  min={-20}
                  max={20}
                  display={`${undecidedTilt > 0 ? "+" : ""}${undecidedTilt}`}
                  description={t("Negativno pogoduje desnim listama; pozitivno lijevim listama.", "Negative Werte begünstigen rechte, positive Werte linke Listen.")}
                  onChange={(value) => { setUndecidedTilt(value); setManual({}); }}
                />
                <LeverRange
                  label={t("Postojanost lokalnih lista", "Beständigkeit regionaler Listen")}
                  value={localPersistence}
                  min={20}
                  max={90}
                  display={`${localPersistence}%`}
                  description={t("Određuje koliko regionalna uporišta opstaju nakon novijih nacionalnih promjena.", "Bestimmt, wie stark regionale Hochburgen nach jüngsten landesweiten Veränderungen fortbestehen.")}
                  onChange={(value) => { setLocalPersistence(value); setManual({}); }}
                />
                <LeverRange
                  label={t("Mandati XI. jedinice listi HDZ-a", "Sitze des XI. Wahlkreises für die HDZ-Liste")}
                  value={diasporaHdz}
                  min={0}
                  max={3}
                  display={`${diasporaHdz}`}
                  description={t("Izričita pretpostavka za tri mandata dijaspore.", "Explizite Annahme für die drei Diaspora-Sitze.")}
                  onChange={(value) => { setDiasporaHdz(value); setManual({}); }}
                />
                <LeverRange
                  label={t("Manjinski zastupnici koji podržavaju ljevicu", "Minderheitenabgeordnete mit Unterstützung für links")}
                  value={minorityLeft}
                  min={0}
                  max={8}
                  display={`${minorityLeft}`}
                  description={t("Pretpostavka o potpori koristi se samo u širem izračunu većine.", "Diese Unterstützungsannahme wird nur für die breitere Mehrheitsrechnung verwendet.")}
                  onChange={(value) => { setMinorityLeft(value); setManual({}); }}
                />
              </div>
            </article>

          </div>

          <article className="card polling-card">
            <div className="polling-heading">
              <div>
                <p className="section-kicker">{t("Nacionalne anketne postavke", "Landesweite Umfragewerte")}</p>
                <h2>{t("Pomaknite stranke unutar nedavnih raspona", "Parteien innerhalb jüngster Bereiche verschieben")}</h2>
                <p>{t("Ovo su sirovi anketni udjeli. Model normalizira opredijeljene, raspoređuje neodlučne koji glasaju i zatim primjenjuje profile izbornih jedinica.", "Dies sind rohe Umfrageanteile. Das Modell normiert die Entschiedenen, verteilt wählende Unentschlossene und wendet anschließend die Wahlkreisprofile an.")}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => chooseBaseline(baseline)}>{t("Vrati", "Zurücksetzen auf")} {activeBaselineLabel}</button>
            </div>
            <div className="major-poll-grid">
              {MAJOR_PARTIES.map((party) => <PollRange key={party} party={party} value={raw[party]} baselineValue={sourceBaseline.vals[party]} language={language} onChange={(value) => changeRaw(party, value)} />)}
            </div>
            <details className="smaller-polls" open>
              <summary><span>{t("Manje i regionalne liste", "Kleinere und regionale Listen")}</span><em>{SMALLER_PARTIES.length} {t("prilagodljivih udjela", "anpassbare Anteile")}</em></summary>
              <div className="small-poll-grid">
                {SMALLER_PARTIES.map((party) => <PollRange key={party} party={party} value={raw[party]} baselineValue={sourceBaseline.vals[party]} language={language} onChange={(value) => changeRaw(party, value)} />)}
              </div>
            </details>
          </article>
        </section>

        <section className="analysis-grid" aria-label={t("Analiza graničnih mandata i bilješke o modelu", "Analyse knapper Sitze und Modellhinweise")}>
          <article className="card breakpoint-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">{t("Radar graničnih mandata", "Radar knapper Sitze")}</p>
                <h2>{t("Pragovi Možemo za sljedeći mandat", "Schwellen für den nächsten Možemo-Sitz")}</h2>
                <p>{t("Sirovi nacionalni udio potreban za sljedeći automatski mandat, uz ostale postavke scenarija nepromijenjene.", "Erforderlicher roher Landesanteil für den nächsten automatischen Sitz bei unverändertem restlichem Szenario.")}</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>{t("Jedinica", "Wahlkreis")}</th><th>{t("Sada", "Jetzt")}</th><th>{t("Sljedeći", "Nächster")}</th><th>{t("Sirovi nacionalni", "Roh landesweit")}</th><th>{t("Efektivni", "Effektiv")}</th></tr></thead>
                <tbody>
                  {breakpoints.map((point) => (
                    <tr key={point.district} className={point.district === selected ? "selected" : ""} onClick={() => setSelected(point.district)}>
                      <th>{point.district}</th>
                      {point.joint ? (
                        <td colSpan={4}><span className="joint-note">{t("Možemo je na zajedničkoj listi", "Možemo tritt auf einer gemeinsamen Liste an")}</span></td>
                      ) : (
                        <>
                          <td>{point.now}</td>
                          <td>{point.next ?? "—"}</td>
                          <td>{point.raw == null ? ">20%" : `${formatNumber(point.raw, language, 1)}%`}</td>
                          <td>{point.effective == null ? "—" : `${formatNumber(point.effective, language, 1)}%`}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card methodology-card">
            <div className="card-heading">
              <div><p className="section-kicker">{t("Kako čitati model", "Modell verstehen")}</p><h2>{t("Metoda i ograničenja", "Methode und Grenzen")}</h2></div>
            </div>
            <ol>
              <li><span>01</span><div><strong>{t("Prosjek anketa", "Umfragedurchschnitt")}</strong><p>{t(`${sources.weighted.polls.length} najnovijih anketa, ponderiranih prema aktualnosti i kvadratnom korijenu veličine uzorka. U prikazu Ankete i trendovi vidljivi su svaki ulaz i njegov doprinos.`, `${sources.weighted.polls.length} neueste Umfragen, gewichtet nach Aktualität und Quadratwurzel der Stichprobengröße. Unter Umfragen und Trends sind jede Eingabe und ihr Beitrag sichtbar.`, `${sources.weighted.polls.length} most recent polls, weighted by recency and square-root sample size. See Polls & trends for each input and its contribution.`)}</p></div></li>
              <li><span>02</span><div><strong>{t("Prijenos na izborne jedinice", "Übertragung auf Wahlkreise")}</strong><p>{t("Nacionalni udjeli prilagođavaju se regionalnim multiplikatorima iz 2024. i ublaženim aktualnim uporištima NPS-a i Fokusa.", "Landesweite Anteile werden mit regionalen Multiplikatoren von 2024 und gedämpften aktuellen Hochburgen von NPS und Fokus angepasst.")}</p></div></li>
              <li><span>03</span><div><strong>{t("Raspodjela mandata", "Sitzverteilung")}</strong><p>{t("Svaka od jedinica I–X ima 14 mandata, prag od 5% u jedinici i d’Hondtovu raspodjelu.", "Jeder der Wahlkreise I–X hat 14 Sitze, eine 5-%-Hürde im Wahlkreis und eine d’Hondt-Verteilung.")}</p></div></li>
              <li><span>04</span><div><strong>{t("Posebni mandati", "Besondere Sitze")}</strong><p>{t("Mandati XI. jedinice za dijasporu i XII. jedinice za manjine ostaju vidljive korisničke pretpostavke.", "Die Diaspora-Sitze des XI. und die Minderheitensitze des XII. Wahlkreises bleiben transparente Benutzerannahmen.")}</p></div></li>
            </ol>
            <div className="model-warning"><strong>{t("Model scenarija, a ne prognoza.", "Szenariomodell, keine Prognose.")}</strong> {t("HSS se smatra mogućim partnerom HDZ-a; IDS se ne računa u lijevi put do većine. Kvaliteta kandidata, izlaznost, taktičko glasanje i poslijeizborni pregovori mogu bitno promijeniti rezultat.", "HSS gilt als möglicher HDZ-Partner; IDS wird nicht dem linken Mehrheitsweg zugerechnet. Kandidatenqualität, Wahlbeteiligung, taktisches Wählen und Verhandlungen nach der Wahl können das Ergebnis wesentlich verändern.")}</div>
          </article>
        </section>
        <PortraitCredits language={language} />
        </>}
      </div>
      <footer className="site-footer"><span>{t("Procjene scenarija · 140 mandata u jedinicama + 11 posebnih mandata", "Szenarioschätzungen · 140 Wahlkreissitze + 11 besondere Sitze")}</span><a href="https://www.linkedin.com/in/vedranbo/" target="_blank" rel="noreferrer">{t("izradio Vedran Bozicevic ↗", "erstellt von Vedran Bozicevic ↗")}</a></footer>
    </main>
  );
}
