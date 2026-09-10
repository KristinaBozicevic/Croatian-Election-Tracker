"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { DISTRICT_GEOMETRY, DISTRICT_MAP_VIEWBOX } from "./district-geometry";
import { DISTRICTS, activeCoalitionLists, colorOf, colorsOf, formatList, listParts, resultForDistrict, scenarioCoalitions, swatchBackground, type CoalitionGroups, type District, type DistrictResult, type Party, type Scenario } from "./model";
import { PartyPortraits } from "./party-portraits";
import { formatNumber, otherLabel, translate, type Language } from "./i18n";

export const COALITION_OPTIONS: { key: keyof CoalitionGroups; title: string; leader: Party; parties: Party[] }[] = [
  { key: "left", title: "SDP-led", leader: "SDP", parties: ["Mozemo", "Centar", "NPS", "Fokus"] },
  { key: "hdz", title: "HDZ-led", leader: "HDZ", parties: ["HNS", "HSU", "HSS", "IDS"] },
  { key: "right", title: "DP-led", leader: "DP", parties: ["DOMiNO", "PiP", "HS", "HSP", "Most"] },
];

function wheelGradient(entries: [string, number][], total: number) {
  let cursor = 0;
  return `conic-gradient(${entries.flatMap(([name, value]) => {
    const start = cursor / total * 100; cursor += value;
    return colorsOf(name).map((color, index, colors) => `${color} ${start + index / colors.length * value / total * 100}% ${start + (index + 1) / colors.length * value / total * 100}%`);
  }).join(", ")})`;
}

function zoomTransform(district: District) {
  const numbers = DISTRICT_GEOMETRY[district].path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const xs = numbers.filter((_, index) => index % 2 === 0);
  const ys = numbers.filter((_, index) => index % 2 === 1);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const scale = Math.min(5, 900 / (right - left), 800 / (bottom - top));
  return { scale, transform: `translate(512px, 500px) scale(${scale}) translate(${-(left + right) / 2}px, ${-(top + bottom) / 2}px)` };
}

function LossControl({ members, scenario, language, onLoss }: { members: Party[]; scenario: Scenario; language: Language; onLoss: (members: Party[], value: number) => void }) {
  const t = (hr: string, de: string, en?: string) => translate(language, hr, de, en);
  const rates = members.map((party) => scenario.coalitionLoss?.[party] ?? 0);
  const uniform = rates.every((rate) => rate === rates[0]);
  const average = rates.reduce((sum, value) => sum + value, 0) / rates.length;
  const id = `loss-${members.join("-")}`;
  return <div className="loss-control">
    <div className="loss-title"><label htmlFor={id}>{t("Negativna sinergija", "Negative Synergie")}</label><span>{uniform ? `${rates[0]}% ${t("gubitka birača", "Wählerverlust")}` : t("Stope po strankama", "Raten je Partei")}</span></div>
    <input id={id} type="range" min="0" max="50" step="1" value={average} aria-valuetext={uniform ? t(`${rates[0]} posto birača koalicije apstinira`, `${rates[0]} Prozent der Koalitionswähler enthalten sich`, `${rates[0]} percent of coalition voters abstain`) : t("Različite stope po strankama; pomicanje izjednačava stope svih članica", "Unterschiedliche Raten je Partei; eine Änderung setzt alle Mitglieder auf denselben Wert")} onChange={(event) => onLoss(members, Number(event.target.value))} />
    <details className="party-loss-details">
      <summary>{t("Postavi gubitak po stranci", "Verlust je Partei einstellen")}</summary>
      <div>{members.map((party) => <label key={party}><span>{otherLabel(formatList(party), language)}</span><input type="number" min="0" max="50" step="1" value={scenario.coalitionLoss?.[party] ?? 0} onChange={(event) => onLoss([party], Number(event.target.value))} aria-label={t(`${formatList(party)}, izgubljeni birači u postocima`, `${formatList(party)}, verlorene Wähler in Prozent`, `${formatList(party)} voters lost, percent`)} /><span>%</span></label>)}</div>
    </details>
  </div>;
}

export function ElectionWorkspace({ language, scenario, results, selected, selectedSeats, tally, coreLeft, broadLeft, coreLabel, onSelect, onToggleCoalition, onMergeRight, onLoss, manual, manualTarget, onTarget, onReassign, onResetDistrict }: {
  language: Language;
  scenario: Scenario; results: Record<District, DistrictResult>; selected: District; selectedSeats: string[]; tally: [string, number][]; coreLeft: number; broadLeft: number; coreLabel: string;
  onSelect: (district: District) => void; onToggleCoalition: (group: keyof CoalitionGroups, party: Party) => void; onMergeRight: (value: boolean) => void; onLoss: (members: Party[], value: number) => void;
  manual: boolean; manualTarget: string; onTarget: (name: string) => void; onReassign: (index: number) => void; onResetDistrict: () => void;
}) {
  const t = (hr: string, de: string, en?: string) => translate(language, hr, de, en);
  const [zoomed, setZoomed] = useState(false);
  const [seatView, setSeatView] = useState<"district" | "national">("district");
  const result = results[selected];
  const groups = scenarioCoalitions(scenario);
  const selectedTally = Object.entries(selectedSeats.reduce<Record<string, number>>((counts, name) => ({ ...counts, [name]: (counts[name] ?? 0) + 1 }), {})).sort((a,b)=>b[1]-a[1]);
  const zoom = zoomTransform(selected);
  const select = (district: District) => { onSelect(district); setZoomed(true); setSeatView("district"); };
  const coalitionLists = activeCoalitionLists(scenario).filter(({members})=>members.length>1);
  const lossEffects = useMemo(() => coalitionLists.map(({key,members}) => {
    const noLoss = { ...scenario.coalitionLoss };
    members.forEach(party => { noLoss[party] = 0; });
    const count = (districtResults: DistrictResult[]) => districtResults.reduce((sum, item) => sum + item.autoSeats.filter(name => listParts(name).some(party=>members.includes(party))).length, 0);
    return { key, before: count(DISTRICTS.map(d=>resultForDistrict(d,{...scenario,coalitionLoss:noLoss}))), after: count(DISTRICTS.map(d=>results[d])) };
  }), [scenario, results]);

  const lossSummary = (key: string) => {
    const impact = lossEffects.find(item=>item.key===key);
    return impact ? <p className="loss-impact">{t("Bez gubitka", "Ohne Verlust")} <b>{impact.before}</b> → {t("s gubitkom", "mit Verlust")} <b>{impact.after}</b> {t("mandata u jedinicama", "Wahlkreissitze")}</p> : null;
  };

  return <div className="election-workspace">
    <section className="card geographic-panel" aria-labelledby="map-title">
      <div className="panel-heading"><div><p className="section-kicker">{t("Deset izbornih jedinica", "Zehn Wahlkreise")}</p><h2 id="map-title">{t("Tko vodi gdje", "Wer führt wo")}</h2></div><button type="button" className="text-button" disabled={!zoomed} onClick={()=>setZoomed(false)}>{t("Cijela karta", "Ganze Karte")}</button></div>
      <div className="district-tabs" aria-label={t("Odaberite izbornu jedinicu", "Wahlkreis auswählen")}>{DISTRICTS.map(d=><button type="button" key={d} className={d===selected?"active":""} aria-pressed={d===selected} onClick={()=>select(d)}>{d}</button>)}</div>
      <div className={`map-viewport ${zoomed?"zoomed":""}`}>
        <svg className="constituency-map" viewBox={DISTRICT_MAP_VIEWBOX} role="group" aria-label={t("Hrvatske izborne jedinice nakon 2023.", "Kroatische Wahlkreise nach 2023")}>
          <defs>{DISTRICTS.map(d=><linearGradient key={d} id={`map-fill-${d}`} x1="0" y1="0" x2="1" y2="1">{colorsOf(results[d].winner[0]).flatMap((color,i,colors)=>[<stop key={`${i}-start`} offset={`${i/colors.length*100}%`} stopColor={color}/>,<stop key={`${i}-end`} offset={`${(i+1)/colors.length*100}%`} stopColor={color}/>])}</linearGradient>)}</defs>
          <g className="map-zoom-layer" style={{transform:zoomed?zoom.transform:"translate(0px, 0px) scale(0.94) translate(32px, 30px)", "--map-label-size": `${zoomed?42/zoom.scale:42}px`} as CSSProperties}>
            {DISTRICTS.map(d=><g key={d} role="button" tabIndex={0} className={`district-shape ${d===selected?"selected":""}`} aria-pressed={d===selected} aria-label={t(`Izborna jedinica ${d}: vodi ${otherLabel(formatList(results[d].winner[0]), language)} s ${formatNumber(results[d].winner[1], language, 1)} posto`, `Wahlkreis ${d}: ${otherLabel(formatList(results[d].winner[0]), language)} führt mit ${formatNumber(results[d].winner[1], language, 1)} Prozent`, `District ${d}: ${otherLabel(formatList(results[d].winner[0]), language)} leads with ${formatNumber(results[d].winner[1], language, 1)} percent`)} onClick={()=>select(d)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select(d)}}}>
              <title>{`${t("Izborna jedinica", "Wahlkreis")} ${d} · ${otherLabel(formatList(results[d].winner[0]), language)} ${formatNumber(results[d].winner[1], language, 1)}%`}</title>
              <path d={DISTRICT_GEOMETRY[d].path} fill={`url(#map-fill-${d})`}/><text x={DISTRICT_GEOMETRY[d].label[0]} y={DISTRICT_GEOMETRY[d].label[1]}>{d}</text>
            </g>)}
          </g>
        </svg>
      </div>
      <div className="map-caption"><strong>{t("Izborna jedinica", "Wahlkreis")} {selected}</strong><span><i className="swatch" style={{background:swatchBackground(result.winner[0])}}/>{otherLabel(formatList(result.winner[0]), language)} · {formatNumber(result.winner[1], language, 1)}%</span></div>
      <p className="panel-footnote">{t("Boja označava vodeću listu. Odaberite područje ili broj jedinice za detalje.", "Die Farbe zeigt die führende Liste. Wählen Sie eine Fläche oder Wahlkreisnummer für Details.")}</p>
    </section>

    <section className="card allocation-panel" aria-labelledby="allocation-title">
      <div className="panel-heading"><div><p className="section-kicker">{t("Mandati i većina", "Sitze und Mehrheit")}</p><h2 id="allocation-title">{t("Saborska aritmetika", "Parlamentsarithmetik")}</h2></div><span className="majority-badge">{t("76 za većinu", "76 zur Mehrheit")}</span></div>
      <div className="compact-metrics"><div><span>{coreLabel}</span><strong>{coreLeft}</strong></div><div><span>{t("Šira ljevica + manjine", "Breites linkes Lager + Minderheiten")}</span><strong>{broadLeft}<small>/76</small></strong></div></div>
      <div className="seat-stack" aria-label={t("Nacionalna raspodjela mandata", "Landesweite Sitzverteilung")}>{tally.map(([name,seats])=><span key={name} title={`${otherLabel(formatList(name), language)}: ${seats} ${t("mandata", "Sitze")}`} style={{width:`${seats/151*100}%`,background:swatchBackground(name)}}/>)}<span className="minority-segment" style={{width:`${8/151*100}%`}} title={t("8 manjinskih mandata", "8 Minderheitensitze")}/>{scenario.diasporaHdz<3&&<span className="unassigned-segment" style={{width:`${(3-scenario.diasporaHdz)/151*100}%`}} title={t("Neraspoređeni mandati dijaspore", "Nicht zugewiesene Diaspora-Sitze")}/>}<i style={{left:`${76/151*100}%`}}/></div>
      <div className="panel-tabs" role="group" aria-label={t("Prikaz raspodjele mandata", "Ansicht der Sitzverteilung")}><button type="button" className={seatView==="district"?"active":""} aria-pressed={seatView==="district"} onClick={()=>setSeatView("district")}>{t("Jedinica", "Wahlkreis")} {selected}</button><button type="button" className={seatView==="national"?"active":""} aria-pressed={seatView==="national"} onClick={()=>setSeatView("national")}>{t("Svih 151 mandat", "Alle 151 Sitze")}</button></div>
      <div className="panel-scroll">
        {seatView==="district"?<>
          <div className="wheel-summary"><div className="allocation-wheel" key={selected} style={{background:wheelGradient(result.sorted,100)}} role="img" aria-label={t(`Izborna jedinica ${selected}: vanjski prsten prikazuje glasove, unutarnji mandate. Točne vrijednosti su ispod.`, `Wahlkreis ${selected}: Der äußere Ring zeigt Stimmen, der innere Sitze. Genaue Werte stehen darunter.`, `District ${selected}: outer ring shows votes, inner ring shows seats. Exact values are below.`)}><div className="seat-wheel" style={{background:wheelGradient(selectedTally,selectedSeats.length)}}><div><strong>{selectedSeats.length}</strong><span>{t("mandata", "Sitze")}</span></div></div></div><div><h3>{t("Izborna jedinica", "Wahlkreis")} {selected}</h3><p>{t("Vanjski prsten: glasovi", "Außenring: Stimmen")}<br/>{t("Unutarnji prsten: mandati", "Innenring: Sitze")}</p><span className="status-badge">{manual?t("Ručni mandati", "Manuelle Sitze"):t("Automatski d’Hondt", "Automatisch nach d’Hondt")}</span></div></div>
          <div className="allocation-table"><div className="allocation-table-head"><span>{t("Lista", "Liste")}</span><span>{t("Glasovi", "Stimmen")}</span><span>{t("Mandati", "Sitze")}</span></div>{result.sorted.filter(([,share])=>share>=0.5).map(([name,share])=><div className="allocation-row" key={name}><div className="party-name"><PartyPortraits name={name}/><i className="swatch" style={{background:swatchBackground(name)}}/><span>{otherLabel(formatList(name), language)}</span></div><span>{formatNumber(share, language, 1)}%</span><strong>{selectedTally.find(([list])=>list===name)?.[1]??0}</strong></div>)}</div>
          {result.lostVoteShare>0&&<p className="loss-impact">{formatNumber(result.lostVoteShare, language, 2)}% {t("izvornih glasova u jedinici apstinira zbog koalicijskih gubitaka.", "der ursprünglichen Wahlkreisstimmen enthalten sich wegen Koalitionsverlusten.")}</p>}
          <details className="manual-editor"><summary>{t("Dodijeli pojedinačne mandate", "Einzelne Sitze zuweisen")} {manual&&t("· ručna promjena aktivna", "· manuelle Änderung aktiv")}</summary><label>{t("Primatelj", "Empfänger")}<select value={manualTarget} onChange={event=>onTarget(event.target.value)}>{result.sorted.map(([name])=><option key={name} value={name}>{otherLabel(formatList(name), language)}</option>)}</select></label><div className="seat-grid">{selectedSeats.map((name,i)=><button type="button" key={i} style={{background:swatchBackground(name)}} aria-label={t(`Mandat ${i+1}, ${formatList(name)}. Dodijeli listi ${formatList(manualTarget)}`, `Sitz ${i+1}, ${formatList(name)}. ${formatList(manualTarget)} zuweisen`, `Seat ${i+1}, ${formatList(name)}. Assign to ${formatList(manualTarget)}`)} title={otherLabel(formatList(name), language)} onClick={()=>onReassign(i)}>{i+1}</button>)}</div><button type="button" className="secondary-button" disabled={!manual} onClick={onResetDistrict}>{t("Vrati automatske mandate", "Automatische Sitze wiederherstellen")}</button></details>
        </>:<>
          <div className="allocation-table"><div className="allocation-table-head national"><span>{t("Lista / koalicija", "Liste / Koalition")}</span><span>{t("Mandati", "Sitze")}</span></div>{tally.map(([name,seats])=><div className="allocation-row national" key={name}><div className="party-name"><PartyPortraits name={name}/><i className="swatch" style={{background:swatchBackground(name)}}/><span>{otherLabel(formatList(name), language)}</span></div><strong>{seats}</strong></div>)}<div className="allocation-row national"><span>{t("Manjinski zastupnici", "Minderheitenvertreter")}</span><strong>8</strong></div>{scenario.diasporaHdz<3&&<div className="allocation-row national"><span>{t("Neraspoređena dijaspora", "Nicht zugewiesene Diaspora")}</span><strong>{3-scenario.diasporaHdz}</strong></div>}</div>
          <p className="panel-footnote">{t("140 mandata u jedinicama + 3 iz dijaspore + 8 manjinskih. Ukupni rezultat stranaka uključuje odabranu pretpostavku za HDZ u dijaspori.", "140 Wahlkreissitze + 3 Diaspora-Sitze + 8 Minderheitensitze. Die Parteisummen enthalten die gewählte HDZ-Annahme für die Diaspora.")}</p><p className="majority-message">{broadLeft>=76?t(`${broadLeft-76} mandata iznad većine na širem lijevom putu.`, `${broadLeft-76} Sitze über der Mehrheit auf dem breiten linken Mehrheitsweg.`, `${broadLeft-76} seats above a majority on the broad left path.`):t(`${76-broadLeft} mandata nedostaje do većine na širem lijevom putu.`, `${76-broadLeft} Sitze fehlen zur Mehrheit auf dem breiten linken Mehrheitsweg.`, `${76-broadLeft} seats short of a majority on the broad left path.`)}</p>
        </>}
      </div>
    </section>

    <section className="card coalition-panel" aria-labelledby="coalition-title">
      <div className="panel-heading"><div><p className="section-kicker">{t("Aktivni scenarij", "Aktives Szenario")}</p><h2 id="coalition-title">{t("Sastavite koalicije", "Koalitionen bilden")}</h2></div><span className="status-badge">{scenario.mode==="user"?t("Prilagođeno", "Benutzerdefiniert"):scenario.mode==="polls"?t("Odvojeno", "Getrennt"):t("Zadano", "Vorgabe")}</span></div>
      <p className="panel-description">{t("Odaberite partnere; mandati se ažuriraju u svih deset jedinica.", "Wählen Sie Partner; die Sitze werden in allen zehn Wahlkreisen aktualisiert.")}</p>
      <div className="panel-scroll coalition-scroll">
        {COALITION_OPTIONS.map(group=><fieldset className="coalition-group" key={group.key}><legend><i className="swatch" style={{background:colorOf(group.leader)}}/>{group.key==="left"?t("Predvodi SDP", "Von SDP geführt"):group.key==="hdz"?t("Predvodi HDZ", "Von HDZ geführt"):t("Predvodi DP", "Von DP geführt")}</legend><div className="coalition-chips">{group.parties.map(party=><label className={groups[group.key].includes(party)?"checked":""} key={party}><input type="checkbox" checked={groups[group.key].includes(party)} onChange={()=>onToggleCoalition(group.key,party)}/><span>{otherLabel(formatList(party), language)}</span></label>)}</div>
          {groups[group.key].length>0&&!(scenario.mode==="user"&&scenario.mergeHdzRight&&group.key!=="left")&&<><LossControl members={[group.leader,...groups[group.key]]} scenario={scenario} language={language} onLoss={onLoss}/>{lossSummary(group.key)}</>}
        </fieldset>)}
        <label className="merge-toggle"><input type="checkbox" checked={scenario.mode==="user"&&scenario.mergeHdzRight} onChange={event=>onMergeRight(event.target.checked)}/><span>{t("Spoji liste predvođene HDZ-om i DP-om", "HDZ- und DP-geführte Listen zusammenführen")}</span></label>
        {scenario.mode==="user"&&scenario.mergeHdzRight&&<div className="coalition-group"><h3>{t("Ujedinjena desna koalicija", "Gemeinsame rechte Koalition")}</h3><LossControl members={activeCoalitionLists(scenario)[1].members} scenario={scenario} language={language} onLoss={onLoss}/>{lossSummary("hdzRight")}</div>}
        <details className="synergy-explainer"><summary>{t("Kako radi negativna sinergija", "So funktioniert negative Synergie")}</summary><p>{t("Gubitak od 10% zadržava 90 od svakih 100 birača stranke članice. Izgubljeni birači apstiniraju. Preostali valjani glasovi normaliziraju se na 100% prije praga od 5% i d’Hondtove raspodjele. Zadana vrijednost je nula; gubici su pretpostavke scenarija, a ne izmjereni rezultati anketa.", "Ein Verlust von 10% bindet 90 von 100 Wählern einer Mitgliedspartei. Verlorene Wähler enthalten sich. Die verbleibenden gültigen Stimmen werden vor der 5-%-Hürde und der d’Hondt-Verteilung auf 100% normiert. Der Standardwert ist null; diese Verluste sind Szenarioannahmen und keine gemessenen Umfragewerte.")}</p></details>
      </div>
      {coalitionLists.length===0&&<p className="panel-footnote">{t("Dodajte partnera kako bi se prikazala postavka gubitka birača koalicije.", "Fügen Sie einen Partner hinzu, um den Regler für den Wählerverlust der Koalition anzuzeigen.")}</p>}
    </section>
  </div>;
}
