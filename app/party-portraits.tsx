import metadata from "./leader-portraits.json";
import { formatList, listParts } from "./model";
import { translate, type Language } from "./i18n";

type Leader = { name: string; wikipediaUrl: string | null; leadershipSources: string[]; image: string | null; commonsUrl: string | null; author: string | null; license: string | null; licenseUrl: string | null; attribution: string | null };
const leaders = metadata.leaders as Record<string, Leader[]>;
const imageSource = (source: string) => source.replace(/^\//, "");

export function PartyPortraits({ name }: { name: string }) {
  const portraits = listParts(name).flatMap(party => leaders[party] ?? []).filter(leader=>leader.image);
  if (!portraits.length) return null;
  return <span className="portrait-stack" title={portraits.map(leader=>leader.name).join(" · ")}>{portraits.map(leader=><img key={leader.name} src={imageSource(leader.image!)} alt={leader.name} width="28" height="28" loading="lazy" decoding="async"/>)}</span>;
}

export function PortraitCredits({ language }: { language: Language }) {
  const t = (hr: string, de: string, en?: string) => translate(language, hr, de, en);
  return <details className="card portrait-credits" id="portrait-credits">
    <summary>{t("Čelnici stranaka i izvori portreta", "Parteivorsitzende und Bildnachweise")}</summary>
    <p className="panel-footnote">{t("Vodstvo stranaka provjereno je 10. rujna 2026. Portreti s Wikipedije / Wikimedije Commons obrezani su radi prikaza u sučelju. Datumi fotografija razlikuju se; slike prikazuju čelnike, a ne kandidate u pojedinim jedinicama.", "Die Parteiführungen wurden am 10. September 2026 geprüft. Porträts aus Wikipedia / Wikimedia Commons sind für die Oberfläche zugeschnitten. Die Aufnahmedaten unterscheiden sich; die Bilder zeigen Parteivorsitzende, nicht Kandidaten einzelner Wahlkreise.")}</p>
    <div className="portrait-credit-grid">{Object.entries(leaders).flatMap(([party,partyLeaders])=>partyLeaders.map(leader=><article className="portrait-credit" key={leader.name}>
      {leader.image&&<img src={imageSource(leader.image)} alt={leader.name} width="50" height="60" loading="lazy"/>}
      <div><strong>{formatList(party)} · {leader.name}</strong><a href={leader.wikipediaUrl??leader.leadershipSources[0]} target="_blank" rel="noreferrer">{t("Profil čelnika ↗", "Profil ↗")}</a>{leader.image?<><p>{leader.attribution}</p><a href={leader.commonsUrl!} target="_blank" rel="noreferrer">{t("Izvornik i autorstvo", "Original und Bildnachweis")}</a>{" · "}<a href={leader.licenseUrl!} target="_blank" rel="noreferrer">{leader.license}</a></>:<p>{t("Nije pronađen upotrebljiv portret na Wikipediji / Commonsu.", "Kein verwendbares Porträt bei Wikipedia / Commons gefunden.")}</p>}</div>
    </article>))}</div>
  </details>;
}
