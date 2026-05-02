// Magyar közérdekű kategória-kulcsszavak — ékezetes és ékezet nélküli változatok
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  municipality: [
    'önkormányzat', 'onkormanyzat', 'polgármester', 'polgarmester',
    'képviselőtestület', 'kepviselotestület', 'képviselő-testület',
    'közgyűlés', 'kozgyules', 'rendelet', 'határozat', 'hatarozat',
    'alpolgármester', 'hivatal', 'városháza', 'varoshaza',
    'közmeghallgatás', 'kozmeghallgatas', 'testületi ülés',
    'helyi rendelet', 'önkormányzati rendelet', 'polgármesteri hivatal',
  ],
  police: [
    'rendőrség', 'rendorseg', 'rendőrkapitányság', 'rendorkapitanysag',
    'bűncselekmény', 'buncselekmeny', 'baleset', 'körözés', 'korozes',
    'nyomozás', 'nyomozas', 'rendőr', 'rendor', 'zsaru',
    'elfogtak', 'letartóztatás', 'letartozatas', 'előállítás',
    'garázdaság', 'lopás', 'rablás', 'betörés', 'csempészet',
    'közúti ellenőrzés', 'sebességmérés', 'ittas vezető',
  ],
  healthcare: [
    'kórház', 'korhaz', 'rendelő', 'rendelo', 'egészségügyi', 'egeszségügyi',
    'orvos', 'szakrendelés', 'szakrendeles', 'egészség', 'egeszség',
    'mentő', 'mento', 'gyógyszer', 'gyogyszer', 'klinika',
    'poliklinika', 'ügyeleti rendelés', 'rendelési idő', 'járóbeteg',
    'fekvőbeteg', 'védőoltás', 'vedooltas', 'szűrővizsgálat',
    'egészségügyi ellátás', 'egészségügyi szolgálat',
  ],
  utility: [
    'közmű', 'kozmu', 'vízmű', 'vizmu', 'gázszolgáltató', 'gaszolgaltato',
    'áramszolgáltató', 'aramszolgaltato', 'hulladék', 'hulladek',
    'közszolgáltató', 'kozszolgaltato', 'vízszolgáltatás', 'vizszolgaltatas',
    'vízdíj', 'vizdij', 'szemétszállítás', 'szemetszallitas',
    'szennyvíz', 'szennyviz', 'csatornadíj', 'csatornadij',
    'fogyasztó értesítés', 'vízmű értesítés', 'megszakítás', 'üzemzavar',
    'közvilágítás', 'kozvilagitas', 'áramszünet', 'aramszunet',
  ],
  gazette_legal: [
    'közlöny', 'kozlony', 'jogszabály', 'jogszabaly', 'hirdetmény', 'hirdetmeny',
    'pályázati felhívás', 'palyazati felhivas', 'közbeszerzés', 'kozbeszerzés',
    'nyilvános pályázat', 'közérdekű adat', 'határozat száma',
    'rendelet száma', 'kihirdetés napja',
  ],
  eu_funding: [
    'eu pályázat', 'európai unió', 'europai unio', 'pályázat', 'palyazat',
    'efop', 'ginop', 'top', 'kehop', 'ikop', 'rop',
    'kohéziós alap', 'koheziós alap', 'strukturális alap', 'strukturalis alap',
    'fejlesztési forrás', 'uniós forrás', 'unios forras',
    'nyertes pályázat', 'pályázati eredmény', 'projekt megvalósítás',
  ],
  transport: [
    'közlekedés', 'kozlekedes', 'forgalom', 'útzár', 'utzar',
    'felújítás', 'felujitas', 'útépítés', 'utepites',
    'busz', 'autóbusz', 'autobusz', 'vasút', 'vasut', 'menetrend',
    'közút', 'kozut', 'útlezárás', 'utlezaras', 'forgalomterelés',
    'kerékpárút', 'kerekparut', 'járda', 'gyalogátkelő',
    'bkk', 'mav', 'mavinform', 'volán', 'volan',
    'parkolás', 'parkolas', 'parkolási rend',
  ],
  disaster_management: [
    'katasztrófavédelem', 'katasztrofavedelem', 'tűzoltó', 'tuzolto',
    'veszélyhelyzet', 'veszelyhelyzet', 'árvíz', 'arviz', 'tűz', 'tuz',
    'mentés', 'mentes', 'riasztás', 'riasztas', 'beavatkozás',
    'kiürítés', 'kuurites', 'evakuálás', 'evakualas',
    'polgári védelmi', 'polgari vedelmi', 'védelmi bizottság',
  ],
  education_public: [
    'iskola', 'óvoda', 'ovoda', 'oktatás', 'oktatas', 'nevelési', 'nevelesi',
    'tanév', 'tanev', 'beiratkozás', 'beiratkozas', 'pedagógus', 'pedagogus',
    'szülői', 'szuloi', 'diák', 'diak', 'tanulói', 'tanuloi',
    'iskolai étkezés', 'menza', 'szünidő', 'szunido',
    'alapfokú oktatás', 'középiskola', 'kozepiskola',
    'bölcsőde', 'bolcsode', 'gyermekfelügyelet',
  ],
  local_news: [
    'helyi', 'városi', 'varosi', 'falusi', 'közösségi', 'kozossegi',
    'rendezvény', 'rendezvenye', 'fesztivál', 'fesztival', 'kulturális',
    'kulturalis', 'kiállítás', 'kiallitas', 'koncert', 'közösségi ház',
    'művelődési ház', 'muvelodesi haz',
  ],
};

export type CategoryKey = keyof typeof CATEGORY_KEYWORDS;

// Returns categories that match the given text (lowercased)
export function detectCategories(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matched.push(cat);
    }
  }
  return matched;
}

// Returns a relevance score 0–1 based on how many category keywords matched
export function scoreRelevance(text: string): number {
  const lower = text.toLowerCase();
  let hits = 0;
  let checks = 0;
  for (const keywords of Object.values(CATEGORY_KEYWORDS)) {
    checks += keywords.length;
    hits += keywords.filter((kw) => lower.includes(kw)).length;
  }
  if (checks === 0) return 0;
  // Scale: 0 hits = 0, 1+ hits scale up to 1.0
  return Math.min(1.0, hits / 3);
}

// True if the text has any public-interest relevance
export function isRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  for (const keywords of Object.values(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return true;
  }
  return false;
}
